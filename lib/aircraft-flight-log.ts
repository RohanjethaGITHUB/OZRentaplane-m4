import { createAdminClient } from '@/lib/supabase/admin'
import {
  type AircraftContinuityBaseline,
  type AircraftReadings,
  type TotalOnlyReadings,
  buildContinuityWarning,
  calculateAircraftReadingsTotals,
  hasMaterialAircraftReadingChanges,
  round1,
} from '@/lib/aircraft-readings'

export type FlightLogSource =
  | 'manual_admin_entry'
  | 'checkout_completion'
  | 'booking_customer_post_flight'
  | 'legacy_checkout_clearance'
  | 'opening_balance'
  | 'paper_log_import'

export type FlightLogReviewStatus =
  | 'pending_admin_review'
  | 'admin_confirmed'
  | 'admin_adjusted'

export type FlightLogUpsertInput = {
  aircraft_id: string
  flight_date: string
  pic_user_id?: string | null
  pic_name: string
  pic_arn?: string | null
  readings: AircraftReadings
  related_booking_id?: string | null
  source: FlightLogSource
  review_status: FlightLogReviewStatus
  created_by?: string | null
  updated_by?: string | null
}

export async function getAircraftFlightLogStartSuggestions(aircraftId: string) {
  const admin = createAdminClient()

  const { data: latestLog } = await admin
    .from('aircraft_flight_logs')
    .select('id, log_number, vdo_stop, tacho_stop, air_switch_stop, mr_stop, flight_date')
    .eq('aircraft_id', aircraftId)
    .order('log_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestLog) {
    return {
      latestLog,
      nextLogNumber: (latestLog.log_number ?? 0) + 1,
      suggestedStarts: {
        vdo_start: latestLog.vdo_stop ?? null,
        tacho_start: latestLog.tacho_stop ?? null,
        air_switch_start: latestLog.air_switch_stop ?? null,
        mr_start: latestLog.mr_stop ?? null,
      } satisfies AircraftContinuityBaseline,
    }
  }

  const { data: lastStopRows } = await admin.rpc('get_aircraft_last_meter_stops', { p_aircraft_id: aircraftId })
  const fallback: AircraftContinuityBaseline = {
    vdo_start: null,
    tacho_start: null,
    air_switch_start: null,
    mr_start: null,
  }

  for (const row of (lastStopRows ?? []) as Array<{ meter_type: string; stop_reading: number }>) {
    if (row.meter_type === 'vdo') fallback.vdo_start = Number(row.stop_reading)
    if (row.meter_type === 'tacho') fallback.tacho_start = Number(row.stop_reading)
    if (row.meter_type === 'air_switch') fallback.air_switch_start = Number(row.stop_reading)
  }

  return {
    latestLog: null,
    nextLogNumber: 1,
    suggestedStarts: fallback,
  }
}

export async function getAircraftFlightLogByRelatedBooking(relatedBookingId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('aircraft_flight_logs')
    .select('*')
    .eq('related_booking_id', relatedBookingId)
    .maybeSingle()

  return data ?? null
}

export async function upsertAircraftFlightLogRecord(input: FlightLogUpsertInput) {
  const admin = createAdminClient()
  const existing = input.related_booking_id
    ? await getAircraftFlightLogByRelatedBooking(input.related_booking_id)
    : null

  const context = await getAircraftFlightLogStartSuggestions(input.aircraft_id)
  const continuity = buildContinuityWarning(input.readings, context.suggestedStarts)
  const totals = calculateAircraftReadingsTotals(input.readings)

  const payload = {
    aircraft_id: input.aircraft_id,
    log_number: existing?.log_number ?? context.nextLogNumber,
    flight_date: input.flight_date,
    pic_user_id: input.pic_user_id ?? null,
    pic_name: input.pic_name.trim(),
    pic_arn: input.pic_arn?.trim() || null,
    vdo_start: input.readings.vdo_start,
    vdo_stop: input.readings.vdo_stop,
    vdo_total: totals.vdo_total,
    tacho_start: input.readings.tacho_start,
    tacho_stop: input.readings.tacho_stop,
    tacho_total: totals.tacho_total,
    air_switch_start: input.readings.air_switch_start,
    air_switch_stop: input.readings.air_switch_stop,
    air_switch_total: totals.air_switch_total,
    mr_start: input.readings.mr_start,
    mr_stop: input.readings.mr_stop,
    mr_total: totals.mr_total,
    oil_added: input.readings.oil_added,
    oil_total: input.readings.oil_total,
    fuel_added: input.readings.fuel_added,
    fuel_returned: input.readings.fuel_returned,
    landings: input.readings.landings,
    notes: input.readings.notes,
    related_booking_id: input.related_booking_id ?? null,
    source: input.source,
    review_status: input.review_status,
    continuity_warning: continuity.continuity_warning,
    continuity_warning_details: continuity.continuity_warning_details,
    created_by: existing?.created_by ?? input.created_by ?? null,
    updated_by: input.updated_by ?? null,
  }

  if (existing) {
    const { data, error } = await admin
      .from('aircraft_flight_logs')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) throw new Error(error.message)

    return {
      row: data,
      existing,
      materialChange: hasMaterialAircraftReadingChanges(existing, input.readings),
    }
  }

  const { data, error } = await admin
    .from('aircraft_flight_logs')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  return {
    row: data,
    existing: null,
    materialChange: false,
  }
}

// ─── Total-only helpers ───────────────────────────────────────────────────────

/**
 * Returns the stop readings of the most recent FINALIZED aircraft flight log
 * (review_status = 'admin_confirmed' | 'admin_adjusted').
 * Pending customer submissions are intentionally excluded so they cannot shift
 * the official reading chain before admin approval.
 */
export async function getLastFinalizedLogStop(
  aircraftId: string,
): Promise<AircraftContinuityBaseline | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('aircraft_flight_logs')
    .select('vdo_stop, tacho_stop, air_switch_stop, mr_stop')
    .eq('aircraft_id', aircraftId)
    .in('review_status', ['admin_confirmed', 'admin_adjusted'])
    .order('log_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    vdo_start: data.vdo_stop ?? null,
    tacho_start: data.tacho_stop ?? null,
    air_switch_start: data.air_switch_stop ?? null,
    mr_start: data.mr_stop ?? null,
  }
}

/**
 * Computes a full AircraftReadings (with start, stop, oil, fuel, etc.) from
 * total-only user input and the previous finalized stop readings as the baseline.
 * If baseline is null (no finalized log exists yet), starts are treated as 0.
 */
export function buildReadingsFromTotals(
  totals: TotalOnlyReadings,
  baseline: AircraftContinuityBaseline | null,
): AircraftReadings {
  const vdo_start    = baseline?.vdo_start    ?? 0
  const tacho_start  = baseline?.tacho_start  ?? 0
  const as_start     = baseline?.air_switch_start ?? 0
  const mr_start     = baseline?.mr_start     ?? 0

  return {
    vdo_start,
    vdo_stop:          round1(vdo_start   + totals.vdo_total),
    tacho_start,
    tacho_stop:        round1(tacho_start + totals.tacho_total),
    air_switch_start:  as_start,
    air_switch_stop:   round1(as_start    + totals.air_switch_total),
    mr_start,
    mr_stop:           round1(mr_start    + totals.mr_total),
    oil_added:         totals.oil_added,
    oil_total:         totals.oil_total,
    fuel_added:        totals.fuel_added,
    fuel_returned:     totals.fuel_returned,
    landings:          totals.landings,
    notes:             totals.notes,
  }
}
