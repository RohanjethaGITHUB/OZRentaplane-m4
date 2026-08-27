'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyBookingCancelled } from '@/lib/booking/notifications'
import { emitBookingChanged, emitChatMessage, emitOpsChanged } from '@/lib/realtime/emit'

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
  if (['cancelled', 'completed'].includes(booking.status)) {
    throw new Error(`VALIDATION: Cannot cancel a booking that is already ${booking.status}.`)
  }

  const oldStatus = booking.status
  const admin = createAdminClient()

  // 1. Update booking
  const { error: updateErr } = await admin
    .from('bookings')
    .update({
      status: 'cancelled',
      admin_notes: trimmedReason,
      cancellation_category: 'admin',
      updated_at: now,
    })
    .eq('id', bookingId)

  if (updateErr) throw new Error('Failed to cancel booking.')

  // 2. Release linked schedule blocks
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
