"use server";

import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PAYMENT_CONFIG } from "@/lib/payments/config";
import {
  notifyAdminBankTransferProofUploaded,
  notifyBankTransferProofReceived,
} from "@/lib/booking/notifications";
import { sendEmail } from "@/lib/email/send-email";
import { paymentConfirmedEmail } from "@/lib/email/templates/payment";

type ManualPaymentMethod = "cash" | "card_in_person" | "bank_transfer";

type RecordManualPaymentInput = {
  bookingId: string;
  paymentMethod: ManualPaymentMethod;
  amountCents: number;
  note?: string;
};

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

export async function createBlockTimePurchaseIntent(packageId: string) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    throw new Error("Server misconfiguration");
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: "2023-10-16" as any,
  });

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) throw new Error("Unauthorized");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, stripe_customer_id, default_payment_method_id")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    throw new Error("Profile not found.");
  }

  const { data: pkg, error: pkgErr } = await supabase
    .from("block_time_packages")
    .select("id, name, hours, rate_per_hour, validity_days, total_price, is_active")
    .eq("id", packageId)
    .eq("is_active", true)
    .single();

  if (pkgErr || !pkg) {
    throw new Error("Selected package is not available.");
  }

  let stripeCustomerId = profile.stripe_customer_id ?? null;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: profile.email ?? undefined,
      name: profile.full_name ?? undefined,
      metadata: {
        supabase_user_id: user.id,
      },
    });

    stripeCustomerId = customer.id;

    const { error: updateCustomerErr } = await supabase
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", user.id);

    if (updateCustomerErr) {
      throw new Error(updateCustomerErr.message || "Failed to save Stripe customer.");
    }
  }

  const amountCents = Math.round(Number(pkg.total_price) * 100);
  const placeholderExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  type ExistingActivePurchase = {
    id: string
    package_id: string
    purchased_at: string
    status: 'active'
  }
  type ExistingPendingPurchase = {
    id: string
    package_id: string
    purchased_at: string
    status: 'pending'
  }

  const { data: existingActivePurchaseRaw, error: existingActiveErr } = await supabase
    .from("pilot_block_time_purchases")
    .select("id, package_id, purchased_at, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingActivePurchase = existingActivePurchaseRaw as ExistingActivePurchase | null;

  if (existingActiveErr) {
    throw new Error(existingActiveErr.message || "Failed to check for existing block time purchases.");
  }

  if (existingActivePurchase) {
    throw new Error("You already have an active block time package. Top up your existing package instead of buying a new one.");
  }

  const { data: existingPendingPurchaseRaw, error: existingPendingErr } = await supabase
    .from("pilot_block_time_purchases")
    .select("id, package_id, purchased_at, status")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingPendingPurchase = existingPendingPurchaseRaw as ExistingPendingPurchase | null;

  if (existingPendingErr) {
    throw new Error(existingPendingErr.message || "Failed to check for existing block time purchases.");
  }

  if (existingPendingPurchase) {
    throw new Error("You already have a pending block time purchase. Please complete or cancel it before starting another.");
  }

  const { data: purchase, error: purchaseErr } = await supabase
    .from("pilot_block_time_purchases")
    .insert({
      user_id: user.id,
      package_id: pkg.id,
      hours_purchased: pkg.hours,
      hours_remaining: pkg.hours,
      rate_per_hour: pkg.rate_per_hour,
      amount_paid: pkg.total_price,
      status: "pending",
      purchased_at: new Date().toISOString(),
      expires_at: placeholderExpiry,
    })
    .select("id")
    .single();

  if (purchaseErr || !purchase) {
    throw new Error(purchaseErr?.message ?? "Failed to reserve the purchase.");
  }

  const appUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer: stripeCustomerId,
    line_items: [
      {
        price_data: {
          currency: "aud",
          product_data: {
            name: `OZ Rent A Plane - ${pkg.name} Block Time`,
            description: `${pkg.hours} hours at ${Number(pkg.rate_per_hour).toFixed(0)}/hr`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/dashboard?block_time_purchase=success`,
    cancel_url: `${appUrl}/dashboard?block_time_package=${encodeURIComponent(pkg.name.toLowerCase().replace(/\s+/g, "-"))}&block_time_purchase=cancelled`,
    metadata: {
      purchase_type: "block_time",
      supabase_user_id: user.id,
      purchase_id: purchase.id,
      package_id: pkg.id,
      package_name: pkg.name,
      hours_purchased: String(pkg.hours),
      rate_per_hour: String(pkg.rate_per_hour),
      validity_days: String(pkg.validity_days),
    },
    payment_intent_data: ({
      setup_future_usage: "off_session",
      metadata: {
        purchase_type: "block_time",
        supabase_user_id: user.id,
        purchase_id: purchase.id,
        package_id: pkg.id,
        package_name: pkg.name,
        hours_purchased: String(pkg.hours),
        rate_per_hour: String(pkg.rate_per_hour),
        validity_days: String(pkg.validity_days),
      },
      description: `OZ Rent A Plane - ${pkg.name} (${pkg.hours}h Block Time)`,
    } as any),
  });

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : (session.payment_intent as { id?: string } | null)?.id ?? null;

  const { error: updatePurchaseErr } = await supabase
    .from("pilot_block_time_purchases")
    .update({
      stripe_payment_intent_id: paymentIntentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", purchase.id);

  if (updatePurchaseErr) {
    throw new Error(updatePurchaseErr.message || "Failed to link the payment intent.");
  }

  if (!session.url) {
    throw new Error("Failed to create Stripe checkout session.");
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();
  if (profile?.email) {
    await notifyBankTransferProofReceived({ customerEmail: profile.email, bookingId }).catch((error) =>
      console.error("[submitBankTransferProof] customer email failed:", error),
    );
    await notifyAdminBankTransferProofUploaded({
      bookingId,
      customerName: profile.full_name ?? "Pilot",
      customerEmail: profile.email,
      amount: "Pending review",
      invoiceType: "checkout",
    }).catch((error) => console.error("[submitBankTransferProof] admin email failed:", error));
  }

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

      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", sub.customer_id)
        .single();
      if (profile?.email) {
        const template = paymentConfirmedEmail(notifBody);
        await sendEmail({
          to: profile.email,
          subject: template.subject,
          html: template.html,
          eventType: "payment_confirmed",
          entityType: "checkout",
          entityId: bookingId,
          metadata: { outcome: outcome ?? null },
        }).catch((error) => console.error("[adminApproveBankTransfer] email failed:", error));
      }
    }
  } catch (notifErr: any) {
    console.warn("Failed to send approval notification (non-fatal):", notifErr?.message);
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/requests/${bookingId}`);
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return { success: true };
}

// ─── Standard booking Stripe payment ──────────────────────────────────────────

export async function createBookingPaymentSession(bookingId: string) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2023-10-16" as any,
  });
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized");

  const { data: invoice, error: invoiceErr } = await supabase
    .from("booking_invoices")
    .select("id, status, booking_id, customer_id")
    .eq("booking_id", bookingId)
    .eq("customer_id", user.id)
    .single();

  if (invoiceErr || !invoice) throw new Error("Booking invoice not found.");

  const { data: prepRows, error: prepErr } = await supabase.rpc(
    "prepare_booking_payment_atomic",
    {
      p_invoice_id:      invoice.id,
      p_customer_id:     user.id,
      p_fee_rate_bps:    PAYMENT_CONFIG.STRIPE_DOMESTIC_FEE_BPS,
      p_fee_fixed_cents: PAYMENT_CONFIG.STRIPE_FIXED_FEE_CENTS,
      p_apply_surcharge: PAYMENT_CONFIG.ENABLE_SURCHARGE,
    }
  );

  if (prepErr || !prepRows?.[0]) {
    console.error("[createBookingPaymentSession] prepare RPC failed", prepErr);
    throw new Error(prepErr?.message ?? "Failed to prepare payment. Please try again.");
  }

  const { out_final_amount_cents, out_settled_by_credit } = prepRows[0] as {
    out_final_amount_cents: number;
    out_invoice_status:     string;
    out_settled_by_credit:  boolean;
  };

  if (out_settled_by_credit) {
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/bookings/${bookingId}`);
    redirect(`/dashboard/bookings/${bookingId}?payment=settled_by_credit`);
  }

  if (out_final_amount_cents <= 0) {
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
          product_data: { name: "OZRentAPlane Flight" },
          unit_amount: out_final_amount_cents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      invoice_id:   invoice.id,
      booking_id:   bookingId,
      customer_id:  user.id,
      invoice_type: "standard",
    },
    success_url: `${appUrl}/dashboard/bookings/${bookingId}?payment=success`,
    cancel_url:  `${appUrl}/dashboard/bookings/${bookingId}?payment=cancelled`,
  });

  await supabase
    .from("booking_invoices")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", invoice.id);

  if (!session.url) throw new Error("Failed to create Stripe session URL.");
  redirect(session.url);
}

// ─── Standard booking bank transfer ───────────────────────────────────────────

export async function submitStandardBankTransferProof(
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

  const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!validTypes.includes(file.type)) {
    throw new Error("Invalid file type. Please upload a JPEG, PNG, WebP, or PDF.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File is too large. Maximum size is 5MB.");
  }

  const fileExt = file.name.split(".").pop();
  const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("bank_transfer_receipts")
    .upload(filePath, file, { upsert: false });

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    throw new Error("Failed to upload receipt. Please try again.");
  }

  const { error: dbError } = await supabase
    .from("booking_bank_transfer_submissions")
    .insert({
      invoice_id:           invoiceId,
      booking_id:           bookingId,
      customer_id:          user.id,
      reference,
      receipt_storage_path: filePath,
      status:               "pending_review",
    });

  if (dbError) {
    console.error("DB insert error:", dbError);
    await supabase.storage.from("bank_transfer_receipts").remove([filePath]);
    throw new Error("Failed to submit proof. Please try again.");
  }

  await supabase
    .from("booking_invoices")
    .update({ payment_method: "bank_transfer", status: "bank_transfer_pending_review", updated_at: new Date().toISOString() })
    .eq("id", invoiceId);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();
  if (profile?.email) {
    await notifyBankTransferProofReceived({ customerEmail: profile.email, bookingId }).catch((error) =>
      console.error("[submitStandardBankTransferProof] customer email failed:", error),
    );
    await notifyAdminBankTransferProofUploaded({
      bookingId,
      customerName: profile.full_name ?? "Pilot",
      customerEmail: profile.email,
      amount: "Pending review",
      invoiceType: "standard",
    }).catch((error) => console.error("[submitStandardBankTransferProof] admin email failed:", error));
  }

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", sub.customer_id)
      .single();
    if (profile?.email) {
      await sendEmail({
        to: profile.email,
        subject: "Payment proof update",
        html: paymentConfirmedEmail(`Your bank transfer payment proof was rejected. Note: ${adminNote}. Please upload a new receipt or contact support.`).html,
        eventType: "bank_transfer_rejected",
        entityType: "payment",
        entityId: bookingId,
      }).catch((error) => console.error("[adminRejectBankTransfer] email failed:", error));
    }
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/requests/${bookingId}`);
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return { success: true };
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") throw new Error("Forbidden");
  return { supabase, adminId: user.id };
}

