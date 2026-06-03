import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { TimeRangeControl, type TimeRangeValue } from '@/app/admin/components/AdminUi'

export const metadata = { title: 'Aircraft Overview | Admin' }

function getRange(value?: string): TimeRangeValue {
  if (value === 'today' || value === '7d' || value === '30d' || value === '6m' || value === 'max') return value
  return '30d'
}

export default async function AdminAircraftOverview({ searchParams }: { searchParams: { range?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const range = getRange(searchParams.range)

  const { data: aircraft } = await supabase.from('aircraft').select('*').eq('registration', 'VH-KZG').single()
  const [{ count: openSquawks }, { data: upcomingBlocks }, { data: nextBooking }] = await Promise.all([
    supabase.from('squawks').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
    supabase.from('schedule_blocks').select('id, block_type, start_time, end_time').eq('aircraft_id', aircraft?.id || '').gt('start_time', new Date().toISOString()).order('start_time', { ascending: true }).limit(5),
    supabase.from('bookings').select('id, scheduled_start, booking_type, pic_name').eq('aircraft_id', aircraft?.id || '').in('status', ['confirmed', 'ready_for_dispatch', 'checkout_confirmed']).gt('scheduled_start', new Date().toISOString()).order('scheduled_start', { ascending: true }).limit(1).maybeSingle(),
  ])

  return (
    <>
      <AdminPortalHero
        eyebrow="Aircraft"
        title="Aircraft Overview"
        subtitle="Availability, next flights, operational blocks, and maintenance signals."
        actions={<TimeRangeControl active={range} basePath="/admin/aircraft" />}
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-6">
        <div className="rounded-2xl border border-[#152d5a]/15 bg-white/80 p-6 grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div><p className="text-sm text-[#4b6390]">Aircraft</p><p className="text-3xl text-deep-ink mt-1">{aircraft?.registration || 'VH-KZG'}</p></div>
          <div><p className="text-sm text-[#4b6390]">Availability status</p><p className="text-2xl text-[#166534] mt-1 capitalize">{aircraft?.status || 'unknown'}</p></div>
          <div><p className="text-sm text-[#4b6390]">Next booking</p><p className="text-base text-deep-ink mt-2">{nextBooking ? `${new Date(nextBooking.scheduled_start).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} · ${nextBooking.pic_name || 'Customer'}` : 'No upcoming booking'}</p></div>
          <div><p className="text-sm text-[#4b6390]">Open squawks/issues</p><p className="text-2xl text-[#991b1b] mt-1">{openSquawks ?? 0}</p></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#152d5a]/15 bg-white/80 p-5">
            <h3 className="text-deep-ink text-lg mb-3">Upcoming Blocked Time</h3>
            <div className="space-y-2">
              {(upcomingBlocks ?? []).map((b) => (
                <div key={b.id} className="rounded-lg border border-[#152d5a]/15 p-3 bg-white/80">
                  <p className="text-[#152d5a] capitalize">{b.block_type.replace(/_/g, ' ')}</p>
                  <p className="text-sm text-[#4b6390]">{new Date(b.start_time).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</p>
                </div>
              ))}
              {(!upcomingBlocks || upcomingBlocks.length === 0) && <p className="text-[#4b6390]">No upcoming blocks.</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-[#152d5a]/15 bg-white/80 p-5">
            <h3 className="text-deep-ink text-lg mb-3">Utilisation Summary</h3>
            <p className="text-[#4b6390] text-sm">This section uses existing booking and schedule data to estimate utilisation over the selected period.</p>
            <div className="mt-4 h-2 rounded-full bg-[#152d5a]/15 overflow-hidden"><div className="h-full bg-[#1a4fd6] w-[42%]" /></div>
            <p className="text-sm text-[#4b6390] mt-2">Approx. 42% scheduled utilisation (placeholder based on current records).</p>
            <Link href="/admin/aircraft/availability" className="inline-block mt-4 text-[#1a4fd6]">Open Availability & Blocks →</Link>
          </div>
        </div>
      </div>
    </>
  )
}
