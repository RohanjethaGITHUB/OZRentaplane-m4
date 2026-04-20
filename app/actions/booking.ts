'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generateReviewFlags } from '@/lib/booking/review-flags'
import type {
  CreateBookingInput,
  SubmitFlightRecordInput,
  ReviewFlag,
} from '@/lib/supabase/booking-types'

// ─── Auth guard ───────────────────────────────────────────────────────────────
// Customers must be verified before creating bookings.
// Returns supabase client and the authenticated user id.

async function requireVerifiedCustomer() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, verification_status')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Profile not found')
  if (profile.role !== 'customer') throw new Error('Not a customer account')
  if (profile.verification_status !== 'verified') {
    throw new Error('VERIFICATION_REQUIRED: Your account must be verified before making bookings.')
  }

  return { supabase, userId: user.id }
}

// ─── Create booking ───────────────────────────────────────────────────────────
// Delegates to create_aircraft_booking_atomic() Postgres RPC, which performs
// all inserts (booking + schedule blocks + audit event) in one transaction.
// If any step fails the entire operation rolls back — no orphaned bookings.
//
// TypeScript-side date validation runs before the RPC call for fast failure.
// The RPC re-validates server-side for defence in depth.

export async function createBooking(
  input: CreateBookingInput,
): Promise<{ bookingId: string }> {
  const { supabase } = await requireVerifiedCustomer()

  const start = new Date(input.scheduled_start)
  const end   = new Date(input.scheduled_end)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('VALIDATION: Invalid start or end time.')
  }
  if (end <= start) {
    throw new Error('VALIDATION: End time must be after start time.')
  }
  if (start <= new Date()) {
    throw new Error('VALIDATION: Booking start time must be in the future.')
  }

  const { data, error } = await supabase.rpc('create_aircraft_booking_atomic', {
    p_aircraft_id:                   input.aircraft_id,
    p_pic_user_id:                   input.pic_user_id                   ?? null,
    p_pic_name:                      input.pic_name                      ?? null,
    p_pic_arn:                       input.pic_arn                       ?? null,
    p_scheduled_start:               input.scheduled_start,
    p_scheduled_end:                 input.scheduled_end,
    p_customer_notes:                input.customer_notes                ?? null,
    p_terms_accepted:                input.terms_accepted                ?? false,
    p_risk_acknowledgement_accepted: input.risk_acknowledgement_accepted ?? false,
  })

  if (error) {
    // Preserve VALIDATION: / AVAILABILITY: / UNAUTHORIZED: prefixes so callers
    // can distinguish user-facing errors from internal failures.
    console.error('[createBooking] RPC failed:', error)
    throw new Error(error.message)
  }

  const result = data as {
    booking_id:       string
    status:           string
    estimated_hours:  number
    estimated_amount: number
  }

  revalidatePath('/dashboard')
  revalidatePath('/admin')

  return { bookingId: result.booking_id }
}

// ─── Submit flight record ─────────────────────────────────────────────────────
// Customer submits post-flight readings after a flight.
//
// - Booking must be in dispatched / awaiting_flight_record / flight_record_overdue.
// - Generates review_flags for admin review.
// - Does NOT update official aircraft_meter_history — that requires admin approval.
// - Moves booking → pending_post_flight_review.
// - Moves flight record → pending_review.

