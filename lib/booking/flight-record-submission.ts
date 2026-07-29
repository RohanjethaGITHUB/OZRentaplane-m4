// ─── Shared flight record submission core ────────────────────────────────────
// Creates a post-flight record from total-only readings, upserts the aircraft
// flight log, records landing rows, advances the booking to
// pending_post_flight_review, writes the audit trail, and emails the customer.
//
// Called by two server actions:
//   • submitFlightRecord (customer self-submission — app/actions/booking.ts)
//   • adminSubmitFlightRecord (admin on-behalf submission — app/actions/admin-booking.ts)
// The callers own their auth and status gates; this core assumes the booking
// has already been validated for the acting user.

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateReviewFlags } from '@/lib/booking/review-flags'
import {
  getLastFinalizedLogStop,
  buildReadingsFromTotals,
  upsertAircraftFlightLogRecord,
} from '@/lib/aircraft-flight-log'
import { validateTotalOnlyReadings } from '@/lib/aircraft-readings'
import { notifyFlightRecordSubmitted } from '@/lib/booking/notifications'
import { emitFlightRecordUpdated, emitBookingChanged, emitOpsChanged } from '@/lib/realtime/emit'
import type {
  SubmitFlightRecordInput,
  ReviewFlag,
  FlightRecordLandingRow,
} from '@/lib/supabase/booking-types'

export type FlightRecordSubmissionBooking = {
  id: string
  aircraft_id: string
  booking_owner_user_id: string
  scheduled_start: string
  scheduled_end: string
  status: string
  pic_name: string | null
  pic_arn: string | null
}

export type FlightRecordSubmissionActor = {
  userId: string
  role: 'customer' | 'admin'
}

