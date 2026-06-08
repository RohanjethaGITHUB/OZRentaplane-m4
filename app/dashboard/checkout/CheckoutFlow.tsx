'use client'

import { useState, useEffect, useTransition, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  submitCheckoutRequest,
  getCheckoutDocumentGateState,
  type CheckoutDocumentGateState,
} from '@/app/actions/checkout'
import {
  checkCustomerAvailability,
  getDayAvailability,
  type SafeConflict,
} from '@/app/actions/customer-availability'
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

type Step = 'time' | 'docs_check' | 'review' | 'success'

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
  if (lower.includes('no active checkout terms document')) {
    return 'Checkout terms are temporarily unavailable. Please refresh and try again.'
  }
  if (lower.includes('unable to record your terms acceptance')) {
    return 'Your checkout request was created but we could not record your terms acceptance. Please contact support.'
  }
  if (lower.includes('documents must be approved')) {
    return 'Your documents must be approved by our team before you can request a checkout flight. Please visit your Documents page.'
  }
  if (lower.includes('accept the terms and conditions on your documents page')) {
    return 'Please accept the terms and conditions on your Documents page before requesting a checkout flight.'
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
      <div
        className="relative"
        ref={barContainerRef}
        onTouchMove={(e) => {
          const touch = e.touches[0]
          if (!touch) return
          document.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: touch.clientX }))
        }}
        onTouchEnd={() => {
          document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 0 }))
        }}
      >
        <div className={`relative h-14 sm:h-10 rounded-lg overflow-hidden border ${dayVfrWindow ? 'bg-[#f0fdf4] border-green-200' : 'bg-green-50 border-green-200'}`}>
          {/* Day VFR window zones — only rendered when Night VFR = No */}
          {dayVfrWindow && (
            <>
              {/* Pre-dawn restricted */}
              <div
                className="absolute top-0 bottom-0 bg-[#1a3a6b]/90 flex items-center justify-center overflow-hidden"
                style={{ left: '0%', right: `${100 - (timeStrToMin(dayVfrWindow.start) / (24 * 60)) * 100}%` }}
              >
                <span className="text-[8px] text-[#eff6ff] select-none leading-none">🌙</span>
              </div>
              {/* Allowed Day VFR window — green */}
              <div
                className="absolute top-0 bottom-0 bg-green-400/30"
                style={{
                  left:  `${(timeStrToMin(dayVfrWindow.start) / (24 * 60)) * 100}%`,
                  right: `${100 - (timeStrToMin(dayVfrWindow.end) / (24 * 60)) * 100}%`,
                }}
              />
              {/* Post-dusk restricted */}
              <div
                className="absolute top-0 bottom-0 bg-[#1a3a6b]/90 flex items-center justify-center overflow-hidden"
                style={{ left: `${(timeStrToMin(dayVfrWindow.end) / (24 * 60)) * 100}%`, right: '0%' }}
              >
                <span className="text-[8px] text-[#eff6ff] select-none leading-none">🌙</span>
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
            onTouchStart={(e) => {
              const touch = e.touches[0]
              if (!touch) return
              handlePointerDown({ preventDefault: () => {}, pointerId: 1, clientX: touch.clientX } as React.PointerEvent<HTMLDivElement>)
            }}
            className={`absolute inset-y-[-2px] rounded-lg border-2 border-[#1a4fd6] bg-[#1a4fd6]/20 flex items-center justify-center transition-colors ${
              onTimeChange
                ? isDragging
                  ? 'cursor-grabbing bg-[#1a4fd6]/30 border-[#1a4fd6]'
                  : 'cursor-grab hover:bg-[#1a4fd6]/25 hover:border-[#1a4fd6]'
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
              <div className="flex flex-col items-center justify-center gap-[3px] pointer-events-none">
                <div className="w-4 h-[2px] rounded-full bg-[#1a4fd6]/60" />
                <div className="w-4 h-[2px] rounded-full bg-[#1a4fd6]/60" />
                <div className="w-4 h-[2px] rounded-full bg-[#1a4fd6]/60" />
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
          <span className="w-2.5 h-2.5 rounded-sm bg-green-400/50 inline-block" />{dayVfrWindow ? `Day VFR (${dayVfrWindow.start}–${dayVfrWindow.end})` : 'Available'}
        </span>
        {dayVfrWindow && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#1a3a6b] border border-[#93c5fd] inline-block" />Night restricted
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
        className="w-full bg-white border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/60 flex items-center justify-between transition-colors hover:border-[#152d5a]/30 disabled:opacity-40 disabled:cursor-not-allowed text-[#152d5a]"
      >
        <span className={value === '' ? 'text-[#94a3b8]' : ''}>{value === '' ? 'Select departure time' : selectedLabel}</span>
        <span
          className={`material-symbols-outlined text-[18px] text-[#94a3b8] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          style={{ fontVariationSettings: "'wght' 300" }}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#152d5a]/15 rounded-lg shadow-2xl overflow-hidden">
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
                    ? 'bg-[#dbeafe] text-[#152d5a] font-medium'
                    : 'text-[#4b6390] hover:bg-[#f8fbff] hover:text-[#152d5a]'
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
      <div className="fixed inset-0 z-[1000] flex items-start justify-center p-4 pt-24 md:pt-28 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[calc(100vh-7.5rem)] bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#152d5a]/10">
          <div>
            <p className="text-xs uppercase tracking-widest text-[#1a4fd6] font-bold">Checkout change request</p>
            <h3 className="text-lg font-semibold text-[#152d5a]">Request checkout reschedule</h3>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#152d5a] transition-colors">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        <div className="px-5 py-5 space-y-4 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#64748b] mb-2">Checkout date</p>
              <CalendarDateField
                value={date}
                onChange={(next) => { setDate(next); setStartTime(''); setError(null) }}
                minYear={new Date().getFullYear()}
                maxYear={new Date().getFullYear() + 2}
                minDate={minDateString()}
                className="w-full h-11 bg-white border border-[#152d5a]/15 rounded-xl px-4 py-3 text-base text-[#152d5a] text-left flex items-center justify-between"
              />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#64748b] mb-2">Departure time</p>
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
                      ? 'bg-[#dbeafe] border-[#93c5fd] text-[#152d5a]'
                      : 'bg-white border-[#152d5a]/15 text-[#4b6390]'
                  }`}
                >
                  {val ? 'Night VFR: Yes' : 'Night VFR: No (Day VFR only)'}
                </button>
              ))}
            </div>
          )}

          {date && (
            <div className="rounded-xl border border-[#152d5a]/10 bg-[#f8fbff] p-4">
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
          {nightVfrTimeError && <p className="text-sm text-amber-600">{nightVfrTimeError}</p>}
          {avail.status === 'checking' && <p className="text-sm text-[#64748b]">Checking availability…</p>}
          {avail.status === 'unavailable' && <p className="text-sm text-red-600">{avail.message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-[#152d5a]/10 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#4b6390] border border-[#152d5a]/15 rounded-lg">Keep current time</button>
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

  // Submission state
  const [submitError, setSubmitError]   = useState<string | null>(null)
  const [isPending, startTransition]    = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Result state
  const [checkoutResult, setCheckoutResult] = useState<CheckoutBookingResult | null>(null)
  const [activeBookingState, setActiveBookingState] = useState(activeCheckoutBooking)
  const [pendingRescheduleState, setPendingRescheduleState] = useState(pendingRescheduleRequest)
  const [checkoutGate, setCheckoutGate] = useState<CheckoutDocumentGateState | null>(null)
  const [checkoutGateLoading, setCheckoutGateLoading] = useState(false)
  const [checkoutGateError, setCheckoutGateError] = useState<string | null>(null)

  // Optional message to team
  const [teamMessage, setTeamMessage] = useState('')

  // Last flight date — pre-filled from profile so it stays in sync with Documents page
  const [lastFlightDate, setLastFlightDate] = useState(initialLastFlightDate)

  useEffect(() => {
    setActiveBookingState(activeCheckoutBooking)
    setPendingRescheduleState(pendingRescheduleRequest)
  }, [activeCheckoutBooking, pendingRescheduleRequest])

  useEffect(() => {
    if (step !== 'docs_check') return

    let cancelled = false
    setCheckoutGateLoading(true)
    setCheckoutGateError(null)

    getCheckoutDocumentGateState()
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          setCheckoutGate(result.state)
        } else {
          setCheckoutGate(null)
          setCheckoutGateError(result.error)
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setCheckoutGate(null)
        setCheckoutGateError(error instanceof Error ? error.message : 'Unable to load document status right now.')
      })
      .finally(() => {
        if (!cancelled) setCheckoutGateLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [step])

  useEffect(() => {
    if (prevStepRef.current !== step && step !== 'success') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
    prevStepRef.current = step
  }, [step])

  // ── Document gate ──────────────────────────────────────────────────────────
  const currentGateDocuments = checkoutGate?.documents ?? documents
  const currentGateTermAcceptedAt = checkoutGate?.termsAcceptedAt ?? null
  const currentGateDocMap = useMemo(() => {
    const map: Partial<Record<DocumentType, UserDocument>> = {}
    for (const doc of currentGateDocuments) {
      if (!map[doc.document_type]) {
        map[doc.document_type] = doc
      }
    }
    return map
  }, [currentGateDocuments])

  const requiredDocTypes: Array<{ type: DocumentType; label: string }> = [
    { type: 'pilot_licence', label: 'Pilot Licence' },
    { type: 'medical_certificate', label: 'Medical Certificate' },
    { type: 'photo_id', label: 'Photo ID' },
  ]
  const requiredDocChecks = requiredDocTypes.map(({ type, label }) => {
    const doc = currentGateDocMap[type]
    return {
      type,
      label,
      doc,
      approved: doc?.status === 'approved',
      missing: !doc,
    }
  })
  const docsGateReady = requiredDocChecks.every((entry) => entry.approved) && Boolean(currentGateTermAcceptedAt)

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
    setStep('docs_check')
  }

  function handleDocsCheckContinue() {
    if (!docsGateReady) return
    setStep('review')
  }

  function handleSubmit() {
    if (isSubmitting || isPending) return
    if (!startUTC) return
    setSubmitError(null)

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

    console.info('[checkout-submit-client]', {
      has_last_flight_date: Boolean(lastFlightDate),
      has_night_vfr: nightVfrRating,
      has_terms_accepted: Boolean(currentGateTermAcceptedAt),
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
          terms_accepted:        Boolean(currentGateTermAcceptedAt),
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

  // ── Shared card style ──────────────────────────────────────────────────────

  const CARD = 'bg-white border border-[#152d5a]/10 rounded-2xl shadow-[0_8px_20px_rgba(21,45,90,0.08)]'

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
          className="inline-flex items-center gap-1 text-[#1a4fd6] hover:text-[#2563eb] text-sm mb-8 transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to Overview
        </Link>
        <div className={`${CARD} p-8 text-center space-y-5`}>
          <div className="w-16 h-16 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-3xl text-blue-400" style={{ fontVariationSettings: "'wght' 300" }}>pending_actions</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[#152d5a] mb-3">Checkout Flight Scheduled</h2>
            <p className="text-sm text-[#4b6390] leading-relaxed max-w-md mx-auto">
              Your checkout is currently scheduled for {checkoutStartLabel} to {checkoutEndLabel} (Australia/Sydney).
            </p>
            {activeBookingState.checkout_lifecycle_status === 'cancelled_by_customer' && (
              <p className="text-sm text-emerald-600 mt-4">Your checkout flight has been cancelled.</p>
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
    <div className="w-full space-y-5">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-[13px] text-[#4b6390] hover:text-[#152d5a] transition-colors mb-2"
      >
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Back to Dashboard
      </Link>

      <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
        <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-[#152d5a]/10">
          <div className="flex items-center gap-4 py-3 md:py-0 md:px-6 md:first:pl-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-[#f0f6ff] flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[20px] text-[#1a4fd6]">flight</span>
            </div>
            <div>
              <div className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[#1a4fd6] mb-0.5">Aircraft</div>
              <div className="text-[15px] font-semibold text-[#152d5a]">
                {(aircraftDisplayName ?? 'Cessna 172N').replace('VH-KZG – ', '').replace('Cessna 172', 'Cessna 172N')}
              </div>
              <div className="text-[12px] text-[#4b6390]">{aircraftRegistration}</div>
            </div>
          </div>
          <div className="flex items-center gap-4 py-3 md:py-0 md:px-6 flex-1">
            <div className="w-10 h-10 rounded-full bg-[#f0f6ff] flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[20px] text-[#1a4fd6]">schedule</span>
            </div>
            <div>
              <div className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[#1a4fd6] mb-0.5">Duration</div>
              <div className="text-[15px] font-semibold text-[#152d5a]">Expected duration: 2 hours</div>
              <div className="text-[12px] text-[#4b6390]">Approx. 1 hr familiarisation + 1 hr checkout</div>
            </div>
          </div>
          <div className="flex items-center gap-4 py-3 md:py-0 md:px-6 md:last:pr-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-[#f0f6ff] flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[20px] text-[#1a4fd6]">sell</span>
            </div>
            <div>
              <div className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[#1a4fd6] mb-0.5">Rate</div>
              <div className="text-[15px] font-semibold text-[#152d5a]">${CHECKOUT_RATE} per VDO hour</div>
              <div className="text-[12px] text-[#4b6390]">Plus landing fee</div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full space-y-5">
        {/* ── STEP 1: Time selection ─────────────────────────────────────────── */}
        {step === 'time' && (
          <div ref={stepSectionRef} className="bg-white border border-[#152d5a]/10 rounded-2xl p-6 md:p-8">
            {aircraftStatus === 'inactive' || aircraftStatus === 'grounded' ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-300">
                This aircraft is currently unavailable. Please contact the flight operations team.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Top stepper — desktop only, hidden on mobile */}
                <div className="hidden lg:grid grid-cols-3 gap-0 mb-6 border-b border-[#152d5a]/10 pb-4">
                  {[
                    { num: 1, label: 'Checkout Date', done: date !== '', active: true },
                    { num: 2, label: 'Night VFR Rating', done: nightVfrRating !== null, active: date !== '' },
                    { num: 3, label: 'Departure Time', done: false, active: date !== '' && nightVfrRating !== null },
                  ].map((s) => (
                    <div key={s.num} className="flex items-center gap-2 px-4 first:pl-0">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 transition-colors duration-300 ${
                          s.done
                            ? 'bg-[#1a4fd6] text-white'
                            : s.active
                            ? 'bg-[#1a4fd6] text-white'
                            : 'bg-[#f0f6ff] border border-[#152d5a]/20 text-[#4b6390]'
                        }`}
                      >
                        {s.done && s.num < 3 ? (
                          <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                        ) : (
                          s.num
                        )}
                      </div>
                      <span className={`text-[13px] font-semibold transition-colors duration-300 ${s.active ? 'text-[#152d5a]' : 'text-[#94a3b8]'}`}>
                        {s.label}
                      </span>
                      {s.num < 3 && <div className="flex-1 h-px bg-[#e2e8f0] ml-2" />}
                    </div>
                  ))}
                </div>

                {/* ── Derived lock states ── */}
                {/* step2Locked and step3Locked are computed inline via the existing `date` and `nightVfrRating` state */}

                {/* ── Step sections ── */}
                {/* Mobile: stacked cards. Desktop: 2-col row 1 + full-width row 2 */}
                <div className="flex flex-col gap-4 lg:gap-0">

                  {/* ROW 1: Step 1 + Step 2 side by side on desktop */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-0 gap-4 lg:border lg:border-[#152d5a]/10 lg:rounded-2xl lg:overflow-hidden">

                    {/* ── Step 1: Checkout Date ── */}
                    <div className="rounded-2xl border border-[#152d5a]/10 bg-white p-5 lg:rounded-none lg:border-0 lg:border-r lg:border-[#152d5a]/10 lg:p-6">
                      {/* Card header */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-[#1a4fd6] flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-[13px] font-bold">1</span>
                        </div>
                        <p className="text-[15px] font-semibold text-[#152d5a]">Checkout Date</p>
                      </div>
                      <div className="w-full sm:max-w-[320px]">
                        <CalendarDateField
                          value={date}
                          onChange={(next) => { setDate(next); setStartTime(''); setAvail({ status: 'idle' }); setStepError(null); setSubmitError(null) }}
                          minYear={new Date().getFullYear()}
                          maxYear={new Date().getFullYear() + 2}
                          minDate={minDateString()}
                          className="w-full h-12 bg-white border border-[#152d5a]/15 rounded-xl px-4 py-3 text-base text-[#152d5a] focus:outline-none focus:border-blue-500/60 transition-colors text-left flex items-center justify-between"
                        />
                      </div>
                      <p className="text-[13px] text-[#94a3b8] mt-2">Choose a date that works best for your checkout.</p>
                    </div>

                    {/* ── Step 2: Night VFR Rating ── */}
                    <div className={`rounded-2xl border border-[#152d5a]/10 bg-white p-5 lg:rounded-none lg:border-0 lg:p-6 relative transition-opacity duration-300 ${date === '' ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                      {date === '' && (
                        <div className="absolute top-3 right-3 z-10">
                          <span className="inline-flex items-center gap-1 bg-[#f1f5f9] border border-[#152d5a]/10 text-[#4b6390] text-[11px] font-medium px-2 py-1 rounded-lg">
                            <span className="material-symbols-outlined text-[12px]">lock</span>
                            Complete step 1 first
                          </span>
                        </div>
                      )}
                      {/* Card header */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300 ${date !== '' ? 'bg-[#1a4fd6]' : 'bg-[#f0f6ff] border border-[#152d5a]/20'}`}>
                          <span className={`text-[13px] font-bold ${date !== '' ? 'text-white' : 'text-[#4b6390]'}`}>2</span>
                        </div>
                        <p className="text-[15px] font-semibold text-[#152d5a]">Night VFR Rating</p>
                      </div>
                      {date === '' && (
                        <p className="text-[13px] text-[#94a3b8] mt-3">Select a date above to continue.</p>
                      )}
                      <div className={date === '' ? 'hidden' : 'block mt-4'}>
                        <p className="text-[14px] text-[#4b6390]">Do you currently hold a Night VFR rating?</p>
                        <p className="text-[13px] text-[#64748b] mt-1">Only select &apos;Yes&apos; if this is current and you can upload supporting evidence.</p>
                        {date && nightVfrRating === false && (
                          <p className="text-[13px] text-[#4b6390] flex items-center gap-1.5 mt-2">
                            <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'wght' 300" }}>wb_sunny</span>
                            {getDayVfrWindow(date).start}–{getDayVfrWindow(date).end} Sydney time allowed. Bookings outside this window require Night VFR.
                          </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                          {([true, false] as const).map(val => (
                            <button
                              key={String(val)}
                              type="button"
                              onClick={() => { setNightVfrRating(val); setStepError(null); if (!val && startTime && !isWithinDayVfrWindow(startTime, date, 120)) setStartTime('') }}
                              className={`flex items-center gap-3.5 px-5 py-4 rounded-xl text-[15px] font-medium border transition-all text-left ${
                                nightVfrRating === val
                                  ? 'bg-[#dbeafe] border-[#93c5fd] text-[#152d5a] shadow-[0_0_14px_rgba(59,130,246,0.10)]'
                                  : 'bg-white border-[#152d5a]/15 text-[#4b6390] hover:text-[#152d5a] hover:border-blue-500/40'
                              }`}
                            >
                              <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                                nightVfrRating === val ? 'border-blue-400 bg-blue-500' : 'border-[#cbd5e1]'
                              }`}>
                                {nightVfrRating === val && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </span>
                              {val ? 'Yes, I hold a Night VFR rating' : 'No, Day VFR only'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                  </div>{/* end ROW 1 */}

                  {/* ROW 2: Step 3 — Departure Time (full width) */}
                  <div className={`rounded-2xl border border-[#152d5a]/10 bg-white p-5 lg:p-6 lg:mt-4 relative transition-opacity duration-300 ${(date === '' || nightVfrRating === null) ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                    {(date === '' || nightVfrRating === null) && (
                      <div className="absolute top-3 right-3 z-10">
                        <span className="inline-flex items-center gap-1 bg-[#f1f5f9] border border-[#152d5a]/10 text-[#4b6390] text-[11px] font-medium px-2 py-1 rounded-lg">
                          <span className="material-symbols-outlined text-[12px]">lock</span>
                          Complete steps 1 &amp; 2 first
                        </span>
                      </div>
                    )}
                    {/* Card header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300 ${date !== '' && nightVfrRating !== null ? 'bg-[#1a4fd6]' : 'bg-[#f0f6ff] border border-[#152d5a]/20'}`}>
                        <span className={`text-[13px] font-bold ${date !== '' && nightVfrRating !== null ? 'text-white' : 'text-[#4b6390]'}`}>3</span>
                      </div>
                      <p className="text-[15px] font-semibold text-[#152d5a]">Departure Time</p>
                    </div>
                    {(date === '' || nightVfrRating === null) && (
                      <p className="text-[13px] text-[#94a3b8] mt-3">Complete the steps above to continue.</p>
                    )}
                    <div className={(date === '' || nightVfrRating === null) ? 'hidden' : 'block mt-4'}>
                      {date && nightVfrRating !== null ? (
                        <>
                          <p className="text-[14px] text-[#4b6390]">Select an available departure time for your checkout flight.</p>
                          <p className="text-[13px] text-[#64748b] mt-1">Available times are based on aircraft availability and Day/Night VFR rules.</p>
                          <div className="mt-4 space-y-3">
                            <TimeDropdown
                              value={startTime}
                              options={timeOptions}
                              onChange={v => { setStartTime(v); setAvail({ status: 'idle' }); setStepError(null); setSubmitError(null) }}
                            />
                            {nightVfrTimeError && (
                              <p className="text-sm text-amber-600 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[13px]">warning</span>
                                {nightVfrTimeError}
                              </p>
                            )}
                            {startTime && (
                              <div className="bg-white border border-[#152d5a]/10 rounded-lg px-4 py-3">
                                <p className="text-[13px] font-semibold text-[#4b6390] mb-1.5">Selected checkout window</p>
                                <p className="text-[15px] font-medium text-[#152d5a]">
                                  {ALL_TIME_OPTIONS.find(o => o.value === startTime)?.label ?? startTime}
                                  <span className="mx-2 text-[#94a3b8]">→</span>
                                  {ALL_TIME_OPTIONS.find(o => o.value === endTime)?.label ?? endTime}
                                </p>
                                <p className="text-sm text-[#4b6390] mt-1">A 2-hour slot is reserved for scheduling.</p>
                                <p className="text-[13px] text-[#64748b] mt-2">Approximately 1 hour familiarisation with the aircraft and procedures.</p>
                                <p className="text-[13px] text-[#64748b] mt-1">Approximately 1 hour checkout flight.</p>
                              </div>
                            )}
                            <div className="rounded-xl border border-[#152d5a]/10 bg-[#f8fbff] p-4 md:p-5">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-[15px] font-semibold text-[#152d5a]">Daily schedule</p>
                                <p className="text-sm text-[#4b6390]">{formatDate(date)}</p>
                              </div>
                              {startTime && (
                                <p className="text-[13px] text-[#1a4fd6]/80 mb-3 flex items-center gap-1.5">
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
                              {avail.status === 'checking' && (
                                <p className="text-xs text-[#64748b] animate-pulse flex items-center gap-1.5 pt-2 pb-1">
                                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                  Checking availability…
                                </p>
                              )}
                              {avail.status === 'available' && !isTimeNightRestricted && (
                                <p className="text-[13px] font-medium text-green-600 flex items-center gap-1.5 pt-3">
                                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                  This time slot is available
                                </p>
                              )}
                              {avail.status === 'available' && isTimeNightRestricted && (
                                <p className="text-[13px] font-medium text-amber-600 flex items-center gap-1.5 pt-3">
                                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>nightlight</span>
                                  This time requires a Night VFR Rating.
                                </p>
                              )}
                              {avail.status === 'unavailable' && (
                                <p className="text-[13px] font-medium text-red-600 flex items-center gap-1.5 pt-3">
                                  <span className="material-symbols-outlined text-sm">block</span>
                                  {(avail as { status: 'unavailable'; message: string }).message}
                                </p>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-xl border border-dashed border-[#152d5a]/15 bg-[#f8fbff] px-4 py-6 text-sm text-[#94a3b8]">
                          Select a date and Night VFR rating to see available times.
                        </div>
                      )}
                    </div>
                  </div>{/* end ROW 2 */}
                </div>

                <div className="bg-[#f8f9fb] border border-[#152d5a]/10 rounded-xl p-4 flex items-center gap-3 relative overflow-hidden">
                  <div className="w-8 h-8 rounded-full bg-[#e8f0fe] flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#1a4fd6] text-[16px]" style={{ fontVariationSettings: "'wght' 300" }}>info</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-[#152d5a]">No payment is required at this stage.</p>
                    <p className="text-[12px] text-[#4b6390]">Your checkout flight will be reviewed by our team. You'll only be invoiced after your flight is confirmed and approved.</p>
                  </div>
                  <div className="absolute right-4 opacity-10 pointer-events-none">
                    <span className="material-symbols-outlined text-[#1a4fd6]" style={{ fontSize: '64px' }}>flight</span>
                  </div>
                </div>

                {stepError && (
                  <p className="text-xs text-red-600 flex items-center gap-1.5 mt-3">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {stepError}
                  </p>
                )}

                {(!date || nightVfrRating === null || !startTime || avail.status !== 'available' || isTimeNightRestricted) && (
                  <p className="text-xs text-[#64748b] text-center mt-3">Complete all required fields to continue.</p>
                )}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="inline-flex items-center gap-2 border border-[#152d5a]/25 text-[#152d5a] font-semibold rounded-xl py-3.5 px-7 hover:bg-[#f0f6ff] transition-colors text-[14px]"
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    Back to Dashboard
                  </button>
                  <button
                    onClick={handleTimeNext}
                    data-testid="checkout-step1-continue"
                    disabled={!date || nightVfrRating === null || !startTime || avail.status !== 'available' || isTimeNightRestricted}
                    className="inline-flex items-center gap-2 bg-[#f59e0b] hover:bg-[#e08c00] text-white font-semibold rounded-xl py-3.5 px-7 transition-colors text-[14px]"
                  >
                    Continue to Documents
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

          {/* ── STEP 2: Document verification ───────────────────────────────── */}
          {step === 'docs_check' && (
            <div ref={stepSectionRef} className={`${CARD} p-6 md:p-8 space-y-6`}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-[32px] font-bold text-[#152d5a] tracking-tight leading-tight">
                    Document verification
                  </h2>
                  <p className="text-[15px] text-[#4b6390] mt-2 leading-relaxed">
                    We check your approved documents and terms acceptance before you can continue.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/documents')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#152d5a]/15 text-[#4b6390] hover:text-[#152d5a] hover:border-[#152d5a]/30 transition-all text-sm font-semibold"
                >
                  <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>
                    folder_open
                  </span>
                  Go to Documents page
                </button>
              </div>

              {checkoutGateLoading && !checkoutGateError ? (
                <div className="rounded-[1.25rem] border border-[#152d5a]/10 bg-white px-6 py-8 flex items-center gap-3 text-[#4b6390]">
                  <span className="material-symbols-outlined text-[#1a4fd6] animate-spin">progress_activity</span>
                  Loading your current document status…
                </div>
              ) : checkoutGateError ? (
                <div className="rounded-[1.25rem] border border-red-500/20 bg-red-500/5 px-6 py-5 space-y-3">
                  <p className="text-sm font-semibold text-red-200">Could not load your document status</p>
                  <p className="text-sm text-red-200/80">{checkoutGateError}</p>
                  <button
                    type="button"
                    onClick={() => setStep('docs_check')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/15 border border-red-500/25 text-red-100 hover:bg-red-500/25 transition-colors text-sm font-semibold"
                  >
                    Retry
                  </button>
                </div>
              ) : docsGateReady ? (
                <div className="rounded-[1.25rem] border border-green-500/20 bg-green-500/5 px-6 py-6 space-y-4">
                  <div className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-green-400 text-2xl mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_circle
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xl font-semibold text-green-100">Documents verified</h3>
                      <p className="text-sm text-green-100/80 mt-1">
                        Your documents are approved and you&apos;re ready to proceed.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleDocsCheckContinue}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-100 hover:bg-green-500/30 transition-colors text-sm font-semibold"
                    >
                      Continue to Review
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.25rem] border border-amber-500/20 bg-amber-500/5 px-6 py-6 space-y-4">
                  <div className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-amber-300 text-2xl mt-0.5" style={{ fontVariationSettings: "'wght' 300" }}>
                      warning
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xl font-semibold text-amber-100">Documents required</h3>
                      <p className="text-sm text-amber-100/80 mt-1">
                        You need approved documents and accepted terms before you can continue.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {requiredDocChecks.map((entry) => (
                      <div key={entry.type} className="flex items-start justify-between gap-4 rounded-xl border border-[#152d5a]/10 bg-white px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#152d5a]">{entry.label}</p>
                          <p className="text-xs text-[#64748b] mt-1">
                            {entry.missing
                              ? 'Not uploaded'
                              : entry.doc?.status === 'approved'
                                ? 'Approved'
                                : 'Uploaded, but not yet approved'}
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full flex-shrink-0 ${
                          entry.approved
                            ? 'text-green-300 bg-green-500/10 border border-green-500/20'
                            : 'text-amber-200 bg-amber-500/10 border border-amber-500/20'
                        }`}>
                          {entry.approved ? 'Approved' : entry.missing ? 'Missing' : 'Pending'}
                        </span>
                      </div>
                    ))}
                    {!currentGateTermAcceptedAt && (
                      <div className="rounded-xl border border-[#152d5a]/10 bg-white px-4 py-3">
                        <p className="text-sm font-semibold text-[#152d5a]">Terms and conditions</p>
                        <p className="text-xs text-[#64748b] mt-1">
                          Please accept the terms and conditions on your Documents page.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Review & Submit ───────────────────────────────────────── */}
          {step === 'review' && startUTC && endUTC && (
            <div ref={stepSectionRef} className={`${CARD} p-6 md:p-8`}>

          {/* ── Section 1: Checkout details ── */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 py-7 border-b border-[#152d5a]/10">
            {/* Left */}
            <div className="flex gap-4 md:w-[270px] flex-shrink-0">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-[0_0_18px_rgba(37,99,235,0.40)]">
                  <span className="text-xl font-bold text-white">1</span>
                </div>
              </div>
              <div className="self-start pt-1">
                <h3 className="text-[22px] font-bold text-[#152d5a] leading-tight">Checkout details</h3>
                <p className="text-[15px] text-[#4b6390] mt-1.5 leading-relaxed">Review your flight and pricing details.</p>
              </div>
            </div>
            {/* Right: 2×3 review card */}
            <div className="flex-1">
              <div className="bg-white border border-[#152d5a]/10 rounded-[18px] overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2">
                  {/* Row 1 */}
                  <div className="flex gap-3 px-5 py-4 border-b border-[#152d5a]/10 md:border-r md:border-b border-[#152d5a]/10">
                    <span className="material-symbols-outlined text-[17px] text-[#64748b] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>calendar_month</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#64748b]">Date</p>
                      <p className="text-[17px] font-semibold text-[#152d5a] mt-0.5">{formatDate(date)}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 px-5 py-4 border-b border-[#152d5a]/10">
                    <span className="material-symbols-outlined text-[17px] text-[#64748b] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>schedule</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#64748b]">Departure time</p>
                      <p className="text-[17px] font-semibold text-[#152d5a] mt-0.5">{formatDateTime(startUTC)}</p>
                    </div>
                  </div>
                  {/* Row 2 */}
                  <div className="flex gap-3 px-5 py-4 border-b border-[#152d5a]/10 md:border-r border-[#152d5a]/10">
                    <span className="material-symbols-outlined text-[17px] text-[#64748b] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>{nightVfrRating ? 'nightlight' : 'wb_sunny'}</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#64748b]">Night VFR</p>
                      <p className="text-[17px] font-semibold text-[#152d5a] mt-0.5">{nightVfrRating ? 'Yes — Night VFR held' : 'No – Day VFR only'}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 px-5 py-4 border-b border-[#152d5a]/10">
                    <span className="material-symbols-outlined text-[17px] text-[#64748b] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>timer</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#64748b]">Duration</p>
                      <p className="text-[17px] font-semibold text-[#152d5a] mt-0.5">Expected duration: 2 hours</p>
                      <p className="text-[13px] text-[#4b6390] mt-1">Approximately 1 hour familiarisation with the aircraft and procedures</p>
                      <p className="text-[13px] text-[#4b6390] mt-0.5">Approximately 1 hour checkout flight</p>
                    </div>
                  </div>
                  {/* Row 3 */}
                  <div className="flex gap-3 px-5 py-4 md:border-r border-[#152d5a]/10">
                    <span className="material-symbols-outlined text-[17px] text-[#64748b] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>payments</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#64748b]">Rate</p>
                      <p className="text-[17px] font-semibold text-[#152d5a] mt-0.5">${CHECKOUT_RATE} per VDO hour + landing fee</p>
                    </div>
                  </div>
                  <div className="flex gap-3 px-5 py-4">
                    <span className="material-symbols-outlined text-[17px] text-[#64748b] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>schedule</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#64748b]">Return time (AEST)</p>
                      <p className="text-[17px] font-semibold text-[#152d5a] mt-0.5">{formatDateTime(endUTC)}</p>
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

          {/* ── Section 3: Additional information ── */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 py-7 border-b border-[#152d5a]/10">
            {/* Left */}
            <div className="flex gap-4 md:w-[270px] flex-shrink-0">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-[0_0_18px_rgba(37,99,235,0.40)]">
                  <span className="text-xl font-bold text-white">3</span>
                </div>
              </div>
              <div className="self-start pt-1">
                <h3 className="text-[22px] font-bold text-[#152d5a] leading-tight">Additional information</h3>
                <p className="text-[15px] text-[#4b6390] mt-1.5 leading-relaxed">Review your additional details and notes.</p>
              </div>
            </div>
            {/* Right: 2-column review card */}
            <div className="flex-1">
              <div className="bg-white border border-[#152d5a]/10 rounded-[18px] overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#152d5a]/10">
                  <div className="flex gap-3 px-5 py-5">
                    <span className="material-symbols-outlined text-[17px] text-[#64748b] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>calendar_month</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#64748b]">Last flight review</p>
                      <p className="text-[17px] font-semibold text-[#152d5a] mt-0.5">{lastFlightDate ? formatDate(lastFlightDate) : '—'}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 px-5 py-5">
                    <span className="material-symbols-outlined text-[17px] text-[#64748b] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>chat</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#64748b]">Notes</p>
                      <p className="text-[17px] font-semibold text-[#152d5a] mt-0.5 leading-snug">{teamMessage.trim() || 'No additional notes provided.'}</p>
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
          <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-2xl px-6 py-5 mt-2">
            <div className="flex items-start gap-3.5">
              <span className="material-symbols-outlined text-[#1a4fd6] text-[20px] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>info</span>
              <div>
                <p className="text-[17px] font-semibold text-[#152d5a]">No payment is required now.</p>
                <p className="text-[15px] text-[#4b6390] mt-1 leading-relaxed">Your final checkout amount will be calculated after the flight using the aircraft VDO meter reading, plus any landing fees.</p>
              </div>
            </div>
          </div>

          {/* ── Bottom buttons ── */}
          <div className="pt-7 mt-2 border-t border-[#152d5a]/10 flex items-center justify-center gap-4">
            <button
              onClick={() => setStep('docs_check')}
              disabled={isPending || isSubmitting}
              className="w-[132px] h-12 border border-[#152d5a]/15 hover:border-[#152d5a]/30 text-[#4b6390] hover:text-[#152d5a] disabled:opacity-40 rounded-xl text-base font-semibold transition-all"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              data-testid="checkout-submit-request"
              disabled={
                isPending ||
                isSubmitting ||
                (nightVfrRating === false && !!startTime && !!date && !isWithinDayVfrWindow(startTime, date, 120))
              }
              className="w-[256px] h-12 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-base font-semibold transition-all shadow-[0_0_24px_rgba(37,99,235,0.35)]"
            >
              {(isPending || isSubmitting) ? 'Submitting…' : 'Submit Checkout Request'}
            </button>
          </div>

            </div>
          )}

          {/* ── STEP 4: Success ───────────────────────────────────────────────── */}
          {step === 'success' && checkoutResult && (
            <div className={`${CARD} p-7 text-center space-y-5`}>
          <div className="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-3xl text-green-400" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <div>
          <h2 className="text-2xl font-semibold text-[#152d5a] mb-3">Checkout request submitted</h2>
          <p className="text-base text-[#4b6390] leading-relaxed max-w-xl mx-auto">
              Your checkout request has been submitted for review. Our team will review your selected time and documents, then confirm the booking or suggest another time. Aircraft bookings will become available after your checkout flight is completed, approved, and any final amount has been paid.
            </p>
          </div>
          <div className="text-left bg-[#eff6ff] border border-[#bfdbfe] rounded-lg px-4 py-4 max-w-xl mx-auto">
            <h3 className="text-[12px] font-semibold text-[#1e40af] mb-2">What happens next</h3>
            <ol className="space-y-1 text-[14px] text-[#152d5a]">
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
              className="flex-1 py-3 border border-[#152d5a]/15 hover:border-blue-500/50 hover:bg-[#f8fbff] text-[#4b6390] hover:text-[#152d5a] rounded-full text-[10px] font-semibold transition-all"
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
