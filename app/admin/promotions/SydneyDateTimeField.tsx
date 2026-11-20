'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Date + time picker for Sydney wall-clock time, styled for the admin portal.
 *
 * Value format matches <input type="datetime-local">: "YYYY-MM-DDTHH:mm"
 * (Sydney time), so the server action (sydneyInputToUTC) is unchanged.
 * Display follows the rest of the site: "Fri 27 Nov 2026 · 12:00 AM" (12-hour).
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const GRID_HEADINGS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] // Australian weeks start Monday
const MINUTE_OPTIONS = [0, 15, 30, 45, 59]

type Parts = { y: number; m: number; d: number; h: number; min: number } // m: 1-12, h: 0-23

const pad = (n: number) => String(n).padStart(2, '0')

export function parseLocal(value: string): Parts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) return null
  const [, y, m, d, h, min] = match.map(Number)
  return { y, m, d, h, min }
}

export function toLocalValue(p: Parts): string {
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`
}

/** Current Sydney wall-clock time as "YYYY-MM-DDTHH:mm". */
export function sydneyNowValue(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** "AEDT" or "AEST" for a Sydney calendar date. */
export function sydneyZoneLabel(p: Pick<Parts, 'y' | 'm' | 'd'>): string {
  // Midday UTC+10 on that date is always the same calendar day in Sydney.
  const probe = new Date(`${p.y}-${pad(p.m)}-${pad(p.d)}T12:00:00+10:00`)
  const offsetH = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', hour: 'numeric', hourCycle: 'h23' }).format(probe),
  ) - 12
  return offsetH >= 1 ? 'AEDT' : 'AEST'
}

const weekday = (p: Pick<Parts, 'y' | 'm' | 'd'>) => new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()

export function formatDateLabel(p: Parts): string {
  return `${WEEKDAYS_SHORT[weekday(p)]} ${p.d} ${MONTHS_SHORT[p.m - 1]} ${p.y}`
}

export function formatTimeLabel(p: Pick<Parts, 'h' | 'min'>): string {
  return `${p.h % 12 || 12}:${pad(p.min)} ${p.h >= 12 ? 'PM' : 'AM'}`
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export default function SydneyDateTimeField({
  id,
  label,
  value,
  onChange,
  hint,
  minValue,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  hint?: React.ReactNode
  /** Days before this date are greyed out (e.g. end cannot be before start). */
  minValue?: string
}) {
  const parsed = parseLocal(value) ?? parseLocal(sydneyNowValue())!
  const [open, setOpen] = useState(false)
  const [view, setView] = useState({ y: parsed.y, m: parsed.m })
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    setView({ y: parsed.y, m: parsed.m })
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (patch: Partial<Parts>) => onChange(toLocalValue({ ...parsed, ...patch }))

  const today = parseLocal(sydneyNowValue())!
  const min = minValue ? parseLocal(minValue) : null
  const minKey = min ? min.y * 10000 + min.m * 100 + min.d : 0

  const firstDow = (weekday({ y: view.y, m: view.m, d: 1 }) + 6) % 7 // Monday = 0
  const total = daysInMonth(view.y, view.m)
  const cells: Array<number | null> = [...Array(firstDow).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)

  const shiftMonth = (delta: number) =>
    setView((v) => {
      const idx = v.y * 12 + (v.m - 1) + delta
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 }
    })

  const hour12 = parsed.h % 12 || 12
  const isPm = parsed.h >= 12
  const setHour12 = (h12: number) => set({ h: (h12 % 12) + (isPm ? 12 : 0) })
  const setPm = (pm: boolean) => set({ h: (parsed.h % 12) + (pm ? 12 : 0) })
  const minuteOptions = MINUTE_OPTIONS.includes(parsed.min) ? MINUTE_OPTIONS : [...MINUTE_OPTIONS, parsed.min].sort((a, b) => a - b)

  const selectClass =
    'h-10 rounded-lg border border-[#0C2340]/15 bg-white px-2.5 text-sm font-semibold tabular-nums text-[#0C2340] focus:border-[#1a4fd6] focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/15'

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#3d5a80]">
        {label}
      </label>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left transition-colors ${
          open ? 'border-[#1a4fd6] ring-2 ring-[#1a4fd6]/15' : 'border-[#0C2340]/15 hover:border-[#0C2340]/30'
        }`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#eef4ff] text-[#1a4fd6]">
          <span className="material-symbols-outlined text-[20px]">event</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-[#0C2340]">{formatDateLabel(parsed)}</span>
          <span className="block text-xs text-[#3d5a80]">
            {formatTimeLabel(parsed)} · Sydney time ({sydneyZoneLabel(parsed)})
          </span>
        </span>
        <span className="material-symbols-outlined text-[20px] text-[#3d5a80]">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {hint ? <p className="mt-1.5 text-xs text-[#3d5a80]">{hint}</p> : null}

      {open ? (
        <div
          role="dialog"
          aria-label={label}
          className="absolute left-0 z-40 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(12,35,64,0.18)]"
        >
          {/* Month header */}
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#0C2340] hover:bg-slate-100" aria-label="Previous month">
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <p className="text-sm font-bold text-[#0C2340]">{MONTHS[view.m - 1]} {view.y}</p>
            <button type="button" onClick={() => shiftMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#0C2340] hover:bg-slate-100" aria-label="Next month">
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {GRID_HEADINGS.map((d) => (
              <span key={d} className="pb-1 text-[11px] font-semibold uppercase text-[#3d5a80]/70">{d}</span>
            ))}
            {cells.map((day, i) => {
              if (!day) return <span key={i} />
              const key = view.y * 10000 + view.m * 100 + day
              const selected = parsed.y === view.y && parsed.m === view.m && parsed.d === day
              const isToday = today.y === view.y && today.m === view.m && today.d === day
              const disabled = minKey > 0 && key < minKey
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => set({ y: view.y, m: view.m, d: day })}
                  className={`h-9 rounded-lg text-sm tabular-nums transition-colors ${
                    selected
                      ? 'bg-[#0C2340] font-bold text-white'
                      : disabled
                        ? 'cursor-not-allowed text-slate-300'
                        : isToday
                          ? 'font-bold text-[#1a4fd6] ring-1 ring-inset ring-[#1a4fd6]/40 hover:bg-[#eef4ff]'
                          : 'text-[#0C2340] hover:bg-slate-100'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Time */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#3d5a80]">Time (Sydney)</p>
            <div className="flex items-center gap-2">
              <select aria-label="Hour" value={hour12} onChange={(e) => setHour12(Number(e.target.value))} className={selectClass}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="font-bold text-[#0C2340]">:</span>
              <select aria-label="Minute" value={parsed.min} onChange={(e) => set({ min: Number(e.target.value) })} className={selectClass}>
                {minuteOptions.map((m) => (
                  <option key={m} value={m}>{pad(m)}</option>
                ))}
              </select>
              <div className="ml-auto inline-flex rounded-lg border border-[#0C2340]/15 p-0.5" role="group" aria-label="AM or PM">
                {(['AM', 'PM'] as const).map((p) => {
                  const active = (p === 'PM') === isPm
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPm(p === 'PM')}
                      className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${active ? 'bg-[#0C2340] text-white' : 'text-[#3d5a80] hover:bg-slate-100'}`}
                    >
                      {p}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onChange(sydneyNowValue())}
              className="text-xs font-semibold text-[#1a4fd6] hover:underline"
            >
              Set to now
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-[#0C2340] px-4 py-2 text-xs font-semibold text-white hover:bg-[#152d5a]"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
