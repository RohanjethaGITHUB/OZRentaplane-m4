import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSidebar from './AdminSidebar'
import { countAwaitingFlightRecords } from '@/lib/booking/flight-record-status'

// Server-side guard: only admins can access any /admin route.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const adminName = profile.full_name ?? user.email?.split('@')[0] ?? 'Administrator'

  const [
    { count: unreadMessageCount },
    { count: checkoutNewRequests },
    { count: checkoutAwaitingOutcome },
    { count: checkoutPaymentRequired },
    { data: awaitingFlightRecordRows },
    { count: bookingOnHold },
    { count: postFlightReview },
    { count: bookingPaymentPending },
    { count: checkoutManualReview },
    { count: checkoutReschedulePending },
    { data: checkoutCancelRequestRows },
    { data: checkoutLifecycleCancelledRows },
    { count: bookingManualReview },
    { count: cancellationPending },
  ] = await Promise.all([
    supabase
      .from('verification_events')
      .select('*', { count: 'exact', head: true })
      .eq('actor_role', 'customer')
      .is('admin_read_at', null)
      .in('event_type', ['message', 'on_hold'])
      .not('body', 'is', null),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_requested'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_completed_under_review'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_payment_required'),
    supabase
      .from('bookings')
      .select('id, status, scheduled_end, flight_records(status, submitted_at)')
      .eq('booking_type', 'standard')
      .in('status', ['confirmed', 'ready_for_dispatch', 'dispatched', 'awaiting_flight_record', 'flight_record_overdue'])
      .lte('scheduled_end', new Date().toISOString()),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'on_hold_pending_documents'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'pending_post_flight_review'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'payment_pending'),
    supabase.from('checkout_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('checkout_change_requests').select('*', { count: 'exact', head: true }).eq('request_type', 'reschedule').eq('status', 'pending'),
    supabase.from('checkout_change_requests').select('checkout_request_id').eq('request_type', 'cancel'),
    supabase.from('bookings').select('id').eq('booking_type', 'checkout').in('checkout_lifecycle_status', ['cancelled_by_customer', 'cancelled_by_admin']),
    supabase.from('booking_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('booking_cancellation_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const checkoutNewQueue = (checkoutNewRequests ?? 0)
  const checkoutAwaitingOutcomeQueue = (checkoutAwaitingOutcome ?? 0)
  const checkoutPaymentsQueue = (checkoutPaymentRequired ?? 0) + (checkoutManualReview ?? 0)
  const checkoutRescheduleQueue = checkoutReschedulePending ?? 0
  const cancelledCheckoutIds = new Set<string>([
    ...(checkoutCancelRequestRows ?? []).map((r) => r.checkout_request_id),
    ...(checkoutLifecycleCancelledRows ?? []).map((r) => r.id),
  ])
  const checkoutCancelledQueue = cancelledCheckoutIds.size
  const checkoutActions = checkoutNewQueue + checkoutAwaitingOutcomeQueue + checkoutPaymentsQueue + checkoutRescheduleQueue + checkoutCancelledQueue

  const bookingAwaitingFlightQueue = countAwaitingFlightRecords(awaitingFlightRecordRows)
  const bookingOnHoldQueue = bookingOnHold ?? 0
  const bookingPostFlightQueue = postFlightReview ?? 0
  const bookingPaymentsQueue = (bookingPaymentPending ?? 0) + (bookingManualReview ?? 0)
  const bookingCancellationsQueue = cancellationPending ?? 0
  const bookingActions = bookingAwaitingFlightQueue + bookingOnHoldQueue + bookingPostFlightQueue + bookingPaymentsQueue + bookingCancellationsQueue
  const messagesActions = unreadMessageCount ?? 0
  const totalActions = checkoutActions + bookingActions + messagesActions

  return (
    <div className="admin-theme min-h-screen flex flex-col bg-open-ceiling text-[var(--admin-text)] font-sans relative">

      {/* Ambient glow */}
      <div className="fixed top-0 left-0 w-[500px] h-[400px] bg-[#7ba4cf]/[0.02] blur-[130px] rounded-full pointer-events-none -z-10" />

      {/* Admin Layout with Sidebar */}
      <div className="flex flex-1 overflow-hidden relative">
        <AdminSidebar
          displayName={adminName}
          unreadMessageCount={unreadMessageCount ?? 0}
          actionCounts={{
            actions: totalActions,
            checkouts: checkoutActions,
            checkoutNewRequests: checkoutNewQueue,
            checkoutAwaitingOutcome: checkoutAwaitingOutcomeQueue,
            checkoutPayments: checkoutPaymentsQueue,
            checkoutReschedule: checkoutRescheduleQueue,
            checkoutCancelled: checkoutCancelledQueue,
            bookings: bookingActions,
            awaitingFlightRecord: bookingAwaitingFlightQueue,
            bookingOnHold: bookingOnHoldQueue,
            postFlightReview: bookingPostFlightQueue,
            bookingPayments: bookingPaymentsQueue,
            bookingCancellations: bookingCancellationsQueue,
          }}
        />
        
        {/* Page content */}
        <main className="flex-1 overflow-y-auto lg:ml-72 bg-[var(--admin-content-bg)] relative">
          <div className="min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
