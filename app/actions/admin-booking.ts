'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  CreateAdminBlockInput,
  CreateAdminBlockResult,
  ApproveFlightRecordInput,
  MeterType,
} from '@/lib/supabase/booking-types'
import {
  notifyBookingConfirmed,
  notifyBookingCancelled,
  notifyClarificationRequested,
  notifyPostFlightClarificationRequested,
} from '@/lib/booking/notifications'
import {
  FLIGHT_RECORD_REVIEW_STATUSES,
  FLIGHT_RECORD_APPROVAL_STATUSES,
} from '@/lib/booking/status-constants'

// ─── Admin guard ──────────────────────────────────────────────────────────────
// Mirrors requireAdmin() in app/actions/admin.ts.

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') throw new Error('Forbidden')
  return { supabase, adminId: user.id }
}

// ─── Create admin schedule block ──────────────────────────────────────────────
// Admin blocks aircraft time for maintenance, owner use, inspection, etc.
//
// Conflict behaviour:
//   - If conflicts exist and force_override = false → returns { created: false, conflicts }
//     so the UI can present a warning before asking for confirmation.
//   - If force_override = true, a non-empty internal_reason is required, then the
//     block is created regardless of conflicts and the override is audited.
//
// Admin blocks do NOT apply aircraft buffer expansion — the admin knows the schedule.
// The check still catches any raw overlap with existing blocks.

export async function createAdminScheduleBlock(
  input: CreateAdminBlockInput,
): Promise<CreateAdminBlockResult> {
  const { supabase, adminId } = await requireAdmin()

  const start = new Date(input.start_time)
  const end   = new Date(input.end_time)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('VALIDATION: Invalid start or end time.')
  }
  if (end <= start) {
    throw new Error('VALIDATION: End time must be after start time.')
  }

  // Delegate to atomic RPC check
  const { data, error } = await supabase.rpc('create_admin_schedule_block_atomic', {
    p_aircraft_id:        input.aircraft_id,
    p_related_booking_id: input.related_booking_id ?? null,
    p_block_type:         input.block_type,
    p_start_time:         input.start_time,
    p_end_time:           input.end_time,
    p_public_label:       input.public_label    ?? null,
    p_internal_reason:    input.internal_reason ?? null,
    p_is_public_visible:  input.is_public_visible ?? false,
    p_expires_at:         input.expires_at ?? null,
    p_exclude_booking_id: input.exclude_booking_id ?? null,
    p_force_override:     input.force_override ?? false,
  })

  if (error) {
    console.error('[createAdminScheduleBlock] RPC failed:', error)
    throw new Error(error.message || 'Failed to create schedule block.')
  }

  const result = data as any
  if (!result.created) {
    return { created: false, conflicts: result.conflicts }
  }

  revalidatePath('/admin')

  return { created: true, blockId: result.blockId }
}

// ─── Approve post-flight review ───────────────────────────────────────────────
// Admin approves a submitted flight record after the post-flight review.
//
// This is the ONLY path that writes official aircraft_meter_history.
// Customer-submitted readings are never committed to official history directly.
//
// Steps:
//   1. Fetch and validate flight record and booking.
//   2. Approve flight record (status → approved or approved_with_correction).
//   3. Update booking (status → post_flight_approved, final_amount set).
//   4. Write aircraft_meter_history for each non-null meter reading.
//   5. Write audit event.
//
// final_amount is a placeholder calculation:
//   billed_hours (from aircraft.billing_meter_type reading) × default_hourly_rate.
// Stripe / Xero integration is NOT included in Milestone 1.

