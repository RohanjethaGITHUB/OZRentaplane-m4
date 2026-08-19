'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordManualPayment, adminSettleBlockTimeInvoice } from '@/app/actions/payment'
import { settleCheckoutInvoiceManually } from '@/lib/payments/settle-checkout-invoice'
import type {
  CreateAdminBlockInput,
  CreateAdminBlockResult,
  ApproveFlightRecordInput,
  MeterType,
} from '@/lib/supabase/booking-types'
import {
  notifyBookingConfirmed,
  notifyBookingCancelled,
  notifyPostFlightClarificationRequested,
} from '@/lib/booking/notifications'
import { enqueueCheckoutConfirmedEmail, enqueueCheckoutRejectedEmails } from '@/lib/email/outbox'
import { sendEmail } from '@/lib/email/send-email'
import { checkoutOutcomeEmail } from '@/lib/email/templates/checkout'
import { landingFeeInvoiceReadyEmail, paymentConfirmedEmail } from '@/lib/email/templates/payment'
import { generateInvoicePdf } from '@/lib/invoices/pdf'
import { storeInvoicePdf } from '@/lib/invoices/pdf-storage'
import { generateStandardBookingInvoicePdf } from '@/lib/invoices/standard-booking-pdf'
import {
  type AircraftReadings,
  type TotalOnlyReadings,
  calculateAircraftReadingsTotals,
  hasMaterialAircraftReadingChanges,
  validateAircraftReadings,
  validateTotalOnlyReadings,
} from '@/lib/aircraft-readings'
import {
  getAircraftFlightLogByRelatedBooking,
  getLastFinalizedLogStop,
  buildReadingsFromTotals,
  upsertAircraftFlightLogRecord,
} from '@/lib/aircraft-flight-log'
import {
  resolveStandardBookingBillingBranch,
  resolveBlockTimeLandingSettlement,
  resolveMinimumVdoBilling,
  resolveMaximumVdoHours,
  type ManualSettlementMethod,
  type MinimumVdoDecision,
} from '@/lib/booking/standard-booking-billing'
import {
  FLIGHT_RECORD_REVIEW_STATUSES,
  FLIGHT_RECORD_APPROVAL_STATUSES,
} from '@/lib/booking/status-constants'
import { createFlightRecordForBooking } from '@/lib/booking/flight-record-submission'
import { sydneyInputToUTC, todaySydneyDateKey } from '@/lib/utils/sydney-time'
import { PAYF_RATE_PER_HOUR } from '@/lib/pricing-constants'
import { createPerfLogger } from '@/lib/perf/timing'
import { CHECKOUT_BLOCKING_DOCUMENT_TYPES } from '@/lib/checkout-document-gate'
import {
  emitBookingChanged,
  emitOpsChanged,
  emitPaymentUpdated,
  emitClearanceUpdated,
  emitFlightRecordUpdated,
  emitBlockTimeUpdated,
  emitChatMessage,
} from '@/lib/realtime/emit'

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

  revalidatePath('/admin/calendar')

  void emitOpsChanged()

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

  // 2. Update booking & apply credit atomically
  const subtotalCents = finalAmount != null ? Math.round(finalAmount * 100) : 0
  const { error: bookingUpdateError } = await supabase.rpc('apply_credit_to_standard_booking_atomic', {
    p_booking_id: flightRecord.booking_id,
    p_subtotal_cents: subtotalCents,
    p_final_amount: finalAmount,
    p_new_status: 'post_flight_approved',
    p_admin_notes: input.admin_booking_notes ?? null
  })

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

  revalidatePath(`/admin/bookings/requests/${flightRecord.booking_id}`)
  revalidatePath(`/dashboard/bookings/${flightRecord.booking_id}`)

  const { data: ownerRow } = await supabase
    .from('bookings')
    .select('booking_owner_user_id')
    .eq('id', flightRecord.booking_id)
    .single()
  if (ownerRow?.booking_owner_user_id) {
    void emitBookingChanged({ bookingId: flightRecord.booking_id, userId: ownerRow.booking_owner_user_id })
    void emitFlightRecordUpdated({ bookingId: flightRecord.booking_id, userId: ownerRow.booking_owner_user_id })
  }
  void emitOpsChanged()
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
      booking_owner_user_id,
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
        bookingId,
      }).catch(e => console.error('[confirmBookingRequest] notification error:', e))
    }
  }

  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/admin/bookings/checkout')
  revalidatePath(`/dashboard/bookings/${bookingId}`)

  if (notifyData?.booking_owner_user_id) {
    void emitBookingChanged({ bookingId, userId: notifyData.booking_owner_user_id })
  }
  void emitOpsChanged()
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
    .update({ status: 'cancelled', admin_notes: reason, checkout_lifecycle_status: 'cancelled_by_admin', updated_at: now })
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
    .select('booking_reference, booking_owner_user_id, profiles:booking_owner_user_id ( full_name, email )')
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
        bookingId,
      }).catch(e => console.error('[cancelBookingRequest] notification error:', e))
    }
  }

  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/admin/bookings/checkout')
  revalidatePath(`/dashboard/bookings/${bookingId}`)

  if (cancelNotifyData?.booking_owner_user_id) {
    void emitBookingChanged({ bookingId, userId: cancelNotifyData.booking_owner_user_id })
  }
  void emitOpsChanged()
}

// ─── Request clarification ─────────────────────────────────────────────────────
// Admin moves the booking to `needs_clarification` and stores the question
// in booking_status_history.note — customer-readable per existing RLS.
// The held slot is NOT released; blocks stay active while awaiting the response.
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
    .select('status, aircraft_id, booking_owner_user_id')
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
  revalidatePath('/admin/bookings/checkout')
  revalidatePath(`/admin/bookings/checkout/${bookingId}`)
  revalidatePath('/dashboard')

  if (booking.booking_owner_user_id) {
    void emitBookingChanged({ bookingId, userId: booking.booking_owner_user_id })
  }
  void emitOpsChanged()
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

// confirmed / ready_for_dispatch / dispatched → awaiting_flight_record
// Aircraft returned after scheduled_end. Customer must now submit their flight record.
// The manual "Mark Dispatched" step has been removed from the admin flow, so this
// transition now accepts any operational prior state ('dispatched' remains valid
// for legacy bookings that were dispatched before the step was removed).
export async function adminMarkAircraftReturned(bookingId: string) {
  const { supabase } = await requireAdmin()
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('scheduled_end')
    .eq('id', bookingId)
    .single()

  if (error || !booking) throw new Error('Booking not found.')
  if (new Date(booking.scheduled_end).getTime() > Date.now()) {
    throw new Error('VALIDATION: Aircraft can only be marked returned after the scheduled end time has passed.')
  }

  return adminTransition(
    bookingId,
    ['confirmed', 'ready_for_dispatch', 'dispatched'],
    'awaiting_flight_record',
    'Admin marked aircraft as returned. Flight record required from customer.',
    'Aircraft returned. Awaiting customer flight record.',
  )
}

// post_flight_approved → completed
// All records approved, booking fully closed.
export async function adminMarkCompleted(bookingId: string) {
  await adminTransition(
    bookingId,
    'post_flight_approved',
    'completed',
    'Admin marked booking as completed.',
    'Booking closed as completed.',
  )

  // Completed bookings must not keep active schedule holds (same as checkout / mark-paid).
  const { supabase } = await requireAdmin()
  await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', bookingId)
    .eq('status', 'active')
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
      bookingId:     input.bookingId,
    }).catch(e => console.error('[requestPostFlightClarification] email error:', e))
  }

  revalidatePath('/admin/bookings/post-flight')
  revalidatePath(`/admin/bookings/post-flight/${input.flightRecordId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/bookings/${input.bookingId}`)

  void emitBookingChanged({ bookingId: input.bookingId, userId: input.customerId })
  void emitFlightRecordUpdated({ bookingId: input.bookingId, userId: input.customerId })
  void emitChatMessage(input.customerId)
  void emitOpsChanged()
}

export async function confirmCheckoutBooking(
  bookingId: string,
  options?: { overrideUnapprovedDocs?: boolean },
): Promise<void> {
  const perf = createPerfLogger({ route: 'server_action:confirmCheckoutBooking', role: 'admin' })
  const markTotal = perf.start('checkout_approval', 'checkout_approval_total')
  const { supabase, adminId } = await perf.time('checkout_approval', 'checkout_approval_auth', () => requireAdmin())
  perf.timeSync('checkout_approval', 'checkout_approval_authorization', () => null)
  const now = new Date().toISOString()

  const { data: booking, error: fetchErr } = await perf.time('checkout_approval', 'checkout_approval_booking_read', () => supabase
    .from('bookings')
    .select('status, booking_type, aircraft_id, booking_owner_user_id, booking_reference, scheduled_start, scheduled_end')
    .eq('id', bookingId)
    .single(),
    (result) => ({ rowCount: result.data ? 1 : 0 }),
  )

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'checkout') {
    throw new Error('VALIDATION: This booking is not a checkout booking.')
  }
  // Older document-triggered holds may still contain checkout requests. Treat
  // those as reviewable checkout requests so the stale hold cannot block admin.
  if (!['checkout_requested', 'on_hold_pending_documents'].includes(booking.status)) {
    throw new Error(`VALIDATION: Cannot confirm checkout booking with status '${booking.status}'.`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('has_night_vfr_rating')
    .eq('id', booking.booking_owner_user_id)
    .single()

  const { data: docs } = await supabase
    .from('user_documents')
    .select('document_type, status, expiry_date')
    .eq('user_id', booking.booking_owner_user_id)
    .in('document_type', ['pilot_licence', 'medical_certificate', 'photo_id', 'night_vfr_evidence'])

  const todayIso = new Date().toISOString().slice(0, 10)
  const hasNightVfrEvidence = (docs ?? []).some((d) => d.document_type === 'night_vfr_evidence')
  const requiredTypes = [
    ...CHECKOUT_BLOCKING_DOCUMENT_TYPES,
    ...(profile?.has_night_vfr_rating || hasNightVfrEvidence ? ['night_vfr_evidence' as const] : []),
  ]

  if (!options?.overrideUnapprovedDocs) {
    for (const type of requiredTypes) {
      const candidates = (docs ?? []).filter((d) => d.document_type === type)
      const approved = candidates.find((d) => d.status === 'approved')
      if (!approved) {
        throw new Error('VALIDATION: All required documents must be approved before confirming checkout.')
      }
      if (
        type !== 'pilot_licence' &&
        approved.expiry_date &&
        approved.expiry_date < todayIso
      ) {
        throw new Error(`VALIDATION: A required document (${type.replace(/_/g, ' ')}) has expired. Ask the customer to upload a replacement before confirming.`)
      }
    }
  }

  const actionNote = options?.overrideUnapprovedDocs
    ? 'Approved instructor confirmed checkout booking (with pending/rejected documents acknowledged by admin).'
    : 'Approved instructor confirmed checkout booking.'

  const { bookingUpdate, historyInsert, auditInsert, profileUpdate } = await perf.time('checkout_approval', 'checkout_approval_primary_write', async () => {
    const bookingUpdate = await supabase
      .from('bookings')
      .update({ status: 'checkout_confirmed', updated_at: now })
      .eq('id', bookingId)

    if (bookingUpdate.error) {
      return { bookingUpdate, historyInsert: null, auditInsert: null, profileUpdate: null }
    }

    const [historyInsert, auditInsert, profileUpdate] = await Promise.all([
      supabase.from('booking_status_history').insert({
        booking_id:         bookingId,
        old_status:         booking.status,
        new_status:         'checkout_confirmed',
        changed_by_user_id: adminId,
        note:               actionNote,
      }),
      supabase.from('booking_audit_events').insert({
        booking_id:    bookingId,
        aircraft_id:   booking.aircraft_id,
        actor_user_id: adminId,
        actor_role:    'admin',
        event_type:    'checkout_confirmed',
        event_summary: actionNote,
        new_value:     { status: 'checkout_confirmed', override_unapproved_docs: !!options?.overrideUnapprovedDocs },
      }),
      supabase
        .from('profiles')
        .update({ pilot_clearance_status: 'checkout_confirmed', updated_at: now })
        .eq('id', booking.booking_owner_user_id),
    ])

    return { bookingUpdate, historyInsert, auditInsert, profileUpdate }
  })

  if (bookingUpdate.error) throw new Error('Failed to confirm checkout booking.')
  if (historyInsert?.error) console.error('[confirmCheckoutBooking] history insert failed:', historyInsert.error.message)
  if (auditInsert?.error) console.error('[confirmCheckoutBooking] audit insert failed:', auditInsert.error.message)
  if (profileUpdate?.error) {
    console.error('[confirmCheckoutBooking] profile update failed:', profileUpdate.error.message)
  }

  // Notify customer — non-fatal
  const fmtStart = new Date(booking.scheduled_start).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short',
  })
  const { error: notifErr } = await perf.time('checkout_approval', 'checkout_approval_notification_write', () => supabase.from('verification_events').insert({
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
  }))
  if (notifErr) console.error('[confirmCheckoutBooking] notification failed:', notifErr.message)

  const [customerProfileRes, aircraftRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', booking.booking_owner_user_id)
      .single(),
    supabase
      .from('aircraft')
      .select('registration')
      .eq('id', booking.aircraft_id)
      .single(),
  ])
  const customerProfile = customerProfileRes.data
  const aircraft = aircraftRes.data
  if (customerProfile?.email) {
    await perf.time('checkout_approval', 'checkout_approval_email_enqueue', () => enqueueCheckoutConfirmedEmail({
      customerName: customerProfile.full_name ?? 'Pilot',
      customerEmail: customerProfile.email,
      bookingId,
      time: fmtStart,
      aircraft: aircraft?.registration ?? 'Assigned aircraft',
    }))
  }

  perf.timeSync('checkout_approval', 'checkout_approval_revalidation', () => {
    revalidatePath(`/admin/bookings/requests/${bookingId}`)
    revalidatePath('/admin/bookings/checkout')
    revalidatePath('/admin')
    revalidatePath(`/dashboard/bookings/${bookingId}`)
    revalidatePath('/dashboard/bookings')
    revalidatePath('/dashboard')
  })

  await Promise.all([
    emitBookingChanged({ bookingId, userId: booking.booking_owner_user_id }),
    emitClearanceUpdated(booking.booking_owner_user_id),
    emitOpsChanged(),
  ])

  perf.timeSync('checkout_approval', 'checkout_approval_response_ready', () => null)
  markTotal()
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

  void emitBookingChanged({ bookingId, userId: booking.booking_owner_user_id })
  void emitClearanceUpdated(booking.booking_owner_user_id)
  void emitOpsChanged()
}

