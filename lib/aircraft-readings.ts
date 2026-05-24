export type MaybeNumber = number | null

export type AircraftReadings = {
  vdo_start: MaybeNumber
  vdo_stop: MaybeNumber
  tacho_start: MaybeNumber
  tacho_stop: MaybeNumber
  air_switch_start: MaybeNumber
  air_switch_stop: MaybeNumber
  mr_start: MaybeNumber
  mr_stop: MaybeNumber
  oil_added: MaybeNumber
  oil_total: MaybeNumber
  fuel_added: MaybeNumber
  fuel_returned: MaybeNumber
  landings: number | null
  notes: string | null
}

export type AircraftReadingsFormValues = Record<string, string>

export type AircraftReadingsTotals = {
  vdo_total: MaybeNumber
  tacho_total: MaybeNumber
  air_switch_total: MaybeNumber
  mr_total: MaybeNumber
}

export type AircraftContinuityBaseline = {
  vdo_start: MaybeNumber
  tacho_start: MaybeNumber
  air_switch_start: MaybeNumber
  mr_start: MaybeNumber
}

export const AIRCRAFT_READING_START_FIELDS = [
  'vdo_start',
  'tacho_start',
  'air_switch_start',
  'mr_start',
] as const

export const AIRCRAFT_READING_FIELDS = [
  'vdo_start',
  'vdo_stop',
  'tacho_start',
  'tacho_stop',
  'air_switch_start',
  'air_switch_stop',
  'mr_start',
  'mr_stop',
  'oil_added',
  'oil_total',
  'fuel_added',
  'fuel_returned',
  'landings',
  'notes',
] as const

export function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function calcReadingTotal(start: MaybeNumber, stop: MaybeNumber): MaybeNumber {
  if (start == null || stop == null) return null
  return round1(stop - start)
}

export function calculateAircraftReadingsTotals(readings: AircraftReadings): AircraftReadingsTotals {
  return {
    vdo_total: calcReadingTotal(readings.vdo_start, readings.vdo_stop),
    tacho_total: calcReadingTotal(readings.tacho_start, readings.tacho_stop),
    air_switch_total: calcReadingTotal(readings.air_switch_start, readings.air_switch_stop),
    mr_total: calcReadingTotal(readings.mr_start, readings.mr_stop),
  }
}

export function validateAircraftReadings(readings: AircraftReadings) {
  const requiredMeters: Array<[string, MaybeNumber, MaybeNumber]> = [
    ['VDO', readings.vdo_start, readings.vdo_stop],
    ['Tacho', readings.tacho_start, readings.tacho_stop],
    ['Air Switch', readings.air_switch_start, readings.air_switch_stop],
    ['MR', readings.mr_start, readings.mr_stop],
  ]

  for (const [label, start, stop] of requiredMeters) {
    if (start == null || stop == null) {
      throw new Error(`VALIDATION: ${label} start and stop are required.`)
    }
    if (stop < start) {
      throw new Error(`VALIDATION: ${label} stop cannot be lower than start.`)
    }
  }

  if (readings.landings != null && readings.landings < 0) {
    throw new Error('VALIDATION: Landings must be zero or greater.')
  }
}

export function buildContinuityWarning(
  readings: AircraftReadings,
  baseline: AircraftContinuityBaseline,
): { continuity_warning: boolean; continuity_warning_details: string | null } {
  const mismatches: string[] = []

  if (baseline.vdo_start != null && readings.vdo_start != null && readings.vdo_start !== baseline.vdo_start) {
    mismatches.push(`VDO start ${readings.vdo_start.toFixed(1)} != previous stop ${baseline.vdo_start.toFixed(1)}`)
  }
  if (baseline.tacho_start != null && readings.tacho_start != null && readings.tacho_start !== baseline.tacho_start) {
    mismatches.push(`Tacho start ${readings.tacho_start.toFixed(1)} != previous stop ${baseline.tacho_start.toFixed(1)}`)
  }
  if (baseline.air_switch_start != null && readings.air_switch_start != null && readings.air_switch_start !== baseline.air_switch_start) {
    mismatches.push(`Air Switch start ${readings.air_switch_start.toFixed(1)} != previous stop ${baseline.air_switch_start.toFixed(1)}`)
  }
  if (baseline.mr_start != null && readings.mr_start != null && readings.mr_start !== baseline.mr_start) {
    mismatches.push(`MR start ${readings.mr_start.toFixed(1)} != previous stop ${baseline.mr_start.toFixed(1)}`)
  }

  return {
    continuity_warning: mismatches.length > 0,
    continuity_warning_details: mismatches.length > 0 ? mismatches.join(' | ') : null,
  }
}

export function hasMaterialAircraftReadingChanges(
  previous: Partial<AircraftReadings>,
  next: AircraftReadings,
): boolean {
  return AIRCRAFT_READING_FIELDS.some((field) => {
    const prevValue = previous[field as keyof AircraftReadings]
    const nextValue = next[field as keyof AircraftReadings]
    return prevValue !== nextValue
  })
}

export function numberInputValue(value: MaybeNumber | number | undefined): string {
  return value == null ? '' : String(value)
}

// ─── Total-only readings (used for customer and admin-checkout forms) ─────────
// Customers and admins recording a checkout outcome now enter only totals.
// The backend calculates start/stop from the previous finalized aircraft log.

export type TotalOnlyReadings = {
  vdo_total: number
  tacho_total: number
  air_switch_total: number
  mr_total: number
  oil_added: MaybeNumber
  oil_total: MaybeNumber
  fuel_added: MaybeNumber
  fuel_returned: MaybeNumber
  landings: number | null
  notes: string | null
}

export type TotalOnlyFormValues = {
  vdo_total: string
  tacho_total: string
  air_switch_total: string
  mr_total: string
  oil_added: string
  oil_total: string
  fuel_added: string
  fuel_returned: string
}

export function validateTotalOnlyReadings(readings: TotalOnlyReadings): void {
  const required: Array<[string, number]> = [
    ['VDO total', readings.vdo_total],
    ['Tacho total', readings.tacho_total],
    ['Airswitch total', readings.air_switch_total],
    ['MR total', readings.mr_total],
  ]
  for (const [label, value] of required) {
    if (value == null || isNaN(value) || !isFinite(value)) {
      throw new Error(`VALIDATION: ${label} is required and must be a valid number.`)
    }
    if (value < 0) {
      throw new Error(`VALIDATION: ${label} cannot be negative.`)
    }
  }
  if (readings.landings != null && readings.landings < 0) {
    throw new Error('VALIDATION: Landings must be zero or greater.')
  }
}
