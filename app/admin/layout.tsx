import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSidebar from './AdminSidebar'

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
    { count: awaitingFlightRecord },
    { count: postFlightReview },
    { count: bookingPaymentPending },
    { count: checkoutManualReview },
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
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'awaiting_flight_record'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'pending_post_flight_review'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'payment_pending'),
    supabase.from('checkout_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('booking_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('booking_cancellation_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const checkoutNewQueue = (checkoutNewRequests ?? 0)
  const checkoutAwaitingOutcomeQueue = (checkoutAwaitingOutcome ?? 0)
  const checkoutPaymentsQueue = (checkoutPaymentRequired ?? 0) + (checkoutManualReview ?? 0)
  const checkoutActions = checkoutNewQueue + checkoutAwaitingOutcomeQueue + checkoutPaymentsQueue

  const bookingAwaitingFlightQueue = awaitingFlightRecord ?? 0
  const bookingPostFlightQueue = postFlightReview ?? 0
  const bookingPaymentsQueue = (bookingPaymentPending ?? 0) + (bookingManualReview ?? 0)
  const bookingCancellationsQueue = cancellationPending ?? 0
  const bookingActions = bookingAwaitingFlightQueue + bookingPostFlightQueue + bookingPaymentsQueue + bookingCancellationsQueue
  const messagesActions = unreadMessageCount ?? 0
  const totalActions = checkoutActions + bookingActions + messagesActions

  return (
    <div className="admin-theme min-h-screen flex flex-col bg-[var(--admin-bg)] text-[var(--admin-text)] font-sans relative">

      {/* Grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[9999] opacity-[0.025] mix-blend-overlay"
        style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }}
      />

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
            bookings: bookingActions,
            awaitingFlightRecord: bookingAwaitingFlightQueue,
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
