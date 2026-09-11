import 'server-only'

import { generateInvoicePdf, type InvoiceLineItem, type FlightMeterDetails } from './pdf'
import { storeInvoicePdf } from './pdf-storage'

type CheckoutBookingPdfResult = Awaited<ReturnType<typeof storeInvoicePdf>>

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100
}

function formatPaymentMethod(method: string | null): string | null {
  if (!method) return null
  if (method === 'bank_transfer') return 'Bank transfer'
  if (method === 'stripe' || method === 'card') return 'Card (online)'
  if (method === 'cash') return 'Cash'
  if (method === 'card_in_person') return 'Card (in person)'
  if (method === 'account_credit') return 'Account credit'
  return method.replace(/_/g, ' ')
}

function cleanAircraftModel(model: string | null | undefined, reg: string): string {
  if (!model) return 'Cessna 172N'
  let cleaned = model.replace(new RegExp(`^${reg}\\s*[·—\\-–]?\\s*`, 'i'), '').trim()
  if (cleaned.toLowerCase() === 'cessna 172') {
    cleaned = 'Cessna 172N'
  }
  return cleaned || 'Cessna 172N'
}

export async function generateCheckoutBookingInvoicePdf(params: {
  supabase: any
  bookingId: string
  invoiceId?: string | null
}): Promise<CheckoutBookingPdfResult | null> {
  const { supabase, bookingId, invoiceId } = params

  // 1. Fetch booking
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, booking_owner_user_id, booking_type, scheduled_start, booking_reference, aircraft ( registration, display_name, aircraft_type )')
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingErr || !booking) {
    throw new Error(bookingErr?.message ?? 'Booking not found for checkout invoice PDF generation.')
  }

  // 2. Fetch checkout invoice
  const invQuery = supabase
    .from('checkout_invoices')
    .select(`
      id,
      status,
      invoice_number,
      subtotal_cents,
      total_paid_cents,
      advance_applied_cents,
      stripe_amount_due_cents,
      online_payment_surcharge_cents,
      stripe_gross_amount_cents,
      checkout_duration_hours,
      checkout_rate_cents_per_hour,
      checkout_calculated_amount_cents,
      checkout_landing_subtotal_cents,
      checkout_final_amount_cents,
      vdo_reading,
      vdo_start_reading,
      vdo_end_reading,
      payment_method,
      created_at,
      paid_at,
      customer_id,
      waiver_reason
    `)

  if (invoiceId) {
    invQuery.eq('id', invoiceId)
  } else {
    invQuery.eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(1)
  }

  const { data: chkInvoice, error: invErr } = await invQuery.maybeSingle()
  if (invErr || !chkInvoice) {
    throw new Error(invErr?.message ?? 'Checkout invoice not found for PDF generation.')
  }

  // 3. Parallel queries: Customer profile, landing charges, flight logs
  const custId = chkInvoice.customer_id ?? booking.booking_owner_user_id
  const [
    { data: custProfile },
    { data: landingCharges },
    { data: flightLog },
  ] = await Promise.all([
    custId
      ? supabase.from('profiles').select('full_name, first_name, last_name, email, phone_country_code, phone_number').eq('id', custId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('checkout_landing_charges')
      .select('landing_count, unit_amount_cents, total_amount_cents, airports(icao_code, name)')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true }),
    supabase
      .from('aircraft_flight_logs')
      .select('vdo_start, vdo_stop, vdo_total, tacho_start, tacho_stop, tacho_total, air_switch_start, air_switch_stop, air_switch_total, flight_time_hours, landings')
      .eq('related_booking_id', bookingId)
      .maybeSingle(),
  ])

  const billToName =
    custProfile?.full_name?.trim() ||
    [custProfile?.first_name, custProfile?.last_name].filter(Boolean).join(' ') ||
    'Pilot'

  const billToEmail = custProfile?.email ?? '—'
  const billToPhone = custProfile?.phone_number
    ? [custProfile.phone_country_code, custProfile.phone_number].filter(Boolean).join(' ')
    : null

  const isPaid = chkInvoice.status === 'paid'
  const isWaived = chkInvoice.status === 'waived' || Boolean(chkInvoice.waiver_reason)
  const invoiceNumber = chkInvoice.invoice_number ?? `CHK-${chkInvoice.id.slice(0, 8).toUpperCase()}`

  const rawAircraft = booking.aircraft
  const aircraftObj = Array.isArray(rawAircraft) ? rawAircraft[0] : rawAircraft
  const aircraftReg = (aircraftObj as { display_name?: string; registration?: string; aircraft_type?: string } | null)?.registration || 'VH-KZG'
  const rawModel = (aircraftObj as { display_name?: string; registration?: string; aircraft_type?: string } | null)?.aircraft_type ||
                   (aircraftObj as { display_name?: string; registration?: string; aircraft_type?: string } | null)?.display_name ||
                   'Cessna 172N'
  const aircraftModel = cleanAircraftModel(rawModel, aircraftReg)

  const statusLabel = isPaid ? 'PAID' : isWaived ? 'WAIVED' : 'PAYMENT REQUIRED'
  const footerNote = isPaid
    ? 'This receipt confirms full payment for your checkout flight. All prices include GST.'
    : isWaived
    ? `This checkout invoice has been waived by operations management${chkInvoice.waiver_reason ? `: ${chkInvoice.waiver_reason}` : ''}. No payment is required.`
    : 'All prices include GST. Payment is required to complete your checkout certification.'

  // VDO and flight calculations
  const vdoStart = chkInvoice.vdo_start_reading != null
    ? Number(chkInvoice.vdo_start_reading)
    : flightLog?.vdo_start != null
    ? Number(flightLog.vdo_start)
    : null

  const vdoEnd = chkInvoice.vdo_end_reading != null
    ? Number(chkInvoice.vdo_end_reading)
    : flightLog?.vdo_stop != null
    ? Number(flightLog.vdo_stop)
    : null

  const vdoHours = Number(
    chkInvoice.vdo_reading ??
    chkInvoice.checkout_duration_hours ??
    flightLog?.vdo_total ??
    (vdoStart != null && vdoEnd != null && vdoEnd > vdoStart ? roundToCents(vdoEnd - vdoStart) : null) ??
    flightLog?.flight_time_hours ??
    1.0
  )

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

  // Rate and Flight Line Item
  const hourlyRate = chkInvoice.checkout_rate_cents_per_hour
    ? roundToCents(chkInvoice.checkout_rate_cents_per_hour / 100)
    : 290.00

  const baseFlightDollars = chkInvoice.checkout_calculated_amount_cents != null
    ? roundToCents(chkInvoice.checkout_calculated_amount_cents / 100)
    : roundToCents(vdoHours * hourlyRate)

  const lineItems: InvoiceLineItem[] = []

  if (baseFlightDollars > 0 || !isWaived) {
    const vdoSuffix = vdoStart != null && vdoEnd != null ? ` (VDO ${vdoStart.toFixed(1)} → ${vdoEnd.toFixed(1)})` : ''
    lineItems.push({
      description: `Checkout Flight Rental — ${aircraftReg} (${aircraftModel})${vdoSuffix}`,
      quantity: vdoHours,
      unitPrice: hourlyRate,
      amount: baseFlightDollars,
    })
  }

  // Sum landing charges
  let totalLandingsCount = 0

  for (const charge of landingCharges ?? []) {
    const rawAp = charge.airports
    const ap = Array.isArray(rawAp) ? rawAp[0] : rawAp
    const apName = ap?.name || 'Airport'
    const apCode = ap?.icao_code ? `${ap.icao_code} — ` : ''
    const count = Number(charge.landing_count || 1)
    const unit = Number(charge.unit_amount_cents || 2895) / 100
    const total = Number(charge.total_amount_cents || (unit * 100 * count)) / 100

    totalLandingsCount += count

    lineItems.push({
      description: `Landing Fee — ${apCode}${apName}`,
      quantity: count,
      unitPrice: unit,
      amount: total,
    })
  }

  // Online Card Payment Surcharge (if paid online via Stripe or surcharge applied)
  const isOnlinePayment = chkInvoice.payment_method === 'stripe' || chkInvoice.payment_method === 'card'
  const surchargeCents = Number(
    chkInvoice.online_payment_surcharge_cents ||
    (isPaid && isOnlinePayment && chkInvoice.total_paid_cents > chkInvoice.subtotal_cents
      ? chkInvoice.total_paid_cents - chkInvoice.subtotal_cents
      : 0)
  )

  const surchargeDollars = roundToCents(surchargeCents / 100)
  if (surchargeDollars > 0 && (isPaid || isOnlinePayment)) {
    lineItems.push({
      description: 'Online Payment Surcharge (Card 1.7% + 30¢)',
      quantity: 1,
      unitPrice: surchargeDollars,
      amount: surchargeDollars,
    })
  }

  if (lineItems.length === 0) {
    lineItems.push({
      description: `Checkout flight fee — ${aircraftReg} (${aircraftModel})`,
      quantity: 1,
      unitPrice: isWaived ? 0 : 290.00,
      amount: isWaived ? 0 : 290.00,
    })
  }

  const itemsTotal = roundToCents(lineItems.reduce((sum, item) => sum + item.amount, 0))
  const originalBaseTotal = Number(chkInvoice.subtotal_cents || 29000) / 100
  const displayTotal = isWaived ? originalBaseTotal : itemsTotal
  const subtotal = roundToCents(displayTotal / 1.1)
  const gstAmount = roundToCents(displayTotal - subtotal)
  const amountPaid = isPaid ? displayTotal : 0

  const flightMetrics: FlightMeterDetails = {
    aircraftRegistration: aircraftReg,
    aircraftModel,
    vdoStart,
    vdoEnd,
    vdoHours,
    airswitchStart,
    airswitchEnd,
    airswitchHours,
    tachStart,
    tachEnd,
    tachHours,
    landingsCount: totalLandingsCount || flightLog?.landings || null,
  }

  let resolvedPaymentMethod = chkInvoice.payment_method
  if (!resolvedPaymentMethod || resolvedPaymentMethod === 'stripe' || resolvedPaymentMethod === 'card') {
    if (chkInvoice.stripe_payment_intent_id?.startsWith('manual-cash-')) {
      resolvedPaymentMethod = 'cash'
    } else if (chkInvoice.stripe_payment_intent_id?.startsWith('manual-card_in_person-')) {
      resolvedPaymentMethod = 'card_in_person'
    } else if (chkInvoice.stripe_payment_intent_id?.startsWith('manual-bank_transfer-')) {
      resolvedPaymentMethod = 'bank_transfer'
    } else if (isPaid) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const adminSupabase = createAdminClient()
      const ledgerRow = (await adminSupabase
        .from('customer_payment_ledger')
        .select('payment_method')
        .eq('invoice_id', chkInvoice.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()).data
      if (ledgerRow?.payment_method) {
        resolvedPaymentMethod = ledgerRow.payment_method
      }
    }
  }

  const pdfBuffer = await generateInvoicePdf({
    documentKind: isPaid ? 'receipt' : 'tax_invoice',
    invoiceNumber,
    statusLabel,
    createdAt: chkInvoice.created_at ?? new Date().toISOString(),
    paidAt: chkInvoice.paid_at ?? null,
    dueAt: chkInvoice.created_at ?? null,
    paymentMethodLabel: isWaived ? 'Waived (No payment required)' : formatPaymentMethod(resolvedPaymentMethod),
    billingModeLabel: 'Checkout Flight Assessment',
    bookingRefLabel: booking.booking_reference ? `Booking Ref: ${booking.booking_reference}` : null,
    flightDate: booking.scheduled_start ?? null,
    billToName,
    billToEmail,
    billToPhone,
    lineItems,
    subtotal,
    gstAmount,
    total: displayTotal,
    amountPaid,
    creditAppliedAmount: Number(chkInvoice.advance_applied_cents || 0) / 100,
    footerNote,
    flightMetrics,
  })

  return storeInvoicePdf({
    supabase,
    table: 'checkout_invoices',
    rowId: chkInvoice.id,
    userId: booking.booking_owner_user_id,
    invoiceNumber,
    pdfBuffer,
  })
}
