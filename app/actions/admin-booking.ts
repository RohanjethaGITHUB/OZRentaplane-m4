'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  CreateAdminBlockInput,
  CreateAdminBlockResult,
  ApproveFlightRecordInput,
  MeterType,
} from '@/lib/supabase/booking-types'

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

  const allowedStatuses = ['pending_review', 'needs_clarification', 'resubmitted']
  if (!allowedStatuses.includes(flightRecord.status)) {
    throw new Error(
      `VALIDATION: Cannot approve flight record with status "${flightRecord.status}".`
    )
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
    .select('status, aircraft_id')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.status !== 'pending_confirmation') {
    throw new Error(`VALIDATION: Cannot confirm booking with status '${booking.status}'.`)
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', updated_at: now })
    .eq('id', bookingId)

  if (updateErr) throw new Error('Failed to confirm booking.')

  await supabase.from('booking_audit_events').insert({
    booking_id: bookingId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'booking_updated',
    event_summary: 'Admin confirmed pending booking request.',
    new_value: { status: 'confirmed' }
  })

  revalidatePath('/admin')
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
  if (booking.status !== 'pending_confirmation' && booking.status !== 'confirmed') {
    throw new Error(`VALIDATION: Cannot cancel booking with status '${booking.status}'.`)
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ 
      status: 'cancelled', 
      admin_notes: reason,
      updated_at: now 
    })
    .eq('id', bookingId)
    
  if (updateErr) throw new Error('Failed to cancel booking.')

  const { error: blockErr } = await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', bookingId)
    
  if (blockErr) console.error('[cancelBookingRequest] block cancel error:', blockErr)

  await supabase.from('booking_audit_events').insert({
    booking_id: bookingId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'booking_cancelled',
    event_summary: `Admin cancelled booking. Reason: ${reason}`,
    new_value: { status: 'cancelled', reason }
  })

  revalidatePath('/admin')
}