export async function createFlightRecordForBooking(
  supabase: SupabaseClient,
  booking: FlightRecordSubmissionBooking,
  input: SubmitFlightRecordInput,
  actor: FlightRecordSubmissionActor,
): Promise<{ flightRecordId: string }> {
  const scheduledHours =
    (new Date(booking.scheduled_end).getTime() - new Date(booking.scheduled_start).getTime()) /
    (1000 * 60 * 60)

  // Validate total-only input
  validateTotalOnlyReadings({
    vdo_total:        input.vdo_total,
    tacho_total:      input.tacho_total,
    air_switch_total: input.air_switch_total,
    mr_total:         input.mr_total,
    oil_added:        input.oil_added ?? null,
    oil_total:        input.oil_total ?? null,
    fuel_added:       input.fuel_added ?? null,
    fuel_returned:    input.fuel_returned ?? null,
    landings:         input.landings ?? null,
    notes:            input.customer_notes ?? null,
  })

  // Compute start/stop from last finalized aircraft log
  const baseline = await getLastFinalizedLogStop(booking.aircraft_id)
  const readings = buildReadingsFromTotals(
    {
      vdo_total:        input.vdo_total,
      tacho_total:      input.tacho_total,
      air_switch_total: input.air_switch_total,
      mr_total:         input.mr_total,
      oil_added:        input.oil_added ?? null,
      oil_total:        input.oil_total ?? null,
      fuel_added:       input.fuel_added ?? null,
      fuel_returned:    input.fuel_returned ?? null,
      landings:         input.landings ?? null,
      notes:            input.customer_notes ?? null,
    },
    baseline,
  )

  const flags: ReviewFlag[] = generateReviewFlags({
    tacho_start:      readings.tacho_start,
    tacho_stop:       readings.tacho_stop,
    vdo_start:        readings.vdo_start,
    vdo_stop:         readings.vdo_stop,
    air_switch_start: readings.air_switch_start,
    air_switch_stop:  readings.air_switch_stop,
    oil_added:        input.oil_added,
    fuel_added:       input.fuel_added,
    landings:         input.landings,
    scheduled_hours:  scheduledHours,
  })

  const now = new Date().toISOString()

  // Insert flight record with calculated start/stop (admin can review/correct in billing panel)
  const { data: flightRecord, error: frError } = await supabase
    .from('flight_records')
    .insert({
      booking_id:              input.booking_id,
      aircraft_id:             booking.aircraft_id,
      date:                    input.date,
      pic_name:                input.pic_name           ?? null,
      pic_arn:                 input.pic_arn            ?? null,
      tacho_start:             readings.tacho_start,
      tacho_stop:              readings.tacho_stop,
      vdo_start:               readings.vdo_start,
      vdo_stop:                readings.vdo_stop,
      air_switch_start:        readings.air_switch_start,
      air_switch_stop:         readings.air_switch_stop,
      mr_start:                readings.mr_start,
      mr_stop:                 readings.mr_stop,
      oil_added:               input.oil_added          ?? null,
      oil_total:               input.oil_total          ?? null,
      fuel_added:              input.fuel_added         ?? null,
      fuel_returned:           input.fuel_returned      ?? null,
      landings:                input.landings           ?? null,
      customer_notes:          input.customer_notes     ?? null,
      declaration_accepted_at: input.declaration_accepted ? now : null,
      signature_type:          input.signature_type     ?? 'none',
      signature_value:         input.signature_value    ?? null,
      submitted_by_user_id:    actor.userId,
      submitted_at:            now,
      status:                  'pending_review',
      review_flags:            flags.length > 0 ? flags : null,
    })
    .select('id')
    .single()

  if (frError || !flightRecord) {
    console.error('[createFlightRecordForBooking] Insert failed:', frError)
    throw new Error('Failed to submit flight record. Please try again.')
  }

  const { data: snapshotProfile } = await supabase
    .from('profiles')
    .select('full_name, pilot_arn')
    .eq('id', booking.booking_owner_user_id)
    .single()

  const ledgerPicName =
    input.pic_name?.trim() ||
    booking.pic_name ||
    snapshotProfile?.full_name ||
    'Pilot'
  const ledgerPicArn =
    input.pic_arn?.trim() ||
    booking.pic_arn ||
    snapshotProfile?.pilot_arn ||
    null

  await upsertAircraftFlightLogRecord({
    aircraft_id: booking.aircraft_id,
    flight_date: input.date,
    pic_user_id: booking.booking_owner_user_id,
    pic_name: ledgerPicName,
    pic_arn: ledgerPicArn,
    readings,
    related_booking_id: input.booking_id,
    source: 'booking_customer_post_flight',
    review_status: 'pending_admin_review',
    created_by: actor.userId,
    updated_by: actor.userId,
  })

  // Insert per-airport landing rows (mandatory for standard bookings)
  if (input.landing_rows && input.landing_rows.length > 0) {
    const landingInserts = input.landing_rows.map((row: FlightRecordLandingRow) => ({
      flight_record_id: flightRecord.id,
      airport_id:       row.airport_id,
      landing_count:    row.landing_count,
    }))
    const { error: landingErr } = await supabase
      .from('flight_record_landings')
      .insert(landingInserts)
    if (landingErr) {
      console.error('[createFlightRecordForBooking] Landing rows insert failed:', landingErr)
      // Non-fatal — flight record created, admin can add landing details manually.
    }
  }

  // Advance booking status
  const { error: bookingUpdateError } = await supabase
    .from('bookings')
    .update({ status: 'pending_post_flight_review' })
    .eq('id', input.booking_id)

  if (bookingUpdateError) {
    console.error('[createFlightRecordForBooking] Booking status update failed:', bookingUpdateError)
    // Flight record was created — log but continue. Admin can fix status manually.
  }

  // Audit event
  const submittedBySummary = actor.role === 'admin'
    ? `Admin submitted flight record on behalf of the customer. ${flags.length} review flag(s) generated.`
    : `Customer submitted flight record. ${flags.length} review flag(s) generated.`

  await supabase
    .from('booking_audit_events')
    .insert({
      booking_id:          input.booking_id,
      aircraft_id:         booking.aircraft_id,
      related_record_type: 'flight_record',
      related_record_id:   flightRecord.id,
      actor_user_id:       actor.userId,
      actor_role:          actor.role,
      event_type:          'flight_record_submitted',
      event_summary:       submittedBySummary,
      new_value: {
        flight_record_id:   flightRecord.id,
        booking_status:     'pending_post_flight_review',
        review_flag_count:  flags.length,
        has_errors:         flags.some(f => f.severity === 'error'),
      },
    })

  revalidatePath('/dashboard')
  revalidatePath('/admin')

  void emitFlightRecordUpdated({ bookingId: input.booking_id, userId: booking.booking_owner_user_id })
  void emitBookingChanged({ bookingId: input.booking_id, userId: booking.booking_owner_user_id })
  void emitOpsChanged()

  // Confirmation email always goes to the booking owner (the customer),
  // regardless of who submitted the record.
  const [{ data: ownerProfile }, { data: aircraft }] = await Promise.all([
    supabase.from('profiles').select('full_name, email').eq('id', booking.booking_owner_user_id).single(),
    supabase.from('aircraft').select('registration').eq('id', booking.aircraft_id).single(),
  ])
  if (ownerProfile?.email) {
    await notifyFlightRecordSubmitted({
      bookingId: input.booking_id,
      customerEmail: ownerProfile.email,
      customerName: ownerProfile.full_name ?? 'Pilot',
      aircraft: (aircraft as { registration?: string } | null)?.registration ?? 'Aircraft',
      bookingDate: new Date(booking.scheduled_start).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
    }).catch((error) => console.error('[createFlightRecordForBooking] email failed:', error))
  }

  return { flightRecordId: flightRecord.id }
}
