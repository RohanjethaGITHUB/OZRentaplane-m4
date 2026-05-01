"use server";

import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PAYMENT_CONFIG } from "@/lib/payments/config";

export async function createCheckoutPaymentSession(bookingId: string) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2023-10-16" as any,
  });
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized");

  // ── Step 1: Find the checkout invoice for this booking ────────────────────
  const { data: invoice, error: invoiceErr } = await supabase
    .from("checkout_invoices")
    .select("id, status, booking_id, customer_id")
    .eq("booking_id", bookingId)
    .eq("customer_id", user.id)
    .eq("invoice_type", "checkout")
    .single();

  if (invoiceErr || !invoice) {
    throw new Error("Checkout invoice not found.");
  }

  // ── Step 2: Call the authoritative payment-preparation RPC ─────────────────
  // This locks the invoice + credit balance, applies any newly available
  // credit, and returns the final amount to charge via Stripe.
  // If the full amount is covered by credit, the RPC settles the invoice
  // immediately (no Stripe session needed) and returns settled_by_credit=true.
  //
  // IMPORTANT: Do NOT use invoice.stripe_amount_due_cents — it is stale.
  // The RPC is the single source of truth for the charge amount.
  const { data: prepRows, error: prepErr } = await supabase.rpc(
    "prepare_checkout_payment_atomic",
    {
      p_invoice_id:  invoice.id,
      p_customer_id: user.id,
      p_fee_rate_bps: PAYMENT_CONFIG.STRIPE_DOMESTIC_FEE_BPS,
      p_fee_fixed_cents: PAYMENT_CONFIG.STRIPE_FIXED_FEE_CENTS,
      p_apply_surcharge: PAYMENT_CONFIG.ENABLE_SURCHARGE,
    }
  );

  if (prepErr || !prepRows?.[0]) {
    console.error("[createCheckoutPaymentSession] prepare RPC failed", {
      message: prepErr?.message,
      code:    prepErr?.code,
      details: prepErr?.details,
      hint:    prepErr?.hint,
    });
    throw new Error(
      prepErr?.message ?? "Failed to prepare payment. Please try again."
    );
  }

  const { out_final_amount_cents, out_settled_by_credit } = prepRows[0] as {
    out_final_amount_cents: number;
    out_invoice_status:     string;
    out_settled_by_credit:  boolean;
  };

  // ── Step 3: Credit-settled path — no Stripe needed ────────────────────────
  // The RPC has already marked the invoice paid, completed the booking,
  // and promoted pilot_clearance_status. Revalidate and redirect to success.
  if (out_settled_by_credit) {
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/bookings/${bookingId}`);
    redirect(`/dashboard/bookings/${bookingId}?payment=settled_by_credit`);
  }

  // ── Step 4: Stripe payment path ───────────────────────────────────────────
  if (out_final_amount_cents <= 0) {
    // Should not happen (RPC handles this), but guard defensively
    throw new Error("Amount due is zero — no payment needed.");
  }

  const appUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "aud",
          product_data: {
            name: "OZRentAPlane Checkout Flight",
          },
          unit_amount: out_final_amount_cents,  // authoritative amount from RPC
        },
        quantity: 1,
      },
    ],
    metadata: {
      invoice_id:   invoice.id,
      booking_id:   bookingId,
      customer_id:  user.id,
      invoice_type: "checkout",
    },
    success_url: `${appUrl}/dashboard/bookings/${bookingId}?payment=success`,
    cancel_url:  `${appUrl}/dashboard/bookings/${bookingId}?payment=cancelled`,
  });

  // Store the session ID on the invoice for webhook correlation
  await supabase
    .from("checkout_invoices")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", invoice.id);

  if (!session.url) {
    throw new Error("Failed to create Stripe session URL.");
  }

  redirect(session.url);
}

export async function submitBankTransferProof(
  invoiceId: string,
  bookingId: string,
  reference: string,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized");

  const file = formData.get("receipt") as File;
  if (!file) throw new Error("No receipt file provided.");

  // Validate file type
  const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!validTypes.includes(file.type)) {
    throw new Error("Invalid file type. Please upload a JPEG, PNG, WebP, or PDF.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File is too large. Maximum size is 5MB.");
  }

  // Generate unique file path
  const fileExt = file.name.split(".").pop();
  const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from("bank_transfer_receipts")
    .upload(filePath, file, { upsert: false });

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    throw new Error("Failed to upload receipt. Please try again.");
  }

  // Create submission record
  const { error: dbError } = await supabase
    .from("checkout_bank_transfer_submissions")
    .insert({
      invoice_id: invoiceId,
      booking_id: bookingId,
      customer_id: user.id,
      reference,
      receipt_storage_path: filePath,
      status: "pending_review",
    });

  if (dbError) {
    console.error("DB insert error:", dbError);
    // Cleanup the uploaded file if DB insert fails
    await supabase.storage.from("bank_transfer_receipts").remove([filePath]);
    throw new Error("Failed to submit proof. Please try again.");
  }

  // Also update invoice payment method to bank_transfer so it doesn't default to stripe
  await supabase
    .from("checkout_invoices")
    .update({ payment_method: "bank_transfer" })
    .eq("id", invoiceId);

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return { success: true };
}

export async function adminApproveBankTransfer(submissionId: string, bookingId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized");

  const { error } = await supabase.rpc("approve_bank_transfer_atomic", {
    p_submission_id: submissionId,
  });

  if (error) {
    console.error("Failed to approve bank transfer:", error);
    throw new Error(error.message || "Failed to approve bank transfer.");
  }

  // Notify customer — mirror the same outcome-aware copy as the Stripe webhook
  try {
    const { data: sub } = await supabase
      .from("checkout_bank_transfer_submissions")
      .select("customer_id, invoice_id")
      .eq("id", submissionId)
      .single();

    if (sub) {
      const { data: inv } = await supabase
        .from("checkout_invoices")
        .select("checkout_outcome")
        .eq("id", sub.invoice_id)
        .single();

      const outcome = inv?.checkout_outcome as string | null;
      let notifTitle = "Bank transfer payment confirmed";
      let notifBody  = "Your bank transfer has been approved and your invoice is now paid.";

      if (outcome === "cleared_to_fly") {
        notifTitle = "Bank transfer confirmed — you're cleared to fly";
        notifBody  = "Your bank transfer has been approved. Aircraft bookings are now available.";
      } else if (outcome === "additional_checkout_required") {
        notifTitle = "Bank transfer confirmed — additional checkout required";
        notifBody  = "Your bank transfer has been approved. An additional checkout session is required before you can be cleared to fly.";
      } else if (outcome === "checkout_reschedule_required") {
        notifTitle = "Bank transfer confirmed — reschedule required";
        notifBody  = "Your bank transfer has been approved. You can now book another checkout session when you are ready.";
      } else if (outcome === "not_currently_eligible") {
        notifTitle = "Bank transfer confirmed";
        notifBody  = "Your bank transfer has been approved. Based on your assessment, further training with a qualified instructor is required before you can continue with aircraft hire.";
      }

      await supabase.from("verification_events").insert({
        user_id:      sub.customer_id,
        actor_role:   "admin",
        event_type:   "approved",
        title:        notifTitle,
        body:         notifBody,
        is_read:      false,
        email_status: "pending",
      });
    }
  } catch (notifErr: any) {
    console.warn("Failed to send approval notification (non-fatal):", notifErr?.message);
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/requests/${bookingId}`);
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return { success: true };
}

export async function adminRejectBankTransfer(submissionId: string, bookingId: string, adminNote: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized");

  if (!adminNote?.trim()) {
    throw new Error("Rejection note is required.");
  }

  const { error } = await supabase.rpc("reject_bank_transfer_atomic", {
    p_submission_id: submissionId,
    p_admin_note: adminNote,
  });

  if (error) {
    console.error("Failed to reject bank transfer:", error);
    throw new Error(error.message || "Failed to reject bank transfer.");
  }

  // Notify customer? The prompt says "Notify the customer to upload a better receipt or contact admin."
  // We can just add a verification_event for this.
  const { data: sub } = await supabase
    .from("checkout_bank_transfer_submissions")
    .select("customer_id")
    .eq("id", submissionId)
    .single();

  if (sub) {
    await supabase.from("verification_events").insert({
      user_id: sub.customer_id,
      actor_role: "admin",
      event_type: "document_rejected",
      title: "Bank Transfer Proof Rejected",
      body: `Your bank transfer payment proof was rejected. Note: ${adminNote}. Please upload a new receipt or contact support.`,
      is_read: false,
      email_status: "pending"
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/requests/${bookingId}`);
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return { success: true };
}
