import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/formatDateTime'
import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Aircraft Overview | Admin' }

export default async function AdminAircraftOverview() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Target VH-KZG specifically for this specific scale of MVP
  const { data: aircraft } = await supabase.from('aircraft').select('*').eq('registration', 'VH-KZG').single()

  // 1. EXACT COUNTS
  const { count: openSquawks } = await supabase.from('squawks').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress'])
  
  // 2. Fetch Latest Meters
  const { data: recentMeters } = await supabase
    .from('aircraft_meter_history')
    .select('meter_type, stop_reading, approved_at, total')
    .eq('aircraft_id', aircraft?.id || '')
    .order('approved_at', { ascending: false })
    .limit(3)

  // Quick lookup metric for highest official recordings
  // Wait, if it's chronological, the first occurrence of each type is the latest
  let latestTacho = 0
  let latestVDO = 0
  let latestAirSwitch = 0
  
  // 3. Upcoming Schedule Blocks
  const { data: upcomingBlocks } = await supabase
    .from('schedule_blocks')
    .select('id, block_type, start_time, end_time, public_label')
    .eq('aircraft_id', aircraft?.id || '')
    .gt('start_time', new Date().toISOString())
    .not('block_type', 'eq', 'booking') // Focus on admin holds
    .order('start_time', { ascending: true })
    .limit(3)

  const heroActions = (
    <>
      <Link href="/admin/aircraft/meter-history" className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-white/10">
        <span className="material-symbols-outlined text-sm">av_timer</span> Meter Logs
      </Link>
      <Link href="/admin/squawks" className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-white/10 opacity-50 pointer-events-none">
        <span className="material-symbols-outlined text-sm">construction</span> Squawks
      </Link>
    </>
  )

  return (
    <>
      <AdminPortalHero
        eyebrow="Fleet Operations"
        title="Aircraft"
        subtitle="Telemetry, maintenance routing, and fleet configurations."
        actions={heroActions}
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">

      {/* Primary Status Card */}
      <section className="mb-12">
        <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-8 relative overflow-hidden shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
          <span className="material-symbols-outlined text-[180px] absolute -right-10 -bottom-10 text-white/5 pointer-events-none" style={{ fontVariationSettings: "'FILL' 1" }}>flight</span>
          
          <div className="flex-1 space-y-2 relative z-10">
            <span className={`px-3 py-1 rounded inline-flex w-max text-[10px] font-bold uppercase tracking-wider border ${aircraft?.status === 'active' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-slate-500/10 border-slate-500/20 text-slate-400'}`}>
              {aircraft?.status === 'active' ? 'Active / Airworthy' : aircraft?.status?.replace('_', ' ') || 'Unknown'}
            </span>
            <h3 className="text-4xl font-serif text-white tracking-tight">{aircraft?.registration || 'VH-KZG'}</h3>
            <p className="text-blue-300 font-medium">{aircraft?.type?.replace('_', ' ') ?? 'Cessna 172'}</p>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-6 relative z-10 border-l border-white/10 pl-8">
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Billing Meter Rules</p>
              <p className="text-sm font-medium text-white capitalize">{aircraft?.billing_meter_type?.replace('_', ' ')} based</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Maint. Meter Rules</p>
              <p className="text-sm font-medium text-white capitalize">{aircraft?.maintenance_meter_type?.replace('_', ' ')} based</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Open Squawks</p>
              <p className="text-xl font-light font-serif text-amber-500">{openSquawks || 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Flight Buffer</p>
              <p className="text-sm font-medium text-slate-300">{aircraft?.pre_flight_buffer_hours}h pre, {aircraft?.post_flight_buffer_hours}h post</p>
            </div>
          </div>
        </div>
      </section>

      {/* Operations Split Level */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Latest Meter Outputs */}
        <section className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
          <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">av_timer</span> Latest Validated Telemetry
            </h3>
            <Link href="/admin/aircraft/meter-history" className="text-[10px] text-slate-500 hover:text-blue-300 uppercase tracking-widest font-bold">Full Log →</Link>
          </div>
          <div className="p-6 grid grid-cols-3 gap-4">
            <div className="bg-white/5 border border-white/5 rounded-xl p-4 text-center">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 block mb-2">Tacho</span>
              <span className="text-2xl font-light font-serif text-white">??</span>
              <p className="text-[9px] text-slate-600 mt-1 uppercase">Fetching Realtime (TODO)</p>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-xl p-4 text-center">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 block mb-2">VDO</span>
              <span className="text-2xl font-light font-serif text-white">??</span>
              <p className="text-[9px] text-slate-600 mt-1 uppercase">Fetching Realtime (TODO)</p>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-xl p-4 text-center">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 block mb-2">Air Switch</span>
              <span className="text-2xl font-light font-serif text-white">??</span>
              <p className="text-[9px] text-slate-600 mt-1 uppercase">Fetching Realtime (TODO)</p>
            </div>
          </div>

          <div className="px-6 pb-6 pt-2">
            <h4 className="text-[9px] uppercase font-bold tracking-widest text-slate-600 mb-3 border-b border-white/5 pb-2">Recent Submissions</h4>
            <ul className="space-y-3">
              {recentMeters?.map((m, idx) => (
                <li key={idx} className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 capitalize">{m.meter_type.replace('_', ' ')}</span>
                  <div className="flex gap-4">
                    <span className="text-blue-300 font-medium tabular-nums">{m.stop_reading.toFixed(1)}</span>
                    <span className="text-green-500/80 font-medium tabular-nums text-xs">+{m.total.toFixed(1)}</span>
                  </div>
                </li>
              ))}
              {(!recentMeters || recentMeters.length === 0) && (
                <li className="text-xs text-slate-500">No recent submissions.</li>
              )}
            </ul>
          </div>
        </section>

        {/* Maintenance Array */}
        <section className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
          <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">build_circle</span> Upcoming Block Holds
            </h3>
            <Link href="/admin/bookings/blocks/new" className="text-[10px] text-amber-500 hover:text-amber-400 uppercase tracking-widest font-bold">New Hold →</Link>
          </div>
          
          <div className="p-6">
            <ul className="space-y-4">
              {upcomingBlocks?.map(block => {
                const startStr = formatDateTime(block.start_time)
                const isMaintenance = block.block_type === 'maintenance'
                
                return (
                  <li key={block.id} className="bg-white/5 border border-white/5 rounded-xl p-4 flex justify-between items-center group hover:border-white/10 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex justify-center items-center ${isMaintenance ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-500'}`}>
                        <span className="material-symbols-outlined text-[16px]">{isMaintenance ? 'handyman' : 'pause_circle'}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{block.public_label || block.block_type.replace('_', ' ')}</p>
                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mt-0.5">{startStr}</p>
                      </div>
                    </div>
                  </li>
                )
              })}
              {(!upcomingBlocks || upcomingBlocks.length === 0) && (
                <div className="text-center py-6">
                  <span className="text-xs text-slate-500">No upcoming admin/maintenance blocks scheduled.</span>
                </div>
              )}
            </ul>
          </div>
        </section>

      </div>{/* closes grid */}
      </div>{/* closes container */}
    </>
  )
}
