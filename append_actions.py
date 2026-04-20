import os

content = """
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
"""

with open('app/actions/admin-booking.ts', 'a') as f:
    f.write(content)

print("Appended successfully.")
