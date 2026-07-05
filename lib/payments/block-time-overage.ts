// ─── Block time overage gate ──────────────────────────────────────────────────
// A flight that exceeds the customer's block time balance produces a separate
// overage invoice (status 'awaiting', is_block_time_overage = true) at the
// package's locked rate. While any such invoice is unpaid, the customer is
// gated from creating new bookings, buying block time packages, and topping up.
// The gate lifts automatically the moment the invoice is marked paid.

import type { SupabaseClient } from '@supabase/supabase-js'

export type OutstandingOverageInvoice = {
  id: string
  invoice_number: string
  total: number
  created_at: string
  booking_id: string | null
}

export async function getOutstandingOverageInvoices(
  supabase: SupabaseClient,
  userId: string,
): Promise<OutstandingOverageInvoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, created_at, booking_id')
    .eq('user_id', userId)
    .eq('is_block_time_overage', true)
    .eq('status', 'awaiting')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error('Failed to check for outstanding block time overage invoices.')
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    invoice_number: row.invoice_number as string,
    total: Number(row.total),
    created_at: row.created_at as string,
    booking_id: (row.booking_id as string | null) ?? null,
  }))
}

export function overageGateMessage(invoices: OutstandingOverageInvoice[]): string {
  const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0)
  const label = invoices.length === 1
    ? `invoice ${invoices[0].invoice_number}`
    : `${invoices.length} invoices`
  return (
    `OVERAGE_UNPAID: You have an outstanding block time overage ` +
    `(${label}, $${total.toFixed(2)}). Please pay it from your Block Time page ` +
    `before making new bookings or purchases.`
  )
}
