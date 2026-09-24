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
  status?: string | null
  package_name?: string
  hours_purchased?: number
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
  scheduledStart?: string | Date | null
  scheduledEnd?: string | Date | null
  bookingDays?: number | null
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
  blockPackageId?: string | null
  blockPackageName?: string | null
  blockHoursBefore?: number | null
  blockHoursRemaining: number | null
  blockHoursDeducted: number
  blockHoursRemainingAfter?: number | null
  blockOverageHours: number
  blockOverageAmountCents: number
  hourlyRate: number
  standardHourlyRate: number
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
    scheduledStart,
    scheduledEnd,
    bookingDays,
  } = params

  const minimumVdoBilling = resolveMinimumVdoBilling({
    bookingSlotHours,
    actualVdoHours: vdoTotal,
    decision: minimumVdoDecision ?? 'enforce_minimum',
    scheduledStart,
    scheduledEnd,
    bookingDays,
  })

  const billedVdoHours = minimumVdoBilling.billedVdoHours ?? vdoTotal

  // Expiry check against flight date (scheduledStart) or current time, or status active/exhausted
  const flightTimestamp = scheduledStart ? new Date(scheduledStart).getTime() : Date.now()
  const isBlockTime = Boolean(
    activeBlockTime &&
    (
      !activeBlockTime.expires_at ||
      activeBlockTime.status === 'active' ||
      activeBlockTime.status === 'exhausted' ||
      new Date(activeBlockTime.expires_at).getTime() >= flightTimestamp ||
      new Date(activeBlockTime.expires_at).getTime() >= Date.now()
    ),
  )

  let blockPackageId: string | null = null
  let blockPackageName: string | null = null
  let blockHoursBefore: number | null = null
  let blockHoursRemaining: number | null = null
  let blockHoursDeducted = 0
  let blockHoursRemainingAfter: number | null = null
  let blockOverageHours = 0
  let blockOverageAmountCents = 0
  let flightBaseCents = 0
  const rateToUse = isBlockTime && activeBlockTime?.rate_per_hour
    ? activeBlockTime.rate_per_hour
    : defaultHourlyRate

  if (isBlockTime && activeBlockTime) {
    blockPackageId = activeBlockTime.id
    const basePkgName = activeBlockTime.package_name ?? 'Starter Block'
    const hrsPurchased = Number(activeBlockTime.hours_purchased ?? 0)
    blockPackageName = (hrsPurchased > 0 && !basePkgName.toLowerCase().includes('hr'))
      ? `${basePkgName} (${hrsPurchased}hr package)`
      : basePkgName
    blockHoursBefore = Math.round(Number(activeBlockTime.hours_remaining ?? 0) * 100) / 100
    blockHoursRemaining = blockHoursBefore
    blockHoursRemainingAfter = blockHoursBefore
  }

  if (billedVdoHours != null && billedVdoHours > 0) {
    if (isBlockTime && activeBlockTime) {
      blockHoursDeducted = Math.round(Math.min(Number(activeBlockTime.hours_remaining ?? 0), billedVdoHours) * 100) / 100
      blockHoursRemainingAfter = Math.max(0, Math.round(((blockHoursBefore ?? 0) - blockHoursDeducted) * 100) / 100)
      blockOverageHours = Math.max(0, Math.round((billedVdoHours - blockHoursDeducted) * 100) / 100)
      // Case 1: Overage is billed at standard aircraft hire rate (defaultHourlyRate), not package rate
      blockOverageAmountCents = Math.round(blockOverageHours * defaultHourlyRate * 100)
      flightBaseCents = blockOverageAmountCents
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
    blockPackageId,
    blockPackageName,
    blockHoursBefore,
    blockHoursRemaining,
    blockHoursDeducted,
    blockHoursRemainingAfter,
    blockOverageHours,
    blockOverageAmountCents,
    hourlyRate: rateToUse,
    standardHourlyRate: defaultHourlyRate,
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
