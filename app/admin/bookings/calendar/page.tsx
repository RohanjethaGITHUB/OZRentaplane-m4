import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  sydneyDateKey,
  todaySydneyDateKey,
  formatAircraftTimeRange,
  debugBlockTimes,
} from '@/lib/utils/sydney-time'

export const metadata = { title: 'Calendar | Admin' }

const IS_DEV = process.env.NODE_ENV !== 'production'

function getStatusBadge(status: string) {
  if (status === 'active')    return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
  if (status === 'cancelled') return 'bg-rose-500/10 text-rose-500 border-rose-500/20'
  if (status === 'completed') return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  return 'bg-white/10 text-slate-300 border-white/10'
}

function getBlockTypeColor(type: string) {
  switch (type) {
    case 'maintenance':
    case 'inspection':    return 'text-amber-400'
    case 'customer_booking': return 'text-blue-400'
    case 'owner_use':     return 'text-purple-400'
    case 'grounded':      return 'text-rose-500'
    case 'buffer':        return 'text-slate-500'
    default:              return 'text-slate-300'
  }
}

export default async function AdminCalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Attempt to load VH-KZG specifically, fallback to first active aircraft
  let targetAircraftId = ''
  let targetAircraftReg = ''

  const { data: kzg } = await supabase.from('aircraft').select('id, registration').eq('registration', 'VH-KZG').single()
  if (kzg) {
    targetAircraftId = kzg.id
    targetAircraftReg = kzg.registration
  } else {
    const { data: first } = await supabase.from('aircraft').select('id, registration').neq('status', 'inactive').limit(1).single()
    if (first) {
      targetAircraftId = first.id
      targetAircraftReg = first.registration
    }
  }

  if (!targetAircraftId) {
    return <div className="p-10 text-white">No active aircraft found in the database.</div>
  }

  // Fetch blocks: -7 days to +30 days
  const now    = new Date()
  const past   = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString()
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: blocks } = await supabase
    .from('schedule_blocks')
    .select(`
      id,
      block_type,
      start_time,
      end_time,
      status,
      internal_reason,
      public_label,
      related_booking_id,
      bookings ( pic_name, status )
    `)
    .eq('aircraft_id', targetAircraftId)
    .gte('start_time', past)
    .lte('start_time', future)
    .order('start_time', { ascending: true })

  // Group by Sydney local date (YYYY-MM-DD in Australia/Sydney).
  // Critical: blocks are filed under their Sydney date, not UTC date.
  const groupedBlocks: Record<string, typeof blocks> = {}
  for (const block of blocks ?? []) {
    if (IS_DEV) console.log(debugBlockTimes(block.start_time, block.end_time, block.block_type))
    const dateKey = sydneyDateKey(block.start_time)
    if (!groupedBlocks[dateKey]) groupedBlocks[dateKey] = []
    groupedBlocks[dateKey]!.push(block)
  }

  const sortedDates = Object.keys(groupedBlocks).sort()
  const todayKey   = todaySydneyDateKey()

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <header className="mb-12 flex justify-between items-end">
        <div>
          <h2 className="font-serif text-4xl font-light text-[#e2e2e6] tracking-tight">Calendar</h2>
          <p className="text-slate-400 mt-2 font-light tracking-wide flex items-center gap-2">
            Operational schedule for{' '}
            <span className="px-2 py-0.5 rounded bg-blue-900/30 text-blue-200 border border-blue-500/20 font-medium text-xs">
              {targetAircraftReg}
            </span>
            <span className="text-[10px] text-slate-600 ml-1">· All times Sydney (AEST/AEDT)</span>
          </p>
          <div className="h-0.5 w-10 bg-[#44474c] mt-6" />
        </div>
        <Link
          href="/admin/bookings/blocks/new"
          className="flex items-center gap-2 bg-white text-slate-900 hover:bg-slate-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Block Time
        </Link>
      </header>

      {sortedDates.length === 0 ? (
        <div className="p-12 text-center text-slate-500 border border-white/5 rounded-2xl bg-white/5">
          No schedule blocks found for the current window.
        </div>
      ) : (
        <div className="space-y-8">
          {sortedDates.map(dateStr => {
            const isToday = todayKey === dateStr
            // Use the first block's start_time to format the date header in Sydney time.
            // This guarantees the header matches the Sydney date key we grouped by.
            const sampleBlock = groupedBlocks[dateStr]![0]!
            const formattedDate = new Date(sampleBlock.start_time).toLocaleDateString('en-AU', {
              timeZone: 'Australia/Sydney',
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })

            return (
              <div key={dateStr} className="relative">
                {/* Date header */}
                <div className="sticky top-0 z-10 bg-[#111316]/90 backdrop-blur-md pb-3 pt-2">
                  <div className="flex items-center gap-3">
                    <h3 className={`font-serif text-lg ${isToday ? 'text-blue-300 font-medium' : 'text-slate-300'}`}>
                      {formattedDate}
                    </h3>
                    {isToday && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/20">
                        Today
                      </span>
                    )}
                    <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent ml-4" />
                  </div>
                </div>

                {/* Blocks container */}
                <div className="space-y-3 mt-2">
                  {groupedBlocks[dateStr]!.map(block => {
                    const durationHrs  = (new Date(block.end_time).getTime() - new Date(block.start_time).getTime()) / (1000 * 60 * 60)
                    // formatAircraftTimeRange shows date context when block spans multiple Sydney days
                    const timeWindow   = formatAircraftTimeRange(block.start_time, block.end_time)
                    const isCustomer   = block.block_type === 'customer_booking'
                    const bookingArray = Array.isArray(block.bookings) ? block.bookings : [block.bookings]
                    const bData        = bookingArray[0]

                    return (
                      <div
                        key={block.id}
                        className="group relative flex items-stretch gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors"
                      >
                        {/* Time span */}
                        <div className="w-48 flex-shrink-0 pt-0.5">
                          <p className="text-sm font-medium text-slate-300 tabular-nums tracking-tight leading-snug">
                            {timeWindow}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">
                            {durationHrs % 1 === 0 ? `${durationHrs} hrs` : `${durationHrs.toFixed(1)} hrs`}
                          </p>
                          {IS_DEV && (
                            <p className="text-[9px] text-slate-700 mt-1 font-mono leading-tight">
                              {new Date(block.start_time).toISOString().slice(0, 16)}Z
                            </p>
                          )}
                        </div>

                        {/* Divider */}
                        <div className="w-px bg-white/10" />

                        {/* Main info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className={`capitalize text-sm font-medium tracking-wide ${getBlockTypeColor(block.block_type)}`}>
                              {block.block_type.replace(/_/g, ' ')}
                            </span>
                            <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${getStatusBadge(block.status)}`}>
                              {block.status}
                            </span>
                            {block.public_label && (
                              <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] text-slate-400 border border-white/5">
                                Public: {block.public_label}
                              </span>
                            )}
                          </div>

                          {isCustomer && bData && (
                            <p className="text-sm font-light text-slate-300 mt-2">
                              <span className="text-slate-500 mr-2">PIC:</span> {bData.pic_name || '—'}
                              <span className="ml-3 text-[10px] uppercase tracking-wider px-2 py-0.5 bg-white/5 rounded text-slate-400">
                                Booking: {bData.status?.replace(/_/g, ' ')}
                              </span>
                            </p>
                          )}

                          {block.internal_reason && (
                            <p className="text-xs text-orange-200/80 mt-2 font-mono bg-orange-900/10 px-3 py-2 rounded-lg border border-orange-500/10 inline-block">
                              <span className="material-symbols-outlined text-[14px] align-text-bottom mr-1">lock</span>
                              {block.internal_reason}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