export async function approvePostFlightReview(
  input: ApproveFlightRecordInput,
): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  // Fetch flight record with its meter readings
  const { data: flightRecord, error: frError } = await supabase
    .from('flight_records')
    .select(`
      id, booking_id, aircraft_id, status,
      tacho_start, tacho_stop, tacho_total,
      vdo_start, vdo_stop, vdo_total,
      air_switch_start, air_switch_stop, air_switch_total,
      add_to_mr
    `)
    .eq('id', input.flight_record_id)
    .single()

  if (frError || !flightRecord) {
    throw new Error('Flight record not found.')
  }

  // Approval is only permitted from review-ready statuses.
  // needs_clarification is explicitly blocked: the record was flagged by this
  // admin as needing more information, and the customer must formally resubmit
  // before approval can proceed.
  const allowedForApproval: readonly string[] = FLIGHT_RECORD_APPROVAL_STATUSES
  if (!allowedForApproval.includes(flightRecord.status)) {
    const reason = flightRecord.status === 'needs_clarification'
      ? 'This flight record is awaiting customer clarification. The customer must formally resubmit before it can be approved.'
      : `Cannot approve a flight record with status "${flightRecord.status}".`
    throw new Error(`VALIDATION: ${reason}`)
  }

  if (!flightRecord.booking_id) {
    throw new Error('Flight record has no associated booking.')
  }

  // Fetch aircraft for billing settings
  const { data: aircraft, error: aircraftError } = await supabase
    .from('aircraft')
    .select('billing_meter_type, default_hourly_rate')
    .eq('id', flightRecord.aircraft_id)
    .single()

  if (aircraftError || !aircraft) {
    throw new Error('Aircraft not found.')
  }

  // Placeholder billing calculation based on billing_meter_type
  const meterType = aircraft.billing_meter_type as MeterType
  let billedHours: number | null = null

  if (meterType === 'tacho' && flightRecord.tacho_total != null) {
    billedHours = Number(flightRecord.tacho_total)
  } else if (meterType === 'vdo' && flightRecord.vdo_total != null) {
    billedHours = Number(flightRecord.vdo_total)
  } else if (meterType === 'air_switch' && flightRecord.air_switch_total != null) {
    billedHours = Number(flightRecord.air_switch_total)
  } else if (meterType === 'add_to_mr' && flightRecord.add_to_mr != null) {
    billedHours = Number(flightRecord.add_to_mr)
  }

  const finalAmount =
    billedHours != null
      ? Math.round(billedHours * Number(aircraft.default_hourly_rate) * 100) / 100
      : null

  // 1. Approve flight record
  const newFlightStatus = input.with_correction ? 'approved_with_correction' : 'approved'

  const { error: frUpdateError } = await supabase
    .from('flight_records')
    .update({
      status:              newFlightStatus,
      approved_by_user_id: adminId,
      approved_at:         now,
      admin_notes:         input.admin_notes         ?? null,
      correction_reason:   input.correction_reason   ?? null,
    })
    .eq('id', input.flight_record_id)

  if (frUpdateError) {
    console.error('[approvePostFlightReview] Flight record update failed:', frUpdateError)
    throw new Error('Failed to approve flight record.')
  }

  // 2. Update booking
  // Only overwrite admin_notes if the caller explicitly provided one.
  // Omitting admin_booking_notes preserves any existing note on the booking.
  const bookingUpdate: Record<string, unknown> = {
    status:       'post_flight_approved',
    final_amount: finalAmount,
  }
  if (input.admin_booking_notes != null) {
    bookingUpdate.admin_notes = input.admin_booking_notes
  }

  const { error: bookingUpdateError } = await supabase
    .from('bookings')
    .update(bookingUpdate)
    .eq('id', flightRecord.booking_id)

  if (bookingUpdateError) {
    // Flight record approval already committed — log but don't throw
    console.error('[approvePostFlightReview] Booking update failed:', bookingUpdateError)
  } else {
    await supabase.from('booking_status_history').insert({
      booking_id:         flightRecord.booking_id,
      old_status:         'pending_post_flight_review',
      new_status:         'post_flight_approved',
      changed_by_user_id: adminId,
      note: input.with_correction
        ? `Admin approved post-flight review with correction. ${input.correction_reason ?? ''}`
        : 'Admin approved post-flight review.',
    })
  }

  // 3. Write official aircraft_meter_history
  // Meter entries are only created for non-null readings.
  // add_to_mr is stored with start_reading = 0, stop_reading = value, total = value.
  type MeterEntry = {
    aircraft_id: string
    source_type: string
    source_record_id: string
    booking_id: string
    flight_record_id: string
    meter_type: string
    start_reading: number
    stop_reading: number
    total: number
    is_official: boolean
    is_correction: boolean
    correction_reason: string | null
    entered_by_user_id: string
    approved_by_user_id: string
    approved_at: string
  }

  const meterEntries: MeterEntry[] = []
  const baseEntry = {
    aircraft_id:         flightRecord.aircraft_id,
    source_type:         'customer_booking',
    source_record_id:    input.flight_record_id,
    booking_id:          flightRecord.booking_id,
    flight_record_id:    input.flight_record_id,
    is_official:         true,
    is_correction:       input.with_correction ?? false,
    correction_reason:   input.correction_reason ?? null,
    entered_by_user_id:  adminId,
    approved_by_user_id: adminId,
    approved_at:         now,
  }

  if (
    flightRecord.tacho_start != null &&
    flightRecord.tacho_stop  != null &&
    flightRecord.tacho_total != null
  ) {
    meterEntries.push({
      ...baseEntry,
      meter_type:    'tacho',
      start_reading: Number(flightRecord.tacho_start),
      stop_reading:  Number(flightRecord.tacho_stop),
      total:         Number(flightRecord.tacho_total),
    })
  }

  if (
    flightRecord.vdo_start != null &&
    flightRecord.vdo_stop  != null &&
    flightRecord.vdo_total != null
  ) {
    meterEntries.push({
      ...baseEntry,
      meter_type:    'vdo',
      start_reading: Number(flightRecord.vdo_start),
      stop_reading:  Number(flightRecord.vdo_stop),
      total:         Number(flightRecord.vdo_total),
    })
  }

  if (
    flightRecord.air_switch_start != null &&
    flightRecord.air_switch_stop  != null &&
    flightRecord.air_switch_total != null
  ) {
    meterEntries.push({
      ...baseEntry,
      meter_type:    'air_switch',
      start_reading: Number(flightRecord.air_switch_start),
      stop_reading:  Number(flightRecord.air_switch_stop),
      total:         Number(flightRecord.air_switch_total),
    })
  }

  if (flightRecord.add_to_mr != null) {
    meterEntries.push({
      ...baseEntry,
      meter_type:    'add_to_mr',
      start_reading: 0,
      stop_reading:  Number(flightRecord.add_to_mr),
      total:         Number(flightRecord.add_to_mr),
    })
  }

  if (meterEntries.length > 0) {
    const { error: meterError } = await supabase
      .from('aircraft_meter_history')
      .insert(meterEntries)

    if (meterError) {
      // Flight record and booking already updated — log and continue.
      // Admin can manually reconcile meter history via admin_correction source_type.
      console.error('[approvePostFlightReview] Meter history insert failed:', meterError)
    }
  }

  // 4. Audit event
  await supabase
    .from('booking_audit_events')
    .insert({
      booking_id:          flightRecord.booking_id,
      aircraft_id:         flightRecord.aircraft_id,
      related_record_type: 'flight_record',
      related_record_id:   input.flight_record_id,
      actor_user_id:       adminId,
      actor_role:          'admin',
      event_type:          'post_flight_approved',
      event_summary:       `Admin approved post-flight review. ${meterEntries.length} meter record(s) committed. Final amount: ${finalAmount != null ? `$${finalAmount.toFixed(2)}` : 'not calculated'}.`,
      new_value: {
        flight_record_status:   newFlightStatus,
        booking_status:         'post_flight_approved',
        billed_hours:           billedHours,
        final_amount:           finalAmount,
        meter_entries_created:  meterEntries.length,
        with_correction:        input.with_correction ?? false,
      },
    })

  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

