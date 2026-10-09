import type {
  FlightDetailsData,
  FlightLandingItem,
  FlightBlockTimeDetails,
  FlightMultiDayMinimumDetails,
} from './flight-details-types'

export type BuildFlightDetailsInput = {
  booking: {
    id: string
    booking_reference?: string | null
    booking_type?: string | null
    scheduled_start?: string | null
    scheduled_end?: string | null
  }
  customer: {
    full_name?: string | null
    email?: string | null
    phone_number?: string | null
    phone_country_code?: string | null
    pilot_arn?: string | null
  } | null
  aircraft: {
    registration?: string | null
    aircraft_type?: string | null
    display_name?: string | null
    default_hourly_rate?: number | null
  } | null
  flightRecord: any | null
  bookingFlightLog: any | null
  standardInvoice: any | null
  blockTimeInvoices: any[] | null
  activeBlockTime?: {
    hoursRemaining: number
    ratePerHour: number
    expiresAt: string
    packageName?: string
  } | null
  checkoutInvoice: any | null
  standardLandings: any[] | null
  checkoutLandings: any[] | null
  evidenceAttachments?: {
    id: string
    fileName?: string
    file_name?: string
    signedUrl: string
    fileSize?: number | null
    file_size?: number | null
  }[]
  airports?: {
    id: string
    icao_code: string
    name: string
    default_landing_fee_cents: number
  }[] | null
  timeRangeLabel?: string | null
  receiptUrl?: string | null
  hasPendingBankTransferReview?: boolean
  isMultiDay?: boolean
  bookingAuditEvents?: any[] | null
  minimumVdoDecision?: 'enforce_minimum' | 'bill_actual' | null
}

function formatDateDisplay(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    return d.toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return null
  }
}

import { calculateBookingDays } from '@/lib/booking/standard-booking-billing'

function deriveFlightDates(
  scheduledStart: string | null | undefined,
  scheduledEnd: string | null | undefined,
  fallbackDateIso: string | null | undefined,
  explicitIsMultiDay?: boolean
): { flightDate: string | null; isMultiDay: boolean; daysCount: number } {
  if (!scheduledStart) {
    return {
      flightDate: formatDateDisplay(fallbackDateIso),
      isMultiDay: false,
      daysCount: 1,
    }
  }

  const startStr = formatDateDisplay(scheduledStart)
  if (!scheduledEnd) {
    return { flightDate: startStr, isMultiDay: false, daysCount: 1 }
  }

  const endStr = formatDateDisplay(scheduledEnd)
  const isMulti = explicitIsMultiDay ?? (startStr !== endStr)

  if (!isMulti || startStr === endStr) {
    return { flightDate: startStr, isMultiDay: false, daysCount: 1 }
  }

  // Calculate day difference using system standard calculator
  const days = calculateBookingDays({ scheduledStart, scheduledEnd }) || 2

  return {
    flightDate: `${startStr} – ${endStr} (${days} days)`,
    isMultiDay: true,
    daysCount: days,
  }
}

