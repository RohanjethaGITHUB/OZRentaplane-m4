import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { SectionTitle } from '@/app/admin/components/AdminUi'
import CheckoutOverviewCharts from './CheckoutOverviewCharts'

export const metadata = { title: 'Checkout Overview | Admin' }

export default async function CheckoutOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [
    { data: bookings },
    { data: invoices },
    { data: checkoutOutcomeEvents },
    { count: manualPendingCount },
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

  return (
    <>
      <AdminPortalHero
        eyebrow="Checkouts"
        title="Checkout Overview"
        subtitle="Checkout request, status, outcome, and payment analytics."
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-6">
        <section>
          <SectionTitle title="Visual Overview" subtitle="Checkout requests, status mix, outcomes, and payments." />
          <CheckoutOverviewCharts
            bookings={bookings ?? []}
            invoices={invoices ?? []}
            outcomeEvents={checkoutOutcomeEvents ?? []}
            manualPendingCount={manualPendingCount ?? 0}
          />
        </section>
      </div>
    </>
  )
}
