import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Availability & Blocks | Admin' }

export default async function AircraftAvailabilityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: aircraft } = await supabase.from('aircraft').select('id, registration').eq('registration', 'VH-KZG').single()
  const { data: blocks } = await supabase
    .from('schedule_blocks')
    .select('id, block_type, start_time, end_time, status')
    .eq('aircraft_id', aircraft?.id || '')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(20)

  return (
    <>
      <AdminPortalHero
        eyebrow="Aircraft"
        title="Availability & Blocks"
        subtitle="Upcoming blocked periods and quick block-time actions."
        actions={<Link href="/admin/bookings/blocks/new" className="px-4 py-2 rounded-lg bg-white text-slate-900 text-sm font-medium">Block Time</Link>}
      />
      <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-3">
        {(blocks ?? []).map((b) => (
          <div key={b.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-white capitalize">{b.block_type.replace(/_/g, ' ')}</p>
            <p className="text-sm text-slate-400">{new Date(b.start_time).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} - {new Date(b.end_time).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</p>
            <p className="text-xs text-slate-500 capitalize mt-1">{b.status}</p>
          </div>
        ))}
        {(!blocks || blocks.length === 0) && <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-slate-400">No upcoming blocks scheduled.</div>}
      </div>
    </>
  )
}
