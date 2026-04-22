import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/formatDateTime'

export const metadata = { title: 'Bookings Overview | Admin' }

interface StatCardProps {
  label: string
  value: number
  icon: string
  href: string
  highlight?: boolean
}

function StatCard({ label, value, icon, href, highlight }: StatCardProps) {
  return (
    <Link href={href} className={`
      relative overflow-hidden p-6 rounded-2xl border transition-all duration-300
      ${highlight 
        ? 'bg-blue-900/20 border-blue-500/30 hover:bg-blue-900/30 hover:border-blue-500/50 shadow-[0_0_20px_rgba(30,58,138,0.2)]' 
        : 'bg-[#1e2023]/60 backdrop-blur-xl border-white/5 hover:bg-[#282a2d]'}
    `}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">{label}</p>
          <div className={`text-3xl font-light font-serif ${highlight ? 'text-blue-100' : 'text-[#e2e2e6]'}`}>
            {value}
          </div>
        </div>
        <span className={`material-symbols-outlined text-3xl ${highlight ? 'text-blue-400/50' : 'text-white/10'}`} style={{ fontVariationSettings: "'wght' 200" }}>
          {icon}
        </span>
      </div>
    </Link>
  )
}

export default async function AdminBookingsOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const fetchCount = async (table: string, statusArray: string[]) => {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in('status', statusArray)
    return count || 0
  }

  const [
    pendingCount,
    confirmedCount,
    activeCount,
    awaitingRecordCount,
    pendingReviewCount,
    completedCount
  ] = await Promise.all([
    fetchCount('bookings', ['pending_confirmation']),
    fetchCount('bookings', ['confirmed', 'ready_for_dispatch']),
    fetchCount('bookings', ['dispatched']),
    fetchCount('bookings', ['awaiting_flight_record', 'flight_record_overdue']),
    fetchCount('flight_records', ['submitted', 'pending_review', 'needs_clarification', 'resubmitted']),
    fetchCount('bookings', ['completed'])
  ])

  // Recent bookings
  const { data: recentBookings } = await supabase
    .from('bookings')
    .select(`
      id,
      scheduled_start,
      scheduled_end,
      status,
      pic_name,
      aircraft ( id, registration, type )
    `)
    .order('created_at', { ascending: false })
    .limit(5)

  // Booking Pipeline total volume
  const totalInPipeline = pendingCount + confirmedCount + activeCount + awaitingRecordCount + pendingReviewCount

  return (
    <div className="p-10 max-w-7xl mx-auto pb-24">
      <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end">
        <div>
          <h2 className="font-serif text-4xl font-light text-[#e2e2e6] tracking-tight">Bookings Overview</h2>
          <p className="text-slate-400 mt-2 font-light tracking-wide">Live overview of fleet utilization and post-flight requirements.</p>
          <div className="h-0.5 w-10 bg-[#44474c] mt-6" />
        </div>
        <div className="flex gap-4 mt-6 md:mt-0">
          <Link href="/admin/bookings/calendar" className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-white/10">
            <span className="material-symbols-outlined text-sm">calendar_month</span> Calendar
          </Link>
          <Link href="/admin/bookings/requests" className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-white/10">
            <span className="material-symbols-outlined text-sm">fact_check</span> Requests
          </Link>
        </div>
      </header>

      {/* Booking Status Pipeline */}
      <section className="mb-12 border border-white/5 rounded-2xl p-8 bg-[#0c1326]/30 overflow-hidden relative">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-8 flex items-center gap-2">
          Operations Pipeline
        </h3>
        <div className="flex flex-col md:flex-row gap-1 h-32 md:h-12">
          {totalInPipeline === 0 ? (
            <div className="w-full bg-white/5 rounded-lg flex justify-center items-center text-xs text-slate-500">No active bookings in pipeline</div>
          ) : (
            <>
              {pendingCount > 0 && <div className="bg-slate-500/50 rounded-lg flex flex-col justify-center items-center text-[10px] text-white font-bold tracking-widest overflow-hidden" style={{ width: `${(pendingCount / totalInPipeline) * 100}%` }}>{pendingCount}</div>}
              {confirmedCount > 0 && <div className="bg-blue-500/50 rounded-lg flex flex-col justify-center items-center text-[10px] text-white font-bold tracking-widest overflow-hidden" style={{ width: `${(confirmedCount / totalInPipeline) * 100}%` }}>{confirmedCount}</div>}
              {activeCount > 0 && <div className="bg-emerald-500/50 rounded-lg flex flex-col justify-center items-center text-[10px] text-white font-bold tracking-widest overflow-hidden" style={{ width: `${(activeCount / totalInPipeline) * 100}%` }}>{activeCount}</div>}
              {awaitingRecordCount > 0 && <div className="bg-amber-500/50 rounded-lg flex flex-col justify-center items-center text-[10px] text-white font-bold tracking-widest overflow-hidden" style={{ width: `${(awaitingRecordCount / totalInPipeline) * 100}%` }}>{awaitingRecordCount}</div>}
              {pendingReviewCount > 0 && <div className="bg-purple-500/50 rounded-lg flex flex-col justify-center items-center text-[10px] text-white font-bold tracking-widest overflow-hidden" style={{ width: `${(pendingReviewCount / totalInPipeline) * 100}%` }}>{pendingReviewCount}</div>}
            </>
          )}
        </div>
        <div className="flex flex-col md:flex-row justify-between mt-4 text-[10px] uppercase tracking-widest font-semibold text-slate-500">
          <span>Pending</span>
          <span className="text-blue-500/60">Confirmed</span>
          <span className="text-emerald-500/60">Dispatched</span>
          <span className="text-amber-500/60">Awaiting Record</span>
          <span className="text-purple-500/60">Review Queue</span>
        </div>
      </section>

      {/* Metrics Dashboard */}
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">Operations Center</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        <StatCard 
          label="Pending Requests" 
          value={pendingCount} 
          icon="mark_email_unread" 
          href="/admin/bookings/requests"
          highlight={pendingCount > 0} 
        />
        <StatCard 
          label="Pending Post-Flight Reviews" 
          value={pendingReviewCount} 
          icon="assignment_late" 
          href="/admin/bookings/post-flight-reviews"
          highlight={pendingReviewCount > 0} 
        />
        <StatCard 
          label="Awaiting Customer Records" 
          value={awaitingRecordCount} 
          icon="timer" 
          href="/admin/bookings" 
        />
        <StatCard 
          label="Active / Dispatched Flights" 
          value={activeCount} 
          icon="flight_takeoff" 
          href="/admin/bookings" 
        />
        <StatCard 
          label="Confirmed Upcoming" 
          value={confirmedCount} 
          icon="event_available" 
          href="/admin/bookings/calendar" 
        />
        <StatCard 
          label="Lifetime Completed" 
          value={completedCount} 
          icon="done_all" 
          href="/admin/bookings" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Next 7 Days Timeline (Placeholder) */}
        <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-2xl flex flex-col text-center justify-center items-center py-16 opacity-70">
          <span className="material-symbols-outlined text-4xl text-slate-600 mb-3" style={{ fontVariationSettings: "'wght' 200" }}>timeline</span>
          <p className="text-sm text-slate-400">Next 7 Days Booking Timeline (TODO)</p>
        </div>

        {/* Recent Bookings */}
        <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
          <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Recent Bookings</h3>
            <Link href="/admin/bookings/requests" className="text-[10px] text-slate-500 hover:text-blue-300 uppercase tracking-widest font-bold">View Queue →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0c1326]/30">
                <tr className="border-b border-white/5 text-slate-500 font-medium">
                  <th className="px-6 py-4 font-normal text-xs uppercase tracking-widest">Aircraft</th>
                  <th className="px-6 py-4 font-normal text-xs uppercase tracking-widest">Start</th>
                  <th className="px-6 py-4 font-normal text-xs uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentBookings?.map(booking => {
                  const start = formatDateTime(booking.scheduled_start)
                  const isPending = booking.status === 'pending_confirmation'
                  const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft

                  return (
                    <tr key={booking.id} className="text-slate-300 hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-medium text-white">{aircraft?.registration || 'Unknown'}</td>
                      <td className="px-6 py-4 tabular-nums">{start}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          isPending 
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                            : booking.status.includes('approved') 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-white/5 text-slate-400 border border-white/10'
                        }`}>
                          {booking.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {(!recentBookings || recentBookings.length === 0) && (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500 text-xs">
                      No recent bookings found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  )
}