// ─── Confirm booking request ───────────────────────────────────────────────────
export async function confirmBookingRequest(bookingId: string) {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, aircraft_id, scheduled_start, scheduled_end')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.status !== 'pending_confirmation') {
    throw new Error(`VALIDATION: Cannot confirm booking with status '${booking.status}'.`)
  }

  // ── Guard 1: own blocks must still be active ────────────────────────────────
  // Blocks are created atomically at submission. If they're gone it means a
  // direct DB edit occurred outside the normal workflow.
  const { data: ownBlocks, error: ownBlocksErr } = await supabase
    .from('schedule_blocks')
    .select('id, block_type, start_time, end_time')
    .eq('related_booking_id', bookingId)
    .eq('status', 'active')
    .order('start_time')

  if (ownBlocksErr) {
    console.error('[confirmBookingRequest] own blocks query error:', ownBlocksErr)
    throw new Error('Failed to verify slot reservation.')
  }

  if (!ownBlocks || ownBlocks.length === 0) {
    throw new Error(
      'CONFLICT: This booking has no active slot reservation. ' +
      'The schedule blocks may have been removed outside the normal workflow. ' +
      'Cannot confirm without a held slot.'
    )
  }

  // ── Guard 2: no external active conflicts in the held window ─────────────────
  // Derive the true held window from the booking's own blocks.
  // This includes buffer blocks, which extend beyond scheduled_start/scheduled_end.
  // Uses the same overlap rule as the submission RPC:
  //   block.start_time < window_end AND block.end_time > window_start
  const windowStart = ownBlocks.reduce(
    (min, b) => (b.start_time < min ? b.start_time : min),
    ownBlocks[0].start_time,
  )
  const windowEnd = ownBlocks.reduce(
    (max, b) => (b.end_time > max ? b.end_time : max),
    ownBlocks[0].end_time,
  )

  // Fetch all active blocks for this aircraft that overlap the held window.
  // We pull expires_at so we can filter expired temporary holds the same way
  // the submission RPC does.
  const { data: overlapping, error: overlapErr } = await supabase
    .from('schedule_blocks')
    .select('id, block_type, start_time, end_time, expires_at, related_booking_id')
    .eq('aircraft_id', booking.aircraft_id)
    .eq('status', 'active')
    .lt('start_time', windowEnd)
    .gt('end_time', windowStart)

  if (overlapErr) {
    console.error('[confirmBookingRequest] overlap check error:', overlapErr)
    throw new Error('Failed to verify scheduling conflicts.')
  }

  const checkTime = new Date()
  const externalConflicts = (overlapping ?? []).filter(b => {
    // This booking's own blocks are not conflicts.
    if (b.related_booking_id === bookingId) return false
    // Expired temporary holds are not blocking (same rule as submission RPC).
    if (
      b.block_type === 'temporary_hold' &&
      b.expires_at != null &&
      new Date(b.expires_at) <= checkTime
    ) return false
    return true
  })

  if (externalConflicts.length > 0) {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleTimeString('en-AU', {
        timeZone: 'Australia/Sydney',
        hour:     '2-digit',
        minute:   '2-digit',
        hour12:   false,
      })
    const descriptions = externalConflicts
      .map(b => `${b.block_type.replace(/_/g, ' ')} (${fmt(b.start_time)}–${fmt(b.end_time)} AEST)`)
      .join('; ')
    throw new Error(
      `CONFLICT: Cannot confirm — ${externalConflicts.length} external block(s) overlap this booking's held window: ${descriptions}. ` +
      'Remove or reschedule the conflicting block(s) before confirming.'
    )
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', updated_at: now })
    .eq('id', bookingId)

  if (updateErr) throw new Error('Failed to confirm booking.')

  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         'pending_confirmation',
    new_status:         'confirmed',
    changed_by_user_id: adminId,
    note:               'Admin confirmed booking request.',
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'booking_updated',
    event_summary: 'Admin confirmed pending booking request.',
    new_value:     { status: 'confirmed' },
  })

  // Notify customer — fire-and-forget, failures never block the confirm
  const { data: notifyData } = await supabase
    .from('bookings')
    .select(`
      booking_reference,
      scheduled_start,
      scheduled_end,
      profiles:booking_owner_user_id ( full_name, email ),
      aircraft ( registration )
    `)
    .eq('id', bookingId)
    .single()

  if (notifyData) {
    const prof = Array.isArray(notifyData.profiles) ? notifyData.profiles[0] : notifyData.profiles
    const acft = Array.isArray(notifyData.aircraft)  ? notifyData.aircraft[0]  : notifyData.aircraft
    const email = (prof as { email?: string | null } | null)?.email
    if (email) {
      await notifyBookingConfirmed({
        customerEmail: email,
        customerName:  (prof as { full_name?: string | null } | null)?.full_name ?? 'Pilot',
        ref:           notifyData.booking_reference ?? bookingId.slice(0, 8).toUpperCase(),
        aircraft:      (acft as { registration?: string } | null)?.registration ?? 'aircraft',
        start:         new Date(notifyData.scheduled_start).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
        end:           new Date(notifyData.scheduled_end).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
      }).catch(e => console.error('[confirmBookingRequest] notification error:', e))
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/bookings/requests')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/dashboard')
}

