import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { ChartShell, SectionTitle, StatCard, StatusPill, TimeRangeControl, type TimeRangeValue } from './components/AdminUi'
import { getRangeStartIso } from '@/lib/admin-time-range'

export const metadata = { title: 'Admin Overview | OZRentAPlane' }

function getRange(value?: string): TimeRangeValue {
  if (value === 'today' || value === '7d' || value === '30d' || value === '6m' || value === 'max') return value
  return '7d'
}

export default async function AdminMasterOverview({ searchParams }: { searchParams: { range?: string } }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const range = getRange(searchParams.range)
  const startIso = getRangeStartIso(range)

  let bookingQuery = supabase
    .from('bookings')
    .select('id, booking_type, status, scheduled_start, scheduled_end, created_at, pic_name, aircraft ( registration )')
    .order('scheduled_start', { ascending: true })

  if (startIso) bookingQuery = bookingQuery.gte('scheduled_start', startIso)
  const { data: bookings } = await bookingQuery

  const [
    { count: manualPaymentPending },
    { count: blockedCustomers },
    { data: aircraft },
    { count: openSquawks },
  ] = await Promise.all([
    supabase.from('checkout_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('account_status', 'blocked'),
    supabase.from('aircraft').select('id, registration, status').eq('registration', 'VH-KZG').single(),
    supabase.from('squawks').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
  ])

  const statusCount: Record<string, number> = {}
  const typeCount = { checkout: 0, standard: 0 }
  for (const booking of bookings ?? []) {
    statusCount[booking.status] = (statusCount[booking.status] ?? 0) + 1
    if (booking.booking_type === 'checkout') typeCount.checkout += 1
    if (booking.booking_type === 'standard') typeCount.standard += 1
  }

  const actionCards = [
    {
      title: 'New checkout requests',
      value: statusCount.checkout_requested ?? 0,
      helper: 'Review and confirm requested checkout flights.',
      href: '/admin/bookings/checkout?status=checkout_requested',
    },
    {
      title: 'Checkout outcomes needed',
      value: statusCount.checkout_completed_under_review ?? 0,
      helper: 'Mark flight outcome and apply next clearance step.',
      href: '/admin/bookings/checkout?status=checkout_completed_under_review',
    },
    {
      title: 'Manual payments to review',
      value: manualPaymentPending ?? 0,
      helper: 'Approve or reject pending transfer evidence.',
      href: '/admin/bookings/payments-cancellations?tab=manual-payments',
    },
    {
      title: 'Post-flight records pending',
      value: (statusCount.awaiting_flight_record ?? 0) + (statusCount.pending_post_flight_review ?? 0),
      helper: 'Bookings waiting for records or review actions.',
      href: '/admin/bookings/flights?status=awaiting_flight_record',
    },
    {
      title: 'Cancellation requests',
      value: statusCount.cancellation_requested ?? 0,
      helper: 'Resolve customer cancellation requests.',
      href: '/admin/bookings/payments-cancellations?tab=cancellation-requests',
    },
  ]

  const now = new Date()
  const upcoming = (bookings ?? []).filter((b) => new Date(b.scheduled_start) >= now).slice(0, 10)
  const nextBooking = upcoming[0]

  return (
    <>
      <AdminPortalHero
        eyebrow="Operations"
        title="Operations Overview"
        subtitle="Today's bookings, checkout actions, payments, and aircraft status."
        actions={<TimeRangeControl active={range} basePath="/admin" />}
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-10">
        <section>
          <SectionTitle title="Action Required" subtitle="Priority tasks that need admin attention now." />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {actionCards.map((card) => (
              <StatCard
                key={card.title}
                title={card.title}
                value={card.value}
                helper={card.helper}
                href={card.href}
                warn={card.value > 0}
              />
            ))}
          </div>
        </section>

        <section>
          <SectionTitle title="Visual Overview" subtitle="Booking activity, status mix, customer clearance, and payments." />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartShell title="Bookings By Type">
              <div className="space-y-3">
                {[{ label: 'Checkout flights', val: typeCount.checkout, tone: 'blue' as const }, { label: 'Standard bookings', val: typeCount.standard, tone: 'green' as const }].map((item) => {
                  const total = Math.max(1, typeCount.checkout + typeCount.standard)
                  const pct = Math.round((item.val / total) * 100)
                  return (
                    <div key={item.label}>
                      <div className="flex items-center justify-between text-sm mb-1"><span>{item.label}</span><span className="text-slate-400">{item.val}</span></div>
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className={`h-full ${item.tone === 'blue' ? 'bg-blue-400' : 'bg-green-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </ChartShell>
            <ChartShell title="Booking Status Breakdown">
              <div className="flex flex-wrap gap-2">
                {Object.entries(statusCount).slice(0, 8).map(([status, count]) => (
                  <div key={status} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                    <p className="text-xs text-slate-400">{status.replace(/_/g, ' ')}</p>
                    <p className="text-lg text-white">{count}</p>
                  </div>
                ))}
                {Object.keys(statusCount).length === 0 && <p className="text-slate-500 text-sm">No booking data in this range.</p>}
              </div>
            </ChartShell>
            <ChartShell title="Customer Clearance Pipeline">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm"><span>Cleared to fly</span><StatusPill tone="green" label="Operational" /></div>
                <div className="flex items-center justify-between text-sm"><span>In checkout flow</span><StatusPill tone="blue" label="In progress" /></div>
                <div className="flex items-center justify-between text-sm"><span>Needs attention</span><StatusPill tone="amber" label="Review needed" /></div>
                <div className="flex items-center justify-between text-sm"><span>Blocked customers</span><span className="text-rose-300">{blockedCustomers ?? 0}</span></div>
              </div>
            </ChartShell>
            <ChartShell title="Payments Overview">
              <div className="grid grid-cols-2 gap-3">
                <Link href="/admin/bookings/payments-cancellations?tab=manual-payments" className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-xs text-slate-400">Manual review</p>
                  <p className="text-2xl text-amber-300">{manualPaymentPending ?? 0}</p>
                </Link>
                <Link href="/admin/bookings/payments-cancellations?tab=payment-required" className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-xs text-slate-400">Payment required</p>
                  <p className="text-2xl text-orange-300">{statusCount.checkout_payment_required ?? 0}</p>
                </Link>
              </div>
            </ChartShell>
          </div>
        </section>

        <section>
          <SectionTitle title="Today / Upcoming" subtitle="Checkout flights, bookings, and aircraft blocks coming up." />
          <div className="space-y-3">
            {upcoming.length === 0 && <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-slate-400">No upcoming events in this range.</div>}
            {upcoming.map((event) => {
              const aircraftRow = Array.isArray(event.aircraft) ? event.aircraft[0] : event.aircraft
              const tone = event.booking_type === 'checkout' ? 'blue' : 'green'
              return (
                <Link key={event.id} href="/admin/bookings/flights" className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between gap-3 hover:bg-white/[0.05] transition-colors">
                  <div>
                    <p className="text-base text-white">{event.pic_name || 'Customer'} · {aircraftRow?.registration || 'VH-KZG'}</p>
                    <p className="text-sm text-slate-400">{new Date(event.scheduled_start).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={tone} label={event.booking_type === 'checkout' ? 'Checkout' : 'Booking'} />
                    {(event.status === 'checkout_payment_required' || event.status === 'awaiting_flight_record') && <StatusPill tone="amber" label={event.status === 'checkout_payment_required' ? 'Payment Required' : 'Awaiting Flight Record'} />}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section>
          <SectionTitle title="Aircraft Status" subtitle="VH-KZG operational summary and next activity." />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <p className="text-sm text-slate-400">Aircraft</p>
              <p className="text-2xl text-white mt-1">{aircraft?.registration || 'VH-KZG'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <p className="text-sm text-slate-400">Availability</p>
              <p className="text-2xl mt-1 capitalize text-green-300">{aircraft?.status || 'unknown'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <p className="text-sm text-slate-400">Next booking</p>
              <p className="text-base text-white mt-2">{nextBooking ? new Date(nextBooking.scheduled_start).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'No upcoming booking'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <p className="text-sm text-slate-400">Open squawks/issues</p>
              <p className="text-2xl text-rose-300 mt-1">{openSquawks ?? 0}</p>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
