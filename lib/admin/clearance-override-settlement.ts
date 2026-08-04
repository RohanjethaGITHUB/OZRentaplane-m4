import type { SupabaseClient } from '@supabase/supabase-js'
import { CHECKOUT_RATE_PER_HOUR } from '@/lib/pricing-constants'

type SettleOverrideInvoiceInput = {
  supabase: SupabaseClient<any, any, any>
  adminId: string
  customerId: string
  bookingId: string
  outcome: string
  note?: string | null
  now: string
}

function buildOverrideInvoiceNumber(bookingId: string, now: string): string {
  const stamp = now.replace(/[-:TZ.]/g, '').slice(0, 14)
  return `CHK-${stamp}-${bookingId.slice(0, 6).toUpperCase()}`
}

/**
 * Mirror "Mark as Already Paid" for clearance override completes:
 * ensure a checkout invoice exists in paid state so admin Charges & payment
 * shows "Paid in full" instead of "Awaiting payment".
 *
 * Does not invent VDO/landing amounts when none were recorded — amounts stay
 * zero / existing values; settlement is the important part.
 */
export async function settleClearanceOverrideInvoice(
  input: SettleOverrideInvoiceInput,
): Promise<{ invoiceId: string; created: boolean }> {
  const { supabase, adminId, customerId, bookingId, outcome, note, now } = input
  const trimmedNote =
    note?.trim() ||
    'Settled via admin clearance override (treated as already paid).'
  const rateCents = Math.round(CHECKOUT_RATE_PER_HOUR * 100)

  const { data: existing, error: fetchError } = await supabase
    .from('checkout_invoices')
    .select(
      'id, status, stripe_amount_due_cents, total_paid_cents, checkout_final_amount_cents, subtotal_cents, checkout_rate_cents_per_hour, checkout_duration_hours',
    )
    .eq('booking_id', bookingId)
    .eq('invoice_type', 'checkout')
    .maybeSingle()

  if (fetchError) {
    throw new Error(`Failed to load checkout invoice: ${fetchError.message}`)
  }

  if (existing?.id) {
    const amountDue = Math.max(
      existing.stripe_amount_due_cents ?? 0,
      0,
    )
    const finalAmount = Math.max(
      existing.checkout_final_amount_cents ?? 0,
      existing.subtotal_cents ?? 0,
      0,
    )
    const previouslyPaid = Math.max(existing.total_paid_cents ?? 0, 0)
    // Prefer recording the remaining due as paid; fall back to final amount / prior paid.
    const settledPaid = Math.max(previouslyPaid + amountDue, finalAmount, previouslyPaid)

    const { error: updateError } = await supabase
      .from('checkout_invoices')
      .update({
        status: 'paid',
        paid_at: now,
        stripe_amount_due_cents: 0,
        total_paid_cents: settledPaid,
        checkout_outcome: outcome,
        checkout_rate_cents_per_hour:
          existing.checkout_rate_cents_per_hour ?? rateCents,
        checkout_completed_by: adminId,
        checkout_completed_at: now,
        updated_at: now,
      })
      .eq('id', existing.id)

    if (updateError) {
      throw new Error(`Failed to settle checkout invoice: ${updateError.message}`)
    }

    if (amountDue > 0) {
      const manualRef = `override-${bookingId}-${Date.now()}`
      await supabase.from('customer_payment_ledger').insert({
        customer_id: customerId,
        booking_id: bookingId,
        invoice_id: existing.id,
        invoice_source_type: 'checkout',
        amount_cents: amountDue,
        currency: 'aud',
        entry_type: 'bank_transfer',
        payment_method: 'card_in_person',
        note: trimmedNote,
        stripe_payment_intent_id: manualRef,
        stripe_checkout_session_id: manualRef,
        created_by: adminId,
      })
    }

    return { invoiceId: existing.id, created: false }
  }

  const invoiceNumber = buildOverrideInvoiceNumber(bookingId, now)
  const { data: created, error: insertError } = await supabase
    .from('checkout_invoices')
    .insert({
      customer_id: customerId,
      booking_id: bookingId,
      invoice_number: invoiceNumber,
      invoice_type: 'checkout',
      status: 'paid',
      currency: 'aud',
      subtotal_cents: 0,
      advance_applied_cents: 0,
      stripe_amount_due_cents: 0,
      total_paid_cents: 0,
      paid_at: now,
      checkout_outcome: outcome,
      checkout_rate_cents_per_hour: rateCents,
      checkout_duration_hours: null,
      checkout_calculated_amount_cents: 0,
      checkout_landing_subtotal_cents: 0,
      checkout_final_amount_cents: 0,
      checkout_completed_by: adminId,
      checkout_completed_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (insertError || !created?.id) {
    throw new Error(
      `Failed to create settled checkout invoice: ${insertError?.message ?? 'unknown error'}`,
    )
  }

  return { invoiceId: created.id, created: true }
}
