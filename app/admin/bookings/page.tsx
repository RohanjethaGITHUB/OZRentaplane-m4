import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { ChartShell, SectionTitle, StatCard, TimeRangeControl, type TimeRangeValue } from '@/app/admin/components/AdminUi'
import { getRangeStartIso } from '@/lib/admin-time-range'

export const metadata = { title: 'Bookings Overview | Admin' }

function getRange(value?: string): TimeRangeValue {
  if (value === 'today' || value === '7d' || value === '30d' || value === '6m' || value === 'max') return value
  return '7d'
}

export default async function AdminBookingsOverviewPage({ searchParams }: { searchParams: { range?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const range = getRange(searchParams.range)
  const startIso = getRangeStartIso(range)

  let query = supabase.from('bookings').select('status, booking_type, scheduled_start').order('scheduled_start', { ascending: true })
  if (startIso) query = query.gte('scheduled_start', startIso)
  const { data: bookings } = await query

  const c: Record<string, number> = {}
  for (const b of bookings ?? []) c[b.status] = (c[b.status] ?? 0) + 1

  const pipeline = [
    { label: 'Requested', count: (c.checkout_requested ?? 0) + (c.pending_confirmation ?? 0) },
    { label: 'Confirmed', count: (c.checkout_confirmed ?? 0) + (c.confirmed ?? 0) + (c.ready_for_dispatch ?? 0) },
    { label: 'Active / Dispatched', count: c.dispatched ?? 0 },
    { label: 'Awaiting Flight Record', count: c.awaiting_flight_record ?? 0 },
    { label: 'Review Queue', count: (c.pending_post_flight_review ?? 0) + (c.checkout_completed_under_review ?? 0) },
    { label: 'Completed', count: c.completed ?? 0 },
  ]

  const total = pipeline.reduce((sum, item) => sum + item.count, 0)

  return (
    <>
      <AdminPortalHero
        eyebrow="Bookings"
        title="Bookings Overview"
        subtitle="Operational summary for checkout and standard bookings."
        actions={<TimeRangeControl active={range} basePath="/admin/bookings" />}
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-8">
        <section>
          <SectionTitle title="Booking Pipeline" subtitle="From request to completion." />
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="h-10 rounded-xl bg-slate-900 overflow-hidden flex">
              {pipeline.map((item, idx) => {
                const width = total > 0 ? `${Math.max(6, Math.round((item.count / total) * 100))}%` : `${Math.round(100 / pipeline.length)}%`
                return <div key={item.label + idx} className="h-full border-r border-black/20 bg-blue-500/40 flex items-center justify-center text-xs text-white" style={{ width }}>{item.count}</div>
              })}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
              {pipeline.map((item) => (
                <div key={item.label} className="rounded-lg border border-white/10 p-3 bg-white/[0.01]">
                  <p className="text-xs text-slate-400">{item.label}</p>
                  <p className="text-xl text-white">{item.count}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <SectionTitle title="Action Cards" subtitle="Quick entry points for booking operations." />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <StatCard title="Checkout requests" value={c.checkout_requested ?? 0} helper="Review new checkout requests" href="/admin/bookings/checkout?status=checkout_requested" warn={(c.checkout_requested ?? 0) > 0} />
            <StatCard title="Awaiting checkout outcome" value={c.checkout_completed_under_review ?? 0} helper="Record checkout outcomes" href="/admin/bookings/checkout?status=checkout_completed_under_review" warn={(c.checkout_completed_under_review ?? 0) > 0} />
            <StatCard title="Payment required" value={c.checkout_payment_required ?? 0} helper="Follow up unpaid checkout invoices" href="/admin/bookings/payments-cancellations?tab=payment-required" warn={(c.checkout_payment_required ?? 0) > 0} />
            <StatCard title="Post-flight records pending" value={c.awaiting_flight_record ?? 0} helper="Awaiting customer flight records" href="/admin/bookings/flights?status=awaiting_flight_record" warn={(c.awaiting_flight_record ?? 0) > 0} />
            <StatCard title="Cancellation requests" value={c.cancellation_requested ?? 0} helper="Resolve cancellation requests" href="/admin/bookings/payments-cancellations?tab=cancellation-requests" warn={(c.cancellation_requested ?? 0) > 0} />
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartShell title="Checkout vs Standard Bookings">
            <div className="text-sm text-slate-300 space-y-2">
              <p>Checkout flights: {(bookings ?? []).filter((b) => b.booking_type === 'checkout').length}</p>
              <p>Standard bookings: {(bookings ?? []).filter((b) => b.booking_type === 'standard').length}</p>
            </div>
          </ChartShell>
          <ChartShell title="Upcoming Confirmed Flights">
            <div className="text-sm text-slate-300 space-y-2">
              <p>Confirmed standard: {(c.confirmed ?? 0) + (c.ready_for_dispatch ?? 0)}</p>
              <p>Confirmed checkout: {c.checkout_confirmed ?? 0}</p>
            </div>
          </ChartShell>
        </section>
      </div>
    </>
  )
}