// ─── Mark checkout outcome ─────────────────────────────────────────────────────
// Called after the checkout flight has been completed (status = checkout_completed_under_review).
// Routes ALL 4 outcomes through complete_checkout_outcome_atomic, which:
//   - creates a checkout invoice for every outcome
//   - applies existing customer credit
//   - moves booking → checkout_payment_required (or completed if credit covers all)
//   - stores checkout_outcome on the invoice for post-payment clearance promotion
//
// Billing source of truth: VDO reading from the aircraft paper sheet.
//   Final amount = vdoReading × rate + landing fees.
//   The RPC calculates everything server-side; the client only previews.
//
export async function markCheckoutOutcome(input: {
  bookingId:            string
  outcome:              'cleared_to_fly' | 'additional_checkout_required' | 'checkout_reschedule_required' | 'not_currently_eligible'
  adminNote?:           string
  readings:             TotalOnlyReadings
  checkoutRatePerHour?: number   // admin-entered hourly rate in dollars (default 290)
  landingCharges?:      { airportId: string; landingCount: number }[]
  // Waiver path (non-cleared outcomes only)
  paymentWaived?:       boolean
  waiverReason?:        string
  suppressPaymentRequestEmail?: boolean
  // Mark-paid path: settle the checkout invoice in the same action so the
  // outcome and the settlement cannot be split by a client-side failure.
  manualPayment?: {
    paymentMethod: 'cash' | 'card_in_person' | 'bank_transfer'
    amountCents:   number
    note?:         string
  }
}): Promise<void> {
  const { supabase, adminId } = await requireAdmin()

  // ── Manual payment validation — fail fast BEFORE the outcome is recorded ──
  if (input.manualPayment) {
    if (input.paymentWaived) {
      throw new Error('VALIDATION: A manual payment cannot be recorded when payment is waived.')
    }
    if (!Number.isInteger(input.manualPayment.amountCents) || input.manualPayment.amountCents <= 0) {
      throw new Error('VALIDATION: Manual payment amount must be a positive whole number of cents.')
    }
  }

  // ── Waiver validation (duplicated in RPC for defence-in-depth) ───────────
  if (input.paymentWaived) {
    if (input.outcome === 'cleared_to_fly') {
      throw new Error('VALIDATION: Payment cannot be waived for the cleared_to_fly outcome.')
    }
    if (!input.waiverReason?.trim()) {
      throw new Error('VALIDATION: A waiver reason is required when payment is waived.')
    }
  }

  // ── Hourly rate validation — always required (waiver path also stores the rate for audit) ──
  const ratePerHour = input.checkoutRatePerHour ?? 290
  if (!isFinite(ratePerHour) || ratePerHour <= 0) {
    throw new Error('VALIDATION: Hourly rate must be a positive number.')
  }

  validateTotalOnlyReadings(input.readings)
  const vdoReading = input.readings.vdo_total
  if (!input.paymentWaived) {
    if (vdoReading == null || isNaN(vdoReading)) {
      throw new Error('VALIDATION: VDO total is required.')
    }
    if (vdoReading <= 0) {
      throw new Error('VALIDATION: VDO total must be greater than 0.')
    }
    if (vdoReading < 0.1) {
      throw new Error(`VALIDATION: VDO total (${vdoReading}h) is below minimum of 0.1h. Check the readings.`)
    }
    if (vdoReading > 5.0) {
      throw new Error(`VALIDATION: VDO total (${vdoReading}h) exceeds maximum of 5.0h. Check the readings.`)
    }
  }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, booking_type, aircraft_id, booking_owner_user_id, booking_reference, scheduled_start')
    .eq('id', input.bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'checkout') {
    throw new Error('VALIDATION: This booking is not a checkout booking.')
  }
  if (booking.status !== 'checkout_completed_under_review') {
    throw new Error(`VALIDATION: Outcome can only be recorded from 'checkout_completed_under_review'. Current: '${booking.status}'.`)
  }

  // ── Landing charge validation (Required for ALL outcomes) ─────────────────
  // Enforce: airport required when count > 0; count must be positive integer.
  // Silently ignore rows that are entirely empty (no airport, no count).
  // Reject rows that are half-filled to avoid silent data loss.
  // Enforce minimum 1 landing row.
  let validCount = 0
  for (const row of input.landingCharges ?? []) {
    const count = row.landingCount
    const hasAirport = !!row.airportId?.trim()
    const hasCount   = Number.isFinite(count) && count > 0
    
    if (hasAirport && hasCount) {
      validCount++
    }
    
    if (hasCount && !hasAirport) {
      throw new Error('VALIDATION: Airport is required for each landing row with a count greater than 0.')
    }
    if (hasAirport && !hasCount) {
      throw new Error('VALIDATION: Landing count must be at least 1 when an airport is selected.')
    }
    if (hasCount && !Number.isInteger(count)) {
      throw new Error('VALIDATION: Landing count must be a whole number.')
    }
    if (hasCount && count < 0) {
      throw new Error('VALIDATION: Landing count cannot be negative.')
    }
  }
  
  if (validCount === 0) {
    throw new Error('VALIDATION: At least one landing airport is required for all checkouts.')
  }

  // ── Build landing charges JSON ────────────────────────────────────────────
  // After the above validation, the only rows reaching this filter are
  // fully valid (both airport and count present) or fully empty (both absent).
  const landingChargesJson = input.landingCharges
        ? input.landingCharges
            .filter(lc => lc.airportId && lc.landingCount > 0)
            .map(lc => ({ airport_id: lc.airportId, landing_count: lc.landingCount }))
        : []

  // ── Single atomic RPC ─────────────────────────────────────────────────────
  // VDO reading is passed to the RPC; all billing is calculated server-side.
  // Waiver path passes null for vdo_reading — the RPC skips VDO validation.
  // Convert admin-entered dollars to integer cents for the RPC.
  const checkoutRateCents = Math.round(ratePerHour * 100)

  const rpcPayload = {
    p_booking_id:                   input.bookingId,
    p_customer_id:                  booking.booking_owner_user_id,
    p_vdo_reading:                  input.paymentWaived ? null : vdoReading,
    p_checkout_outcome:             input.outcome,
    p_landing_charges:              landingChargesJson.length > 0 ? landingChargesJson : null,
    p_admin_notes:                  input.adminNote ?? null,
    p_payment_waived:               input.paymentWaived ?? false,
    p_waiver_reason:                input.waiverReason ?? null,
    p_checkout_rate_cents_per_hour: checkoutRateCents,
  }

  console.log('[markCheckoutOutcome] calling RPC complete_checkout_outcome_atomic', rpcPayload)

  const { data: rpcRows, error: rpcErr } = await supabase.rpc(
    'complete_checkout_outcome_atomic',
    rpcPayload,
  )

  if (rpcErr || !rpcRows?.[0]) {
    console.error('[markCheckoutOutcome] RPC failed', {
      message: rpcErr?.message,
      code:    rpcErr?.code,
      details: rpcErr?.details,
      hint:    rpcErr?.hint,
      rpcRows,
    })
    const diagParts: string[] = []
    if (rpcErr?.code)    diagParts.push(`code=${rpcErr.code}`)
    if (rpcErr?.message) diagParts.push(rpcErr.message)
    if (rpcErr?.details) diagParts.push(rpcErr.details)
    if (rpcErr?.hint)    diagParts.push(`hint: ${rpcErr.hint}`)
    if (!rpcErr && !rpcRows?.[0]) diagParts.push('RPC returned no rows — run migration 040 first')
    throw new Error(
      diagParts.length ? diagParts.join(' | ') : 'complete_checkout_outcome_atomic: unknown failure'
    )
  }

  const finalBookingStatus   = rpcRows[0].out_final_booking_status   as string
  const finalClearanceStatus = rpcRows[0].out_pilot_clearance_status as string
  // True for credit-settled payment path AND for waiver path (both return 'completed')
  const isSettledByCredit    = finalBookingStatus === 'completed' && !input.paymentWaived

  // ── Status history ─────────────────────────────────────────────────────────
  const historyNote = input.paymentWaived
    ? `Checkout outcome: ${input.outcome}. Payment waived. Reason: ${input.waiverReason ?? ''}`.trim()
    : `Checkout outcome: ${input.outcome}. ${input.adminNote ?? ''}`.trim()

  await supabase.from('booking_status_history').insert({
    booking_id:         input.bookingId,
    old_status:         'checkout_completed_under_review',
    new_status:         finalBookingStatus,
    changed_by_user_id: adminId,
    note:               historyNote,
  })

  // ── Audit event ───────────────────────────────────────────────────────────
  await supabase.from('booking_audit_events').insert({
    booking_id:    input.bookingId,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'checkout_outcome_recorded',
    event_summary: input.paymentWaived
      ? `Checkout outcome recorded: ${input.outcome}. Payment waived. Final status: ${finalBookingStatus}.`
      : `Checkout outcome recorded: ${input.outcome}. Final status: ${finalBookingStatus}.`,
    new_value: input.paymentWaived
      ? {
          outcome:                input.outcome,
          pilot_clearance_status: finalClearanceStatus,
          booking_status:         finalBookingStatus,
          payment_waived:         true,
          waiver_reason:          input.waiverReason,
        }
      : {
          outcome:                input.outcome,
          pilot_clearance_status: finalClearanceStatus,
          booking_status:         finalBookingStatus,
          vdo_reading:            vdoReading ?? null,
          landing_charges:        landingChargesJson,
          payment_waived:         false,
        },
  })

  const { data: customerProfile } = await supabase
    .from('profiles')
    .select('full_name, pilot_arn')
    .eq('id', booking.booking_owner_user_id)
    .single()

  // Compute full start/stop readings from last finalized log + submitted totals
  const checkoutBaseline = await getLastFinalizedLogStop(booking.aircraft_id)
  const checkoutReadings = buildReadingsFromTotals(
    {
      ...input.readings,
      notes:    input.readings.notes    ?? input.adminNote ?? null,
      landings: input.readings.landings ?? landingChargesJson.reduce((sum, row) => sum + row.landing_count, 0),
    },
    checkoutBaseline,
  )

  await upsertAircraftFlightLogRecord({
    aircraft_id: booking.aircraft_id,
    flight_date: new Date(booking.scheduled_start).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }),
    pic_user_id: booking.booking_owner_user_id,
    pic_name: customerProfile?.full_name || 'Pilot',
    pic_arn: customerProfile?.pilot_arn || null,
    readings: checkoutReadings,
    related_booking_id: input.bookingId,
    source: 'checkout_completion',
    review_status: 'admin_confirmed',
    created_by: adminId,
    updated_by: adminId,
  })

  // Defensive cleanup: once checkout outcome is recorded, any active slot
  // blocks for this checkout should be released.
  await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', input.bookingId)
    .eq('status', 'active')

  // ── Customer notification ──────────────────────────────────────────────────
  let notifTitle: string
  let notifBody: string

  if (input.outcome === 'cleared_to_fly') {
    // cleared_to_fly is always payment path — no waiver branch needed here
    notifTitle = isSettledByCredit
      ? 'Checkout approved — invoice settled'
      : 'Checkout approved — payment required'
    notifBody = isSettledByCredit
      ? 'Your checkout flight has been approved and your invoice settled using account credit. Aircraft bookings are now available.'
      : 'Your checkout flight has been approved. Please pay your checkout invoice before aircraft bookings become available.'
  } else if (input.outcome === 'additional_checkout_required') {
    if (input.paymentWaived) {
      notifTitle = 'Checkout complete — additional checkout required'
      notifBody  = 'Your checkout has been recorded. An additional checkout session is required before you can be cleared to fly. You can book another checkout flight when you are ready.'
    } else {
      notifTitle = isSettledByCredit
        ? 'Checkout invoice settled — additional checkout required'
        : 'Checkout invoice issued — additional checkout required'
      notifBody = isSettledByCredit
        ? 'Your checkout invoice has been settled using account credit. An additional checkout session is required before you can be cleared to fly. You can book another checkout flight when you are ready.'
        : 'A checkout invoice has been issued. Please pay the invoice — you will then be able to book another checkout session to continue your progress.'
    }
  } else if (input.outcome === 'checkout_reschedule_required') {
    if (input.paymentWaived) {
      notifTitle = 'Checkout complete — reschedule required'
      notifBody  = 'Your checkout has been recorded. Your checkout could not be fully assessed this time. You can book another checkout session when you are ready.'
    } else {
      notifTitle = isSettledByCredit
        ? 'Checkout invoice settled — reschedule required'
        : 'Checkout invoice issued — reschedule required'
      notifBody = isSettledByCredit
        ? 'Your checkout invoice has been settled using account credit. Your checkout could not be fully assessed this time. You can book another checkout session when you are ready.'
        : 'A checkout invoice has been issued. Please pay the invoice — you will then be able to book another checkout session.'
    }
  } else {
    // not_currently_eligible
    if (input.paymentWaived) {
      notifTitle = 'Checkout complete — further training required'
      notifBody  = 'Your checkout has been recorded. Based on your assessment, further training with a qualified instructor is required before you can continue with aircraft hire. Please contact us when you are ready to try again.'
    } else {
      notifTitle = isSettledByCredit ? 'Checkout invoice settled' : 'Checkout invoice issued'
      notifBody = isSettledByCredit
        ? 'Your checkout invoice has been settled using account credit. Based on your assessment, further training is required before you can continue with aircraft hire. Please arrange further training with a qualified instructor and contact us when you are ready to try again.'
        : 'A checkout invoice has been issued for your checkout flight. Please pay the invoice. Based on your assessment, further training with a qualified instructor is required before you can continue with aircraft hire.'
    }
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

  const { data: profileForEmail } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', booking.booking_owner_user_id)
    .single()

  if (profileForEmail?.email) {
    let emailEventType = 'checkout_payment_required'
    let template = checkoutOutcomeEmail(
      'Payment required for your checkout flight',
      'Payment required for your checkout flight',
      'Payment is required before the checkout process can be completed.',
      'Pay Now',
    )

    if (input.outcome === 'cleared_to_fly' && finalBookingStatus === 'completed') {
      emailEventType = 'cleared_to_fly'
      template = checkoutOutcomeEmail(
        'You are cleared to fly',
        'You are cleared to fly',
        'You are now cleared to book aircraft hire through the platform.',
        'Book Aircraft',
      )
    } else if (input.outcome === 'additional_checkout_required' && finalBookingStatus === 'completed') {
      emailEventType = 'additional_checkout_required'
      template = checkoutOutcomeEmail(
        'Additional checkout time required',
        'Additional checkout time required',
        'The OZ Rent A Plane team requires additional checkout time before solo hire can be approved.',
        'View Checkout Status',
      )
    } else if (input.outcome === 'checkout_reschedule_required' && finalBookingStatus === 'completed') {
      emailEventType = 'checkout_reschedule_required'
      template = checkoutOutcomeEmail(
        'Checkout reschedule required',
        'Checkout reschedule required',
        'Your checkout needs to be rescheduled. Please return to the portal to choose a new time.',
        'Reschedule Checkout',
      )
    } else if (input.outcome === 'not_currently_eligible' && finalBookingStatus === 'completed') {
      emailEventType = 'not_currently_eligible'
      template = checkoutOutcomeEmail(
        'Checkout outcome update',
        'Checkout outcome update',
        'You are not currently eligible for aircraft hire. Please contact the OZ Rent A Plane team if you have questions.',
        'Contact Team',
      )
    }

    const skipPaymentRequestEmail =
      (input.suppressPaymentRequestEmail === true || input.manualPayment != null) &&
      emailEventType === 'checkout_payment_required'

    if (!skipPaymentRequestEmail) {
      await sendEmail({
        to: profileForEmail.email,
        subject: template.subject,
        html: template.html,
        eventType: emailEventType,
        entityType: 'checkout',
        entityId: input.bookingId,
        metadata: { outcome: input.outcome, finalBookingStatus, finalClearanceStatus },
      }).catch((error) => console.error('[markCheckoutOutcome] email failed:', error))
    }
  }

  if (input.outcome === 'checkout_reschedule_required' && process.env.ADMIN_EMAIL) {
    const adminTemplate = checkoutOutcomeEmail(
      'Checkout reschedule required',
      'Checkout reschedule required',
      `The checkout outcome for booking ${input.bookingId} requires the customer to choose a new time.`,
      'Review Checkout',
    )
    void sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: adminTemplate.subject,
      html: adminTemplate.html,
      eventType: 'checkout_reschedule_required_admin',
      entityType: 'checkout',
      entityId: input.bookingId,
      metadata: { outcome: input.outcome },
    }).catch((error) => console.error('[markCheckoutOutcome] admin reschedule email failed:', error))
  }

  // ── Mark-paid settlement — same action, so a failure here is always visible ──
  // Skipped when account credit already settled the invoice (booking is
  // already 'completed'; there is nothing left to pay).
  if (input.manualPayment && finalBookingStatus !== 'completed') {
    try {
      // requireAdmin() (upstream) authorizes via the session client; the
      // settlement itself runs on the service-role client because
      // mark_checkout_invoice_paid_atomic is locked to service_role.
      await settleCheckoutInvoiceManually(createAdminClient(), adminId, {
        bookingId:     input.bookingId,
        customerId:    booking.booking_owner_user_id,
        paymentMethod: input.manualPayment.paymentMethod,
        amountCents:   input.manualPayment.amountCents,
        note:          input.manualPayment.note,
      })
    } catch (settleError) {
      const message = settleError instanceof Error ? settleError.message : String(settleError)
      console.error('[markCheckoutOutcome] manual settlement failed', { bookingId: input.bookingId, message })
      throw new Error(
        `The checkout outcome was recorded and an invoice was created, but marking it paid failed: ${message} ` +
        'The booking is now awaiting payment — refresh this page and record the manual payment from the payment panel.'
      )
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/bookings/checkout')
  revalidatePath(`/admin/bookings/requests/${input.bookingId}`)
  revalidatePath('/dashboard')

  void emitBookingChanged({ bookingId: input.bookingId, userId: booking.booking_owner_user_id })
  void emitClearanceUpdated(booking.booking_owner_user_id)
  if (!input.paymentWaived) {
    void emitPaymentUpdated({ userId: booking.booking_owner_user_id, bookingId: input.bookingId })
  }
  void emitOpsChanged()
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
    .update({ status: 'cancelled', checkout_lifecycle_status: 'cancelled_by_admin', admin_notes: reason, updated_at: now })
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
    new_value:     { status: 'cancelled', checkout_lifecycle_status: 'cancelled_by_admin', reason, pilot_clearance_status: 'checkout_required' },
  })

  const [{ data: customerProfile }, { data: aircraft }] = await Promise.all([
    supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', booking.booking_owner_user_id)
      .single(),
    supabase
      .from('aircraft')
      .select('registration')
      .eq('id', booking.aircraft_id)
      .single(),
  ])

  if (customerProfile?.email) {
    try {
      await enqueueCheckoutRejectedEmails({
        customerName: customerProfile.full_name ?? 'Pilot',
        customerEmail: customerProfile.email,
        bookingId,
        reason: reason.trim(),
        aircraft: aircraft?.registration ?? 'Assigned aircraft',
      })
    } catch (emailError) {
      console.error('[cancelCheckoutBooking] rejection email enqueue failed:', emailError)
    }
  }



  revalidatePath('/admin')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bookings')
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/admin/bookings/checkout')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)

  await Promise.all([
    emitBookingChanged({ bookingId, userId: booking.booking_owner_user_id }),
    emitClearanceUpdated(booking.booking_owner_user_id),
    emitOpsChanged(),
  ])
}

