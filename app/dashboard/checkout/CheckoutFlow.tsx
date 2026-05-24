'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  submitCheckoutRequest,
} from '@/app/actions/checkout'
import {
  checkCustomerAvailability,
  getDayAvailability,
  type SafeConflict,
} from '@/app/actions/customer-availability'
import { uploadVerificationDocument } from '@/app/actions/upload'
import { getDocumentSignedUrl, saveCheckoutRedCardDetails } from '@/app/actions/documents'
import { sydneyInputToUTC, formatSydTime } from '@/lib/utils/sydney-time'
import { getDayVfrWindow, isWithinDayVfrWindow } from '@/lib/utils/day-vfr'
import { validateFlightReviewDate, getFlightReviewCutoff } from '@/lib/utils/flight-review'
import { formatDate, formatDateTime } from '@/lib/formatDateTime'
import type { UserDocument, DocumentType } from '@/lib/supabase/types'
import type { CheckoutBookingResult } from '@/lib/supabase/booking-types'
import {
  TERMS_END_TEXT,
  TERMS_LAST_UPDATED,
  TERMS_MODAL_SUBTITLE,
  TERMS_MODAL_TITLE,
  TERMS_NOTICE,
  TERMS_SECTIONS,
} from '@/lib/checkout-terms-content'
import CalendarDateField from '@/components/CalendarDateField'
import ModalPortal from '@/components/ModalPortal'
import CheckoutChangeActions from './CheckoutChangeActions'

// ── Types ──────────────────────────────────────────────────────────────────────

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; message: string }

type Step = 'time' | 'documents' | 'review' | 'success'

type Props = {
  firstName:               string
  aircraftId:               string
  aircraftRegistration:     string
  aircraftDisplayName:      string
  aircraftStatus:           string
  documents:                UserDocument[]
  pilotClearanceStatus:     string
  journeyActiveIndex:       number
  journeyCompletedMap:      Record<string, boolean>
  initialLastFlightDate:    string
  initialNightVfrRating:    boolean | null
  initialInstrumentRating:  boolean | null
  activeCheckoutTerms: {
    id: string
    version: string
    public_url: string
    content_hash: string | null
  }
  activeCheckoutBooking: {
    id: string
    status: string
    booking_type: string
    scheduled_start: string
    scheduled_end: string
    checkout_lifecycle_status: string | null
  } | null
  pendingRescheduleRequest: {
    id: string
    status: string
    requested_scheduled_start: string | null
    requested_scheduled_end: string | null
  } | null
}