// ─── Cancel booking request ────────────────────────────────────────────────────
export async function cancelBookingRequest(bookingId: string, reason: string) {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()
  
  if (!reason || !reason.trim()) {
     throw new Error('VALIDATION: A cancellation reason is required.')
  }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, aircraft_id')
    .eq('id', bookingId)
    .single()
    
  if (fetchErr || !booking) throw new Error('Booking not found.')

  const cancelableStatuses = ['pending_confirmation', 'confirmed', 'needs_clarification']
  if (!cancelableStatuses.includes(booking.status)) {
    throw new Error(`VALIDATION: Cannot cancel booking with status '${booking.status}'.`)
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', admin_notes: reason, updated_at: now })
    .eq('id', bookingId)

  if (updateErr) throw new Error('Failed to cancel booking.')

  const { error: blockErr } = await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', bookingId)

  if (blockErr) console.error('[cancelBookingRequest] block cancel error:', blockErr)

  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         booking.status,
    new_status:         'cancelled',
    changed_by_user_id: adminId,
    note:               `Admin cancelled booking. Reason: ${reason}`,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'booking_cancelled',
    event_summary: `Admin cancelled booking. Reason: ${reason}`,
    new_value:     { status: 'cancelled', reason },
  })

  // Notify customer
  const { data: cancelNotifyData } = await supabase
    .from('bookings')
    .select('booking_reference, profiles:booking_owner_user_id ( full_name, email )')
    .eq('id', bookingId)
    .single()

  if (cancelNotifyData) {
    const prof  = Array.isArray(cancelNotifyData.profiles) ? cancelNotifyData.profiles[0] : cancelNotifyData.profiles
    const email = (prof as { email?: string | null } | null)?.email
    if (email) {
      await notifyBookingCancelled({
        customerEmail: email,
        customerName:  (prof as { full_name?: string | null } | null)?.full_name ?? 'Pilot',
        ref:           cancelNotifyData.booking_reference ?? bookingId.slice(0, 8).toUpperCase(),
        reason,
      }).catch(e => console.error('[cancelBookingRequest] notification error:', e))
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/bookings/requests')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/dashboard')
}

// ─── Request clarification ─────────────────────────────────────────────────────
// Admin moves the booking to `needs_clarification` and stores the question
// in booking_status_history.note — customer-readable per existing RLS.
// The held slot is NOT released; blocks stay active while awaiting the response.
export async function requestClarification(bookingId: string, message: string) {
  const { supabase, adminId } = await requireAdmin()

  if (!message.trim()) throw new Error('VALIDATION: A clarification message is required.')

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, aircraft_id, booking_owner_user_id, booking_reference, scheduled_start, scheduled_end')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')

  const allowed = ['pending_confirmation', 'confirmed']
  if (!allowed.includes(booking.status)) {
    throw new Error(
      `VALIDATION: Clarification can only be requested from pending_confirmation or confirmed. Current status: '${booking.status}'.`
    )
  }

  const now = new Date().toISOString()

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ status: 'needs_clarification', updated_at: now })
    .eq('id', bookingId)

  if (updateErr) throw new Error('Failed to update booking status.')

  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         booking.status,
    new_status:         'needs_clarification',
    changed_by_user_id: adminId,
    note:               message,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'booking_updated',
    event_summary: 'Admin requested clarification from customer.',
    new_value:     { status: 'needs_clarification', message },
  })

  // Notify customer with the question
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', booking.booking_owner_user_id)
    .single()

  if (prof?.email) {
    await notifyClarificationRequested({
      customerEmail: prof.email,
      customerName:  prof.full_name ?? 'Pilot',
      ref:           booking.booking_reference ?? bookingId.slice(0, 8).toUpperCase(),
      question:      message,
    }).catch(e => console.error('[requestClarification] notification error:', e))
  }

  revalidatePath('/admin')
  revalidatePath('/admin/bookings/requests')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/dashboard')
}

// ─── Operational dispatch actions ─────────────────────────────────────────────
// These advance a booking through the post-confirmation operational stages.
// Slot-blocking model is unchanged — blocks remain active through the flight.
// Each action validates the required prior status and writes booking_status_history.

async function adminTransition(
  bookingId: string,
  fromStatus: string | string[],
  toStatus: string,
  historyNote: string,
  auditSummary: string,
) {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()
  const allowed = Array.isArray(fromStatus) ? fromStatus : [fromStatus]

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, aircraft_id')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (!allowed.includes(booking.status)) {
    throw new Error(
      `VALIDATION: Cannot transition to '${toStatus}' from status '${booking.status}'. ` +
      `Required: ${allowed.join(' or ')}.`
    )
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ status: toStatus, updated_at: now })
    .eq('id', bookingId)

  if (updateErr) throw new Error(`Failed to update booking status to '${toStatus}'.`)

  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         booking.status,
    new_status:         toStatus,
    changed_by_user_id: adminId,
    note:               historyNote,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'booking_updated',
    event_summary: auditSummary,
    new_value:     { status: toStatus },
  })

  revalidatePath('/admin')
  revalidatePath('/admin/bookings/requests')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/dashboard')
}

// confirmed → ready_for_dispatch
// Pre-flight checks are done, aircraft prepared, customer cleared to arrive.
export async function adminMarkReadyForDispatch(bookingId: string) {
  return adminTransition(
    bookingId,
    'confirmed',
    'ready_for_dispatch',
    'Admin marked booking as ready for dispatch.',
    'Booking marked ready for dispatch.',
  )
}

