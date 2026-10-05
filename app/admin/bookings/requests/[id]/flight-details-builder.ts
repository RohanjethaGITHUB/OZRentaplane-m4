import type {
  FlightDetailsData,
  FlightLandingItem,
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

export function buildFlightDetailsData(input: BuildFlightDetailsInput): FlightDetailsData | null {
  const {
    booking,
    customer,
    aircraft,
    flightRecord,
    bookingFlightLog,
    standardInvoice,
    blockTimeInvoices,
    checkoutInvoice,
    standardLandings,
    checkoutLandings,
    evidenceAttachments,
    airports,
    timeRangeLabel,
    receiptUrl,
    hasPendingBankTransferReview,
  } = input

  const isCheckout = booking.booking_type === 'checkout'

  // If there's neither a flight record, log, nor invoice, there are no flight details to show
  const hasFlightData =
    !!flightRecord ||
    !!bookingFlightLog ||
    !!standardInvoice ||
    !!checkoutInvoice ||
    (blockTimeInvoices && blockTimeInvoices.length > 0)

  if (!hasFlightData) {
    return null
  }

  // 1. Flight Date
  const rawFlightDate =
    flightRecord?.flight_date ||
    bookingFlightLog?.flight_date ||
    booking.scheduled_start ||
    standardInvoice?.created_at ||
    checkoutInvoice?.created_at

  const flightDate = formatDateDisplay(rawFlightDate)

  // 2. Aircraft Info
  const registration = aircraft?.registration || '—'
  const model = aircraft?.aircraft_type || aircraft?.display_name || 'Aircraft'

  // 3. Pilot Info
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

  // 6. Pricing Breakdown
  let hourlyRateCents = 33000
  let billableHours = vdoHours ?? 0
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
  let blockTimeDetails: { label: string; value: string }[] | null = null

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
  } else if (standardInvoice) {
    hourlyRateCents = Number(standardInvoice.rate_cents_per_hour) || 33000
    billableHours = Number(standardInvoice.vdo_reading) || (vdoHours ?? 0)
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
  } else if (blockTimeInvoices && blockTimeInvoices.length > 0) {
    const inv = blockTimeInvoices[0]
    isBlockTime = true
    subtotalCents = Math.round((Number(inv.total) || 0) * 100)
    amountDueCents = subtotalCents
    invoiceNumber = inv.invoice_number || null
    status = inv.status || 'paid'
    paidAt = inv.paid_at || null

    if (aircraft?.default_hourly_rate) {
      hourlyRateCents = Math.round(aircraft.default_hourly_rate * 100)
    }
    flightAmountCents = Math.round(billableHours * hourlyRateCents)

    blockTimeDetails = [
      { label: 'Billing Mode', value: 'Prepaid Block Time Package' },
      { label: 'Flight Hours Flown', value: `${billableHours.toFixed(1)} hrs` },
    ]
    if (inv.is_block_time_overage) {
      blockTimeDetails.push({ label: 'Overage Billed', value: `$${Number(inv.total).toFixed(2)}` })
    }
  } else {
    if (aircraft?.default_hourly_rate) {
      hourlyRateCents = Math.round(aircraft.default_hourly_rate * 100)
    }
    flightAmountCents = Math.round(billableHours * hourlyRateCents)
    subtotalCents = flightAmountCents + landingSubtotalCents
    amountDueCents = subtotalCents
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
