'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { validateFlightReviewDate } from '@/lib/utils/flight-review'
import { generateReviewFlags } from '@/lib/booking/review-flags'
import { isNoShowLockedProfile } from '@/lib/checkout-policy'
import {
  getLastFinalizedLogStop,
  buildReadingsFromTotals,
  upsertAircraftFlightLogRecord,
} from '@/lib/aircraft-flight-log'
import { createFlightRecordForBooking } from '@/lib/booking/flight-record-submission'
import { getOutstandingOverageInvoices, overageGateMessage } from '@/lib/payments/block-time-overage'
import { validateTotalOnlyReadings } from '@/lib/aircraft-readings'
import { normalizeActiveCheckoutTerms } from '@/lib/checkout-terms'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateBookingDocumentsReadiness, hasAcceptedCurrentTerms } from '@/lib/booking-readiness'
import { hasManualCheckoutClearance } from '@/lib/checkout-clearance'
import {
  notifyBookingCancelled,
  notifyCancellationRequested,
  notifyAdminCancellationReviewRequired,
  notifyClarificationResponseReceived,
  notifyFlightRecordResubmitted,
} from '@/lib/booking/notifications'
import { enqueueBookingConfirmedEmails } from '@/lib/email/outbox'
import { createPerfLogger } from '@/lib/perf/timing'
import { checkAircraftAvailability } from '@/lib/booking/availability'
import { sydneyInputToUTC } from '@/lib/utils/sydney-time'
import {
  emitBookingChanged,
  emitOpsChanged,
  emitFlightRecordUpdated,
} from '@/lib/realtime/emit'
import type {
  CreateBookingInput,
  SubmitFlightRecordInput,
  ResubmitFlightRecordInput,
  ReviewFlag,
} from '@/lib/supabase/booking-types'
import type { UserDocument } from '@/lib/supabase/types'

// ─── Auth guard ───────────────────────────────────────────────────────────────
// Customers must be cleared for solo hire before creating standard bookings.
// Returns supabase client and the authenticated user id.

