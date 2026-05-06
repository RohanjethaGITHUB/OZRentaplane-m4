import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function logErr(step: string, err: any) {
  console.error(`[webhook] ${step}`, {
    message: err?.message,
    code:    err?.code,
    details: err?.details,
    hint:    err?.hint,
  })
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    console.error("[webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" as any });

  let body: string
  try {
    body = await req.text()
  } catch (e: any) {
    console.error("[webhook] Failed to read request body", { error: e?.message })
    return NextResponse.json({ error: "Could not read body" }, { status: 400 })
  }

  const sig = req.headers.get("stripe-signature")
  if (!sig) {
    console.error("[webhook] Missing stripe-signature header")
    return NextResponse.json({ error: "No signature" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err: any) {
    console.error(`[webhook] Signature verification failed: ${err.message}`)
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  console.log(`[webhook] Event received: type=${event.type} id=${event.id}`)

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session
  console.log("[webhook] checkout.session.completed — session details", {
    session_id:      session.id,
    payment_intent:  session.payment_intent,
    amount_total:    session.amount_total,
    metadata:        session.metadata,
    invoice_id:      session.metadata?.invoice_id,
    booking_id:      session.metadata?.booking_id,
    customer_id:     session.metadata?.customer_id,
    invoice_type:    session.metadata?.invoice_type,
  })

  try {
    const invoiceType = session.metadata?.invoice_type
    if (invoiceType !== "checkout" && invoiceType !== "standard") {
      console.log(`[webhook] Skipping — unknown invoice_type: ${invoiceType}`)
      return NextResponse.json({ received: true })
    }

    const invoiceId  = session.metadata?.invoice_id
    const bookingId  = session.metadata?.booking_id
    const customerId = session.metadata?.customer_id

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as any)?.id ?? null

    const amountPaid = session.amount_total ?? 0

    console.log("[webhook] Extracted metadata", { invoiceId, bookingId, customerId, invoiceType, sessionId: session.id, paymentIntentId, amountPaid })

    if (!invoiceId || !bookingId || !customerId) {
      console.error("[webhook] Missing required metadata — aborting", { invoiceId, bookingId, customerId })
      return NextResponse.json({ received: true })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      console.error("[webhook] Missing Supabase env vars")
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // ── Standard booking payment ───────────────────────────────────────────────
    if (invoiceType === "standard") {
      console.log("[webhook] Calling mark_booking_invoice_paid_atomic", { invoiceId })

      const { error: rpcErr } = await supabase.rpc("mark_booking_invoice_paid_atomic", {
        p_invoice_id:                 invoiceId,
        p_stripe_payment_intent_id:   paymentIntentId,
        p_stripe_checkout_session_id: session.id,
        p_amount_paid_cents:          amountPaid,
      })

      if (rpcErr) {
        logErr("mark_booking_invoice_paid_atomic FAILED", rpcErr)
        return NextResponse.json({ error: "Payment processing failed" }, { status: 500 })
      }

      console.log("[webhook] mark_booking_invoice_paid_atomic succeeded ✓")

      await supabase.from("booking_status_history").insert({
        booking_id:         bookingId,
        old_status:         "payment_pending",
        new_status:         "completed",
        note:               "Flight invoice paid via Stripe. Booking completed.",
        changed_by_user_id: null,
      }).then(({ error: e }) => {
        if (e) console.warn("[webhook] standard status_history insert FAILED (non-critical)", e.message)
      })

      try {
        await supabase.from("verification_events").insert({
          user_id:      customerId,
          actor_role:   "system",
          event_type:   "approved",
          title:        "Flight payment received — booking complete",
          body:         "Your flight payment has been received. Your booking is now complete.",
          is_read:      false,
          email_status: "skipped",
        })
      } catch (notifEx: any) {
        console.warn("[webhook] Standard notification failed (non-fatal)", notifEx?.message)
      }

      console.log("[webhook] standard payment processed ✓", { invoiceId, bookingId })
      return NextResponse.json({ received: true })
    }

    // ── Checkout payment ──────────────────────────────────────────────────────
    console.log("[webhook] Calling mark_checkout_invoice_paid_atomic", { invoiceId, sessionId: session.id })

    const { error: rpcErr } = await supabase.rpc("mark_checkout_invoice_paid_atomic", {
      p_invoice_id:                 invoiceId,
      p_stripe_payment_intent_id:   paymentIntentId,
      p_stripe_checkout_session_id: session.id,
      p_amount_paid_cents:          amountPaid,
    })

    if (rpcErr) {
      logErr("mark_checkout_invoice_paid_atomic FAILED (returning 500 for Stripe retry)", rpcErr)
      return NextResponse.json({ error: "Payment processing failed" }, { status: 500 })
    }

    console.log("[webhook] mark_checkout_invoice_paid_atomic succeeded ✓")

    const { error: historyErr } = await supabase
      .from("booking_status_history")
      .insert({
        booking_id:         bookingId,
        old_status:         "checkout_payment_required",
        new_status:         "completed",
        note:               "Checkout invoice paid via Stripe.",
        changed_by_user_id: null,
      })

    if (historyErr) {
      console.warn("[webhook] booking_status_history insert FAILED (non-critical)", { message: historyErr.message })
    }

    const { data: invoiceRow } = await supabase
      .from("checkout_invoices")
      .select("checkout_outcome")
      .eq("id", invoiceId)
      .single()

    const checkoutOutcome = invoiceRow?.checkout_outcome as string | null

    let notifTitle = "Checkout payment received"
    let notifBody  = "Your checkout invoice has been paid."

    if (checkoutOutcome === "cleared_to_fly") {
      notifTitle = "Checkout payment received — you're cleared to fly"
      notifBody  = "Your checkout invoice has been paid. Aircraft bookings are now available."
    } else if (checkoutOutcome === "additional_checkout_required") {
      notifTitle = "Checkout invoice paid — additional checkout required"
      notifBody  = "Your checkout invoice has been paid. An additional checkout session is required before you can be cleared to fly. You can now book another checkout flight."
    } else if (checkoutOutcome === "checkout_reschedule_required") {
      notifTitle = "Checkout invoice paid — reschedule required"
      notifBody  = "Your checkout invoice has been paid. You can now book another checkout session when you are ready."
    } else if (checkoutOutcome === "not_currently_eligible") {
      notifTitle = "Checkout invoice paid"
      notifBody  = "Your checkout invoice has been paid. Based on your assessment, further training with a qualified instructor is required before you can continue with aircraft hire."
    }

    try {
      const { error: notifErr } = await supabase
        .from("verification_events")
        .insert({
          user_id:      customerId,
          actor_role:   "system",
          event_type:   "approved",
          title:        notifTitle,
          body:         notifBody,
          is_read:      false,
          email_status: "skipped",
        })

      if (notifErr) {
        console.warn("[webhook] Notification insert FAILED (non-fatal)", { message: notifErr.message })
      }
    } catch (notifEx: any) {
      console.warn("[webhook] Notification threw unexpectedly (non-fatal)", { message: notifEx?.message })
    }

    console.log("[webhook] checkout.session.completed processed successfully ✓", { invoiceId, bookingId, customerId })
    return NextResponse.json({ received: true })

  } catch (err: any) {
    console.error("[webhook] checkout.session.completed fatal error", {
      message: err?.message,
      stack:   err?.stack,
      name:    err?.name,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
