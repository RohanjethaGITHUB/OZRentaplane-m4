import { createAdminClient } from '@/lib/supabase/admin'

export async function hasManualCheckoutClearance(customerId: string): Promise<boolean> {
  if (!customerId) return false

  const admin = createAdminClient()
  const { data: checkoutBookings } = await admin
    .from('bookings')
    .select('id')
    .eq('booking_owner_user_id', customerId)
    .eq('booking_type', 'checkout')
    .order('created_at', { ascending: false })
    .limit(25)

  const checkoutBookingIds = (checkoutBookings ?? []).map((b) => b.id).filter(Boolean)
  if (!checkoutBookingIds.length) return false

  const { data: manualAudit } = await admin
    .from('booking_audit_events')
    .select('id')
    .eq('event_type', 'checkout_manual_completion_submitted')
    .in('booking_id', checkoutBookingIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return Boolean(manualAudit?.id)
}
