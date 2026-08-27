import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueuePostFlightRecordPendingEmails } from '@/lib/email/outbox'

type AircraftJoin = {
  registration: string | null
  model?: string | null
}

type ProfileJoin = {
  id: string
  email: string | null
  first_name?: string | null
  full_name?: string | null
  phone_number?: string | null
  phone_country_code?: string | null
  pilot_arn?: string | null
}

type FlightRecordJoin = {
  id: string
  status: string
  submitted_at: string | null
}

type PostFlightBookingRow = {
  id: string
  booking_type: string | null
  booking_reference: string | null
  status: string
  scheduled_start: string
  scheduled_end: string
  booking_owner_user_id: string
  aircraft: AircraftJoin | AircraftJoin[] | null
  profiles: ProfileJoin | ProfileJoin[] | null
  flight_records: FlightRecordJoin[] | null
}

export type PostFlightActionRemindersStats = {
  scanned: number
  remindersEnqueued: number
  skipped: number
}

/**
 * Sweeps all concluded flights (scheduled_end >= 24 hours ago) that genuinely
 * have an outstanding post-flight action (unsubmitted flight record / VDO readings
 * or unresolved clarification).
 *
 * Enqueues reminders to:
 * - Customer: to submit flight record or answer clarification
 * - Admin: operational alert that post-flight record is pending (admin can also enter readings)
 *
 * Stops reminders immediately once flight record is submitted or approved.
 */
export async function runPostFlightActionRemindersSweep(
  admin: SupabaseClient,
  now: Date,
): Promise<PostFlightActionRemindersStats> {
  const stats: PostFlightActionRemindersStats = {
    scanned: 0,
    remindersEnqueued: 0,
    skipped: 0,
  }

  // Look for standard bookings that concluded at least 24 hours ago
  const in24hPastUtc = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const { data: rawBookings, error } = await admin
    .from('bookings')
    .select(`
      id,
      booking_type,
      booking_reference,
      status,
      scheduled_start,
      scheduled_end,
      booking_owner_user_id,
      aircraft_id,
      flight_records (
        id,
        status,
        submitted_at
      )
    `)
    .eq('booking_type', 'standard')
    .lte('scheduled_end', in24hPastUtc)
    .in('status', [
      'awaiting_flight_record',
      'flight_record_overdue',
      'dispatched',
      'ready_for_dispatch',
      'confirmed',
      'needs_clarification',
    ])
    .limit(100)

  if (error) {
    console.error('[runPostFlightActionRemindersSweep] Query failed:', error.message)
    return stats
  }

  const rawList = rawBookings ?? []
  const userIds = Array.from(new Set(rawList.map((b: any) => b.booking_owner_user_id).filter(Boolean)))
  const aircraftIds = Array.from(new Set(rawList.map((b: any) => b.aircraft_id).filter(Boolean)))

  const [{ data: profilesData }, { data: aircraftData }] = await Promise.all([
    userIds.length > 0
      ? admin.from('profiles').select('id, email, first_name, full_name, phone_number, phone_country_code, pilot_arn').in('id', userIds)
      : Promise.resolve({ data: [] }),
    aircraftIds.length > 0
      ? admin.from('aircraft').select('id, registration, model').in('id', aircraftIds)
      : Promise.resolve({ data: [] }),
  ])

  const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p]))
  const aircraftMap = new Map((aircraftData ?? []).map((a: any) => [a.id, a]))

  const bookings: PostFlightBookingRow[] = rawList.map((b: any) => ({
    ...b,
    profiles: profileMap.get(b.booking_owner_user_id) ?? null,
    aircraft: aircraftMap.get(b.aircraft_id) ?? null,
  }))

  stats.scanned = bookings.length

  for (const booking of bookings) {
    // 1. Verify if post-flight action is genuinely still outstanding
    const records = booking.flight_records ?? []
    const isSubmitted = records.some(
      (r) => r.status === 'submitted' || r.status === 'pending_review' || r.status === 'approved',
    )

    const isClarification = booking.status === 'needs_clarification' || records.some((r) => r.status === 'clarification_requested')

    // If already submitted and not in clarification, action is completed -> STOP reminders
    if (isSubmitted && !isClarification) {
      stats.skipped += 1
      continue
    }

    const prof = Array.isArray(booking.profiles) ? booking.profiles[0] : booking.profiles
    const customerEmail = prof?.email
    if (!customerEmail) {
      stats.skipped += 1
      continue
    }

    const hoursSinceEnd = Math.floor((now.getTime() - new Date(booking.scheduled_end).getTime()) / (60 * 60 * 1000))
    if (hoursSinceEnd < 24) {
      stats.skipped += 1
      continue
    }

    const customerName =
      prof?.full_name?.trim() ||
      prof?.first_name?.trim() ||
      'Pilot'

    const customerPhone = prof?.phone_number
      ? `${prof.phone_country_code || ''} ${prof.phone_number}`.trim()
      : null

    const aircraftObj = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
    const aircraftLabel = aircraftObj?.registration
      ? `${aircraftObj.registration}${aircraftObj.model ? ` (${aircraftObj.model})` : ''}`
      : 'OZRentAPlane Aircraft'

    const bookingRef = booking.booking_reference || `BK-${booking.id.slice(0, 8).toUpperCase()}`

    const flightDateStr = new Date(booking.scheduled_start).toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'full',
    })

    // Determine reminder tier (Day 1 for 24-71h, Day 3 for 72h+)
    const idempotencySuffix = hoursSinceEnd >= 72 ? 'day3' : 'day1'

    try {
      await enqueuePostFlightRecordPendingEmails({
        bookingId: booking.id,
        customerId: booking.booking_owner_user_id,
        customerName,
        customerEmail,
        customerPhone,
        pilotArn: prof?.pilot_arn ?? null,
        bookingReference: bookingRef,
        aircraft: aircraftLabel,
        flightDate: flightDateStr,
        hoursOverdue: hoursSinceEnd,
        status: isClarification ? 'Clarification Requested' : 'Awaiting Flight Record',
        isClarification,
        idempotencySuffix,
      })
      stats.remindersEnqueued += 1
    } catch (err) {
      console.error(`[runPostFlightActionRemindersSweep] Failed for booking ${booking.id}:`, err)
      stats.skipped += 1
    }
  }

  return stats
}
