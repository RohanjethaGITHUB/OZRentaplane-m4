'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validateFlightReviewDate } from '@/lib/utils/flight-review'
import { generateReviewFlags } from '@/lib/booking/review-flags'
import {
  notifyBookingSubmitted,
  notifyClarificationResponseReceived,
  notifyFlightRecordResubmitted,
} from '@/lib/booking/notifications'
import type {
  CreateBookingInput,
  SubmitFlightRecordInput,
  ResubmitFlightRecordInput,
  ReviewFlag,
  FlightRecordLandingRow,
} from '@/lib/supabase/booking-types'

// ─── Auth guard ───────────────────────────────────────────────────────────────
// Customers must be cleared for solo hire before creating standard bookings.
// Returns supabase client and the authenticated user id.

async function requireClearedCustomer() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, account_status, pilot_clearance_status')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Profile not found')
  if (profile.role !== 'customer') throw new Error('Not a customer account')
  if (profile.account_status === 'blocked') {
    throw new Error('ACCOUNT_BLOCKED: Your account has been blocked. Please contact support.')
  }
  if (profile.pilot_clearance_status !== 'cleared_to_fly') {
    throw new Error('CLEARANCE_REQUIRED: Solo hire bookings are only available to pilots cleared for solo flight.')
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
): Promise<{ bookingId: string; bookingReference: string }> {
  const { supabase, userId } = await requireClearedCustomer()

  // Flight review date — required and must be within the last 2 years
  const flightReviewErr = validateFlightReviewDate(input.last_flight_date ?? '')
  if (flightReviewErr) throw new Error(`VALIDATION: ${flightReviewErr}`)

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
    booking_id:        string
    booking_reference: string
    status:            string
    estimated_hours:   number
    estimated_amount:  number
  }

  // Save flight review date to the customer's profile so it pre-fills on future bookings.
  // Non-throwing — booking is already created; a sync failure here is not critical.
  await supabase
    .from('profiles')
    .update({ last_flight_date: input.last_flight_date })
    .eq('id', userId)

  revalidatePath('/dashboard')
  revalidatePath('/admin')

  // Notify customer — fire-and-forget
  const supabase2 = await createClient()
  const { data: { user: u } } = await supabase2.auth.getUser()
  if (u) {
    const { data: prof } = await supabase2
      .from('profiles')
      .select('full_name, email')
      .eq('id', u.id)
      .single()
    if (prof?.email) {
      await notifyBookingSubmitted({
        customerEmail: prof.email,
        customerName:  prof.full_name ?? 'Pilot',
        ref:           result.booking_reference ?? result.booking_id.slice(0, 8).toUpperCase(),
        aircraft:      input.aircraft_id,
        start:         new Date(input.scheduled_start).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
        end:           new Date(input.scheduled_end).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
      }).catch(e => console.error('[createBooking] notification error:', e))
    }
  }

  return { bookingId: result.booking_id, bookingReference: result.booking_reference }
}

// ─── Mark flight returned ─────────────────────────────────────────────────────
// Customer signals that they have landed and are back.
// Transitions the booking from confirmed / ready_for_dispatch / dispatched
// → awaiting_flight_record so the flight record form becomes available.
// Standard bookings only; checkout bookings use a separate flow.

export async function markFlightReturned(bookingId: string): Promise<void> {
  const { supabase, userId } = await requireClearedCustomer()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, booking_type, aircraft_id, booking_reference, booking_owner_user_id')
    .eq('id', bookingId)
    .eq('booking_owner_user_id', userId)
    .single()

  if (!booking) throw new Error('Booking not found or access denied.')
  if (booking.booking_type !== 'standard') {
    throw new Error('VALIDATION: Flight Returned is only available for standard aircraft bookings.')
  }

  const allowed = ['confirmed', 'ready_for_dispatch', 'dispatched']
  if (!allowed.includes(booking.status)) {
    throw new Error(`VALIDATION: Cannot mark flight returned for a booking with status "${booking.status}".`)
  }

  const now = new Date().toISOString()

  await supabase
    .from('bookings')
    .update({ status: 'awaiting_flight_record', updated_at: now })
    .eq('id', bookingId)

  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         booking.status,
    new_status:         'awaiting_flight_record',
    changed_by_user_id: userId,
    note:               'Customer confirmed flight has returned.',
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: userId,
    actor_role:    'customer',
    event_type:    'booking_updated',
    event_summary: 'Customer marked flight as returned.',
    new_value:     { status: 'awaiting_flight_record' },
  })

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard/bookings')
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
  const { supabase, userId } = await requireClearedCustomer()

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
      console.error('[submitFlightRecord] Landing rows insert failed:', landingErr)
      // Non-fatal — flight record created, admin can add landing details manually.
    }
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

