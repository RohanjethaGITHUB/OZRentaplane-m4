'use server'

import { createClient } from '@/lib/supabase/server'
import type { CustomerCalendarBlock } from '@/lib/supabase/booking-types'

export type SafeConflict = {
  start_time: string
  end_time:   string
  label:      string
}

export type AvailabilityCheckResult =
  | { available: true;  message: string; debugError?: string }
  | { available: false; message: string; conflicts: SafeConflict[]; debugError?: string }


/**
 * Customer-safe live availability check for an exact time window.
 *
 * Calls `get_customer_aircraft_calendar_blocks` with the window expanded by
 * the aircraft's pre/post-flight buffers to detect true overlaps.
 *
 * Returns only public-safe fields — no internal_reason, no admin notes.
 */
export async function checkCustomerAvailability(
  aircraftId:     string,
  scheduledStart: string,   // ISO 8601 UTC
  scheduledEnd:   string,   // ISO 8601 UTC
): Promise<AvailabilityCheckResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { available: false, message: 'Not authenticated.', conflicts: [] }
  }

  const start = new Date(scheduledStart)
  const end   = new Date(scheduledEnd)

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return { available: false, message: 'Invalid time range.', conflicts: [] }
  }

  // Fetch aircraft buffers to expand the check window, matching atomic RPC logic.
  const { data: aircraft, error: aircraftErr } = await supabase
    .from('aircraft')
    .select('default_preflight_buffer_minutes, default_postflight_buffer_minutes')
    .eq('id', aircraftId)
    .single()

  if (aircraftErr || !aircraft) {
    console.error('[checkCustomerAvailability] Failed to fetch aircraft:', aircraftErr?.message)
    return {
      available:  false,
      message:    'Unable to check availability. Please try again.',
      conflicts:  [],
    }
  }

  const checkStart = new Date(start)
  checkStart.setMinutes(checkStart.getMinutes() - (aircraft.default_preflight_buffer_minutes || 0))

  const checkEnd = new Date(end)
  checkEnd.setMinutes(checkEnd.getMinutes() + (aircraft.default_postflight_buffer_minutes || 0))

  const { data, error } = await supabase.rpc(
    'get_customer_aircraft_calendar_blocks',
    {
      p_aircraft_id: aircraftId,
      p_from:        checkStart.toISOString(),
      p_to:          checkEnd.toISOString(),
    }
  )

  if (error) {
    const debugMsg = `RPC get_customer_aircraft_calendar_blocks failed: [${error.code}] ${error.message}${error.hint ? ` Hint: ${error.hint}` : ''}`
    console.error('[checkCustomerAvailability] RPC error:', error.message, error.code)
    return {
      available:  false,
      message:    'Unable to check availability. Please try again.',
      conflicts:  [],
      debugError: process.env.NODE_ENV !== 'production' ? debugMsg : undefined,
    }
  }

  const blocks = (data as CustomerCalendarBlock[]) || []

  if (blocks.length === 0) {
    return {
      available: true,
      message:   'Aircraft appears available for this window. Final confirmation is subject to admin review.',
    }
  }

  const conflicts: SafeConflict[] = blocks.map(b => ({
    start_time: b.start_time,
    end_time:   b.end_time,
    label:      b.label,
  }))

  return {
    available: false,
    message:   'Aircraft is unavailable for this time. Please choose another window.',
    conflicts,
  }
}


/**
 * Fetch all schedule blocks active on a given Sydney-local calendar date.
 *
 * Used by the Day Availability side panel. Throws on RPC failure so the
 * calling component can display an error state (instead of falsely showing
 * "No unavailable periods").
 *
 * @param aircraftId      UUID of the aircraft
 * @param selectedDateSyd "YYYY-MM-DD" in Sydney local time
 */
export async function getDayAvailability(
  aircraftId:      string,
  selectedDateSyd: string
): Promise<SafeConflict[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Convert the Sydney-local date boundaries to UTC.
  // We do NOT use the browser's timezone — always anchor to Australia/Sydney.
  const naiveStart = new Date(`${selectedDateSyd}T00:00:00`)
  const naiveEnd   = new Date(`${selectedDateSyd}T23:59:59`)

  const startSyd     = new Date(naiveStart.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))
  const startOffsetMs = naiveStart.getTime() - startSyd.getTime()
  const startUTC     = new Date(naiveStart.getTime() + startOffsetMs)

  const endSyd       = new Date(naiveEnd.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))
  const endOffsetMs   = naiveEnd.getTime() - endSyd.getTime()
  const endUTC       = new Date(naiveEnd.getTime() + endOffsetMs)

  const { data, error } = await supabase.rpc(
    'get_customer_aircraft_calendar_blocks',
    {
      p_aircraft_id: aircraftId,
      p_from:        startUTC.toISOString(),
      p_to:          endUTC.toISOString(),
    }
  )

  if (error) {
    console.error('[getDayAvailability] RPC error:', error.message, error.code)
    // Throw so the component's .catch() handler sets daySlotsError=true.
    // This prevents the panel from falsely showing "No unavailable periods"
    // when the RPC actually failed.
    throw new Error(`Unable to load day availability: ${error.message}`)
  }

  const blocks = (data as CustomerCalendarBlock[]) || []

  return blocks.map(b => ({
    start_time: b.start_time,
    end_time:   b.end_time,
    label:      b.label,
  }))
}
