'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelBookingNow, requestLateCancellation, rescheduleFlightBooking } from '@/app/actions/booking'
import { checkCustomerAvailability, getDayAvailability, getDateRangeAvailability, type SafeConflict } from '@/app/actions/customer-availability'
import CalendarDateField from '@/components/CalendarDateField'
import ModalPortal from '@/components/ModalPortal'
import { sydneyInputToUTC, formatSydTime, isSameSydneyCalendarDay } from '@/lib/utils/sydney-time'
import { getDayVfrWindow, isWithinDayVfrWindow } from '@/lib/utils/day-vfr'
import { formatDateFromISO, formatTime12hFromISO } from '@/lib/formatDateTime'
import { ADMIN_CONTACT_PHONE_DISPLAY, ADMIN_CONTACT_PHONE_TEL } from '@/lib/contact'

type BookingLite = {
  id: string
  booking_type: string
  status: string
  scheduled_start: string
  scheduled_end?: string | null
  aircraft_name?: string | null
  aircraft_registration?: string | null
  estimated_hours?: number | null
}

type Props = {
  booking: BookingLite
  aircraftId: string
  hasNightVfrRating?: boolean | null
  variant?: 'default' | 'listCard'
}

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; message: string; conflicts?: SafeConflict[] }

const ALL_TIME_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const period = h < 12 ? 'AM' : 'PM'
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      opts.push({ value, label: `${h12}:${String(m).padStart(2, '0')} ${period}` })
    }
  }
  return opts
})()

function getSydneyToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

function timeStrToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minToTimeStr(min: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 45, min))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  if (!timeStr) return ''
  const totalMin = timeStrToMin(timeStr) + minutes
  return minToTimeStr(totalMin)
}

function shiftDateByDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function addOneDay(dateStr: string): string {
  return shiftDateByDays(dateStr, 1)
}

function fmtTime(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = (h ?? 0) >= 12 ? 'PM' : 'AM'
  const hr = (h ?? 0) === 0 ? 12 : (h ?? 0) > 12 ? (h ?? 0) - 12 : h
  return `${hr}:${String(m ?? 0).padStart(2, '0')} ${ampm}`
}

function formatDurationLabel(minutes: number): string {
  if (minutes <= 0) return '0 min'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const decimalHrs = (minutes / 60).toFixed(2).replace(/\.?0+$/, '')
  if (hours > 0 && mins > 0) {
    return `${decimalHrs} hrs (${hours}h ${mins}m)`
  }
  if (hours > 0) {
    return `${decimalHrs} hrs (${hours}h)`
  }
  return `${decimalHrs} hrs (${mins}m)`
}

