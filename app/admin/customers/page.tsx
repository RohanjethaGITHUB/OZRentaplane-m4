import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { ChartShell, SectionTitle, TimeRangeControl, type TimeRangeValue } from '@/app/admin/components/AdminUi'

export const metadata = { title: 'Customer Overview | Admin' }

function getRange(value?: string): TimeRangeValue {
  if (value === 'today' || value === '7d' || value === '30d' || value === '6m' || value === 'max') return value
  return '30d'
}

export default async function AdminCustomersOverview({ searchParams }: { searchParams: { range?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const range = getRange(searchParams.range)

  const [
    { count: totalCustomers },
    { count: clearedCount },
    { count: inCheckoutCount },
    { count: needsActionCount },
    { count: blockedCount },
    { data: recentCustomers },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('pilot_clearance_status', 'cleared_to_fly'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').in('pilot_clearance_status', ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required']),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').in('pilot_clearance_status', ['additional_checkout_required', 'checkout_reschedule_required', 'not_currently_eligible']),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('account_status', 'blocked'),
    supabase.from('profiles').select('id, full_name, created_at, pilot_clearance_status').eq('role', 'customer').order('created_at', { ascending: false }).limit(8),
  ])

  return (
    <>
      <AdminPortalHero
        eyebrow="Customers"
        title="Customer Overview"
        subtitle="Clearance status, documents, and customer actions."
        actions={<TimeRangeControl active={range} basePath="/admin/customers" />}
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-8">
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"><p className="text-sm text-slate-400">Total customers</p><p className="text-3xl text-white">{totalCustomers ?? 0}</p></div>
            <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-5"><p className="text-sm text-green-200">Cleared to fly</p><p className="text-3xl text-green-300">{clearedCount ?? 0}</p></div>
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-5"><p className="text-sm text-blue-200">In checkout</p><p className="text-3xl text-blue-300">{inCheckoutCount ?? 0}</p></div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5"><p className="text-sm text-amber-200">Needs attention</p><p className="text-3xl text-amber-300">{needsActionCount ?? 0}</p></div>
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5"><p className="text-sm text-rose-200">Blocked customers</p><p className="text-3xl text-rose-300">{blockedCount ?? 0}</p></div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartShell title="Pilot Clearance Pipeline">
            <div className="space-y-2 text-sm text-slate-300">
              <p>Cleared to fly: {clearedCount ?? 0}</p>
              <p>In checkout: {inCheckoutCount ?? 0}</p>
              <p>Needs attention: {needsActionCount ?? 0}</p>
              <p>Blocked: {blockedCount ?? 0}</p>
            </div>
          </ChartShell>
          <ChartShell title="Recent Customer Signups">
            <div className="space-y-2">
              {(recentCustomers ?? []).map((c) => (
                <Link key={c.id} href={`/admin/users/${c.id}`} className="block rounded-lg border border-white/10 bg-white/[0.02] p-3 hover:bg-white/[0.05]">
                  <p className="text-white">{c.full_name || 'Unnamed customer'}</p>
                  <p className="text-sm text-slate-400">{new Date(c.created_at).toLocaleDateString('en-AU')}</p>
                </Link>
              ))}
              {(!recentCustomers || recentCustomers.length === 0) && <p className="text-sm text-slate-400">No recent signups.</p>}
            </div>
          </ChartShell>
        </section>

        <section>
          <SectionTitle title="Customers Needing Admin Action" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link href="/admin/bookings/checkout?status=checkout_requested" className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05]">Checkout requests queue</Link>
            <Link href="/admin/customers/blocked" className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05]">Blocked customers queue</Link>
          </div>
        </section>
      </div>
    </>
  )
}
