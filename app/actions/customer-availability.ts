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

type AvailabilityMode = 'default' | 'checkout'

/** Booking statuses that still reserve the aircraft calendar. */
const CALENDAR_BLOCKING_BOOKING_STATUSES = [
  'checkout_requested',
  'checkout_confirmed',
  'checkout_completed_under_review',
  'pending_confirmation',
  'confirmed',
  'ready_for_dispatch',
  'dispatched',
  'awaiting_flight_record',
  'on_hold_pending_documents',
  'pending_post_flight_review',
  'payment_pending',
  'cancellation_requested',
] as const

function bookingConflictLabel(bookingType: string | null): string {
  return bookingType === 'checkout' ? 'Checkout flight' : 'Booked'
}

/**
 * Merge schedule-block conflicts with active overlapping bookings that may be
 * missing an active schedule_block (so selection matches submit).
 */
function mergeConflicts(
  blocks: SafeConflict[],
  bookings: Array<{
    scheduled_start: string
    scheduled_end: string
    booking_type: string | null
    status: string
  }>,
): SafeConflict[] {
  const merged = [...blocks]
  const covered = (start: string, end: string) =>
    merged.some((c) => c.start_time === start && c.end_time === end)

  for (const booking of bookings) {
    if (!CALENDAR_BLOCKING_BOOKING_STATUSES.includes(booking.status as (typeof CALENDAR_BLOCKING_BOOKING_STATUSES)[number])) {
      continue
    }
    if (covered(booking.scheduled_start, booking.scheduled_end)) continue
    merged.push({
      start_time: booking.scheduled_start,
      end_time: booking.scheduled_end,
      label: bookingConflictLabel(booking.booking_type),
    })
  }

  return merged.sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  )
}


/**
 * Customer-safe live availability check for an exact time window.
 *
 * Queries get_customer_aircraft_calendar_blocks for the exact window, and also
 * treats overlapping active bookings as conflicts (covers missing/cancelled
 * schedule_blocks so selection matches submit).
 *
 * Returns only public-safe fields — no internal_reason, no admin notes.
 */
export async function checkCustomerAvailability(
  aircraftId:     string,
  scheduledStart: string,   // ISO 8601 UTC
  scheduledEnd:   string,   // ISO 8601 UTC
  mode: AvailabilityMode = 'default',
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

  const queryStart = start
  const queryEnd = end

  const requestedStartSydney = start.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'short', timeStyle: 'medium' })
  const requestedEndSydney = end.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'short', timeStyle: 'medium' })
  const queryStartSydney = queryStart.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'short', timeStyle: 'medium' })
  const queryEndSydney = queryEnd.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'short', timeStyle: 'medium' })

  // Query requested window (or expanded checkout window).
  const { data, error } = await supabase.rpc(
    'get_customer_aircraft_calendar_blocks',
    {
      p_aircraft_id: aircraftId,
      p_from:        queryStart.toISOString(),
      p_to:          queryEnd.toISOString(),
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
  const { data: blockingBookings } = await supabase
    .from('bookings')
    .select('id, status, booking_type, scheduled_start, scheduled_end, booking_owner_user_id')
    .eq('aircraft_id', aircraftId)
    .in('status', [...CALENDAR_BLOCKING_BOOKING_STATUSES])
    .lt('scheduled_start', queryEnd.toISOString())
    .gt('scheduled_end', queryStart.toISOString())
    .order('scheduled_start', { ascending: true })

  const blockConflicts: SafeConflict[] = blocks.map(b => ({
    start_time: b.start_time,
    end_time:   b.end_time,
    label:      b.label,
  }))
  const conflicts = mergeConflicts(blockConflicts, blockingBookings ?? [])
  const available = conflicts.length === 0

  console.info('CHECKOUT_AVAILABILITY_STEP1', {
    mode,
    aircraft_id: aircraftId,
    requested_start_utc: start.toISOString(),
    requested_end_utc: end.toISOString(),
    requested_start_sydney: requestedStartSydney,
    requested_end_sydney: requestedEndSydney,
    query_start_utc: queryStart.toISOString(),
    query_end_utc: queryEnd.toISOString(),
    query_start_sydney: queryStartSydney,
    query_end_sydney: queryEndSydney,
    preflight_buffer_minutes: 0,
    postflight_buffer_minutes: 0,
    blocking_bookings_found: blockingBookings?.length ?? 0,
    blocking_schedule_blocks_found: blocks.length,
    merged_conflicts_found: conflicts.length,
    blocking_bookings: (blockingBookings ?? []).map((b) => ({
      id: b.id,
      status: b.status,
      booking_type: b.booking_type,
      start: b.scheduled_start,
      end: b.scheduled_end,
      owner_user_id: b.booking_owner_user_id,
    })),
    blocking_schedule_blocks: blocks.map((b) => ({
      id: b.block_id,
      type: b.block_type,
      start_time: b.start_time,
      end_time: b.end_time,
      label: b.label,
    })),
    available,
  })

  if (available) {
    return {
      available: true,
      message:   'Aircraft appears available for this window. Final confirmation is subject to admin review.',
    }
  }

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
 * Also merges overlapping active bookings so orphan bookings (missing active
 * schedule_blocks) still appear on the daily timeline.
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
  const blockConflicts: SafeConflict[] = blocks.map(b => ({
    start_time: b.start_time,
    end_time:   b.end_time,
    label:      b.label,
  }))

  const { data: dayBookings } = await supabase
    .from('bookings')
    .select('status, booking_type, scheduled_start, scheduled_end')
    .eq('aircraft_id', aircraftId)
    .in('status', [...CALENDAR_BLOCKING_BOOKING_STATUSES])
    .lt('scheduled_start', endUTC.toISOString())
    .gt('scheduled_end', startUTC.toISOString())
    .order('scheduled_start', { ascending: true })

  return mergeConflicts(blockConflicts, dayBookings ?? [])
}
