import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { SectionTitle, StatCard } from './components/AdminUi'

export const metadata = { title: 'Actions | OZRentAPlane' }
export const dynamic = 'force-dynamic'

export default async function AdminActionsPage() {
  noStore()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const nowIso = new Date().toISOString()

  const [
    { count: newCheckoutRequests },
    { count: upcomingCheckouts },
    { count: awaitingCheckoutOutcome },
    { count: checkoutPaymentsRequired },
    { count: manualCheckoutPaymentsReview },
    { count: checkoutIssues },
    { count: upcomingFlights },
    { count: awaitingFlightRecords },
    { count: postFlightReviewRequired },
    { count: bookingPaymentsRequired },
    { count: manualBookingPaymentsReview },
    { count: cancellationRequests },
  ] = await Promise.all([
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_requested'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_confirmed').gte('scheduled_start', nowIso),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_completed_under_review'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_payment_required'),
    supabase.from('checkout_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').in('pilot_clearance_status', ['additional_checkout_required', 'checkout_reschedule_required', 'not_currently_eligible']),

    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').in('status', ['confirmed', 'ready_for_dispatch']).gte('scheduled_start', nowIso),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'awaiting_flight_record'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'pending_post_flight_review'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'payment_pending'),
    supabase.from('booking_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('booking_cancellation_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const checkoutCards = [
    {
      title: 'New checkout requests', value: newCheckoutRequests ?? 0,
      helper: 'Review and confirm new checkout requests.', href: '/admin/checkouts/all?status=new_requests',
      warn: (newCheckoutRequests ?? 0) > 0,
    },
    {
      title: 'Upcoming checkouts', value: upcomingCheckouts ?? 0,
      helper: 'Operationally prepare and confirm upcoming checkout flights.', href: '/admin/checkouts/all?status=upcoming',
      warn: false,
    },
    {
      title: 'Awaiting checkout outcome', value: awaitingCheckoutOutcome ?? 0,
      helper: 'Record checkout outcomes and apply next clearance step.', href: '/admin/checkouts/all?status=awaiting_outcome',
      warn: (awaitingCheckoutOutcome ?? 0) > 0,
    },
    {
      title: 'Checkout payments required', value: checkoutPaymentsRequired ?? 0,
      helper: 'Follow up checkout bookings waiting for payment.', href: '/admin/checkouts/payments?tab=payment_required',
      warn: (checkoutPaymentsRequired ?? 0) > 0,
    },
    {
      title: 'Manual checkout payments to review', value: manualCheckoutPaymentsReview ?? 0,
      helper: 'Approve or reject submitted checkout bank transfers.', href: '/admin/checkouts/payments?tab=manual_review',
      warn: (manualCheckoutPaymentsReview ?? 0) > 0,
    },
    {
      title: 'Checkout issues / needs attention', value: checkoutIssues ?? 0,
      helper: 'Customers requiring additional checkout follow-up.', href: '/admin/customers',
      warn: (checkoutIssues ?? 0) > 0,
    },
  ]

  const bookingCards = [
    {
      title: 'Upcoming flights', value: upcomingFlights ?? 0,
      helper: 'Upcoming standard flights requiring dispatch readiness.', href: '/admin/bookings/upcoming-flights',
      warn: false,
    },
    {
      title: 'Awaiting flight records', value: awaitingFlightRecords ?? 0,
      helper: 'Bookings waiting for customer flight record submission.', href: '/admin/bookings/awaiting-flight-records',
      warn: (awaitingFlightRecords ?? 0) > 0,
    },
    {
      title: 'Post-flight review required', value: postFlightReviewRequired ?? 0,
      helper: 'Bookings ready for admin post-flight review decisions.', href: '/admin/bookings/post-flight-review',
      warn: (postFlightReviewRequired ?? 0) > 0,
    },
    {
      title: 'Booking payments required', value: bookingPaymentsRequired ?? 0,
      helper: 'Standard booking invoices waiting on customer payment.', href: '/admin/bookings/payments',
      warn: (bookingPaymentsRequired ?? 0) > 0,
    },
    {
      title: 'Manual booking payments to review', value: manualBookingPaymentsReview ?? 0,
      helper: 'Review standard booking bank transfer submissions.', href: '/admin/bookings/payments',
      warn: (manualBookingPaymentsReview ?? 0) > 0,
    },
    {
      title: 'Cancellation requests', value: cancellationRequests ?? 0,
      helper: 'Review and resolve pending cancellation requests.', href: '/admin/bookings/payments-cancellations?tab=cancellation-requests',
      warn: (cancellationRequests ?? 0) > 0,
    },
  ]

  return (
    <>
      <AdminPortalHero
        eyebrow="Operations"
        title="Actions"
        subtitle="Items requiring admin attention across checkouts and bookings."
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-10">
        <section className="grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr] gap-6 items-start">
          <div>
            <SectionTitle title="Checkout Actions" subtitle="Immediate checkout workflow actions." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {checkoutCards.map((card) => (
                <StatCard key={card.title} title={card.title} value={card.value} helper={card.helper} href={card.href} warn={card.warn} />
              ))}
            </div>
          </div>

          <div className="hidden xl:block w-[3px] self-stretch rounded-full bg-gradient-to-b from-sky-300/10 via-sky-300/55 to-sky-300/10 mx-1" />
          <div className="xl:hidden h-[3px] w-full rounded-full bg-gradient-to-r from-sky-300/10 via-sky-300/55 to-sky-300/10 my-3" />

          <div>
            <SectionTitle title="Booking Actions" subtitle="Immediate standard booking workflow actions." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bookingCards.map((card) => (
                <StatCard key={card.title} title={card.title} value={card.value} helper={card.helper} href={card.href} warn={card.warn} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