// ─── Submit clarification response ────────────────────────────────────────────
// Customer responds to an admin clarification request.
// Status moves back to pending_confirmation so the admin can re-review.
// The held slot is NOT released — blocks remain active throughout.
export async function submitClarificationResponse(
  bookingId: string,
  response:  string,
): Promise<void> {
  const { supabase, userId } = await requireClearedCustomer()

  if (!response.trim()) throw new Error('VALIDATION: A response is required.')

  // Ownership + status gate
  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, aircraft_id, booking_reference, booking_owner_user_id')
    .eq('id', bookingId)
    .eq('booking_owner_user_id', userId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found or access denied.')
  if (booking.status !== 'needs_clarification') {
    throw new Error('VALIDATION: This booking is not awaiting clarification.')
  }

  const now = new Date().toISOString()

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ status: 'pending_confirmation', updated_at: now })
    .eq('id', bookingId)

  if (updateErr) throw new Error('Failed to submit response.')

  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         'needs_clarification',
    new_status:         'pending_confirmation',
    changed_by_user_id: userId,
    note:               response,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: userId,
    actor_role:    'customer',
    event_type:    'booking_updated',
    event_summary: 'Customer submitted clarification response.',
    new_value:     { status: 'pending_confirmation', response },
  })

  // Notify admin — fire-and-forget
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()

  await notifyClarificationResponseReceived({
    ref:          booking.booking_reference ?? bookingId.slice(0, 8).toUpperCase(),
    customerName: prof?.full_name ?? 'Customer',
    response,
  }).catch(e => console.error('[submitClarificationResponse] notification error:', e))

  revalidatePath('/dashboard')
  revalidatePath('/admin')
}

// ─── Resubmit flight record ───────────────────────────────────────────────────
// Customer formally updates and resubmits a flight record that is in
// 'needs_clarification' state after an admin review request.
//
// Rules:
//   • booking.status stays 'pending_post_flight_review' — no change.
//   • flight_record.status moves to 'resubmitted'.
//   • Valid from: 'needs_clarification' only.
//   • Re-runs review flag generation on the updated readings.
//   • Marks the open flight_record_clarifications row as resolved.
//   • A message alone does NOT trigger this — only this explicit action.

