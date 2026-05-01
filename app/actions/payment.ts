"use server";

import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16" as any,
});

export async function createCheckoutPaymentSession(bookingId: string) {
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
