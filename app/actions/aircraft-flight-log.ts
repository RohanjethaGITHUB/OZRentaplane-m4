'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  buildContinuityWarning,
  calculateAircraftReadingsTotals,
  hasMaterialAircraftReadingChanges,
  type AircraftContinuityBaseline,
  type AircraftReadings,
} from '@/lib/aircraft-readings'
import type { FlightLogReviewStatus, FlightLogSource } from '@/lib/aircraft-flight-log'

type MaybeNumber = number | null

type FlightLogInput = {
  aircraft_id: string
  flight_date: string
  pic_user_id?: string | null
  pic_name: string
  pic_arn?: string | null
  vdo_start: MaybeNumber
  vdo_stop: MaybeNumber
  tacho_start: MaybeNumber
  tacho_stop: MaybeNumber
  air_switch_start: MaybeNumber
  air_switch_stop: MaybeNumber
  mr_start: MaybeNumber
  mr_stop: MaybeNumber
  oil_added?: MaybeNumber
  oil_total?: MaybeNumber
  fuel_added?: MaybeNumber
  fuel_returned?: MaybeNumber
  landings?: number | null
  notes?: string | null
  related_booking_id?: string | null
  source?: FlightLogSource | null
  review_status?: FlightLogReviewStatus | null
}

const ALLOWED_SOURCES: FlightLogSource[] = [
  'manual_admin_entry',
  'checkout_completion',
  'booking_customer_post_flight',
]

function toReadings(input: FlightLogInput | Omit<FlightLogInput, 'aircraft_id'>): AircraftReadings {
  return {
    vdo_start: input.vdo_start,
    vdo_stop: input.vdo_stop,
    tacho_start: input.tacho_start,
    tacho_stop: input.tacho_stop,
    air_switch_start: input.air_switch_start,
    air_switch_stop: input.air_switch_stop,
    mr_start: input.mr_start,
    mr_stop: input.mr_stop,
    oil_added: input.oil_added ?? null,
    oil_total: input.oil_total ?? null,
    fuel_added: input.fuel_added ?? null,
    fuel_returned: input.fuel_returned ?? null,
    landings: input.landings ?? null,
    notes: input.notes ?? null,
  }
}

function validateRequired(input: FlightLogInput | Omit<FlightLogInput, 'aircraft_id'>) {
  if (!input.flight_date) throw new Error('VALIDATION: Flight date is required.')
  if (!input.pic_name?.trim()) throw new Error('VALIDATION: PIC name is required.')

  const requiredMeters: Array<[string, MaybeNumber, MaybeNumber]> = [
    ['VDO', input.vdo_start, input.vdo_stop],
    ['Tacho', input.tacho_start, input.tacho_stop],
    ['Air Switch', input.air_switch_start, input.air_switch_stop],
    ['MR', input.mr_start, input.mr_stop],
  ]

  for (const [label, start, stop] of requiredMeters) {
    if (start == null || stop == null) {
      throw new Error(`VALIDATION: ${label} start and stop are required.`)
    }
    if (stop < start) {
      throw new Error(`VALIDATION: ${label} stop cannot be lower than start.`)
    }
  }

  if (input.landings != null && input.landings < 0) {
    throw new Error('VALIDATION: Landings must be zero or greater.')
  }
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') throw new Error('Forbidden')
  return { supabase, adminId: user.id }
}

async function getPreviousBaseline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  aircraftId: string,
  beforeLogNumber?: number,
): Promise<AircraftContinuityBaseline> {
  let query = supabase
    .from('aircraft_flight_logs')
    .select('vdo_stop, tacho_stop, air_switch_stop, mr_stop')
    .eq('aircraft_id', aircraftId)
    .order('log_number', { ascending: false })
    .limit(1)

  if (beforeLogNumber != null) {
    query = query.lt('log_number', beforeLogNumber)
  }

  const { data: previous, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)

  return {
    vdo_start: previous?.vdo_stop ?? null,
    tacho_start: previous?.tacho_stop ?? null,
    air_switch_start: previous?.air_switch_stop ?? null,
    mr_start: previous?.mr_stop ?? null,
  }
}

function buildPayload(input: FlightLogInput | Omit<FlightLogInput, 'aircraft_id'>, readings: AircraftReadings, baseline: AircraftContinuityBaseline) {
  const totals = calculateAircraftReadingsTotals(readings)
  const continuity = buildContinuityWarning(readings, baseline)

  return {
    flight_date: input.flight_date,
    pic_user_id: input.pic_user_id ?? null,
    pic_name: input.pic_name.trim(),
    pic_arn: input.pic_arn?.trim() || null,
    vdo_start: readings.vdo_start,
    vdo_stop: readings.vdo_stop,
    vdo_total: totals.vdo_total,
    tacho_start: readings.tacho_start,
    tacho_stop: readings.tacho_stop,
    tacho_total: totals.tacho_total,
    air_switch_start: readings.air_switch_start,
    air_switch_stop: readings.air_switch_stop,
    air_switch_total: totals.air_switch_total,
    mr_start: readings.mr_start,
    mr_stop: readings.mr_stop,
    mr_total: totals.mr_total,
    oil_added: readings.oil_added,
    oil_total: readings.oil_total,
    fuel_added: readings.fuel_added,
    fuel_returned: readings.fuel_returned,
    landings: readings.landings,
    notes: readings.notes,
    related_booking_id: input.related_booking_id ?? null,
    continuity_warning: continuity.continuity_warning,
    continuity_warning_details: continuity.continuity_warning_details,
  }
}