// ready_for_dispatch → dispatched
// Aircraft has departed. Clock is running.
export async function adminMarkDispatched(bookingId: string) {
  return adminTransition(
    bookingId,
    'ready_for_dispatch',
    'dispatched',
    'Admin marked aircraft as dispatched.',
    'Aircraft dispatched.',
  )
}

// dispatched → awaiting_flight_record
// Aircraft returned. Customer must now submit their flight record.
export async function adminMarkAircraftReturned(bookingId: string) {
  return adminTransition(
    bookingId,
    'dispatched',
    'awaiting_flight_record',
    'Admin marked aircraft as returned. Flight record required from customer.',
    'Aircraft returned. Awaiting customer flight record.',
  )
}

// post_flight_approved → completed
// All records approved, booking fully closed.
export async function adminMarkCompleted(bookingId: string) {
  return adminTransition(
    bookingId,
    'post_flight_approved',
    'completed',
    'Admin marked booking as completed.',
    'Booking closed as completed.',
  )
}

// ─── Request post-flight clarification ───────────────────────────────────────
// Admin needs more information before approving a flight record.
//
// Rules:
//   • booking.status stays 'pending_post_flight_review' — no change.
//   • flight_record.status moves to 'needs_clarification'.
//   • Valid from: 'pending_review' | 'resubmitted'
//   • Stores category + message in flight_record_clarifications.
//   • Posts a message to verification_events so it surfaces in
//     the customer's /dashboard/messages inbox.
//   • Sends an email notification to the customer.
//
// distinct from Open Conversation (navigation-only, no DB write).

export async function requestPostFlightClarification(input: {
  flightRecordId: string
  bookingId:      string
  customerId:     string
  category:       string
  message:        string
}): Promise<void> {
  const { supabase, adminId } = await requireAdmin()

  if (!input.category.trim()) throw new Error('VALIDATION: A clarification category is required.')
  if (!input.message.trim())  throw new Error('VALIDATION: A clarification message is required.')

  // Verify flight record state
  const { data: fr, error: frErr } = await supabase
    .from('flight_records')
    .select('id, status, booking_id, aircraft_id')
    .eq('id', input.flightRecordId)
    .single()

  if (frErr || !fr) throw new Error('Flight record not found.')
  if (fr.booking_id !== input.bookingId) throw new Error('Flight record does not belong to this booking.')

  const allowedFromStatuses = ['pending_review', 'resubmitted']
  if (!allowedFromStatuses.includes(fr.status)) {
    throw new Error(
      `VALIDATION: Clarification can only be requested when status is pending_review or resubmitted. Current: '${fr.status}'.`,
    )
  }

  // Verify booking is in post-flight review
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('status, booking_reference')
    .eq('id', input.bookingId)
    .single()

  if (bookingErr || !booking) throw new Error('Booking not found.')
  if (booking.status !== 'pending_post_flight_review') {
    throw new Error(
      `VALIDATION: Expected booking status 'pending_post_flight_review'. Current: '${booking.status}'.`,
    )
  }

  const now = new Date().toISOString()

  // 1. Update flight record status
  const { error: frUpdateErr } = await supabase
    .from('flight_records')
    .update({ status: 'needs_clarification', updated_at: now })
    .eq('id', input.flightRecordId)

  if (frUpdateErr) throw new Error('Failed to update flight record status.')

  // 2. Insert structured clarification record
  const { error: clarErr } = await supabase
    .from('flight_record_clarifications')
    .insert({
      flight_record_id: input.flightRecordId,
      booking_id:       input.bookingId,
      requested_by:     adminId,
      category:         input.category,
      message:          input.message,
      is_resolved:      false,
    })

  if (clarErr) {
    console.error('[requestPostFlightClarification] Failed to insert clarification row:', clarErr)
    // Non-fatal: status update already succeeded; log and continue.
  }

  // 3. Post to verification_events so it appears in customer's message inbox
  await supabase.from('verification_events').insert({
    user_id:       input.customerId,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'message',
    request_kind:  'clarification_request',
    title:         'Post-flight clarification needed',
    body:          `[${input.category}] ${input.message}`,
    is_read:       false,
  })

  // 4. Booking audit event
  await supabase.from('booking_audit_events').insert({
    booking_id:          input.bookingId,
    aircraft_id:         fr.aircraft_id,
    related_record_type: 'flight_record',
    related_record_id:   input.flightRecordId,
    actor_user_id:       adminId,
    actor_role:          'admin',
    event_type:          'post_flight_clarification_requested',
    event_summary:       `Admin requested post-flight clarification. Category: ${input.category}`,
    new_value: {
      flight_record_status: 'needs_clarification',
      category:             input.category,
      message:              input.message,
    },
  })

  // 5. Email customer — fire-and-forget
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', input.customerId)
    .single()

  if (prof?.email) {
    await notifyPostFlightClarificationRequested({
      customerEmail: prof.email,
      customerName:  prof.full_name ?? 'Pilot',
      ref:           booking.booking_reference ?? input.bookingId.slice(0, 8).toUpperCase(),
      category:      input.category,
      message:       input.message,
    }).catch(e => console.error('[requestPostFlightClarification] email error:', e))
  }

  revalidatePath('/admin/bookings/post-flight-reviews')
  revalidatePath(`/admin/bookings/post-flight-reviews/${input.flightRecordId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/bookings/${input.bookingId}`)
}

