import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16" as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

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

  // ── Top-level logging for every event ────────────────────────────────────────
  console.log(`[webhook] Event received: type=${event.type} id=${event.id}`)

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true })
  }

  // ── Log all session details immediately for checkout.session.completed ────────
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

  // ── Wrap the entire handler so any throw is caught and logged ─────────────────
  try {

    if (session.metadata?.invoice_type !== "checkout") {
      console.log(`[webhook] Skipping — invoice_type is not 'checkout', got: ${session.metadata?.invoice_type}`)
      return NextResponse.json({ received: true })
    }

    const invoiceId  = session.metadata?.invoice_id
    const bookingId  = session.metadata?.booking_id
    const customerId = session.metadata?.customer_id

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as any)?.id ?? null

    console.log("[webhook] Extracted metadata", { invoiceId, bookingId, customerId, sessionId: session.id, paymentIntentId, amountTotal: session.amount_total })

    if (!invoiceId || !bookingId || !customerId) {
      console.error("[webhook] Missing required metadata — aborting (returning 200, no retry useful)", { invoiceId, bookingId, customerId })
      return NextResponse.json({ received: true })
    }

    // ── Supabase service-role client ──────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    console.log("[webhook] Supabase env check", {
      url_set:         !!supabaseUrl,
      service_key_set: !!serviceKey,
    })

    if (!supabaseUrl || !serviceKey) {
      console.error("[webhook] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set — cannot proceed")
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // ── 0. Fetch invoice ──────────────────────────────────────────────────────
    console.log("[webhook] Step 0 — fetching invoice", { invoiceId })
    const { data: invoice, error: invoiceLookupErr } = await supabase
      .from("checkout_invoices")
      .select("id, status, subtotal_cents, stripe_amount_due_cents")
      .eq("id", invoiceId)
      .single()

    if (invoiceLookupErr) {
      logErr("Step 0 — invoice lookup FAILED", invoiceLookupErr)
      console.error("[webhook] Step 0 — invoiceId searched:", invoiceId)
      return NextResponse.json({ received: true })
    }
    if (!invoice) {
      console.error("[webhook] Step 0 — invoice not found for id:", invoiceId)
      return NextResponse.json({ received: true })
    }

    console.log("[webhook] Step 0 — invoice found", { id: invoice.id, status: invoice.status, subtotal_cents: invoice.subtotal_cents, stripe_amount_due_cents: invoice.stripe_amount_due_cents })

    const amountPaid = session.amount_total ?? 0
    const now        = new Date().toISOString()

    // ── Partial-recovery idempotency ──────────────────────────────────────────
    if (invoice.status === "paid") {
      console.log("[webhook] Invoice already paid — checking downstream state for partial recovery")

      const [{ data: bk, error: bkErr }, { data: pf, error: pfErr }] = await Promise.all([
        supabase.from("bookings").select("status").eq("id", bookingId).single(),
        supabase.from("profiles").select("pilot_clearance_status").eq("id", customerId).single(),
      ])

      if (bkErr) logErr("Partial recovery — booking fetch FAILED", bkErr)
      if (pfErr) logErr("Partial recovery — profile fetch FAILED", pfErr)

      console.log("[webhook] Partial recovery check", {
        booking_status:          bk?.status,
        pilot_clearance_status:  pf?.pilot_clearance_status,
      })

      const bookingOk = bk?.status === "completed"
      const profileOk = pf?.pilot_clearance_status === "cleared_for_solo_hire"

      if (bookingOk && profileOk) {
        console.log("[webhook] Fully idempotent — all state correct, returning 200")
        return NextResponse.json({ received: true })
      }

      console.log("[webhook] Partial completion detected — running recovery", { bookingOk, profileOk })
      // Fall through to fix the incomplete state without re-doing step 1
    }

    // ── 1. Mark invoice paid ──────────────────────────────────────────────────
    if (invoice.status !== "paid") {
      const subtotalCents  = invoice.subtotal_cents  ?? 29000
      const amountDueCents = invoice.stripe_amount_due_cents ?? 29000
      const totalPaidCents = amountPaid + (subtotalCents - amountDueCents)

      console.log("[webhook] Step 1 — marking invoice paid", { amountPaid, subtotalCents, amountDueCents, totalPaidCents, paymentIntentId, sessionId: session.id })

      const { error: invoiceUpdateErr } = await supabase
        .from("checkout_invoices")
        .update({
          status:                     "paid",
          total_paid_cents:           totalPaidCents,
          paid_at:                    now,
          stripe_payment_intent_id:   paymentIntentId,
          stripe_checkout_session_id: session.id,
        })
        .eq("id", invoiceId)

      if (invoiceUpdateErr) {
        logErr("Step 1 — invoice update FAILED (returning 500 so Stripe retries)", invoiceUpdateErr)
        return NextResponse.json({ error: "Invoice update failed" }, { status: 500 })
      }

      console.log("[webhook] Step 1 — invoice marked paid ✓")
    } else {
      console.log("[webhook] Step 1 — invoice already paid, skipping update")
    }

    // ── 2. Ledger entry (idempotent) ──────────────────────────────────────────
    console.log("[webhook] Step 2 — checking for existing ledger entry", { sessionId: session.id })
    const { data: existingLedger, error: ledgerCheckErr } = await supabase
      .from("customer_payment_ledger")
      .select("id")
      .eq("stripe_checkout_session_id", session.id)
      .eq("entry_type", "stripe_payment")
      .maybeSingle()

    if (ledgerCheckErr) {
      console.warn("[webhook] Step 2 — ledger idempotency check error (continuing)", { message: ledgerCheckErr.message, code: ledgerCheckErr.code, details: ledgerCheckErr.details })
    }

    if (existingLedger) {
      console.log("[webhook] Step 2 — ledger entry already exists, skipping", { ledger_id: existingLedger.id })
    } else {
      console.log("[webhook] Step 2 — inserting ledger entry", { customerId, bookingId, invoiceId, amountPaid })
      const { error: ledgerErr } = await supabase
        .from("customer_payment_ledger")
        .insert({
          customer_id:                customerId,
          booking_id:                 bookingId,
          invoice_id:                 invoiceId,
          amount_cents:               amountPaid,
          entry_type:                 "stripe_payment",
          payment_method:             "stripe",
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id:   paymentIntentId,
          note:                       "Paid via Stripe Checkout",
          created_by:                 null,
        })

      if (ledgerErr) {
        logErr("Step 2 — ledger insert FAILED (non-fatal, continuing)", ledgerErr)
      } else {
        console.log("[webhook] Step 2 — ledger entry created ✓")
      }
    }

    // ── 3. Update booking status to completed ─────────────────────────────────
    console.log("[webhook] Step 3 — updating booking to completed", { bookingId })
    const { error: bookingErr } = await supabase
      .from("bookings")
      .update({ status: "completed", updated_at: now })
      .eq("id", bookingId)

    if (bookingErr) {
      logErr("Step 3 — booking update FAILED (non-fatal after invoice paid)", bookingErr)
    } else {
      console.log("[webhook] Step 3 — booking set to completed ✓")
    }

    // ── 4. Booking status history (non-critical) ──────────────────────────────
    console.log("[webhook] Step 4 — inserting booking_status_history")
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
      console.warn("[webhook] Step 4 — booking_status_history insert FAILED (non-critical)", { message: historyErr.message, code: historyErr.code, details: historyErr.details, hint: historyErr.hint })
    } else {
      console.log("[webhook] Step 4 — booking status history recorded ✓")
    }

    // ── 5. Update pilot clearance status ──────────────────────────────────────
    console.log("[webhook] Step 5 — updating pilot_clearance_status to cleared_for_solo_hire", { customerId })
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        pilot_clearance_status: "cleared_for_solo_hire",
        updated_at:             now,
      })
      .eq("id", customerId)

    if (profileErr) {
      logErr("Step 5 — profile clearance update FAILED (non-fatal after invoice paid)", profileErr)
    } else {
      console.log("[webhook] Step 5 — pilot_clearance_status set to cleared_for_solo_hire ✓")
    }

    // ── 6. Customer notification (non-critical) ───────────────────────────────
    try {
      console.log("[webhook] Step 6 — inserting customer notification")
      const { error: notifErr } = await supabase
        .from("verification_events")
        .insert({
          user_id:      customerId,
          actor_role:   "system",
          event_type:   "approved",
          title:        "Checkout payment received",
          body:         "Your checkout invoice has been paid. Aircraft bookings are now available.",
          is_read:      false,
          email_status: "skipped",
        })

      if (notifErr) {
        console.warn("[webhook] Step 6 — notification insert FAILED (non-fatal)", { message: notifErr.message, code: notifErr.code, details: notifErr.details, hint: notifErr.hint })
      } else {
        console.log("[webhook] Step 6 — customer notification created ✓")
      }
    } catch (notifEx: any) {
      console.warn("[webhook] Step 6 — notification threw unexpectedly (non-fatal)", { message: notifEx?.message, stack: notifEx?.stack })
    }

    console.log("[webhook] checkout.session.completed processed successfully ✓", { invoiceId, bookingId, customerId })
    return NextResponse.json({ received: true })

  } catch (err: any) {
    console.error("[webhook] checkout.session.completed fatal error", {
      message: err?.message,
      stack:   err?.stack,
      name:    err?.name,
      cause:   err?.cause,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