async function requireClearedCustomer(perf?: ReturnType<typeof createPerfLogger>) {
  const authCtx = await (perf
    ? perf.time('create_booking', 'create_booking_auth', async () => {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        return { supabase, user, authError }
      })
    : (async () => {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        return { supabase, user, authError }
      })())
  const { supabase, user, authError } = authCtx
  if (authError || !user) throw new Error('Unauthorized')

  const authorize = async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, account_status, pilot_clearance_status, account_lock_reason, has_night_vfr_rating, full_name, email')
      .eq('id', user.id)
      .single()

    if (!profile) throw new Error('Profile not found')
    if (profile.role !== 'customer') throw new Error('Not a customer account')
    if (isNoShowLockedProfile(profile)) {
      throw new Error('ACCOUNT_BLOCKED: Your account is locked due to a checkout no-show. Please contact OZ Rent A Plane.')
    }
    if (profile.account_status === 'blocked') {
      throw new Error('ACCOUNT_BLOCKED: Your account has been blocked. Please contact support.')
    }
    if (profile.pilot_clearance_status !== 'cleared_to_fly') {
      throw new Error('CLEARANCE_REQUIRED: Solo hire bookings are only available to pilots cleared for solo flight.')
    }

  const [{ data: paidInvoice }, { data: historicalClearance }, { data: documents }, termsPrimary, { data: latestTermsAcceptance }] = await Promise.all([
    supabase
      .from('checkout_invoices')
      .select('id')
      .eq('customer_id', user.id)
      .eq('status', 'paid')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('historical_checkout_completions')
      .select('id')
      .eq('customer_id', user.id)
      .eq('checkout_outcome', 'cleared_to_fly')
      .eq('is_active', true)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('user_documents')
      .select('*')
      .eq('user_id', user.id),
    supabase
      .from('terms_documents')
      .select('id, version, public_url, content_hash, is_active, created_at, effective_from')
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('booking_terms_acceptances')
      .select('terms_document_id, terms_version, terms_content_hash, accepted_at')
      .eq('user_id', user.id)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const admin = createAdminClient()
  const authoritativeHistorical = historicalClearance?.id
    ? historicalClearance
    : (await admin
        .from('historical_checkout_completions')
        .select('id')
        .eq('customer_id', user.id)
        .eq('checkout_outcome', 'cleared_to_fly')
        .eq('is_active', true)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()).data

  const authoritativePaidInvoice = paidInvoice?.id
    ? paidInvoice
    : (await admin
        .from('checkout_invoices')
        .select('id')
        .eq('customer_id', user.id)
        .eq('status', 'paid')
        .limit(1)
        .maybeSingle()).data

  const authoritativeTermsAcceptance = latestTermsAcceptance?.accepted_at
    ? latestTermsAcceptance
    : (await admin
        .from('booking_terms_acceptances')
        .select('terms_document_id, terms_version, terms_content_hash, accepted_at')
        .eq('user_id', user.id)
        .order('accepted_at', { ascending: false })
        .limit(1)
        .maybeSingle()).data

  const hasClearancePath = Boolean(authoritativePaidInvoice?.id || authoritativeHistorical?.id)
  const hasManualClearance = await hasManualCheckoutClearance(user.id)
  const effectiveClearancePath = hasClearancePath || hasManualClearance
  if (!effectiveClearancePath) {
    throw new Error('READINESS_REQUIRED: Valid checkout clearance evidence is missing.')
  }

    if (hasManualClearance) {
      return { profile }
    }

    const docItems = evaluateBookingDocumentsReadiness({
      documents: (documents ?? []) as UserDocument[],
      hasNightVfrRating: profile.has_night_vfr_rating ?? null,
    })
    if (docItems.some((item) => item.state !== 'complete')) {
      throw new Error('READINESS_REQUIRED: Required pilot file documents are incomplete.')
    }

    const authoritativeActiveTermsRow = termsPrimary.data ?? (await admin
    .from('terms_documents')
    .select('id, version, public_url, content_hash, is_active, created_at, effective_from')
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()).data
    let activeTerms = normalizeActiveCheckoutTerms((authoritativeActiveTermsRow as Record<string, unknown> | null) ?? null)
    if (!activeTerms) {
      const fallback = await admin
        .from('terms_documents')
        .select('id, version, public_url, content_hash, is_active, created_at, effective_from')
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      activeTerms = normalizeActiveCheckoutTerms((fallback.data as Record<string, unknown> | null) ?? null)
    }
    const termsAccepted = hasAcceptedCurrentTerms(
      activeTerms ? { id: activeTerms.id, version: activeTerms.version, content_hash: activeTerms.content_hash } : null,
      (authoritativeTermsAcceptance as { terms_document_id: string | null; terms_version: string | null; terms_content_hash: string | null; accepted_at: string | null } | null),
    )
    if (!termsAccepted) {
      throw new Error('READINESS_REQUIRED: Current booking terms must be accepted before creating a booking.')
    }

    return { profile }
  }

  const { profile } = await (perf
    ? perf.time('create_booking', 'create_booking_authorization', authorize)
    : authorize())

  return { supabase, userId: user.id, userEmail: profile.email, userFullName: profile.full_name }
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
): Promise<{ bookingId: string; bookingReference: string; bookingStatus: string }> {
  const perf = createPerfLogger({ route: 'server_action:createBooking', role: 'customer' })
  const markTotal = perf.start('create_booking', 'create_booking_total')
  const { supabase, userId, userEmail, userFullName } = await requireClearedCustomer(perf)

  // Overage gate — an unpaid block time overage invoice blocks new bookings.
  const outstandingOverage = await perf.time(
    'create_booking',
    'create_booking_availability_pricing_reads',
    () => getOutstandingOverageInvoices(supabase, userId),
    (result) => ({ rowCount: result.length }),
  )
  if (outstandingOverage.length > 0) {
    throw new Error(overageGateMessage(outstandingOverage))
  }

  const { acceptedIp, userAgent } = await perf.time('create_booking', 'create_booking_validation', async () => {
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
    const h = await headers()
    const forwardedFor = h.get('x-forwarded-for')
    return {
      acceptedIp:
        forwardedFor?.split(',')[0]?.trim() ||
        h.get('x-real-ip')?.trim() ||
        h.get('cf-connecting-ip')?.trim() ||
        null,
      userAgent: h.get('user-agent') ?? null,
    }
  })

  const { data, error } = await perf.time('create_booking', 'create_booking_rpc_write', () => supabase.rpc('create_aircraft_booking_atomic', {
    p_aircraft_id:                   input.aircraft_id,
    p_pic_user_id:                   input.pic_user_id                   ?? null,
    p_pic_name:                      input.pic_name                      ?? null,
    p_pic_arn:                       input.pic_arn                       ?? null,
    p_scheduled_start:               input.scheduled_start,
    p_scheduled_end:                 input.scheduled_end,
    p_customer_notes:                input.customer_notes                ?? null,
    p_terms_accepted:                false,
    p_terms_acceptance_text:         null,
    p_terms_acceptance_confirmed:    false,
    p_accepted_ip:                   acceptedIp,
    p_user_agent:                    userAgent,
    p_risk_acknowledgement_accepted: input.risk_acknowledgement_accepted ?? false,
  }), (result) => ({ rowCount: result.data ? 1 : 0 }))

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
  await perf.time(
    'create_booking',
    'create_booking_profile_update',
    () => supabase
      .from('profiles')
      .update({ last_flight_date: input.last_flight_date })
      .eq('id', userId),
  )

  perf.timeSync('create_booking', 'create_booking_post_write_identity_reads', () => null, { rowCount: 0 })
  perf.timeSync('create_booking', 'create_booking_notification_write', () => null, { rowCount: 0 })

  if (userEmail) {
      const emailPayload = perf.timeSync('create_booking', 'create_booking_email_preparation', () => ({
        customerEmail: userEmail,
        customerName:  userFullName ?? 'Pilot',
        ref:           result.booking_reference ?? result.booking_id.slice(0, 8).toUpperCase(),
        aircraft:      input.aircraft_id,
        start:         new Date(input.scheduled_start).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
        end:           new Date(input.scheduled_end).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
        bookingId:     result.booking_id,
      }))
      await perf.time(
        'create_booking',
        'create_booking_email_enqueue',
        () => enqueueBookingConfirmedEmails(emailPayload),
      )
  }

  perf.timeSync('create_booking', 'create_booking_revalidation', () => {
    revalidatePath('/dashboard')
    revalidatePath('/admin')
  })

  void emitBookingChanged({ bookingId: result.booking_id, userId })
  void emitOpsChanged()

  perf.timeSync('create_booking', 'create_booking_response_ready', () => null)
  markTotal()
  return { bookingId: result.booking_id, bookingReference: result.booking_reference, bookingStatus: result.status }
}

// ─── Mark flight returned ─────────────────────────────────────────────────────
// Customer signals that they have landed and are back.
// Transitions the booking from confirmed / ready_for_dispatch / dispatched
// → awaiting_flight_record after scheduled_end has passed, so the flight
// record form becomes available only post-flight.
// Standard bookings only; checkout bookings use a separate flow.

export async function markFlightReturned(bookingId: string): Promise<void> {
  const { supabase, userId } = await requireClearedCustomer()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, booking_type, aircraft_id, booking_reference, booking_owner_user_id, scheduled_end')
    .eq('id', bookingId)
    .eq('booking_owner_user_id', userId)
    .single()

  if (!booking) throw new Error('Booking not found or access denied.')
  if (booking.booking_type !== 'standard') {
    throw new Error('VALIDATION: Flight Returned is only available for standard aircraft bookings.')
  }

  if (booking.status === 'awaiting_flight_record') return

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

  void emitBookingChanged({ bookingId, userId })
  void emitOpsChanged()
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
    .select('id, aircraft_id, booking_owner_user_id, scheduled_start, scheduled_end, status, pic_name, pic_arn')
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

  return createFlightRecordForBooking(
    supabase,
    booking,
    input,
    { userId, role: 'customer' },
  )
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
    bookingId,
  }).catch(e => console.error('[submitClarificationResponse] notification error:', e))

  revalidatePath('/dashboard')
  revalidatePath('/admin')

  void emitBookingChanged({ bookingId, userId })
  void emitOpsChanged()
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
    .select('id, aircraft_id, booking_owner_user_id, scheduled_start, scheduled_end, status, booking_reference, pic_name, pic_arn')
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

  // Recompute start/stop from last finalized log
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

  // Re-generate review flags on the recalculated readings
  const scheduledHours =
    (new Date(booking.scheduled_end).getTime() - new Date(booking.scheduled_start).getTime()) /
    (1000 * 60 * 60)

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

  const { error: updateErr } = await supabase
    .from('flight_records')
    .update({
      tacho_start:      readings.tacho_start,
      tacho_stop:       readings.tacho_stop,
      vdo_start:        readings.vdo_start,
      vdo_stop:         readings.vdo_stop,
      air_switch_start: readings.air_switch_start,
      air_switch_stop:  readings.air_switch_stop,
      mr_start:         readings.mr_start,
      mr_stop:          readings.mr_stop,
      oil_added:        input.oil_added    ?? null,
      oil_total:        input.oil_total    ?? null,
      fuel_added:       input.fuel_added   ?? null,
      fuel_returned:    input.fuel_returned ?? null,
      landings:         input.landings     ?? null,
      customer_notes:   input.customer_notes ?? null,
      status:           'resubmitted',
      review_flags:     flags.length > 0 ? flags : null,
      updated_at:       now,
    })
    .eq('id', input.flight_record_id)

  if (updateErr) throw new Error('Failed to update flight record.')

  const { data: snapshotProfile } = await supabase
    .from('profiles')
    .select('full_name, pilot_arn')
    .eq('id', userId)
    .single()

  await upsertAircraftFlightLogRecord({
    aircraft_id: booking.aircraft_id,
    flight_date: new Date(booking.scheduled_start).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }),
    pic_user_id: userId,
    pic_name: booking.pic_name || snapshotProfile?.full_name || 'Pilot',
    pic_arn: booking.pic_arn || snapshotProfile?.pilot_arn || null,
    readings,
    related_booking_id: input.booking_id,
    source: 'booking_customer_post_flight',
    review_status: 'pending_admin_review',
    updated_by: userId,
  })

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
    bookingId:    input.booking_id,
  }).catch(e => console.error('[resubmitFlightRecord] notification error:', e))

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/bookings/${input.booking_id}`)
  revalidatePath('/admin/bookings/post-flight')

  void emitFlightRecordUpdated({ bookingId: input.booking_id, userId })
  void emitOpsChanged()
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

  void emitFlightRecordUpdated({ bookingId, userId })

  return { storagePath, attachmentId: attachment.id }
}

// ─── Customer cancellation ────────────────────────────────────────────────────

const CUSTOMER_CANCELLABLE_STATUSES = [
  'confirmed',
  'pending_confirmation',
  'ready_for_dispatch',
  'dispatched',
] as const

// Helper: load & verify booking ownership + cancellable status
async function loadCancellableBooking(bookingId: string) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, booking_type, scheduled_start, aircraft_id, booking_reference, estimated_amount')
    .eq('id', bookingId)
    .eq('booking_owner_user_id', user.id)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'standard') {
    throw new Error('VALIDATION: Only standard bookings can be cancelled by the customer.')
  }
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(booking.status as typeof CUSTOMER_CANCELLABLE_STATUSES[number])) {
    throw new Error(`VALIDATION: Booking cannot be cancelled from status "${booking.status}".`)
  }

  return { supabase, userId: user.id, booking }
}

/**
 * Immediately cancel a booking when departure is more than 24 hours away.
 * Releases all related schedule blocks and records status history.
 */
export async function cancelBookingNow(bookingId: string): Promise<void> {
  const { supabase, userId, booking } = await loadCancellableBooking(bookingId)
  const now = new Date()

  // Server-side 24h guard — must be more than 24h before departure
  const hoursUntilDeparture =
    (new Date(booking.scheduled_start).getTime() - now.getTime()) / (1000 * 60 * 60)

  if (hoursUntilDeparture <= 24) {
    throw new Error(
      'VALIDATION: Departure is within 24 hours. Use requestLateCancellation for late cancellations.',
    )
  }

  const oldStatus = booking.status

  // Cancel the booking
  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      status:                  'cancelled',
      cancellation_category:   'customer',
      updated_at:              now.toISOString(),
    })
    .eq('id', bookingId)

  if (updateErr) throw new Error('Failed to cancel booking.')

  // Release all linked schedule blocks
  await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', bookingId)

  // Status history — customer-facing
  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         oldStatus,
    new_status:         'cancelled',
    changed_by_user_id: userId,
    note:               'Booking cancelled by customer more than 24 hours before departure.',
  })

  // Audit event
  await supabase.from('booking_audit_events').insert({
    booking_id:    bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: userId,
    actor_role:    'customer',
    event_type:    'booking_cancelled',
    event_summary: 'Customer cancelled booking (>24 h before departure).',
    new_value:     { status: 'cancelled', trigger: 'customer_immediate' },
  })

  // Record in cancellation_requests table for audit trail (immediate path)
  await supabase.from('booking_cancellation_requests').insert({
    booking_id:         bookingId,
    user_id:            userId,
    booking_start_time: booking.scheduled_start,
    is_within_24_hours: false,
    status:             'cancelled_without_charge',
  })

  // Notify customer (fire-and-forget)
  const { data: notifyData } = await supabase
    .from('bookings')
    .select('booking_reference, profiles:booking_owner_user_id ( full_name, email )')
    .eq('id', bookingId)
    .single()

  if (notifyData) {
    const prof  = Array.isArray(notifyData.profiles) ? notifyData.profiles[0] : notifyData.profiles
    const email = (prof as { email?: string | null } | null)?.email
    if (email) {
      notifyBookingCancelled({
        customerEmail: email,
        customerName:  (prof as { full_name?: string | null } | null)?.full_name ?? 'Pilot',
        ref:           notifyData.booking_reference ?? bookingId.slice(0, 8).toUpperCase(),
        reason:        'You cancelled this booking.',
        bookingId,
      }).catch(e => console.error('[cancelBookingNow] notification error:', e))
    }
  }

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard')
  revalidatePath('/admin')
  revalidatePath('/admin/bookings/cancellations')

  void emitBookingChanged({ bookingId, userId })
  void emitOpsChanged()
}

/**
 * Submit a cancellation request when departure is 24 hours or less away.
 * Moves the booking to 'cancellation_requested' and records a review entry
 * for the admin. Schedule blocks are NOT released until admin decides.
 */
export async function requestLateCancellation(
  bookingId: string,
  customerMessage: string | null,
): Promise<void> {
  const { supabase, userId, booking } = await loadCancellableBooking(bookingId)
  const now = new Date()

  // Server-side 24h guard — must be within 24h of departure
  const hoursUntilDeparture =
    (new Date(booking.scheduled_start).getTime() - now.getTime()) / (1000 * 60 * 60)

  if (hoursUntilDeparture > 24) {
    throw new Error(
      'VALIDATION: Departure is more than 24 hours away. Use cancelBookingNow instead.',
    )
  }

  // Prevent duplicate requests
  const { data: existingRequest } = await supabase
    .from('booking_cancellation_requests')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingRequest) {
    throw new Error('VALIDATION: A cancellation request is already pending for this booking.')
  }

  const oldStatus = booking.status

  // Move booking to cancellation_requested (blocks are held, not released)
  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      status:     'cancellation_requested',
      updated_at: now.toISOString(),
    })
    .eq('id', bookingId)

  if (updateErr) throw new Error('Failed to submit cancellation request.')

  // Create the pending review record
  await supabase.from('booking_cancellation_requests').insert({
    booking_id:         bookingId,
    user_id:            userId,
    booking_start_time: booking.scheduled_start,
    is_within_24_hours: true,
    customer_message:   customerMessage?.trim() || null,
    status:             'pending',
  })

  // Status history — visible to customer and admin
  const note = customerMessage?.trim()
    ? `Customer requested cancellation less than 24 hours before departure. Message: "${customerMessage.trim()}"`
    : 'Customer requested cancellation less than 24 hours before departure. Admin review required.'

  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         oldStatus,
    new_status:         'cancellation_requested',
    changed_by_user_id: userId,
    note,
  })

  // Audit event
  await supabase.from('booking_audit_events').insert({
    booking_id:    bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: userId,
    actor_role:    'customer',
    event_type:    'cancellation_requested',
    event_summary: 'Customer requested late cancellation (<24 h). Pending admin review.',
    new_value:     { status: 'cancellation_requested', customer_message: customerMessage },
  })

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .single()
  if (profile?.email) {
    await notifyCancellationRequested({
      customerEmail: profile.email,
      bookingId,
    }).catch((error) => console.error('[requestLateCancellation] customer email failed:', error))

    await notifyAdminCancellationReviewRequired({
      bookingId,
      customerName: profile.full_name ?? 'Customer',
      customerEmail: profile.email,
      reason: customerMessage ?? null,
    }).catch((error) => console.error('[requestLateCancellation] admin email failed:', error))
  }

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard')
  revalidatePath('/admin')
  revalidatePath('/admin/bookings/cancellations')

  void emitBookingChanged({ bookingId, userId })
  void emitOpsChanged()
}

/**
 * Reschedule a standard flight booking.
 * If departure is >= 12 hours away, customer can self-reschedule without admin confirmation.
 * If departure is < 12 hours away, manual admin approval is required.
 */
export async function rescheduleFlightBooking(
  bookingId: string,
  newDate: string,
  newStartTime: string,
  newEndTime?: string,
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const requestedStartUtc = sydneyInputToUTC(`${newDate}T${newStartTime}`)
  if (!requestedStartUtc) throw new Error('VALIDATION: Invalid requested flight date/time.')
  const requestedStart = new Date(requestedStartUtc)
  if (requestedStart <= new Date()) throw new Error('VALIDATION: Flight time must be in the future.')

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, booking_type, scheduled_start, scheduled_end, aircraft_id')
    .eq('id', bookingId)
    .eq('booking_owner_user_id', user.id)
    .single()

  if (fetchErr || !booking) throw new Error('Flight booking not found.')
  if (booking.booking_type !== 'standard') throw new Error('VALIDATION: Only standard bookings can be rescheduled here.')

  const origDurationMs = booking.scheduled_end && booking.scheduled_start
    ? Math.max(30 * 60 * 1000, new Date(booking.scheduled_end).getTime() - new Date(booking.scheduled_start).getTime())
    : 2 * 60 * 60 * 1000

  let requestedEndUtc: string
  if (newEndTime) {
    const endUtc = sydneyInputToUTC(`${newDate}T${newEndTime}`)
    if (!endUtc || new Date(endUtc) <= requestedStart) {
      requestedEndUtc = new Date(requestedStart.getTime() + origDurationMs).toISOString()
    } else {
      requestedEndUtc = endUtc
    }
  } else {
    requestedEndUtc = new Date(requestedStart.getTime() + origDurationMs).toISOString()
  }
  const requestedEnd = new Date(requestedEndUtc)

  // 12-hour rule check
  const now = new Date()
  const msUntilCurrent = new Date(booking.scheduled_start).getTime() - now.getTime()
  if (msUntilCurrent < 12 * 60 * 60 * 1000) {
    throw new Error('VALIDATION: Rescheduling within 12 hours of departure requires admin approval. Please contact OZ Rent A Plane.')
  }

  // Check aircraft availability
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('default_preflight_buffer_minutes, default_postflight_buffer_minutes')
    .eq('id', booking.aircraft_id)
    .single()

  const preBufMs = (aircraft?.default_preflight_buffer_minutes ?? 0) * 60_000
  const postBufMs = (aircraft?.default_postflight_buffer_minutes ?? 0) * 60_000
  const expandedStart = new Date(requestedStart.getTime() - preBufMs)
  const expandedEnd = new Date(requestedEnd.getTime() + postBufMs)

  const availability = await checkAircraftAvailability(
    supabase,
    booking.aircraft_id,
    expandedStart,
    expandedEnd,
    { excludeBookingId: bookingId },
  )
  if (!availability.available) {
    throw new Error('AVAILABILITY: The requested flight slot is no longer available.')
  }

  const admin = createAdminClient()

  // Cancel old schedule blocks for this booking
  await admin
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', bookingId)
    .eq('status', 'active')

  // Insert new schedule blocks
  const newBlocks: any[] = [
    {
      aircraft_id: booking.aircraft_id,
      related_booking_id: booking.id,
      block_type: 'customer_booking',
      start_time: requestedStart.toISOString(),
      end_time: requestedEnd.toISOString(),
      public_label: 'Flight Booking',
      internal_reason: null,
      created_by_user_id: user.id,
      created_by_role: 'customer',
      is_public_visible: true,
      status: 'active',
    },
  ]
  if (preBufMs > 0) {
    newBlocks.push({
      aircraft_id: booking.aircraft_id,
      related_booking_id: booking.id,
      block_type: 'buffer',
      start_time: expandedStart.toISOString(),
      end_time: requestedStart.toISOString(),
      public_label: null,
      internal_reason: 'Pre-flight buffer (reschedule)',
      created_by_user_id: user.id,
      created_by_role: 'customer',
      is_public_visible: false,
      status: 'active',
    })
  }
  if (postBufMs > 0) {
    newBlocks.push({
      aircraft_id: booking.aircraft_id,
      related_booking_id: booking.id,
      block_type: 'buffer',
      start_time: requestedEnd.toISOString(),
      end_time: expandedEnd.toISOString(),
      public_label: null,
      internal_reason: 'Post-flight buffer (reschedule)',
      created_by_user_id: user.id,
      created_by_role: 'customer',
      is_public_visible: false,
      status: 'active',
    })
  }

  const { error: insertBlockErr } = await admin.from('schedule_blocks').insert(newBlocks)
  if (insertBlockErr) {
    throw new Error(`Failed to reserve the new schedule block: ${insertBlockErr.message}`)
  }

  // Update booking
  const { error: updateBookingErr } = await admin
    .from('bookings')
    .update({
      scheduled_start: requestedStart.toISOString(),
      scheduled_end: requestedEnd.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', bookingId)

  if (updateBookingErr) {
    throw new Error(`Failed to update flight booking schedule: ${updateBookingErr.message}`)
  }

  await supabase.from('booking_status_history').insert({
    booking_id: bookingId,
    old_status: booking.status,
    new_status: booking.status,
    changed_by_user_id: user.id,
    note: `Customer rescheduled flight to ${newDate} ${newStartTime} (Australia/Sydney).`,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id: bookingId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: user.id,
    actor_role: 'customer',
    event_type: 'booking_rescheduled',
    event_summary: 'Customer rescheduled flight booking.',
    new_value: {
      scheduled_start: requestedStart.toISOString(),
      scheduled_end: requestedEnd.toISOString(),
    },
  })

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard')
  revalidatePath('/admin')
  revalidatePath('/admin/bookings/flights')

  void emitBookingChanged({ bookingId, userId: user.id })
  void emitOpsChanged()

  return { ok: true }
}