// ─── Confirm checkout booking ──────────────────────────────────────────────────
// Admin confirms a checkout_requested booking.
// Sets booking status → checkout_confirmed.
// Sets profiles.pilot_clearance_status → checkout_confirmed.

export async function confirmCheckoutBooking(bookingId: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, booking_type, aircraft_id, booking_owner_user_id, booking_reference, scheduled_start, scheduled_end')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'checkout') {
    throw new Error('VALIDATION: This booking is not a checkout booking.')
  }
  if (booking.status !== 'checkout_requested') {
    throw new Error(`VALIDATION: Cannot confirm checkout booking with status '${booking.status}'.`)
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ status: 'checkout_confirmed', updated_at: now })
    .eq('id', bookingId)

  if (updateErr) throw new Error('Failed to confirm checkout booking.')

  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         'checkout_requested',
    new_status:         'checkout_confirmed',
    changed_by_user_id: adminId,
    note:               'Approved instructor confirmed checkout booking.',
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'checkout_confirmed',
    event_summary: 'Approved instructor confirmed checkout booking.',
    new_value:     { status: 'checkout_confirmed' },
  })

  // Update pilot clearance status
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ pilot_clearance_status: 'checkout_confirmed', updated_at: now })
    .eq('id', booking.booking_owner_user_id)

  if (profileErr) {
    console.error('[confirmCheckoutBooking] profile update failed:', profileErr)
  }

  // Notify customer — non-fatal
  const fmtStart = new Date(booking.scheduled_start).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short',
  })
  const { error: notifErr } = await supabase.from('verification_events').insert({
    user_id:       booking.booking_owner_user_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'approved',
    request_kind:  'booking_update',
    request_id:    bookingId,
    title:         'Checkout flight confirmed',
    body:          `Your checkout flight has been confirmed for ${fmtStart} (Sydney time).`,
    is_read:       false,
    email_status:  'skipped',
  })
  if (notifErr) console.error('[confirmCheckoutBooking] notification failed:', notifErr.message)

  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

// ─── Mark checkout flight completed ───────────────────────────────────────────
// Called after the physical checkout flight has occurred.
// Transitions: checkout_confirmed → checkout_completed_under_review
// Also sets pilot_clearance_status → checkout_completed_under_review
// Admin then separately records the outcome via markCheckoutOutcome.

export async function markCheckoutFlightCompleted(bookingId: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, booking_type, aircraft_id, booking_owner_user_id')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'checkout') {
    throw new Error('VALIDATION: This booking is not a checkout booking.')
  }
  if (booking.status !== 'checkout_confirmed') {
    throw new Error(`VALIDATION: Checkout flight can only be marked complete from 'checkout_confirmed'. Current: '${booking.status}'.`)
  }

  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({ status: 'checkout_completed_under_review', updated_at: now })
    .eq('id', bookingId)

  if (bookingErr) throw new Error('Failed to update checkout booking.')

  await supabase.from('profiles')
    .update({ pilot_clearance_status: 'checkout_completed_under_review', updated_at: now })
    .eq('id', booking.booking_owner_user_id)

  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         'checkout_confirmed',
    new_status:         'checkout_completed_under_review',
    changed_by_user_id: adminId,
    note:               'Checkout flight marked as completed. Awaiting outcome decision.',
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'checkout_flight_completed',
    event_summary: 'Checkout flight completed. Awaiting outcome decision.',
    new_value:     { status: 'checkout_completed_under_review' },
  })

  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

