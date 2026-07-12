import 'server-only'

import { generateInvoicePdf } from './pdf'
import { storeInvoicePdf } from './pdf-storage'

type StandardBookingPdfResult = Awaited<ReturnType<typeof storeInvoicePdf>>

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100
}

function formatPaymentMethodLabel(paymentMethod: string | null): string | null {
  if (!paymentMethod) return null
  if (paymentMethod === 'bank_transfer') return 'Bank transfer'
  if (paymentMethod === 'card') return 'Card'
  if (paymentMethod === 'cash') return 'Cash'
  if (paymentMethod === 'card_in_person') return 'Card (in person)'
  return paymentMethod.replace(/_/g, ' ')
}

function getFullName(profile: {
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
} | null | undefined): string {
  const fullName = profile?.full_name?.trim()
  if (fullName) return fullName
  const parts = [profile?.first_name?.trim(), profile?.last_name?.trim()].filter(Boolean)
  return parts.join(' ') || 'Pilot'
}

function getPhoneDisplay(profile: {
  phone_country_code?: string | null
  phone_number?: string | null
} | null | undefined): string | null {
  const phoneNumber = profile?.phone_number?.trim()
  if (!phoneNumber) return null
  const countryCode = profile?.phone_country_code?.trim()
  return countryCode ? `${countryCode} ${phoneNumber}` : phoneNumber
}

function getAirportLabel(airport: {
  icao_code?: string | null
  name?: string | null
} | null | undefined, fallbackIndex: number): string {
  const icao = airport?.icao_code?.trim()
  const name = airport?.name?.trim()
  const pieces = [icao, name].filter(Boolean)
  return pieces.join(' - ') || `Landing ${fallbackIndex + 1}`
}

export async function generateStandardBookingInvoicePdf(params: {
  supabase: any
  invoiceId: string
}): Promise<StandardBookingPdfResult | null> {
  const { supabase, invoiceId } = params

  const { data: invoice, error: invoiceErr } = await supabase
    .from('booking_invoices')
    .select('id, invoice_number, booking_id, customer_id, status, created_at, paid_at, payment_method, subtotal_cents, advance_applied_cents, stripe_amount_due_cents, total_paid_cents, rate_cents_per_hour, base_amount_cents, landing_subtotal_cents, vdo_reading')
    .eq('id', invoiceId)
    .single()

  if (invoiceErr || !invoice) {
    throw new Error(invoiceErr?.message ?? 'Booking invoice not found.')
  }

  if (invoice.status === 'waived') {
    return null
  }

  const [{ data: booking, error: bookingErr }, { data: profile, error: profileErr }, { data: landingCharges, error: landingErr }] = await Promise.all([
    supabase
      .from('bookings')
      .select('booking_reference, booking_owner_user_id')
      .eq('id', invoice.booking_id)
      .single(),
    supabase
      .from('profiles')
      .select('full_name, first_name, last_name, phone_country_code, phone_number, email')
      .eq('id', invoice.customer_id)
      .single(),
    supabase
      .from('booking_landing_charges')
      .select('landing_count, unit_amount_cents, total_amount_cents, airports(icao_code, name)')
      .eq('booking_invoice_id', invoice.id)
      .order('created_at', { ascending: true }),
  ])

  if (bookingErr || !booking) {
    throw new Error(bookingErr?.message ?? 'Booking not found for invoice PDF generation.')
  }
  if (profileErr) {
    throw new Error(profileErr.message ?? 'Failed to load customer profile for invoice PDF generation.')
  }
  if (landingErr) {
    throw new Error(landingErr.message ?? 'Failed to load landing charges for invoice PDF generation.')
  }

  const resolvedPaymentMethod = invoice.payment_method ?? (
    invoice.status === 'paid'
      ? (await supabase
          .from('customer_payment_ledger')
          .select('payment_method')
          .eq('invoice_id', invoice.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()).data?.payment_method ?? null
      : null
  )

  const grossTotal = roundToCents(invoice.subtotal_cents / 100)
  const subtotal = roundToCents(grossTotal / 1.1)
  const gstAmount = roundToCents(grossTotal - subtotal)
  const amountPaid = roundToCents((invoice.total_paid_cents ?? 0) / 100)
  const advanceAppliedAmount = invoice.advance_applied_cents > 0
    ? roundToCents(invoice.advance_applied_cents / 100)
    : undefined
  const documentKind = invoice.status === 'paid' ? 'receipt' : 'tax_invoice'
  const statusLabel = invoice.status === 'paid'
    ? 'PAID'
    : invoice.status === 'payment_required'
      ? 'PAYMENT REQUIRED'
      : String(invoice.status).toUpperCase()
  const billingModeLabel = 'Standard Booking'
  const bookingRefLabel = booking.booking_reference ? `Booking: ${booking.booking_reference}` : null
  const billToName = getFullName(profile ?? null)
  const billToEmail = profile?.email ?? '—'
  const billToPhone = getPhoneDisplay(profile ?? null)
  const vdoQuantity = invoice.vdo_reading ?? (invoice.rate_cents_per_hour > 0
    ? roundToCents((invoice.base_amount_cents / invoice.rate_cents_per_hour) * 10) / 10
    : 0)

  const lineItems = [
    {
      description: `Standard booking flight hours${booking.booking_reference ? ` — ${booking.booking_reference}` : ''}`,
      quantity: vdoQuantity,
      unitPrice: roundToCents(invoice.rate_cents_per_hour / 100),
      amount: roundToCents(invoice.base_amount_cents / 100),
    },
    ...(landingCharges ?? []).map((charge: {
      landing_count: number
      unit_amount_cents: number
      total_amount_cents: number
      airports?: { icao_code?: string | null; name?: string | null } | { icao_code?: string | null; name?: string | null }[] | null
    }, index: number) => {
      const airport = Array.isArray(charge.airports) ? charge.airports[0] : charge.airports
      return {
        description: `Landing Fee — ${getAirportLabel(airport ?? null, index)}`,
        quantity: Number(charge.landing_count),
        unitPrice: roundToCents(charge.unit_amount_cents / 100),
        amount: roundToCents(charge.total_amount_cents / 100),
      }
    }),
  ]

  const pdfBuffer = await generateInvoicePdf({
    documentKind,
    invoiceNumber: invoice.invoice_number,
    statusLabel,
    createdAt: invoice.created_at,
    dueAt: invoice.status === 'paid' ? invoice.paid_at ?? invoice.created_at : invoice.created_at,
    paidAt: invoice.paid_at,
    paymentMethodLabel: formatPaymentMethodLabel(resolvedPaymentMethod),
    billingModeLabel,
    bookingRefLabel,
    billToName,
    billToEmail,
    billToPhone,
    lineItems,
    subtotal,
    gstAmount,
    total: grossTotal,
    footerNote: invoice.status === 'paid'
      ? 'This receipt confirms payment for your standard booking invoice. All prices include GST.'
      : 'All prices include GST. Payment is required by the due date shown above.',
    creditAppliedAmount: advanceAppliedAmount,
    amountPaid,
  })

  return storeInvoicePdf({
    supabase,
    table: 'booking_invoices',
    rowId: invoice.id,
    userId: booking.booking_owner_user_id,
    invoiceNumber: invoice.invoice_number,
    pdfBuffer,
  })
}