export async function submitFlightRecord(
  input: SubmitFlightRecordInput,
): Promise<{ flightRecordId: string }> {
  const { supabase, userId } = await requireVerifiedCustomer()

  // Verify booking ownership and status
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, aircraft_id, booking_owner_user_id, scheduled_start, scheduled_end, status')
    .eq('id', input.booking_id)
    .eq('booking_owner_user_id', userId)
    .single()

  if (bookingError || !booking) {
    throw new Error('Booking not found or access denied.')
  }

  const allowedStatuses = ['dispatched', 'awaiting_flight_record', 'flight_record_overdue']
  if (!allowedStatuses.includes(booking.status)) {
    throw new Error(
      `VALIDATION: Cannot submit flight record for a booking with status "${booking.status}".`
    )
  }

  const scheduledHours =
    (new Date(booking.scheduled_end).getTime() - new Date(booking.scheduled_start).getTime()) /
    (1000 * 60 * 60)

  const flags: ReviewFlag[] = generateReviewFlags({
    tacho_start:      input.tacho_start,
    tacho_stop:       input.tacho_stop,
    vdo_start:        input.vdo_start,
    vdo_stop:         input.vdo_stop,
    air_switch_start: input.air_switch_start,
    air_switch_stop:  input.air_switch_stop,
    add_to_mr:        input.add_to_mr,
    oil_added:        input.oil_added,
    fuel_added:       input.fuel_added,
    landings:         input.landings,
    scheduled_hours:  scheduledHours,
  })

  // ── Start-reading mismatch check ──────────────────────────────────────────
  // Compare submitted start readings against the last official approved stop
  // readings.  Uses a security-definer function so the customer's auth context
  // can call it without direct SELECT access to aircraft_meter_history.
  //
  // Flags:
  //   error   — submitted start < last approved stop (meter went backwards)
  //   warning — submitted start > last approved stop + 2 h (unexplained gap)

  const { data: lastStopRows } = await supabase
    .rpc('get_aircraft_last_meter_stops', { p_aircraft_id: booking.aircraft_id })

  const lastStop: Record<string, number> = {}
  for (const row of (lastStopRows ?? []) as Array<{ meter_type: string; stop_reading: number }>) {
    lastStop[row.meter_type] = Number(row.stop_reading)
  }

  const MISMATCH_GAP_THRESHOLD = 2.0 // hours — warn if unexplained gap > 2 h

  function checkStartMismatch(
    meterLabel: string,
    prefix: string,
    submitted: number | null | undefined,
  ) {
    if (submitted == null) return
    const lastApproved = lastStop[prefix]
    if (lastApproved == null) return  // no history yet — first flight

    if (submitted < lastApproved - 0.05) {
      flags.push({
        key: `${prefix}_start_before_last_approved`,
        severity: 'error',
        message: `${meterLabel} start reading (${submitted}) is less than the last approved stop reading (${lastApproved.toFixed(2)}). Possible data entry error or meter rollover.`,
      })
    } else if (submitted > lastApproved + MISMATCH_GAP_THRESHOLD) {
      const gap = (submitted - lastApproved).toFixed(2)
      flags.push({
        key: `${prefix}_start_gap`,
        severity: 'warning',
        message: `${meterLabel} start reading (${submitted}) is ${gap} hours ahead of the last approved stop (${lastApproved.toFixed(2)}). Confirm no uncaptured flights occurred between sessions.`,
      })
    }
  }

  checkStartMismatch('Tacho',      'tacho',      input.tacho_start)
  checkStartMismatch('VDO',        'vdo',        input.vdo_start)
  checkStartMismatch('Air Switch', 'air_switch', input.air_switch_start)
  // add_to_mr is a cumulative addition value (start is always 0) — no mismatch check

  const now = new Date().toISOString()

  // Insert flight record
  const { data: flightRecord, error: frError } = await supabase
    .from('flight_records')
    .insert({
      booking_id:              input.booking_id,
      aircraft_id:             booking.aircraft_id,
      date:                    input.date,
      pic_name:                input.pic_name           ?? null,
      pic_arn:                 input.pic_arn            ?? null,
      tacho_start:             input.tacho_start        ?? null,
      tacho_stop:              input.tacho_stop         ?? null,
      vdo_start:               input.vdo_start          ?? null,
      vdo_stop:                input.vdo_stop           ?? null,
      air_switch_start:        input.air_switch_start   ?? null,
      air_switch_stop:         input.air_switch_stop    ?? null,
      add_to_mr:               input.add_to_mr          ?? null,
      oil_added:               input.oil_added          ?? null,
      oil_total:               input.oil_total          ?? null,
      fuel_added:              input.fuel_added         ?? null,
      fuel_actual:             input.fuel_actual        ?? null,
      landings:                input.landings           ?? null,
      customer_notes:          input.customer_notes     ?? null,
      declaration_accepted_at: input.declaration_accepted ? now : null,
      signature_type:          input.signature_type     ?? 'none',
      signature_value:         input.signature_value    ?? null,
      submitted_by_user_id:    userId,
      submitted_at:            now,
      status:                  'pending_review',
      review_flags:            flags.length > 0 ? flags : null,
    })
    .select('id')
    .single()

  if (frError || !flightRecord) {
    console.error('[submitFlightRecord] Insert failed:', frError)
    throw new Error('Failed to submit flight record. Please try again.')
  }

  // Advance booking status
  const { error: bookingUpdateError } = await supabase
    .from('bookings')
    .update({ status: 'pending_post_flight_review' })
    .eq('id', input.booking_id)

  if (bookingUpdateError) {
    console.error('[submitFlightRecord] Booking status update failed:', bookingUpdateError)
    // Flight record was created — log but continue. Admin can fix status manually.
  }

  // Audit event
  await supabase
    .from('booking_audit_events')
    .insert({
      booking_id:          input.booking_id,
      aircraft_id:         booking.aircraft_id,
      related_record_type: 'flight_record',
      related_record_id:   flightRecord.id,
      actor_user_id:       userId,
      actor_role:          'customer',
      event_type:          'flight_record_submitted',
      event_summary:       `Customer submitted flight record. ${flags.length} review flag(s) generated.`,
      new_value: {
        flight_record_id:   flightRecord.id,
        booking_status:     'pending_post_flight_review',
        review_flag_count:  flags.length,
        has_errors:         flags.some(f => f.severity === 'error'),
      },
    })

  revalidatePath('/dashboard')
  revalidatePath('/admin')

  return { flightRecordId: flightRecord.id }
}
