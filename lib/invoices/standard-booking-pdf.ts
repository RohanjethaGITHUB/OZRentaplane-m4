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

function cleanAircraftModel(model: string | null | undefined, reg: string): string {
  if (!model) return 'Cessna 172N'
  let cleaned = model.replace(new RegExp(`^${reg}\\s*[·—\\-–]?\\s*`, 'i'), '').trim()
  if (cleaned.toLowerCase() === 'cessna 172') {
    cleaned = 'Cessna 172N'
  }
  return cleaned || 'Cessna 172N'
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

  const [
    { data: booking, error: bookingErr },
    { data: profile, error: profileErr },
    { data: landingCharges, error: landingErr },
    { data: flightLog },
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('booking_reference, booking_owner_user_id, scheduled_start, aircraft(registration, display_name, aircraft_type)')
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
    supabase
      .from('aircraft_flight_logs')
      .select('vdo_start, vdo_stop, vdo_total, tacho_start, tacho_stop, tacho_total, air_switch_start, air_switch_stop, air_switch_total, flight_time_hours, landings')
      .eq('related_booking_id', invoice.booking_id)
      .maybeSingle(),
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

  const rawAircraft = booking.aircraft
  const aircraftObj = Array.isArray(rawAircraft) ? rawAircraft[0] : rawAircraft
  const aircraftReg = (aircraftObj as { registration?: string; display_name?: string; aircraft_type?: string } | null)?.registration || 'VH-KZG'
  const rawModel = (aircraftObj as { registration?: string; display_name?: string; aircraft_type?: string } | null)?.aircraft_type ||
                   (aircraftObj as { registration?: string; display_name?: string; aircraft_type?: string } | null)?.display_name ||
                   'Cessna 172N'
  const aircraftModel = cleanAircraftModel(rawModel, aircraftReg)

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
  const isWaived = invoice.status === 'waived'
  const amountPaid = isWaived ? 0 : roundToCents((invoice.total_paid_cents ?? 0) / 100)
  const advanceAppliedAmount = invoice.advance_applied_cents > 0
    ? roundToCents(invoice.advance_applied_cents / 100)
    : undefined
  const documentKind = invoice.status === 'paid' ? 'receipt' : 'tax_invoice'
  const statusLabel = invoice.status === 'paid'
    ? 'PAID'
    : isWaived
      ? 'WAIVED'
      : invoice.status === 'payment_required'
        ? 'PAYMENT REQUIRED'
        : String(invoice.status).toUpperCase()
  const billingModeLabel = 'Standard Aircraft Rental'
  const bookingRefLabel = booking.booking_reference ? `Booking Ref: ${booking.booking_reference}` : null
  const billToName = getFullName(profile ?? null)
  const billToEmail = profile?.email ?? '—'
  const billToPhone = getPhoneDisplay(profile ?? null)
  const vdoQuantity = invoice.vdo_reading ?? (invoice.rate_cents_per_hour > 0
    ? roundToCents((invoice.base_amount_cents / invoice.rate_cents_per_hour) * 10) / 10
    : 0)

  const vdoStart = flightLog?.vdo_start != null ? Number(flightLog.vdo_start) : null
  const vdoEnd = flightLog?.vdo_stop != null ? Number(flightLog.vdo_stop) : null
  const airswitchStart = flightLog?.air_switch_start != null ? Number(flightLog.air_switch_start) : null
  const airswitchEnd = flightLog?.air_switch_stop != null ? Number(flightLog.air_switch_stop) : null
  const airswitchHours = flightLog?.air_switch_total != null
    ? Number(flightLog.air_switch_total)
    : airswitchStart != null && airswitchEnd != null && airswitchEnd >= airswitchStart
    ? roundToCents(airswitchEnd - airswitchStart)
    : null

  const tachStart = flightLog?.tacho_start != null ? Number(flightLog.tacho_start) : null
  const tachEnd = flightLog?.tacho_stop != null ? Number(flightLog.tacho_stop) : null
  const tachHours = flightLog?.tacho_total != null
    ? Number(flightLog.tacho_total)
    : tachStart != null && tachEnd != null && tachEnd >= tachStart
    ? roundToCents(tachEnd - tachStart)
    : null

  let totalLandingsCount = 0
  for (const charge of landingCharges ?? []) {
    totalLandingsCount += Number(charge.landing_count || 1)
  }

  const vdoSuffix = vdoStart != null && vdoEnd != null ? ` (VDO ${vdoStart.toFixed(1)} → ${vdoEnd.toFixed(1)})` : ''
  const lineItems = [
    {
      description: `Flight Rental Hours — ${aircraftReg} (${aircraftModel})${vdoSuffix}`,
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

  const footerNote = invoice.status === 'paid'
    ? 'This receipt confirms full payment for your aircraft rental booking. All prices include GST.'
    : isWaived
      ? 'This invoice has been waived by operations management. No payment is required.'
      : 'All prices include GST. Payment is required by the due date shown above.'

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
    flightDate: booking.scheduled_start ?? null,
    billToName,
    billToEmail,
    billToPhone,
    lineItems,
    subtotal,
    gstAmount,
    total: grossTotal,
    footerNote,
    creditAppliedAmount: advanceAppliedAmount,
    amountPaid,
    flightMetrics: {
      aircraftRegistration: aircraftReg,
      aircraftModel,
      vdoStart,
      vdoEnd,
      vdoHours: vdoQuantity,
      airswitchStart,
      airswitchEnd,
      airswitchHours,
      tachStart,
      tachEnd,
      tachHours,
      landingsCount: totalLandingsCount || flightLog?.landings || null,
    },
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