// ─── Mark checkout outcome ─────────────────────────────────────────────────────
// Called after the checkout flight has been completed (status = checkout_completed_under_review).
// Sets pilot_clearance_status to the chosen outcome and closes the booking.
//
export async function markCheckoutOutcome(input: {
  bookingId:   string
  outcome:     'cleared_for_solo_hire' | 'additional_supervised_time_required' | 'reschedule_required' | 'not_currently_eligible'
  adminNote?:  string
}): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, booking_type, aircraft_id, booking_owner_user_id, booking_reference')
    .eq('id', input.bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'checkout') {
    throw new Error('VALIDATION: This booking is not a checkout booking.')
  }
  if (booking.status !== 'checkout_completed_under_review') {
    throw new Error(`VALIDATION: Outcome can only be recorded from 'checkout_completed_under_review'. Current: '${booking.status}'.`)
  }

  let finalBookingStatus = 'completed'
  let finalClearanceStatus: any = input.outcome

  if (input.outcome === 'cleared_for_solo_hire') {
    const checkout_fee_cents = 29000

    // 1. Calculate available advance
    const { data: ledgerEntries } = await supabase
      .from('customer_payment_ledger')
      .select('amount_cents, entry_type')
      .eq('customer_id', booking.booking_owner_user_id)

    let balanceCents = 0
    if (ledgerEntries) {
      for (const entry of ledgerEntries) {
        if (['advance_credit', 'refund', 'manual_adjustment', 'advance_applied'].includes(entry.entry_type)) {
          balanceCents += entry.amount_cents // Credits are positive, applied/refunds are negative
        }
      }
    }
    balanceCents = Math.max(0, balanceCents)

    const advance_applied_cents = Math.min(balanceCents, checkout_fee_cents)
    const stripe_amount_due_cents = checkout_fee_cents - advance_applied_cents

    const invoiceStatus = stripe_amount_due_cents === 0 ? 'paid' : 'payment_required'
    finalBookingStatus = stripe_amount_due_cents === 0 ? 'completed' : 'checkout_payment_required'
    finalClearanceStatus = stripe_amount_due_cents === 0 ? 'cleared_for_solo_hire' : 'checkout_payment_required'

    // 2. Create checkout invoice
    const { data: invoice, error: invoiceErr } = await supabase
      .from('checkout_invoices')
      .insert({
        customer_id: booking.booking_owner_user_id,
        booking_id: input.bookingId,
        invoice_type: 'checkout',
        status: invoiceStatus,
        subtotal_cents: checkout_fee_cents,
        advance_applied_cents: advance_applied_cents,
        stripe_amount_due_cents: stripe_amount_due_cents,
        total_paid_cents: advance_applied_cents,
        paid_at: stripe_amount_due_cents === 0 ? now : null,
      })
      .select('id')
      .single()

    if (invoiceErr || !invoice) throw new Error('Failed to create checkout invoice.')

    // 3. Apply advance payment if any
    if (advance_applied_cents > 0) {
      await supabase.from('customer_payment_ledger').insert({
        customer_id: booking.booking_owner_user_id,
        booking_id: input.bookingId,
        invoice_id: invoice.id,
        amount_cents: -advance_applied_cents, // Negative convention for applied funds
        entry_type: 'advance_applied',
        note: 'Applied to checkout invoice',
        created_by: adminId,
      })
    }
  }

  // Close the checkout booking (or set to payment required)
  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({
      status:      finalBookingStatus,
      admin_notes: input.adminNote ?? null,
      updated_at:  now,
    })
    .eq('id', input.bookingId)

  if (bookingErr) throw new Error('Failed to update checkout booking status.')

  // Set pilot clearance status
  await supabase.from('profiles')
    .update({ pilot_clearance_status: finalClearanceStatus, updated_at: now })
    .eq('id', booking.booking_owner_user_id)

  await supabase.from('booking_status_history').insert({
    booking_id:         input.bookingId,
    old_status:         'checkout_completed_under_review',
    new_status:         finalBookingStatus,
    changed_by_user_id: adminId,
    note:               `Checkout outcome: ${input.outcome}. ${input.adminNote ?? ''}`.trim(),
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    input.bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'checkout_outcome_recorded',
    event_summary: `Checkout outcome recorded: ${input.outcome}. Status: ${finalBookingStatus}.`,
    new_value:     { outcome: input.outcome, pilot_clearance_status: finalClearanceStatus, booking_status: finalBookingStatus },
  })



  // Notify customer about checkout outcome
  {
    let notifTitle: string
    let notifBody: string

    if (input.outcome === 'cleared_for_solo_hire') {
      const isPaid = finalBookingStatus === 'completed'
      notifTitle = isPaid ? 'Checkout approved' : 'Checkout approved — payment required'
      notifBody  = isPaid
        ? 'Your checkout flight has been approved and paid. Aircraft bookings are now available.'
        : 'Your checkout flight has been approved. Please pay your checkout invoice before aircraft bookings become available.'
    } else if (input.outcome === 'additional_supervised_time_required') {
      notifTitle = 'Additional supervised time required'
      notifBody  = 'Following your checkout, the flight operations team has determined that additional supervised sessions are required before solo hire. Please book another supervised session.'
    } else if (input.outcome === 'reschedule_required') {
      notifTitle = 'Checkout reschedule required'
      notifBody  = 'Your checkout needs to be rescheduled. Please contact the operations team to arrange a new checkout session.'
    } else {
      notifTitle = 'Checkout outcome updated'
      notifBody  = 'Your checkout outcome has been updated. Please contact the operations team for more information.'
    }

    await supabase.from('verification_events').insert({
      user_id:       booking.booking_owner_user_id,
      actor_user_id: adminId,
      actor_role:    'admin',
      event_type:    'approved',
      title:         notifTitle,
      body:          notifBody,
      is_read:       false,
      email_status:  'skipped',
    })
  }

  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

// ─── Cancel checkout booking ───────────────────────────────────────────────────
// Cancels a checkout booking from checkout_requested or checkout_confirmed.
// Releases schedule blocks and resets pilot_clearance_status to checkout_required
// so the pilot can submit a new checkout request.

export async function cancelCheckoutBooking(bookingId: string, reason: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  if (!reason?.trim()) throw new Error('VALIDATION: A reason is required.')

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, booking_type, aircraft_id, booking_owner_user_id, booking_reference')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'checkout') {
    throw new Error('VALIDATION: This booking is not a checkout booking.')
  }

  const cancelable = ['checkout_requested', 'checkout_confirmed']
  if (!cancelable.includes(booking.status)) {
    throw new Error(`VALIDATION: Cannot cancel checkout booking with status '${booking.status}'.`)
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', admin_notes: reason, updated_at: now })
    .eq('id', bookingId)

  if (updateErr) throw new Error('Failed to cancel checkout booking.')

  await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', bookingId)

  // Reset clearance so the pilot can submit a new checkout request
  await supabase.from('profiles')
    .update({ pilot_clearance_status: 'checkout_required', updated_at: now })
    .eq('id', booking.booking_owner_user_id)

  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         booking.status,
    new_status:         'cancelled',
    changed_by_user_id: adminId,
    note:               `Checkout booking cancelled. Reason: ${reason}`,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'checkout_cancelled',
    event_summary: `Checkout booking cancelled. Reason: ${reason}`,
    new_value:     { status: 'cancelled', reason, pilot_clearance_status: 'checkout_required' },
  })



  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

// ─── Admin update checkout time ────────────────────────────────────────────────
// Admin can adjust the checkout slot before confirming.
// Duration is always fixed at exactly 1 hour — only start time is accepted.
//
// Steps:
//   1. Validate booking is checkout_requested.
//   2. Check aircraft availability for new window (1h + buffers), excluding
//      this booking's own blocks.
//   3. Cancel existing schedule blocks for this booking.
//   4. Create new blocks for the updated window.
//   5. Update bookings.scheduled_start / scheduled_end.
//   6. Insert a status_history entry recording the time change.
//
// Safe ordering: availability is checked BEFORE old blocks are cancelled so
// the slot cannot be stolen between the check and the swap.