// ── Time Dropdown with Auto-scroll ──────────────────────────────────────────
function TimeDropdown({
  value,
  options,
  onChange,
  placeholder = 'Select time',
  defaultScrollTime = '09:00',
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  placeholder?: string
  defaultScrollTime?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  useEffect(() => {
    if (!open || !listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]') as HTMLElement | null
    if (selected) {
      selected.scrollIntoView({ block: 'center' })
      return
    }
    const defaultEl = listRef.current.querySelector(`[data-time="${defaultScrollTime}"]`) as HTMLElement | null
    if (defaultEl) {
      defaultEl.scrollIntoView({ block: 'center' })
    }
  }, [open, defaultScrollTime])

  const selectedLabel = options.find(o => o.value === value)?.label ?? (value || placeholder)

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-sm flex items-center justify-between transition-colors shadow-sm ${
          open ? 'border-[#1a4fd6] ring-2 ring-[#1a4fd6]/20' : 'border-[#152d5a]/20 hover:border-[#152d5a]/40 text-[#152d5a]'
        }`}
      >
        <span className={value === '' ? 'text-[#94a3b8]' : 'font-medium text-[#152d5a]'}>{value === '' ? placeholder : selectedLabel}</span>
        <span className={`material-symbols-outlined text-[18px] text-[#64748b] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {open && (
        <div className="absolute z-[1200] mt-1 w-full bg-white border border-[#152d5a]/20 rounded-xl shadow-2xl overflow-hidden">
          <div ref={listRef} className="max-h-56 overflow-y-auto overscroll-contain py-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[#94a3b8] text-center">No available times</div>
            ) : (
              options.map(o => (
                <button
                  key={o.value}
                  type="button"
                  data-time={o.value}
                  data-selected={o.value === value ? 'true' : undefined}
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between transition-colors ${
                    o.value === value
                      ? 'bg-blue-50 text-[#1a4fd6] font-semibold'
                      : 'text-[#152d5a] hover:bg-[#f0f6ff]'
                  }`}
                >
                  <span>{o.label}</span>
                  {o.value === value && <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">check</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Availability Timeline ───────────────────────────────────────────────────

function AvailabilityTimeline({
  selectedDate,
  daySlots,
  loadingDaySlots,
  startDT,
  endDT,
  onTimeChange,
  dayVfrWindow,
}: {
  selectedDate: string
  daySlots: SafeConflict[]
  loadingDaySlots?: boolean
  startDT: string
  endDT: string
  onTimeChange?: (newStartTime: string) => void
  dayVfrWindow?: { start: string; end: string } | null
}) {
  if (!selectedDate) return null

  const [hoveredConflict, setHoveredConflict] = useState<{
    midPct: number
    start12: string
    end12: string
    label: string
  } | null>(null)

  const opStartUTC = sydneyInputToUTC(`${selectedDate}T00:00`)
  const opEndUTC = sydneyInputToUTC(`${addOneDay(selectedDate)}T00:00`)
  if (!opStartUTC || !opEndUTC) return null

  const opStartMs = new Date(opStartUTC).getTime()
  const opEndMs = new Date(opEndUTC).getTime()
  const totalMs = opEndMs - opStartMs

  const toPercent = (isoUTC: string) => {
    const t = new Date(isoUTC).getTime()
    return Math.max(0, Math.min(100, ((t - opStartMs) / totalMs) * 100))
  }

  const selStartUTC = sydneyInputToUTC(startDT)
  const selEndUTC = sydneyInputToUTC(endDT)
  const hasSelection = Boolean(selStartUTC && selEndUTC && new Date(selEndUTC) > new Date(selStartUTC))

  const visibleSlots = daySlots.filter(s => {
    return new Date(s.end_time).getTime() > opStartMs && new Date(s.start_time).getTime() < opEndMs
  })

  const majorTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24]
  function hourLabel(h: number): string {
    if (h === 0 || h === 24) return '12AM'
    if (h === 12) return '12PM'
    return h < 12 ? `${h}AM` : `${h - 12}PM`
  }

  const selLeft = hasSelection ? toPercent(selStartUTC!) : 0
  const selRight = hasSelection ? 100 - toPercent(selEndUTC!) : 0
  const barContainerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const durationMinutes = hasSelection && selStartUTC && selEndUTC
    ? Math.max(15, Math.round((new Date(selEndUTC).getTime() - new Date(selStartUTC).getTime()) / 60_000))
    : 60

  function toSnappedTime(rawMinutes: number): string {
    const snappedMinutes = Math.round(rawMinutes / 15) * 15
    const minClamp = dayVfrWindow ? timeStrToMin(dayVfrWindow.start) : 0
    const maxClamp = dayVfrWindow ? Math.max(minClamp, timeStrToMin(dayVfrWindow.end) - durationMinutes) : (24 * 60 - durationMinutes)
    const clamped = Math.max(0, Math.min(23 * 60 + 45, Math.max(minClamp, Math.min(maxClamp, snappedMinutes))))
    return minToTimeStr(clamped)
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!hasSelection || !onTimeChange) return
    e.preventDefault()
    const rect = barContainerRef.current?.getBoundingClientRect()
    if (!rect) return

    const notifyTimeChange = onTimeChange
    const capturedId = e.pointerId
    const timePart = startDT.split('T')[1] ?? '00:00'
    const parts = timePart.split(':').map(Number)
    const startMinutes = (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
    const containerWidth = rect.width
    const dragStartX = e.clientX
    let lastSnapped = ''

    setIsDragging(true)

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== capturedId) return
      const deltaPixels = ev.clientX - dragStartX
      const deltaMins = (deltaPixels / containerWidth) * 24 * 60
      const newTime = toSnappedTime(startMinutes + deltaMins)
      if (newTime !== lastSnapped) {
        lastSnapped = newTime
        notifyTimeChange(newTime)
      }
    }

    function onEnd(ev: PointerEvent) {
      if (ev.pointerId !== capturedId) return
      setIsDragging(false)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onEnd)
      document.removeEventListener('pointercancel', onEnd)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onEnd)
    document.addEventListener('pointercancel', onEnd)
  }

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onTimeChange) return
    const rect = barContainerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const ratio = Math.max(0, Math.min(1, x / rect.width))
    onTimeChange(toSnappedTime(ratio * 24 * 60))
  }

  return (
    <div className="space-y-3">
      {/* Time indicator line above */}
      <div className="relative h-4">
        {majorTicks.map(h => (
          <span
            key={h}
            className="absolute text-[9px] font-medium text-[#64748b] -translate-x-1/2 select-none leading-none uppercase"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {hourLabel(h)}
          </span>
        ))}
      </div>

      <div className="relative" ref={barContainerRef}>
        {/* Sleek Floating Custom Tooltip on Hover */}
        {hoveredConflict && (
          <div
            className="absolute -top-10 -translate-x-1/2 z-30 pointer-events-none transition-all duration-150"
            style={{ left: `${hoveredConflict.midPct}%` }}
          >
            <div className="bg-[#0f172a] text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-xl border border-slate-700 flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-bold text-red-300">
                {hoveredConflict.start12} – {hoveredConflict.end12}
              </span>
              <span className="text-slate-300 text-[11px]">
                ({hoveredConflict.label || 'Booked'})
              </span>
            </div>
            <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent border-t-[#0f172a] mx-auto" />
          </div>
        )}

        <div
          onClick={handleTimelineClick}
          className={`relative h-10 rounded-xl overflow-hidden border ${
            dayVfrWindow ? 'bg-[#dbeafe] border-[#93c5fd]' : 'bg-emerald-50 border-emerald-200'
          } ${onTimeChange ? 'cursor-pointer' : ''}`}
        >
          {/* Day VFR zones */}
          {dayVfrWindow && (
            <>
              <div
                className="absolute top-0 bottom-0 bg-[#152d5a]/90 flex items-center justify-center overflow-hidden"
                style={{ left: '0%', right: `${100 - (timeStrToMin(dayVfrWindow.start) / (24 * 60)) * 100}%` }}
              >
                <span className="text-[10px] text-amber-200 select-none">🌙</span>
              </div>
              <div
                className="absolute top-0 bottom-0 bg-[#bfdbfe]"
                style={{
                  left: `${(timeStrToMin(dayVfrWindow.start) / (24 * 60)) * 100}%`,
                  right: `${100 - (timeStrToMin(dayVfrWindow.end) / (24 * 60)) * 100}%`,
                }}
              />
              <div
                className="absolute top-0 bottom-0 bg-[#152d5a]/90 flex items-center justify-center overflow-hidden"
                style={{ left: `${(timeStrToMin(dayVfrWindow.end) / (24 * 60)) * 100}%`, right: '0%' }}
              >
                <span className="text-[10px] text-amber-200 select-none">🌙</span>
              </div>
            </>
          )}

          {/* Booked / Conflict blocks */}
          {visibleSlots.map((s, idx) => {
            const startPct = toPercent(s.start_time)
            const endPct   = toPercent(s.end_time)
            const widthPct = Math.max(0.5, endPct - startPct)
            const start12  = fmtTime(formatSydTime(s.start_time))
            const end12    = fmtTime(formatSydTime(s.end_time))
            const midPct   = Math.max(12, Math.min(88, startPct + widthPct / 2))

            return (
              <div
                key={idx}
                onMouseEnter={() =>
                  setHoveredConflict({
                    midPct,
                    start12,
                    end12,
                    label: s.label || 'Unavailable',
                  })
                }
                onMouseLeave={() => setHoveredConflict(null)}
                className="absolute top-0 bottom-0 bg-red-500/85 hover:bg-red-600 transition-colors z-10 flex items-center justify-center overflow-hidden border-x border-red-600/40 cursor-pointer"
                style={{ left: `${startPct}%`, width: `${widthPct}%` }}
              >
                {widthPct >= 16 && (
                  <span className="text-[10px] font-bold text-white truncate px-1 select-none pointer-events-none drop-shadow-xs">
                    {start12}–{end12}
                  </span>
                )}
              </div>
            )
          })}

          {/* Selected flight slot */}
          {hasSelection && (
            <div
              onPointerDown={handlePointerDown}
              className={`absolute inset-y-[-2px] rounded-lg border-2 border-blue-500 bg-[#1a4fd6]/25 z-20 flex items-center justify-center transition-colors ${
                onTimeChange
                  ? isDragging
                    ? 'cursor-grabbing bg-[#1a4fd6]/35 border-blue-600'
                    : 'cursor-grab hover:bg-[#1a4fd6]/30'
                  : 'pointer-events-none'
              }`}
              style={{
                left: `${selLeft}%`,
                right: `${selRight}%`,
                touchAction: onTimeChange ? 'none' : undefined,
              }}
            >
              <div className="flex items-center gap-[3px] pointer-events-none select-none opacity-80">
                <div className="w-0.5 h-4 bg-white rounded-full shadow-sm" />
                <div className="w-0.5 h-4 bg-white rounded-full shadow-sm" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Time markers directly below the red strips */}
      {visibleSlots.length > 0 && (
        <div className="relative h-6 w-full select-none">
          {visibleSlots.map((slot, i) => {
            const startPct = toPercent(slot.start_time)
            const endPct   = toPercent(slot.end_time)
            const widthPct = Math.max(0.5, endPct - startPct)
            const midPct   = Math.max(12, Math.min(88, startPct + widthPct / 2))
            const start12  = fmtTime(formatSydTime(slot.start_time))
            const end12    = fmtTime(formatSydTime(slot.end_time))

            return (
              <div
                key={`strip-time-${slot.start_time}-${slot.end_time}-${i}`}
                className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${midPct}%` }}
              >
                <div className="w-px h-1 bg-red-400 mb-0.5" />
                <div className="inline-flex items-center gap-1 bg-[#fff1f2] border border-[#fecdd3] text-[#991b1b] text-[10px] font-bold px-2 py-0.5 rounded shadow-2xs whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span>{start12} – {end12}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Booked Windows Card on this Date */}
      {loadingDaySlots ? (
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center gap-2.5 text-xs text-[#64748b] shadow-xs">
          <div className="w-3.5 h-3.5 border-2 border-[#1a4fd6] border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span>Checking aircraft availability &amp; schedule for {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}…</span>
        </div>
      ) : visibleSlots.length > 0 ? (
        <div className="bg-white border border-[#fed7aa] rounded-xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <p className="text-xs font-bold text-[#152d5a] uppercase tracking-wider">
                Already Booked Windows on this Date
              </p>
            </div>
            <span className="text-[11px] font-medium text-[#64748b]">
              {visibleSlots.length} {visibleSlots.length === 1 ? 'booking' : 'bookings'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {visibleSlots.map((slot, i) => {
              const start12 = fmtTime(formatSydTime(slot.start_time))
              const end12   = fmtTime(formatSydTime(slot.end_time))
              return (
                <div
                  key={`${slot.start_time}-${slot.end_time}-${i}`}
                  className="inline-flex items-center gap-2 bg-[#fff1f2] border border-[#fecdd3] rounded-lg px-3 py-1.5 text-xs text-[#991b1b]"
                >
                  <span className="material-symbols-outlined text-[14px] text-red-500">
                    schedule
                  </span>
                  <span className="font-bold tabular-nums">
                    {start12} – {end12}
                  </span>
                  <span className="text-[10px] font-semibold text-[#be123c] bg-white px-1.5 py-0.5 rounded border border-red-200">
                    {slot.label || 'Booked'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-emerald-200/80 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-800 shadow-xs">
          <span className="material-symbols-outlined text-base text-emerald-600 flex-shrink-0">
            check_circle
          </span>
          <span>
            No bookings on this date — the aircraft is completely free all day!
          </span>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-[#64748b]">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-300/80 border border-blue-400 inline-block" />
          {dayVfrWindow ? `Day VFR (${dayVfrWindow.start} – ${dayVfrWindow.end})` : 'Available'}
        </span>
        {dayVfrWindow && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-[#64748b]">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#152d5a] inline-block" />
            Night restricted
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-[#64748b]">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
          Booked / Busy
        </span>
        {hasSelection && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-[#1a4fd6]">
            <span className="w-2.5 h-2.5 rounded-sm border-2 border-blue-500 bg-[#1a4fd6]/30 inline-block" />
            Selected ({startDT.split('T')[1] ?? '--:--'} – {endDT.split('T')[1] ?? '--:--'})
          </span>
        )}
      </div>
    </div>
  )
}

// ── Multi-day Date & Time helper ────────────────────────────────────────────
function formatMultiDaySchedulePoint(isoString?: string | null): string {
  if (!isoString) return '—'
  const d = new Date(isoString)
  const dateStr = d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  })
  const timeStr = d.toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Australia/Sydney',
  }).toLowerCase()
  return `${dateStr} at ${timeStr}`
}

function FlightRescheduleModal({
  booking,
  aircraftId,
  initialNightVfrRating,
  originalDurationMin,
  submitting,
  onClose,
  onSubmit,
}: {
  booking: BookingLite
  aircraftId: string
  initialNightVfrRating?: boolean | null
  originalDurationMin: number
  submitting: boolean
  onClose: () => void
  onSubmit: (data: { startDate: string; startTime: string; returnDate?: string; returnTime?: string }) => void
}) {
  const isOriginalMultiDay = Boolean(
    booking.scheduled_start &&
    booking.scheduled_end &&
    !isSameSydneyCalendarDay(booking.scheduled_start, booking.scheduled_end)
  )
  const [isMultiDay, setIsMultiDay] = useState(isOriginalMultiDay)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedEndDate, setSelectedEndDate] = useState('')
  const [selectedStartTime, setSelectedStartTime] = useState('')
  const [selectedEndTime, setSelectedEndTime] = useState('')
  const [nightVfrRating, setNightVfrRating] = useState<boolean | null>(initialNightVfrRating ?? false)
  const [daySlots, setDaySlots] = useState<SafeConflict[]>([])
  const [loadingDaySlots, setLoadingDaySlots] = useState<boolean>(false)
  const [multiDaySlots, setMultiDaySlots] = useState<SafeConflict[]>([])
  const [loadingMultiDaySlots, setLoadingMultiDaySlots] = useState<boolean>(false)
  const [availability, setAvailability] = useState<AvailabilityState>({ status: 'idle' })
  const [dayVfrError, setDayVfrError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const minDate = useMemo(() => getSydneyToday(), [])

  // Calculate day VFR window & filter time options
  const dayVfrWindow = (selectedDate && nightVfrRating === false) ? getDayVfrWindow(selectedDate) : null
  const departureOptions = useMemo(() => {
    if (selectedDate && nightVfrRating === false && !isMultiDay) {
      return ALL_TIME_OPTIONS.filter(o => isWithinDayVfrWindow(o.value, selectedDate, originalDurationMin))
    }
    return ALL_TIME_OPTIONS
  }, [selectedDate, nightVfrRating, originalDurationMin, isMultiDay])

  const returnOptions = ALL_TIME_OPTIONS

  // Calculate current duration
  const currentDurationMin = useMemo(() => {
    if (!selectedStartTime || !selectedEndTime) return originalDurationMin
    if (isMultiDay && selectedDate && selectedEndDate && selectedDate !== selectedEndDate) {
      const sUtc = sydneyInputToUTC(`${selectedDate}T${selectedStartTime}`)
      const eUtc = sydneyInputToUTC(`${selectedEndDate}T${selectedEndTime}`)
      if (sUtc && eUtc && new Date(eUtc) > new Date(sUtc)) {
        return Math.round((new Date(eUtc).getTime() - new Date(sUtc).getTime()) / 60000)
      }
    }
    const startMin = timeStrToMin(selectedStartTime)
    const endMin = timeStrToMin(selectedEndTime)
    return endMin > startMin ? endMin - startMin : 0
  }, [selectedStartTime, selectedEndTime, selectedDate, selectedEndDate, isMultiDay, originalDurationMin])

  // Load daily availability slots
  useEffect(() => {
    if (!selectedDate || !aircraftId || isMultiDay) {
      setDaySlots([])
      setLoadingDaySlots(false)
      return
    }
    let active = true
    setLoadingDaySlots(true)
    getDayAvailability(aircraftId, selectedDate, booking.id)
      .then(res => {
        if (active) setDaySlots(res ?? [])
      })
      .catch(() => {
        if (active) setDaySlots([])
      })
      .finally(() => {
        if (active) setLoadingDaySlots(false)
      })
    return () => {
      active = false
    }
  }, [selectedDate, aircraftId, isMultiDay, booking.id])

  // Load multi-day range & month availability slots
  useEffect(() => {
    if (!selectedDate || !aircraftId || !isMultiDay) {
      setMultiDaySlots([])
      return
    }
    const [y, m, d] = selectedDate.split('-').map(Number)
    const lastDayOfMonth = new Date(y!, m!, 0).getDate()
    const daysLeftInMonth = lastDayOfMonth - d!
    let targetYear = y!
    let targetMonth = m!
    let targetDay = lastDayOfMonth
    if (daysLeftInMonth < 10) {
      const nextMonthEnd = new Date(y!, m! + 1, 0)
      targetYear = nextMonthEnd.getFullYear()
      targetMonth = nextMonthEnd.getMonth() + 1
      targetDay = nextMonthEnd.getDate()
    }
    const monthEndDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`

    let active = true
    setLoadingMultiDaySlots(true)
    getDateRangeAvailability(aircraftId, selectedDate, monthEndDate, booking.id)
      .then(slots => {
        if (active) setMultiDaySlots(slots ?? [])
      })
      .catch(err => {
        console.error('[FlightChangeActions] Failed to load multi-day range availability:', err)
        if (active) setMultiDaySlots([])
      })
      .finally(() => {
        if (active) setLoadingMultiDaySlots(false)
      })

    return () => {
      active = false
    }
  }, [selectedDate, aircraftId, isMultiDay, booking.id])

  // Handle start time change and maintain flight duration
  const handleStartTimeChange = (start: string) => {
    setSelectedStartTime(start)
    setFormError(null)
    if (start && !isMultiDay) {
      const calcEnd = addMinutesToTime(start, originalDurationMin)
      setSelectedEndTime(calcEnd)
    }
  }

  // Handle manual end time change
  const handleEndTimeChange = (end: string) => {
    setSelectedEndTime(end)
    setFormError(null)
  }

  // Availability & Day VFR verification
  useEffect(() => {
    const effectiveEndDate = isMultiDay ? (selectedEndDate || selectedDate) : selectedDate
    if (!selectedDate || !selectedStartTime || !effectiveEndDate || !selectedEndTime) {
      setAvailability({ status: 'idle' })
      setDayVfrError(null)
      return
    }

    const startUtc = sydneyInputToUTC(`${selectedDate}T${selectedStartTime}`)
    const endUtc = sydneyInputToUTC(`${effectiveEndDate}T${selectedEndTime}`)
    if (!startUtc || !endUtc) {
      setAvailability({ status: 'unavailable', message: 'Invalid date/time.' })
      return
    }

    if (new Date(endUtc) <= new Date(startUtc)) {
      setAvailability({ status: 'unavailable', message: 'Return time must be after departure time.' })
      return
    }

    if (nightVfrRating === false && !isMultiDay) {
      const startMin = timeStrToMin(selectedStartTime)
      const endMin = timeStrToMin(selectedEndTime)
      const durationMin = endMin - startMin
      const window = getDayVfrWindow(selectedDate)
      const within = isWithinDayVfrWindow(selectedStartTime, selectedDate, durationMin)
      if (!within) {
        setDayVfrError(`Selected slot must fall within Day VFR (${window.start} – ${window.end}).`)
        setAvailability({ status: 'unavailable', message: 'Selected time is outside allowed Day VFR daylight window.' })
        return
      }
    }
    setDayVfrError(null)

    let cancelled = false
    setAvailability({ status: 'checking' })

    const timer = setTimeout(() => {
      checkCustomerAvailability(aircraftId, startUtc, endUtc, 'default', booking.id)
        .then(res => {
          if (cancelled) return
          if (res.available) {
            setAvailability({ status: 'available' })
          } else {
            const list = res.conflicts ?? []
            setAvailability({
              status: 'unavailable',
              message: list.length > 0
                ? 'This slot conflicts with an existing booking or buffer.'
                : 'Aircraft is not available for the selected slot.',
              conflicts: list,
            })
          }
        })
        .catch(() => {
          if (!cancelled) setAvailability({ status: 'unavailable', message: 'Could not verify availability.' })
        })
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [selectedDate, selectedEndDate, selectedStartTime, selectedEndTime, aircraftId, nightVfrRating, isMultiDay, booking.id])

  const canSubmit =
    Boolean(selectedDate && selectedStartTime && (!isMultiDay || selectedEndDate) && selectedEndTime) &&
    availability.status === 'available' &&
    !dayVfrError &&
    !submitting

  const handleConfirm = () => {
    if (!selectedDate) return setFormError('Please choose a departure date.')
    if (isMultiDay && !selectedEndDate) return setFormError('Please choose a return date.')
    if (!selectedStartTime) return setFormError('Please select departure time.')
    if (!selectedEndTime) return setFormError('Please select return time.')
    
    const effectiveEndDate = isMultiDay ? selectedEndDate : selectedDate
    const startUtc = sydneyInputToUTC(`${selectedDate}T${selectedStartTime}`)
    const endUtc = sydneyInputToUTC(`${effectiveEndDate}T${selectedEndTime}`)
    if (!startUtc || !endUtc || new Date(endUtc) <= new Date(startUtc)) {
      return setFormError('Return time must be after departure time.')
    }
    if (dayVfrError) return setFormError(dayVfrError)
    if (availability.status !== 'available') {
      return setFormError(availability.status === 'unavailable' ? availability.message : 'Please choose an available flight slot.')
    }
    onSubmit({
      startDate: selectedDate,
      startTime: selectedStartTime,
      returnDate: isMultiDay ? selectedEndDate : selectedDate,
      returnTime: selectedEndTime,
    })
  }

  const startDT = selectedDate && selectedStartTime ? `${selectedDate}T${selectedStartTime}` : ''
  const endDT = (isMultiDay ? selectedEndDate : selectedDate) && selectedEndTime ? `${isMultiDay ? selectedEndDate : selectedDate}T${selectedEndTime}` : ''

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-2xl max-h-[calc(100vh-4.5rem)] bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#152d5a]/10 flex-shrink-0 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1a4fd6] flex-shrink-0">
                <span className="material-symbols-outlined text-[20px] sm:text-[22px]">calendar_month</span>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#152d5a]">Reschedule Flight</h3>
                <p className="text-[11px] sm:text-xs text-[#64748b]">Sydney Time (AEST/AEDT)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isMultiDay && (
                <span className="inline-flex items-center px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-[#fef3c7] border border-[#fde68a] whitespace-nowrap">
                  MULTI-DAY BOOKING
                </span>
              )}
              <button
                onClick={onClose}
                disabled={submitting}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748b] hover:text-[#152d5a] hover:bg-[#f0f6ff] transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="px-6 py-5 space-y-4 overflow-y-auto min-h-0 flex-1">
            {/* Current Schedule Summary Card */}
            {isMultiDay ? (
              <div className="bg-[#f8fbff] border border-[#152d5a]/10 rounded-xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748b] mb-2.5">
                  CURRENT BOOKING SCHEDULE (HELD)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <p className="text-[11px] text-[#64748b] font-medium">Departure</p>
                    <p className="text-[13.5px] sm:text-[14px] font-semibold text-[#152d5a] mt-0.5">
                      {formatMultiDaySchedulePoint(booking.scheduled_start)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#64748b] font-medium">Return</p>
                    <p className="text-[13.5px] sm:text-[14px] font-semibold text-[#152d5a] mt-0.5">
                      {formatMultiDaySchedulePoint(booking.scheduled_end)}
                    </p>
                  </div>
                </div>

                {/* ── Multi-Day Month & Days Availability Browser ── */}
                {selectedDate && (
                  <div className="mt-2 pt-3 border-t border-[#152d5a]/10">
                    {(() => {
                      const [y, m, d] = selectedDate.split('-').map(Number)
                      const lastDayOfMonth = new Date(y!, m!, 0).getDate()
                      const daysLeftInMonth = lastDayOfMonth - d!
                      let targetYear = y!
                      let targetMonth = m!
                      let targetDay = lastDayOfMonth
                      if (daysLeftInMonth < 10) {
                        const nextMonthEnd = new Date(y!, m! + 1, 0)
                        targetYear = nextMonthEnd.getFullYear()
                        targetMonth = nextMonthEnd.getMonth() + 1
                        targetDay = nextMonthEnd.getDate()
                      }
                      const monthEndDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`

                      const dateList: string[] = []
                      let cur = selectedDate
                      while (cur <= monthEndDate && dateList.length < 35) {
                        dateList.push(cur)
                        cur = shiftDateByDays(cur, 1)
                      }

                      function getDayConflicts(dateStr: string): SafeConflict[] {
                        const dayStartUTC = sydneyInputToUTC(`${dateStr}T00:00`)
                        const dayEndUTC = sydneyInputToUTC(`${shiftDateByDays(dateStr, 1)}T00:00`)
                        if (!dayStartUTC || !dayEndUTC) return []
                        const sMs = new Date(dayStartUTC).getTime()
                        const eMs = new Date(dayEndUTC).getTime()
                        return multiDaySlots.filter((c) => {
                          const csMs = new Date(c.start_time).getTime()
                          const ceMs = new Date(c.end_time).getTime()
                          return ceMs > sMs && csMs < eMs
                        })
                      }

                      const totalMonthConflicts = multiDaySlots.length
                      const monthName = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-AU', {
                        month: 'long',
                        year: 'numeric',
                        timeZone: 'Australia/Sydney',
                      })

                      return (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1a4fd6]"></span>
                              </span>
                              <div>
                                <h4 className="text-xs font-bold text-[#152d5a] uppercase tracking-wider">
                                  {monthName} Availability &amp; Day-by-Day Overview
                                </h4>
                                <p className="text-[11px] text-[#64748b]">
                                  Click any day below to quickly select your return date.
                                </p>
                              </div>
                            </div>
                            {loadingMultiDaySlots ? (
                              <span className="text-[11px] font-semibold text-[#1a4fd6] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 animate-pulse">
                                Loading month availability…
                              </span>
                            ) : totalMonthConflicts > 0 ? (
                              <span className="text-[11px] font-semibold text-[#991b1b] bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
                                {totalMonthConflicts} {totalMonthConflicts === 1 ? 'booking' : 'bookings'} in this period
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                100% Free All Month
                              </span>
                            )}
                          </div>

                          {/* Day Cards Horizontal Strip */}
                          <div className="overflow-x-auto pb-2 -mx-1 px-1">
                            <div className="flex items-stretch gap-2.5 min-w-max">
                              {dateList.map((dStr) => {
                                const dObj = new Date(`${dStr}T12:00:00`)
                                const dayShort = dObj
                                  .toLocaleDateString('en-AU', { weekday: 'short' })
                                  .toUpperCase()
                                const dayNum = dObj.toLocaleDateString('en-AU', {
                                  day: 'numeric',
                                  month: 'short',
                                })
                                const isStart = dStr === selectedDate
                                const isReturn = dStr === selectedEndDate
                                const inSpan =
                                  selectedDate &&
                                  selectedEndDate &&
                                  dStr > selectedDate &&
                                  dStr < selectedEndDate
                                const dayConfs = getDayConflicts(dStr)
                                const isBusy = dayConfs.length > 0

                                return (
                                  <button
                                    key={dStr}
                                    type="button"
                                    onClick={() => {
                                      if (dStr === selectedDate) return
                                      setSelectedEndDate(dStr)
                                      setFormError(null)
                                    }}
                                    title={
                                      dStr === selectedDate
                                        ? 'Reschedule start date'
                                        : `Click to set as Return Date (${dayNum})`
                                    }
                                    className={`relative flex flex-col justify-between p-3 rounded-xl border text-left transition-all w-[124px] sm:w-[136px] flex-shrink-0 cursor-pointer ${
                                      isStart || isReturn
                                        ? 'border-[#1a4fd6] bg-[#eff6ff] ring-2 ring-[#1a4fd6]/20 shadow-sm'
                                        : inSpan
                                          ? 'border-blue-200 bg-[#f0f7ff]'
                                          : isBusy
                                            ? 'border-red-200 bg-[#fff5f5] hover:border-red-400'
                                            : 'border-slate-200 bg-white hover:border-blue-400 hover:bg-[#f8faff]'
                                    }`}
                                  >
                                    <div>
                                      <div className="flex items-center justify-between gap-1 mb-1">
                                        <span className="text-[10px] font-bold text-[#64748b] tracking-wider uppercase">
                                          {dayShort}
                                        </span>
                                        {isStart ? (
                                          <span className="text-[9px] font-extrabold bg-[#1a4fd6] text-white px-1.5 py-0.5 rounded">
                                            START
                                          </span>
                                        ) : isReturn ? (
                                          <span className="text-[9px] font-extrabold bg-[#1a4fd6] text-white px-1.5 py-0.5 rounded">
                                            RETURN
                                          </span>
                                        ) : inSpan ? (
                                          <span className="text-[9px] font-bold text-[#1a4fd6] bg-blue-100/70 px-1 rounded">
                                            IN TRIP
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="text-xs font-bold text-[#152d5a]">
                                        {dayNum}
                                      </div>
                                    </div>

                                    <div className="mt-2.5 pt-2 border-t border-slate-100/80">
                                      {isBusy ? (
                                        <div className="space-y-1">
                                          {dayConfs.slice(0, 2).map((c, ci) => {
                                            const s12 = fmtTime(formatSydTime(c.start_time))
                                            const e12 = fmtTime(formatSydTime(c.end_time))
                                            return (
                                              <div
                                                key={ci}
                                                className="text-[9px] font-bold text-[#991b1b] bg-red-100/80 rounded px-1.5 py-0.5 truncate"
                                                title={`${c.label || 'Booked'}: ${s12} – ${e12}`}
                                              >
                                                {s12}–{e12}
                                              </div>
                                            )
                                          })}
                                          {dayConfs.length > 2 && (
                                            <span className="text-[9px] text-red-600 font-semibold">
                                              +{dayConfs.length - 2} more
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                          <span>Free All Day</span>
                                        </div>
                                      )}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* Booked Windows Summary Card */}
                          {multiDaySlots.length > 0 ? (
                            <div className="bg-[#fff1f2] border border-[#fecdd3] rounded-xl p-3.5 shadow-xs">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                  </span>
                                  <p className="text-xs font-bold text-[#991b1b] uppercase tracking-wider">
                                    Booked Windows in {monthName}
                                  </p>
                                </div>
                                <span className="text-[11px] font-semibold text-[#991b1b]">
                                  {multiDaySlots.length} {multiDaySlots.length === 1 ? 'reserved slot' : 'reserved slots'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {multiDaySlots.map((slot, i) => {
                                  const start12 = fmtTime(formatSydTime(slot.start_time))
                                  const end12 = fmtTime(formatSydTime(slot.end_time))
                                  const dateLabel = new Date(slot.start_time).toLocaleDateString('en-AU', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short',
                                    timeZone: 'Australia/Sydney',
                                  })
                                  return (
                                    <div
                                      key={`${slot.start_time}-${slot.end_time}-${i}`}
                                      className="inline-flex items-center gap-1.5 bg-white border border-[#fecdd3] rounded-lg px-3 py-1.5 text-xs text-[#991b1b] shadow-2xs"
                                    >
                                      <span className="material-symbols-outlined text-[13px] text-red-500">
                                        schedule
                                      </span>
                                      <span className="font-bold">{dateLabel}:</span>
                                      <span className="font-semibold tabular-nums">
                                        {start12} – {end12}
                                      </span>
                                      <span className="text-[10px] font-semibold text-[#be123c] bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                        {slot.label || 'Booked'}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-800 shadow-xs">
                              <span className="material-symbols-outlined text-base text-emerald-600 flex-shrink-0">
                                check_circle
                              </span>
                              <span>
                                The aircraft has no conflicting bookings across this entire month. All days are completely free!
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#f8fbff] border border-[#152d5a]/15 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#152d5a] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-[18px] sm:text-[20px]">flight</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <p className="text-[10px] sm:text-xs uppercase tracking-wider font-bold text-[#64748b] whitespace-nowrap">Current Flight</p>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 whitespace-nowrap">
                        Confirmed
                      </span>
                    </div>
                    <p className="text-sm font-bold text-[#152d5a] mt-0.5 truncate">
                      {booking.aircraft_name ?? 'Cessna 172N'} <span className="font-medium text-[#4b6390]">({booking.aircraft_registration ?? 'VH-KZG'})</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#4b6390] mt-1">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium">
                        <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                        <span>{booking.scheduled_start ? formatDateFromISO(booking.scheduled_start) : '—'}</span>
                      </span>
                      <span className="text-[#152d5a]/30 hidden sm:inline">·</span>
                      <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium">
                        <span className="material-symbols-outlined text-[13px]">schedule</span>
                        <span>
                          {booking.scheduled_start ? formatTime12hFromISO(booking.scheduled_start) : ''}
                          {booking.scheduled_end ? ` – ${formatTime12hFromISO(booking.scheduled_end)}` : ''}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-[#152d5a]/10 flex-shrink-0">
                  <p className="text-[10px] sm:text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Duration</p>
                  <p className="text-xs sm:text-sm font-bold text-[#152d5a] whitespace-nowrap">{formatDurationLabel(originalDurationMin)}</p>
                </div>
              </div>
            )}

            {isMultiDay && (
              <p className="text-[12.5px] sm:text-[13px] text-[#64748b] leading-relaxed">
                Select your new start date &amp; time and return date &amp; time. Intermediate days remain continuously reserved.
              </p>
            )}

            {/* Inputs Layout */}
            {isMultiDay ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748b] mb-1.5">
                    START DATE
                  </label>
                  <CalendarDateField
                    value={selectedDate}
                    onChange={(d) => {
                      setSelectedDate(d)
                      if (!selectedEndDate || selectedEndDate < d) {
                        setSelectedEndDate(d)
                      }
                      setFormError(null)
                    }}
                    minYear={new Date().getFullYear()}
                    maxYear={new Date().getFullYear() + 2}
                    minDate={minDate}
                    className="w-full bg-white border border-[#152d5a]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#152d5a] text-left flex items-center justify-between shadow-sm hover:border-[#152d5a]/40"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748b] mb-1.5">
                    START TIME
                  </label>
                  <TimeDropdown
                    value={selectedStartTime}
                    options={departureOptions}
                    onChange={handleStartTimeChange}
                    placeholder="Select departure"
                    defaultScrollTime={selectedStartTime || '10:00'}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748b] mb-1.5">
                    RETURN DATE
                  </label>
                  <CalendarDateField
                    value={selectedEndDate}
                    onChange={(d) => {
                      setSelectedEndDate(d)
                      setFormError(null)
                    }}
                    minYear={new Date().getFullYear()}
                    maxYear={new Date().getFullYear() + 2}
                    minDate={selectedDate || minDate}
                    className="w-full bg-white border border-[#152d5a]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#152d5a] text-left flex items-center justify-between shadow-sm hover:border-[#152d5a]/40"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748b] mb-1.5">
                    RETURN TIME
                  </label>
                  <TimeDropdown
                    value={selectedEndTime}
                    options={returnOptions}
                    onChange={handleEndTimeChange}
                    placeholder="Select return"
                    defaultScrollTime={selectedEndTime || '17:00'}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748b] mb-1.5">
                      New Flight Date
                    </label>
                    <CalendarDateField
                      value={selectedDate}
                      onChange={(d) => {
                        setSelectedDate(d)
                        setFormError(null)
                      }}
                      minYear={new Date().getFullYear()}
                      maxYear={new Date().getFullYear() + 2}
                      minDate={minDate}
                      className="w-full bg-white border border-[#152d5a]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#152d5a] text-left flex items-center justify-between shadow-sm hover:border-[#152d5a]/40"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748b] mb-1.5">
                      Flight Rules / Rating
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setNightVfrRating(false)
                          setFormError(null)
                        }}
                        className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all text-center ${
                          nightVfrRating === false
                            ? 'bg-[#dbeafe] border-[#93c5fd] text-[#152d5a] shadow-sm'
                            : 'bg-white border-[#152d5a]/20 text-[#64748b] hover:bg-[#f8fbff]'
                        }`}
                      >
                        Day VFR only
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNightVfrRating(true)
                          setFormError(null)
                        }}
                        className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all text-center ${
                          nightVfrRating === true
                            ? 'bg-[#dbeafe] border-[#93c5fd] text-[#152d5a] shadow-sm'
                            : 'bg-white border-[#152d5a]/20 text-[#64748b] hover:bg-[#f8fbff]'
                        }`}
                      >
                        Night VFR: Yes
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748b]">
                        Departure Time
                      </label>
                      {dayVfrWindow && (
                        <span className="text-[10px] text-[#1a4fd6] font-semibold">
                          Day VFR: {dayVfrWindow.start} – {dayVfrWindow.end}
                        </span>
                      )}
                    </div>
                    <TimeDropdown
                      value={selectedStartTime}
                      options={departureOptions}
                      onChange={handleStartTimeChange}
                      placeholder="Select departure time"
                      defaultScrollTime={selectedStartTime || '09:00'}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748b]">
                        Return Time
                      </label>
                      {currentDurationMin > 0 && (
                        <span className="text-[10px] font-semibold text-[#152d5a]">
                          Duration: {formatDurationLabel(currentDurationMin)}
                        </span>
                      )}
                    </div>
                    <TimeDropdown
                      value={selectedEndTime}
                      options={returnOptions}
                      onChange={handleEndTimeChange}
                      placeholder="Select return time"
                      defaultScrollTime={selectedEndTime || '10:00'}
                    />
                  </div>
                </div>

                {selectedDate && (
                  <div className="rounded-xl border border-[#152d5a]/10 bg-[#f8fbff] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#152d5a]">
                        Aircraft Availability ({selectedDate})
                      </p>
                      <span className="text-[10px] text-[#64748b]">Click or drag timeline to move slot</span>
                    </div>
                    <AvailabilityTimeline
                      selectedDate={selectedDate}
                      daySlots={daySlots}
                      loadingDaySlots={loadingDaySlots}
                      startDT={startDT}
                      endDT={endDT}
                      onTimeChange={handleStartTimeChange}
                      dayVfrWindow={dayVfrWindow}
                    />
                  </div>
                )}
              </>
            )}

            {/* Validation & Feedback Alerts */}
            {dayVfrError && !isMultiDay && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-amber-600 flex-shrink-0 mt-0.5">warning</span>
                <div>
                  <p className="font-semibold">{dayVfrError}</p>
                  <p className="mt-0.5 text-amber-800">Please choose a departure and return time within daylight hours or confirm Night VFR rating.</p>
                </div>
              </div>
            )}

            {availability.status === 'checking' && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-blue-600 animate-spin">progress_activity</span>
                <span>Verifying aircraft slot availability...</span>
              </div>
            )}

            {availability.status === 'available' && !dayVfrError && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
                <span className="font-semibold">This flight time slot is available! Your booking will be rescheduled immediately.</span>
              </div>
            )}

            {availability.status === 'unavailable' && (
              <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-900 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-red-600">error</span>
                  <span className="font-semibold">{availability.message}</span>
                </div>
                {availability.conflicts && availability.conflicts.length > 0 && (
                  <div className="pl-6 space-y-1">
                    {availability.conflicts.map((c, i) => (
                      <p key={i} className="text-[11px] text-red-800">
                        • Conflicting with {c.label || 'booking'}: {formatSydTime(c.start_time)} – {formatSydTime(c.end_time)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {formError && (
              <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-red-600">error</span>
                <span>{formError}</span>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 border-t border-[#152d5a]/10 flex items-center justify-end gap-3 flex-shrink-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 text-sm font-semibold text-[#4b6390] hover:text-[#152d5a] border border-[#152d5a]/20 hover:border-[#152d5a]/40 rounded-xl transition-colors disabled:opacity-50"
            >
              Keep current flight
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canSubmit}
              className="px-6 py-2.5 text-sm font-bold text-white bg-[#152d5a] hover:bg-[#1a3a6e] rounded-xl transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
              {submitting ? 'Updating...' : 'Confirm Reschedule'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Main FlightChangeActions Component ──────────────────────────────────────
export default function FlightChangeActions({
  booking,
  aircraftId,
  hasNightVfrRating,
  variant = 'default',
}: Props) {
  const router = useRouter()
  const isListCard = variant === 'listCard'
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false)
  const [rescheduleBlockedModalOpen, setRescheduleBlockedModalOpen] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [lateCancelModalOpen, setLateCancelModalOpen] = useState(false)
  const [lateCancelReason, setLateCancelReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const msUntilDeparture = new Date(booking.scheduled_start).getTime() - Date.now()
  const isWithin12Hours = msUntilDeparture < 12 * 60 * 60 * 1000
  const isWithin24Hours = msUntilDeparture <= 24 * 60 * 60 * 1000
  const canModify = ['confirmed', 'pending_confirmation', 'ready_for_dispatch'].includes(booking.status)
  const isMultiDayBooking = Boolean(
    booking.scheduled_start &&
    booking.scheduled_end &&
    !isSameSydneyCalendarDay(booking.scheduled_start, booking.scheduled_end)
  )

  const multiDayDurationDays = useMemo(() => {
    if (!booking.scheduled_start || !booking.scheduled_end) return 1
    const diffMs = new Date(booking.scheduled_end).getTime() - new Date(booking.scheduled_start).getTime()
    return Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)))
  }, [booking.scheduled_start, booking.scheduled_end])

  const originalDurationMin = useMemo(() => {
    if (!booking.scheduled_start || !booking.scheduled_end) return 60
    const diff = new Date(booking.scheduled_end).getTime() - new Date(booking.scheduled_start).getTime()
    return Math.max(15, Math.round(diff / 60_000))
  }, [booking.scheduled_start, booking.scheduled_end])

  const openRescheduleFlow = () => {
    setActionError(null)
    if (isWithin12Hours) {
      setRescheduleBlockedModalOpen(true)
    } else {
      setRescheduleModalOpen(true)
    }
  }

  const openCancelFlow = () => {
    setActionError(null)
    if (isWithin24Hours) {
      setLateCancelModalOpen(true)
    } else {
      setCancelModalOpen(true)
    }
  }

  const handleRescheduleSubmit = (data: { startDate: string; startTime: string; returnDate?: string; returnTime?: string }) => {
    startTransition(async () => {
      try {
        await rescheduleFlightBooking(booking.id, data)
        setRescheduleModalOpen(false)
        router.refresh()
      } catch (err: any) {
        setActionError(err?.message?.replace('VALIDATION: ', '')?.replace('AVAILABILITY: ', '') ?? 'Reschedule failed.')
      }
    })
  }

  const handleImmediateCancel = () => {
    startTransition(async () => {
      try {
        await cancelBookingNow(booking.id)
        setCancelModalOpen(false)
        router.refresh()
      } catch (err: any) {
        setActionError(err?.message?.replace('VALIDATION: ', '') ?? 'Cancellation failed.')
      }
    })
  }

  const handleLateCancelSubmit = () => {
    startTransition(async () => {
      try {
        await requestLateCancellation(booking.id, lateCancelReason.trim() || null)
        setLateCancelModalOpen(false)
        setLateCancelReason('')
        router.refresh()
      } catch (err: any) {
        setActionError(err?.message?.replace('VALIDATION: ', '') ?? 'Cancellation request failed.')
      }
    })
  }

  const modifyButtonClass = isListCard
    ? 'flex items-center justify-center whitespace-nowrap border border-[#152d5a]/20 text-[#152d5a] hover:bg-[#f0f6ff] disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-bold tracking-[0.06em] uppercase px-5 py-2.5 rounded-xl transition-colors w-full min-h-[40px]'
    : 'inline-flex items-center gap-2 px-6 py-3 bg-[#152d5a] hover:bg-[#1a3a6e] disabled:opacity-50 text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all'

  const cancelButtonClass = isListCard
    ? 'flex items-center justify-center whitespace-nowrap border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-bold tracking-[0.06em] uppercase px-5 py-2.5 rounded-xl transition-colors w-full min-h-[40px]'
    : 'inline-flex items-center gap-2 px-6 py-3 border border-rose-300 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-50 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all'

  return (
    <>
      {/* Reschedule Modal */}
      {rescheduleModalOpen && (
        <FlightRescheduleModal
          booking={booking}
          aircraftId={aircraftId}
          initialNightVfrRating={hasNightVfrRating}
          originalDurationMin={originalDurationMin}
          submitting={isPending}
          onClose={() => setRescheduleModalOpen(false)}
          onSubmit={handleRescheduleSubmit}
        />
      )}

      {/* Reschedule Blocked (<12h) Modal */}
      {rescheduleBlockedModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#152d5a]/10 flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#152d5a]">Manual approval required</h3>
                <button
                  onClick={() => setRescheduleBlockedModalOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748b] hover:text-[#152d5a] hover:bg-[#f0f6ff] transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
              <div className="px-6 py-5 space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[18px]">lock_clock</span>
                  </div>
                  <p className="text-xs font-semibold text-amber-900">
                    Direct rescheduling is locked within 12 hours of departure.
                  </p>
                </div>
                <p className="text-sm text-[#4b6390] leading-relaxed">
                  Your flight is scheduled less than 12 hours from now.
                </p>
                <p className="text-sm text-[#4b6390] leading-relaxed">
                  To reschedule at this stage, please contact OZ Rent A Plane directly so operations can assist you with your schedule change.
                </p>
                <p className="text-sm text-[#152d5a] font-medium pt-1">
                  Call:{' '}
                  <a href={`tel:${ADMIN_CONTACT_PHONE_TEL}`} className="text-[#1a4fd6] hover:text-[#1540a8] underline underline-offset-2 font-bold">
                    {ADMIN_CONTACT_PHONE_DISPLAY}
                  </a>
                </p>
              </div>
              <div className="px-6 py-4 border-t border-[#152d5a]/10 flex justify-end">
                <button
                  onClick={() => setRescheduleBlockedModalOpen(false)}
                  className="px-5 py-2 text-sm font-semibold text-[#4b6390] hover:text-[#152d5a] border border-[#152d5a]/20 rounded-xl"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Immediate Cancel Modal (>24h) */}
      {cancelModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#152d5a]/10">
                <h3 className="text-lg font-bold text-[#152d5a]">Cancel flight booking?</h3>
              </div>
              <div className="px-6 py-5 space-y-4">
                {/* Flight Details Card */}
                <div className="bg-[#f8fbff] border border-[#152d5a]/15 rounded-xl p-3.5 sm:p-4 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#152d5a] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                      <span className="material-symbols-outlined text-[18px]">flight</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#152d5a] truncate">
                        {booking.aircraft_name ?? 'Cessna 172N'} <span className="font-medium text-[#4b6390]">({booking.aircraft_registration ?? 'VH-KZG'})</span>
                      </p>
                      {isMultiDayBooking ? (
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#4b6390] mt-0.5">
                          <span className="whitespace-nowrap font-medium">
                            {booking.scheduled_start ? formatDateFromISO(booking.scheduled_start) : ''}, {booking.scheduled_start ? formatTime12hFromISO(booking.scheduled_start) : ''}
                          </span>
                          <span className="text-[#152d5a]/40 font-medium">→</span>
                          <span className="whitespace-nowrap font-medium">
                            {booking.scheduled_end ? formatDateFromISO(booking.scheduled_end) : ''}, {booking.scheduled_end ? formatTime12hFromISO(booking.scheduled_end) : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#4b6390] mt-0.5">
                          <span className="whitespace-nowrap font-medium">{booking.scheduled_start ? formatDateFromISO(booking.scheduled_start) : ''}</span>
                          <span className="text-[#152d5a]/30 hidden sm:inline">·</span>
                          <span className="whitespace-nowrap font-medium">
                            {booking.scheduled_start ? formatTime12hFromISO(booking.scheduled_start) : ''}
                            {booking.scheduled_end ? ` – ${formatTime12hFromISO(booking.scheduled_end)}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="inline-block whitespace-nowrap text-xs font-bold text-[#152d5a] bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                      {isMultiDayBooking ? `${multiDayDurationDays} ${multiDayDurationDays === 1 ? 'day' : 'days'}` : `${originalDurationMin} min`}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-[#4b6390] leading-relaxed">
                  Your booking will be cancelled and your aircraft reservation released without charge because departure is more than 24 hours away.
                </p>
                {actionError && <p className="text-sm text-red-600">{actionError}</p>}
              </div>
              <div className="px-6 py-4 border-t border-[#152d5a]/10 flex justify-end gap-3 bg-white">
                <button
                  onClick={() => setCancelModalOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-semibold text-[#4b6390] hover:text-[#152d5a] border border-[#152d5a]/20 rounded-xl"
                >
                  Keep flight
                </button>
                <button
                  onClick={handleImmediateCancel}
                  disabled={isPending}
                  className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {isPending ? 'Cancelling...' : 'Cancel flight'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Late Cancel Modal (<=24h) */}
      {lateCancelModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#152d5a]/10">
                <h3 className="text-lg font-bold text-[#152d5a]">Request flight cancellation?</h3>
              </div>
              <div className="px-6 py-5 space-y-4">
                {/* Flight Details Card */}
                <div className="bg-[#fffbeb] border border-amber-200 rounded-xl p-3.5 sm:p-4 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                      <span className="material-symbols-outlined text-[18px]">flight</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#152d5a] truncate">
                        {booking.aircraft_name ?? 'Cessna 172N'} <span className="font-medium text-[#4b6390]">({booking.aircraft_registration ?? 'VH-KZG'})</span>
                      </p>
                      {isMultiDayBooking ? (
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#4b6390] mt-0.5">
                          <span className="whitespace-nowrap font-medium">
                            {booking.scheduled_start ? formatDateFromISO(booking.scheduled_start) : ''}, {booking.scheduled_start ? formatTime12hFromISO(booking.scheduled_start) : ''}
                          </span>
                          <span className="text-[#152d5a]/40 font-medium">→</span>
                          <span className="whitespace-nowrap font-medium">
                            {booking.scheduled_end ? formatDateFromISO(booking.scheduled_end) : ''}, {booking.scheduled_end ? formatTime12hFromISO(booking.scheduled_end) : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#4b6390] mt-0.5">
                          <span className="whitespace-nowrap font-medium">{booking.scheduled_start ? formatDateFromISO(booking.scheduled_start) : ''}</span>
                          <span className="text-[#152d5a]/30 hidden sm:inline">·</span>
                          <span className="whitespace-nowrap font-medium">
                            {booking.scheduled_start ? formatTime12hFromISO(booking.scheduled_start) : ''}
                            {booking.scheduled_end ? ` – ${formatTime12hFromISO(booking.scheduled_end)}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="inline-block whitespace-nowrap text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-lg">
                      {isMultiDayBooking ? `${multiDayDurationDays} ${multiDayDurationDays === 1 ? 'day' : 'days'}` : `${originalDurationMin} min`}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-[#4b6390] leading-relaxed">
                  This flight is scheduled within 24 hours. A late cancellation request will be submitted for operations team review.
                </p>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748b] mb-2">
                    Reason for cancellation
                  </label>
                  <textarea
                    rows={3}
                    value={lateCancelReason}
                    onChange={(e) => setLateCancelReason(e.target.value)}
                    disabled={isPending}
                    placeholder="Add a short note for the operations team..."
                    className="w-full px-4 py-3 bg-white border border-[#152d5a]/20 focus:border-[#1a4fd6] focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/20 rounded-xl text-[#152d5a] text-sm placeholder:text-[#94a3b8] transition-colors resize-none leading-relaxed"
                  />
                </div>
                {actionError && <p className="text-sm text-red-600">{actionError}</p>}
              </div>
              <div className="px-6 py-4 border-t border-[#152d5a]/10 flex justify-end gap-3 bg-white">
                <button
                  onClick={() => {
                    setLateCancelModalOpen(false)
                    setLateCancelReason('')
                  }}
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-semibold text-[#4b6390] hover:text-[#152d5a] border border-[#152d5a]/20 rounded-xl"
                >
                  Keep flight
                </button>
                <button
                  onClick={handleLateCancelSubmit}
                  disabled={isPending}
                  className="px-5 py-2 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {isPending ? 'Submitting...' : 'Submit cancellation request'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {actionError && !rescheduleModalOpen && !cancelModalOpen && !lateCancelModalOpen && (
        <p className="text-xs text-red-600">{actionError}</p>
      )}

      {canModify && (
        <div className={isListCard ? 'flex flex-col gap-2 w-full' : 'flex flex-wrap items-center gap-3'}>
          <button
            type="button"
            onClick={openRescheduleFlow}
            disabled={isPending}
            className={modifyButtonClass}
          >
            Reschedule flight
          </button>
          <button
            type="button"
            onClick={openCancelFlow}
            disabled={isPending}
            className={cancelButtonClass}
          >
            Cancel flight
          </button>
        </div>
      )}
    </>
  )
}