export async function getAircraftFlightLogs(aircraftId: string) {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('aircraft_flight_logs')
    .select('*')
    .eq('aircraft_id', aircraftId)
    .order('flight_date', { ascending: false })
    .order('log_number', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getLatestAircraftReadings(aircraftId: string) {
  const { supabase } = await requireAdmin()

  const { data: latest, error } = await supabase
    .from('aircraft_flight_logs')
    .select('*')
    .eq('aircraft_id', aircraftId)
    .order('flight_date', { ascending: false })
    .order('log_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const { data: summaryRows, error: sumErr } = await supabase
    .from('aircraft_flight_logs')
    .select('landings, flight_date')
    .eq('aircraft_id', aircraftId)

  if (sumErr) throw new Error(sumErr.message)

  const totalLandings = (summaryRows ?? []).reduce((acc, row) => acc + (row.landings ?? 0), 0)

  return {
    latest,
    totalLandings,
    lastFlightDate: latest?.flight_date ?? null,
  }
}

export async function getFlightLogCreateContext(aircraftId: string) {
  const { supabase } = await requireAdmin()

  const { data: latest, error } = await supabase
    .from('aircraft_flight_logs')
    .select('log_number, vdo_stop, tacho_stop, air_switch_stop, mr_stop')
    .eq('aircraft_id', aircraftId)
    .order('log_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const nextLogNumber = (latest?.log_number ?? 0) + 1

  const { data: recentBookings } = await supabase
    .from('bookings')
    .select('id, booking_reference, scheduled_start, pic_name, pic_arn, pic_user_id, booking_owner_user_id, status')
    .eq('aircraft_id', aircraftId)
    .in('status', ['completed', 'post_flight_approved', 'checkout_completed_under_review', 'pending_post_flight_review', 'payment_pending'])
    .order('scheduled_start', { ascending: false })
    .limit(20)

  return {
    nextLogNumber,
    suggestedStarts: {
      vdo_start: latest?.vdo_stop ?? null,
      tacho_start: latest?.tacho_stop ?? null,
      air_switch_start: latest?.air_switch_stop ?? null,
      mr_start: latest?.mr_stop ?? null,
    },
    recentBookings: recentBookings ?? [],
  }
}

export async function createAircraftFlightLog(input: FlightLogInput) {
  const { supabase, adminId } = await requireAdmin()
  validateRequired(input)

  const source = input.source && ALLOWED_SOURCES.includes(input.source)
    ? input.source
    : 'manual_admin_entry'

  const { data: latest, error: latestErr } = await supabase
    .from('aircraft_flight_logs')
    .select('log_number')
    .eq('aircraft_id', input.aircraft_id)
    .order('log_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestErr) throw new Error(latestErr.message)

  const nextLogNumber = (latest?.log_number ?? 0) + 1
  const readings = toReadings(input)
  const baseline = await getPreviousBaseline(supabase, input.aircraft_id)
  const payload = {
    aircraft_id: input.aircraft_id,
    log_number: nextLogNumber,
    ...buildPayload(input, readings, baseline),
    source,
    review_status: input.review_status ?? 'admin_confirmed',
    created_by: adminId,
    updated_by: adminId,
  }

  const { data, error } = await supabase
    .from('aircraft_flight_logs')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/admin/aircraft')
  revalidatePath(`/admin/aircraft/${input.aircraft_id}`)
  revalidatePath(`/admin/aircraft/${input.aircraft_id}/flight-log`)

  return { row: data }
}

export async function updateAircraftFlightLog(id: string, input: Omit<FlightLogInput, 'aircraft_id'>) {
  const { supabase, adminId } = await requireAdmin()

  validateRequired(input)

  const { data: current, error: currentErr } = await supabase
    .from('aircraft_flight_logs')
    .select('*')
    .eq('id', id)
    .single()

  if (currentErr || !current) throw new Error('Flight log record not found.')

  const readings = toReadings(input)
  const previousReadings: Partial<AircraftReadings> = {
    vdo_start: current.vdo_start ?? null,
    vdo_stop: current.vdo_stop ?? null,
    tacho_start: current.tacho_start ?? null,
    tacho_stop: current.tacho_stop ?? null,
    air_switch_start: current.air_switch_start ?? null,
    air_switch_stop: current.air_switch_stop ?? null,
    mr_start: current.mr_start ?? null,
    mr_stop: current.mr_stop ?? null,
    oil_added: current.oil_added ?? null,
    oil_total: current.oil_total ?? null,
    fuel_added: current.fuel_added ?? null,
    fuel_returned: current.fuel_returned ?? null,
    landings: current.landings ?? null,
    notes: current.notes ?? null,
  }
  const materialChange = hasMaterialAircraftReadingChanges(previousReadings, readings)
  const baseline = await getPreviousBaseline(supabase, current.aircraft_id, current.log_number)

  const payload = {
    ...buildPayload(input, readings, baseline),
    source: current.source ?? input.source ?? 'manual_admin_entry',
    review_status: materialChange ? 'admin_adjusted' : 'admin_confirmed',
    updated_by: adminId,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('aircraft_flight_logs')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/admin/aircraft')
  revalidatePath(`/admin/aircraft/${current.aircraft_id}`)
  revalidatePath(`/admin/aircraft/${current.aircraft_id}/flight-log`)

  return data
}

export async function deleteAircraftFlightLog(id: string) {
  const { supabase } = await requireAdmin()

  const { data: row, error: rowErr } = await supabase
    .from('aircraft_flight_logs')
    .select('aircraft_id')
    .eq('id', id)
    .single()

  if (rowErr || !row) throw new Error('Flight log record not found.')

  const { error } = await supabase
    .from('aircraft_flight_logs')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath('/admin/aircraft')
  revalidatePath(`/admin/aircraft/${row.aircraft_id}`)
  revalidatePath(`/admin/aircraft/${row.aircraft_id}/flight-log`)
}
