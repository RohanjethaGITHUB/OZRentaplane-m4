import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Admin Overview | OZRentAPlane' }

export default async function AdminMasterOverview() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // 1. EXACT COUNTS FETCHING
  const [
    { count: totalCustomers },
    { count: pendingVerifs },
    { count: totalBookings },
    { count: pendingBookingReqs },
    { count: activeFlights },
    { count: pendingPostReviews },
    { count: openSquawks },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('verification_status', 'pending_review'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending_confirmation'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'dispatched'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'awaiting_review'),
    supabase.from('squawks').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
  ])

  // Fetch KZG status
  const { data: fleet } = await supabase.from('aircraft').select('registration, status').eq('registration', 'VH-KZG').single()

  // High Priority Attentions
  const attentions = [
    { label: 'Pending Verifications', count: pendingVerifs || 0, href: '/admin/pending-verifications', color: 'text-amber-400', icon: 'pending_actions' },
    { label: 'Booking Requests', count: pendingBookingReqs || 0, href: '/admin/bookings/requests', color: 'text-blue-400', icon: 'fact_check' },
    { label: 'Post-Flight Reviews', count: pendingPostReviews || 0, href: '/admin/bookings/post-flight-reviews', color: 'text-purple-400', icon: 'assignment_turned_in' },
    { label: 'Open Squawks', count: openSquawks || 0, href: '/admin', color: 'text-red-400', icon: 'build_circle' }
  ].filter(a => a.count > 0)

  return (
    <>
      <AdminPortalHero
        eyebrow="Operations Overview"
        title="Operations Dashboard"
        subtitle="Monitor verification requests, bookings, aircraft availability, and customer messages."
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">

      {/* Attention Required Panel */}
      {attentions.length > 0 && (
        <section className="mb-12 bg-amber-500/10 border border-amber-500/20 rounded-[1.25rem] p-6 shadow-2xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/20 blur-[80px] pointer-events-none rounded-full" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-6 flex items-center gap-2 relative z-10">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> Action Required
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
            {attentions.map(a => (
              <Link key={a.label} href={a.href} className="bg-black/20 hover:bg-black/30 border border-amber-500/10 hover:border-amber-500/30 rounded-xl p-4 transition-colors flex items-center gap-4">
                <span className={`material-symbols-outlined text-[24px] ${a.color}`} style={{ fontVariationSettings: "'wght' 300" }}>{a.icon}</span>
                <div>
                  <div className={`text-xl font-medium ${a.color}`}>{a.count}</div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{a.label}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Cross-system Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {/* CUSTOMERS */}
        <Link href="/admin/customers" className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 p-6 rounded-2xl group hover:bg-[#282a2d] transition-colors relative overflow-hidden flex flex-col justify-between min-h-[140px]">
          <span className="material-symbols-outlined text-4xl absolute -right-4 -bottom-4 text-white/5 group-hover:text-white/10 transition-colors" style={{ fontVariationSettings: "'FILL' 1" }}>groups</span>
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Total Customers</span>
            <span className="material-symbols-outlined text-sm text-slate-600">arrow_forward</span>
          </div>
          <div className="text-3xl font-light font-serif text-[#e2e2e6]">{totalCustomers || 0}</div>
        </Link>

        {/* BOOKINGS */}
        <Link href="/admin/bookings" className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 p-6 rounded-2xl group hover:bg-[#282a2d] transition-colors relative overflow-hidden flex flex-col justify-between min-h-[140px]">
          <span className="material-symbols-outlined text-4xl absolute -right-4 -bottom-4 text-white/5 group-hover:text-white/10 transition-colors" style={{ fontVariationSettings: "'FILL' 1" }}>event_seat</span>
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Lifetime Bookings</span>
            <span className="material-symbols-outlined text-sm text-slate-600">arrow_forward</span>
          </div>
          <div className="text-3xl font-light font-serif text-[#e2e2e6]">{totalBookings || 0}</div>
        </Link>

        {/* FLIGHTS */}
        <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 p-6 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[140px]">
          <span className="material-symbols-outlined text-4xl absolute -right-4 -bottom-4 text-white/5" style={{ fontVariationSettings: "'FILL' 1" }}>flight_takeoff</span>
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase tracking-widest font-bold text-blue-400">Active Flights</span>
          </div>
          <div className="text-3xl font-light font-serif text-blue-300">{activeFlights || 0}</div>
        </div>

        {/* FLEET */}
        <Link href="/admin/aircraft" className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 p-6 rounded-2xl group hover:bg-[#282a2d] transition-colors relative overflow-hidden flex flex-col justify-between min-h-[140px]">
          <span className="material-symbols-outlined text-4xl absolute -right-4 -bottom-4 text-white/5 group-hover:text-white/10 transition-colors" style={{ fontVariationSettings: "'FILL' 1" }}>airlines</span>
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">{fleet?.registration || 'Fleet'}</span>
            <span className="material-symbols-outlined text-sm text-slate-600">arrow_forward</span>
          </div>
          <span className={`px-3 py-1 rounded inline-flex w-max text-[10px] font-bold uppercase tracking-wider border ${fleet?.status === 'active' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-slate-500/10 border-slate-500/20 text-slate-400'}`}>
            {fleet?.status || 'Unknown'}
          </span>
        </Link>
      </section>

      {/* Timeline Placeholder */}
      <section className="mb-12">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
          Operational Timeline
        </h3>
        <div className="bg-white/5 border border-white/5 rounded-[1.25rem] p-12 text-center text-slate-500 flex flex-col items-center justify-center opacity-70">
          <span className="material-symbols-outlined text-4xl mb-4 opacity-50" style={{ fontVariationSettings: "'wght' 200" }}>timeline</span>
          <p className="text-sm">7-Day Operational Timeline Graph (TODO)</p>
          <p className="text-xs opacity-60 mt-1">Will display density matching active blocks against pending reservations.</p>
        </div>
      </section>

      {/* Activity Feed Placeholder */}
      <section>
        <div className="flex justify-between items-end mb-6 border-b border-white/5 pb-4">
          <h3 className="text-lg font-light text-white tracking-wide">Recent Activity</h3>
        </div>
        <div className="space-y-4 opacity-50">
          <div className="bg-white/5 border border-white/5 p-4 rounded-xl flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><span className="material-symbols-outlined text-sm">history</span></div>
            <div className="text-sm text-slate-400">Activity stream feed pending real data tracking implementations (TODO).</div>
          </div>
        </div>
      </section>

      </div>
    </>
  )
}
