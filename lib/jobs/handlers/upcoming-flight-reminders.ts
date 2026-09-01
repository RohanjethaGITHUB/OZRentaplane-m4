import type { SupabaseClient } from '@supabase/supabase-js'
import {
  enqueueUpcomingFlightReminder48hEmails,
  enqueueUpcomingFlightReminder12hEmails,
} from '@/lib/email/outbox'

type AircraftJoin = {
  registration: string | null
  display_name?: string | null
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

type UpcomingBookingRow = {
  id: string
  booking_type: string | null
  booking_reference: string | null
  status: string
  scheduled_start: string
  scheduled_end: string
  aircraft_id: string | null
  booking_owner_user_id: string
  aircraft: AircraftJoin | AircraftJoin[] | null
  profiles: ProfileJoin | ProfileJoin[] | null
}

export type UpcomingFlightRemindersStats = {
  scanned: number
  reminders48hEnqueued: number
  reminders12hEnqueued: number
  skipped: number
}

/**
 * Sweeps all upcoming active Checkout and Rental bookings within the next 48 hours.
 * Enqueues:
 *  - 48-hour reminders to customer & admin if hoursUntilFlight <= 48
 *  - 12-hour reminders to customer & admin if hoursUntilFlight <= 12
 *
 * Utilizes schedule-hash idempotency keys to ensure:
 * 1. Rescheduled flights receive fresh 48h/12h reminders for the updated date.
 * 2. No duplicate reminder is ever sent for the same schedule.
 * 3. Cancelled flights are strictly excluded.
 */
export async function runUpcomingFlightRemindersSweep(
  admin: SupabaseClient,
  now: Date,
): Promise<UpcomingFlightRemindersStats> {
  const stats: UpcomingFlightRemindersStats = {
    scanned: 0,
    reminders48hEnqueued: 0,
    reminders12hEnqueued: 0,
    skipped: 0,
  }

  const nowUtc = now.toISOString()
  const in48hUtc = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()

  const { data: rawBookings, error } = await admin
    .from('bookings')
    .select(`
      id,
      booking_type,
      booking_reference,
      status,
      scheduled_start,
      scheduled_end,
      aircraft_id,
      booking_owner_user_id
    `)
    .gt('scheduled_start', nowUtc)
    .lte('scheduled_start', in48hUtc)
    .neq('status', 'cancelled')

  if (error) {
    console.error('[runUpcomingFlightRemindersSweep] Query failed:', error.message)
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
      ? admin.from('aircraft').select('id, registration, display_name, model').in('id', aircraftIds)
      : Promise.resolve({ data: [] }),
  ])

  const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p]))
  const aircraftMap = new Map((aircraftData ?? []).map((a: any) => [a.id, a]))

  const bookings: UpcomingBookingRow[] = rawList.map((b: any) => ({
    ...b,
    profiles: profileMap.get(b.booking_owner_user_id) ?? null,
    aircraft: aircraftMap.get(b.aircraft_id) ?? null,
  }))

  stats.scanned = bookings.length

  for (const booking of bookings) {
    // Verify booking is still active & eligible
    const status = booking.status?.toLowerCase()
    if (
      status === 'cancelled' ||
      status === 'completed' ||
      status === 'dispatched' ||
      status === 'awaiting_flight_record' ||
      status === 'flight_record_submitted' ||
      status === 'flight_record_overdue'
    ) {
      stats.skipped += 1
      continue
    }

    const prof = Array.isArray(booking.profiles) ? booking.profiles[0] : booking.profiles
    const customerEmail = prof?.email
    if (!customerEmail) {
      stats.skipped += 1
      continue
    }

    const flightStart = new Date(booking.scheduled_start)
    const msUntilFlight = flightStart.getTime() - now.getTime()
    if (msUntilFlight <= 0) {
      stats.skipped += 1
      continue
    }

    const hoursUntilFlight = Math.max(1, Math.round(msUntilFlight / (60 * 60 * 1000)))
    const bookingType = (booking.booking_type || 'standard').toLowerCase()
    const bookingRef = booking.booking_reference || `BK-${booking.id.slice(0, 8).toUpperCase()}`

    const aircraftObj = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
    const aircraftLabel = aircraftObj?.registration
      ? `${aircraftObj.registration}${aircraftObj.model ? ` (${aircraftObj.model})` : aircraftObj.display_name ? ` (${aircraftObj.display_name})` : ''}`
      : 'Assigned Aircraft'

    const customerName =
      prof?.full_name?.trim() ||
      prof?.first_name?.trim() ||
      'Pilot'

    const customerPhone = prof?.phone_number
      ? `${prof.phone_country_code || ''} ${prof.phone_number}`.trim()
      : null

    const dateStr = flightStart.toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'full',
    })

    const timeStr = `${flightStart.toLocaleTimeString('en-AU', {
      timeZone: 'Australia/Sydney',
      timeStyle: 'short',
    })} – ${new Date(booking.scheduled_end).toLocaleTimeString('en-AU', {
      timeZone: 'Australia/Sydney',
      timeStyle: 'short',
    })} AEST`

    const payload = {
      bookingId: booking.id,
      customerId: booking.booking_owner_user_id,
      customerName,
      customerEmail,
      customerPhone,
      pilotArn: prof?.pilot_arn ?? null,
      bookingReference: bookingRef,
      aircraft: aircraftLabel,
      date: dateStr,
      time: timeStr,
      bookingType,
      hoursUntilFlight,
      status: booking.status,
      scheduledStartIso: booking.scheduled_start,
    }

    try {
      // 48-Hour Reminder Check & Enqueue
      if (hoursUntilFlight <= 48) {
        await enqueueUpcomingFlightReminder48hEmails(payload)
        stats.reminders48hEnqueued += 1
      }

      // 12-Hour Reminder Check & Enqueue
      if (hoursUntilFlight <= 12) {
        await enqueueUpcomingFlightReminder12hEmails(payload)
        stats.reminders12hEnqueued += 1
      }
    } catch (err) {
      console.error(`[runUpcomingFlightRemindersSweep] Failed for booking ${booking.id}:`, err)
      stats.skipped += 1
    }
  }

  return stats
}