export function buildFlightDetailsData(input: BuildFlightDetailsInput): FlightDetailsData | null {
  const {
    booking,
    customer,
    aircraft,
    flightRecord,
    bookingFlightLog,
    standardInvoice,
    blockTimeInvoices,
    activeBlockTime,
    checkoutInvoice,
    standardLandings,
    checkoutLandings,
    evidenceAttachments,
    airports,
    timeRangeLabel,
    receiptUrl,
    hasPendingBankTransferReview,
    isMultiDay: inputIsMultiDay,
    bookingAuditEvents,
    minimumVdoDecision,
  } = input

  const isCheckout = booking.booking_type === 'checkout'

  // If there's neither a submitted flight record, log, nor invoice, there are no flight details to show
  const hasSubmittedFlightRecord = Boolean(flightRecord && flightRecord.status !== 'draft')
  const hasFlightData =
    hasSubmittedFlightRecord ||
    Boolean(bookingFlightLog && (bookingFlightLog.vdo_total != null || bookingFlightLog.vdo_stop != null)) ||
    Boolean(standardInvoice) ||
    Boolean(checkoutInvoice) ||
    Boolean(blockTimeInvoices && blockTimeInvoices.length > 0)

  if (!hasFlightData) {
    return null
  }

  // 1. Flight Dates & Multi-Day derivation
  const rawFallbackDate =
    flightRecord?.flight_date ||
    bookingFlightLog?.flight_date ||
    standardInvoice?.created_at ||
    checkoutInvoice?.created_at

  const { flightDate, isMultiDay, daysCount } = deriveFlightDates(
    booking.scheduled_start,
    booking.scheduled_end,
    rawFallbackDate,
    inputIsMultiDay
  )

  // 2. Aircraft Info
  const registration = aircraft?.registration || '—'
  const model = aircraft?.aircraft_type || aircraft?.display_name || 'Aircraft'

  // 3. Pilot Info (Including phone)
  const phone = customer?.phone_number
    ? [customer.phone_country_code, customer.phone_number].filter(Boolean).join(' ')
    : null

  // 4. VDO & Airswitch Hours
  let vdoHours: number | null =
    flightRecord?.vdo_total != null
      ? Number(flightRecord.vdo_total)
      : bookingFlightLog?.vdo_total != null
      ? Number(bookingFlightLog.vdo_total)
      : standardInvoice?.vdo_reading != null
      ? Number(standardInvoice.vdo_reading)
      : checkoutInvoice?.checkout_duration_hours != null
      ? Number(checkoutInvoice.checkout_duration_hours)
      : checkoutInvoice?.vdo_reading != null
      ? Number(checkoutInvoice.vdo_reading)
      : null

  if (vdoHours == null) {
    const vStart = flightRecord?.vdo_start ?? bookingFlightLog?.vdo_start ?? checkoutInvoice?.vdo_start_reading
    const vStop = flightRecord?.vdo_stop ?? bookingFlightLog?.vdo_stop ?? checkoutInvoice?.vdo_end_reading
    if (vStart != null && vStop != null) {
      vdoHours = Math.round((Number(vStop) - Number(vStart)) * 10) / 10
    }
  }

  let airSwitchHours: number | null =
    flightRecord?.air_switch_total != null
      ? Number(flightRecord.air_switch_total)
      : bookingFlightLog?.air_switch_total != null
      ? Number(bookingFlightLog.air_switch_total)
      : null

  if (airSwitchHours == null) {
    const aStart = flightRecord?.air_switch_start ?? bookingFlightLog?.air_switch_start
    const aStop = flightRecord?.air_switch_stop ?? bookingFlightLog?.air_switch_stop
    if (aStart != null && aStop != null) {
      airSwitchHours = Math.round((Number(aStop) - Number(aStart)) * 10) / 10
    }
  }

  // 5. Landings Breakdown
  const landingItems: FlightLandingItem[] = []
  let totalLandingsCount = 0

  if (!isCheckout) {
    if (standardLandings && standardLandings.length > 0) {
      for (const row of standardLandings) {
        const apt = Array.isArray(row.airports) ? row.airports[0] : row.airports
        const count = Number(row.landing_count) || 0
        const unitFee = Number(row.unit_amount_cents) || apt?.default_landing_fee_cents || 2895
        const totalFee = Number(row.total_amount_cents) || count * unitFee
        landingItems.push({
          airportName: apt?.name || 'Bankstown Airport',
          icaoCode: apt?.icao_code || 'YSBK',
          count,
          unitFeeCents: unitFee,
          totalFeeCents: totalFee,
        })
        totalLandingsCount += count
      }
    } else if (flightRecord?.flight_record_landings && flightRecord.flight_record_landings.length > 0) {
      for (const row of flightRecord.flight_record_landings) {
        const apt = Array.isArray(row.airports) ? row.airports[0] : row.airports
        const matchedAirport = airports?.find(a => a.id === row.airport_id)
        const count = Number(row.landing_count) || 0
        const unitFee = apt?.default_landing_fee_cents ?? matchedAirport?.default_landing_fee_cents ?? 2895
        landingItems.push({
          airportName: apt?.name || matchedAirport?.name || 'Bankstown Airport',
          icaoCode: apt?.icao_code || matchedAirport?.icao_code || 'YSBK',
          count,
          unitFeeCents: unitFee,
          totalFeeCents: count * unitFee,
        })
        totalLandingsCount += count
      }
    }
  } else {
    // Checkout flight landings
    if (checkoutLandings && checkoutLandings.length > 0) {
      for (const row of checkoutLandings) {
        const apt = Array.isArray(row.airports) ? row.airports[0] : row.airports
        const count = Number(row.landing_count) || 0
        const unitFee = Number(row.unit_amount_cents) || apt?.default_landing_fee_cents || 2890
        const totalFee = Number(row.total_amount_cents) || count * unitFee
        landingItems.push({
          airportName: apt?.name || 'Bankstown Airport',
          icaoCode: apt?.icao_code || 'YSBK',
          count,
          unitFeeCents: unitFee,
          totalFeeCents: totalFee,
        })
        totalLandingsCount += count
      }
    }
  }

  // 6. Pricing Breakdown (Including Multi-Day Minimum, Package / Block Time handling)
  const defaultRate = aircraft?.default_hourly_rate ? Math.round(aircraft.default_hourly_rate * 100) : 33000
  let hourlyRateCents = defaultRate
  const actualFlownVdo = vdoHours ?? 0

  // Resolve Multi-Day Minimum Rental Policy (4h/day minimum)
  let multiDayMinimum: FlightMultiDayMinimumDetails | null = null

  if (isMultiDay && daysCount && daysCount > 0) {
    const minHours = daysCount * 4
    const isBelowMinimum = actualFlownVdo < minHours

    // Detect if admin or operations made a decision:
    // 1. Check bookingAuditEvents for booking_invoice_finalised
    const finalisedAudit = (bookingAuditEvents ?? []).find(
      (e: any) => e.event_type === 'booking_invoice_finalised'
    )
    const auditDecision = finalisedAudit?.new_value?.minimum_vdo_decision as 'enforce_minimum' | 'bill_actual' | undefined
    const auditBilledHours = finalisedAudit?.new_value?.billed_vdo_hours != null
      ? Number(finalisedAudit.new_value.billed_vdo_hours)
      : undefined

    // 2. Check standard invoice vdo_reading or block time invoice quantity
    let invoiceBilledHours: number | undefined = undefined
    if (standardInvoice?.vdo_reading != null) {
      invoiceBilledHours = Number(standardInvoice.vdo_reading)
    } else if (blockTimeInvoices && blockTimeInvoices.length > 0) {
      const btList = blockTimeInvoices as any[]
      const totalQty = btList.reduce((sum, inv) => {
        const lines = inv.invoice_line_items ?? []
        const fLine = lines.find((l: any) => l.type === 'flight_hours')
        return sum + (fLine ? Number(fLine.quantity || 0) : 0)
      }, 0)
      if (totalQty > 0) invoiceBilledHours = totalQty
    }

    let decision: 'enforce_minimum' | 'bill_actual' = 'enforce_minimum'

    if (auditDecision) {
      decision = auditDecision
    } else if (auditBilledHours != null && isBelowMinimum) {
      decision = auditBilledHours >= minHours ? 'enforce_minimum' : 'bill_actual'
    } else if (invoiceBilledHours != null && isBelowMinimum) {
      if (Math.abs(invoiceBilledHours - minHours) < 0.05) {
        decision = 'enforce_minimum'
      } else if (Math.abs(invoiceBilledHours - actualFlownVdo) < 0.05) {
        decision = 'bill_actual'
      } else {
        decision = invoiceBilledHours >= minHours ? 'enforce_minimum' : 'bill_actual'
      }
    } else if (minimumVdoDecision) {
      decision = minimumVdoDecision
    } else {
      // Default multi-day rental policy is to enforce minimum
      decision = 'enforce_minimum'
    }

    const billedHours = isBelowMinimum
      ? (decision === 'enforce_minimum' ? minHours : actualFlownVdo)
      : actualFlownVdo

    const explanation = isBelowMinimum
      ? (decision === 'enforce_minimum'
          ? `Rental policy 4h/day minimum enforced (${minHours.toFixed(1)}h billed for ${daysCount} days vs ${actualFlownVdo.toFixed(1)}h flown).`
          : `Operations approved billing actual flight time (${actualFlownVdo.toFixed(1)}h billed instead of ${minHours.toFixed(1)}h minimum).`)
      : `Flight time of ${actualFlownVdo.toFixed(1)}h meets or exceeds the multi-day minimum (${minHours.toFixed(1)}h for ${daysCount} days).`

    multiDayMinimum = {
      isMultiDay: true,
      bookingDays: daysCount,
      minimumHours: minHours,
      actualHours: actualFlownVdo,
      billedHours,
      decision,
      isBelowMinimum,
      explanation,
    }
  }

  let billableHours = multiDayMinimum?.billedHours ?? actualFlownVdo
  let flightAmountCents = 0
  let landingSubtotalCents = landingItems.reduce((acc, curr) => acc + curr.totalFeeCents, 0)
  let subtotalCents = 0
  let advanceAppliedCents = 0
  let amountDueCents = 0
  let totalPaidCents = 0
  let status = 'pending'
  let waiverReason: string | null = null
  let invoiceNumber: string | null = null
  let paymentMethod: string | null = null
  let paidAt: string | null = null
  let isBlockTime = false
  let blockTimeDetails: FlightBlockTimeDetails | null = null

  // Package checks:
  const hasBlockTimeInvoices = Boolean(blockTimeInvoices && blockTimeInvoices.length > 0)
  const isPackageExpired = Boolean(
    activeBlockTime?.expiresAt && new Date(activeBlockTime.expiresAt).getTime() <= Date.now()
  )
  const packageRemainingHours = Math.max(0, Number(activeBlockTime?.hoursRemaining || 0))
  const isPackageExhausted = Boolean(activeBlockTime && packageRemainingHours <= 0)

  const isPackageFlight =
    hasBlockTimeInvoices ||
    (Boolean(activeBlockTime) && !isPackageExpired && !isPackageExhausted && !standardInvoice && !isCheckout)

  if (isCheckout && checkoutInvoice) {
    hourlyRateCents = Number(checkoutInvoice.checkout_rate_cents_per_hour) || 29000
    billableHours = Number(checkoutInvoice.checkout_duration_hours) || (vdoHours ?? 0)
    flightAmountCents = Number(checkoutInvoice.checkout_calculated_amount_cents) || Math.round(billableHours * hourlyRateCents)
    landingSubtotalCents = Number(checkoutInvoice.checkout_landing_subtotal_cents) ?? landingSubtotalCents
    subtotalCents = Number(checkoutInvoice.checkout_final_amount_cents) || (flightAmountCents + landingSubtotalCents)
    advanceAppliedCents = Number(checkoutInvoice.advance_applied_cents) || 0
    amountDueCents = Number(checkoutInvoice.stripe_amount_due_cents) || (subtotalCents - advanceAppliedCents)
    totalPaidCents = Number(checkoutInvoice.total_paid_cents) || 0
    status = checkoutInvoice.status || 'pending'
    waiverReason = checkoutInvoice.waiver_reason || null
    invoiceNumber = checkoutInvoice.invoice_number || null
    paymentMethod = checkoutInvoice.payment_method || null
    paidAt = checkoutInvoice.paid_at || null
  } else if (isPackageFlight) {
    isBlockTime = true

    if (hasBlockTimeInvoices) {
      type BTInv = {
        id: string
        invoice_number: string
        status: string
        total: number
        is_block_time_overage: boolean
        pdf_url: string | null
        paid_at: string | null
        invoice_line_items?: { type: string; description: string; quantity: number; unit_price: number; amount: number }[] | null
      }
      const btList = blockTimeInvoices as BTInv[]
      const usageInv = btList.find(i => !i.is_block_time_overage && (i.invoice_line_items?.some(l => l.type === 'flight_hours') || i.status === 'paid'))
      const landingInv = btList.find(i => i.invoice_line_items?.some(l => l.type === 'landing_fee'))
      const overageInv = btList.find(i => i.is_block_time_overage)

      const usageLine = usageInv?.invoice_line_items?.find(l => l.type === 'flight_hours')
      const overageLine = overageInv?.invoice_line_items?.find(l => l.type === 'overflow_hours' || l.type === 'flight_hours')

      const lockedRate = Number(overageLine?.unit_price) || Number(activeBlockTime?.ratePerHour) || (defaultRate / 100)
      hourlyRateCents = Math.round(lockedRate * 100)

      const overageHours = Number(overageLine?.quantity) || (overageInv ? Math.max(0, Math.round((billableHours - (Number(usageLine?.quantity) || 0)) * 10) / 10) : 0)
      const packageHours = Number(usageLine?.quantity) || Math.max(0, Math.round((billableHours - overageHours) * 10) / 10)

      const overageAmount = overageLine?.amount != null
        ? Math.round(Number(overageLine.amount) * 100)
        : (overageHours > 0 ? Math.round(overageHours * hourlyRateCents) : (overageInv ? Math.round(Number(overageInv.total || 0) * 100) : 0))
      const landingAmount = landingInv ? Math.round(Number(landingInv.total || 0) * 100) : landingSubtotalCents

      flightAmountCents = overageAmount // Flight overage charge
      landingSubtotalCents = landingAmount
      subtotalCents = landingAmount + overageAmount

      // Amount due is any unpaid landing fee + overage invoices
      const landingDue = landingInv?.status === 'paid' ? 0 : landingAmount
      const overageDue = overageInv?.status === 'paid' ? 0 : overageAmount
      amountDueCents = landingDue + overageDue
      totalPaidCents = (landingInv?.status === 'paid' ? landingAmount : 0) + (overageInv?.status === 'paid' ? overageAmount : 0)

      invoiceNumber = overageInv && landingInv
        ? `${overageInv.invoice_number} · ${landingInv.invoice_number}`
        : (overageInv?.invoice_number || landingInv?.invoice_number || usageInv?.invoice_number || null)
      status = amountDueCents === 0 ? 'paid' : (landingInv?.status || overageInv?.status || 'payment_required')
      paidAt = landingInv?.paid_at || usageInv?.paid_at || null

      blockTimeDetails = {
        packageHoursDeducted: packageHours,
        overageHours,
        overageAmountCents: overageAmount,
        landingFeesCents: landingAmount,
        landingInvoiceNumber: landingInv?.invoice_number,
        usageInvoiceNumber: usageInv?.invoice_number,
        overageInvoiceNumber: overageInv?.invoice_number,
        detailLines: [
          { label: 'Package Usage', value: `${packageHours.toFixed(1)} hrs deducted from package ($0.00 flight charge)` },
          ...(overageHours > 0 ? [{ label: 'Package Overage', value: `${overageHours.toFixed(1)} hrs @ $${(hourlyRateCents / 100).toFixed(2)}/hr ($${(overageAmount / 100).toFixed(2)})` }] : []),
          { label: 'Airport Landing Fees', value: `$${(landingAmount / 100).toFixed(2)}` },
        ],
      }
    } else {
      // User has active, unexpired package with hours remaining
      const packageHours = Math.min(billableHours, packageRemainingHours)
      const overageHours = Math.max(0, Math.round((billableHours - packageHours) * 10) / 10)
      hourlyRateCents = activeBlockTime?.ratePerHour ? Math.round(activeBlockTime.ratePerHour * 100) : defaultRate
      const overageAmount = Math.round(overageHours * hourlyRateCents)

      flightAmountCents = 0 // Covered by package!
      subtotalCents = landingSubtotalCents + overageAmount
      amountDueCents = subtotalCents

      blockTimeDetails = {
        packageHoursDeducted: packageHours,
        overageHours,
        overageAmountCents: overageAmount,
        landingFeesCents: landingSubtotalCents,
        packageName: activeBlockTime?.packageName || 'Prepaid Flight Package',
        expiresAt: activeBlockTime?.expiresAt,
        packageRatePerHour: activeBlockTime?.ratePerHour,
        detailLines: [
          { label: 'Package Hours Deducted', value: `${packageHours.toFixed(1)} hrs from balance ($0.00 flight charge)` },
          ...(overageHours > 0 ? [{ label: 'Package Overage', value: `${overageHours.toFixed(1)} hrs @ $${(hourlyRateCents / 100).toFixed(2)}/hr ($${(overageAmount / 100).toFixed(2)})` }] : []),
          { label: 'Airport Landing Fees', value: `$${(landingSubtotalCents / 100).toFixed(2)}` },
        ],
      }
    }
  } else if (standardInvoice) {
    hourlyRateCents = Number(standardInvoice.rate_cents_per_hour) || defaultRate
    billableHours = Number(standardInvoice.vdo_reading) || billableHours
    flightAmountCents = Number(standardInvoice.base_amount_cents) || Math.round(billableHours * hourlyRateCents)
    landingSubtotalCents = Number(standardInvoice.landing_subtotal_cents) ?? landingSubtotalCents
    subtotalCents = Number(standardInvoice.subtotal_cents) || (flightAmountCents + landingSubtotalCents)
    advanceAppliedCents = Number(standardInvoice.advance_applied_cents) || 0
    amountDueCents = Number(standardInvoice.stripe_amount_due_cents) ?? (subtotalCents - advanceAppliedCents)
    totalPaidCents = Number(standardInvoice.total_paid_cents) || 0
    status = standardInvoice.status || 'pending'
    invoiceNumber = standardInvoice.invoice_number || null
    paymentMethod = standardInvoice.payment_method || null
    paidAt = standardInvoice.paid_at || null

    if (isPackageExpired || (activeBlockTime && isPackageExpired)) {
      blockTimeDetails = {
        packageHoursDeducted: 0,
        isExpired: true,
        expiresAt: activeBlockTime?.expiresAt,
        packageName: activeBlockTime?.packageName || 'Prepaid Flight Package',
        detailLines: [
          { label: 'Package Status', value: `Expired on ${formatDateDisplay(activeBlockTime?.expiresAt) || activeBlockTime?.expiresAt} — standard flight rate applied` },
        ],
      }
    }
  } else {
    hourlyRateCents = defaultRate
    flightAmountCents = Math.round(billableHours * hourlyRateCents)
    subtotalCents = flightAmountCents + landingSubtotalCents
    amountDueCents = subtotalCents

    if (isPackageExpired) {
      blockTimeDetails = {
        packageHoursDeducted: 0,
        isExpired: true,
        expiresAt: activeBlockTime?.expiresAt,
        packageName: activeBlockTime?.packageName || 'Prepaid Flight Package',
        detailLines: [
          { label: 'Package Status', value: `Expired on ${formatDateDisplay(activeBlockTime?.expiresAt) || activeBlockTime?.expiresAt} — standard flight rate applied` },
        ],
      }
    } else if (isPackageExhausted) {
      blockTimeDetails = {
        packageHoursDeducted: 0,
        isExhausted: true,
        packageName: activeBlockTime?.packageName || 'Prepaid Flight Package',
        detailLines: [
          { label: 'Package Status', value: 'Prepaid package balance exhausted (0.0h remaining) — standard flight rate applied' },
        ],
      }
    }
  }

  // If there's an active bank transfer submission pending review or receipt uploaded awaiting confirmation
  if (
    hasPendingBankTransferReview ||
    (receiptUrl && status !== 'paid' && status !== 'settled' && status !== 'waived')
  ) {
    status = 'bank_transfer_pending_review'
  }

  // 7. Operational Notes & Attachments
  const evidenceList =
    evidenceAttachments && evidenceAttachments.length > 0
      ? evidenceAttachments.map(att => ({
          id: att.id,
          fileName: att.fileName || att.file_name || 'Evidence Attachment',
          signedUrl: att.signedUrl,
          fileSize: att.fileSize ?? att.file_size ?? null,
        }))
      : undefined

  const customerNotes =
    flightRecord?.notes ||
    flightRecord?.customer_notes ||
    bookingFlightLog?.notes ||
    null

  const adminNotes =
    standardInvoice?.admin_notes ||
    checkoutInvoice?.admin_notes ||
    null

  return {
    bookingId: booking.id,
    bookingReference:
      booking.booking_reference || booking.id.slice(0, 8).toUpperCase(),
    bookingType: isCheckout ? 'checkout' : 'standard',
    isMultiDay,
    daysCount,
    flightDate,
    scheduledTimeRange: timeRangeLabel || null,
    aircraft: {
      registration,
      model,
    },
    pilot: {
      name: customer?.full_name || 'Pilot',
      arn: customer?.pilot_arn || null,
      email: customer?.email || null,
      phone,
    },
    readings: {
      vdoHours,
      airSwitchHours,
    },
    landings: {
      totalLandings: totalLandingsCount,
      breakdown: landingItems,
    },
    pricing: {
      hourlyRateCents,
      billableHours,
      flightAmountCents,
      landingSubtotalCents,
      subtotalCents,
      advanceAppliedCents,
      amountDueCents,
      totalPaidCents,
      status,
      waiverReason,
      invoiceNumber,
      paymentMethod,
      paidAt,
      isBlockTime,
      blockTimeDetails,
      multiDayMinimum,
    },
    receiptUrl: receiptUrl || null,
    operational: {
      customerNotes,
      adminNotes,
      evidenceAttachments: evidenceList,
      receiptUrl: receiptUrl || null,
    },
  }
}
