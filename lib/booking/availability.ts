// lib/booking/availability.ts
// Server-side aircraft availability checker.
//
// This is a pure query function — it makes no writes.
// Callers are responsible for expanding the proposed window by the aircraft's
// pre/post-flight buffers before calling this function.
//
// Logic:
//   1. Query schedule_blocks overlapping [start, end] with status = 'active'.
//   2. Skip blocks related to excludeBookingId (for reschedule scenarios).
//   3. Treat temporary_hold as non-blocking if expires_at is in the past.
//   4. Return { available: true } or { available: false, reasons: [...] }.
//
// Note: aircraft.status (grounded, inactive) is also checked so callers
// get a clear rejection even before any block query.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AvailabilityReason, AvailabilityResult } from '@/lib/supabase/booking-types'

export type CheckAvailabilityOptions = {
  /** If set, schedule_blocks linked to this booking are ignored (reschedule flow). */
  excludeBookingId?: string
  /** When true, internal_reason is included in returned reasons (admin context only). */
  includeInternalReasons?: boolean
}

export async function checkAircraftAvailability(
  supabase: SupabaseClient,
  aircraftId: string,
  start: Date,
  end: Date,
  options: CheckAvailabilityOptions = {},
): Promise<AvailabilityResult> {
  const { excludeBookingId, includeInternalReasons = false } = options

  // 1. Verify aircraft exists and is not globally blocked
  const { data: aircraft, error: aircraftError } = await supabase
    .from('aircraft')
    .select('id, status')
    .eq('id', aircraftId)
    .single()

  if (aircraftError || !aircraft) {
    throw new Error(`Aircraft not found: ${aircraftId}`)
  }

  if (aircraft.status === 'grounded' || aircraft.status === 'inactive') {
    return {
      available: false,
      reasons: [{
        type: 'schedule_block',
        block_id: '',
        block_type: aircraft.status,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        public_label: aircraft.status === 'grounded' ? 'Aircraft grounded' : 'Aircraft unavailable',
        internal_reason: includeInternalReasons ? `Aircraft status is '${aircraft.status}'` : null,
      }],
    }
  }

  // 2. Query overlapping active schedule_blocks
  //    Overlap condition: block.start_time < end AND block.end_time > start
  const { data: blocks, error: blocksError } = await supabase
    .from('schedule_blocks')
    .select('id, block_type, start_time, end_time, public_label, internal_reason, expires_at, related_booking_id')
    .eq('aircraft_id', aircraftId)
    .eq('status', 'active')
    .lt('start_time', end.toISOString())
    .gt('end_time', start.toISOString())

  if (blocksError) {
    throw new Error(`Availability check failed: ${blocksError.message}`)
  }

  const now = new Date()
  const conflicting: AvailabilityReason[] = []

  for (const block of blocks ?? []) {
    // Skip blocks belonging to the booking being rescheduled
    if (excludeBookingId && block.related_booking_id === excludeBookingId) {
      continue
    }

    // temporary_hold only blocks if it has not expired
    if (block.block_type === 'temporary_hold' && block.expires_at) {
      if (new Date(block.expires_at) <= now) {
        continue
      }
    }

    conflicting.push({
      type: 'schedule_block',
      block_id: block.id,
      block_type: block.block_type,
      start_time: block.start_time,
      end_time: block.end_time,
      public_label: block.public_label,
      internal_reason: includeInternalReasons ? (block.internal_reason ?? null) : null,
    })
  }

  if (conflicting.length === 0) {
    return { available: true }
  }

  return { available: false, reasons: conflicting }
}