export async function recordManualPayment(input: RecordManualPaymentInput) {
  const { supabase, adminId } = await requireAdmin();

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Amount must be a positive whole number of cents.");
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, booking_type, booking_owner_user_id")
    .eq("id", input.bookingId)
    .single();

  if (!booking) throw new Error("Booking not found.");

  const manualRef = `manual-${input.paymentMethod}-${input.bookingId}-${Date.now()}`;
  const trimmedNote = input.note?.trim() || null;
  const methodLabel =
    input.paymentMethod === "cash"
      ? "cash"
      : input.paymentMethod === "card_in_person"
      ? "card (in person)"
      : "bank transfer";

  if (booking.booking_type === "checkout") {
    const { data: invoice } = await supabase
      .from("checkout_invoices")
      .select("id, checkout_outcome")
      .eq("booking_id", input.bookingId)
      .eq("invoice_type", "checkout")
      .single();

    if (!invoice) throw new Error("Checkout invoice not found.");

    const { error: ledgerError } = await supabase
      .from("customer_payment_ledger")
      .insert({
        customer_id: booking.booking_owner_user_id,
        booking_id: input.bookingId,
        invoice_id: invoice.id,
        invoice_source_type: "checkout",
        amount_cents: input.amountCents,
        currency: "aud",
        entry_type: input.paymentMethod === "bank_transfer" ? "bank_transfer" : "manual_adjustment",
        payment_method: input.paymentMethod,
        note: trimmedNote ?? `Manual payment recorded by admin (${methodLabel}).`,
        stripe_payment_intent_id: manualRef,
        stripe_checkout_session_id: manualRef,
        created_by: adminId,
      });

    if (ledgerError) throw new Error(ledgerError.message || "Failed to record payment ledger entry.");

    const { error: rpcErr } = await supabase.rpc("mark_checkout_invoice_paid_atomic", {
      p_invoice_id: invoice.id,
      p_stripe_payment_intent_id: manualRef,
      p_stripe_checkout_session_id: manualRef,
      p_amount_paid_cents: input.amountCents,
    });

    if (rpcErr) throw new Error(rpcErr.message || "Failed to settle checkout invoice.");

    await supabase
      .from("booking_status_history")
      .insert({
        booking_id: input.bookingId,
        old_status: "checkout_payment_required",
        new_status: "completed",
        note: "Checkout invoice paid via manual admin record.",
        changed_by_user_id: adminId,
      });

    let notifTitle = "Checkout payment received";
    let notifBody = "Your checkout invoice has been paid.";
    const checkoutOutcome = invoice.checkout_outcome as string | null;
    if (checkoutOutcome === "cleared_to_fly") {
      notifTitle = "Checkout payment received — you're cleared to fly";
      notifBody = "Your checkout invoice has been paid. Aircraft bookings are now available.";
    } else if (checkoutOutcome === "additional_checkout_required") {
      notifTitle = "Checkout invoice paid — additional checkout required";
      notifBody = "Your checkout invoice has been paid. An additional checkout session is required before you can be cleared to fly. You can now book another checkout flight.";
    } else if (checkoutOutcome === "checkout_reschedule_required") {
      notifTitle = "Checkout invoice paid — reschedule required";
      notifBody = "Your checkout invoice has been paid. You can now book another checkout session when you are ready.";
    } else if (checkoutOutcome === "not_currently_eligible") {
      notifTitle = "Checkout invoice paid";
      notifBody = "Your checkout invoice has been paid. Based on your assessment, further training with a qualified instructor is required before you can continue with aircraft hire.";
    }

    await supabase.from("verification_events").insert({
      user_id: booking.booking_owner_user_id,
      actor_role: "system",
      event_type: "approved",
      title: notifTitle,
      body: notifBody,
      is_read: false,
      email_status: "skipped",
    });

    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", booking.booking_owner_user_id)
      .single();
    if (profile?.email) {
      const template = paymentConfirmedEmail(notifBody);
      await sendEmail({
        to: profile.email,
        subject: template.subject,
        html: template.html,
        eventType: "payment_confirmed",
        entityType: "checkout",
        entityId: input.bookingId,
        metadata: { checkoutOutcome: checkoutOutcome ?? null, paymentMethod: input.paymentMethod },
      });
    }
  } else {
    const { data: invoice } = await supabase
      .from("booking_invoices")
      .select("id")
      .eq("booking_id", input.bookingId)
      .single();

    if (!invoice) throw new Error("Booking invoice not found.");

    const { error: ledgerError } = await supabase
      .from("customer_payment_ledger")
      .insert({
        customer_id: booking.booking_owner_user_id,
        booking_id: input.bookingId,
        invoice_id: invoice.id,
        invoice_source_type: "booking",
        amount_cents: input.amountCents,
        currency: "aud",
        entry_type: input.paymentMethod === "bank_transfer" ? "bank_transfer" : "manual_adjustment",
        payment_method: input.paymentMethod,
        note: trimmedNote ?? `Manual payment recorded by admin (${methodLabel}).`,
        stripe_payment_intent_id: manualRef,
        stripe_checkout_session_id: manualRef,
        created_by: adminId,
      });

    if (ledgerError) throw new Error(ledgerError.message || "Failed to record payment ledger entry.");

    const { error: rpcErr } = await supabase.rpc("mark_booking_invoice_paid_atomic", {
      p_invoice_id: invoice.id,
      p_stripe_payment_intent_id: manualRef,
      p_stripe_checkout_session_id: manualRef,
      p_amount_paid_cents: input.amountCents,
    });

    if (rpcErr) throw new Error(rpcErr.message || "Failed to settle booking invoice.");

    await supabase
      .from("booking_status_history")
      .insert({
        booking_id: input.bookingId,
        old_status: "payment_pending",
        new_status: "completed",
        note: "Flight invoice paid via manual admin record. Booking completed.",
        changed_by_user_id: adminId,
      });

    await supabase.from("verification_events").insert({
      user_id: booking.booking_owner_user_id,
      actor_role: "system",
      event_type: "approved",
      title: "Flight payment received — booking complete",
      body: "Your flight payment has been received. Your booking is now complete.",
      is_read: false,
      email_status: "skipped",
    });

    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", booking.booking_owner_user_id)
      .single();
    if (profile?.email) {
      const template = paymentConfirmedEmail("Payment has been received and recorded for your flight.");
      await sendEmail({
        to: profile.email,
        subject: template.subject,
        html: template.html,
        eventType: "post_flight_payment_received",
        entityType: "booking",
        entityId: input.bookingId,
        metadata: { paymentMethod: input.paymentMethod },
      });
    }
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/requests/${input.bookingId}`);
  revalidatePath(`/dashboard/bookings/${input.bookingId}`);
  return { success: true };
}
