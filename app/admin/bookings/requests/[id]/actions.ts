'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifyBookingCancelled } from '@/lib/booking/notifications'

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

export async function cancelOnHoldBooking(bookingId: string, formData: FormData): Promise<void> {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()
  const reason = String(formData.get('reason') ?? '').trim()

  if (!reason) {
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
      admin_notes: reason,
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
    note: `Admin cancelled booking while on hold. Reason: ${reason}`,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id: bookingId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'booking_cancelled',
    event_summary: `Admin cancelled booking while on hold. Reason: ${reason}`,
    new_value: { status: 'cancelled', reason, pre_hold_status: 'on_hold_pending_documents' },
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
        reason,
        bookingId,
      }).catch((error) => console.error('[cancelOnHoldBooking] notification error:', error))
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/bookings')
  revalidatePath('/admin/bookings/on-hold')
  revalidatePath(`/admin/bookings/requests/${bookingId}`)
  revalidatePath('/dashboard')

  redirect('/admin/bookings/on-hold')
}
