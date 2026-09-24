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
  if (paymentMethod === 'card' || paymentMethod === 'stripe') return 'Card (online)'
  if (paymentMethod === 'cash') return 'Cash'
  if (paymentMethod === 'card_in_person') return 'Card (in person)'
  if (paymentMethod === 'account_credit') return 'Account credit'
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
    .select('id, invoice_number, booking_id, customer_id, status, created_at, paid_at, payment_method, subtotal_cents, advance_applied_cents, stripe_amount_due_cents, total_paid_cents, rate_cents_per_hour, base_amount_cents, landing_subtotal_cents, vdo_reading, online_payment_surcharge_cents, stripe_gross_amount_cents, stripe_payment_intent_id, admin_notes')
    .eq('id', invoiceId)
    .single()

  const [
    { data: booking, error: bookingErr },
    { data: profile, error: profileErr },
    { data: landingCharges, error: landingErr },
    { data: flightLog },
    { data: flightRecordRow },
    { data: bankSub },
    { data: btUsage },
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('booking_reference, booking_owner_user_id, scheduled_start, aircraft(registration, display_name, aircraft_type, default_hourly_rate)')
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
      .or(`booking_invoice_id.eq.${invoice.id},booking_id.eq.${invoice.booking_id}`)
      .order('created_at', { ascending: true }),
    supabase
      .from('aircraft_flight_logs')
      .select('vdo_start, vdo_stop, vdo_total, tacho_start, tacho_stop, tacho_total, air_switch_start, air_switch_stop, air_switch_total, flight_time_hours, landings')
      .eq('related_booking_id', invoice.booking_id)
      .maybeSingle(),
    supabase
      .from('flight_records')
      .select('vdo_start, vdo_stop, vdo_total, tacho_start, tacho_stop, tacho_total, air_switch_start, air_switch_stop, air_switch_total, landings')
      .eq('booking_id', invoice.booking_id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('booking_bank_transfer_submissions')
      .select('id, reference, submitted_at, status')
      .or(`invoice_id.eq.${invoice.id},booking_id.eq.${invoice.booking_id}`)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('pilot_block_time_usage')
      .select('hours_deducted, overflow_hours, overflow_amount, hours_before, hours_after, purchase:pilot_block_time_purchases(hours_purchased, package:block_time_packages(name, hours))')
      .or(`booking_id.eq.${invoice.booking_id},invoice_id.eq.${invoice.id}`)
      .order('deducted_at', { ascending: false })
      .limit(1)
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

  let resolvedLandingCharges = landingCharges ?? []
  if (resolvedLandingCharges.length === 0) {
    const { data: flightRec } = await supabase
      .from('flight_records')
      .select('id, flight_record_landings(landing_count, airports(icao_code, name, default_landing_fee_cents))')
      .eq('booking_id', invoice.booking_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (flightRec?.flight_record_landings) {
      resolvedLandingCharges = (flightRec.flight_record_landings as any[]).map((row: any) => {
        const airport = Array.isArray(row.airports) ? row.airports[0] : row.airports
        const unitAmountCents = airport?.default_landing_fee_cents ?? 2895
        const count = Number(row.landing_count) || 0
        return {
          landing_count: count,
          unit_amount_cents: unitAmountCents,
          total_amount_cents: count * unitAmountCents,
          airports: airport,
        }
      }).filter((r: any) => r.landing_count > 0)
    }
  }

  const isPaid = invoice.status === 'paid'
  const isWaived = invoice.status === 'waived'

  const rawAircraft = booking.aircraft
  const aircraftObj = Array.isArray(rawAircraft) ? rawAircraft[0] : rawAircraft
  const aircraftReg = (aircraftObj as { registration?: string; display_name?: string; aircraft_type?: string } | null)?.registration || 'VH-KZG'
  const rawModel = (aircraftObj as { registration?: string; display_name?: string; aircraft_type?: string } | null)?.aircraft_type ||
                   (aircraftObj as { registration?: string; display_name?: string; aircraft_type?: string } | null)?.display_name ||
                   'Cessna 172N'
  const aircraftModel = cleanAircraftModel(rawModel, aircraftReg)
  const aircraftDefaultRate = Number((aircraftObj as any)?.default_hourly_rate ?? 330)

  let resolvedPaymentMethod = invoice.payment_method
  if (!resolvedPaymentMethod || resolvedPaymentMethod === 'card') {
    if (invoice.stripe_payment_intent_id?.startsWith('manual-cash-')) {
      resolvedPaymentMethod = 'cash'
    } else if (invoice.stripe_payment_intent_id?.startsWith('manual-card_in_person-')) {
      resolvedPaymentMethod = 'card_in_person'
    } else if (invoice.stripe_payment_intent_id?.startsWith('manual-bank_transfer-')) {
      resolvedPaymentMethod = 'bank_transfer'
    } else if (isPaid) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const adminSupabase = createAdminClient()
      const ledgerRow = (await adminSupabase
        .from('customer_payment_ledger')
        .select('payment_method')
        .eq('invoice_id', invoice.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()).data
      if (ledgerRow?.payment_method) {
        resolvedPaymentMethod = ledgerRow.payment_method
      } else if (invoice.advance_applied_cents >= invoice.subtotal_cents) {
        resolvedPaymentMethod = 'account_credit'
      } else if (invoice.stripe_payment_intent_id && !invoice.stripe_payment_intent_id.startsWith('manual-')) {
        resolvedPaymentMethod = 'card'
      }
    }
  }

  const advanceAppliedAmount = invoice.advance_applied_cents > 0
    ? roundToCents(invoice.advance_applied_cents / 100)
    : undefined
  const documentKind = isPaid ? 'receipt' : 'tax_invoice'
  const isVerificationRequired =
    invoice.status === 'payment_verification_required' ||
    invoice.status === 'bank_transfer_pending_review'
  const statusLabel = isPaid
    ? 'PAID'
    : isWaived
      ? 'WAIVED'
      : isVerificationRequired
        ? 'PAYMENT VERIFICATION REQUIRED'
        : invoice.status === 'payment_required'
          ? 'PAYMENT REQUIRED'
          : String(invoice.status).toUpperCase()
  let blockTimeSnapshot: {
    package_id?: string
    package_name?: string
    hours_purchased?: number
    hours_before?: number
    hours_deducted?: number
    hours_remaining?: number
    overage_hours?: number
    overage_amount_cents?: number
  } | null = null

  if (invoice.admin_notes) {
    try {
      const parsed = JSON.parse(invoice.admin_notes)
      if (parsed?.block_time) {
        blockTimeSnapshot = parsed.block_time
      }
    } catch {
      // Not JSON, plain text admin notes
    }
  }

  let packageHoursPurchased = Number(blockTimeSnapshot?.hours_purchased ?? 0)

  if (!blockTimeSnapshot && btUsage) {
    const rawPurchase = btUsage.purchase as any
    const rawPkg = Array.isArray(rawPurchase?.package) ? rawPurchase?.package[0] : rawPurchase?.package
    const pkgName = rawPkg?.name || 'Block Time Package'
    packageHoursPurchased = Number(rawPurchase?.hours_purchased || rawPkg?.hours || 0)
    blockTimeSnapshot = {
      package_name: pkgName,
      hours_purchased: packageHoursPurchased,
      hours_before: Number(btUsage.hours_before ?? 0),
      hours_deducted: Number(btUsage.hours_deducted ?? 0),
      hours_remaining: Number(btUsage.hours_after ?? 0),
      overage_hours: Number(btUsage.overflow_hours ?? 0),
      overage_amount_cents: Math.round(Number(btUsage.overflow_amount ?? 0) * 100),
    }
  }

  if (packageHoursPurchased <= 0 && btUsage?.purchase) {
    const rawPurchase = btUsage.purchase as any
    const rawPkg = Array.isArray(rawPurchase?.package) ? rawPurchase?.package[0] : rawPurchase?.package
    packageHoursPurchased = Number(rawPurchase?.hours_purchased || rawPkg?.hours || 0)
  }

  if (packageHoursPurchased <= 0 && blockTimeSnapshot?.package_id) {
    const { data: pRow } = await supabase
      .from('pilot_block_time_purchases')
      .select('hours_purchased, package:block_time_packages(name, hours)')
      .eq('id', blockTimeSnapshot.package_id)
      .maybeSingle()
    if (pRow) {
      const pPkg = Array.isArray(pRow.package) ? pRow.package[0] : pRow.package
      packageHoursPurchased = Number(pRow.hours_purchased || pPkg?.hours || 0)
    }
  }

  if (packageHoursPurchased <= 0 && invoice.customer_id) {
    const { data: pRow } = await supabase
      .from('pilot_block_time_purchases')
      .select('hours_purchased, package:block_time_packages(name, hours)')
      .eq('user_id', invoice.customer_id)
      .order('activated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (pRow) {
      const pPkg = Array.isArray(pRow.package) ? pRow.package[0] : pRow.package
      packageHoursPurchased = Number(pRow.hours_purchased || pPkg?.hours || 0)
    }
  }

  if (packageHoursPurchased <= 0 && blockTimeSnapshot?.package_name) {
    const match = blockTimeSnapshot.package_name.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)/i)
    if (match) {
      packageHoursPurchased = Number(match[1])
    }
  }

  const isBlockTimeBooking = Boolean(
    (blockTimeSnapshot && (Number(blockTimeSnapshot.hours_deducted) > 0 || blockTimeSnapshot.package_id)) ||
    btUsage
  )
  const billingModeLabel = isBlockTimeBooking
    ? (packageHoursPurchased > 0 ? `Block Time Package Rental (${packageHoursPurchased}hr)` : 'Block Time Package Rental')
    : 'Standard Aircraft Rental'
  const bookingRefLabel = booking.booking_reference ? `Booking Ref: ${booking.booking_reference}` : null
  const billToName = getFullName(profile ?? null)
  const billToEmail = profile?.email ?? '—'
  const billToPhone = getPhoneDisplay(profile ?? null)

  const vdoStart = flightLog?.vdo_start != null
    ? Number(flightLog.vdo_start)
    : flightRecordRow?.vdo_start != null
    ? Number(flightRecordRow.vdo_start)
    : null

  const vdoEnd = flightLog?.vdo_stop != null
    ? Number(flightLog.vdo_stop)
    : flightRecordRow?.vdo_stop != null
    ? Number(flightRecordRow.vdo_stop)
    : null

  const computedVdoFromMeters = (vdoStart != null && vdoEnd != null && vdoEnd >= vdoStart)
    ? roundToCents(vdoEnd - vdoStart)
    : null

  const vdoQuantity = (invoice.vdo_reading != null && Number(invoice.vdo_reading) > 0)
    ? Number(invoice.vdo_reading)
    : (blockTimeSnapshot && Number(blockTimeSnapshot.hours_deducted) > 0)
    ? Number(blockTimeSnapshot.hours_deducted)
    : computedVdoFromMeters != null && computedVdoFromMeters > 0
    ? computedVdoFromMeters
    : (flightRecordRow?.vdo_total != null && Number(flightRecordRow.vdo_total) > 0)
    ? Number(flightRecordRow.vdo_total)
    : (flightLog?.vdo_total != null && Number(flightLog.vdo_total) > 0)
    ? Number(flightLog.vdo_total)
    : (invoice.rate_cents_per_hour > 0 && invoice.base_amount_cents > 0
    ? roundToCents((invoice.base_amount_cents / invoice.rate_cents_per_hour) * 10) / 10
    : 0)

  const airswitchStart = flightLog?.air_switch_start != null
    ? Number(flightLog.air_switch_start)
    : flightRecordRow?.air_switch_start != null
    ? Number(flightRecordRow.air_switch_start)
    : null

  const airswitchEnd = flightLog?.air_switch_stop != null
    ? Number(flightLog.air_switch_stop)
    : flightRecordRow?.air_switch_stop != null
    ? Number(flightRecordRow.air_switch_stop)
    : null

  const airswitchHours = flightLog?.air_switch_total != null
    ? Number(flightLog.air_switch_total)
    : flightRecordRow?.air_switch_total != null
    ? Number(flightRecordRow.air_switch_total)
    : airswitchStart != null && airswitchEnd != null && airswitchEnd >= airswitchStart
    ? roundToCents(airswitchEnd - airswitchStart)
    : null

  const tachStart = flightLog?.tacho_start != null
    ? Number(flightLog.tacho_start)
    : flightRecordRow?.tacho_start != null
    ? Number(flightRecordRow.tacho_start)
    : null

  const tachEnd = flightLog?.tacho_stop != null
    ? Number(flightLog.tacho_stop)
    : flightRecordRow?.tacho_stop != null
    ? Number(flightRecordRow.tacho_stop)
    : null

  const tachHours = flightLog?.tacho_total != null
    ? Number(flightLog.tacho_total)
    : flightRecordRow?.tacho_total != null
    ? Number(flightRecordRow.tacho_total)
    : tachStart != null && tachEnd != null && tachEnd >= tachStart
    ? roundToCents(tachEnd - tachStart)
    : null

  let totalLandingsCount = 0
  for (const charge of resolvedLandingCharges) {
    totalLandingsCount += Number(charge.landing_count || 1)
  }

  const rawPkgName = blockTimeSnapshot?.package_name || 'Starter Block'
  let displayPkgName = rawPkgName
  if (packageHoursPurchased > 0 && !displayPkgName.toLowerCase().includes('hr')) {
    displayPkgName = `${displayPkgName} (${packageHoursPurchased}hr package)`
  }

  const lineItems: Array<{
    description: string
    quantity: number
    unitPrice: number
    amount: number
  }> = []

  if (isBlockTimeBooking && blockTimeSnapshot) {
    const deducted = Number(blockTimeSnapshot.hours_deducted) > 0
      ? Number(blockTimeSnapshot.hours_deducted)
      : vdoQuantity > 0 ? vdoQuantity : 0
    const remaining = Number(blockTimeSnapshot.hours_remaining ?? 0)
    const overage = Number(blockTimeSnapshot.overage_hours ?? 0)
    const overageCents = Number(blockTimeSnapshot.overage_amount_cents ?? 0)

    lineItems.push({
      description: `Block Time Drawdown — ${displayPkgName} (${deducted.toFixed(1)}h deducted · Balance: ${remaining.toFixed(1)}h remaining)`,
      quantity: deducted,
      unitPrice: 0,
      amount: 0,
    })

    if (overage > 0) {
      const overageRate = (overageCents > 0 && overage > 0)
        ? roundToCents(overageCents / (overage * 100))
        : (aircraftDefaultRate >= 290 ? aircraftDefaultRate : 330)
      lineItems.push({
        description: `Block Time Overage (${overage.toFixed(1)}h × $${overageRate.toFixed(2)}/hr)`,
        quantity: overage,
        unitPrice: overageRate,
        amount: roundToCents(overageCents / 100) || roundToCents(overage * overageRate),
      })
    }
  } else {
    lineItems.push({
      description: `Flight Rental Hours — ${aircraftReg} (${aircraftModel})`,
      quantity: vdoQuantity,
      unitPrice: roundToCents(invoice.rate_cents_per_hour / 100),
      amount: roundToCents(invoice.base_amount_cents / 100),
    })
  }

  for (let index = 0; index < resolvedLandingCharges.length; index++) {
    const charge = resolvedLandingCharges[index]
    const airport = Array.isArray(charge.airports) ? charge.airports[0] : charge.airports
    lineItems.push({
      description: `Landing Fee — ${getAirportLabel(airport ?? null, index)}`,
      quantity: Number(charge.landing_count),
      unitPrice: roundToCents(charge.unit_amount_cents / 100),
      amount: roundToCents(charge.total_amount_cents / 100),
    })
  }

  // Check if customer made a stripe payment (ledger or invoice)
  const { data: stripeLedger } = await supabase
    .from('customer_payment_ledger')
    .select('amount_cents, payment_method, entry_type')
    .or(`invoice_id.eq.${invoice.id},booking_id.eq.${invoice.booking_id}`)
    .in('entry_type', ['stripe_payment', 'stripe_charge'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const hasBankTransfer = Boolean(bankSub)
  const hasStripePayment = Boolean(
    stripeLedger ||
    (invoice.stripe_payment_intent_id && !invoice.stripe_payment_intent_id.startsWith('manual-')) ||
    (invoice.payment_method === 'card' || invoice.payment_method === 'stripe' || invoice.payment_method === 'stripe_card')
  )
  const isSplitPayment = hasBankTransfer && hasStripePayment && Boolean(stripeLedger) && Boolean(bankSub)

  // Online Card Payment Surcharge (if paid online via Stripe or surcharge applied)
  const isOnlinePayment =
    !hasBankTransfer &&
    (invoice.payment_method === 'stripe' ||
      invoice.payment_method === 'card' ||
      invoice.payment_method === 'stripe_card' ||
      (Boolean(invoice.stripe_payment_intent_id) && !invoice.stripe_payment_intent_id?.startsWith('manual-')) ||
      Boolean(invoice.stripe_checkout_session_id) ||
      Boolean(stripeLedger))

  let surchargeCents = Number(invoice.online_payment_surcharge_cents || 0)
  if (surchargeCents <= 0) {
    if (stripeLedger?.amount_cents && stripeLedger.amount_cents > invoice.subtotal_cents) {
      surchargeCents = stripeLedger.amount_cents - invoice.subtotal_cents
    } else if (invoice.stripe_gross_amount_cents && invoice.stripe_gross_amount_cents > invoice.subtotal_cents) {
      surchargeCents = invoice.stripe_gross_amount_cents - invoice.subtotal_cents
    } else if (isPaid && invoice.total_paid_cents > invoice.subtotal_cents) {
      surchargeCents = invoice.total_paid_cents - invoice.subtotal_cents
    } else if (isOnlinePayment && invoice.subtotal_cents > 0) {
      surchargeCents = Math.round(invoice.subtotal_cents * 0.0175 + 30)
    }
  }

  const surchargeDollars = roundToCents(surchargeCents / 100)
  if (surchargeDollars > 0 && isOnlinePayment) {
    lineItems.push({
      description: 'Online Payment Surcharge (Card 1.7% + 30¢)',
      quantity: 1,
      unitPrice: surchargeDollars,
      amount: surchargeDollars,
    })
  }

  const itemsTotal = roundToCents(lineItems.reduce((sum, item) => sum + item.amount, 0))
  const originalBaseTotal = roundToCents(invoice.subtotal_cents / 100)
  const displayTotal = isWaived ? originalBaseTotal : itemsTotal
  const subtotal = roundToCents(displayTotal / 1.1)
  const gstAmount = roundToCents(displayTotal - subtotal)
  const amountPaid = isPaid ? displayTotal : 0

  let splitBankAmount = 0
  let splitCardAmount = 0

  if (isSplitPayment) {
    const cardSurcharge = Number(invoice.online_payment_surcharge_cents || 0)
    const netCardAmount = (invoice.total_paid_cents && invoice.total_paid_cents > 0 && !hasBankTransfer)
      ? invoice.total_paid_cents
      : Math.max(0, (stripeLedger?.amount_cents || 0) - cardSurcharge)
    splitCardAmount = roundToCents(netCardAmount / 100)
    const invTotal = roundToCents(invoice.subtotal_cents / 100)
    splitBankAmount = roundToCents(Math.max(0, invTotal - splitCardAmount))
  }

  const resolvedMethodLabel = isWaived
    ? 'Waived (No payment required)'
    : isSplitPayment
    ? `Split: Bank Transfer ($${splitBankAmount.toFixed(2)}) + Card Online ($${splitCardAmount.toFixed(2)})`
    : isBlockTimeBooking && (invoice.subtotal_cents === 0 || resolvedPaymentMethod === 'account_credit' || resolvedPaymentMethod === 'credit_or_block_time')
    ? `Block Time Package (${displayPkgName || 'Active Package'})`
    : resolvedPaymentMethod === 'bank_transfer' || invoice.payment_method === 'bank_transfer'
    ? 'Direct Deposit (Bank Transfer)'
    : resolvedPaymentMethod === 'card' || invoice.payment_method === 'stripe' || invoice.payment_method === 'stripe_card'
    ? 'Card (Online)'
    : resolvedPaymentMethod === 'account_credit'
    ? 'Account Credit / Block Time'
    : formatPaymentMethodLabel(resolvedPaymentMethod || invoice.payment_method) || (isPaid ? 'Card (Online)' : '—')

  const footerNote = isPaid
    ? isSplitPayment
      ? `This receipt confirms full payment for your aircraft rental booking ($${splitBankAmount.toFixed(2)} via Direct Bank Transfer and $${splitCardAmount.toFixed(2)} via Stripe Online Card). All prices include GST.`
      : isBlockTimeBooking
      ? (blockTimeSnapshot?.overage_hours && blockTimeSnapshot.overage_hours > 0
          ? `This receipt confirms flight hours deducted from your block time package (${displayPkgName}) and payment settled for flight overage hours and charges. All prices include GST.`
          : `This receipt confirms flight hours deducted from your block time package (${displayPkgName}). All prices include GST.`)
      : 'This receipt confirms full payment for your aircraft rental booking. All prices include GST.'
    : isWaived
      ? 'This invoice has been waived by operations management. No payment is required.'
      : isVerificationRequired
      ? isSplitPayment
        ? `Payment received via Split Payment: $${splitBankAmount.toFixed(2)} via Direct Bank Transfer and $${splitCardAmount.toFixed(2)} via Stripe Online Card. Under operations review and verification. All prices include GST.`
        : isBlockTimeBooking
        ? (blockTimeSnapshot?.overage_hours && blockTimeSnapshot.overage_hours > 0
            ? `Flight record received. Hours deducted from block time package (${displayPkgName}). Payment verification required for overage hours and charges. All prices include GST.`
            : `Flight record received. Hours deducted from block time package (${displayPkgName}). Payment verification under operations review. All prices include GST.`)
        : 'Payment proof received. This invoice is under operations review and verification. All prices include GST.'
      : isSplitPayment
      ? `Split Payment: $${splitBankAmount.toFixed(2)} via Direct Bank Transfer and $${splitCardAmount.toFixed(2)} via Stripe Online Card. All prices include GST.`
      : 'All prices include GST. Payment is required by the due date shown above.'

  const pdfBuffer = await generateInvoicePdf({
    documentKind,
    invoiceNumber: invoice.invoice_number,
    statusLabel,
    createdAt: invoice.created_at,
    dueAt: isPaid ? invoice.paid_at ?? invoice.created_at : invoice.created_at,
    paidAt: isPaid ? invoice.paid_at ?? invoice.created_at : null,
    paymentMethodLabel: resolvedMethodLabel,
    billingModeLabel,
    bookingRefLabel,
    flightDate: booking.scheduled_start ?? null,
    billToName,
    billToEmail,
    billToPhone,
    lineItems,
    subtotal,
    gstAmount,
    total: displayTotal,
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
      landingsCount: totalLandingsCount || flightLog?.landings || (landingCharges?.length ? landingCharges.length : null),
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