function canModifyCheckoutUi(checkout: {
  booking_type?: string | null
  status?: string | null
  scheduled_start?: string | null
  checkout_lifecycle_status?: string | null
}) {
  if (!checkout || checkout.booking_type !== 'checkout') return false
  if (!checkout.status || !['checkout_requested', 'checkout_confirmed'].includes(checkout.status)) return false
  if (!checkout.scheduled_start || new Date(checkout.scheduled_start) <= new Date()) return false
  if (['cancelled_by_customer', 'cancelled_by_admin', 'completed'].includes(checkout.checkout_lifecycle_status ?? '')) return false
  return true
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Reference rate for display only — actual amount is set by team after the flight
const CHECKOUT_RATE = 290
const DEFAULT_CHECKOUT_START_TIME = '09:00'

const ALL_TIME_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value  = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const period = h < 12 ? 'AM' : 'PM'
      const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h
      opts.push({ value, label: `${h12}:${String(m).padStart(2, '0')} ${period}` })
    }
  }
  return opts
})()
// Returns an HH:MM string that is 2 hours after the given HH:MM, clamped to 22:00.
function addTwoHours(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const totalMin = (h! * 60 + m!) + 120
  const newH = Math.min(23, Math.floor(totalMin / 60))
  const newM = totalMin % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

// Returns today's date in Sydney time as YYYY-MM-DD (used for min date and default date).
function getSydneyToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

// Returns the next 15-min slot at least 15 minutes from now in Sydney time.
// Falls back to 09:00 if it's late in the day and nothing fits.
function getDefaultStartTime(): string {
  const t    = new Date().toLocaleTimeString('en-GB', { timeZone: 'Australia/Sydney', hour12: false })
  const [hStr, mStr] = t.split(':')
  const h    = Math.min(parseInt(hStr ?? '0', 10), 23)
  const m    = parseInt(mStr ?? '0', 10)
  const totalMins  = h * 60 + m + 15          // +15 min buffer from now
  const snapped    = Math.ceil(totalMins / 15) * 15
  const clamped    = Math.min(snapped, 22 * 60) // latest 22:00 so end (2h) = 24:00
  const nh = Math.floor(clamped / 60)
  const nm = clamped % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

// Min selectable date is today in Sydney time (past times are blocked by validation).
function minDateString(): string {
  return getSydneyToday()
}

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function mapCheckoutSubmitError(message: string): string {
  const cleaned = message.replace(/^VALIDATION:\s*/i, '').replace(/^AVAILABILITY:\s*/i, '')
  const lower = cleaned.toLowerCase()

  if (lower.includes('last flight review date')) {
    return 'Please enter your last flight review date before submitting your checkout request.'
  }
  if (lower.includes('night vfr')) {
    return 'Please confirm your Night VFR rating status before submitting your checkout request.'
  }
  if (lower.includes('instrument rating')) {
    return 'Please confirm your Instrument Rating status before submitting your checkout request.'
  }
  if (lower.includes('terms acceptance details were not submitted') || lower.includes('you must accept the checkout terms')) {
    return 'Please review and accept the latest checkout terms before submitting.'
  }
  if (lower.includes('terms and conditions were updated')) {
    return 'Please review and accept the latest checkout terms before submitting.'
  }
  if (lower.includes('no active checkout terms document')) {
    return 'Checkout terms are temporarily unavailable. Please refresh and try again.'
  }
  if (lower.includes('unable to record your terms acceptance')) {
    return 'Your checkout request was created but we could not record your terms acceptance. Please contact support.'
  }
  if (
    lower.includes('no longer available') ||
    lower.includes('not available') ||
    lower.includes('schedule block') ||
    lower.includes('aircraft not found') ||
    lower.includes('checkout flight time must be in the future') ||
    lower.includes('checkout start time must be in the future') ||
    lower.includes('invalid server response')
  ) {
    return 'This checkout slot is no longer available. Please choose another date or time.'
  }
  if (lower.includes('current status does not allow submitting a checkout request') || lower.includes('already have an active checkout booking')) {
    return 'You already have an active checkout request or your account is not currently eligible to submit a new one. Please contact support if you believe this is an error.'
  }
  if (lower.includes('unable to verify your documents')) {
    return 'We could not verify your uploaded documents. Please try again, or contact support if the issue persists.'
  }

  return cleaned
}

// Converts "HH:MM" to total minutes from midnight.
function timeStrToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

// ── Step indicator ─────────────────────────────────────────────────────────────

// Replaced with shared reusable component in components/customer/RunwayJourney.tsx

// ── Availability timeline ──────────────────────────────────────────────────────

function AvailabilityTimeline({
  selectedDate,
  daySlots,
  startDT,
  endDT,
  onTimeChange,
  dayVfrWindow,
}: {
  selectedDate:   string
  daySlots:       SafeConflict[]
  startDT:        string
  endDT:          string
  onTimeChange?:  (newTime: string) => void
  dayVfrWindow?:  { start: string; end: string } | null
}) {
  if (!selectedDate) return null

  const opStartUTC = sydneyInputToUTC(`${selectedDate}T00:00`)
  const opEndUTC   = sydneyInputToUTC(`${addOneDay(selectedDate)}T00:00`)
  if (!opStartUTC || !opEndUTC) return null

  const opStartMs = new Date(opStartUTC).getTime()
  const opEndMs   = new Date(opEndUTC).getTime()
  const totalMs   = opEndMs - opStartMs

  function toPercent(isoUTC: string): number {
    const t = new Date(isoUTC).getTime()
    return Math.max(0, Math.min(100, ((t - opStartMs) / totalMs) * 100))
  }

  const selStartUTC = sydneyInputToUTC(startDT)
  const selEndUTC   = sydneyInputToUTC(endDT)
  const hasSelection = !!(selStartUTC && selEndUTC && new Date(selEndUTC) > new Date(selStartUTC))

  const visibleSlots = daySlots.filter(s => {
    return new Date(s.end_time).getTime() > opStartMs && new Date(s.start_time).getTime() < opEndMs
  })

  const majorTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24]
  function hourLabel(h: number): string {
    if (h === 0 || h === 24) return '12AM'
    if (h === 12) return '12PM'
    return h < 12 ? `${h}AM` : `${h - 12}PM`
  }

  const selLeft  = hasSelection ? toPercent(selStartUTC!) : 0
  const selRight = hasSelection ? 100 - toPercent(selEndUTC!) : 0

  // ── Drag (Pointer Events — works on mouse + touch + stylus) ─────────────────
  // touch-action:none on the draggable element tells the browser to hand
  // pointer control to JS, preventing accidental page scroll during drag.
  // pointerId filtering handles multi-touch correctly.
  const barContainerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  function handlePointerDown(e: React.PointerEvent) {
    if (!hasSelection || !onTimeChange) return
    e.preventDefault()
    const rect = barContainerRef.current?.getBoundingClientRect()
    if (!rect) return

    // Capture in a local const so nested closures can call it without undefined checks
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
      const deltaMins   = (deltaPixels / containerWidth) * 24 * 60
      const rawMinutes  = startMinutes + deltaMins
      // Snap to 15-minute increments, clamp so 2-hr block stays within the day
      const snappedMinutes = Math.round(rawMinutes / 15) * 15
      const minClamp = dayVfrWindow ? timeStrToMin(dayVfrWindow.start) : 0
      const maxClamp = dayVfrWindow ? timeStrToMin(dayVfrWindow.end) - 120 : 22 * 60
      const clamped  = Math.max(minClamp, Math.min(maxClamp, snappedMinutes))
      const h   = Math.floor(clamped / 60)
      const m   = clamped % 60
      const newTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      if (newTime !== lastSnapped) {
        lastSnapped = newTime
        notifyTimeChange(newTime)
      }
    }

    function onEnd(ev: PointerEvent) {
      if (ev.pointerId !== capturedId) return
      setIsDragging(false)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup',   onEnd)
      document.removeEventListener('pointercancel', onEnd)
    }

    document.addEventListener('pointermove',   onMove)
    document.addEventListener('pointerup',     onEnd)
    document.addEventListener('pointercancel', onEnd)
  }

  return (
    <div className="space-y-3">
      <div className="relative" ref={barContainerRef}>
        <div className={`relative h-10 rounded-lg overflow-hidden border ${dayVfrWindow ? 'bg-[#0a1628] border-white/15' : 'bg-green-500/15 border-green-500/10'}`}>
          {/* Day VFR window zones — only rendered when Night VFR = No */}
          {dayVfrWindow && (
            <>
              {/* Pre-dawn restricted */}
              <div
                className="absolute top-0 bottom-0 bg-slate-800/60 flex items-center justify-center overflow-hidden"
                style={{ left: '0%', right: `${100 - (timeStrToMin(dayVfrWindow.start) / (24 * 60)) * 100}%` }}
              >
                <span className="text-[8px] text-slate-600 select-none leading-none">🌙</span>
              </div>
              {/* Allowed Day VFR window — green */}
              <div
                className="absolute top-0 bottom-0 bg-green-500/15"
                style={{
                  left:  `${(timeStrToMin(dayVfrWindow.start) / (24 * 60)) * 100}%`,
                  right: `${100 - (timeStrToMin(dayVfrWindow.end) / (24 * 60)) * 100}%`,
                }}
              />
              {/* Post-dusk restricted */}
              <div
                className="absolute top-0 bottom-0 bg-slate-800/60 flex items-center justify-center overflow-hidden"
                style={{ left: `${(timeStrToMin(dayVfrWindow.end) / (24 * 60)) * 100}%`, right: '0%' }}
              >
                <span className="text-[8px] text-slate-600 select-none leading-none">🌙</span>
              </div>
            </>
          )}
          {/* Booked conflict overlays */}
          {visibleSlots.map((slot, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 bg-red-500/60"
              style={{ left: `${toPercent(slot.start_time)}%`, right: `${100 - toPercent(slot.end_time)}%` }}
              title={slot.label}
            />
          ))}
        </div>
        {hasSelection && (
          <div
            onPointerDown={handlePointerDown}
            className={`absolute inset-y-[-2px] rounded-lg border-2 border-blue-400/80 bg-blue-500/15 flex items-center justify-center transition-colors ${
              onTimeChange
                ? isDragging
                  ? 'cursor-grabbing bg-blue-500/20 border-blue-400'
                  : 'cursor-grab hover:bg-blue-500/20 hover:border-blue-400'
                : 'pointer-events-none'
            }`}
            style={{
              left:        `${selLeft}%`,
              right:       `${selRight}%`,
              touchAction: onTimeChange ? 'none' : undefined, // prevents scroll hijack while dragging
            }}
            title={onTimeChange ? 'Drag to move selected time' : undefined}
          >
            {onTimeChange && (
              <div className="flex items-center gap-[3px] pointer-events-none select-none opacity-60">
                <div className="w-px h-3.5 bg-blue-300 rounded-full" />
                <div className="w-px h-3.5 bg-blue-300 rounded-full" />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="relative h-4">
        {majorTicks.map(h => (
          <span
            key={h}
            className="absolute text-[9px] font-medium text-slate-600 -translate-x-1/2 select-none leading-none uppercase"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {hourLabel(h)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-5 pt-1">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-600">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500/40 inline-block" />{dayVfrWindow ? `Day VFR (${dayVfrWindow.start}–${dayVfrWindow.end})` : 'Available'}
        </span>
        {dayVfrWindow && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-700 border border-white/15 inline-block" />Night restricted
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-600">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500/60 inline-block" />Booked
        </span>
        {hasSelection && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm border-2 border-blue-400/80 inline-block" />
            {onTimeChange ? 'Selected time — drag to move' : 'Selected time'}
          </span>
        )}
        {hasSelection && onTimeChange && (
          <span className="text-[10px] text-slate-600 pl-1">· Fixed at 2 hours</span>
        )}
      </div>
    </div>
  )
}

// ── Custom time dropdown ───────────────────────────────────────────────────────
// Replaces native <select> to ensure dark-theme consistency across browsers.

function TimeDropdown({
  value,
  options,
  onChange,
  disabled,
}: {
  value:    string
  options:  { value: string; label: string }[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef    = useRef<HTMLDivElement>(null)
  const listRef         = useRef<HTMLDivElement>(null)

  // Close on outside click
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

  // Scroll selected option into view when opened
  useEffect(() => {
    if (!open || !listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]') as HTMLElement | null
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
      return
    }
    // When nothing is selected yet, start the list around 9:00 AM.
    const defaultStart = listRef.current.querySelector('[data-default-start="true"]') as HTMLElement | null
    defaultStart?.scrollIntoView({ block: 'center' })
  }, [open])

  const selectedLabel = options.find(o => o.value === value)?.label ?? value

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/60 flex items-center justify-between transition-colors hover:border-white/25 disabled:opacity-40 disabled:cursor-not-allowed text-white"
      >
        <span className={value === '' ? 'text-slate-500' : ''}>{value === '' ? 'Select departure time' : selectedLabel}</span>
        <span
          className={`material-symbols-outlined text-[18px] text-slate-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          style={{ fontVariationSettings: "'wght' 300" }}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[#0c1220] border border-white/10 rounded-lg shadow-2xl overflow-hidden">
          <div ref={listRef} className="max-h-52 overflow-y-auto overscroll-contain">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                data-selected={o.value === value ? 'true' : undefined}
                data-default-start={o.value === DEFAULT_CHECKOUT_START_TIME ? 'true' : undefined}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                  o.value === value
                    ? 'bg-blue-500/20 text-blue-200 font-medium'
                    : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CheckoutRescheduleModal({
  aircraftId,
  onClose,
  onSubmit,
  submitting,
}: {
  aircraftId: string
  onClose: () => void
  onSubmit: (date: string, time: string) => void
  submitting: boolean
}) {
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [daySlots, setDaySlots] = useState<SafeConflict[]>([])
  const [avail, setAvail] = useState<AvailabilityState>({ status: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [nightVfrRating, setNightVfrRating] = useState<boolean | null>(null)

  const endTime = (date && startTime) ? addTwoHours(startTime) : ''
  const startDT = date && startTime ? `${date}T${startTime}` : ''
  const endDT = date && endTime ? `${date}T${endTime}` : ''
  const startUTC = startDT ? sydneyInputToUTC(startDT) : null
  const endUTC = endDT ? sydneyInputToUTC(endDT) : null
  const dayVfrWindow = (date && nightVfrRating === false) ? getDayVfrWindow(date) : null
  const timeOptions = (date && nightVfrRating === false)
    ? ALL_TIME_OPTIONS.filter(o => isWithinDayVfrWindow(o.value, date, 120))
    : ALL_TIME_OPTIONS
  const nightVfrTimeError =
    nightVfrRating === false && startTime && date && !isWithinDayVfrWindow(startTime, date, 120)
      ? 'Selected time is outside the Day VFR window for a 2-hour checkout.'
      : null

  useEffect(() => {
    if (!date) { setDaySlots([]); return }
    getDayAvailability(aircraftId, date)
      .then(r => setDaySlots(r ?? []))
      .catch(() => setDaySlots([]))
  }, [date, aircraftId])

  useEffect(() => {
    if (!startUTC || !endUTC || new Date(endUTC) <= new Date(startUTC)) {
      setAvail({ status: 'idle' }); return
    }
    if (new Date(startUTC) <= new Date()) {
      setAvail({ status: 'unavailable', message: 'Please select a future checkout time.' })
      return
    }
    setAvail({ status: 'checking' })
    const t = setTimeout(() => {
      checkCustomerAvailability(aircraftId, startUTC, endUTC, 'checkout')
        .then(r => {
          if (r.available) setAvail({ status: 'available' })
          else setAvail({ status: 'unavailable', message: 'This time slot is not available.' })
        })
        .catch(() => setAvail({ status: 'idle' }))
    }, 500)
    return () => clearTimeout(t)
  }, [startUTC, endUTC, aircraftId])

  function handleSubmit() {
    setError(null)
    if (!date) return setError('Please select a date.')
    if (nightVfrRating === null) return setError('Please confirm your Night VFR rating status.')
    if (!startTime) return setError('Please select a departure time.')
    if (nightVfrTimeError) return setError(nightVfrTimeError)
    if (avail.status !== 'available') return setError('Please select an available time slot.')
    onSubmit(date, startTime)
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[1000] flex items-start justify-center p-4 pt-24 md:pt-28 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[calc(100vh-7.5rem)] bg-[#13243a] border border-[#4c6b8f] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <p className="text-xs uppercase tracking-widest text-blue-200 font-bold">Checkout change request</p>
            <h3 className="text-lg font-semibold text-white">Request checkout reschedule</h3>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        <div className="px-5 py-5 space-y-4 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-2">Checkout date</p>
              <CalendarDateField
                value={date}
                onChange={(next) => { setDate(next); setStartTime(''); setError(null) }}
                minYear={new Date().getFullYear()}
                maxYear={new Date().getFullYear() + 2}
                minDate={minDateString()}
                className="w-full h-11 bg-[#0b1a2f] border border-white/20 rounded-xl px-4 py-3 text-base text-white text-left flex items-center justify-between"
              />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-2">Departure time</p>
              <TimeDropdown value={startTime} options={timeOptions} onChange={(v) => { setStartTime(v); setError(null) }} />
            </div>
          </div>

          {date && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([true, false] as const).map(val => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setNightVfrRating(val)}
                  className={`px-4 py-3 rounded-xl border text-left transition-all ${
                    nightVfrRating === val
                      ? 'bg-blue-500/[0.18] border-blue-400/55 text-blue-100'
                      : 'bg-[#0d1c33] border-white/[0.12] text-slate-300'
                  }`}
                >
                  {val ? 'Night VFR: Yes' : 'Night VFR: No (Day VFR only)'}
                </button>
              ))}
            </div>
          )}

          {date && (
            <div className="rounded-xl border border-white/10 bg-[#0d1a2c]/70 p-4">
              <AvailabilityTimeline
                selectedDate={date}
                daySlots={daySlots}
                startDT={startDT}
                endDT={endDT}
                onTimeChange={(v) => setStartTime(v)}
                dayVfrWindow={dayVfrWindow}
              />
            </div>
          )}
          {nightVfrTimeError && <p className="text-sm text-amber-300">{nightVfrTimeError}</p>}
          {avail.status === 'checking' && <p className="text-sm text-slate-400">Checking availability…</p>}
          {avail.status === 'unavailable' && <p className="text-sm text-red-300">{avail.message}</p>}
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-white/[0.06] flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-300 border border-white/15 rounded-lg">Keep current time</button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40"
          >
            {submitting ? 'Sending…' : 'Send reschedule request'}
          </button>
        </div>
      </div>
      </div>
    </ModalPortal>
  )
}

// ── Document card + modal pattern ─────────────────────────────────────────────
// Shows a clean status card for each document.
// Upload/Replace opens a modal overlay with the required fields.
// On success, refreshes server data via router.refresh() without losing time state.

const MAX_DOC_SIZE  = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

type DocCardDef = {
  type:  DocumentType
  label: string
  icon:  string
}

const DOC_DEFS: DocCardDef[] = [
  { type: 'pilot_licence',       label: 'Pilot Licence',       icon: 'badge'             },
  { type: 'medical_certificate', label: 'Medical Certificate', icon: 'health_and_safety' },
  { type: 'photo_id',            label: 'Photo ID',            icon: 'id_card'           },
]

function pickBestDocumentForType(
  docs: UserDocument[],
  type: DocumentType,
  todayIso: string,
): UserDocument | undefined {
  const candidates = docs.filter((d) => d.document_type === type)
  if (candidates.length === 0) return undefined

  function score(d: UserDocument): number {
    const rejected = d.status === 'rejected'
    const expired = !!(d.expiry_date && d.expiry_date < todayIso)
    if (!rejected && !expired) return 3
    if (!rejected && expired) return 2
    if (rejected && !expired) return 1
    return 0
  }

  return [...candidates].sort((a, b) => {
    const scoreDiff = score(b) - score(a)
    if (scoreDiff !== 0) return scoreDiff
    const aTime = new Date(a.uploaded_at ?? 0).getTime()
    const bTime = new Date(b.uploaded_at ?? 0).getTime()
    return bTime - aTime
  })[0]
}

// ── Document upload modal ──────────────────────────────────────────────────────

function DocModal({
  def,
  doc,
  onClose,
  onSuccess,
  onUploadStart,
  onUploadEnd,
  initialNightVfrRating,
  initialInstrumentRating,
}: {
  def:                     DocCardDef
  doc:                     UserDocument | undefined
  onClose:                 () => void
  onSuccess:               () => void
  onUploadStart?:          () => void
  onUploadEnd?:            () => void
  initialNightVfrRating?:  boolean | null
  initialInstrumentRating?: boolean | null
}) {
  const isReplace = !!doc

  // Field state pre-filled from existing doc / profile
  const [licenceType,        setLicenceType]        = useState(doc?.licence_type    ?? '')
  const [licenceNumber,      setLicenceNumber]       = useState(doc?.licence_number  ?? '')
  const [nightVfrRating,     setNightVfrRating]      = useState<boolean | null>(initialNightVfrRating ?? null)
  const [instrumentRating,   setInstrumentRating]    = useState<boolean | null>(initialInstrumentRating ?? null)
  const [medicalClass,       setMedicalClass]        = useState(doc?.medical_class   ?? '')
  const [issueDate,          setIssueDate]           = useState(doc?.issue_date      ?? '')
  const [expiryDate,         setExpiryDate]          = useState(doc?.expiry_date     ?? '')
  const [idType,             setIdType]              = useState(doc?.id_type         ?? '')
  const [documentNumber,     setDocumentNumber]      = useState(doc?.document_number ?? '')
  const [uploading,    setUploading]    = useState(false)
  const [fileResults,  setFileResults]  = useState<{ name: string; ok: boolean; msg?: string }[]>([])
  const [formError,    setFormError]    = useState<string | null>(null)
  const [dragOver,     setDragOver]     = useState(false)

  useEffect(() => { setFormError(null) }, [licenceType, licenceNumber, nightVfrRating, instrumentRating, medicalClass, issueDate, expiryDate, idType, documentNumber])

  function Pill({ value, active, onClick }: { value: string; active: boolean; onClick: () => void }) {
    return (
      <button type="button" onClick={onClick}
        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all text-left ${
          active ? 'bg-blue-500/15 border-blue-400/50 text-blue-100' : 'bg-white/[0.03] border-white/20 text-slate-200 hover:text-white'
        }`}
      >{value}</button>
    )
  }

  function validateMeta(): string | null {
    if (def.type === 'pilot_licence') {
      if (!licenceType)              return 'Please select a licence type.'
      if (instrumentRating === null) return 'Please confirm your Instrument Rating status.'
      if (!licenceNumber)            return 'Please enter your pilot licence number / ARN.'
    }
    if (def.type === 'medical_certificate') {
      if (!medicalClass) return 'Please select a medical class.'
      if (!issueDate)    return 'Please enter the date of issue (DD/MM/YYYY).'
      if (!expiryDate)   return 'Please enter the expiry date (DD/MM/YYYY).'
    }
    if (def.type === 'photo_id') {
      if (!idType)         return 'Please select an ID type.'
      if (!documentNumber) return 'Please enter your document number.'
    }
    return null
  }

  async function uploadFiles(files: File[]) {
    setFormError(null)
    const metaErr = validateMeta()
    if (metaErr) { setFormError(metaErr); return }

    const results: { name: string; ok: boolean; msg?: string }[] = []
    onUploadStart?.()
    setUploading(true)
    try {
      for (const file of files) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          results.push({ name: file.name, ok: false, msg: 'Not PDF/JPG/PNG' })
          continue
        }
        if (file.size > MAX_DOC_SIZE) {
          results.push({ name: file.name, ok: false, msg: 'Over 10 MB' })
          continue
        }
        try {
          const fd = new FormData()
          fd.append('file',    file)
          fd.append('docType', def.type)
          if (licenceType)               fd.append('licenceType',      licenceType)
          if (nightVfrRating !== null)   fd.append('nightVfrRating',   String(nightVfrRating))
          if (instrumentRating !== null) fd.append('instrumentRating', String(instrumentRating))
          if (licenceNumber)             fd.append('licenceNumber',    licenceNumber)
          if (medicalClass)              fd.append('medicalClass',     medicalClass)
          if (issueDate)                 fd.append('issueDate',        issueDate)
          if (expiryDate)                fd.append('expiryDate',       expiryDate)
          if (idType)                    fd.append('idType',           idType)
          if (documentNumber)            fd.append('documentNumber',   documentNumber)
          await uploadVerificationDocument(fd)
          results.push({ name: file.name, ok: true })
        } catch (err) {
          results.push({ name: file.name, ok: false, msg: err instanceof Error ? err.message : 'Upload failed' })
        }
      }
    } finally {
      setUploading(false)
      onUploadEnd?.()
    }
    setFileResults(results)
    if (results.every(r => r.ok)) onSuccess()
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length) uploadFiles(files)
    e.target.value = ''
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) uploadFiles(files)
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[1000] flex items-start justify-center p-4 pt-24 md:pt-28 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[calc(100vh-7.5rem)] bg-[#13243a] border border-[#4c6b8f] rounded-2xl shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-lg text-blue-400" style={{ fontVariationSettings: "'wght' 300" }}>{def.icon}</span>
            <div>
              <p className="text-xs uppercase tracking-widest text-blue-200 font-bold">{isReplace ? 'Replace' : 'Upload'}</p>
              <p className="text-lg font-semibold text-white">{def.label}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={uploading} className="text-white/30 hover:text-white/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4 overflow-y-auto min-h-0">

          {/* Pilot Licence fields */}
          {def.type === 'pilot_licence' && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-300">Licence Type <span className="text-red-300 font-semibold normal-case">Required</span></p>
                <div className="grid grid-cols-2 gap-1.5">
                  {['Recreational (RPL)', 'Private (PPL)', 'Commercial (CPL)', 'Other'].map(t => (
                    <Pill key={t} value={t} active={licenceType === t.split(' ')[0] || licenceType === t} onClick={() => setLicenceType(t.split(' ')[0] ?? t)} />
                  ))}
                </div>
              </div>

              {/* Instrument Rating — Night VFR comes from Step 1, not re-asked here */}
              <div className="pt-1 border-t border-white/[0.06] space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-300">
                  Instrument Rating (IFR) <span className="text-red-300 font-semibold normal-case">Required</span>
                </p>
                <p className="text-sm text-slate-400">Do you hold a current IFR / Instrument Rating?</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {([true, false] as const).map(val => (
                    <Pill
                      key={String(val)}
                      value={val ? 'Yes' : 'No'}
                      active={instrumentRating === val}
                      onClick={() => setInstrumentRating(val)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-300">Pilot Licence Number / ARN <span className="text-red-300 font-semibold normal-case">Required</span></p>
                <p className="text-sm text-slate-200">Your ARN is your CASA-issued aviation reference number.</p>
                <input type="text" value={licenceNumber} onChange={e => setLicenceNumber(e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full bg-white/[0.03] border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-400/60 placeholder:text-slate-400"
                />
              </div>
            </>
          )}

          {/* Medical Certificate fields */}
          {def.type === 'medical_certificate' && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-300">Medical Class <span className="text-red-300 font-semibold normal-case">Required</span></p>
                <div className="grid grid-cols-2 gap-1.5">
                  {['Class 1', 'Class 2', 'Basic Class 2', 'Other'].map(c => (
                    <Pill key={c} value={c} active={medicalClass === c} onClick={() => setMedicalClass(c)} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-300">Date of Issue <span className="text-red-300 font-semibold normal-case">Required</span></p>
                  <CalendarDateField
                    value={issueDate}
                    onChange={setIssueDate}
                    minYear={new Date().getFullYear() - 80}
                    maxYear={new Date().getFullYear()}
                    className="w-full bg-white/[0.03] border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-400/60 text-left flex items-center justify-between"
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-300">Expiry Date <span className="text-red-300 font-semibold normal-case">Required</span></p>
                  <CalendarDateField
                    value={expiryDate}
                    onChange={setExpiryDate}
                    minYear={new Date().getFullYear() - 5}
                    maxYear={new Date().getFullYear() + 20}
                    className="w-full bg-white/[0.03] border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-400/60 text-left flex items-center justify-between"
                  />
                </div>
              </div>
            </>
          )}

          {/* Photo ID fields */}
          {def.type === 'photo_id' && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-300">ID Type <span className="text-red-300 font-semibold normal-case">Required</span></p>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Passport', 'Driver Licence', 'Other'].map(t => (
                    <Pill key={t} value={t} active={idType === t} onClick={() => setIdType(t)} />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-300">Document Number <span className="text-red-300 font-semibold normal-case">Required</span></p>
                <input type="text" value={documentNumber} onChange={e => setDocumentNumber(e.target.value)}
                  placeholder="Passport or licence number"
                  className="w-full bg-white/[0.03] border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-400/60 placeholder:text-slate-400"
                />
              </div>
            </>
          )}

          {/* Multi-file drag-and-drop upload */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-1.5">
              Document File(s) <span className="text-red-300 font-semibold normal-case">Required</span>
            </p>
            <label
              className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                dragOver
                  ? 'border-blue-400/70 bg-blue-500/10'
                  : uploading
                  ? 'border-blue-500/30 bg-blue-500/5'
                  : 'border-[#5f7fa5] bg-[#173150] hover:border-blue-300/70 hover:bg-[#1e3c61]'
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden" onChange={handleFileInput} disabled={uploading} />
              <span className={`material-symbols-outlined text-2xl ${
                uploading ? 'text-blue-400 animate-spin' : dragOver ? 'text-blue-400' : 'text-slate-500'
              }`} style={{ fontVariationSettings: "'wght' 300" }}>
                {uploading ? 'progress_activity' : 'cloud_upload'}
              </span>
              <div className="text-center">
                <p className="text-base text-slate-100">{uploading ? 'Uploading…' : 'Drop files here or click to browse'}</p>
                <p className="text-sm text-slate-200 mt-0.5">PDF, JPG, PNG · up to 10 MB each · multiple files supported</p>
              </div>
            </label>

            {/* Per-file results */}
            {fileResults.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {fileResults.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    r.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {r.ok ? 'check_circle' : 'error'}
                    </span>
                    <span className="truncate flex-1">{r.name}</span>
                    {r.msg && <span className="text-xs opacity-80">{r.msg}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {formError && <p className="text-sm text-red-300">{formError}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/[0.06] flex items-center gap-3">
          <p className="text-sm text-slate-300 flex-1">
            {uploading ? 'Upload in progress — please wait before closing.' : 'You can upload multiple files at once, for example front and back of a document.'}
          </p>
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-5 py-2 text-xs font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Close
          </button>
        </div>

      </div>
      </div>
    </ModalPortal>
  )
}

// ── Document status card ───────────────────────────────────────────────────────

function DocCard({
  def,
  doc,
  onUploaded,
  onUploadStart,
  onUploadEnd,
  initialNightVfrRating,
  initialInstrumentRating,
}: {
  def:                     DocCardDef
  doc:                     UserDocument | undefined
  onUploaded:              () => void
  onUploadStart?:          () => void
  onUploadEnd?:            () => void
  initialNightVfrRating?:  boolean | null
  initialInstrumentRating?: boolean | null
}) {
  const today   = new Date().toISOString().split('T')[0]!
  const expired = doc?.expiry_date ? doc.expiry_date < today : false
  const ok      = !!doc && !expired && doc.status !== 'rejected'
  const uploadedOn = doc?.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : null
  const secondaryFilename = doc?.file_name ? (doc.file_name.length > 24 ? `${doc.file_name.slice(0, 24)}...` : doc.file_name) : null
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      {modalOpen && (
        <DocModal
          def={def}
          doc={doc}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); onUploaded() }}
          onUploadStart={onUploadStart}
          onUploadEnd={onUploadEnd}
          initialNightVfrRating={initialNightVfrRating}
          initialInstrumentRating={initialInstrumentRating}
        />
      )}
      <div className={`flex items-center justify-between rounded-xl border px-4 py-4 transition-all ${
        ok      ? 'bg-green-500/[0.04] border-green-500/15' :
        expired ? 'bg-red-500/[0.04] border-red-500/15' :
                  'bg-white/[0.03] border-white/[0.08]'
      }`}>
        {/* Left: icon + label + status */}
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`material-symbols-outlined text-lg flex-shrink-0 ${ok ? 'text-green-400' : expired ? 'text-red-400' : 'text-slate-500'}`}
            style={{ fontVariationSettings: ok ? "'FILL' 1" : "'FILL' 0, 'wght' 300" }}
          >
            {def.icon}
          </span>
          <div className="min-w-0">
            <p className={`text-base font-semibold truncate ${ok ? 'text-white' : 'text-slate-200'}`}>{def.label}</p>
            {/* Metadata summary */}
            {ok && (
              <p className="text-sm text-slate-300 mt-0.5 truncate">Uploaded{uploadedOn ? ` on ${uploadedOn}` : ''}</p>
            )}
            {ok && secondaryFilename && <p className="text-sm text-slate-400 truncate">{secondaryFilename}</p>}
            {expired && <p className="text-sm text-red-300 mt-0.5">Expired - please replace</p>}
          </div>
        </div>
        {/* Right: status badge + action */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {ok
            ? <span className="text-xs font-bold uppercase tracking-widest text-green-300 border border-green-400/30 bg-green-500/10 px-2.5 py-1 rounded">Uploaded</span>
            : expired
            ? <span className="text-xs font-bold uppercase tracking-widest text-red-300 border border-red-400/30 bg-red-500/10 px-2.5 py-1 rounded">Expired</span>
            : doc?.status === 'rejected'
            ? <span className="text-xs font-bold uppercase tracking-widest text-red-300 border border-red-400/30 bg-red-500/10 px-2.5 py-1 rounded">Rejected</span>
            : <span className="text-xs font-bold uppercase tracking-widest text-slate-200 border border-white/20 px-2.5 py-1 rounded">Required</span>
          }
          {ok && (
            <button
              onClick={() => setModalOpen(true)}
              className="text-xs font-bold uppercase tracking-widest text-blue-200 border border-blue-400/50 hover:bg-blue-500/15 transition-colors px-3 py-1.5 rounded-full"
            >
              View
            </button>
          )}
          <button
            onClick={() => setModalOpen(true)}
            className={`text-xs font-bold uppercase tracking-widest transition-colors px-3 py-1.5 rounded-full border ${
              ok
                ? 'text-slate-200 border-white/20 hover:text-white hover:border-white/35'
                : 'text-blue-200 border-blue-400/50 hover:bg-blue-500/15'
            }`}
          >
            {ok ? 'Replace' : def.type === 'photo_id' ? 'Upload photo ID' : 'Upload'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main flow component ────────────────────────────────────────────────────────

export default function CheckoutFlow({
  firstName,
  aircraftId,
  aircraftRegistration,
  aircraftDisplayName,
  aircraftStatus,
  documents,
  pilotClearanceStatus,
  journeyActiveIndex,
  journeyCompletedMap,
  initialLastFlightDate,
  initialNightVfrRating,
  initialInstrumentRating,
  activeCheckoutTerms,
  activeCheckoutBooking,
  pendingRescheduleRequest,
}: Props) {
  const router = useRouter()
  const stepSectionRef = useRef<HTMLDivElement>(null)
  const prevStepRef = useRef<Step>('time')
  const [step, setStep] = useState<Step>('time')

  // Time selection — nothing preselected; user must actively choose date and time.
  const [date, setDate]           = useState('')
  const [startTime, setStartTime] = useState('')
  const [daySlots, setDaySlots]   = useState<SafeConflict[]>([])
  const [avail, setAvail]         = useState<AvailabilityState>({ status: 'idle' })

  // Night VFR status for this booking — always starts null (unanswered).
  // Must be explicitly selected by the user; profile value is intentionally NOT pre-filled here.
  const [nightVfrRating, setNightVfrRating] = useState<boolean | null>(null)

  // Step 1 navigation error (shown when user clicks Continue without completing required fields)
  const [stepError, setStepError] = useState<string | null>(null)
  const [step2Error, setStep2Error] = useState<string | null>(null)
  const [hasAttemptedStep2Continue, setHasAttemptedStep2Continue] = useState(false)
  const [redCardExpiry, setRedCardExpiry] = useState('')
  const [redCardSaving, setRedCardSaving] = useState(false)
  const [docUploadCount, setDocUploadCount] = useState(0)
  const anyDocUploading = docUploadCount > 0

  // Submission state
  const [submitError, setSubmitError]   = useState<string | null>(null)
  const [docViewError, setDocViewError] = useState<string | null>(null)
  const [docViewLoadingType, setDocViewLoadingType] = useState<DocumentType | null>(null)
  const [isPending, startTransition]    = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsModalOpen, setTermsModalOpen] = useState(false)
  const [termsScrolledToEnd, setTermsScrolledToEnd] = useState(false)
  const [termsModalChecked, setTermsModalChecked] = useState(false)
  const [termsError, setTermsError] = useState<string | null>(null)

  // Result state
  const [checkoutResult, setCheckoutResult] = useState<CheckoutBookingResult | null>(null)
  const [activeBookingState, setActiveBookingState] = useState(activeCheckoutBooking)
  const [pendingRescheduleState, setPendingRescheduleState] = useState(pendingRescheduleRequest)

  // Optional message to team
  const [teamMessage, setTeamMessage] = useState('')

  // Last flight date — pre-filled from profile so it stays in sync with Documents page
  const [lastFlightDate, setLastFlightDate] = useState(initialLastFlightDate)

  useEffect(() => {
    setActiveBookingState(activeCheckoutBooking)
    setPendingRescheduleState(pendingRescheduleRequest)
  }, [activeCheckoutBooking, pendingRescheduleRequest])

  useEffect(() => {
    if (prevStepRef.current !== step && step !== 'success') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
    prevStepRef.current = step
  }, [step])

  // ── Document gate ──────────────────────────────────────────────────────────

  const today = new Date().toISOString().split('T')[0]!

  const licenceDoc = pickBestDocumentForType(documents, 'pilot_licence', today)
  const medicalDoc = pickBestDocumentForType(documents, 'medical_certificate', today)
  const photoIdDoc = pickBestDocumentForType(documents, 'photo_id', today)

  const isDocOk = (doc: UserDocument | undefined): boolean => {
    if (!doc) return false
    if (doc.status === 'rejected') return false
    if (doc.expiry_date && doc.expiry_date < today) return false
    return true
  }

  const nightVfrEvidenceDoc = pickBestDocumentForType(documents, 'night_vfr_evidence', today)

  useEffect(() => {
    const expiryValue =
      licenceDoc?.red_card_expiry_year && licenceDoc?.red_card_expiry_month
        ? `${String(licenceDoc.red_card_expiry_year)}-${String(licenceDoc.red_card_expiry_month).padStart(2, '0')}-01`
        : ''
    setRedCardExpiry(expiryValue)
  }, [licenceDoc?.id, licenceDoc?.red_card_expiry_month, licenceDoc?.red_card_expiry_year])

  const allDocsUploaded = isDocOk(licenceDoc) && isDocOk(medicalDoc) && isDocOk(photoIdDoc)
  const nightVfrEvidenceOk = nightVfrRating !== true || isDocOk(nightVfrEvidenceDoc)
  const flightReviewError = lastFlightDate ? validateFlightReviewDate(lastFlightDate) : 'Please enter your last flight review date.'

  const missingRequiredDocs: string[] = [
    !isDocOk(licenceDoc) ? 'Pilot Licence' : null,
    !isDocOk(medicalDoc) ? 'Medical Certificate' : null,
    !isDocOk(photoIdDoc) ? 'Photo ID' : null,
  ].filter((v): v is string => !!v)

  // ── Derived time values ────────────────────────────────────────────────────
  // end is always exactly 2 hours after start — never submitted from the client.

  const endTime  = (date && startTime) ? addTwoHours(startTime) : ''
  const startDT  = date && startTime ? `${date}T${startTime}` : ''
  const endDT    = date && endTime   ? `${date}T${endTime}`   : ''

  const startUTC = startDT ? sydneyInputToUTC(startDT) : null
  const endUTC   = endDT   ? sydneyInputToUTC(endDT)   : null

  // ── Load day availability ──────────────────────────────────────────────────

  useEffect(() => {
    if (!date) { setDaySlots([]); return }
    getDayAvailability(aircraftId, date)
      .then(r => setDaySlots(r ?? []))
      .catch(() => setDaySlots([]))
  }, [date, aircraftId])

  // ── Unified availability + future-time check ──────────────────────────────
  // Single source of truth for the avail state — past-time is treated as
  // unavailable here so the UI never shows a conflicting "available" message
  // alongside a separate future-time error.

  useEffect(() => {
    if (!startUTC || !endUTC || new Date(endUTC) <= new Date(startUTC)) {
      setAvail({ status: 'idle' }); return
    }

    // Synchronous past-time guard — no server call needed.
    if (new Date(startUTC) <= new Date()) {
      setAvail({ status: 'unavailable', message: 'Please select a future checkout time.' })
      return
    }

    setAvail({ status: 'checking' })
    const t = setTimeout(() => {
      checkCustomerAvailability(aircraftId, startUTC, endUTC)
        .then(r => {
          if (r.available) setAvail({ status: 'available' })
          else setAvail({ status: 'unavailable', message: 'This time slot is not available. Please choose another time.' })
        })
        .catch(() => setAvail({ status: 'idle' }))
    }, 600)
    return () => clearTimeout(t)
  }, [startDT, endDT, aircraftId])

  // ── Derived Day VFR values ─────────────────────────────────────────────────

  // Window to enforce when Night VFR = No; null when Night VFR = Yes or unanswered.
  const dayVfrWindow = (date && nightVfrRating === false) ? getDayVfrWindow(date) : null

  // Dropdown options — filtered to the Day VFR window when Night VFR = No so
  // the user cannot manually pick a restricted time from the list.
  const timeOptions = (date && nightVfrRating === false)
    ? ALL_TIME_OPTIONS.filter(o => isWithinDayVfrWindow(o.value, date, 120))
    : ALL_TIME_OPTIONS

  // Inline error shown when a selected time is outside the allowed window.
  // This can still occur if the user drags the timeline slot (drag is clamped but guards
  // against edge cases), or if Night VFR was Yes when the time was picked and then
  // switched to No.
  const nightVfrTimeError =
    nightVfrRating === false && startTime && date && !isWithinDayVfrWindow(startTime, date, 120)
      ? 'This checkout time cannot fit its 2-hour duration within the Day VFR window. Please select an earlier time or confirm your Night VFR Rating.'
      : null

  // Boolean shorthand used to gate the availability message and Continue button.
  const isTimeNightRestricted = !!nightVfrTimeError

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleTimeNext() {
    setStepError(null)
    if (!date)                   { setStepError('Please select a checkout date.'); return }
    if (nightVfrRating === null) { setStepError('Please confirm whether you hold a Night VFR Rating.'); return }
    if (!startTime)              { setStepError('Please select a departure time.'); return }
    if (nightVfrTimeError)       { setStepError(nightVfrTimeError); return }
    if (avail.status !== 'available') return
    setStep('documents')
  }

  async function handleDocumentsNext() {
    setHasAttemptedStep2Continue(true)
    setStep2Error(null)

    if (missingRequiredDocs.length > 0) {
      if (missingRequiredDocs.length === 1) {
        setStep2Error(`Please upload your ${missingRequiredDocs[0]} to continue.`)
      } else {
        setStep2Error(`Please upload all required documents to continue: ${missingRequiredDocs.join(', ')}.`)
      }
      return
    }

    if (!nightVfrEvidenceOk) {
      setStep2Error('Please upload Night VFR to continue.')
      return
    }

    if (flightReviewError) {
      setStep2Error(flightReviewError)
      return
    }

    if (!redCardExpiry) {
      setStep2Error('Please enter your Red Card expiry date.')
      return
    }

    setRedCardSaving(true)
    try {
      await saveCheckoutRedCardDetails({
        redCardExpiry: redCardExpiry.slice(0, 7),
      })
    } catch (err) {
      setStep2Error(err instanceof Error ? err.message : 'Could not save Red Card details.')
      setRedCardSaving(false)
      return
    } finally {
      setRedCardSaving(false)
    }

    setStep('review')
  }

  useEffect(() => {
    if (!hasAttemptedStep2Continue) return
    if (missingRequiredDocs.length === 0 && nightVfrEvidenceOk && !flightReviewError && !!redCardExpiry) {
      setStep2Error(null)
    }
  }, [hasAttemptedStep2Continue, missingRequiredDocs.length, nightVfrEvidenceOk, flightReviewError, redCardExpiry])

  function handleSubmit() {
    if (isSubmitting || isPending) return
    if (!startUTC) return
    setSubmitError(null)
    setTermsError(null)

    if (nightVfrRating === null) {
      setSubmitError('Please confirm your Night VFR rating status before submitting your checkout request.')
      return
    }
    if (!lastFlightDate) {
      setSubmitError('Please enter your last flight review date before submitting your checkout request.')
      return
    }
    const lastFlightDateError = validateFlightReviewDate(lastFlightDate)
    if (lastFlightDateError) {
      setSubmitError(lastFlightDateError)
      return
    }
    if (!activeCheckoutTerms?.id || !activeCheckoutTerms?.version || !activeCheckoutTerms?.content_hash) {
      setTermsError('Please review and accept the latest checkout terms before submitting.')
      return
    }
    if (!termsAccepted) {
      setTermsError('Please read the Checkout Terms and Conditions and accept them before submitting.')
      return
    }

    console.info('[checkout-submit-client]', {
      has_last_flight_date: Boolean(lastFlightDate),
      has_night_vfr: nightVfrRating,
      has_terms_accepted: termsAccepted,
      has_terms_id: Boolean(activeCheckoutTerms.id),
      has_terms_version: Boolean(activeCheckoutTerms.version),
      has_terms_hash: Boolean(activeCheckoutTerms.content_hash),
      has_scheduled_start: Boolean(startUTC),
    })

    setIsSubmitting(true)
    startTransition(async () => {
      try {
        const result = await submitCheckoutRequest({
          aircraft_id:           aircraftId,
          scheduled_start:       startUTC,
          scheduled_date_sydney: date,
          scheduled_time_sydney: startTime,
          has_night_vfr:         nightVfrRating,
          last_flight_date:      lastFlightDate || null,
          customer_notes:        teamMessage.trim() || null,
          terms_accepted:        termsAccepted,
          terms_document_id:     activeCheckoutTerms.id,
          terms_version:         activeCheckoutTerms.version,
          terms_document_url:    activeCheckoutTerms.public_url,
          terms_content_hash:    activeCheckoutTerms.content_hash,
          // scheduled_end is computed server-side as start + 2 hours
        })

        if (result.ok) {
          setCheckoutResult({
            bookingId: result.bookingId,
            bookingReference: result.bookingReference,
            scheduledStart: result.scheduledStart,
            scheduledEnd: result.scheduledEnd,
          })
          setStep('success')
          return
        }

        if (result.type === 'validation') {
          setSubmitError(mapCheckoutSubmitError(`VALIDATION: ${result.message}`))
          return
        }
        if (result.type === 'availability') {
          setSubmitError(result.message)
          return
        }
        if (result.type === 'account_blocked' || result.type === 'auth') {
          setSubmitError(result.message)
          return
        }
        setSubmitError(result.message || "We couldn't submit your checkout request. Please try again or contact support.")
      } catch {
        setSubmitError("We couldn't submit your checkout request. Please try again or contact support.")
      } finally {
        setIsSubmitting(false)
      }
    })
  }

  async function handleViewDocument(doc: UserDocument | undefined) {
    if (!doc) return
    setDocViewError(null)
    setDocViewLoadingType(doc.document_type)
    try {
      const signedUrl = await getDocumentSignedUrl(doc.document_type)
      window.open(signedUrl, '_blank', 'noopener,noreferrer')
    } catch {
      setDocViewError('Could not open one of your uploaded documents. Please try again.')
    } finally {
      setDocViewLoadingType(null)
    }
  }

  // ── Shared card style ──────────────────────────────────────────────────────

  const CARD = 'bg-[#1a2c45] border border-blue-900/40 rounded-2xl shadow-[0_8px_20px_rgba(3,10,25,0.18)]'

  // ── "Active checkout booking" view ─────────────────────────────────────────
  if (
    step !== 'success' &&
    activeBookingState &&
    ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required'].includes(activeBookingState.status)
  ) {
    const checkoutStartLabel = new Date(activeBookingState.scheduled_start).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const checkoutEndLabel = new Date(activeBookingState.scheduled_end).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      timeStyle: 'short',
    })
    return (
      <div className="px-6 md:px-10 py-10 max-w-2xl mx-auto w-full">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-8 transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to Overview
        </Link>
        <div className={`${CARD} p-8 text-center space-y-5`}>
          <div className="w-16 h-16 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-3xl text-blue-400" style={{ fontVariationSettings: "'wght' 300" }}>pending_actions</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-white mb-3">Checkout Flight Scheduled</h2>
            <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
              Your checkout is currently scheduled for {checkoutStartLabel} to {checkoutEndLabel} (Australia/Sydney).
            </p>
            {activeBookingState.checkout_lifecycle_status === 'cancelled_by_customer' && (
              <p className="text-sm text-emerald-300 mt-4">Your checkout flight has been cancelled.</p>
            )}
          </div>
          <div className="text-left">
            <CheckoutChangeActions
              checkout={{
                id: activeBookingState.id,
                booking_type: activeBookingState.booking_type,
                status: activeBookingState.status,
                scheduled_start: activeBookingState.scheduled_start,
                checkout_lifecycle_status: activeBookingState.checkout_lifecycle_status ?? null,
              }}
              aircraftId={aircraftId}
              pendingRescheduleRequest={pendingRescheduleState}
              latestRescheduleRequest={pendingRescheduleState}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-2 md:px-3 py-4 w-full">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-8 transition-colors"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        Back to Overview
      </Link>

      {/* Page header — two-column on desktop */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-10 mb-7">

        {/* Left: title + intro — changes based on step */}
        <div>
          {step === 'review' ? (
            <>
              <h1 className="text-[42px] font-bold text-white tracking-tight leading-[1.15]">
                Review &amp; Submit Checkout
              </h1>
              <p className="text-[18px] text-slate-300 mt-2 leading-relaxed">
                Please review your checkout details and submit your request.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-semibold text-white tracking-tight">
                Book Your Checkout Flight
              </h1>
              <p className="text-base text-slate-300 mt-2 leading-relaxed">
                To fly solo with us, you must first complete a checkout flight with our team.
              </p>
            </>
          )}
        </div>

        {/* Right: booking context pills — one horizontal row */}
        <div className="flex flex-wrap gap-2 md:shrink-0">
          <div className="inline-flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3.5 py-2.5">
            <span className="material-symbols-outlined text-[15px] text-slate-500 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>flight</span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 leading-none">Aircraft</p>
              <p className="text-[13px] text-slate-300 mt-0.5 leading-none">{aircraftDisplayName}</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3.5 py-2.5">
            <span className="material-symbols-outlined text-[15px] text-slate-500 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>schedule</span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 leading-none">Duration</p>
              <p className="text-[13px] text-slate-300 mt-0.5 leading-none">Expected duration: 2 hours</p>
              <p className="text-[11px] text-slate-400 mt-1 leading-tight">Approximately 1 hour familiarisation with the aircraft and procedures</p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">Approximately 1 hour checkout flight</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3.5 py-2.5">
            <span className="material-symbols-outlined text-[15px] text-slate-500 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>payments</span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 leading-none">Rate</p>
              <p className="text-[13px] text-slate-300 mt-0.5 leading-none">${CHECKOUT_RATE} per VDO hour + landing fee</p>
            </div>
          </div>
        </div>

      </div>

      <div className="w-full text-[15px]">
          {/* ── STEP 1: Time selection ─────────────────────────────────────────── */}
          {step === 'time' && (
            <div ref={stepSectionRef} className={`${CARD} p-6 md:p-8`}>

          {aircraftStatus === 'inactive' || aircraftStatus === 'grounded' ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-300">
              This aircraft is currently unavailable. Please contact the flight operations team.
            </div>
          ) : (
            <div className="space-y-0">

              {/* Step 1: Checkout date */}
              <div className="py-7 border-b border-white/[0.07]">
                <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
                  <div className="flex items-start gap-4 md:w-[42%]">
                    <div className="w-9 h-9 rounded-full border border-blue-500/60 bg-blue-600/[0.18] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-semibold text-blue-200">1</span>
                    </div>
                    <div>
                      <p className="text-[17px] font-semibold text-slate-100">Checkout date</p>
                      <p className="text-[15px] text-slate-400 mt-1 leading-relaxed">Select the date you would like to complete your checkout flight.</p>
                    </div>
                  </div>
                  <div className="md:flex-1 flex md:justify-start">
                    <div className="w-full sm:max-w-[320px]">
                      <CalendarDateField
                        value={date}
                        onChange={(next) => { setDate(next); setStartTime(''); setAvail({ status: 'idle' }); setStepError(null); setSubmitError(null) }}
                        minYear={new Date().getFullYear()}
                        maxYear={new Date().getFullYear() + 2}
                        minDate={minDateString()}
                        className="w-full h-12 bg-[#0b1a2f] border border-white/20 rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-blue-500/60 transition-colors text-left flex items-center justify-between"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Night VFR (shown once date is selected) */}
              {date && (
                <div className="py-7 border-b border-white/[0.07]">
                  <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
                    <div className="flex items-start gap-4 md:w-[42%]">
                      <div className="w-9 h-9 rounded-full border border-blue-500/60 bg-blue-600/[0.18] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-sm font-semibold text-blue-200">2</span>
                      </div>
                      <div>
                        <p className="text-[17px] font-semibold text-slate-100">Night VFR rating</p>
                        <p className="text-[15px] text-slate-400 mt-1">Do you currently hold a Night VFR rating?</p>
                        <p className="text-sm text-slate-500 mt-1.5">Only select &apos;Yes&apos; if this is current and you can upload supporting evidence.</p>
                        {nightVfrRating === false && (
                          <p className="text-[13px] text-slate-400 flex items-center gap-1.5 mt-2">
                            <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'wght' 300" }}>wb_sunny</span>
                            {getDayVfrWindow(date).start}–{getDayVfrWindow(date).end} Sydney time allowed. Bookings outside this window require Night VFR.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="md:flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {([true, false] as const).map(val => (
                        <button
                          key={String(val)}
                          type="button"
                          onClick={() => { setNightVfrRating(val); setStepError(null); if (!val && startTime && !isWithinDayVfrWindow(startTime, date, 120)) setStartTime('') }}
                          className={`flex items-center gap-3.5 px-5 py-4 rounded-xl text-[15px] font-medium border transition-all text-left ${
                            nightVfrRating === val
                              ? 'bg-blue-500/[0.18] border-blue-400/55 text-blue-100 shadow-[0_0_14px_rgba(59,130,246,0.12)]'
                              : 'bg-[#0d1c33] border-white/[0.12] text-slate-300 hover:text-white hover:border-blue-500/40'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                            nightVfrRating === val ? 'border-blue-400 bg-blue-500' : 'border-white/25'
                          }`}>
                            {nightVfrRating === val && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                          {val ? 'Yes, I hold a Night VFR rating' : 'No, Day VFR only'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Departure time (shown once Night VFR is answered) */}
              {date && nightVfrRating !== null && (
                <div className="py-7">
                  <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
                    <div className="flex items-start gap-4 md:w-[42%]">
                      <div className="w-9 h-9 rounded-full border border-blue-500/60 bg-blue-600/[0.18] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-sm font-semibold text-blue-200">3</span>
                      </div>
                      <div>
                        <p className="text-[17px] font-semibold text-slate-100">Departure time</p>
                        <p className="text-[15px] text-slate-400 mt-1">Select an available departure time for your checkout flight.</p>
                        <p className="text-sm text-slate-500 mt-1.5">Available times are based on aircraft availability and Day/Night VFR rules.</p>
                      </div>
                    </div>
                    <div className="md:flex-1 space-y-3">
                      <TimeDropdown
                        value={startTime}
                        options={timeOptions}
                        onChange={v => { setStartTime(v); setAvail({ status: 'idle' }); setStepError(null); setSubmitError(null) }}
                      />
                      {nightVfrTimeError && (
                        <p className="text-sm text-amber-400 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[13px]">warning</span>
                          {nightVfrTimeError}
                        </p>
                      )}
                      {startTime && (
                        <div className="bg-[#0d1c33] border border-white/10 rounded-lg px-4 py-3">
                          <p className="text-[13px] font-semibold text-slate-200 mb-1.5">Selected checkout window</p>
                          <p className="text-[15px] font-medium text-white">
                            {ALL_TIME_OPTIONS.find(o => o.value === startTime)?.label ?? startTime}
                            <span className="mx-2 text-slate-400">→</span>
                            {ALL_TIME_OPTIONS.find(o => o.value === endTime)?.label ?? endTime}
                          </p>
                          <p className="text-sm text-slate-400 mt-1">A 2-hour slot is reserved for scheduling.</p>
                          <p className="text-[13px] text-slate-500 mt-2">Approximately 1 hour familiarisation with the aircraft and procedures.</p>
                          <p className="text-[13px] text-slate-500 mt-1">Approximately 1 hour checkout flight.</p>
                        </div>
                      )}
                      <div className="rounded-xl border border-white/10 bg-[#0d1a2c]/70 p-4 md:p-5">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[15px] font-semibold text-slate-200">Daily schedule</p>
                          <p className="text-sm text-slate-400">{formatDate(date)}</p>
                        </div>
                        {startTime && (
                          <p className="text-[13px] text-blue-300/80 mb-3 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'wght' 300" }}>drag_pan</span>
                            Drag the blue slot to fine-tune your selected time.
                          </p>
                        )}
                        <AvailabilityTimeline
                          selectedDate={date}
                          daySlots={daySlots}
                          startDT={startDT}
                          endDT={endDT}
                          onTimeChange={v => { setStartTime(v); setAvail({ status: 'idle' }); setStepError(null); setSubmitError(null) }}
                          dayVfrWindow={dayVfrWindow}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Availability state */}
              {avail.status === 'checking' && (
                <p className="text-xs text-slate-500 animate-pulse flex items-center gap-1.5 pt-2 pb-1">
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  Checking availability…
                </p>
              )}
              {avail.status === 'available' && !isTimeNightRestricted && (
                <p className="text-xs text-green-400 flex items-center gap-1.5 pt-2 pb-1">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  This time slot is available
                </p>
              )}
              {avail.status === 'available' && isTimeNightRestricted && (
                <p className="text-xs text-amber-400 flex items-center gap-1.5 pt-2 pb-1">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>nightlight</span>
                  This time requires a Night VFR Rating.
                </p>
              )}
              {avail.status === 'unavailable' && (
                <p className="text-xs text-red-400 flex items-center gap-1.5 pt-2 pb-1">
                  <span className="material-symbols-outlined text-sm">block</span>
                  {(avail as { status: 'unavailable'; message: string }).message}
                </p>
              )}

              {/* No payment notice */}
              <div className="bg-blue-500/[0.10] border border-blue-400/[0.22] rounded-xl px-5 py-4 mt-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-blue-300 text-[18px] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>info</span>
                  <div>
                    <p className="text-[15px] text-blue-100 font-medium leading-snug">No payment is required now.</p>
                    <p className="text-[15px] text-slate-400 mt-0.5 leading-relaxed">Your final checkout amount will be calculated after the flight using the aircraft VDO meter reading, plus any landing fees.</p>
                  </div>
                </div>
              </div>

              {/* Step error */}
              {stepError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5 mt-3">
                  <span className="material-symbols-outlined text-sm">error</span>
                  {stepError}
                </p>
              )}

              {/* CTA */}
              {(!date || nightVfrRating === null || !startTime || avail.status !== 'available' || isTimeNightRestricted) && (
                <p className="text-xs text-slate-400 text-center mt-3">Complete all required fields to continue.</p>
              )}
              <div className="pt-5 mt-2 border-t border-white/[0.07] flex items-center justify-center gap-3">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="px-6 py-2.5 border border-white/[0.15] hover:border-white/[0.30] text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleTimeNext}
                  data-testid="checkout-step1-continue"
                  disabled={!date || nightVfrRating === null || !startTime || avail.status !== 'available' || isTimeNightRestricted}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700/50 disabled:text-slate-400 disabled:border disabled:border-white/[0.08] disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all"
                >
                  {(!date || nightVfrRating === null || !startTime || avail.status !== 'available' || isTimeNightRestricted) && (
                    <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'wght' 300" }}>lock</span>
                  )}
                  Continue to Documents
                </button>
              </div>

            </div>
          )}
            </div>
          )}

          {/* ── STEP 2: Documents ─────────────────────────────────────────────── */}
          {step === 'documents' && (
            <div ref={stepSectionRef} className={`${CARD} p-6 md:p-8`}>

          {/* Row 1: Pilot documents */}
          <div className="py-7 border-b border-white/[0.07]">
            <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
              <div className="flex items-start gap-4 md:w-[42%]">
                <div className="w-9 h-9 rounded-full border border-blue-500/60 bg-blue-600/[0.18] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-semibold text-blue-200">1</span>
                </div>
                <div>
                  <p className="text-[17px] font-semibold text-slate-100">Pilot documents</p>
                  <p className="text-[15px] text-slate-400 mt-1 leading-relaxed">Upload the required pilot documents reviewed as part of your checkout request.</p>
                </div>
              </div>
              <div className="md:flex-1 space-y-3">
                {DOC_DEFS.map(def => (
                  <DocCard
                    key={def.type}
                    def={def}
                    doc={pickBestDocumentForType(documents, def.type, today)}
                    onUploaded={() => {
                      setStep2Error(null)
                      setHasAttemptedStep2Continue(false)
                      router.refresh()
                    }}
                    onUploadStart={() => setDocUploadCount(c => c + 1)}
                    onUploadEnd={() => setDocUploadCount(c => Math.max(0, c - 1))}
                    initialNightVfrRating={def.type === 'pilot_licence' ? nightVfrRating : undefined}
                    initialInstrumentRating={def.type === 'pilot_licence' ? initialInstrumentRating : undefined}
                  />
                ))}
                {allDocsUploaded && nightVfrEvidenceOk && (
                  <div className="bg-green-500/[0.06] border border-green-500/20 rounded-lg px-4 py-3 flex items-center gap-3">
                    <span className="material-symbols-outlined text-green-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <p className="text-sm text-green-300">All required documents have been uploaded.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Night VFR */}
          <div className="py-7 border-b border-white/[0.07]">
            <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
              <div className="flex items-start gap-4 md:w-[42%]">
                <div className="w-9 h-9 rounded-full border border-blue-500/60 bg-blue-600/[0.18] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-semibold text-blue-200">2</span>
                </div>
                <div>
                  <p className="text-[17px] font-semibold text-slate-100">Night VFR</p>
                  <p className="text-[15px] text-slate-400 mt-1 leading-relaxed">Provide supporting evidence only if you selected that you hold a Night VFR rating.</p>
                </div>
              </div>
              <div className="md:flex-1 space-y-3">
                {nightVfrRating === true ? (
                  <>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      You selected that you hold a Night VFR rating. Please upload supporting evidence for this rating. This can be a CASA licence record, eLicence screenshot, flight review record, logbook endorsement, or other supporting document.
                    </p>
                    <DocCard
                      def={{ type: 'night_vfr_evidence', label: 'Night VFR', icon: 'nightlight' }}
                      doc={nightVfrEvidenceDoc}
                      onUploaded={() => {
                        setStep2Error(null)
                        setHasAttemptedStep2Continue(false)
                        router.refresh()
                      }}
                      onUploadStart={() => setDocUploadCount(c => c + 1)}
                      onUploadEnd={() => setDocUploadCount(c => Math.max(0, c - 1))}
                    />
                    {!isDocOk(nightVfrEvidenceDoc) && (
                      <p className="text-sm text-amber-300 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[12px]">warning</span>
                        Night VFR is required before you can continue.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => setStep('time')}
                      className="text-sm text-blue-300 hover:text-blue-200 underline underline-offset-2 transition-colors"
                    >
                      Don&apos;t have a Night VFR rating? Go back and update your checkout details.
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5">
                      <span className="material-symbols-outlined text-slate-500 text-[18px] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>check_circle</span>
                      <div>
                        <p className="text-sm font-medium text-slate-300">Not required</p>
                        <p className="text-sm text-slate-500 mt-0.5">Night VFR is not required because you selected Day VFR only.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep('time')}
                      className="text-sm text-blue-300 hover:text-blue-200 underline underline-offset-2 transition-colors"
                    >
                      Have a Night VFR rating? Go back and update your checkout details.
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Row 3: Red Card */}
          <div className="py-7 border-b border-white/[0.07]">
            <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
              <div className="flex items-start gap-4 md:w-[42%]">
                <div className="w-9 h-9 rounded-full border border-blue-500/60 bg-blue-600/[0.18] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-semibold text-blue-200">3</span>
                </div>
                <div>
                  <p className="text-[17px] font-semibold text-slate-100">Red Card</p>
                  <p className="text-[15px] text-slate-400 mt-1 leading-relaxed">What is the expiry date of your Red Card?</p>
                </div>
              </div>
              <div className="md:flex-1 space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-100 block">
                    Red Card expiry date <span className="text-red-400 font-normal">Required</span>
                  </label>
                  <div className="sm:max-w-[360px]">
                    <CalendarDateField
                      value={redCardExpiry}
                      onChange={(next) => {
                        setRedCardExpiry(next)
                        setStep2Error(null)
                      }}
                      minYear={new Date().getFullYear() - 5}
                      maxYear={new Date().getFullYear() + 25}
                      className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-oz-blue/40 focus:outline-none text-sm text-white/80 rounded-xl px-4 py-2.5 text-left flex items-center justify-between"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 4: Last flight review + notes */}
          <div className="py-7">
            <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
              <div className="flex items-start gap-4 md:w-[42%]">
                <div className="w-9 h-9 rounded-full border border-blue-500/60 bg-blue-600/[0.18] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-semibold text-blue-200">4</span>
                </div>
                <div>
                  <p className="text-[17px] font-semibold text-slate-100">Last flight review</p>
                  <p className="text-[15px] text-slate-400 mt-1 leading-relaxed">Tell us when your most recent flight review was completed and add any extra notes if needed.</p>
                </div>
              </div>
              <div className="md:flex-1 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-100 block">
                    When was your last flight review? <span className="text-red-400 font-normal">Required</span>
                  </label>
                  <CalendarDateField
                    value={lastFlightDate}
                    onChange={(next) => {
                      setLastFlightDate(next)
                      setStep2Error(null)
                    }}
                    minYear={new Date().getFullYear() - 20}
                    maxYear={new Date().getFullYear()}
                    minDate={getFlightReviewCutoff()}
                    maxDate={new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })}
                    className="w-full bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-3 text-base text-white focus:outline-none focus:border-blue-500/60 transition-colors text-left flex items-center justify-between"
                  />
                  {hasAttemptedStep2Continue && !lastFlightDate && (
                    <p className="text-sm text-red-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[12px]">error</span>
                      Please enter your last flight review date.
                    </p>
                  )}
                  {lastFlightDate && validateFlightReviewDate(lastFlightDate) && (
                    <p className="text-sm text-red-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[12px]">error</span>
                      {validateFlightReviewDate(lastFlightDate)}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-100 block">
                    Anything our team should know? <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    value={teamMessage}
                    onChange={e => setTeamMessage(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Add any notes, timing preferences, questions, or context for our team..."
                    className="w-full bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-3 text-base text-white focus:outline-none focus:border-blue-500/60 transition-colors placeholder:text-slate-500 resize-none"
                  />
                  {teamMessage.length > 800 && (
                    <p className="text-sm text-slate-400 text-right">{teamMessage.length} / 1000</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {hasAttemptedStep2Continue && step2Error && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 mt-2">
              <p className="text-sm text-amber-300">{step2Error}</p>
            </div>
          )}

          {/* Bottom buttons */}
          <div className="pt-6 mt-2 border-t border-white/[0.07] flex items-center justify-center gap-3">
            <button
              onClick={() => setStep('time')}
              className="px-6 py-2.5 border border-white/[0.15] hover:border-white/[0.30] text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-all"
            >
              Back
            </button>
            <button
              onClick={handleDocumentsNext}
              data-testid="checkout-step2-continue"
              disabled={anyDocUploading || redCardSaving}
              aria-busy={anyDocUploading || redCardSaving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all"
            >
              {anyDocUploading ? 'Uploading…' : redCardSaving ? 'Saving…' : 'Continue to Review'}
            </button>
          </div>

            </div>
          )}

          {/* ── STEP 3: Review & Submit ───────────────────────────────────────── */}
          {step === 'review' && startUTC && endUTC && (
            <div ref={stepSectionRef} className={`${CARD} p-6 md:p-8`}>

          {/* ── Section 1: Checkout details ── */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 py-7 border-b border-white/[0.07]">
            {/* Left */}
            <div className="flex gap-4 md:w-[270px] flex-shrink-0">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-[0_0_18px_rgba(37,99,235,0.40)]">
                  <span className="text-xl font-bold text-white">1</span>
                </div>
              </div>
              <div className="self-start pt-1">
                <h3 className="text-[22px] font-bold text-white leading-tight">Checkout details</h3>
                <p className="text-[15px] text-slate-400 mt-1.5 leading-relaxed">Review your flight and pricing details.</p>
              </div>
            </div>
            {/* Right: 2×3 review card */}
            <div className="flex-1">
              <div className="bg-[#0f1e35] border border-white/[0.08] rounded-[18px] overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2">
                  {/* Row 1 */}
                  <div className="flex gap-3 px-5 py-4 border-b border-white/[0.07] md:border-r md:border-b border-white/[0.07]">
                    <span className="material-symbols-outlined text-[17px] text-slate-500 mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>calendar_month</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#8FA3BF]">Date</p>
                      <p className="text-[17px] font-semibold text-white mt-0.5">{formatDate(date)}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 px-5 py-4 border-b border-white/[0.07]">
                    <span className="material-symbols-outlined text-[17px] text-slate-500 mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>schedule</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#8FA3BF]">Departure time</p>
                      <p className="text-[17px] font-semibold text-white mt-0.5">{formatDateTime(startUTC)}</p>
                    </div>
                  </div>
                  {/* Row 2 */}
                  <div className="flex gap-3 px-5 py-4 border-b border-white/[0.07] md:border-r border-white/[0.07]">
                    <span className="material-symbols-outlined text-[17px] text-slate-500 mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>{nightVfrRating ? 'nightlight' : 'wb_sunny'}</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#8FA3BF]">Night VFR</p>
                      <p className="text-[17px] font-semibold text-white mt-0.5">{nightVfrRating ? 'Yes — Night VFR held' : 'No – Day VFR only'}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 px-5 py-4 border-b border-white/[0.07]">
                    <span className="material-symbols-outlined text-[17px] text-slate-500 mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>timer</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#8FA3BF]">Duration</p>
                      <p className="text-[17px] font-semibold text-white mt-0.5">Expected duration: 2 hours</p>
                      <p className="text-[13px] text-slate-300 mt-1">Approximately 1 hour familiarisation with the aircraft and procedures</p>
                      <p className="text-[13px] text-slate-300 mt-0.5">Approximately 1 hour checkout flight</p>
                    </div>
                  </div>
                  {/* Row 3 */}
                  <div className="flex gap-3 px-5 py-4 md:border-r border-white/[0.07]">
                    <span className="material-symbols-outlined text-[17px] text-slate-500 mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>payments</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#8FA3BF]">Rate</p>
                      <p className="text-[17px] font-semibold text-white mt-0.5">${CHECKOUT_RATE} per VDO hour + landing fee</p>
                    </div>
                  </div>
                  <div className="flex gap-3 px-5 py-4">
                    <span className="material-symbols-outlined text-[17px] text-slate-500 mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>schedule</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#8FA3BF]">Return time (AEST)</p>
                      <p className="text-[17px] font-semibold text-white mt-0.5">{formatDateTime(endUTC)}</p>
                    </div>
                  </div>
                </div>
              </div>
              {/* Night VFR window blocker */}
              {nightVfrRating === false && startTime && date && !isWithinDayVfrWindow(startTime, date, 120) && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mt-3">
                  <p className="text-sm text-amber-300">
                    The selected departure time is outside the allowed Day VFR window ({getDayVfrWindow(date).start}–{getDayVfrWindow(date).end} Sydney time). Please go back and choose a daylight time, or confirm that you hold a Night VFR Rating.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Section 2: Uploaded documents ── */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 py-7 border-b border-white/[0.07]">
            {/* Left */}
            <div className="flex gap-4 md:w-[270px] flex-shrink-0">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-[0_0_18px_rgba(37,99,235,0.40)]">
                  <span className="text-xl font-bold text-white">2</span>
                </div>
              </div>
              <div className="self-start pt-1">
                <h3 className="text-[22px] font-bold text-white leading-tight">Uploaded documents</h3>
                <p className="text-[15px] text-slate-400 mt-1.5 leading-relaxed">Ensure your documents are up to date and valid.</p>
              </div>
            </div>
            {/* Right: 4 doc status cards */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Pilot Licence',       icon: 'badge',             ok: isDocOk(licenceDoc),         doc: licenceDoc },
                { label: 'Medical Certificate', icon: 'health_and_safety', ok: isDocOk(medicalDoc),         doc: medicalDoc },
                { label: 'Photo ID',            icon: 'id_card',           ok: isDocOk(photoIdDoc),         doc: photoIdDoc },
              ].map(({ label, icon, ok, doc }) => (
                <div key={label} className="bg-[#0f1e35] border border-white/[0.08] rounded-2xl px-4 py-4 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[17px] text-slate-400 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>{icon}</span>
                    <p className="text-[13px] font-semibold text-white leading-tight">{label}</p>
                  </div>
                  {ok ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[13px] text-green-400" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        <span className="text-[13px] font-semibold text-green-400">Uploaded</span>
                      </div>
                      {doc && (
                        <button
                          type="button"
                          onClick={() => handleViewDocument(doc)}
                          disabled={docViewLoadingType === doc.document_type}
                          className="mt-0.5 inline-flex w-fit items-center gap-1 text-[12px] font-semibold text-blue-300 hover:text-blue-200 underline underline-offset-2"
                        >
                          {docViewLoadingType === doc.document_type ? 'Opening…' : 'View'}
                          <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[13px] text-red-400">error</span>
                      <span className="text-[13px] font-semibold text-red-400">Missing</span>
                    </div>
                  )}
                </div>
              ))}
              {/* Night VFR card */}
              <div className="bg-[#0f1e35] border border-white/[0.08] rounded-2xl px-4 py-4 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[17px] text-slate-400 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>nightlight</span>
                  <p className="text-[13px] font-semibold text-white leading-tight">Night VFR</p>
                </div>
                {nightVfrRating === true ? (
                  isDocOk(nightVfrEvidenceDoc) ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[13px] text-green-400" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        <span className="text-[13px] font-semibold text-green-400">Uploaded</span>
                      </div>
                      {nightVfrEvidenceDoc && (
                        <button
                          type="button"
                          onClick={() => handleViewDocument(nightVfrEvidenceDoc)}
                          disabled={docViewLoadingType === nightVfrEvidenceDoc.document_type}
                          className="mt-0.5 inline-flex w-fit items-center gap-1 text-[12px] font-semibold text-blue-300 hover:text-blue-200 underline underline-offset-2"
                        >
                          {docViewLoadingType === nightVfrEvidenceDoc.document_type ? 'Opening…' : 'View'}
                          <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[13px] text-red-400">error</span>
                      <span className="text-[13px] font-semibold text-red-400">Missing</span>
                    </div>
                  )
                ) : (
                  <span className="text-[13px] font-medium text-[#8FA3BF]">Not required</span>
                )}
              </div>
            </div>
            {docViewError && <p className="col-span-2 md:col-span-4 text-sm text-red-300">{docViewError}</p>}
          </div>

          {/* ── Section 3: Additional information ── */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 py-7 border-b border-white/[0.07]">
            {/* Left */}
            <div className="flex gap-4 md:w-[270px] flex-shrink-0">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-[0_0_18px_rgba(37,99,235,0.40)]">
                  <span className="text-xl font-bold text-white">3</span>
                </div>
              </div>
              <div className="self-start pt-1">
                <h3 className="text-[22px] font-bold text-white leading-tight">Additional information</h3>
                <p className="text-[15px] text-slate-400 mt-1.5 leading-relaxed">Review your additional details and notes.</p>
              </div>
            </div>
            {/* Right: 2-column review card */}
            <div className="flex-1">
              <div className="bg-[#0f1e35] border border-white/[0.08] rounded-[18px] overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.07]">
                  <div className="flex gap-3 px-5 py-5">
                    <span className="material-symbols-outlined text-[17px] text-slate-500 mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>calendar_month</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#8FA3BF]">Last flight review</p>
                      <p className="text-[17px] font-semibold text-white mt-0.5">{lastFlightDate ? formatDate(lastFlightDate) : '—'}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 px-5 py-5">
                    <span className="material-symbols-outlined text-[17px] text-slate-500 mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>chat</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#8FA3BF]">Notes</p>
                      <p className="text-[17px] font-semibold text-white mt-0.5 leading-snug">{teamMessage.trim() || 'No additional notes provided.'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Submit error ── */}
          {submitError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-sm text-red-300">{submitError}</p>
            </div>
          )}

          {/* ── Payment notice ── */}
          <div className="bg-[#162d4a] border border-white/[0.08] rounded-2xl px-6 py-5 mt-2">
            <div className="flex items-start gap-3.5">
              <span className="material-symbols-outlined text-blue-300/80 text-[20px] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>info</span>
              <div>
                <p className="text-[17px] font-semibold text-white">No payment is required now.</p>
                <p className="text-[15px] text-slate-400 mt-1 leading-relaxed">Your final checkout amount will be calculated after the flight using the aircraft VDO meter reading, plus any landing fees.</p>
              </div>
            </div>
          </div>

          {/* ── Terms and conditions acceptance (final consent step) ── */}
          <div className="bg-[#0f1e35] border border-white/[0.08] rounded-[18px] px-5 py-5 mt-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-amber-200">Required before submit</p>
              {termsAccepted ? (
                <span className="text-[12px] font-semibold text-green-400 bg-green-500/10 border border-green-500/30 px-2.5 py-1 rounded-full whitespace-nowrap">Accepted</span>
              ) : (
                <span className="text-[12px] font-semibold text-amber-200/90 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-full whitespace-nowrap">Not accepted</span>
              )}
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
              <div className="flex items-start gap-4 flex-1">
                <span className="material-symbols-outlined text-[26px] text-slate-400 flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 300" }}>description</span>
                <div>
                  <p className="text-[15px] font-semibold text-white">Checkout terms and conditions</p>
                  <p className="text-sm text-slate-400 mt-1 leading-relaxed">Open and read the checkout terms document, then accept to enable submission.</p>
                </div>
              </div>
              <div className="flex flex-col items-start md:items-end gap-2.5 flex-shrink-0">
                <button
                  type="button"
                  disabled={isSubmitting || isPending}
                  onClick={() => {
                    setTermsModalOpen(true)
                    if (termsAccepted) {
                      setTermsScrolledToEnd(true)
                      setTermsModalChecked(true)
                    } else {
                      setTermsScrolledToEnd(false)
                      setTermsModalChecked(false)
                    }
                  }}
                  className="px-4 py-2.5 bg-white/[0.05] border border-white/[0.15] hover:border-blue-400/50 text-slate-200 hover:text-white rounded-xl text-sm font-semibold transition-all whitespace-nowrap disabled:opacity-50"
                >
                  Open terms
                </button>
              </div>
            </div>
            <label className={`mt-4 flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
              termsAccepted ? 'border-green-500/30 bg-green-500/[0.07]' : 'border-white/[0.12] bg-white/[0.03] hover:border-blue-400/45'
            }`}>
              <input
                type="checkbox"
                checked={termsAccepted}
                disabled={isSubmitting || isPending}
                onChange={(e) => {
                  if (e.target.checked) {
                    setTermsModalOpen(true)
                    setTermsScrolledToEnd(false)
                    setTermsModalChecked(false)
                    return
                  }
                  setTermsAccepted(false)
                  setTermsModalChecked(false)
                  setTermsScrolledToEnd(false)
                }}
                className="mt-0.5 h-4 w-4 accent-blue-500 cursor-pointer disabled:opacity-60"
              />
              <div className="space-y-1">
                <span className={`text-sm ${termsAccepted ? 'text-green-200' : 'text-slate-200'}`}>
                  I have read and accept the checkout terms and conditions.
                </span>
                {!termsAccepted && (
                  <p className="text-[12px] text-slate-400">
                    Check this to review and accept the terms. Submission stays disabled until accepted.
                  </p>
                )}
              </div>
            </label>
            {termsError && <p className="text-sm text-red-300 mt-2">{termsError}</p>}
            {!termsAccepted && (
              <p className="text-sm text-amber-200/80 mt-2">Please accept the terms and conditions to submit your checkout request.</p>
            )}
          </div>

          {/* ── Bottom buttons ── */}
          <div className="pt-7 mt-2 border-t border-white/[0.07] flex items-center justify-center gap-4">
            <button
              onClick={() => setStep('documents')}
              disabled={isPending || isSubmitting}
              className="w-[132px] h-12 border border-white/[0.15] hover:border-white/[0.30] text-slate-300 hover:text-white disabled:opacity-40 rounded-xl text-base font-semibold transition-all"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              data-testid="checkout-submit-request"
              disabled={
                isPending ||
                isSubmitting ||
                (nightVfrRating === false && !!startTime && !!date && !isWithinDayVfrWindow(startTime, date, 120)) ||
                !termsAccepted
              }
              className="w-[256px] h-12 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-base font-semibold transition-all shadow-[0_0_24px_rgba(37,99,235,0.35)]"
            >
              {(isPending || isSubmitting) ? 'Submitting…' : 'Submit Checkout Request'}
            </button>
          </div>

            </div>
          )}

      {termsModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-4xl bg-[#13243a] border border-[#4c6b8f] rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h4 className="text-sm font-semibold text-white">Checkout Terms and Conditions</h4>
              <button
                type="button"
                onClick={() => setTermsModalOpen(false)}
                className="text-white/30 hover:text-white/70 transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-300">
                Scroll to the end to enable acceptance.
              </p>
              <div
                data-testid="checkout-terms-scrollbox"
                className="h-[55vh] min-h-[340px] max-h-[680px] overflow-y-auto rounded-xl border border-white/10 bg-[#0b172b]"
                onScroll={(e) => {
                  const el = e.currentTarget
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
                    setTermsScrolledToEnd(true)
                  }
                }}
              >
                <div className="px-6 py-6 md:px-8 md:py-8">
                  <div className="max-w-3xl mx-auto space-y-8">
                    <div className="pb-5 border-b border-white/10 space-y-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-blue-200/80 font-bold">OZ Rent A Plane</p>
                      <h5 className="text-2xl md:text-3xl font-serif text-white">{TERMS_MODAL_TITLE}</h5>
                      <p className="text-sm text-slate-400">{TERMS_MODAL_SUBTITLE}</p>
                      <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3">
                        <p className="text-sm text-amber-100 leading-relaxed">{TERMS_NOTICE}</p>
                      </div>
                      <p className="text-xs text-slate-500">Version: {TERMS_LAST_UPDATED}</p>
                    </div>
                    {TERMS_SECTIONS.map((section) => (
                      <section key={`${section.number}-${section.title}`} className="space-y-2">
                        <div className="flex items-baseline gap-3">
                          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200/50">{section.number}</span>
                          <h6 className="text-lg md:text-xl font-serif text-slate-100">{section.title}</h6>
                        </div>
                        <div className="space-y-2 pl-6">
                          {section.blocks.map((block, idx) => (
                            block.type === 'paragraph' ? (
                              <p key={idx} className="text-sm md:text-[15px] leading-7 text-slate-300">{block.text}</p>
                            ) : (
                              <ul key={idx} className="list-disc list-outside ml-5 space-y-1 text-sm md:text-[15px] leading-7 text-slate-300">
                                {block.items.map((item, itemIdx) => (
                                  <li key={itemIdx}>{item}</li>
                                ))}
                              </ul>
                            )
                          ))}
                        </div>
                      </section>
                    ))}
                    <div className="pt-4 border-t border-white/10">
                      <p className="text-sm md:text-[15px] font-semibold text-slate-100">{TERMS_END_TEXT}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className={`text-sm ${termsScrolledToEnd ? 'text-green-300' : 'text-amber-300'}`}>
                {termsScrolledToEnd ? 'You have reached the end. You can now accept the terms.' : 'Scroll to the bottom to continue.'}
              </div>
            </div>
            <div className="sticky bottom-0 px-5 py-4 border-t border-white/[0.06] bg-[#0c1220] flex flex-col gap-3">
              <label className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${termsScrolledToEnd ? 'border-green-500/30 bg-green-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
                <input
                  type="checkbox"
                  checked={termsModalChecked}
                  disabled={!termsScrolledToEnd}
                  data-testid="checkout-terms-checkbox"
                  onChange={(e) => setTermsModalChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-blue-500 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="space-y-1">
                  <span className={`text-sm ${termsScrolledToEnd ? 'text-slate-200' : 'text-slate-400'}`}>
                    I have read and accept the Checkout Terms and Conditions.
                  </span>
                  {!termsScrolledToEnd && (
                    <p className="text-[11px] text-slate-500">
                      This checkbox is disabled until you scroll to the end of the document.
                    </p>
                  )}
                </div>
              </label>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setTermsModalOpen(false)}
                  className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTermsAccepted(true)
                    setTermsError(null)
                    setTermsModalOpen(false)
                  }}
                  disabled={!termsScrolledToEnd || !termsModalChecked}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
                >
                  Accept terms
                </button>
              </div>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

          {/* ── STEP 4: Success ───────────────────────────────────────────────── */}
          {step === 'success' && checkoutResult && (
            <div className={`${CARD} p-7 text-center space-y-5`}>
          <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-3xl text-green-400" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <div>
          <h2 className="text-2xl font-semibold text-white mb-3">Checkout request submitted</h2>
          <p className="text-base text-slate-300 leading-relaxed max-w-xl mx-auto">
              Your checkout request has been submitted for review. Our team will review your selected time and documents, then confirm the booking or suggest another time. Aircraft bookings will become available after your checkout flight is completed, approved, and any final amount has been paid.
            </p>
          </div>
          <div className="text-left bg-blue-500/[0.06] border border-blue-500/20 rounded-lg px-4 py-4 max-w-xl mx-auto">
            <h3 className="text-[12px] font-semibold text-blue-200 mb-2">What happens next</h3>
            <ol className="space-y-1 text-[14px] text-slate-200">
              <li>1. Our team reviews your selected time and documents.</li>
              <li>2. We will confirm the checkout flight or suggest another time.</li>
              <li>3. After the checkout flight, the final amount is calculated from the aircraft meter reading and any landing fees.</li>
              <li>4. Once completed, approved, and paid, you will be cleared to book aircraft.</li>
            </ol>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              onClick={() => router.push('/dashboard/bookings')}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-[0.15em] rounded-full transition-all"
            >
              View My Bookings
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="flex-1 py-3 border border-white/15 hover:border-blue-500/50 hover:bg-white/[0.03] text-slate-300 hover:text-white rounded-full text-[10px] font-semibold transition-all"
            >
              Go to Overview
            </button>
          </div>
            </div>
          )}
      </div>
    </div>
  )
}
