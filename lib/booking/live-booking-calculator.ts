import { resolveMinimumVdoBilling, resolveMaximumVdoHours, type MinimumVdoBilling } from './standard-booking-billing'

export type AirportBillingInfo = {
  id: string
  icao_code: string
  name: string
  default_landing_fee_cents?: number
}

export type ActiveBlockTimeSummary = {
  id: string
  hours_remaining: number
  rate_per_hour: number
  expires_at: string
}

export type LandingInputRow = {
  airport_id: string
  landing_count: number | string
}

export type PostFlightCalculationParams = {
  vdoTotal: number | null
  bookingSlotHours: number
  defaultHourlyRate: number
  airports: AirportBillingInfo[]
  landingRows: LandingInputRow[]
  activeBlockTime?: ActiveBlockTimeSummary | null
  customerCreditCents?: number
  minimumVdoDecision?: 'enforce_minimum' | 'bill_actual' | null
}

export type CalculatedLandingItem = {
  airportId: string
  airportName: string
  icaoCode: string
  landingCount: number
  unitAmountCents: number
  totalAmountCents: number
}

export type PostFlightCalculationResult = {
  vdoTotal: number | null
  bookingSlotHours: number
  minimumVdoBilling: MinimumVdoBilling
  billedVdoHours: number | null
  isBlockTime: boolean
  blockHoursRemaining: number | null
  blockHoursDeducted: number
  blockOverageHours: number
  hourlyRate: number
  flightBaseCents: number
  landingItems: CalculatedLandingItem[]
  landingSubtotalCents: number
  subtotalCents: number
  customerCreditCents: number
  creditAppliedCents: number
  amountDueCents: number
  stripeSurchargeCents: number
  stripeGrossAmountCents: number
  isFullyCovered: boolean
  validationError: string | null
}

const STRIPE_DOMESTIC_FEE_BPS = 170
const STRIPE_FIXED_FEE_CENTS  = 30
const DEFAULT_LANDING_FEE_CENTS = 2895

export function calculatePostFlightCharges(params: PostFlightCalculationParams): PostFlightCalculationResult {
  const {
    vdoTotal,
    bookingSlotHours,
    defaultHourlyRate,
    airports = [],
    landingRows = [],
    activeBlockTime = null,
    customerCreditCents = 0,
    minimumVdoDecision = 'enforce_minimum',
  } = params

  const minimumVdoBilling = resolveMinimumVdoBilling({
    bookingSlotHours,
    actualVdoHours: vdoTotal,
    decision: minimumVdoDecision ?? 'enforce_minimum',
  })

  const billedVdoHours = minimumVdoBilling.billedVdoHours ?? vdoTotal
  const isBlockTime = Boolean(
    activeBlockTime &&
    activeBlockTime.hours_remaining > 0 &&
    new Date(activeBlockTime.expires_at).getTime() > Date.now(),
  )

  let blockHoursRemaining: number | null = null
  let blockHoursDeducted = 0
  let blockOverageHours = 0
  let flightBaseCents = 0
  const rateToUse = isBlockTime && activeBlockTime ? activeBlockTime.rate_per_hour : defaultHourlyRate

  if (billedVdoHours != null && billedVdoHours > 0) {
    if (isBlockTime && activeBlockTime) {
      blockHoursRemaining = activeBlockTime.hours_remaining
      blockHoursDeducted = Math.min(activeBlockTime.hours_remaining, billedVdoHours)
      blockOverageHours = Math.max(0, billedVdoHours - activeBlockTime.hours_remaining)
      flightBaseCents = Math.round(blockOverageHours * rateToUse * 100)
    } else {
      flightBaseCents = Math.round(billedVdoHours * rateToUse * 100)
    }
  }

  // Calculate Landings
  const landingItems: CalculatedLandingItem[] = []
  let landingSubtotalCents = 0

  for (const row of landingRows) {
    if (!row.airport_id) continue
    const count = typeof row.landing_count === 'string' ? Number(row.landing_count) : row.landing_count
    if (!Number.isFinite(count) || count <= 0) continue

    const airport = airports.find((a) => a.id === row.airport_id)
    const unitFee = airport?.default_landing_fee_cents ?? DEFAULT_LANDING_FEE_CENTS
    const totalFee = Math.round(unitFee * count)

    landingItems.push({
      airportId: row.airport_id,
      airportName: airport?.name ?? 'Airport',
      icaoCode: airport?.icao_code ?? 'YSBK',
      landingCount: count,
      unitAmountCents: unitFee,
      totalAmountCents: totalFee,
    })

    landingSubtotalCents += totalFee
  }

  const subtotalCents = flightBaseCents + landingSubtotalCents
  const creditAppliedCents = Math.min(Math.max(0, customerCreditCents), subtotalCents)
  const amountDueCents = Math.max(0, subtotalCents - creditAppliedCents)

  let stripeSurchargeCents = 0
  let stripeGrossAmountCents = amountDueCents

  if (amountDueCents > 0) {
    stripeGrossAmountCents = Math.ceil(
      (amountDueCents + STRIPE_FIXED_FEE_CENTS) / (1 - STRIPE_DOMESTIC_FEE_BPS / 10000),
    )
    stripeSurchargeCents = stripeGrossAmountCents - amountDueCents
  }

  const isFullyCovered = (billedVdoHours != null && billedVdoHours > 0) && amountDueCents === 0

  let validationError: string | null = null
  if (vdoTotal != null) {
    if (vdoTotal < 0.1) {
      validationError = `VDO reading (${vdoTotal}h) is below minimum of 0.1h.`
    } else {
      const maxHours = resolveMaximumVdoHours(minimumVdoBilling.bookingDays)
      if (vdoTotal > maxHours) {
        validationError = `VDO reading (${vdoTotal}h) exceeds maximum allowed ${maxHours.toFixed(1)}h.`
      }
    }
  }

  return {
    vdoTotal,
    bookingSlotHours,
    minimumVdoBilling,
    billedVdoHours,
    isBlockTime,
    blockHoursRemaining,
    blockHoursDeducted,
    blockOverageHours,
    hourlyRate: rateToUse,
    flightBaseCents,
    landingItems,
    landingSubtotalCents,
    subtotalCents,
    customerCreditCents,
    creditAppliedCents,
    amountDueCents,
    stripeSurchargeCents,
    stripeGrossAmountCents,
    isFullyCovered,
    validationError,
  }
}