export async function adminUpdateCheckoutTime(
  bookingId:         string,
  newScheduledStart: string,   // ISO 8601 UTC
): Promise<{ newStart: string; newEnd: string }> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, booking_type, aircraft_id, scheduled_start, scheduled_end, booking_owner_user_id')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'checkout') throw new Error('VALIDATION: This booking is not a checkout booking.')
  if (booking.status !== 'checkout_requested') {
    throw new Error(`VALIDATION: Checkout time can only be edited while status is 'checkout_requested'. Current: '${booking.status}'.`)
  }

  const newStart = new Date(newScheduledStart)
  if (isNaN(newStart.getTime())) throw new Error('VALIDATION: Invalid start time.')
  if (newStart <= new Date()) throw new Error('VALIDATION: Checkout flight time must be in the future.')

  const newEnd       = new Date(newStart.getTime() + 60 * 60 * 1000)
  const newStartISO  = newStart.toISOString()
  const newEndISO    = newEnd.toISOString()

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('default_preflight_buffer_minutes, default_postflight_buffer_minutes')
    .eq('id', booking.aircraft_id)
    .single()

  const preBufMs  = (aircraft?.default_preflight_buffer_minutes  ?? 0) * 60_000
  const postBufMs = (aircraft?.default_postflight_buffer_minutes ?? 0) * 60_000
  const expandedStart = new Date(newStart.getTime() - preBufMs).toISOString()
  const expandedEnd   = new Date(newEnd.getTime()   + postBufMs).toISOString()

  // Check availability — exclude own blocks (will be replaced)
  const { data: overlapping } = await supabase
    .from('schedule_blocks')
    .select('id, block_type, expires_at, related_booking_id')
    .eq('aircraft_id', booking.aircraft_id)
    .eq('status', 'active')
    .lt('start_time', expandedEnd)
    .gt('end_time', expandedStart)

  const checkTime = new Date()
  const conflicts = (overlapping ?? []).filter(b => {
    if (b.related_booking_id === bookingId) return false
    if (b.block_type === 'temporary_hold' && b.expires_at != null && new Date(b.expires_at) <= checkTime) return false
    return true
  })

  if (conflicts.length > 0) {
    throw new Error(`AVAILABILITY: The new time overlaps with ${conflicts.length} existing block(s). Please choose a different time.`)
  }

  // Release old blocks
  await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', bookingId)
    .eq('status', 'active')

  // Create new blocks
  const { error: insertErr } = await supabase
    .from('schedule_blocks')
    .insert([
      {
        aircraft_id: booking.aircraft_id, related_booking_id: bookingId,
        block_type: 'customer_booking',
        start_time: newStartISO, end_time: newEndISO,
        public_label: 'Checkout Flight', internal_reason: null,
        created_by_user_id: adminId, created_by_role: 'admin',
        is_public_visible: true, status: 'active',
      },
      {
        aircraft_id: booking.aircraft_id, related_booking_id: bookingId,
        block_type: 'buffer',
        start_time: expandedStart, end_time: newStartISO,
        public_label: null, internal_reason: 'Pre-flight buffer (checkout — admin updated)',
        created_by_user_id: adminId, created_by_role: 'admin',
        is_public_visible: false, status: 'active',
      },
      {
        aircraft_id: booking.aircraft_id, related_booking_id: bookingId,
        block_type: 'buffer',
        start_time: newEndISO, end_time: expandedEnd,
        public_label: null, internal_reason: 'Post-flight buffer (checkout — admin updated)',
        created_by_user_id: adminId, created_by_role: 'admin',
        is_public_visible: false, status: 'active',
      },
    ])

  if (insertErr) throw new Error('Failed to create schedule blocks for updated time.')

  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({ scheduled_start: newStartISO, scheduled_end: newEndISO, updated_at: now })
    .eq('id', bookingId)

  if (bookingErr) throw new Error('Failed to update booking times.')

  const fmtOld = new Date(booking.scheduled_start).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'short', timeStyle: 'short' })
  const fmtNew = newStart.toLocaleString('en-AU',                          { timeZone: 'Australia/Sydney', dateStyle: 'short', timeStyle: 'short' })

  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         'checkout_requested',
    new_status:         'checkout_requested',
    changed_by_user_id: adminId,
    note:               `Checkout time updated by admin from ${fmtOld} to ${fmtNew} (Sydney time).`,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'checkout_time_updated',
    event_summary: `Admin updated checkout time: ${fmtOld} → ${fmtNew}.`,
    old_value:     { scheduled_start: booking.scheduled_start, scheduled_end: booking.scheduled_end },
    new_value:     { scheduled_start: newStartISO,              scheduled_end: newEndISO },
  })

  // Notify customer of time change — non-fatal
  const { error: notifErr2 } = await supabase.from('verification_events').insert({
    user_id:       booking.booking_owner_user_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'message',
    request_kind:  'general_update',
    title:         'Checkout flight time updated',
    body:          `Your checkout flight time has been updated to ${fmtNew} (Sydney time).`,
    is_read:       false,
    email_status:  'skipped',
  })
  if (notifErr2) console.error('[adminUpdateCheckoutTime] notification failed:', notifErr2.message)

  revalidatePath('/admin')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/dashboard')

  return { newStart: newStartISO, newEnd: newEndISO }
}
