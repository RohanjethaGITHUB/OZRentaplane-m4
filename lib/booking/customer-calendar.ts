// lib/booking/customer-calendar.ts
// Server-side helper that wraps the customer-safe Postgres RPC.
// Returns ONLY calendar-safe fields — no internal_reason, no admin metadata,
// no created_by_user_id.  Safe to render directly in customer-facing pages.

import { createClient } from '@/lib/supabase/server'
import type { CustomerCalendarBlock } from '@/lib/supabase/booking-types'

export type SafeCalendarSlot = {
  block_id:   string
  start_time: string
  end_time:   string
  /** Generic user-facing label. internal_reason is never included. */
  label:      string
}

/**
 * Fetch upcoming unavailable periods for the given aircraft.
 * Uses the customer-safe RPC `get_customer_aircraft_calendar_blocks` —
 * customers never touch schedule_blocks directly.
 *
 * @param aircraftId  UUID of the aircraft
 * @param startUTC    ISO 8601 UTC string — window start
 * @param endUTC      ISO 8601 UTC string — window end
 */
export async function getCustomerCalendarSlots(
  aircraftId: string,
  startUTC:   string,
  endUTC:     string
): Promise<SafeCalendarSlot[]> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'get_customer_aircraft_calendar_blocks',
    {
      p_aircraft_id: aircraftId,
      p_from:        startUTC,
      p_to:          endUTC,
    },
  )

  if (error) {
    console.error('[getCustomerCalendarSlots] RPC error:', error.message, error.code)
    return []
  }

  return (data as CustomerCalendarBlock[]).map(b => ({
    block_id:   b.block_id,
    start_time: b.start_time,
    end_time:   b.end_time,
    // label is already resolved by the SQL function — no TS fallback needed.
    label:      b.label,
  }))
}
