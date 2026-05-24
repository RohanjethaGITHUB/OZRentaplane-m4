import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { SectionTitle } from '@/app/admin/components/AdminUi'
import BookingOverviewCharts from './BookingOverviewCharts'

export const metadata = { title: 'Booking Overview | Admin' }

export default async function AdminBookingsOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [
    { data: bookings },
    { data: cancellations },
    { count: manualBookingPaymentReviewCount },
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, status, scheduled_start, scheduled_end, created_at, updated_at, payment_status, flight_records(status, submitted_at)')
      .eq('booking_type', 'standard')
      .order('created_at', { ascending: true }),
    supabase.from('booking_cancellation_requests').select('id, created_at'),
    supabase.from('booking_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
  ])

  return (
    <>
      <AdminPortalHero
        eyebrow="Bookings"
        title="Booking Overview"
        subtitle="Standard booking analytics for operations, payments, and post-flight workflow."
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-6">
        <section>
          <SectionTitle title="Visual Overview" subtitle="Booking volume, status mix, payments, post-flight review, and cancellations." />
          <BookingOverviewCharts
            bookings={bookings ?? []}
            cancellations={cancellations ?? []}
            manualPaymentReviewCount={manualBookingPaymentReviewCount ?? 0}
          />
        </section>
      </div>
    </>
  )
}