export async function resubmitFlightRecord(
  input: ResubmitFlightRecordInput,
): Promise<void> {
  const { supabase, userId } = await requireClearedCustomer()

  // Ownership + status gate
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, aircraft_id, booking_owner_user_id, scheduled_start, scheduled_end, status, booking_reference')
    .eq('id', input.booking_id)
    .eq('booking_owner_user_id', userId)
    .single()

  if (bookingErr || !booking) throw new Error('Booking not found or access denied.')
  if (booking.status !== 'pending_post_flight_review') {
    throw new Error(
      `VALIDATION: Expected booking status 'pending_post_flight_review'. Current: '${booking.status}'.`,
    )
  }

  // Verify flight record ownership and state
  const { data: fr, error: frErr } = await supabase
    .from('flight_records')
    .select('id, status, booking_id, aircraft_id')
    .eq('id', input.flight_record_id)
    .eq('booking_id', input.booking_id)
    .single()

  if (frErr || !fr) throw new Error('Flight record not found or access denied.')
  if (fr.status !== 'needs_clarification') {
    throw new Error(
      `VALIDATION: Resubmission is only allowed when flight record status is 'needs_clarification'. Current: '${fr.status}'.`,
    )
  }

  // Re-generate review flags on the updated readings
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

  const now = new Date().toISOString()

  // Update flight record — preserve existing fields not in input
  const { error: updateErr } = await supabase
    .from('flight_records')
    .update({
      tacho_start:      input.tacho_start      ?? null,
      tacho_stop:       input.tacho_stop       ?? null,
      vdo_start:        input.vdo_start        ?? null,
      vdo_stop:         input.vdo_stop         ?? null,
      air_switch_start: input.air_switch_start ?? null,
      air_switch_stop:  input.air_switch_stop  ?? null,
      add_to_mr:        input.add_to_mr        ?? null,
      oil_added:        input.oil_added        ?? null,
      oil_total:        input.oil_total        ?? null,
      fuel_added:       input.fuel_added       ?? null,
      fuel_actual:      input.fuel_actual      ?? null,
      landings:         input.landings         ?? null,
      customer_notes:   input.customer_notes   ?? null,
      status:           'resubmitted',
      review_flags:     flags.length > 0 ? flags : null,
      updated_at:       now,
    })
    .eq('id', input.flight_record_id)

  if (updateErr) throw new Error('Failed to update flight record.')

  // Mark the open clarification as resolved
  await supabase
    .from('flight_record_clarifications')
    .update({ is_resolved: true, resolved_at: now })
    .eq('flight_record_id', input.flight_record_id)
    .eq('is_resolved', false)

  // Audit event
  await supabase.from('booking_audit_events').insert({
    booking_id:          input.booking_id,
    aircraft_id:         booking.aircraft_id,
    related_record_type: 'flight_record',
    related_record_id:   input.flight_record_id,
    actor_user_id:       userId,
    actor_role:          'customer',
    event_type:          'flight_record_resubmitted',
    event_summary:       `Customer resubmitted flight record. ${flags.length} review flag(s) generated.`,
    new_value: {
      flight_record_status: 'resubmitted',
      review_flag_count:    flags.length,
    },
  })

  // Notify admin — fire-and-forget
  const [{ data: prof }, { data: aircraft }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    supabase.from('aircraft').select('registration').eq('id', booking.aircraft_id).single(),
  ])

  await notifyFlightRecordResubmitted({
    ref:          booking.booking_reference ?? input.booking_id.slice(0, 8).toUpperCase(),
    customerName: prof?.full_name ?? 'Customer',
    aircraftReg:  (aircraft as { registration?: string } | null)?.registration ?? 'Unknown',
  }).catch(e => console.error('[resubmitFlightRecord] notification error:', e))

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/bookings/${input.booking_id}`)
  revalidatePath('/admin/bookings/post-flight')
}

// ─── Upload flight record evidence ────────────────────────────────────────────
// Uploads a single evidence file to the flight_record_evidence storage bucket
// and records metadata in flight_record_attachments.
//
// Called from the client after submitFlightRecord() or resubmitFlightRecord()
// returns the flight_record_id.  One call per file.
//
// Storage path: {bookingId}/{flightRecordId}/{timestamp}-{random}.{ext}
// Bucket:       flight_record_evidence  (private, 10 MB limit, JPEG/PNG only)
//
// Allowed flight record statuses for upload:
//   pending_review  — just submitted (initial flow)
//   resubmitted     — just resubmitted (clarification flow)
//
// needs_clarification is intentionally excluded: the customer must trigger a
// formal resubmit (changing status to resubmitted) before new evidence is
// accepted.  This keeps the evidence timeline clean.

export async function uploadFlightRecordEvidence(
  formData: FormData,
): Promise<{ storagePath: string; attachmentId: string }> {
  const { supabase, userId } = await requireClearedCustomer()

  const file           = formData.get('file')           as File   | null
  const flightRecordId = formData.get('flightRecordId') as string | null
  const bookingId      = formData.get('bookingId')      as string | null

  if (!file || !flightRecordId || !bookingId) {
    throw new Error('VALIDATION: Missing required upload fields.')
  }

  // Type + size validated server-side (defence in depth; client already validates)
  const ALLOWED = new Set(['image/jpeg', 'image/png'])
  const MAX_BYTES = 10 * 1024 * 1024

  if (!ALLOWED.has(file.type)) {
    throw new Error('VALIDATION: Only JPEG and PNG files are allowed.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `VALIDATION: File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB per file.`,
    )
  }

  // Verify booking ownership
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id')
    .eq('id', bookingId)
    .eq('booking_owner_user_id', userId)
    .single()

  if (bookingErr || !booking) throw new Error('Booking not found or access denied.')

  // Verify flight record belongs to booking and is in an upload-permitted state
  const { data: fr, error: frErr } = await supabase
    .from('flight_records')
    .select('id, status, aircraft_id')
    .eq('id', flightRecordId)
    .eq('booking_id', bookingId)
    .single()

  if (frErr || !fr) throw new Error('Flight record not found.')

  const uploadableStatuses = ['pending_review', 'resubmitted']
  if (!uploadableStatuses.includes(fr.status)) {
    throw new Error(
      `VALIDATION: Evidence cannot be uploaded for a flight record with status "${fr.status}".`,
    )
  }

  // Build a unique, collision-safe storage path
  const ext     = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const safeExt = ['jpg', 'jpeg', 'png'].includes(ext) ? ext : 'jpg'
  const unique  = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const storagePath = `${bookingId}/${flightRecordId}/${unique}.${safeExt}`

  // Upload to bucket
  const { error: uploadErr } = await supabase.storage
    .from('flight_record_evidence')
    .upload(storagePath, file, { contentType: file.type })

  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

  // Record metadata — atomic: if this fails, remove the orphaned file
  const { data: attachment, error: dbErr } = await supabase
    .from('flight_record_attachments')
    .insert({
      flight_record_id:    flightRecordId,
      booking_id:          bookingId,
      aircraft_id:         fr.aircraft_id,
      uploaded_by_user_id: userId,
      attachment_type:     'other',
      storage_path:        storagePath,
      file_name:           file.name,
      mime_type:           file.type,
      file_size:           file.size,
    })
    .select('id')
    .single()

  if (dbErr || !attachment) {
    // Best-effort cleanup of the already-uploaded file
    await supabase.storage.from('flight_record_evidence').remove([storagePath])
    throw new Error('Failed to record attachment metadata. The file was not saved.')
  }

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath(`/admin/bookings/post-flight/${flightRecordId}`)

  return { storagePath, attachmentId: attachment.id }
}
