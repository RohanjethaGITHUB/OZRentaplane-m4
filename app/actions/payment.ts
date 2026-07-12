"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PAYMENT_CONFIG } from "@/lib/payments/config";
import { validateBlockTimeTopupHours } from "@/lib/payments/block-time-topup";
import { getOutstandingOverageInvoices, overageGateMessage } from "@/lib/payments/block-time-overage";
import {
  notifyAdminBankTransferProofUploaded,
  notifyBankTransferProofReceived,
} from "@/lib/booking/notifications";
import { sendEmail } from "@/lib/email/send-email";
import { paymentConfirmedEmail } from "@/lib/email/templates/payment";
import { settleCheckoutInvoiceManually } from "@/lib/payments/settle-checkout-invoice";
import { generateStandardBookingInvoicePdf } from "@/lib/invoices/standard-booking-pdf";

type ManualPaymentMethod = "cash" | "card_in_person" | "bank_transfer";

type RecordManualPaymentInput = {
  bookingId: string;
  paymentMethod?: ManualPaymentMethod | null;
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

  // Overage gate — an unpaid block time overage invoice blocks new purchases.
  const outstandingOverageForPurchase = await getOutstandingOverageInvoices(supabase, user.id);
  if (outstandingOverageForPurchase.length > 0) {
    throw new Error(overageGateMessage(outstandingOverageForPurchase));
  }

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

export async function createBlockTimeTopupIntent(purchaseId: string, hoursRequested: number) {
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

  // Overage gate — an unpaid block time overage invoice blocks top-ups.
  const outstandingOverageForTopup = await getOutstandingOverageInvoices(supabase, user.id);
  if (outstandingOverageForTopup.length > 0) {
    throw new Error(overageGateMessage(outstandingOverageForTopup));
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    throw new Error("Profile not found.");
  }

  type TopupPurchaseRow = {
    id: string;
    user_id: string;
    package_id: string;
    hours_purchased: number;
    hours_remaining: number;
    rate_per_hour: number;
    status: string;
    expires_at: string;
    package:
      | { id: string; name: string; validity_days: number }
      | { id: string; name: string; validity_days: number }[]
      | null;
  };

  const { data: purchaseRaw, error: purchaseErr } = await supabase
    .from("pilot_block_time_purchases")
    .select(`
      id,
      user_id,
      package_id,
      hours_purchased,
      hours_remaining,
      rate_per_hour,
      status,
      expires_at,
      package:block_time_packages ( id, name, validity_days )
    `)
    .eq("id", purchaseId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (purchaseErr) {
    throw new Error(purchaseErr.message || "Failed to load your block time package.");
  }

  const purchase = purchaseRaw as TopupPurchaseRow | null;
  if (!purchase) {
    throw new Error("No active block time package found to top up.");
  }

  if (new Date(purchase.expires_at).getTime() <= Date.now()) {
    throw new Error("This package has expired and can no longer be topped up.");
  }

  const validation = validateBlockTimeTopupHours(Number(hoursRequested), Number(purchase.hours_purchased));
  if (!validation.ok) {
    throw new Error(validation.reason);
  }
  const hours = validation.hours;

  const packageRow = Array.isArray(purchase.package) ? purchase.package[0] : purchase.package;
  const packageName = packageRow?.name ?? "Block Time";
  // Charge at the rate locked in on the purchase row — never the package's
  // current catalogue rate.
  const ratePerHour = Number(purchase.rate_per_hour);
  const amountCents = Math.round(hours * ratePerHour * 100);

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

  const appUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const topupMetadata = {
    purchase_type: "block_time_topup",
    supabase_user_id: user.id,
    purchase_id: purchase.id,
    package_id: purchase.package_id,
    package_name: packageName,
    hours_added: String(hours),
    rate_per_hour: String(ratePerHour),
  };

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer: stripeCustomerId,
    line_items: [
      {
        price_data: {
          currency: "aud",
          product_data: {
            name: `OZ Rent A Plane - ${packageName} Top-Up`,
            description: `${hours} hours at ${ratePerHour.toFixed(0)}/hr (locked-in rate)`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/dashboard/purchases?block_time_topup=success`,
    cancel_url: `${appUrl}/dashboard/purchases?block_time_topup=cancelled`,
    metadata: topupMetadata,
    payment_intent_data: ({
      setup_future_usage: "off_session",
      metadata: topupMetadata,
      description: `OZ Rent A Plane - ${packageName} Top-Up (${hours}h Block Time)`,
    } as any),
  });

  if (!session.url) {
    throw new Error("Failed to create Stripe checkout session.");
  }

  redirect(session.url);
}

// ─── Block time invoice payment (overage + landing fee) ──────────────────────
// Customer settles an outstanding block time flight invoice — an overage
// invoice or a landing fee invoice — via Stripe Checkout. The webhook marks
// the invoice paid; for overage invoices that also lifts the overage gate
// (new bookings / purchases / top-ups) automatically.
export async function createBlockTimeOveragePaymentSession(invoiceId: string) {
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

  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, user_id, booking_id, total, status, is_block_time_overage, billing_mode, type")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .eq("billing_mode", "block_time")
    .eq("type", "flight")
    .maybeSingle();

  if (invoiceErr) throw new Error("Failed to load the invoice.");
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "paid") {
    throw new Error("VALIDATION: This invoice has already been paid.");
  }
  if (invoice.status !== "awaiting") {
    throw new Error(`VALIDATION: This invoice cannot be paid (status: ${invoice.status}).`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  let stripeCustomerId = profile?.stripe_customer_id ?? null;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? undefined,
      name: profile?.full_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    stripeCustomerId = customer.id;
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", user.id);
  }

  const appUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const overageMetadata = {
    purchase_type: "block_time_overage_payment",
    supabase_user_id: user.id,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    booking_id: invoice.booking_id ?? "",
  };

  const amountCents = Math.round(Number(invoice.total) * 100);
  const productLabel = invoice.is_block_time_overage
    ? `OZ Rent A Plane — Block Time Overage (${invoice.invoice_number})`
    : `OZ Rent A Plane — Landing Fees (${invoice.invoice_number})`;
  const productDescription = invoice.is_block_time_overage
    ? "Flight hours exceeding your block time balance, at your locked package rate."
    : "Landing fees for your flight, invoiced separately from flight hours.";

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer: stripeCustomerId,
    line_items: [
      {
        price_data: {
          currency: "aud",
          product_data: {
            name: productLabel,
            description: productDescription,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/dashboard/purchases?overage_payment=success`,
    cancel_url: `${appUrl}/dashboard/purchases?overage_payment=cancelled`,
    metadata: overageMetadata,
    payment_intent_data: ({
      metadata: overageMetadata,
      description: productLabel,
    } as any),
  });

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

  const { data: submissionId, error: proofError } = await supabase.rpc(
    "submit_standard_bank_transfer_proof_atomic",
    {
      p_invoice_id: invoiceId,
      p_booking_id: bookingId,
      p_reference: reference,
      p_receipt_storage_path: filePath,
    }
  );

  if (proofError || !submissionId) {
    console.error("[submitStandardBankTransferProof] proof RPC failed", {
      message: proofError?.message,
      code: proofError?.code,
      details: proofError?.details,
      hint: proofError?.hint,
      bookingId,
      invoiceId,
      userId: user.id,
    });
    const { error: cleanupError } = await supabase.storage.from("bank_transfer_receipts").remove([filePath]);
    if (cleanupError) {
      console.error("[submitStandardBankTransferProof] cleanup failed", {
        message: cleanupError.message,
        bookingId,
        invoiceId,
        path: filePath,
      });
    }
    throw new Error(
      proofError?.message === "Unauthorized"
        ? "You are not allowed to submit payment proof for this booking."
        : proofError?.message ?? "Failed to submit proof. Please try again."
    );
  }

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
  revalidatePath(`/admin/bookings/requests/${bookingId}`);
  revalidatePath("/admin/bookings/payments");
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
  // requireAdmin() enforces authorization via the session client; the actual
  // privileged writes below use the service-role client because the settlement
  // RPCs (mark_checkout_invoice_paid_atomic / mark_booking_invoice_paid_atomic)
  // are locked to service_role and must not be reachable via the authenticated
  // PostgREST role.
  const { supabase, adminId } = await requireAdmin();
  const admin = createAdminClient();

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Amount must be a positive whole number of cents.");
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, booking_type, booking_owner_user_id")
    .eq("id", input.bookingId)
    .single();

  if (!booking) throw new Error("Booking not found.");

  const paymentMethod = input.paymentMethod ?? null;
  const manualRef = `manual-${paymentMethod ?? "standard"}-${input.bookingId}-${Date.now()}`;
  const trimmedNote = input.note?.trim() || null;
  const methodLabel =
    paymentMethod === "cash"
      ? "cash"
      : paymentMethod === "card_in_person"
      ? "card (in person)"
      : paymentMethod === "bank_transfer"
        ? "bank transfer"
        : "manual settlement";

  if (booking.booking_type === "checkout") {
    if (!paymentMethod) {
      throw new Error("VALIDATION: Manual checkout payments require a payment method.");
    }
    await settleCheckoutInvoiceManually(admin, adminId, {
      bookingId: input.bookingId,
      customerId: booking.booking_owner_user_id,
      paymentMethod,
      amountCents: input.amountCents,
      note: trimmedNote,
    });
  } else {
    const { data: invoice } = await admin
      .from("booking_invoices")
      .select("id")
      .eq("booking_id", input.bookingId)
      .single();

    if (!invoice) throw new Error("Booking invoice not found.");

    const { error: ledgerError } = await admin
      .from("customer_payment_ledger")
      .insert({
        customer_id: booking.booking_owner_user_id,
        booking_id: input.bookingId,
        invoice_id: invoice.id,
        invoice_source_type: "booking",
        amount_cents: input.amountCents,
        currency: "aud",
        // Standard-booking mark-paid should be audit-only, not spendable credit.
        entry_type: "bank_transfer",
        payment_method: paymentMethod ?? "bank_transfer",
        note: trimmedNote ?? (paymentMethod ? `Manual payment recorded by admin (${methodLabel}).` : "Manual payment recorded by admin."),
        stripe_payment_intent_id: manualRef,
        stripe_checkout_session_id: manualRef,
        created_by: adminId,
      });

    if (ledgerError) throw new Error(ledgerError.message || "Failed to record payment ledger entry.");

    const { error: rpcErr } = await admin.rpc("mark_booking_invoice_paid_atomic", {
      p_invoice_id: invoice.id,
      p_stripe_payment_intent_id: manualRef,
      p_stripe_checkout_session_id: manualRef,
      p_amount_paid_cents: input.amountCents,
    });

    if (rpcErr) throw new Error(rpcErr.message || "Failed to settle booking invoice.");

    await admin
      .from("booking_status_history")
      .insert({
        booking_id: input.bookingId,
        old_status: "payment_pending",
        new_status: "completed",
        note: "Flight invoice paid via manual admin record. Booking completed.",
        changed_by_user_id: adminId,
      });

    await admin.from("verification_events").insert({
      user_id: booking.booking_owner_user_id,
      actor_role: "system",
      event_type: "approved",
      title: "Flight payment received — booking complete",
      body: "Your flight payment has been received. Your booking is now complete.",
      is_read: false,
      email_status: "skipped",
    });

    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", booking.booking_owner_user_id)
      .single();
    if (profile?.email) {
      const template = paymentConfirmedEmail("Payment has been received and recorded for your flight.");
      // Manual settlement is complete at this point; the confirmation email
      // can be queued in the background so admin callers do not wait on the
      // external mail API before they see success.
      void sendEmail({
        to: profile.email,
        subject: template.subject,
        html: template.html,
        eventType: "post_flight_payment_received",
        entityType: "booking",
        entityId: input.bookingId,
        metadata: { paymentMethod },
      }).catch((error) => console.error('[recordManualPayment] email failed:', error));
    }

    try {
      const pdfResult = await generateStandardBookingInvoicePdf({ supabase, invoiceId: invoice.id })
      if (pdfResult) {
        console.log('[recordManualPayment] standard booking receipt generated', {
          invoiceId: invoice.id,
          pdfUrl: pdfResult.pdfUrl,
        })
      }
    } catch (error) {
      console.error('[recordManualPayment] standard booking receipt generation failed:', error)
    }
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/requests/${input.bookingId}`);
  revalidatePath(`/dashboard/bookings/${input.bookingId}`);
  return { success: true };
}

// ─── Manual settlement of a block time flight invoice ────────────────────────
// Admin records an in-person payment (cash / card in person / verified bank
// transfer) against an 'awaiting' block time invoice — an overage invoice or
// a landing fee invoice. This is the Case 3 ("mark paid") path for invoices
// that live in the `invoices` table; recordManualPayment cannot be reused
// because it settles `booking_invoices` / `checkout_invoices` rows.
// For overage invoices, setting status = 'paid' is exactly the condition
// lib/payments/block-time-overage.ts checks, so the booking gate lifts
// automatically — same effect as the Stripe webhook settlement.
export async function adminSettleBlockTimeInvoice(input: {
  invoiceId: string;
  paymentMethod?: ManualPaymentMethod | null;
  note?: string;
}) {
  const { supabase, adminId } = await requireAdmin();

  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, user_id, booking_id, total, status, billing_mode, type, is_block_time_overage")
    .eq("id", input.invoiceId)
    .single();

  if (invoiceErr || !invoice) throw new Error("Invoice not found.");
  if (invoice.billing_mode !== "block_time" || invoice.type !== "flight") {
    throw new Error("VALIDATION: Only block time flight invoices can be settled with this action.");
  }
  if (invoice.status === "paid") {
    throw new Error("VALIDATION: This invoice has already been paid.");
  }
  if (invoice.status !== "awaiting") {
    throw new Error(`VALIDATION: This invoice cannot be settled (status: ${invoice.status}).`);
  }

  const amountCents = Math.round(Number(invoice.total) * 100);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("Invoice total is invalid.");
  }

  const paymentMethod = input.paymentMethod ?? null;
  const manualRef = `manual-${paymentMethod ?? "standard"}-${invoice.id}-${Date.now()}`;
  const trimmedNote = input.note?.trim() || null;
  const methodLabel =
    paymentMethod === "cash"
      ? "cash"
      : paymentMethod === "card_in_person"
      ? "card (in person)"
      : paymentMethod === "bank_transfer"
        ? "bank transfer"
        : "manual settlement";

  const { error: ledgerError } = await supabase
    .from("customer_payment_ledger")
    .insert({
      customer_id: invoice.user_id,
      booking_id: invoice.booking_id,
      invoice_id: invoice.id,
      invoice_source_type: "block_time",
      amount_cents: amountCents,
      currency: "aud",
      // Keep the audit trail, but do not turn a settled invoice into spendable
      // credit: customer_credit_balances counts 'manual_adjustment' toward the
      // balance, so a cash/card settle here would mint phantom credit. Same
      // pattern as the checkout and standard-booking manual settlements; the
      // actual method is preserved in payment_method.
      entry_type: "bank_transfer",
      payment_method: paymentMethod,
      note: trimmedNote ?? (paymentMethod ? `Manual payment recorded by admin (${methodLabel}).` : "Manual payment recorded by admin."),
      stripe_payment_intent_id: manualRef,
      stripe_checkout_session_id: manualRef,
      created_by: adminId,
    });

  if (ledgerError) throw new Error(ledgerError.message || "Failed to record payment ledger entry.");

  // Guarded on status so a concurrent settlement (e.g. the Stripe webhook)
  // cannot be double-applied.
  const { data: updatedRows, error: paidErr } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      payment_method: paymentMethod,
      paid_at: new Date().toISOString(),
    })
    .eq("id", invoice.id)
    .eq("status", "awaiting")
    .select("id");

  if (paidErr) throw new Error(paidErr.message || "Failed to mark the invoice paid.");
  if (!updatedRows || updatedRows.length === 0) {
    throw new Error("The invoice was settled by another process while this action ran. No changes were applied here — verify the invoice status before recording the payment again.");
  }

  const isOverage = Boolean(invoice.is_block_time_overage);
  const totalLabel = `$${Number(invoice.total).toFixed(2)}`;
  const notifTitle = isOverage
    ? "Block time overage paid — account unlocked"
    : "Landing fee invoice settled";
  const notifBody = isOverage
    ? `Overage invoice ${invoice.invoice_number} (${totalLabel}) has been settled (${methodLabel}). New bookings, block time purchases, and top-ups are available again.`
    : `Landing fee invoice ${invoice.invoice_number} (${totalLabel}) has been settled (${methodLabel}).`;

  await supabase.from("verification_events").insert({
    user_id: invoice.user_id,
    actor_user_id: adminId,
    actor_role: "admin",
    event_type: "approved",
    title: notifTitle,
    body: notifBody,
    is_read: false,
    email_status: "skipped",
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", invoice.user_id)
    .single();
  if (profile?.email) {
    const template = paymentConfirmedEmail(notifBody);
    await sendEmail({
      to: profile.email,
      subject: template.subject,
      html: template.html,
      eventType: isOverage ? "block_time_overage_paid" : "block_time_landing_fee_paid",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        invoiceNumber: invoice.invoice_number,
        total: Number(invoice.total),
        paymentMethod,
      },
    }).catch((error) => console.error("[adminSettleBlockTimeInvoice] email failed:", error));
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${invoice.user_id}`);
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard");
  if (invoice.booking_id) {
    revalidatePath(`/admin/bookings/requests/${invoice.booking_id}`);
    revalidatePath(`/dashboard/bookings/${invoice.booking_id}`);
  }
  return { success: true };
}
