'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyBookingCancelled } from '@/lib/booking/notifications'
import { emitBookingChanged, emitChatMessage, emitOpsChanged, emitClearanceUpdated } from '@/lib/realtime/emit'

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

export async function cancelBookingByAdmin(bookingId: string, reason: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()
  const trimmedReason = reason.trim()

  if (!trimmedReason) {
    throw new Error('VALIDATION: A cancellation reason is required.')
  }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, booking_type, scheduled_start, scheduled_end, aircraft_id, booking_owner_user_id, booking_reference')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  const nonCancellableStatuses = [
    'cancelled',
    'completed',
    'pending_post_flight_review',
    'post_flight_approved',
    'invoice_generated',
    'payment_pending',
    'paid',
    'awaiting_flight_record',
    'flight_record_overdue',
    'checkout_completed_under_review',
    'checkout_payment_required',
  ]
  if (nonCancellableStatuses.includes(booking.status)) {
    throw new Error(`VALIDATION: Cannot cancel a booking that is already ${booking.status.replace(/_/g, ' ')}.`)
  }

  const oldStatus = booking.status
  const isCheckout = booking.booking_type === 'checkout'
  const admin = createAdminClient()

  // 1. Update booking
  const updatePayload: Record<string, unknown> = {
    status: 'cancelled',
    admin_notes: trimmedReason,
    cancellation_category: 'admin',
    updated_at: now,
  }
  if (isCheckout) {
    updatePayload.checkout_lifecycle_status = 'cancelled_by_admin'
  }

  const { error: updateErr } = await admin
    .from('bookings')
    .update(updatePayload)
    .eq('id', bookingId)

  if (updateErr) throw new Error('Failed to cancel booking.')

  // 2. If checkout: reset clearance status to checkout_required if needed so customer isn't stuck
  if (isCheckout && booking.booking_owner_user_id) {
    const { data: currentProfile } = await admin
      .from('profiles')
      .select('pilot_clearance_status')
      .eq('id', booking.booking_owner_user_id)
      .single()

    if (currentProfile && currentProfile.pilot_clearance_status !== 'cleared_to_fly') {
      const { data: otherCheckouts } = await admin
        .from('bookings')
        .select('id')
        .eq('booking_owner_user_id', booking.booking_owner_user_id)
        .eq('booking_type', 'checkout')
        .in('status', [
          'checkout_requested',
          'checkout_confirmed',
          'checkout_completed_under_review',
          'checkout_payment_required',
          'on_hold_pending_documents',
        ])
        .neq('id', bookingId)

      if (!otherCheckouts || otherCheckouts.length === 0) {
        await admin
          .from('profiles')
          .update({ pilot_clearance_status: 'checkout_required', updated_at: now })
          .eq('id', booking.booking_owner_user_id)
      }
    }
  }

  // 3. Release linked schedule blocks
  const { error: blockErr } = await admin
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', bookingId)

  if (blockErr) console.error('[cancelBookingByAdmin] block cancel error:', blockErr)

  // 3. Insert status history
  await admin.from('booking_status_history').insert({
    booking_id: bookingId,
    old_status: oldStatus,
    new_status: 'cancelled',
    changed_by_user_id: adminId,
    note: `Flight cancelled by admin. Reason: ${trimmedReason}`,
  })

  // 4. Audit event
  await admin.from('booking_audit_events').insert({
    booking_id: bookingId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'booking_cancelled',
    event_summary: `Admin cancelled booking: ${trimmedReason}`,
    new_value: { status: 'cancelled', category: 'admin', reason: trimmedReason, old_status: oldStatus },
  })

  // 5. Post message to customer & admin chat (verification_events)
  const chatMessageBody = `Your flight booking (${booking.booking_reference ?? bookingId.slice(0, 8).toUpperCase()}) has been cancelled by operations. Reason: ${trimmedReason}`

  const { error: chatErr } = await admin.from('verification_events').insert({
    user_id:       booking.booking_owner_user_id,
    actor_user_id: adminId,
    actor_role:    'admin',
    event_type:    'message',
    from_status:   null,
    to_status:     null,
    title:         'Flight Booking Cancelled',
    body:          chatMessageBody,
    email_status:  'sent',
    admin_read_at: now,
  })

  if (chatErr) {
    console.error('[cancelBookingByAdmin] chat insert error:', chatErr)
  }

  // 6. Notify customer and admin by email
  const [{ data: notifyData }, { data: aircraft }] = await Promise.all([
    admin
      .from('bookings')
      .select('booking_reference, profiles:booking_owner_user_id ( full_name, email, phone_number, phone_country_code )')
      .eq('id', bookingId)
      .single(),
    admin
      .from('aircraft')
      .select('registration')
      .eq('id', booking.aircraft_id)
      .single(),
  ])

  if (notifyData) {
    const prof = Array.isArray(notifyData.profiles) ? notifyData.profiles[0] : notifyData.profiles
    const email = (prof as { email?: string | null } | null)?.email
    if (email) {
      const scheduledTimeStr = booking.scheduled_start
        ? new Date(booking.scheduled_start).toLocaleString('en-AU', {
            timeZone: 'Australia/Sydney',
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : null
      const customerPhone = (prof as { phone_number?: string | null; phone_country_code?: string | null } | null)?.phone_number
        ? `${(prof as { phone_country_code?: string | null }).phone_country_code || ''} ${(prof as { phone_number?: string | null }).phone_number}`.trim()
        : null

      void notifyBookingCancelled({
        customerEmail: email,
        customerName: (prof as { full_name?: string | null } | null)?.full_name ?? 'Pilot',
        customerPhone,
        ref: notifyData.booking_reference ?? bookingId.slice(0, 8).toUpperCase(),
        aircraft: aircraft?.registration ?? 'Aircraft',
        scheduledTime: scheduledTimeStr,
        cancelledBy: 'Admin',
        reason: trimmedReason,
        bookingId,
      }).catch((error) => console.error('[cancelBookingByAdmin] notification error:', error))
    }
  }

  // 7. Revalidate paths
  revalidatePath('/admin')
  revalidatePath('/admin/bookings')
  revalidatePath('/admin/bookings/flights')
  revalidatePath('/admin/bookings/requests')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/admin/bookings/cancellations')
  revalidatePath('/admin/calendar')
  revalidatePath('/admin/messages')
  revalidatePath(`/admin/users/${booking.booking_owner_user_id}`)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bookings')
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard/messages')

  // 8. Realtime emissions
  void emitBookingChanged({ bookingId, userId: booking.booking_owner_user_id })
  void emitChatMessage(booking.booking_owner_user_id)
  void emitOpsChanged()
  if (isCheckout && booking.booking_owner_user_id) {
    void emitClearanceUpdated(booking.booking_owner_user_id)
  }
}

async function cancelOnHoldBookingCore(bookingId: string, reason: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()
  const trimmedReason = reason.trim()

  if (!trimmedReason) {
    throw new Error('VALIDATION: A cancellation reason is required.')
  }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, aircraft_id, booking_owner_user_id, booking_reference')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')
  if (booking.status !== 'on_hold_pending_documents') {
    throw new Error(`VALIDATION: Cannot cancel booking with status '${booking.status}'.`)
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      admin_notes: trimmedReason,
      cancellation_category: 'admin',
      pre_hold_status: null,
      updated_at: now,
    })
    .eq('id', bookingId)

  if (updateErr) throw new Error('Failed to cancel booking.')

  const { error: blockErr } = await supabase
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', bookingId)

  if (blockErr) console.error('[cancelOnHoldBooking] block cancel error:', blockErr)

  await supabase.from('booking_status_history').insert({
    booking_id: bookingId,
    old_status: 'on_hold_pending_documents',
    new_status: 'cancelled',
    changed_by_user_id: adminId,
    note: `Admin cancelled booking while on hold. Reason: ${trimmedReason}`,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id: bookingId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'booking_cancelled',
    event_summary: `Admin cancelled booking while on hold. Reason: ${trimmedReason}`,
    new_value: { status: 'cancelled', reason: trimmedReason, pre_hold_status: 'on_hold_pending_documents' },
  })

  const { data: notifyData } = await supabase
    .from('bookings')
    .select('booking_reference, profiles:booking_owner_user_id ( full_name, email )')
    .eq('id', bookingId)
    .single()

  if (notifyData) {
    const prof = Array.isArray(notifyData.profiles) ? notifyData.profiles[0] : notifyData.profiles
    const email = (prof as { email?: string | null } | null)?.email
    if (email) {
      await notifyBookingCancelled({
        customerEmail: email,
        customerName: (prof as { full_name?: string | null } | null)?.full_name ?? 'Pilot',
        ref: notifyData.booking_reference ?? bookingId.slice(0, 8).toUpperCase(),
        reason: trimmedReason,
        bookingId,
      }).catch((error) => console.error('[cancelOnHoldBooking] notification error:', error))
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/bookings')
  revalidatePath('/admin/bookings/on-hold')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/dashboard')
}

/** Form-action variant (legacy). Prefer cancelOnHoldBookingAction for client navigation. */
export async function cancelOnHoldBooking(bookingId: string, formData: FormData): Promise<void> {
  const reason = String(formData.get('reason') ?? '').trim()
  await cancelOnHoldBookingCore(bookingId, reason)
  redirect('/admin/bookings')
}

/** Client-callable cancel that does not force a server redirect. */
export async function cancelOnHoldBookingAction(bookingId: string, reason: string): Promise<void> {
  await cancelOnHoldBookingCore(bookingId, reason)
}

/**
 * Permanently closes an open flight or checkout booking (e.g. test booking,
 * flight that never took place, abandoned booking, or no-show).
 * Transitions status to 'cancelled', releases held schedule blocks,
 * cancels any draft/pending flight records, and removes from active action feeds.
 */
export async function permanentlyCloseBookingByAdmin(input: {
  bookingId: string
  reason?: string
}): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()
  const bookingId = input.bookingId
  const customReason = input.reason?.trim() || null
  const reasonText = customReason || 'Closed permanently by admin'

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, booking_type, scheduled_start, scheduled_end, aircraft_id, booking_owner_user_id, booking_reference')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) throw new Error('Booking not found.')

  if (booking.status === 'cancelled') {
    throw new Error('VALIDATION: This booking is already cancelled.')
  }

  const oldStatus = booking.status
  const isCheckout = booking.booking_type === 'checkout'
  const admin = createAdminClient()

  // 1. Update booking
  const updatePayload: Record<string, unknown> = {
    status: 'cancelled',
    admin_notes: customReason || 'Closed by admin',
    cancellation_category: 'admin',
    updated_at: now,
  }
  if (isCheckout) {
    updatePayload.checkout_lifecycle_status = 'cancelled_by_admin'
  }

  const { error: updateErr } = await admin
    .from('bookings')
    .update(updatePayload)
    .eq('id', bookingId)

  if (updateErr) {
    console.error('[permanentlyCloseBookingByAdmin] booking update error:', updateErr)
    throw new Error('Failed to permanently close booking.')
  }

  // 2. Release linked schedule blocks
  const { error: blockErr } = await admin
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', bookingId)

  if (blockErr) {
    console.error('[permanentlyCloseBookingByAdmin] block cancel error:', blockErr)
  }

  // 3. Reject/cancel any active or unfinalised flight record so it doesn't hang around
  const { error: frErr } = await admin
    .from('flight_records')
    .update({ status: 'rejected' })
    .eq('booking_id', bookingId)
    .in('status', ['draft', 'pending_review', 'resubmitted', 'needs_clarification'])

  if (frErr) {
    console.error('[permanentlyCloseBookingByAdmin] flight record update error:', frErr)
  }

  // 3b. Void any draft or unpaid invoices for this booking so they don't linger
  await admin
    .from('booking_invoices')
    .update({ status: 'void', updated_at: now })
    .eq('booking_id', bookingId)
    .in('status', ['payment_required', 'bank_transfer_pending_review'])

  await admin
    .from('checkout_invoices')
    .update({ status: 'void', updated_at: now })
    .eq('booking_id', bookingId)
    .in('status', ['open', 'pending'])

  // 4. If checkout: reset clearance status to checkout_required if needed so customer isn't stuck
  if (isCheckout && booking.booking_owner_user_id) {
    const { data: currentProfile } = await admin
      .from('profiles')
      .select('pilot_clearance_status')
      .eq('id', booking.booking_owner_user_id)
      .single()

    if (currentProfile && currentProfile.pilot_clearance_status !== 'cleared_to_fly') {
      const { data: otherCheckouts } = await admin
        .from('bookings')
        .select('id')
        .eq('booking_owner_user_id', booking.booking_owner_user_id)
        .eq('booking_type', 'checkout')
        .in('status', [
          'checkout_requested',
          'checkout_confirmed',
          'checkout_completed_under_review',
          'checkout_payment_required',
          'on_hold_pending_documents',
        ])
        .neq('id', bookingId)

      if (!otherCheckouts || otherCheckouts.length === 0) {
        await admin
          .from('profiles')
          .update({ pilot_clearance_status: 'checkout_required', updated_at: now })
          .eq('id', booking.booking_owner_user_id)
      }
    }
  }

  // 5. Insert status history
  await admin.from('booking_status_history').insert({
    booking_id: bookingId,
    old_status: oldStatus,
    new_status: 'cancelled',
    changed_by_user_id: adminId,
    note: `Permanently closed by admin. Reason: ${reasonText}`,
  })

  // 6. Audit event
  await admin.from('booking_audit_events').insert({
    booking_id: bookingId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'booking_cancelled',
    event_summary: `Admin permanently closed ${isCheckout ? 'checkout' : 'flight'}: ${reasonText}`,
    new_value: {
      status: 'cancelled',
      category: 'admin',
      reason: reasonText,
      old_status: oldStatus,
      permanently_closed: true,
      booking_type: booking.booking_type,
    },
  })

  // 7. Revalidate paths
  revalidatePath('/admin')
  revalidatePath('/admin/bookings')
  revalidatePath('/admin/bookings/flights')
  revalidatePath('/admin/bookings/requests')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/admin/bookings/cancellations')
  revalidatePath('/admin/calendar')
  revalidatePath(`/admin/users/${booking.booking_owner_user_id}`)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bookings')
  revalidatePath(`/dashboard/bookings/${bookingId}`)

  // 8. Realtime emissions
  void emitBookingChanged({ bookingId, userId: booking.booking_owner_user_id })
  void emitOpsChanged()
  if (isCheckout && booking.booking_owner_user_id) {
    void emitClearanceUpdated(booking.booking_owner_user_id)
  }
}