export async function markCheckoutNoShow(bookingId: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, booking_type, aircraft_id, booking_owner_user_id')
    .eq('id', bookingId)
    .single()
  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'checkout') throw new Error('VALIDATION: This booking is not a checkout booking.')
  if (booking.status !== 'checkout_confirmed') {
    throw new Error(`VALIDATION: No-show can only be recorded from 'checkout_confirmed'. Current: '${booking.status}'.`)
  }

  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({ status: 'no_show', checkout_lifecycle_status: 'completed', updated_at: now })
    .eq('id', bookingId)
  if (bookingErr) throw new Error('Failed to mark booking as no-show.')

  await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', bookingId)
    .eq('status', 'active')

  await supabase
    .from('profiles')
    .update({
      account_status: 'blocked',
      account_lock_reason: 'checkout_no_show',
      account_locked_at: now,
      account_locked_by_admin_id: adminId,
      account_unlocked_at: null,
      account_unlocked_by_admin_id: null,
      updated_at: now,
    })
    .eq('id', booking.booking_owner_user_id)

  await supabase.from('booking_status_history').insert({
    booking_id: bookingId,
    old_status: booking.status,
    new_status: 'no_show',
    changed_by_user_id: adminId,
    note: 'Admin marked checkout booking as no-show. Customer account locked.',
  })

  await supabase.from('booking_audit_events').insert({
    booking_id: bookingId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'checkout_no_show',
    event_summary: 'Admin marked checkout booking as no-show and locked customer account.',
    new_value: { status: 'no_show', account_status: 'blocked', account_lock_reason: 'checkout_no_show' },
  })

  revalidatePath('/admin')
  revalidatePath('/admin/bookings/checkout')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/dashboard')

  void emitBookingChanged({ bookingId, userId: booking.booking_owner_user_id })
  void emitClearanceUpdated(booking.booking_owner_user_id)
  void emitOpsChanged()
}

export async function unlockCheckoutNoShowLock(customerId: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  const { data: profile, error: fetchErr } = await supabase
    .from('profiles')
    .select('id, account_status, account_lock_reason')
    .eq('id', customerId)
    .single()
  if (fetchErr || !profile) throw new Error('Customer profile not found.')
  if (profile.account_lock_reason !== 'checkout_no_show') {
    throw new Error('VALIDATION: Customer is not locked for checkout no-show.')
  }

  await supabase
    .from('profiles')
    .update({
      account_status: 'active',
      account_lock_reason: null,
      account_unlocked_at: now,
      account_unlocked_by_admin_id: adminId,
      updated_at: now,
    })
    .eq('id', customerId)

  revalidatePath('/admin')
  revalidatePath('/admin/customers')
  revalidatePath(`/admin/users/${customerId}`)
  revalidatePath('/dashboard')

  void emitClearanceUpdated(customerId)
  void emitOpsChanged()
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
  selectedDate?:     string,   // YYYY-MM-DD in Sydney
  selectedTime?:     string,   // HH:MM in Sydney
): Promise<{ newStart: string; newEnd: string }> {
  const { supabase, adminId } = await requireAdmin()
  const nowIso = new Date().toISOString()
  const CHECKOUT_DURATION_MINUTES = 120

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

  const normalizedTime = selectedTime?.trim()
  const safeSelectedTime = normalizedTime && /^\d{1,2}:\d{2}$/.test(normalizedTime)
    ? `${normalizedTime.padStart(5, '0')}`
    : normalizedTime
  const derivedStartISO = selectedDate && safeSelectedTime
    ? sydneyInputToUTC(`${selectedDate}T${safeSelectedTime}`)
    : null

  const effectiveStartISO = derivedStartISO ?? newScheduledStart
  const newStart = new Date(effectiveStartISO)
  if (isNaN(newStart.getTime())) throw new Error('VALIDATION: Invalid start time.')

  const now = new Date()
  const fmtYmd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const fmtHm = (d: Date) =>
    `${d.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', hour12: false }).slice(-2)}:${d.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', minute: '2-digit' }).padStart(2, '0')}`
  const selectedSydDate = fmtYmd(newStart)
  const nowSydDate = todaySydneyDateKey()
  const selectedSydTime = fmtHm(newStart)
  const nowSydTime = fmtHm(now)

  if (selectedSydDate < nowSydDate) {
    throw new Error('VALIDATION: Checkout date/time must be now or in the future.')
  }
  if (selectedSydDate === nowSydDate && selectedSydTime < nowSydTime) {
    throw new Error('VALIDATION: For today, checkout time must be now or in the future.')
  }

  const newEnd       = new Date(newStart.getTime() + CHECKOUT_DURATION_MINUTES * 60 * 1000)
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

  // Snapshot existing blocks. We replace only after new blocks are validated and inserted.
  const { data: existingActiveBlocks, error: fetchBlocksErr } = await supabase
    .from('schedule_blocks')
    .select('id, start_time, end_time, block_type')
    .eq('related_booking_id', bookingId)
    .eq('status', 'active')

  if (fetchBlocksErr) {
    throw new Error('Cannot update checkout time: failed to check existing schedule blocks. Please retry.')
  }

  const newBlocks: Array<Record<string, unknown>> = []
  const pushBlock = (params: {
    blockType: 'customer_booking' | 'buffer'
    startISO: string
    endISO: string
    publicLabel: string | null
    internalReason: string | null
    visible: boolean
  }) => {
    const blockStart = new Date(params.startISO)
    const blockEnd = new Date(params.endISO)
    if (
      Number.isNaN(blockStart.getTime()) ||
      Number.isNaN(blockEnd.getTime()) ||
      blockEnd.getTime() <= blockStart.getTime()
    ) {
      console.error('[adminUpdateCheckoutTime] Invalid schedule block generated', {
        checkoutId: bookingId,
        bookingId,
        aircraftId: booking.aircraft_id,
        selectedDate: selectedDate ?? selectedSydDate,
        selectedDepartureTime: selectedTime ?? selectedSydTime,
        blockStart: params.startISO,
        blockEnd: params.endISO,
        durationMinutes: CHECKOUT_DURATION_MINUTES,
        timezoneAssumptions: {
          inputTimezone: 'Australia/Sydney',
          storageTimezone: 'UTC (timestamptz)',
          runtimeTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      })
      throw new Error('INVALID_SCHEDULE_BLOCK_TIME_ORDER')
    }

    newBlocks.push({
      aircraft_id: booking.aircraft_id,
      related_booking_id: bookingId,
      block_type: params.blockType,
      start_time: params.startISO,
      end_time: params.endISO,
      public_label: params.publicLabel,
      internal_reason: params.internalReason,
      created_by_user_id: adminId,
      created_by_role: 'admin',
      is_public_visible: params.visible,
      status: 'active',
    })
  }

  pushBlock({
    blockType: 'customer_booking',
    startISO: newStartISO,
    endISO: newEndISO,
    publicLabel: 'Checkout Flight',
    internalReason: null,
    visible: true,
  })
  if (preBufMs > 0) {
    pushBlock({
      blockType: 'buffer',
      startISO: expandedStart,
      endISO: newStartISO,
      publicLabel: null,
      internalReason: 'Pre-flight buffer (checkout — admin updated)',
      visible: false,
    })
  }
  if (postBufMs > 0) {
    pushBlock({
      blockType: 'buffer',
      startISO: newEndISO,
      endISO: expandedEnd,
      publicLabel: null,
      internalReason: 'Post-flight buffer (checkout — admin updated)',
      visible: false,
    })
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info('[adminUpdateCheckoutTime] Generated schedule block payload', {
      checkout_request_id: bookingId,
      booking_id: bookingId,
      aircraft_id: booking.aircraft_id,
      raw_selected_date: selectedDate ?? selectedSydDate,
      raw_selected_departure_time: selectedTime ?? selectedSydTime,
      computed_return_time: fmtHm(newEnd),
      duration_minutes: CHECKOUT_DURATION_MINUTES,
      timezone_assumptions: {
        input_timezone: 'Australia/Sydney',
        storage_timezone: 'UTC (timestamptz)',
        runtime_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      blocks: newBlocks.map((b) => ({
        block_type: b.block_type,
        block_start_timestamp: b.start_time,
        block_end_timestamp: b.end_time,
      })),
      existing_active_blocks: (existingActiveBlocks ?? []).map((b) => ({
        id: b.id,
        block_type: b.block_type,
        start_time: b.start_time,
        end_time: b.end_time,
      })),
    })
  }

  const { error: insertErr } = await supabase
    .from('schedule_blocks')
    .insert(newBlocks)

  if (insertErr) {
    console.error('[adminUpdateCheckoutTime] Failed to insert schedule blocks:', insertErr)
    throw new Error('INVALID_SCHEDULE_BLOCK_TIME_ORDER')
  }

  const hasActiveBlocks = (existingActiveBlocks?.length ?? 0) > 0
  if (hasActiveBlocks) {
    const activeIds = existingActiveBlocks!.map((b) => b.id)
    const { error: cancelBlocksErr } = await supabase
      .from('schedule_blocks')
      .update({ status: 'cancelled' })
      .in('id', activeIds)
      .eq('status', 'active')

    if (cancelBlocksErr) {
      console.error('[adminUpdateCheckoutTime] Failed to cancel old schedule blocks after insert:', cancelBlocksErr)
      throw new Error(
        'Could not finalize checkout time update because old schedule blocks could not be replaced safely. Please retry or contact support.',
      )
    }
  }

  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({ scheduled_start: newStartISO, scheduled_end: newEndISO, updated_at: nowIso })
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
  revalidatePath(`/admin/bookings/checkout/${bookingId}`)
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bookings')
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard/messages')

  await Promise.all([
    emitBookingChanged({ bookingId, userId: booking.booking_owner_user_id }),
    emitChatMessage(booking.booking_owner_user_id),
    emitOpsChanged(),
  ])

  return { newStart: newStartISO, newEnd: newEndISO }
}

type ManualCheckoutLogMode = 'skip' | 'existing' | 'create_new'

type ManualCheckoutCompletionInput = {
  bookingId: string
  completionDate: string
  outcome: 'cleared_to_fly'
  logMode: ManualCheckoutLogMode
  existingLogId?: string
  newLog?: {
    picName: string
    picArn?: string | null
    readings: AircraftReadings
    notes?: string | null
  }
  adminNote?: string | null
}

export async function manuallyCompleteCheckout(input: ManualCheckoutCompletionInput): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  if (!input.bookingId) throw new Error('VALIDATION: Checkout booking is required.')
  if (!input.completionDate?.trim()) throw new Error('VALIDATION: Manual completion date is required.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.completionDate)) throw new Error('VALIDATION: Completion date must be a valid date.')
  if (input.outcome !== 'cleared_to_fly') throw new Error('VALIDATION: Manual completion outcome must be cleared_to_fly.')
  if (!['skip', 'existing', 'create_new'].includes(input.logMode)) throw new Error('VALIDATION: Invalid aircraft log option.')

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, booking_type, aircraft_id, booking_owner_user_id, scheduled_start, scheduled_end')
    .eq('id', input.bookingId)
    .single()
  if (fetchErr || !booking) throw new Error('Checkout booking not found.')
  if (booking.booking_type !== 'checkout') throw new Error('VALIDATION: This booking is not a checkout booking.')

  const allowedStatuses = ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review']
  if (!allowedStatuses.includes(booking.status)) {
    throw new Error(`VALIDATION: Manual completion is not allowed from status '${booking.status}'.`)
  }

  let linkedLogId: string | null = null
  let createdNewLog = false

  if (input.logMode === 'existing') {
    if (!input.existingLogId) throw new Error('VALIDATION: Existing aircraft log is required.')
    const { data: existingLog, error: existingErr } = await supabase
      .from('aircraft_flight_logs')
      .select('id, aircraft_id')
      .eq('id', input.existingLogId)
      .maybeSingle()
    if (existingErr || !existingLog) throw new Error('VALIDATION: Selected aircraft log was not found.')
    if (existingLog.aircraft_id !== booking.aircraft_id) {
      throw new Error('VALIDATION: Selected aircraft log belongs to a different aircraft.')
    }
    linkedLogId = existingLog.id
  }

  if (input.logMode === 'create_new') {
    if (!input.newLog) throw new Error('VALIDATION: New aircraft log details are required.')
    if (!input.newLog.picName?.trim()) throw new Error('VALIDATION: PIC name is required.')
    validateAircraftReadings(input.newLog.readings)

    const created = await upsertAircraftFlightLogRecord({
      aircraft_id: booking.aircraft_id,
      flight_date: input.completionDate,
      pic_user_id: booking.booking_owner_user_id,
      pic_name: input.newLog.picName.trim(),
      pic_arn: input.newLog.picArn?.trim() || null,
      readings: {
        ...input.newLog.readings,
        notes: input.newLog.notes?.trim() || input.newLog.readings.notes || null,
      },
      related_booking_id: booking.id,
      source: 'checkout_completion',
      review_status: 'admin_confirmed',
      created_by: adminId,
      updated_by: adminId,
    })
    linkedLogId = created.row.id
    createdNewLog = true
  }

  if (input.logMode === 'existing' && linkedLogId) {
    const { error: linkErr } = await supabase
      .from('aircraft_flight_logs')
      .update({ related_booking_id: booking.id, updated_by: adminId, updated_at: now })
      .eq('id', linkedLogId)
    if (linkErr) throw new Error(`Failed to link existing aircraft log. ${linkErr.message}`)
  }

  const { error: bookingUpdateErr } = await supabase
    .from('bookings')
    .update({
      status: 'completed',
      checkout_lifecycle_status: 'completed',
      scheduled_start: `${input.completionDate}T00:00:00.000Z`,
      scheduled_end: `${input.completionDate}T01:00:00.000Z`,
      updated_at: now,
      admin_notes: input.adminNote?.trim() || null,
    })
    .eq('id', booking.id)
  if (bookingUpdateErr) throw new Error('Failed to manually complete checkout booking.')

  await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', booking.id)
    .eq('status', 'active')

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ pilot_clearance_status: 'cleared_to_fly', updated_at: now })
    .eq('id', booking.booking_owner_user_id)
  if (profileErr) throw new Error('Failed to update customer clearance status.')

  const modeSummary =
    input.logMode === 'skip'
      ? 'skipped aircraft log creation'
      : input.logMode === 'existing'
      ? `linked existing aircraft log ${linkedLogId}`
      : `created and linked new aircraft log ${linkedLogId}`

  await supabase.from('booking_status_history').insert({
    booking_id: booking.id,
    old_status: booking.status,
    new_status: 'completed',
    changed_by_user_id: adminId,
    note: `Manual checkout completion submitted. completion_date=${input.completionDate}; outcome=cleared_to_fly; log_mode=${input.logMode}; ${modeSummary}.`,
  })

  await supabase.from('booking_audit_events').insert([
    {
      booking_id: booking.id,
      aircraft_id: booking.aircraft_id,
      actor_user_id: adminId,
      actor_role: 'admin',
      event_type: 'checkout_manual_completion_started',
      event_summary: `Admin initiated manual checkout completion (${input.logMode}).`,
      new_value: {
        completion_date: input.completionDate,
        outcome: 'cleared_to_fly',
        log_mode: input.logMode,
      },
    },
    {
      booking_id: booking.id,
      aircraft_id: booking.aircraft_id,
      actor_user_id: adminId,
      actor_role: 'admin',
      event_type: 'checkout_manual_completion_submitted',
      event_summary: `Checkout manually completed by admin: cleared_to_fly; ${modeSummary}.`,
      new_value: {
        completion_date: input.completionDate,
        outcome: 'cleared_to_fly',
        pilot_clearance_status: 'cleared_to_fly',
        booking_status: 'completed',
        log_mode: input.logMode,
        linked_aircraft_log_id: linkedLogId,
        created_new_log: createdNewLog,
        invoice_created: false,
        payment_required: false,
      },
    },
  ])

  await supabase.from('verification_events').insert({
    user_id: booking.booking_owner_user_id,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'approved',
    request_kind: 'booking_update',
    request_id: booking.id,
    title: 'Checkout manually completed',
    body: 'Your checkout has been manually completed and you are now clear to fly.',
    is_read: false,
    email_status: 'skipped',
  })

  revalidatePath('/admin/bookings/checkout')
  revalidatePath(`/admin/bookings/requests/${booking.id}`)
  revalidatePath(`/dashboard/bookings/${booking.id}`)

  void emitBookingChanged({ bookingId: booking.id, userId: booking.booking_owner_user_id })
  void emitClearanceUpdated(booking.booking_owner_user_id)
  void emitOpsChanged()
}

