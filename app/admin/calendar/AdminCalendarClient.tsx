'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { StatusPill } from '@/app/admin/components/AdminUi'
import {
  formatCalendarDateTime,
  formatCalendarMonthLabel,
  formatCalendarTime,
  formatCalendarWeekdayDay,
  sydneyCalendarDateKey,
} from '@/lib/utils/calendar-format'

export type CalEvent = {
  id: string
  type: 'checkout' | 'booking' | 'buffer' | 'blocked' | 'maintenance'
  title: string
  customer: string | null
  aircraft: string
  start: string
  end: string
  status: string
  paymentStatus: string | null
}

function tone(type: CalEvent['type']) {
  if (type === 'checkout') return 'blue'
  if (type === 'booking') return 'green'
  if (type === 'buffer') return 'slate'
  if (type === 'blocked') return 'rose'
  return 'amber'
}

export default function AdminCalendarClient({ events }: { events: CalEvent[] }) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('week')
  const [selected, setSelected] = useState<CalEvent | null>(null)
  const [focusDate, setFocusDate] = useState(new Date())

  const dayEvents = useMemo(() => {
    const focusKey = sydneyCalendarDateKey(focusDate)
    return events.filter((e) => sydneyCalendarDateKey(e.start) === focusKey)
  }, [events, focusDate])

  const weekStart = new Date(focusDate)
  weekStart.setDate(focusDate.getDate() - focusDate.getDay())
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const monthEnd = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 0)
  const daysInMonth = monthEnd.getDate()
  const monthDays = Array.from({ length: daysInMonth }).map((_, i) => new Date(focusDate.getFullYear(), focusDate.getMonth(), i + 1))
  const monthValue = `${focusDate.getFullYear()}-${String(focusDate.getMonth() + 1).padStart(2, '0')}`
  const monthOptions = Array.from({ length: 25 }).map((_, i) => {
    const offset = i - 12
    const d = new Date(focusDate.getFullYear(), focusDate.getMonth() + offset, 1)
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: formatCalendarMonthLabel(d.getFullYear(), d.getMonth()),
    }
  })
  const shiftMonth = (delta: number) => {
    setFocusDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }
  const onMonthChange = (value: string) => {
    const [yearStr, monthStr] = value.split('-')
    const y = Number(yearStr)
    const m = Number(monthStr)
    if (!Number.isFinite(y) || !Number.isFinite(m)) return
    setFocusDate(new Date(y, m - 1, 1))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-2 rounded-lg border text-sm ${view === v ? 'bg-[#1a4fd6]/15 border-[#1a4fd6]/30 text-[#1a4fd6]' : 'border-[#152d5a]/20 text-[#4b6390]'}`}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-[#152d5a]/20 text-[#152d5a] hover:bg-[#152d5a]/5" aria-label="Previous month">
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <select value={monthValue} onChange={(e) => onMonthChange(e.target.value)} className="h-9 rounded-lg border border-[#152d5a]/20 bg-white px-3 text-sm text-[#152d5a]">
            {monthOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <button onClick={() => shiftMonth(1)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-[#152d5a]/20 text-[#152d5a] hover:bg-[#152d5a]/5" aria-label="Next month">
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
        <Link href="/admin/bookings/blocks/new" className="px-4 py-2 rounded-lg bg-white text-[#152d5a] text-sm font-medium">Block Time</Link>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <StatusPill tone="blue" label="Checkout Flight" />
          <StatusPill tone="green" label="Customer Booking" />
          <StatusPill tone="slate" label="Buffer" />
          <StatusPill tone="rose" label="Blocked Time" />
          <StatusPill tone="amber" label="Maintenance" />
        </div>

        {view === 'day' && (
          <div className="space-y-2">
            {dayEvents.map((e) => (
              <button key={e.id} onClick={() => setSelected(e)} className="w-full text-left rounded-lg border border-white/10 p-3 bg-white/[0.02]">
                <p className="text-white">{e.title}</p>
                <p className="text-sm text-slate-400">{formatCalendarTime(e.start)} - {formatCalendarTime(e.end)}</p>
              </button>
            ))}
            {dayEvents.length === 0 && <p className="text-slate-400">No events on this day.</p>}
          </div>
        )}

        {view === 'week' && (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
            {weekDays.map((d) => {
              const dayKey = sydneyCalendarDateKey(d)
              const daily = events.filter((e) => sydneyCalendarDateKey(e.start) === dayKey)
              return (
                <div key={d.toISOString()} className="rounded-lg border border-white/10 p-2 min-h-[220px]">
                  <p className="text-sm text-slate-300 mb-2">{formatCalendarWeekdayDay(d)}</p>
                  <div className="space-y-1">
                    {daily.map((e) => (
                      <button key={e.id} onClick={() => setSelected(e)} className={`w-full text-left text-xs rounded px-2 py-1 border ${tone(e.type) === 'blue' ? 'border-blue-400/30 bg-blue-500/15 text-blue-100' : tone(e.type) === 'green' ? 'border-green-400/30 bg-green-500/15 text-green-100' : tone(e.type) === 'rose' ? 'border-rose-400/30 bg-rose-500/15 text-rose-100' : tone(e.type) === 'amber' ? 'border-amber-400/30 bg-amber-500/15 text-amber-100' : 'border-slate-400/30 bg-slate-500/15 text-slate-200'}`}>
                        {formatCalendarTime(e.start)} {e.title}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {view === 'month' && (
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {monthDays.map((d) => {
              const dayKey = sydneyCalendarDateKey(d)
              const daily = events.filter((e) => sydneyCalendarDateKey(e.start) === dayKey)
              return (
                <div key={d.toISOString()} className="rounded-lg border border-white/10 p-2 min-h-[120px]">
                  <p className="text-sm text-slate-300 mb-2">{d.getDate()}</p>
                  <div className="space-y-1">
                    {daily.slice(0, 3).map((e) => (
                      <button key={e.id} onClick={() => setSelected(e)} className="w-full text-left text-xs rounded bg-white/[0.05] text-slate-200 px-1.5 py-1">
                        {e.title}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setSelected(null)}>
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-[#0f131b] border-l border-white/10 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl text-white mb-3">Event details</h3>
            <p className="text-sm text-slate-400">Event type</p>
            <p className="text-white mb-2">{selected.type}</p>
            <p className="text-sm text-slate-400">Customer</p>
            <p className="text-white mb-2">{selected.customer || 'N/A'}</p>
            <p className="text-sm text-slate-400">Aircraft</p>
            <p className="text-white mb-2">{selected.aircraft}</p>
            <p className="text-sm text-slate-400">Start / End</p>
            <p className="text-white mb-2">{formatCalendarDateTime(selected.start)} - {formatCalendarDateTime(selected.end)}</p>
            <p className="text-sm text-slate-400">Status</p>
            <p className="text-white mb-2 capitalize">{selected.status.replace(/_/g, ' ')}</p>
            <p className="text-sm text-slate-400">Payment status</p>
            <p className="text-white mb-4">{selected.paymentStatus || 'N/A'}</p>
            <Link href="/admin/bookings/flights" className="inline-block px-3 py-2 rounded-lg bg-blue-500/20 text-blue-200">View booking actions</Link>
          </div>
        </div>
      )}
    </div>
  )
}
