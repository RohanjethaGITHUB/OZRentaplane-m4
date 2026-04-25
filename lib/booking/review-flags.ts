// lib/booking/review-flags.ts
// Pure function — no database access.
// Generates review flags from raw flight record readings.
// Flags are stored in flight_records.review_flags (jsonb) and surface to admins.

import type { ReviewFlag } from '@/lib/supabase/booking-types'

// Thresholds
const ABSOLUTE_HIGH_HOURS = 8      // warn if a single meter total exceeds this
const SCHEDULED_RATIO_HIGH = 2.5   // warn if total > 2.5× the scheduled duration
const HIGH_ADD_TO_MR = 10
const HIGH_LANDINGS = 20

export type FlightReadings = {
  tacho_start?: number | null
  tacho_stop?: number | null
  vdo_start?: number | null
  vdo_stop?: number | null
  air_switch_start?: number | null
  air_switch_stop?: number | null
  add_to_mr?: number | null
  oil_added?: number | null
  fuel_added?: number | null
  landings?: number | null
  /** Calculated from booking scheduled_start/end (hours). Used for ratio checks. */
  scheduled_hours?: number
}

export function generateReviewFlags(readings: FlightReadings): ReviewFlag[] {
  const flags: ReviewFlag[] = []

  function checkMeter(
    label: string,
    prefix: string,
    start: number | null | undefined,
    stop: number | null | undefined,
  ) {
    // Both absent is fine — meter not required for every aircraft
    if (start == null && stop == null) return

    if (start == null) {
      flags.push({
        key: `${prefix}_start_missing`,
        severity: 'error',
        message: `${label} start reading is missing but stop reading was provided.`,
      })
      return
    }
    if (stop == null) {
      flags.push({
        key: `${prefix}_stop_missing`,
        severity: 'error',
        message: `${label} stop reading is missing but start reading was provided.`,
      })
      return
    }

    const total = stop - start

    if (total < 0) {
      flags.push({
        key: `${prefix}_negative_total`,
        severity: 'error',
        message: `${label} total is negative (stop ${stop} < start ${start}). Possible transposition or meter rollover.`,
      })
      return
    }

    if (total === 0) {
      flags.push({
        key: `${prefix}_zero_total`,
        severity: 'warning',
        message: `${label} total is zero — start equals stop. Confirm aircraft was not flown.`,
      })
    }

    if (total > ABSOLUTE_HIGH_HOURS) {
      flags.push({
        key: `${prefix}_unusually_high`,
        severity: 'warning',
        message: `${label} total of ${total.toFixed(2)} hours is unusually high for a single session.`,
      })
    }

    if (readings.scheduled_hours && readings.scheduled_hours > 0 && total > 0) {
      const ratio = total / readings.scheduled_hours
      if (ratio > SCHEDULED_RATIO_HIGH) {
        flags.push({
          key: `${prefix}_exceeds_scheduled`,
          severity: 'warning',
          message: `${label} total of ${total.toFixed(2)} hours is ${ratio.toFixed(1)}× the scheduled duration of ${readings.scheduled_hours.toFixed(2)} hours.`,
        })
      }
    }
  }

  checkMeter('Tacho', 'tacho', readings.tacho_start, readings.tacho_stop)
  checkMeter('VDO', 'vdo', readings.vdo_start, readings.vdo_stop)
  checkMeter('Air Switch', 'air_switch', readings.air_switch_start, readings.air_switch_stop)

  // Add-to-MR
  if (readings.add_to_mr != null) {
    if (readings.add_to_mr < 0) {
      flags.push({
        key: 'add_to_mr_negative',
        severity: 'error',
        message: 'Add-to-MR value is negative.',
      })
    } else if (readings.add_to_mr > HIGH_ADD_TO_MR) {
      flags.push({
        key: 'add_to_mr_high',
        severity: 'warning',
        message: `Add-to-MR value of ${readings.add_to_mr} is unusually high.`,
      })
    }
  }

  // Landings
  if (readings.landings != null) {
    if (readings.landings < 0) {
      flags.push({
        key: 'landings_negative',
        severity: 'error',
        message: 'Landing count is negative.',
      })
    } else if (readings.landings > HIGH_LANDINGS) {
      flags.push({
        key: 'landings_high',
        severity: 'warning',
        message: `Landing count of ${readings.landings} is unusually high.`,
      })
    }
  }

  // Oil
  if (readings.oil_added != null && readings.oil_added < 0) {
    flags.push({
      key: 'oil_added_negative',
      severity: 'error',
      message: 'Oil added is negative.',
    })
  }

  // Fuel
  if (readings.fuel_added != null && readings.fuel_added < 0) {
    flags.push({
      key: 'fuel_added_negative',
      severity: 'error',
      message: 'Fuel added is negative.',
    })
  }

  return flags
}
