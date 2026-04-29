"use server";

import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { redirect } from "next/navigation";

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

  const { data: invoice, error: invoiceErr } = await supabase
    .from("checkout_invoices")
    .select("id, stripe_amount_due_cents, status, booking_id")
    .eq("booking_id", bookingId)
    .eq("customer_id", user.id)
    .single();

  if (invoiceErr || !invoice) {
    throw new Error("Invoice not found.");
  }

  if (invoice.status !== "payment_required") {
    throw new Error("Invoice does not require payment.");
  }

  if (invoice.stripe_amount_due_cents <= 0) {
    throw new Error("Amount due is zero. No payment needed.");
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
          unit_amount: invoice.stripe_amount_due_cents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      invoice_id: invoice.id,
      booking_id: bookingId,
      customer_id: user.id,
      invoice_type: "checkout",
    },
    success_url: `${appUrl}/dashboard/bookings/${bookingId}?payment=success`,
    cancel_url: `${appUrl}/dashboard/bookings/${bookingId}?payment=cancelled`,
  });

  await supabase
    .from("checkout_invoices")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", invoice.id);

  if (!session.url) {
    throw new Error("Failed to create Stripe session URL.");
  }

  redirect(session.url);
}
