import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { SectionTitle } from '@/app/admin/components/AdminUi'
import BookingOverviewCharts from './BookingOverviewCharts'
import CheckoutOverviewCharts from '../checkouts/CheckoutOverviewCharts'

export const metadata = { title: 'Bookings | Admin' }

export default async function AdminBookingsOverviewPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const activeTab = searchParams?.tab === 'checkout' ? 'checkout' : 'standard'

  let standardBookings: Parameters<typeof BookingOverviewCharts>[0]['bookings'] = []
  let cancellations: Parameters<typeof BookingOverviewCharts>[0]['cancellations'] = []
  let manualBookingPaymentReviewCount = 0
  let checkoutBookings: Parameters<typeof CheckoutOverviewCharts>[0]['bookings'] = []
  let invoices: Parameters<typeof CheckoutOverviewCharts>[0]['invoices'] = []
  let checkoutOutcomeEvents: Parameters<typeof CheckoutOverviewCharts>[0]['outcomeEvents'] = []
  let manualPendingCount = 0

  if (activeTab === 'checkout') {
    const [
      { data: checkoutBookingsData },
      { data: invoicesData },
      { data: checkoutOutcomeEventsData },
      { count: manualPendingCountData },
    ] = await Promise.all([
      supabase.from('bookings').select('id, status, scheduled_start, created_at, updated_at').eq('booking_type', 'checkout').order('created_at', { ascending: true }),
      supabase.from('checkout_payment_invoices').select('id, booking_id, status, checkout_outcome, stripe_amount_due_cents, total_paid_cents, created_at, updated_at, paid_at'),
      supabase
        .from('booking_audit_events')
        .select('id, booking_id, created_at, event_type, new_value')
        .eq('event_type', 'checkout_outcome_recorded')
        .order('created_at', { ascending: false }),
      supabase.from('checkout_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    ])

    checkoutBookings = checkoutBookingsData ?? []
    invoices = invoicesData ?? []
    checkoutOutcomeEvents = checkoutOutcomeEventsData ?? []
    manualPendingCount = manualPendingCountData ?? 0
  } else {
    const [
      { data: standardBookingsData },
      { data: cancellationsData },
      { count: manualBookingPaymentReviewCountData },
    ] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, status, scheduled_start, scheduled_end, created_at, updated_at, payment_status, flight_records(status, submitted_at)')
        .eq('booking_type', 'standard')
        .order('created_at', { ascending: true }),
      supabase.from('booking_cancellation_requests').select('id, created_at'),
      supabase.from('booking_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    ])

    standardBookings = standardBookingsData ?? []
    cancellations = cancellationsData ?? []
    manualBookingPaymentReviewCount = manualBookingPaymentReviewCountData ?? 0
  }

  return (
    <>
      <AdminPortalHero
        eyebrow="Bookings"
        title="Bookings"
        subtitle="Standard bookings and checkout operations in one place."
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-6">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/bookings"
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'standard'
                ? 'bg-[#152d5a] text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            Standard Bookings
          </Link>
          <Link
            href="/admin/bookings?tab=checkout"
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'checkout'
                ? 'bg-[#152d5a] text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            Checkouts
          </Link>
        </div>

        <section>
          <SectionTitle
            title="Visual Overview"
            subtitle={activeTab === 'checkout'
              ? 'Checkout requests, status mix, outcomes, and payments.'
              : 'Booking volume, status mix, payments, post-flight review, and cancellations.'}
          />
          {activeTab === 'checkout' ? (
            <CheckoutOverviewCharts
              bookings={checkoutBookings}
              invoices={invoices}
              outcomeEvents={checkoutOutcomeEvents}
              manualPendingCount={manualPendingCount}
            />
          ) : (
            <BookingOverviewCharts
              bookings={standardBookings}
              cancellations={cancellations}
              manualPaymentReviewCount={manualBookingPaymentReviewCount}
            />
          )}
        </section>
      </div>
    </>
  )
}