// ─── Cancellation request review ──────────────────────────────────────────────

type CancellationRequestRow = {
  id:                 string
  booking_id:         string
  user_id:            string
  booking_start_time: string
  is_within_24_hours: boolean
  customer_message:   string | null
  status:             string
  bookings: {
    status:             string
    booking_type:       string
    aircraft_id:        string
    booking_reference:  string | null
    estimated_amount:   number | null
    estimated_hours:    number | null
    booking_owner_user_id: string
  } | null
}

/**
 * Admin approves a late cancellation and waives the cancellation charge.
 * Booking → cancelled, schedule blocks released, request → approved_waived.
 */
export async function adminApproveCancellationWaived(
  cancellationRequestId: string,
  adminNote: string | null,
): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  // Fetch request + joined booking
  const { data: req, error: fetchErr } = await supabase
    .from('booking_cancellation_requests')
    .select(`
      id, booking_id, user_id, booking_start_time, is_within_24_hours, customer_message, status,
      bookings ( status, booking_type, aircraft_id, booking_reference, estimated_amount, estimated_hours, booking_owner_user_id )
    `)
    .eq('id', cancellationRequestId)
    .single()

  if (fetchErr || !req) throw new Error('Cancellation request not found.')
  const r = req as unknown as CancellationRequestRow
  if (r.status !== 'pending') {
    throw new Error(`VALIDATION: Request is already resolved (status: ${r.status}).`)
  }
  const booking = r.bookings
  if (!booking) throw new Error('Booking data missing from cancellation request.')

  const oldBookingStatus = booking.status
  const isCheckout = booking.booking_type === 'checkout'

  // Cancel the booking
  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({
      status:                'cancelled',
      cancellation_category: 'customer',
      ...(isCheckout
        ? {
            checkout_lifecycle_status: 'cancelled_by_customer',
            cancellation_reason: 'Late checkout cancellation approved — charge waived.',
          }
        : {}),
      updated_at:            now,
    })
    .eq('id', r.booking_id)

  if (bookingErr) throw new Error('Failed to cancel booking.')

  // Release schedule blocks
  await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', r.booking_id)

  if (isCheckout) {
    await supabase
      .from('checkout_change_requests')
      .update({
        status: 'approved',
        admin_note: adminNote?.trim() || 'Late cancel approved — charge waived.',
        reviewed_by: adminId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('checkout_request_id', r.booking_id)
      .eq('request_type', 'cancel')
      .eq('status', 'pending')

    await supabase
      .from('checkout_change_requests')
      .update({
        status: 'cancelled',
        admin_note: 'Superseded by approved late cancellation.',
        reviewed_by: adminId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('checkout_request_id', r.booking_id)
      .eq('request_type', 'reschedule')
      .eq('status', 'pending')

    await supabase
      .from('profiles')
      .update({ pilot_clearance_status: 'checkout_required', updated_at: now })
      .eq('id', booking.booking_owner_user_id)
  }

  // Update the cancellation request
  await supabase
    .from('booking_cancellation_requests')
    .update({
      status:      'approved_waived',
      admin_note:  adminNote?.trim() || null,
      decided_by:  adminId,
      decided_at:  now,
      updated_at:  now,
    })
    .eq('id', cancellationRequestId)

  const historyNote = adminNote?.trim()
    ? `Booking cancelled. Cancellation charge waived. Admin note: ${adminNote.trim()}`
    : 'Booking cancelled. Cancellation charge waived by admin.'

  await supabase.from('booking_status_history').insert({
    booking_id:         r.booking_id,
    old_status:         oldBookingStatus,
    new_status:         'cancelled',
    changed_by_user_id: adminId,
    note:               historyNote,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    r.booking_id,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'cancellation_approved_waived',
    event_summary: 'Admin approved cancellation and waived charge.',
    new_value:     { status: 'cancelled', charge: 'waived', admin_note: adminNote },
  })

  // Notify customer
  const { data: notifyData } = await supabase
    .from('bookings')
    .select('booking_reference, profiles:booking_owner_user_id ( full_name, email )')
    .eq('id', r.booking_id)
    .single()

  if (notifyData) {
    const prof  = Array.isArray(notifyData.profiles) ? notifyData.profiles[0] : notifyData.profiles
    const email = (prof as { email?: string | null } | null)?.email
    if (email) {
      notifyBookingCancelled({
        customerEmail: email,
        customerName:  (prof as { full_name?: string | null } | null)?.full_name ?? 'Pilot',
        ref:           notifyData.booking_reference ?? r.booking_id.slice(0, 8).toUpperCase(),
        reason:        'Your cancellation request has been approved. No cancellation charge applies.',
        bookingId:     r.booking_id,
      }).catch(e => console.error('[adminApproveCancellationWaived] notification error:', e))
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/bookings/cancellations')
  revalidatePath(`/admin/bookings/requests/${r.booking_id}`)
  revalidatePath(`/dashboard/bookings/${r.booking_id}`)
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard/checkout')
  revalidatePath('/admin/checkouts/cancelled')

  void emitBookingChanged({ bookingId: r.booking_id, userId: booking.booking_owner_user_id })
  if (isCheckout) void emitClearanceUpdated(booking.booking_owner_user_id)
  void emitOpsChanged()
}

function isMissingReviewedByColumnError(error: { message?: string; code?: string; details?: string } | null): boolean {
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
  return text.includes('reviewed_by') && text.includes('does not exist')
}

/** Fallback when DB is missing booking_bank_transfer_submissions.reviewed_by (migration 112). */
async function approveStandardBankTransferWithoutReviewedBy(
  adminId: string,
  submissionId: string,
  bookingId: string,
): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: sub, error: subErr } = await admin
    .from('booking_bank_transfer_submissions')
    .select('id, invoice_id, booking_id, customer_id, status, submitted_at, created_at')
    .eq('id', submissionId)
    .single()

  if (subErr || !sub) throw new Error(subErr?.message || 'Submission not found.')
  if (sub.booking_id !== bookingId) throw new Error('Submission does not belong to this booking.')
  if (sub.status !== 'pending_review') throw new Error(`Submission is not pending review: ${sub.status}`)

  const { data: invoice, error: invErr } = await admin
    .from('booking_invoices')
    .select('id, status, subtotal_cents, advance_applied_cents')
    .eq('id', sub.invoice_id)
    .single()

  if (invErr || !invoice) throw new Error(invErr?.message || 'Invoice not found.')
  if (!['payment_required', 'bank_transfer_pending_review'].includes(invoice.status)) {
    throw new Error(`Invoice is not awaiting payment review: ${invoice.status}`)
  }

  const amountCents = (invoice.subtotal_cents ?? 0) - (invoice.advance_applied_cents ?? 0)

  const { error: subUpdateErr } = await admin
    .from('booking_bank_transfer_submissions')
    .update({ status: 'approved', reviewed_at: now, updated_at: now })
    .eq('id', submissionId)
    .eq('status', 'pending_review')
  if (subUpdateErr) throw new Error(subUpdateErr.message)

  const { error: invUpdateErr } = await admin
    .from('booking_invoices')
    .update({
      status: 'paid',
      payment_method: 'bank_transfer',
      total_paid_cents: amountCents,
      paid_at: now,
      updated_at: now,
    })
    .eq('id', sub.invoice_id)
  if (invUpdateErr) throw new Error(invUpdateErr.message)

  const { error: ledgerErr } = await admin.from('customer_payment_ledger').insert({
    customer_id: sub.customer_id,
    booking_id: sub.booking_id,
    invoice_id: sub.invoice_id,
    invoice_source_type: 'booking',
    amount_cents: amountCents,
    entry_type: 'bank_transfer',
    payment_method: 'bank_transfer',
    note: 'Bank transfer approved by admin',
    created_by: adminId,
  })
  if (ledgerErr) throw new Error(ledgerErr.message)

  const { error: bookingErr } = await admin
    .from('bookings')
    .update({ status: 'completed', updated_at: now })
    .eq('id', sub.booking_id)
  if (bookingErr) throw new Error(bookingErr.message)

  await admin
    .from('schedule_blocks')
    .update({ status: 'cancelled', updated_at: now })
    .eq('related_booking_id', sub.booking_id)
    .eq('status', 'active')
}

async function rejectStandardBankTransferWithoutReviewedBy(
  submissionId: string,
  bookingId: string,
  adminNote: string,
): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: sub, error: subErr } = await admin
    .from('booking_bank_transfer_submissions')
    .select('id, invoice_id, booking_id, status')
    .eq('id', submissionId)
    .single()

  if (subErr || !sub) throw new Error(subErr?.message || 'Submission not found.')
  if (sub.booking_id !== bookingId) throw new Error('Submission does not belong to this booking.')
  if (sub.status !== 'pending_review') {
    throw new Error(`Submission not found or not in pending_review state: ${submissionId}`)
  }

  const { error: subUpdateErr } = await admin
    .from('booking_bank_transfer_submissions')
    .update({
      status: 'rejected',
      admin_note: adminNote,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', submissionId)
    .eq('status', 'pending_review')
  if (subUpdateErr) throw new Error(subUpdateErr.message)

  const { error: invUpdateErr } = await admin
    .from('booking_invoices')
    .update({
      status: 'payment_required',
      paid_at: null,
      updated_at: now,
    })
    .eq('id', sub.invoice_id)
    .in('status', ['payment_required', 'bank_transfer_pending_review'])
  if (invUpdateErr) throw new Error(invUpdateErr.message)
}

// ─── Confirm standard bank transfer ───────────────────────────────────────────
export async function adminConfirmStandardBankTransfer(submissionId: string, bookingId: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()

  const { data: subData } = await supabase
    .from('booking_bank_transfer_submissions')
    .select('id, invoice_id, customer_id, booking_id')
    .eq('id', submissionId)
    .single()

  const { data: blockTimeInvoice } = subData?.invoice_id
    ? await supabase
        .from('invoices')
        .select('id, total, status, invoice_number, is_block_time_overage')
        .eq('id', subData.invoice_id)
        .maybeSingle()
    : { data: null }

  if (blockTimeInvoice) {
    const now = new Date().toISOString()
    const { error: subErr } = await supabase
      .from('booking_bank_transfer_submissions')
      .update({
        status: 'approved',
        reviewed_by: adminId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', submissionId)

    if (subErr) {
      // Fallback if reviewed_by column missing
      await supabase
        .from('booking_bank_transfer_submissions')
        .update({
          status: 'approved',
          reviewed_at: now,
          updated_at: now,
        })
        .eq('id', submissionId)
    }

    await supabase
      .from('invoices')
      .update({
        status: 'paid',
        payment_method: 'bank_transfer',
        paid_at: now,
      })
      .eq('id', blockTimeInvoice.id)

    const amountCents = Math.round(Number(blockTimeInvoice.total) * 100)
    await supabase
      .from('customer_payment_ledger')
      .insert({
        customer_id: subData!.customer_id,
        booking_id: bookingId,
        invoice_id: blockTimeInvoice.id,
        invoice_source_type: 'block_time',
        amount_cents: amountCents,
        entry_type: 'bank_transfer',
        payment_method: 'bank_transfer',
        note: 'Bank transfer approved by admin',
        created_by: adminId,
      })

    const { data: remainingAwaiting } = await supabase
      .from('invoices')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('status', 'awaiting')

    if (!remainingAwaiting || remainingAwaiting.length === 0) {
      await supabase
        .from('bookings')
        .update({ status: 'completed', updated_at: now })
        .eq('id', bookingId)

      await supabase
        .from('schedule_blocks')
        .update({ status: 'cancelled' })
        .eq('related_booking_id', bookingId)
        .eq('status', 'active')
    }
  } else {
    const { error } = await supabase.rpc('approve_standard_bank_transfer_atomic', {
      p_submission_id: submissionId,
    })
    if (error) {
      if (isMissingReviewedByColumnError(error)) {
        console.warn(
          '[adminConfirmStandardBankTransfer] reviewed_by column missing — using fallback. Apply fix-reviewed-by-column.sql / migration 112.',
          { message: error.message, code: error.code },
        )
        try {
          await approveStandardBankTransferWithoutReviewedBy(adminId, submissionId, bookingId)
        } catch (fallbackError: any) {
          console.error('[adminConfirmStandardBankTransfer] fallback failed:', fallbackError)
          throw new Error(fallbackError?.message || 'Failed to confirm payment.')
        }
      } else {
        console.error('[adminConfirmStandardBankTransfer] RPC failed:', error)
        throw new Error(error.message || 'Failed to confirm payment.')
      }
    }
  }

  const { data: sub } = await supabase
    .from('booking_bank_transfer_submissions')
    .select('customer_id')
    .eq('id', submissionId)
    .single()

  if (sub) {
    await supabase.from('verification_events').insert({
      user_id:      sub.customer_id,
      actor_role:   'admin',
      event_type:   'approved',
      title:        'Bank transfer confirmed — booking complete',
      body:         'Your bank transfer payment has been confirmed. Your booking is now complete.',
      is_read:      false,
      email_status: 'pending',
    })

    const { data: profileForPaymentEmail } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', sub.customer_id)
      .single()
    if (profileForPaymentEmail?.email) {
      const template = paymentConfirmedEmail('Payment has been received and recorded for your booking.')
      // The billing write is the source of truth; email delivery can continue
      // in the background so the admin does not sit on the spinner waiting for
      // an external API round-trip.
      void sendEmail({
        to: profileForPaymentEmail.email,
        subject: template.subject,
        html: template.html,
        eventType: 'post_flight_payment_received',
        entityType: 'booking',
        entityId: bookingId,
      }).catch((emailError) => console.error('[adminConfirmStandardBankTransfer] email failed:', emailError))
    }
  }

  await supabase.from('booking_status_history').insert({
    booking_id:         bookingId,
    old_status:         'payment_pending',
    new_status:         'completed',
    changed_by_user_id: adminId,
    note:               'Admin confirmed bank transfer payment. Booking completed.',
  })

  revalidatePath('/admin')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard/bookings')
  revalidatePath('/admin/bookings/payments')

  if (sub) {
    void emitPaymentUpdated({ userId: sub.customer_id, bookingId })
    void emitBookingChanged({ bookingId, userId: sub.customer_id })
  }
  void emitOpsChanged()
}

// ─── Reject standard bank transfer ────────────────────────────────────────────
export async function adminRejectStandardBankTransfer(
  submissionId: string,
  bookingId: string,
  adminNote: string,
): Promise<void> {
  const { supabase, adminId } = await requireAdmin()

  if (!adminNote?.trim()) throw new Error('A rejection note is required.')

  const { data: subData } = await supabase
    .from('booking_bank_transfer_submissions')
    .select('id, invoice_id, customer_id, booking_id')
    .eq('id', submissionId)
    .single()

  const { data: blockTimeInvoice } = subData?.invoice_id
    ? await supabase
        .from('invoices')
        .select('id, total, status')
        .eq('id', subData.invoice_id)
        .maybeSingle()
    : { data: null }

  if (blockTimeInvoice) {
    const now = new Date().toISOString()
    const { error: subErr } = await supabase
      .from('booking_bank_transfer_submissions')
      .update({
        status: 'rejected',
        admin_note: adminNote.trim(),
        reviewed_by: adminId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', submissionId)

    if (subErr) {
      await supabase
        .from('booking_bank_transfer_submissions')
        .update({
          status: 'rejected',
          admin_note: adminNote.trim(),
          reviewed_at: now,
          updated_at: now,
        })
        .eq('id', submissionId)
    }
  } else {
    const { error } = await supabase.rpc('reject_standard_bank_transfer_atomic', {
      p_submission_id: submissionId,
      p_admin_note:    adminNote,
    })
    if (error) {
      if (isMissingReviewedByColumnError(error)) {
        console.warn(
          '[adminRejectStandardBankTransfer] reviewed_by column missing — using fallback. Apply fix-reviewed-by-column.sql / migration 112.',
          { message: error.message, code: error.code },
        )
        try {
          await rejectStandardBankTransferWithoutReviewedBy(submissionId, bookingId, adminNote.trim())
        } catch (fallbackError: any) {
          console.error('[adminRejectStandardBankTransfer] fallback failed:', fallbackError)
          throw new Error(fallbackError?.message || 'Failed to reject payment.')
        }
      } else {
        console.error('[adminRejectStandardBankTransfer] RPC failed:', error)
        throw new Error(error.message || 'Failed to reject payment.')
      }
    }
  }

  const { data: sub } = await supabase
    .from('booking_bank_transfer_submissions')
    .select('customer_id')
    .eq('id', submissionId)
    .single()

  if (sub) {
    await supabase.from('verification_events').insert({
      user_id:      sub.customer_id,
      actor_role:   'admin',
      event_type:   'document_rejected',
      title:        'Bank transfer proof rejected',
      body:         `Your bank transfer proof was rejected. Note: ${adminNote}. Please upload a new receipt or contact support.`,
      is_read:      false,
      email_status: 'pending',
    })

    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', sub.customer_id)
      .single()
    if (profile?.email) {
      await sendEmail({
        to: profile.email,
        subject: 'Payment proof update',
        html: paymentConfirmedEmail(`Your bank transfer payment proof was rejected. Note: ${adminNote}. Please upload a new receipt or contact support.`).html,
        eventType: 'bank_transfer_rejected',
        entityType: 'payment',
        entityId: bookingId,
      }).catch((error) => console.error('[adminRejectStandardBankTransfer] email failed:', error))
    }
  }

  revalidatePath('/admin')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard/bookings')
  revalidatePath('/admin/bookings/payments')

  if (sub) {
    void emitPaymentUpdated({ userId: sub.customer_id, bookingId })
    void emitBookingChanged({ bookingId, userId: sub.customer_id })
  }
  void emitOpsChanged()
}

// ─── Finalise standard booking invoice ────────────────────────────────────────
export async function finaliseStandardBookingInvoice(input: {
  bookingId: string
  ratePerHour: number
  landingCharges?: { airportId: string; landingCount: number }[]
  adminNotes?: string
  readings: TotalOnlyReadings
  submissionMode?: 'send_invoice' | 'mark_paid' | 'waived'
  // How the money was received when submissionMode is 'mark_paid' (ledger
  // reconciliation only — never credit-bearing). Ignored for other modes.
  manualPaymentMethod?: ManualSettlementMethod
  waiverReason?: string
  minimumVdoDecision?: MinimumVdoDecision
}): Promise<void> {
  const { supabase, adminId } = await requireAdmin()

  validateTotalOnlyReadings(input.readings)
  const vdoReading = input.readings.vdo_total
  if (vdoReading == null || isNaN(vdoReading) || vdoReading <= 0) {
    throw new Error('VALIDATION: VDO total must be greater than 0.')
  }
  if (vdoReading < 0.1) {
    throw new Error(`VALIDATION: VDO total (${vdoReading}h) is below minimum of 0.1h.`)
  }
  if (!isFinite(input.ratePerHour) || input.ratePerHour <= 0) {
    throw new Error('VALIDATION: Hourly rate must be a positive number.')
  }

  const submissionMode = input.submissionMode ?? 'send_invoice'
  const billingBranch = resolveStandardBookingBillingBranch({ submissionMode })

  if (billingBranch.kind === 'waived' && !input.waiverReason?.trim()) {
    throw new Error('VALIDATION: A waiver reason is required when payment is waived.')
  }

  for (const row of input.landingCharges ?? []) {
    const hasAirport = !!row.airportId?.trim()
    const hasCount   = Number.isFinite(row.landingCount) && row.landingCount > 0
    if (hasCount && !hasAirport) throw new Error('VALIDATION: Airport is required for each landing row with a count.')
    if (hasAirport && !hasCount) throw new Error('VALIDATION: Landing count must be at least 1 when an airport is selected.')
  }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, booking_type, aircraft_id, booking_owner_user_id, booking_reference, scheduled_start, scheduled_end, pic_name, pic_arn')
    .eq('id', input.bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'standard') {
    throw new Error('VALIDATION: This booking is not a standard booking.')
  }
  if (booking.status !== 'pending_post_flight_review') {
    throw new Error(`VALIDATION: Can only finalise billing from pending_post_flight_review. Current: '${booking.status}'.`)
  }

  const scheduledStart = new Date(booking.scheduled_start)
  const scheduledEnd = new Date(booking.scheduled_end)
  const bookingSlotHours = (scheduledEnd.getTime() - scheduledStart.getTime()) / (1000 * 60 * 60)
  const minimumVdoBilling = resolveMinimumVdoBilling({
    bookingSlotHours,
    actualVdoHours: vdoReading,
    decision: input.minimumVdoDecision ?? null,
  })
  if (minimumVdoBilling.requiresDecision || minimumVdoBilling.billedVdoHours == null) {
    throw new Error(
      `VALIDATION: VDO total (${vdoReading}h) is below the minimum ${minimumVdoBilling.minimumVdoHours}h for this booking. Choose whether to bill the minimum or the actual hours before finalising.`,
    )
  }

  const maximumVdoHours = resolveMaximumVdoHours(minimumVdoBilling.bookingDays)
  if (vdoReading > maximumVdoHours) {
    throw new Error(`VALIDATION: VDO total (${vdoReading}h) exceeds maximum of ${maximumVdoHours.toFixed(1)}h.`)
  }

  const effectiveVdoHours = minimumVdoBilling.billedVdoHours
  const effectiveVdoHoursRounded = Math.round(effectiveVdoHours * 100) / 100
  const minimumVdoContext = minimumVdoBilling.bookingDays > 0
    ? `${minimumVdoBilling.bookingDays} day${minimumVdoBilling.bookingDays === 1 ? '' : 's'} booked × 4h/day`
    : null
  const minimumVdoOutcomeMessage = minimumVdoBilling.isBelowMinimum
    ? minimumVdoBilling.appliedDecision === 'enforce_minimum'
      ? `Submitted VDO hours (${vdoReading}h) were below the minimum ${minimumVdoBilling.minimumVdoHours}h for ${minimumVdoContext ?? 'this booking'}, so the minimum was billed.`
      : `Submitted VDO hours (${vdoReading}h) were below the minimum ${minimumVdoBilling.minimumVdoHours}h for ${minimumVdoContext ?? 'this booking'}, and operations approved billing the actual ${vdoReading}h instead.`
    : null

  if (minimumVdoBilling.isBelowMinimum) {
    console.log('[finaliseStandardBookingInvoice] minimum VDO decision applied', {
      submitted: vdoReading,
      minimum: minimumVdoBilling.minimumVdoHours,
      decision: minimumVdoBilling.appliedDecision,
      billed: effectiveVdoHoursRounded,
      bookingSlotHours,
    })
  }

  const { data: flightRecord, error: flightRecordErr } = await supabase
    .from('flight_records')
    .select('*')
    .eq('booking_id', input.bookingId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (flightRecordErr || !flightRecord) {
    throw new Error('Flight record not found for this booking.')
  }

  const billingBaseline = await getLastFinalizedLogStop(booking.aircraft_id)
  const fullReadings = buildReadingsFromTotals(input.readings, billingBaseline)
  const fullReadingsTotals = calculateAircraftReadingsTotals(fullReadings)

  const existingReadings = {
    vdo_start: flightRecord.vdo_start ?? null,
    vdo_stop: flightRecord.vdo_stop ?? null,
    tacho_start: flightRecord.tacho_start ?? null,
    tacho_stop: flightRecord.tacho_stop ?? null,
    air_switch_start: flightRecord.air_switch_start ?? null,
    air_switch_stop: flightRecord.air_switch_stop ?? null,
    mr_start: flightRecord.mr_start ?? null,
    mr_stop: flightRecord.mr_stop ?? null,
    oil_added: flightRecord.oil_added ?? null,
    oil_total: flightRecord.oil_total ?? null,
    fuel_added: flightRecord.fuel_added ?? null,
    fuel_returned: flightRecord.fuel_returned ?? null,
    landings: flightRecord.landings ?? null,
    notes: flightRecord.customer_notes ?? null,
  }
  const hasReadingChanges = hasMaterialAircraftReadingChanges(existingReadings, fullReadings)

  const { data: pilotProfile, error: pilotProfileErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, pilot_arn')
    .eq('id', booking.booking_owner_user_id)
    .single()
  if (pilotProfileErr) {
    throw new Error('Failed to load pilot billing profile.')
  }
  const snapshotProfile = pilotProfile

  const { data: activePackage, error: activePackageErr } = await supabase
    .from('pilot_block_time_purchases')
    .select('id, hours_remaining, rate_per_hour, expires_at, status')
    .eq('user_id', booking.booking_owner_user_id)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('queue_position', { ascending: true, nullsFirst: false })
    .order('activated_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (activePackageErr) {
    throw new Error('Failed to determine block time billing mode.')
  }

  const billingMode = activePackage ? 'block_time' : 'pay_as_you_fly'
  const minimumVdoAuditValue = {
    actual_vdo_hours: vdoReading,
    booking_days: minimumVdoBilling.bookingDays,
    booking_slot_hours: Math.round(bookingSlotHours * 100) / 100,
    minimum_vdo_applied: minimumVdoBilling.isBelowMinimum,
    minimum_vdo_decision: minimumVdoBilling.appliedDecision,
    minimum_vdo_hours: minimumVdoBilling.minimumVdoHours,
    billed_vdo_hours: effectiveVdoHoursRounded,
  }

  if (billingMode === 'block_time') {
    let landingFeesTotal = 0
    const landingCharges = input.landingCharges ?? []
    const landingChargesJson = landingCharges.length
      ? JSON.stringify(landingCharges.map((lc) => ({
          airport_id: lc.airportId,
          landing_count: lc.landingCount,
        })))
      : null
    if (landingCharges.length > 0) {
      const airportIds = Array.from(new Set(landingCharges.map((row) => row.airportId)))
      const { data: airports, error: airportsErr } = await supabase
        .from('airports')
        .select('id, is_active, default_landing_fee_cents')
        .in('id', airportIds)
      if (airportsErr) {
        throw new Error('Failed to calculate landing fees for block time billing.')
      }

      const airportsById = new Map(
        (airports ?? []).map((airport) => [airport.id, airport] as const),
      )

      for (const row of landingCharges) {
        const airport = airportsById.get(row.airportId)
        if (!airport) {
          throw new Error(`Airport not found: ${row.airportId}`)
        }
        if (!airport.is_active) {
          throw new Error(`Airport is not active: ${row.airportId}`)
        }
        const unitAmountCents = Number(airport.default_landing_fee_cents)
        if (!Number.isFinite(unitAmountCents)) {
          throw new Error(`Invalid landing fee for airport: ${row.airportId}`)
        }
        landingFeesTotal += (unitAmountCents * row.landingCount) / 100
      }

      landingFeesTotal = Math.round(landingFeesTotal * 100) / 100
    }

    const { data: drawdownRows, error: drawdownErr } = await supabase.rpc(
      'process_block_time_flight',
      {
        p_user_id: booking.booking_owner_user_id,
        p_booking_id: input.bookingId,
        p_vdo_hours: effectiveVdoHoursRounded,
        p_landing_fees: landingFeesTotal,
      },
    )

    if (drawdownErr) {
      // Fall back to PAYF ONLY for the specific "package gone" exception the
      // RPC raises when the package expired/exhausted between the pre-check
      // and the drawdown. Any other error — including the migration-108
      // 'Unauthorized' admin guard, which shares Postgres error code P0001
      // with RAISE EXCEPTION — must surface to the admin instead of silently
      // billing the pilot at the PAYF rate.
      const isNoPackageError =
        drawdownErr.message?.toLowerCase().includes('no active block time package') ?? false

      if (isNoPackageError) {
        console.warn(
          '[finaliseStandardBookingInvoice] Block time package expired or exhausted.',
          'Falling back to PAYF billing at $330/hr.',
          { userId: booking.booking_owner_user_id, bookingId: input.bookingId },
        )

        const fallbackFlightTotal = Math.round(effectiveVdoHoursRounded * PAYF_RATE_PER_HOUR * 100) / 100
        const fallbackGrandTotal = Math.round((fallbackFlightTotal + landingFeesTotal) * 100) / 100
        const fallbackSubtotal = Math.round((fallbackGrandTotal / 1.1) * 100) / 100
        const fallbackGst = Math.round((fallbackGrandTotal - fallbackSubtotal) * 100) / 100

        const { data: fallbackRows, error: fallbackErr } = await supabase.rpc(
          'finalise_standard_booking_invoice_atomic',
          {
            p_booking_id: input.bookingId,
            p_customer_id: booking.booking_owner_user_id,
            p_vdo_reading: effectiveVdoHoursRounded,
            p_rate_cents_per_hour: PAYF_RATE_PER_HOUR * 100,
            p_landing_charges: landingChargesJson ?? null,
            p_admin_notes: `[AUTO FALLBACK] Pilot block time package expired or exhausted. Billed at Pay As You Fly rate ($${PAYF_RATE_PER_HOUR}/hr). Original admin note: ${input.adminNotes ?? 'none'}`,
          },
        )

        if (fallbackErr || !fallbackRows?.[0]) {
          throw new Error(
            `Block time package expired and PAYF fallback also failed: ${fallbackErr?.message ?? 'unknown error'}`,
          )
        }

        await supabase
          .from('verification_events')
          .insert({
            user_id: booking.booking_owner_user_id,
            actor_role: 'system',
            event_type: 'message',
            title: 'Block time package expired -- billed at Pay As You Fly rate',
            body: `Pilot's block time package had expired or was exhausted at the time of finalisation. Flight of ${effectiveVdoHoursRounded}h was billed at the standard Pay As You Fly rate of $${PAYF_RATE_PER_HOUR}/hr instead. Please review with the pilot.`,
            is_read: false,
            email_status: 'pending',
          })
          .then(({ error: notifErr }) => {
            if (notifErr) console.warn('[finaliseStandardBookingInvoice] fallback notif failed', notifErr.message)
          })

        revalidatePath('/admin/bookings')
        revalidatePath(`/admin/bookings/requests/${input.bookingId}`)
        revalidatePath(`/dashboard/bookings/${input.bookingId}`)
        revalidatePath('/dashboard')

        void emitBookingChanged({ bookingId: input.bookingId, userId: booking.booking_owner_user_id })
        void emitPaymentUpdated({ userId: booking.booking_owner_user_id, bookingId: input.bookingId })
        void emitOpsChanged()

        return {
          success: true,
          invoiceNumber: (fallbackRows[0] as { v_invoice_number?: string | null }).v_invoice_number ?? null,
          billingMode: 'pay_as_you_fly_fallback',
          message: 'Block time package expired. Billed at Pay As You Fly rate.',
        } as any
      }

      console.error('[finaliseStandardBookingInvoice] block time drawdown failed (no fallback taken)', {
        code: drawdownErr.code,
        message: drawdownErr.message,
        bookingId: input.bookingId,
        userId: booking.booking_owner_user_id,
      })
      throw new Error(
        `Block time drawdown failed and NO billing was performed: ${drawdownErr.message ?? 'unknown error'}. ` +
        `The booking is still in post-flight review — resolve the error and finalise again. ` +
        `(The pilot was NOT billed at the Pay As You Fly rate; that fallback only applies when their package expired or was exhausted.)`,
      )
    }

    if (!drawdownRows?.[0]) {
      throw new Error('Block time drawdown returned no result.')
    }

    const drawdown = drawdownRows[0] as {
      out_usage_invoice_id: string
      out_usage_invoice_number: string
      out_overage_invoice_id: string | null
      out_overage_invoice_number: string | null
      out_landing_invoice_id: string | null
      out_landing_invoice_number: string | null
      out_overflow_hours: number
      out_overflow_amount: number
      out_hours_after: number
      out_purchase_id: string
      out_rate_per_hour: number
    }
    const hasOverage = drawdown.out_overage_invoice_id != null && Number(drawdown.out_overflow_hours) > 0

    // ── Overage: no automatic card charge. The overage invoice stays
    // 'awaiting' and gates new bookings/purchases/top-ups until paid.
    // Flag it clearly to the admin (and to the customer's inbox).
    if (hasOverage) {
      try {
        await supabase
          .from('verification_events')
          .insert({
            user_id: booking.booking_owner_user_id,
            actor_role: 'system',
            event_type: 'message',
            title: 'BLOCK TIME OVERAGE — unpaid overage invoice issued',
            body: `Flight for booking ${input.bookingId} exceeded the pilot's block time balance. Overage of ${drawdown.out_overflow_hours}h at the locked rate of $${Number(drawdown.out_rate_per_hour).toFixed(2)}/hr = $${Number(drawdown.out_overflow_amount).toFixed(2)} has been invoiced (invoice ${drawdown.out_overage_invoice_number}). The invoice is unpaid: the pilot cannot make new bookings, buy block time, or top up until it is settled. They can pay it from their Block Time page.`,
            is_read: false,
            email_status: 'pending',
          })
      } catch (notifErr: unknown) {
        console.warn('[finaliseStandardBookingInvoice] overage alert insert failed', notifErr)
      }
    }

    // ── Landing fees: routed through the same payment-path chooser as PAYF
    // (send invoice / mark paid / waived). No automatic card charge — the
    // invoice is created 'awaiting' with no payment method (migration 106)
    // and the admin's choice decides what happens next.
    const landingSettlement = resolveBlockTimeLandingSettlement({ submissionMode })
    let landingOutcome:
      | 'awaiting'
      | 'settled_manual'
      | 'waived'
      | null = null
    let landingSettlementError: string | null = null
    if (drawdown.out_landing_invoice_id && landingFeesTotal > 0) {
      try {
        if (landingSettlement.action === 'waive') {
          const { data: waivedRows, error: waiveErr } = await supabase
            .from('invoices')
            .update({ status: 'waived' })
            .eq('id', drawdown.out_landing_invoice_id)
            .eq('status', 'awaiting')
            .select('id')
          if (waiveErr) throw new Error(waiveErr.message)
          if (!waivedRows || waivedRows.length === 0) {
            throw new Error('Landing fee invoice was not in an awaiting state.')
          }
          landingOutcome = 'waived'
        } else if (landingSettlement.action === 'settle_manual') {
          await adminSettleBlockTimeInvoice({
            invoiceId: drawdown.out_landing_invoice_id,
            paymentMethod: input.manualPaymentMethod ?? null,
            note: input.adminNotes?.trim() || undefined,
          })
          landingOutcome = 'settled_manual'
        } else {
          landingOutcome = 'awaiting'
        }
      } catch (error: unknown) {
        // The drawdown is already committed, so the finalisation continues;
        // the failure is re-thrown at the end of this branch so the admin
        // sees it in the panel instead of it being swallowed.
        landingSettlementError = error instanceof Error ? error.message : 'Unknown error.'
        console.error('[finaliseStandardBookingInvoice] landing fee settlement failed:', error)
      }
    }

    const isPaymentPending = (landingOutcome === 'awaiting') || hasOverage
    const blockTimeBookingStatus = isPaymentPending ? 'payment_pending' : 'completed'

    const { error: bookingStatusErr } = await supabase
      .from('bookings')
      .update({
        status: blockTimeBookingStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.bookingId)

    if (bookingStatusErr) {
      console.error('[finaliseStandardBookingInvoice] booking status update failed', {
        message: bookingStatusErr.message,
      })
      throw new Error('Failed to update booking status after block time finalisation.')
    }

    // Release schedule holds if booking is fully completed
    if (blockTimeBookingStatus === 'completed') {
      await supabase
        .from('schedule_blocks')
        .update({ status: 'cancelled' })
        .eq('related_booking_id', input.bookingId)
        .eq('status', 'active')
    }

    try {
      const { data: authData } = await supabase.auth.getUser()
      const blockTimeHistoryNote = isPaymentPending
        ? (hasOverage
            ? `Block time flight finalised. Overage invoice ${drawdown.out_overage_invoice_number} awaiting payment.`
            : `Block time flight finalised. Landing fee invoice ${drawdown.out_landing_invoice_number} awaiting payment.`)
        : (minimumVdoOutcomeMessage
            ? `Block time flight finalised. ${minimumVdoOutcomeMessage}`
            : 'Block time flight finalised. Hours deducted from balance.')
      await supabase
        .from('booking_status_history')
        .insert({
          booking_id: input.bookingId,
          old_status: 'pending_post_flight_review',
          new_status: blockTimeBookingStatus,
          note: blockTimeHistoryNote,
          changed_by_user_id: authData.user?.id ?? null,
        })
    } catch (historyErr: any) {
      console.warn('[finaliseStandardBookingInvoice] booking_status_history insert failed (non-fatal)', {
        message: historyErr?.message,
      })
    }

    // Generate + upload a PDF for every invoice created by the drawdown
    // (usage, overage, landing fees — each is its own invoice document).
    const pdfUrls = new Map<string, string>()
    const invoiceIdsForPdf = [
      { id: drawdown.out_usage_invoice_id,   footer: 'All prices include GST. Block time usage is deducted when the flight record is finalised.' },
      { id: drawdown.out_overage_invoice_id, footer: 'All prices include GST. BLOCK TIME OVERAGE: these hours exceeded your package balance and are billed at your locked package rate. Payment is required before new bookings or block time purchases.' },
      { id: drawdown.out_landing_invoice_id, footer: 'All prices include GST. Landing fees are invoiced separately from flight hours.' },
    ].filter((entry): entry is { id: string; footer: string } => entry.id != null)

    for (const entry of invoiceIdsForPdf) {
      try {
        const { data: invoice, error: invoiceErr } = await supabase
          .from('invoices')
          .select('id, invoice_number, type, user_id, booking_id, block_time_purchase_id, billing_mode, subtotal, gst_amount, total, status, created_at, paid_at, is_block_time_overage')
          .eq('id', entry.id)
          .single()

        if (invoiceErr || !invoice) {
          throw new Error(invoiceErr?.message ?? 'Invoice not found for PDF generation.')
        }

        const { data: lineItems, error: lineItemsErr } = await supabase
          .from('invoice_line_items')
          .select('description, quantity, unit_price, amount')
          .eq('invoice_id', invoice.id)
          .order('display_order', { ascending: true })

        if (lineItemsErr) {
          throw new Error(lineItemsErr.message)
        }

        const pdfBuffer = await generateInvoicePdf({
          invoiceNumber: invoice.invoice_number,
          documentKind: 'tax_invoice',
          statusLabel: String(invoice.status).toUpperCase(),
          createdAt: invoice.created_at,
          dueAt: invoice.paid_at ?? invoice.created_at,
          billingModeLabel: invoice.is_block_time_overage ? 'Block Time — OVERAGE' : 'Block Time',
          bookingRefLabel: booking.booking_reference,
          billToName: pilotProfile?.full_name?.trim() || snapshotProfile?.full_name?.trim() || 'Pilot',
          billToEmail: pilotProfile?.email?.trim() || '—',
          lineItems: (lineItems ?? []).map((lineItem) => ({
            description: lineItem.description,
            quantity: Number(lineItem.quantity),
            unitPrice: Number(lineItem.unit_price),
            amount: Number(lineItem.amount),
          })),
          subtotal: Number(invoice.subtotal),
          gstAmount: Number(invoice.gst_amount),
          total: Number(invoice.total),
          footerNote: entry.footer,
        })
        const storedPdf = await storeInvoicePdf({
          supabase,
          table: 'invoices',
          rowId: invoice.id,
          userId: booking.booking_owner_user_id,
          invoiceNumber: invoice.invoice_number,
          pdfBuffer,
        })

        pdfUrls.set(entry.id, storedPdf.pdfUrl)
      } catch (error) {
        console.error('[finaliseStandardBookingInvoice] block time PDF generation failed:', error)
      }
    }
    const usagePdfUrl = pdfUrls.get(drawdown.out_usage_invoice_id) ?? null
    const landingPdfUrl = drawdown.out_landing_invoice_id
      ? pdfUrls.get(drawdown.out_landing_invoice_id) ?? null
      : null
    const hasAwaitingLandingInvoice =
      landingOutcome === 'awaiting' &&
      Boolean(drawdown.out_landing_invoice_id) &&
      landingFeesTotal > 0

    const deductedHours = Math.round((effectiveVdoHoursRounded - Number(drawdown.out_overflow_hours)) * 100) / 100
    const blockTimeMessageParts = [
      ...(minimumVdoOutcomeMessage ? [minimumVdoOutcomeMessage] : []),
      `Your flight of ${vdoReading}h has been recorded and ${deductedHours}h deducted from your Block Time balance. Remaining balance: ${drawdown.out_hours_after}h.`,
    ]
    if (hasOverage) {
      blockTimeMessageParts.push(
        `Your flight exceeded your remaining balance: ${drawdown.out_overflow_hours}h has been invoiced separately as Block Time Overage at your locked rate of $${Number(drawdown.out_rate_per_hour).toFixed(2)}/hr (invoice ${drawdown.out_overage_invoice_number}, $${Number(drawdown.out_overflow_amount).toFixed(2)}). Please pay this invoice from your Block Time page — new bookings and block time purchases are unavailable until it is settled.`,
      )
    }
    if (drawdown.out_landing_invoice_id) {
      const landingAmountLabel = `$${landingFeesTotal.toFixed(2)}`
      if (landingOutcome === 'settled_manual') {
        blockTimeMessageParts.push(
          `Landing fees of ${landingAmountLabel} (invoice ${drawdown.out_landing_invoice_number}) have been recorded as paid.`,
        )
      } else if (landingOutcome === 'waived') {
        blockTimeMessageParts.push(
          `Landing fees of ${landingAmountLabel} (invoice ${drawdown.out_landing_invoice_number}) have been waived.`,
        )
      } else {
        blockTimeMessageParts.push(
          `Landing fees of ${landingAmountLabel} have been invoiced separately (invoice ${drawdown.out_landing_invoice_number}). Please pay it from your Purchases page.`,
        )
      }
    }
    const blockTimeMessage = blockTimeMessageParts.join(' ')

    const now = new Date().toISOString()

    const { error: flightRecordUpdateErr } = await supabase
      .from('flight_records')
      .update({
        tacho_start: fullReadings.tacho_start,
        tacho_stop: fullReadings.tacho_stop,
        vdo_start: fullReadings.vdo_start,
        vdo_stop: fullReadings.vdo_stop,
        air_switch_start: fullReadings.air_switch_start,
        air_switch_stop: fullReadings.air_switch_stop,
        mr_start: fullReadings.mr_start,
        mr_stop: fullReadings.mr_stop,
        oil_added: fullReadings.oil_added,
        oil_total: fullReadings.oil_total,
        fuel_added: fullReadings.fuel_added,
        fuel_returned: fullReadings.fuel_returned,
        landings: fullReadings.landings,
        customer_notes: fullReadings.notes,
        status: hasReadingChanges ? 'approved_with_correction' : 'approved',
        approved_by_user_id: adminId,
        approved_at: now,
        admin_notes: input.adminNotes ?? null,
        correction_reason: hasReadingChanges ? 'Admin adjusted aircraft readings during billing finalisation.' : null,
        updated_at: now,
      })
      .eq('id', flightRecord.id)

    if (flightRecordUpdateErr) {
      throw new Error('Failed to update the flight record with reviewed readings.')
    }

    const approvalBaseline = billingBaseline
    const refreshedReadings = buildReadingsFromTotals(
      {
        vdo_total:        fullReadingsTotals.vdo_total ?? 0,
        tacho_total:      fullReadingsTotals.tacho_total ?? 0,
        air_switch_total: fullReadingsTotals.air_switch_total ?? 0,
        mr_total:         fullReadingsTotals.mr_total ?? 0,
        oil_added:        fullReadings.oil_added,
        oil_total:        fullReadings.oil_total,
        fuel_added:       fullReadings.fuel_added,
        fuel_returned:    fullReadings.fuel_returned,
        landings:         fullReadings.landings,
        notes:            fullReadings.notes,
      },
      approvalBaseline,
    )

    await upsertAircraftFlightLogRecord({
      aircraft_id: booking.aircraft_id,
      flight_date: new Date(booking.scheduled_start).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }),
      pic_user_id: booking.booking_owner_user_id,
      pic_name: booking.pic_name || snapshotProfile?.full_name || 'Pilot',
      pic_arn: booking.pic_arn || snapshotProfile?.pilot_arn || null,
      readings: refreshedReadings,
      related_booking_id: input.bookingId,
      source: 'booking_customer_post_flight',
      review_status: hasReadingChanges ? 'admin_adjusted' : 'admin_confirmed',
      updated_by: adminId,
    })

    await supabase.from('booking_status_history').insert({
      booking_id:         input.bookingId,
      old_status:         'pending_post_flight_review',
      new_status:         'completed',
      changed_by_user_id: adminId,
      note: 'Flight record finalised using Block Time balance. Booking completed.',
    })

    await supabase.from('booking_audit_events').insert({
      booking_id:    input.bookingId,
      aircraft_id:   booking.aircraft_id,
      actor_user_id: adminId,
      actor_role:    'admin',
      event_type:    'booking_invoice_finalised',
      event_summary: `${minimumVdoOutcomeMessage ? `${minimumVdoOutcomeMessage} ` : ''}Admin finalised block time flight record. VDO: ${vdoReading}h @ $${input.ratePerHour}/hr. Final status: completed.`,
      new_value: {
        vdo_reading:     vdoReading,
        rate_per_hour:   input.ratePerHour,
        landing_charges: landingCharges,
        booking_status:  'completed',
        review_status:   hasReadingChanges ? 'admin_adjusted' : 'admin_confirmed',
        billing_mode:    'block_time',
        ...minimumVdoAuditValue,
        invoice_id:      drawdown.out_usage_invoice_id,
        overage_invoice_id: drawdown.out_overage_invoice_id,
        landing_invoice_id: drawdown.out_landing_invoice_id,
        overflow_hours:  drawdown.out_overflow_hours,
        payment_method:  submissionMode === 'mark_paid' ? input.manualPaymentMethod ?? null : null,
        submission_mode: submissionMode,
        landing_settlement: landingOutcome,
        landing_waiver_reason: landingOutcome === 'waived' ? input.waiverReason?.trim() ?? null : null,
      },
    })

    const verificationBodyParts = [
      ...(minimumVdoOutcomeMessage ? [minimumVdoOutcomeMessage] : []),
      hasOverage
        ? `${deductedHours}h deducted from your Block Time balance. Remaining balance: ${drawdown.out_hours_after}h. Your flight exceeded your balance — ${drawdown.out_overflow_hours}h has been invoiced as overage at your locked rate of $${Number(drawdown.out_rate_per_hour).toFixed(2)}/hr. Please pay invoice ${drawdown.out_overage_invoice_number} from your Block Time page to keep booking.`
        : `${deductedHours}h deducted from your Block Time balance. Remaining balance: ${drawdown.out_hours_after}h.`,
    ]
    if (hasAwaitingLandingInvoice) {
      verificationBodyParts.push(
        `Landing fees of $${landingFeesTotal.toFixed(2)} (invoice ${drawdown.out_landing_invoice_number}) require payment — open Purchases to pay.`,
      )
    }

    await supabase.from('verification_events').insert({
      user_id:       booking.booking_owner_user_id,
      actor_user_id: adminId,
      actor_role:    'admin',
      event_type:    'approved',
      title:         hasAwaitingLandingInvoice
        ? 'Landing fee invoice ready — payment required'
        : 'Flight record approved',
      body:          verificationBodyParts.join(' '),
      is_read:       false,
      email_status:  'skipped',
    })

    if (pilotProfile?.email) {
      const emailPdfUrl = hasAwaitingLandingInvoice
        ? (landingPdfUrl ?? usagePdfUrl)
        : usagePdfUrl
      const template = hasAwaitingLandingInvoice
        ? landingFeeInvoiceReadyEmail(blockTimeMessage, emailPdfUrl ?? undefined)
        : paymentConfirmedEmail(blockTimeMessage, emailPdfUrl ?? undefined)
      const emailText = emailPdfUrl
        ? `${blockTimeMessage}\n\nInvoice PDF: ${emailPdfUrl}`
        : blockTimeMessage
      // The billing write is the source of truth; email delivery can continue
      // in the background so the admin does not sit on the spinner waiting for
      // an external API round-trip.
      void sendEmail({
        to: pilotProfile.email,
        subject: template.subject,
        html: template.html,
        text: emailText,
        eventType: hasAwaitingLandingInvoice
          ? 'block_time_landing_fee_invoice'
          : 'block_time_flight_record',
        entityType: 'booking',
        entityId: input.bookingId,
        metadata: {
          billingMode: 'block_time',
          invoiceId: drawdown.out_usage_invoice_id,
          overageInvoiceId: drawdown.out_overage_invoice_id,
          landingInvoiceId: drawdown.out_landing_invoice_id,
          overflowHours: drawdown.out_overflow_hours,
          hoursAfter: drawdown.out_hours_after,
          pdfUrl: emailPdfUrl ?? null,
          landingSettlement: landingOutcome,
        },
      }).catch((error) => console.error('[finaliseStandardBookingInvoice] block time email failed:', error))
    }

    revalidatePath(`/admin/bookings/requests/${input.bookingId}`)
    revalidatePath(`/dashboard/bookings/${input.bookingId}`)
    revalidatePath('/dashboard/bookings')
    revalidatePath('/dashboard/purchases')
    revalidatePath('/dashboard')

    void emitBookingChanged({ bookingId: input.bookingId, userId: booking.booking_owner_user_id })
    void emitPaymentUpdated({ userId: booking.booking_owner_user_id, bookingId: input.bookingId })
    void emitBlockTimeUpdated(booking.booking_owner_user_id)
    void emitOpsChanged()

    // Surface a landing-fee settlement failure to the admin. Everything else
    // (drawdown, flight record, booking status) has completed successfully;
    // the landing invoice is still 'awaiting' with no payment method and can
    // be settled from the customer's profile (Block time flight invoices).
    if (landingSettlementError) {
      throw new Error(
        `Flight record finalised, but the landing fee invoice ${drawdown.out_landing_invoice_number ?? ''} could not be routed to the chosen payment path: ${landingSettlementError} ` +
        `The invoice is still awaiting payment — settle or re-route it from the customer's profile (Block time flight invoices section).`,
      )
    }
  } else {

  const rateCents = Math.round(input.ratePerHour * 100)
  const landingChargesJson = (input.landingCharges ?? [])
    .filter(lc => lc.airportId && lc.landingCount > 0)
    .map(lc => ({ airport_id: lc.airportId, landing_count: lc.landingCount }))

  const { data: rpcRows, error: rpcErr } = await supabase.rpc(
    'finalise_standard_booking_invoice_atomic',
    {
      p_booking_id:          input.bookingId,
      p_customer_id:         booking.booking_owner_user_id,
      p_vdo_reading:         effectiveVdoHoursRounded,
      p_rate_cents_per_hour: rateCents,
      p_landing_charges:     landingChargesJson.length > 0 ? landingChargesJson : null,
      p_admin_notes:         input.adminNotes ?? null,
    },
  )

  if (rpcErr || !rpcRows?.[0]) {
    console.error('[finaliseStandardBookingInvoice] RPC failed', rpcErr)
    throw new Error(rpcErr?.message ?? 'Failed to finalise invoice. Please try again.')
  }

  const invoiceId = rpcRows[0].out_invoice_id as string
  const amountDueNowCents = Number(rpcRows[0].out_amount_due_now_cents ?? 0)
  const rpcFinalBookingStatus = rpcRows[0].out_final_booking_status as string
  const finalBookingStatus = billingBranch.kind === 'waived'
    ? 'completed'
    : rpcFinalBookingStatus

  const now = new Date().toISOString()

  const { error: flightRecordUpdateErr } = await supabase
    .from('flight_records')
    .update({
      tacho_start: fullReadings.tacho_start,
      tacho_stop: fullReadings.tacho_stop,
      vdo_start: fullReadings.vdo_start,
      vdo_stop: fullReadings.vdo_stop,
      air_switch_start: fullReadings.air_switch_start,
      air_switch_stop: fullReadings.air_switch_stop,
      mr_start: fullReadings.mr_start,
      mr_stop: fullReadings.mr_stop,
      oil_added: fullReadings.oil_added,
      oil_total: fullReadings.oil_total,
      fuel_added: fullReadings.fuel_added,
      fuel_returned: fullReadings.fuel_returned,
      landings: fullReadings.landings,
      customer_notes: fullReadings.notes,
      status: hasReadingChanges ? 'approved_with_correction' : 'approved',
      approved_by_user_id: adminId,
      approved_at: now,
      admin_notes: input.adminNotes ?? null,
      correction_reason: hasReadingChanges ? 'Admin adjusted aircraft readings during billing finalisation.' : null,
      updated_at: now,
    })
    .eq('id', flightRecord.id)

  if (flightRecordUpdateErr) {
    throw new Error('Failed to update the flight record with reviewed readings.')
  }

  // The aircraft-log chain anchor (start) comes from the FINALIZED baseline
  // fetched at the top of this finalisation; nothing in this request finalises
  // another log before this point, so the value is still current.
  // The admin-confirmed totals (stop - start from the form) are preserved exactly;
  // only the chain anchor (start) is refreshed. flight_records keeps the
  // hidden full readings that were reconstructed from the submitted totals.
  // as the admin review audit document.
  const approvalBaseline = billingBaseline
  const refreshedReadings = buildReadingsFromTotals(
    {
      vdo_total:        fullReadingsTotals.vdo_total ?? 0,
      tacho_total:      fullReadingsTotals.tacho_total ?? 0,
      air_switch_total: fullReadingsTotals.air_switch_total ?? 0,
      mr_total:         fullReadingsTotals.mr_total ?? 0,
      oil_added:        fullReadings.oil_added,
      oil_total:        fullReadings.oil_total,
      fuel_added:       fullReadings.fuel_added,
      fuel_returned:    fullReadings.fuel_returned,
      landings:         fullReadings.landings,
      notes:            fullReadings.notes,
    },
    approvalBaseline,
  )

  await upsertAircraftFlightLogRecord({
    aircraft_id: booking.aircraft_id,
    flight_date: new Date(booking.scheduled_start).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }),
    pic_user_id: booking.booking_owner_user_id,
    pic_name: booking.pic_name || snapshotProfile?.full_name || 'Pilot',
    pic_arn: booking.pic_arn || snapshotProfile?.pilot_arn || null,
    readings: refreshedReadings,
    related_booking_id: input.bookingId,
    source: 'booking_customer_post_flight',
    review_status: hasReadingChanges ? 'admin_adjusted' : 'admin_confirmed',
    updated_by: adminId,
  })

  const shouldGenerateStandardPdfNow =
    billingBranch.kind !== 'waived' &&
    !(billingBranch.kind === 'invoice' && input.submissionMode === 'mark_paid' && amountDueNowCents > 0)

  if (billingBranch.kind === 'waived') {
    const { error: waivedInvoiceErr } = await supabase
      .from('booking_invoices')
      .update({
        status: 'waived',
        total_paid_cents: 0,
        paid_at: now,
        updated_at: now,
      })
      .eq('id', invoiceId)
    if (waivedInvoiceErr) {
      throw new Error(`Failed to mark the booking invoice as waived: ${waivedInvoiceErr.message}`)
    }

    await supabase
      .from('bookings')
      .update({
        status: 'completed',
        updated_at: now,
      })
      .eq('id', input.bookingId)
  } else if (billingBranch.kind === 'invoice' && input.submissionMode === 'mark_paid' && amountDueNowCents > 0) {
    await recordManualPayment({
      bookingId: input.bookingId,
      amountCents: amountDueNowCents,
      paymentMethod: input.manualPaymentMethod ?? null,
      note: input.adminNotes?.trim() || undefined,
    })

    try {
      const pdfResult = await generateStandardBookingInvoicePdf({ supabase, invoiceId })
      if (pdfResult) {
        console.log('[finaliseStandardBookingInvoice] standard booking receipt generated', {
          invoiceId,
          pdfUrl: pdfResult.pdfUrl,
        })
      }
    } catch (error) {
      console.error('[finaliseStandardBookingInvoice] standard booking receipt generation failed:', error)
    }
  }

  if (shouldGenerateStandardPdfNow) {
    try {
      const pdfResult = await generateStandardBookingInvoicePdf({ supabase, invoiceId })
      if (pdfResult) {
        console.log('[finaliseStandardBookingInvoice] standard booking PDF generated', {
          invoiceId,
          pdfUrl: pdfResult.pdfUrl,
        })
      }
    } catch (error) {
      console.error('[finaliseStandardBookingInvoice] standard booking PDF generation failed:', error)
    }
  }

  await supabase.from('booking_status_history').insert({
    booking_id:         input.bookingId,
    old_status:         'pending_post_flight_review',
    new_status:         finalBookingStatus,
    changed_by_user_id: adminId,
    note: billingBranch.kind === 'waived'
      ? 'Admin waived the standard booking invoice. Booking completed.'
      : finalBookingStatus === 'completed'
        ? (billingBranch.kind === 'invoice' && input.submissionMode === 'mark_paid'
            ? 'Invoice settled by manual payment. Booking completed.'
            : 'Invoice settled by customer credit. Booking completed.')
        : 'Admin finalised flight billing. Payment request sent to customer.',
  })

    await supabase.from('booking_audit_events').insert({
      booking_id:    input.bookingId,
      aircraft_id:   booking.aircraft_id,
      actor_user_id: adminId,
      actor_role:    'admin',
      event_type:    'booking_invoice_finalised',
      event_summary: `${minimumVdoOutcomeMessage ? `${minimumVdoOutcomeMessage} ` : ''}Admin finalised standard booking invoice. VDO: ${vdoReading}h @ $${input.ratePerHour}/hr. Final status: ${finalBookingStatus}.`,
      new_value: {
        vdo_reading:     vdoReading,
        rate_per_hour:   input.ratePerHour,
        landing_charges: landingChargesJson,
        booking_status:  finalBookingStatus,
        review_status:   hasReadingChanges ? 'admin_adjusted' : 'admin_confirmed',
        billing_branch:  billingBranch.kind,
        ...minimumVdoAuditValue,
        payment_method:  submissionMode === 'mark_paid' ? input.manualPaymentMethod ?? null : null,
        submission_mode: submissionMode,
        payment_waived:  billingBranch.kind === 'waived',
      },
    })

  const wasManuallySettled = billingBranch.kind === 'invoice' && input.submissionMode === 'mark_paid'
  const wasWaived = billingBranch.kind === 'waived'
  const isSettledByCredit = finalBookingStatus === 'completed' && !wasManuallySettled && !wasWaived
  if (!wasManuallySettled) {
    await supabase.from('verification_events').insert({
      user_id:       booking.booking_owner_user_id,
      actor_user_id: adminId,
      actor_role:    'admin',
      event_type:    'approved',
      title: wasWaived
        ? 'Flight invoice waived'
        : isSettledByCredit
          ? 'Flight invoice settled by credit'
          : 'Flight invoice ready — payment required',
      body: `${minimumVdoOutcomeMessage ? `${minimumVdoOutcomeMessage} ` : ''}${wasWaived
        ? 'Your flight invoice has been waived by the admin team. Your booking is now complete.'
        : isSettledByCredit
          ? 'Your flight invoice has been settled using your account credit. Your booking is now complete.'
          : 'Your flight invoice has been issued. Please pay the invoice to close your booking.'}`,
      is_read:      false,
      email_status: 'skipped',
    })
  }

  const { data: profileForInvoiceEmail } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', booking.booking_owner_user_id)
    .single()
  if (profileForInvoiceEmail?.email && !wasManuallySettled) {
    const invoiceEmailPrefix = minimumVdoOutcomeMessage ? `${minimumVdoOutcomeMessage} ` : ''
    const template = wasWaived
      ? paymentConfirmedEmail(`${invoiceEmailPrefix}Your flight invoice was waived by the admin team.`)
      : isSettledByCredit
        ? paymentConfirmedEmail(`${invoiceEmailPrefix}Payment has been recorded for your flight.`)
        : checkoutOutcomeEmail(
            'Payment required for your flight',
            'Payment required for your flight',
            `${invoiceEmailPrefix}Your post-flight invoice is ready. Please complete payment from your dashboard.`,
            'Pay Now',
          )
    // The billing write is the source of truth; email delivery can continue
    // in the background so the admin does not sit on the spinner waiting for
    // an external API round-trip.
    void sendEmail({
      to: profileForInvoiceEmail.email,
      subject: template.subject,
      html: template.html,
      eventType: isSettledByCredit ? 'post_flight_payment_received' : 'post_flight_payment_required',
      entityType: 'booking',
      entityId: input.bookingId,
    }).catch((error) => console.error('[finaliseStandardBookingInvoice] email failed:', error))
  }

  // When billing closes the booking (waived / credit / mark-paid), release any
  // leftover active schedule holds. payment_pending keeps the hold until paid.
  if (finalBookingStatus === 'completed') {
    await supabase
      .from('schedule_blocks')
      .update({ status: 'cancelled' })
      .eq('related_booking_id', input.bookingId)
      .eq('status', 'active')
  }

  revalidatePath(`/admin/bookings/requests/${input.bookingId}`)
  revalidatePath(`/dashboard/bookings/${input.bookingId}`)

  void emitBookingChanged({ bookingId: input.bookingId, userId: booking.booking_owner_user_id })
  if (!wasWaived) {
    void emitPaymentUpdated({ userId: booking.booking_owner_user_id, bookingId: input.bookingId })
  }
  void emitOpsChanged()
  }
}

// ─── Admin-initiated flight record submission ─────────────────────────────────
// Admin submits post-flight readings on the customer's behalf, from any
// operational booking status and at any time (before/on/after the scheduled
// date). Creates the flight record via the same shared submission core as the
// customer path (same confirmation email fires for the customer), then
// immediately runs the same billing finalisation used for customer-submitted
// records — the readings entered here are admin-entered, so no separate review
// pass is needed. Billing branches on the customer's block time status exactly
// as it does for self-submitted records.

export async function adminSubmitFlightRecord(input: {
  bookingId: string
  date: string                     // YYYY-MM-DD flight date
  ratePerHour: number
  landingCharges?: { airportId: string; landingCount: number }[]
  adminNotes?: string
  readings: TotalOnlyReadings
  submissionMode?: 'send_invoice' | 'mark_paid' | 'waived'
  manualPaymentMethod?: ManualSettlementMethod
  waiverReason?: string
  minimumVdoDecision?: MinimumVdoDecision
}): Promise<void> {
  const { supabase, adminId } = await requireAdmin()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error('VALIDATION: Flight date must be a valid date (YYYY-MM-DD).')
  }

  validateTotalOnlyReadings(input.readings)
  if (input.readings.vdo_total == null || input.readings.vdo_total <= 0) {
    throw new Error('VALIDATION: VDO total must be greater than 0.')
  }

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, booking_type, aircraft_id, booking_owner_user_id, scheduled_start, scheduled_end, status, pic_name, pic_arn')
    .eq('id', input.bookingId)
    .single()

  if (bookingErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'standard') {
    throw new Error('VALIDATION: Post-flight records can only be submitted for standard bookings.')
  }

  // Refuse when a record is already in the post-flight pipeline.
  const { data: existingRecords } = await supabase
    .from('flight_records')
    .select('status, submitted_at')
    .eq('booking_id', input.bookingId)
  const hasSubmittedRecord = (existingRecords ?? []).some((record) => {
    const status = (record as { status?: string | null }).status ?? null
    if (!status) return Boolean((record as { submitted_at?: string | null }).submitted_at)
    return !['draft', 'rejected'].includes(status)
  })
  if (hasSubmittedRecord) {
    throw new Error('VALIDATION: A flight record has already been submitted for this booking.')
  }

  const landingCharges = (input.landingCharges ?? []).filter(
    (row) => row.airportId?.trim() && Number.isInteger(row.landingCount) && row.landingCount > 0,
  )

  await createFlightRecordForBooking(
    supabase,
    booking,
    {
      booking_id:       input.bookingId,
      date:             input.date,
      pic_name:         booking.pic_name,
      pic_arn:          booking.pic_arn,
      vdo_total:        input.readings.vdo_total,
      tacho_total:      input.readings.tacho_total,
      air_switch_total: input.readings.air_switch_total,
      mr_total:         input.readings.mr_total,
      oil_added:        input.readings.oil_added,
      oil_total:        input.readings.oil_total,
      fuel_added:       input.readings.fuel_added,
      fuel_returned:    input.readings.fuel_returned,
      landings:         input.readings.landings,
      landing_rows:     landingCharges.map((row) => ({
        airport_id:    row.airportId,
        landing_count: row.landingCount,
      })),
      customer_notes:   null,
    },
    { userId: adminId, role: 'admin' },
  )

  // Booking is now pending_post_flight_review — run the shared billing
  // finalisation (block time drawdown / PAYF invoice branching lives there).
  await finaliseStandardBookingInvoice({
    bookingId:      input.bookingId,
    ratePerHour:    input.ratePerHour,
    landingCharges: landingCharges.length > 0 ? landingCharges : undefined,
    adminNotes:     input.adminNotes,
    readings:       input.readings,
    submissionMode:  input.submissionMode,
    manualPaymentMethod: input.manualPaymentMethod,
    waiverReason:    input.waiverReason,
    minimumVdoDecision: input.minimumVdoDecision,
  })

  // After post-flight finalisation the aircraft is free — release any leftover
  // active schedule holds (including early-finish remaining window).
  await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', input.bookingId)
    .eq('status', 'active')
}

/**
 * Admin approves a late cancellation and applies a cancellation charge.
 * Booking → cancelled, schedule blocks released, request → approved_charged.
 * Prefer an explicit admin-entered amount; fall back to booking.estimated_amount.
 */
export async function adminApproveCancellationCharged(
  cancellationRequestId: string,
  adminNote: string | null,
  chargeAmountDollars?: number | null,
): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  const { data: req, error: fetchErr } = await supabase
    .from('booking_cancellation_requests')
    .select(`
      id, booking_id, user_id, booking_start_time, is_within_24_hours, customer_message, status,
      bookings ( status, booking_type, aircraft_id, booking_reference, estimated_amount, estimated_hours, booking_owner_user_id )
    `)
    .eq('id', cancellationRequestId)
    .single()

  if (fetchErr || !req) throw new Error('Cancellation request not found.')
  const r = req as unknown as CancellationRequestRow
  if (r.status !== 'pending') {
    throw new Error(`VALIDATION: Request is already resolved (status: ${r.status}).`)
  }
  const booking = r.bookings
  if (!booking) throw new Error('Booking data missing from cancellation request.')

  let chargeCents = 0
  if (chargeAmountDollars != null && Number.isFinite(chargeAmountDollars)) {
    if (chargeAmountDollars <= 0) {
      throw new Error('VALIDATION: Charge amount must be greater than zero.')
    }
    chargeCents = Math.round(chargeAmountDollars * 100)
  } else if (booking.estimated_amount && booking.estimated_amount > 0) {
    chargeCents = Math.round(booking.estimated_amount * 100)
  } else {
    throw new Error('VALIDATION: Enter a charge amount greater than zero.')
  }

  const oldBookingStatus = booking.status
  const isCheckout = booking.booking_type === 'checkout'
  const lateWindowLabel = isCheckout ? '12-hour' : '24-hour'

  // Cancel the booking and set payment_status to indicate a charge is due
  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({
      status:                'cancelled',
      cancellation_category: 'customer',
      payment_status:        chargeCents > 0 ? 'invoice_generated' : 'not_required',
      ...(isCheckout
        ? {
            checkout_lifecycle_status: 'cancelled_by_customer',
            cancellation_reason: `Late checkout cancellation approved — charge of $${(chargeCents / 100).toFixed(2)} applies.`,
          }
        : {}),
      updated_at:            now,
    })
    .eq('id', r.booking_id)

  if (bookingErr) throw new Error('Failed to cancel booking.')

  // Release schedule blocks
  await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', r.booking_id)

  if (isCheckout) {
    await supabase
      .from('checkout_change_requests')
      .update({
        status: 'approved',
        admin_note: adminNote?.trim() || `Late cancel approved — charge applied (${chargeCents} cents).`,
        reviewed_by: adminId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('checkout_request_id', r.booking_id)
      .eq('request_type', 'cancel')
      .eq('status', 'pending')

    await supabase
      .from('checkout_change_requests')
      .update({
        status: 'cancelled',
        admin_note: 'Superseded by approved late cancellation.',
        reviewed_by: adminId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('checkout_request_id', r.booking_id)
      .eq('request_type', 'reschedule')
      .eq('status', 'pending')

    await supabase
      .from('profiles')
      .update({ pilot_clearance_status: 'checkout_required', updated_at: now })
      .eq('id', booking.booking_owner_user_id)
  }

  // Update cancellation request
  await supabase
    .from('booking_cancellation_requests')
    .update({
      status:             'approved_charged',
      admin_note:         adminNote?.trim() || null,
      decided_by:         adminId,
      decided_at:         now,
      charge_amount_cents: chargeCents,
      updated_at:         now,
    })
    .eq('id', cancellationRequestId)

  const chargeDisplay = chargeCents > 0 ? `$${(chargeCents / 100).toFixed(2)}` : 'to be determined'
  const historyNote = adminNote?.trim()
    ? `Booking cancelled inside ${lateWindowLabel} window. Cancellation charge of ${chargeDisplay} applies. Admin note: ${adminNote.trim()}`
    : `Booking cancelled inside ${lateWindowLabel} window. Cancellation charge of ${chargeDisplay} applies. Please contact operations to arrange payment.`

  await supabase.from('booking_status_history').insert({
    booking_id:         r.booking_id,
    old_status:         oldBookingStatus,
    new_status:         'cancelled',
    changed_by_user_id: adminId,
    note:               historyNote,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id:    r.booking_id,
    aircraft_id:   booking.aircraft_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'cancellation_approved_charged',
    event_summary: `Admin approved cancellation with charge (${chargeDisplay}).`,
    new_value:     { status: 'cancelled', charge: 'applied', charge_cents: chargeCents, admin_note: adminNote },
  })

  // Notify customer
  const { data: notifyData } = await supabase
    .from('bookings')
    .select('booking_reference, profiles:booking_owner_user_id ( full_name, email )')
    .eq('id', r.booking_id)
    .single()

  if (notifyData) {
    const prof  = Array.isArray(notifyData.profiles) ? notifyData.profiles[0] : notifyData.profiles
    const email = (prof as { email?: string | null } | null)?.email
    if (email) {
      notifyBookingCancelled({
        customerEmail: email,
        customerName:  (prof as { full_name?: string | null } | null)?.full_name ?? 'Pilot',
        ref:           notifyData.booking_reference ?? r.booking_id.slice(0, 8).toUpperCase(),
        reason: chargeCents > 0
          ? `Your cancellation request has been approved. As the booking was cancelled inside the ${lateWindowLabel} window, a cancellation charge of ${chargeDisplay} applies. Please contact operations to arrange payment.`
          : 'Your cancellation request has been approved. A cancellation charge may apply — please contact operations.',
        bookingId: r.booking_id,
      }).catch(e => console.error('[adminApproveCancellationCharged] notification error:', e))
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/bookings/cancellations')
  revalidatePath(`/admin/bookings/requests/${r.booking_id}`)
  revalidatePath(`/dashboard/bookings/${r.booking_id}`)
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard/checkout')
  revalidatePath('/admin/checkouts/cancelled')

  void emitBookingChanged({ bookingId: r.booking_id, userId: booking.booking_owner_user_id })
  if (isCheckout) void emitClearanceUpdated(booking.booking_owner_user_id)
  void emitPaymentUpdated({ userId: booking.booking_owner_user_id, bookingId: r.booking_id })
  void emitOpsChanged()
}

export async function assignInstructor(bookingId: string, instructorId: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  // 1. Load booking and guard state
  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, booking_type, booking_owner_user_id, aircraft_id')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'checkout') {
    throw new Error('VALIDATION: This booking is not a checkout booking.')
  }
  if (booking.status !== 'checkout_requested') {
    throw new Error(`VALIDATION: Cannot assign instructor for checkout booking with status '${booking.status}'.`)
  }
  if (instructorId === booking.booking_owner_user_id) {
    throw new Error('VALIDATION: A pilot cannot be assigned as their own instructor.')
  }

  // 2. Grant instructor role idempotently
  const { error: roleErr } = await supabase
    .from('user_roles')
    .upsert({
      user_id: instructorId,
      role: 'instructor',
      granted_by: adminId,
    }, { onConflict: 'user_id, role' })

  if (roleErr) throw new Error(`Failed to grant instructor role: ${roleErr.message}`)

  // 3. Flip any existing active assignment to inactive
  const { error: deactivateErr } = await supabase
    .from('checkout_instructor_assignments')
    .update({ is_active: false })
    .eq('checkout_id', bookingId)
    .eq('is_active', true)

  if (deactivateErr) throw new Error(`Failed to deactivate prior assignment: ${deactivateErr.message}`)

  // 4. Insert the new active assignment row
  const { data: assignment, error: assignErr } = await supabase
    .from('checkout_instructor_assignments')
    .insert({
      checkout_id: bookingId,
      instructor_id: instructorId,
      assigned_by: adminId,
      status: 'pending',
      is_active: true,
    })
    .select('id')
    .single()

  if (assignErr || !assignment) throw new Error(`Failed to insert assignment: ${assignErr?.message}`)

  // 5. Audit event
  const { data: instructorProfile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', instructorId)
    .single()
  
  const instructorName = instructorProfile?.full_name || instructorProfile?.email || instructorId

  await supabase.from('booking_audit_events').insert({
    booking_id: bookingId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'instructor_assigned',
    event_summary: `Admin assigned ${instructorName} as instructor.`,
    new_value: { assignment_id: assignment.id, instructor_id: instructorId },
  })

  revalidatePath(`/admin/bookings/requests/${bookingId}`)

  void emitBookingChanged({ bookingId, userId: booking.booking_owner_user_id })
  void emitOpsChanged()
}

export async function assignSelfAsInstructor(bookingId: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  // 1. Load booking and guard state
  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, booking_type, booking_owner_user_id, aircraft_id')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.booking_type !== 'checkout') {
    throw new Error('VALIDATION: This booking is not a checkout booking.')
  }
  if (booking.status !== 'checkout_requested') {
    throw new Error(`VALIDATION: Cannot assign instructor for checkout booking with status '${booking.status}'.`)
  }
  if (adminId === booking.booking_owner_user_id) {
    throw new Error('VALIDATION: A pilot cannot be assigned as their own instructor.')
  }

  // 2. Grant instructor role idempotently (to adminId)
  const { error: roleErr } = await supabase
    .from('user_roles')
    .upsert({
      user_id: adminId,
      role: 'instructor',
      granted_by: adminId,
    }, { onConflict: 'user_id, role' })

  if (roleErr) throw new Error(`Failed to grant instructor role: ${roleErr.message}`)

  // 3. Flip any existing active assignment to inactive
  const { error: deactivateErr } = await supabase
    .from('checkout_instructor_assignments')
    .update({ is_active: false })
    .eq('checkout_id', bookingId)
    .eq('is_active', true)

  if (deactivateErr) throw new Error(`Failed to deactivate prior assignment: ${deactivateErr.message}`)

  // 4. Insert the new active assignment row (accepted)
  const { data: assignment, error: assignErr } = await supabase
    .from('checkout_instructor_assignments')
    .insert({
      checkout_id: bookingId,
      instructor_id: adminId,
      assigned_by: adminId,
      status: 'accepted',
      is_active: true,
      responded_at: now,
    })
    .select('id')
    .single()

  if (assignErr || !assignment) throw new Error(`Failed to insert assignment: ${assignErr?.message}`)

  // 5. Audit event
  await supabase.from('booking_audit_events').insert({
    booking_id: bookingId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'instructor_self_assigned',
    event_summary: `Admin self-assigned as instructor.`,
    new_value: { assignment_id: assignment.id, instructor_id: adminId },
  })

  revalidatePath(`/admin/bookings/requests/${bookingId}`)

  void emitBookingChanged({ bookingId, userId: booking.booking_owner_user_id })
  void emitOpsChanged()
}
