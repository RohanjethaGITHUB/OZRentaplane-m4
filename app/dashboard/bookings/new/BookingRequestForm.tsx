'use client'

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBooking } from '@/app/actions/booking'
import {
  checkCustomerAvailability,
  getDayAvailability,
  type SafeConflict,
  type AvailabilityCheckResult,
} from '@/app/actions/customer-availability'
import type { CreateBookingInput } from '@/lib/supabase/booking-types'
import {
  sydneyInputToUTC,
  formatSydTime,
} from '@/lib/utils/sydney-time'

// ── Pricing constants (replace with DB config when available) ─────────────────

const PACK_10H_DISCOUNT = 0.15 // 15% off standard rate
const PACK_20H_DISCOUNT = 0.25 // 25% off standard rate

// ── Types ──────────────────────────────────────────────────────────────────────

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available';   message: string; debugError?: string }
  | { status: 'unavailable'; message: string; conflicts: SafeConflict[]; debugError?: string }

type TimeOption = { value: string; label: string }

type Props = {
  aircraftId:           string
  aircraftRegistration: string
  aircraftType:         string
  aircraftStatus:       string
  hourlyRate:           number
  picName:              string | null
  picArn:               string | null
  eligibilityBlocked:   boolean
  eligibilityWarnings:  string[]
}

// ── Time options (5 AM – 9:30 PM, 30-min increments) ─────────────────────────

const ALL_TIME_OPTIONS: TimeOption[] = (() => {
  const opts: TimeOption[] = []
  for (let h = 5; h <= 21; h++) {
    for (let m = 0; m < 60; m += 30) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const ampm  = h < 12 ? 'AM' : 'PM'
      const h12   = h === 0 ? 12 : h > 12 ? h - 12 : h
      opts.push({ value, label: `${h12}:${String(m).padStart(2, '0')} ${ampm}` })
    }
  }
  return opts
})()

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Format a YYYY-MM-DD string for display as "22 Apr 2026". */
function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Format a combined "YYYY-MM-DDTHH:MM" Sydney-local value as AU-style string. */
function formatInputAsAU(dtLocal: string): string {
  if (!dtLocal) return '—'
  const utc = sydneyInputToUTC(dtLocal)
  if (!utc) return '—'
  return new Date(utc).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Format fractional hours as "Xh Ym". */
function formatDuration(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Format a number as "$X,XXX". */
function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-AU')}`
}

// ── Availability Timeline ──────────────────────────────────────────────────────
//
// Architecture: two separate layers so red and blue never visually blend.
//   Layer 1 — the bar (overflow-hidden): green base + red unavailable blocks clipped inside.
//   Layer 2 — absolute overlay outside the clip: blue selected-window bracket on top.

function AvailabilityTimeline({
  selectedDate,
  daySlots,
  startDT,
  endDT,
}: {
  selectedDate: string
  daySlots: SafeConflict[]
  startDT: string
  endDT: string
}) {
  const OP_START = 5  // 5 AM
  const OP_END   = 21 // 9 PM

  if (!selectedDate) return null

  const opStartUTC = sydneyInputToUTC(
    `${selectedDate}T${String(OP_START).padStart(2, '0')}:00`,
  )
  const opEndUTC = sydneyInputToUTC(
    `${selectedDate}T${String(OP_END).padStart(2, '0')}:00`,
  )
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
  const hasSelection =
    !!(selStartUTC && selEndUTC && new Date(selEndUTC) > new Date(selStartUTC))

  const visibleSlots = daySlots.filter(s => {
    const end   = new Date(s.end_time).getTime()
    const start = new Date(s.start_time).getTime()
    return end > opStartMs && start < opEndMs
  })

  // Hour ticks every 3h
  const ticks: number[] = []
  for (let h = OP_START; h <= OP_END; h += 3) ticks.push(h)

  function hourLabel(h: number) {
    if (h === 12) return '12pm'
    return h < 12 ? `${h}am` : `${h - 12}pm`
  }

  const selLeft  = hasSelection ? toPercent(selStartUTC!) : 0
  const selRight = hasSelection ? 100 - toPercent(selEndUTC!) : 0

  return (
    <div className="space-y-3">

      {/* ── Two-layer timeline ── */}
      <div className="relative">

        {/* Layer 1: bar with green base + red unavailable blocks (clipped) */}
        <div className="relative h-6 bg-green-500/20 rounded-full overflow-hidden border border-green-500/15">
          {visibleSlots.map((slot, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 bg-red-500/70"
              style={{
                left:  `${toPercent(slot.start_time)}%`,
                right: `${100 - toPercent(slot.end_time)}%`,
              }}
              title={slot.label}
            />
          ))}
        </div>

        {/* Layer 2: blue selected-window bracket (sits on top, outside clip) */}
        {hasSelection && (
          <div
            className="absolute inset-y-[-2px] rounded-full border-2 border-blue-400/90 bg-blue-500/10 pointer-events-none"
            style={{ left: `${selLeft}%`, right: `${selRight}%` }}
          />
        )}
      </div>

      {/* Hour tick labels */}
      <div className="relative h-4">
        {ticks.map(h => {
          const pct = ((h - OP_START) / (OP_END - OP_START)) * 100
          return (
            <span
              key={h}
              className="absolute text-[9px] text-slate-600 -translate-x-1/2 select-none"
              style={{ left: `${pct}%` }}
            >
              {hourLabel(h)}
            </span>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 pt-0.5">
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-3 h-2 rounded-sm bg-green-500/40 inline-block flex-shrink-0" />
          Available
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-3 h-2 rounded-sm bg-red-500/70 inline-block flex-shrink-0" />
          Unavailable
        </span>
        {hasSelection && (
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-2 rounded-sm border-2 border-blue-400/80 inline-block flex-shrink-0" />
            Selected flight
          </span>
        )}
      </div>
    </div>
  )
}

// ── Summary row ────────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  mono = false,
  dim = false,
  highlight = false,
}: {
  label: string
  value: string
  mono?: boolean
  dim?: boolean
  highlight?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold flex-shrink-0">
        {label}
      </span>
      <span className={`text-xs text-right leading-snug
        ${mono ? 'font-mono tabular-nums' : ''}
        ${highlight ? 'text-white font-semibold text-sm' : ''}
        ${!highlight && !dim ? 'text-white/90' : ''}
        ${dim ? 'text-slate-500' : ''}
      `}>
        {value}
      </span>
    </div>
  )
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepIndicator() {
  const steps = [
    { label: 'Requirements',    state: 'done'     },
    { label: 'Flight Time',     state: 'active'   },
    { label: 'Review & Submit', state: 'upcoming' },
  ] as const

  return (
    <div className="flex items-center">
      {steps.map((step, idx) => (
        <div key={step.label} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold
              ${step.state === 'done'     ? 'bg-green-500/20 border border-green-500/40 text-green-400' : ''}
              ${step.state === 'active'   ? 'bg-blue-600/25 border border-blue-500/60 text-blue-400' : ''}
              ${step.state === 'upcoming' ? 'bg-white/5 border border-white/10 text-slate-600' : ''}
            `}>
              {step.state === 'done' ? (
                <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'wght' 600" }}>check</span>
              ) : (
                idx + 1
              )}
            </div>
            <span className={`text-[11px] font-medium hidden sm:block
              ${step.state === 'done'     ? 'text-green-400/70' : ''}
              ${step.state === 'active'   ? 'text-white' : ''}
              ${step.state === 'upcoming' ? 'text-slate-600' : ''}
            `}>
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className={`w-6 sm:w-10 h-px mx-2 flex-shrink-0
              ${idx === 0 ? 'bg-green-500/30' : 'bg-white/8'}
            `} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Info bar item ──────────────────────────────────────────────────────────────

function InfoItem({
  icon,
  label,
  value,
  warn = false,
  mono = false,
}: {
  icon: string
  label: string
  value: string
  warn?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={`material-symbols-outlined text-base flex-shrink-0 ${warn ? 'text-amber-400' : 'text-blue-500/50'}`}
        style={{ fontVariationSettings: "'wght' 300" }}
      >
        {warn ? 'warning' : icon}
      </span>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold leading-none mb-0.5">{label}</p>
        <p className={`text-xs font-medium truncate ${mono ? 'font-mono' : ''} ${warn ? 'text-amber-300' : 'text-white/85'}`}>
          {value}
        </p>
      </div>
    </div>
  )
}

// ── Date input ─────────────────────────────────────────────────────────────────

function DateInput({
  value,
  min,
  disabled,
  onChange,
}: {
  value: string
  min?: string
  disabled?: boolean
  onChange: (v: string) => void
}) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={`
        w-full px-4 py-3.5 bg-[#070d1a] border border-white/10
        focus:border-blue-500/50 focus:outline-none rounded-xl
        text-white text-sm transition-colors [color-scheme:dark]
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-white/20'}
      `}
    />
  )
}

// ── Time select ────────────────────────────────────────────────────────────────

function TimeSelect({
  value,
  options,
  disabled,
  placeholder,
  onChange,
}: {
  value: string
  options: TimeOption[]
  disabled?: boolean
  placeholder: string
  onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className={`
          w-full pl-4 pr-9 py-3.5 bg-[#070d1a] border border-white/10
          focus:border-blue-500/50 focus:outline-none rounded-xl
          text-sm transition-colors appearance-none
          ${disabled ? 'opacity-40 cursor-not-allowed text-slate-500' : 'cursor-pointer text-white hover:border-white/20'}
          ${!value ? 'text-slate-500' : ''}
        `}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span
        className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-base pointer-events-none"
        style={{ fontVariationSettings: "'wght' 300" }}
      >
        expand_more
      </span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BookingRequestForm({
  aircraftId,
  aircraftRegistration,
  aircraftType,
  aircraftStatus,
  hourlyRate,
  picName,
  picArn,
  eligibilityBlocked,
  eligibilityWarnings,
}: Props) {
  const router = useRouter()
  const [isSubmitting, startSubmit] = useTransition()

  // ── Split date/time state ─────────────────────────────────────────────────
  const [startDate, setStartDate] = useState('')  // YYYY-MM-DD
  const [startTime, setStartTime] = useState('')  // HH:MM
  const [endDate,   setEndDate]   = useState('')
  const [endTime,   setEndTime]   = useState('')
  const [notes,     setNotes]     = useState('')
  const [medical,   setMedical]   = useState(false)
  const [terms,     setTerms]     = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Derived combined datetime strings (used by all existing logic) ────────
  const startDT = startDate && startTime ? `${startDate}T${startTime}` : ''
  const endDT   = endDate   && endTime   ? `${endDate}T${endTime}`     : ''

  // ── Availability state ────────────────────────────────────────────────────
  const [availability, setAvailability] = useState<AvailabilityState>({ status: 'idle' })
  const [packOpen, setPackOpen] = useState(false)

  // ── Min date/time (1 hour from now in Sydney) ─────────────────────────────
  const { minDate, minTimeToday } = useMemo(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    return {
      minDate:      d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }),
      minTimeToday: d.toLocaleTimeString('sv-SE', { timeZone: 'Australia/Sydney' }).slice(0, 5),
    }
  }, [])

  // ── Filtered time options ─────────────────────────────────────────────────
  const startTimeOptions = useMemo(() => {
    if (startDate === minDate) return ALL_TIME_OPTIONS.filter(o => o.value >= minTimeToday)
    return ALL_TIME_OPTIONS
  }, [startDate, minDate, minTimeToday])

  const endTimeOptions = useMemo(() => {
    // Same day as departure → only times strictly after departure time
    if (endDate && startDate && endDate === startDate && startTime) {
      return ALL_TIME_OPTIONS.filter(o => o.value > startTime)
    }
    return ALL_TIME_OPTIONS
  }, [endDate, startDate, startTime])

  // ── Cascade handlers ──────────────────────────────────────────────────────

  function handleStartDateChange(date: string) {
    setStartDate(date)
    // Clear start time if it's now before the minimum on today
    if (date === minDate && startTime && startTime < minTimeToday) {
      setStartTime('')
    }
    // Clear end if it's now before the new start date
    if (endDate && date > endDate) {
      setEndDate('')
      setEndTime('')
    }
  }

  function handleStartTimeChange(time: string) {
    setStartTime(time)
    // Clear end time if same day and now invalid
    if (endDate && startDate && endDate === startDate && endTime && endTime <= time) {
      setEndTime('')
    }
  }

  function handleEndDateChange(date: string) {
    setEndDate(date)
    // Clear end time if same day as start and current end time is invalid
    if (date === startDate && endTime && startTime && endTime <= startTime) {
      setEndTime('')
    }
  }

  // ── Live availability check (debounced 600ms) ─────────────────────────────
  const runAvailabilityCheck = useCallback(
    async (start: string, end: string) => {
      const startUTC = sydneyInputToUTC(start)
      const endUTC   = sydneyInputToUTC(end)
      if (!startUTC || !endUTC) return
      if (new Date(endUTC) <= new Date(startUTC)) return

      setAvailability({ status: 'checking' })

      let result: AvailabilityCheckResult
      try {
        result = await checkCustomerAvailability(aircraftId, startUTC, endUTC)
      } catch {
        setAvailability({
          status: 'unavailable',
          message: 'Unable to check availability. Please try again.',
          conflicts: [],
        })
        return
      }

      if (result.available) {
        setAvailability({ status: 'available', message: result.message, debugError: result.debugError })
      } else {
        setAvailability({
          status: 'unavailable',
          message: result.message,
          conflicts: result.conflicts,
          debugError: result.debugError,
        })
      }
    },
    [aircraftId],
  )

  useEffect(() => {
    if (!startDT || !endDT) {
      setAvailability({ status: 'idle' })
      return
    }
    const timer = setTimeout(() => runAvailabilityCheck(startDT, endDT), 600)
    return () => clearTimeout(timer)
  }, [startDT, endDT, runAvailabilityCheck])

  // ── Day availability slots ────────────────────────────────────────────────
  const selectedDate = startDate // same as getDatePart(startDT)
  const [daySlots, setDaySlots]               = useState<SafeConflict[]>([])
  const [daySlotsLoading, setDaySlotsLoading] = useState(false)
  const [daySlotsError, setDaySlotsError]     = useState(false)

  useEffect(() => {
    if (!selectedDate) {
      setDaySlots([])
      setDaySlotsError(false)
      return
    }
    let active = true
    setDaySlotsLoading(true)
    setDaySlotsError(false)
    getDayAvailability(aircraftId, selectedDate)
      .then(slots => {
        if (!active) return
        setDaySlots(slots)
        setDaySlotsLoading(false)
      })
      .catch(err => {
        console.error('Failed to load day slots:', err)
        if (!active) return
        setDaySlotsError(true)
        setDaySlotsLoading(false)
      })
    return () => { active = false }
  }, [aircraftId, selectedDate])

  // ── Estimated duration ────────────────────────────────────────────────────
  const estimatedHours = useMemo(() => {
    const s = sydneyInputToUTC(startDT)
    const e = sydneyInputToUTC(endDT)
    if (!s || !e) return null
    const mins = (new Date(e).getTime() - new Date(s).getTime()) / 60000
    return mins > 0 ? mins / 60 : null
  }, [startDT, endDT])

  // ── Pricing ───────────────────────────────────────────────────────────────
  const standardCost = estimatedHours != null ? estimatedHours * hourlyRate : null
  const pack10Cost   = standardCost   != null ? standardCost * (1 - PACK_10H_DISCOUNT) : null
  const pack20Cost   = standardCost   != null ? standardCost * (1 - PACK_20H_DISCOUNT) : null

  // ── Submit gate ───────────────────────────────────────────────────────────
  const endIsBeforeStart = !!(startDT && endDT && endDT <= startDT)

  const canSubmit =
    !isSubmitting &&
    !eligibilityBlocked &&
    !!startDT &&
    !!endDT &&
    !endIsBeforeStart &&
    availability.status === 'available' &&
    medical &&
    terms

  function getDisabledReason(): string | null {
    if (eligibilityBlocked) return 'Booking access is suspended. See the eligibility notice above.'
    if (!startDate || !startTime) return 'Choose an available time and complete the required confirmations to continue.'
    if (!endDate || !endTime) return 'Select an estimated return date and time.'
    if (endIsBeforeStart) return 'Estimated return must be after departure.'
    if (availability.status === 'checking') return 'Checking availability…'
    if (availability.status === 'unavailable') return 'Selected time is unavailable.'
    if (!medical || !terms) return 'Please complete the required confirmations.'
    return null
  }

  // ── Handle submit ─────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    if (!startDT || !endDT) {
      setSubmitError('Please select a departure and estimated return time.')
      return
    }
    const startUTC = sydneyInputToUTC(startDT)
    const endUTC   = sydneyInputToUTC(endDT)
    if (!startUTC || !endUTC) {
      setSubmitError('Invalid date/time values.')
      return
    }
    if (new Date(endUTC) <= new Date(startUTC)) {
      setSubmitError('Estimated return time must be after departure.')
      return
    }
    if (eligibilityBlocked) {
      setSubmitError('Booking access is currently suspended. Please review your pilot verification status.')
      return
    }
    if (availability.status !== 'available') {
      setSubmitError('Please wait for the availability check to complete, or choose a different time.')
      return
    }
    if (!medical || !terms) {
      setSubmitError('You must complete the required confirmations.')
      return
    }

    const input: CreateBookingInput = {
      aircraft_id:                    aircraftId,
      scheduled_start:                startUTC,
      scheduled_end:                  endUTC,
      pic_name:                       picName  ?? undefined,
      pic_arn:                        picArn   ?? undefined,
      customer_notes:                 notes || null,
      terms_accepted:                 terms,
      risk_acknowledgement_accepted:  medical,
    }

    startSubmit(async () => {
      try {
        const { bookingId } = await createBooking(input)
        router.push(`/dashboard/bookings/${bookingId}`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Something went wrong.'
        if (msg.includes('AVAILABILITY') || msg.includes('conflict') || msg.includes('unavailable')) {
          setSubmitError('This time was just taken or blocked. Please choose another window.')
        } else if (msg.includes('VALIDATION')) {
          setSubmitError(msg.replace('VALIDATION:', '').trim())
        } else if (msg.includes('VERIFICATION_REQUIRED')) {
          setSubmitError('Your account must be verified before making bookings.')
        } else {
          setSubmitError(msg)
        }
      }
    })
  }

  const disabledReason = getDisabledReason()

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <header className="mb-8">
        <Link
          href="/dashboard/bookings"
          className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-400 text-sm mb-5 transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          My Bookings
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-500/60 mb-1">Fleet Booking</p>
            <h1 className="text-3xl md:text-4xl font-serif italic tracking-tight text-white">Book a Flight</h1>
            <p className="text-slate-400 text-sm font-light mt-1.5">
              Choose your preferred time and we&apos;ll confirm availability before your booking is final.
            </p>
          </div>
          <StepIndicator />
        </div>
      </header>

      {/* ── Aircraft status warning ──────────────────────────────────────── */}
      {aircraftStatus !== 'available' && (
        <div className="mb-5 flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-3">
          <span className="material-symbols-outlined text-amber-400 text-lg">warning</span>
          <p className="text-sm text-amber-300">
            {aircraftRegistration} is currently <strong>{aircraftStatus}</strong>. Requests may be delayed.
          </p>
        </div>
      )}

      {/* ── Eligibility warnings ─────────────────────────────────────────── */}
      {eligibilityBlocked && eligibilityWarnings.length > 0 && (
        <div className="mb-5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-400 mt-0.5">notification_important</span>
          <div>
            <p className="text-sm font-bold text-amber-400 mb-1">Booking Access Suspended</p>
            <ul className="text-xs text-amber-300/80 space-y-1 list-disc list-inside">
              {eligibilityWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* ── Compact pilot + aircraft info bar ───────────────────────────── */}
      <div className="mb-7 flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3.5 bg-[#090f1b] border border-white/[0.06] rounded-xl">
        <InfoItem icon="account_circle" label="Pilot"     value={picName || '—'}            warn={!picName} />
        <div className="w-px h-4 bg-white/8 hidden sm:block" />
        <InfoItem icon="badge"          label="ARN"       value={picArn  || '—'}            warn={!picArn}  mono />
        <div className="w-px h-4 bg-white/8 hidden sm:block" />
        <InfoItem icon="flight"         label="Aircraft"  value={aircraftRegistration} />
        <div className="w-px h-4 bg-white/8 hidden sm:block" />
        <InfoItem icon="airplane_ticket" label="Model"   value={aircraftType} />
        <div className="w-px h-4 bg-white/8 hidden sm:block" />
        <InfoItem icon="payments"       label="Rate"      value={`$${hourlyRate}/hr`} />
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">

          {/* ── Left: form sections ─────────────────────────────────────── */}
          <div className="xl:col-span-2 space-y-4">

            {/* ══ Choose your flight time (primary card) ════════════════ */}
            <section className="relative bg-[#0d1828] border border-blue-500/20 rounded-[1.25rem] p-7 md:p-9 shadow-[0_0_40px_rgba(37,99,235,0.07)]">
              {/* Blue left accent bar */}
              <div className="absolute left-0 top-7 bottom-7 w-[3px] bg-blue-500/70 rounded-r-full" />

              <div className="mb-7">
                <h2 className="text-2xl font-serif text-white mb-1.5">Choose your flight time</h2>
                <p className="text-sm text-slate-400">
                  Start by selecting your departure and estimated return time.
                </p>
              </div>

              <div className="space-y-6">

                {/* ── Departure ── */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-blue-500/70 mb-3 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 400" }}>flight_takeoff</span>
                    Departure
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] uppercase tracking-widest text-slate-600 mb-1.5">Date</label>
                      <DateInput
                        value={startDate}
                        min={minDate}
                        onChange={handleStartDateChange}
                      />
                      {startDate && (
                        <p className="text-[11px] text-blue-400/60 mt-1.5">{formatDateDisplay(startDate)}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase tracking-widest text-slate-600 mb-1.5">Time</label>
                      <TimeSelect
                        value={startTime}
                        options={startTimeOptions}
                        disabled={!startDate}
                        placeholder="Select time"
                        onChange={handleStartTimeChange}
                      />
                      {startTime && (
                        <p className="text-[11px] text-blue-400/60 mt-1.5">{startTime.replace(/^0/, '')}</p>
                      )}
                    </div>
                  </div>
                  {startDT && (
                    <p className="text-xs text-blue-400/80 mt-2 font-medium">
                      {formatInputAsAU(startDT)}
                    </p>
                  )}
                </div>

                {/* ── Estimated Return ── */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-blue-500/70 mb-3 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 400" }}>flight_land</span>
                    Estimated Return
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] uppercase tracking-widest text-slate-600 mb-1.5">Date</label>
                      <DateInput
                        value={endDate}
                        min={startDate || minDate}
                        disabled={!startDate}
                        onChange={handleEndDateChange}
                      />
                      {endDate && (
                        <p className="text-[11px] text-blue-400/60 mt-1.5">{formatDateDisplay(endDate)}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase tracking-widest text-slate-600 mb-1.5">Time</label>
                      <TimeSelect
                        value={endTime}
                        options={endTimeOptions}
                        disabled={!endDate}
                        placeholder="Select time"
                        onChange={setEndTime}
                      />
                      {endTime && !endIsBeforeStart && (
                        <p className="text-[11px] text-blue-400/60 mt-1.5">{endTime.replace(/^0/, '')}</p>
                      )}
                      {endIsBeforeStart && (
                        <p className="text-[11px] text-red-400 mt-1.5">Must be after departure</p>
                      )}
                    </div>
                  </div>
                  {endDT && !endIsBeforeStart && (
                    <p className="text-xs text-blue-400/80 mt-2 font-medium">
                      {formatInputAsAU(endDT)}
                    </p>
                  )}
                </div>

              </div>

              {/* Estimated duration */}
              {estimatedHours != null && estimatedHours > 0 && (
                <div className="mt-6 flex items-center gap-3 px-4 py-3 bg-blue-600/8 border border-blue-500/15 rounded-xl">
                  <span className="material-symbols-outlined text-blue-500 text-base" style={{ fontVariationSettings: "'wght' 300" }}>timer</span>
                  <span className="text-sm text-white">
                    Estimated duration: <span className="text-blue-400 font-semibold">{formatDuration(estimatedHours)}</span>
                  </span>
                  <span className="text-[10px] text-slate-600 ml-auto hidden sm:block">Subject to actual meter time</span>
                </div>
              )}

              <p className="text-[10px] text-slate-700 mt-5">
                All times are Sydney local time (AEST/AEDT).
              </p>
            </section>

            {/* ── Aircraft Availability ────────────────────────────────── */}
            <section className="bg-[#080d18] border border-white/[0.05] rounded-[1.25rem] p-6 md:p-7">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">event_available</span>
                  Aircraft Availability
                </h3>
                {selectedDate && (
                  <span className="text-[10px] text-slate-600">
                    {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-AU', {
                      timeZone: 'Australia/Sydney',
                      weekday: 'short',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </span>
                )}
              </div>

              {/* Availability status */}
              {availability.status === 'idle' && (
                <div className="flex items-center gap-3 px-4 py-3 bg-white/3 border border-white/[0.04] rounded-xl mb-5">
                  <span className="material-symbols-outlined text-slate-600 text-base" style={{ fontVariationSettings: "'wght' 300" }}>info</span>
                  <p className="text-xs text-slate-500">Select a departure and estimated return to check availability.</p>
                </div>
              )}
              {availability.status === 'checking' && (
                <div className="flex items-center gap-3 px-4 py-3 bg-white/3 border border-white/[0.04] rounded-xl mb-5">
                  <span className="material-symbols-outlined text-blue-500 text-base animate-spin">progress_activity</span>
                  <p className="text-xs text-blue-400">Checking aircraft availability…</p>
                </div>
              )}
              {availability.status === 'available' && (
                <div className="flex items-start gap-3 bg-green-500/8 border border-green-500/20 rounded-xl px-5 py-4 mb-5">
                  <span className="material-symbols-outlined text-green-400 text-lg flex-shrink-0 mt-0.5">check_circle</span>
                  <div>
                    <p className="text-sm text-green-300 font-medium">Aircraft is available for the selected time.</p>
                    <p className="text-[11px] text-green-400/50 mt-0.5">{availability.message}</p>
                  </div>
                </div>
              )}
              {availability.status === 'unavailable' && (
                <div className="bg-red-500/8 border border-red-500/20 rounded-xl px-5 py-4 space-y-3 mb-5">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-red-400 text-lg flex-shrink-0 mt-0.5">error</span>
                    <div>
                      <p className="text-sm text-red-300 font-medium">Selected time is unavailable.</p>
                      <p className="text-xs text-red-400/60 mt-1 leading-relaxed">
                        This aircraft is already booked or under maintenance during part of this window. Try adjusting your departure or estimated return time.
                      </p>
                    </div>
                  </div>
                  {availability.conflicts.length > 0 && (
                    <div className="space-y-1.5 ml-8">
                      {availability.conflicts.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                          <span className="text-red-300/70">{c.label}</span>
                          <span className="text-slate-500 font-mono ml-auto">
                            {formatSydTime(c.start_time)}–{formatSydTime(c.end_time)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Visual timeline */}
              {!selectedDate ? (
                <div className="text-center py-6">
                  <span className="material-symbols-outlined text-3xl text-slate-700 mb-2 block" style={{ fontVariationSettings: "'wght' 200" }}>calendar_month</span>
                  <p className="text-xs text-slate-600">Select a departure date to view the day&apos;s availability.</p>
                </div>
              ) : daySlotsLoading ? (
                <div className="text-center py-6">
                  <span className="material-symbols-outlined text-2xl text-blue-500/40 mb-2 block animate-spin">progress_activity</span>
                  <p className="text-xs text-slate-600">Loading availability…</p>
                </div>
              ) : daySlotsError ? (
                <div className="text-center py-5">
                  <span className="material-symbols-outlined text-2xl text-amber-400/50 mb-2 block">warning</span>
                  <p className="text-xs text-amber-400/60">Unable to load availability. Try selecting the date again.</p>
                </div>
              ) : (
                <AvailabilityTimeline
                  selectedDate={selectedDate}
                  daySlots={daySlots}
                  startDT={startDT}
                  endDT={endDT}
                />
              )}
            </section>

            {/* ── Flight Notes ─────────────────────────────────────────── */}
            <section className="bg-[#080d18] border border-white/[0.05] rounded-[1.25rem] p-6">
              <h3 className="text-xs font-semibold text-slate-400 mb-1">Flight Notes</h3>
              <p className="text-[11px] text-slate-600 mb-3">Optional. Visible to the operations team only.</p>
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add any specific requests, route intentions, or passenger details here…"
                className="w-full px-4 py-3 bg-[#050a14] border border-white/[0.07] focus:border-blue-500/40 focus:outline-none rounded-xl text-white text-sm placeholder:text-slate-700 transition-colors resize-none"
              />
            </section>

            {/* ── Before You Submit ────────────────────────────────────── */}
            <section className="bg-[#080d18] border border-white/[0.05] rounded-[1.25rem] p-6">
              <h3 className="text-xs font-semibold text-slate-400 mb-4">Before You Submit</h3>
              <div className="space-y-3.5">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={medical}
                    onChange={e => setMedical(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-blue-500 rounded cursor-pointer flex-shrink-0"
                  />
                  <span className="text-sm text-slate-500 group-hover:text-slate-300 transition-colors leading-relaxed">
                    I confirm that I hold a valid medical certificate and will ensure it is carried during the flight.
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={e => setTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-blue-500 rounded cursor-pointer flex-shrink-0"
                  />
                  <span className="text-sm text-slate-500 group-hover:text-slate-300 transition-colors leading-relaxed">
                    I agree to the{' '}
                    <a href="/terms-and-conditions" target="_blank" className="text-blue-500 hover:underline">Terms &amp; Conditions</a>
                    {' '}and understand the cancellation policy.
                  </span>
                </label>
              </div>
            </section>

          </div>

          {/* ── Right: sticky booking summary ───────────────────────────── */}
          <div className="xl:col-span-1">
            <div className="sticky top-6 space-y-4">

              {/* Summary card */}
              <div className="bg-[#0a1122] border border-white/[0.07] rounded-[1.25rem] p-6">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">receipt_long</span>
                  Booking Summary
                </h3>

                <div>
                  <SummaryRow label="Aircraft"     value={`${aircraftRegistration}`} />
                  <SummaryRow label="Model"        value={aircraftType} dim />
                  <SummaryRow label="Departure"    value={startDT ? formatInputAsAU(startDT) : '—'}                                       dim={!startDT} />
                  <SummaryRow label="Est. Return"  value={endDT && !endIsBeforeStart ? formatInputAsAU(endDT) : endIsBeforeStart ? 'Invalid' : '—'} dim={!endDT || endIsBeforeStart} />
                  <SummaryRow label="Est. Duration" value={estimatedHours != null ? formatDuration(estimatedHours) : '—'} dim={estimatedHours == null} />
                  <SummaryRow label="Hourly Rate"  value={`$${hourlyRate}/hr`} mono />
                  <SummaryRow
                    label="Est. Cost"
                    value={standardCost != null ? formatCurrency(standardCost) : '—'}
                    dim={standardCost == null}
                    mono
                    highlight={standardCost != null}
                  />
                </div>

                {standardCost != null && (
                  <p className="text-[10px] text-slate-600 mt-3 leading-relaxed">
                    Estimate only. Final charges are based on actual billed flight time.
                  </p>
                )}

                {/* Submit */}
                <div className="mt-5">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/15 disabled:cursor-not-allowed text-white font-bold text-sm uppercase tracking-widest rounded-full transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)] disabled:shadow-none flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                        Submitting…
                      </>
                    ) : availability.status === 'checking' ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                        Checking…
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">send</span>
                        Submit Booking Request
                      </>
                    )}
                  </button>

                  {disabledReason && !canSubmit && (
                    <p className="text-[11px] text-slate-600 text-center mt-3 leading-snug">
                      {disabledReason}
                    </p>
                  )}

                  {submitError && (
                    <div className="mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                      <span className="material-symbols-outlined text-red-400 text-base flex-shrink-0 mt-0.5">error</span>
                      <p className="text-xs text-red-300">{submitError}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Flight Pack Savings */}
              {estimatedHours != null && standardCost != null && (
                <div className="bg-[#0a1122] border border-white/[0.07] rounded-[1.25rem] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setPackOpen(o => !o)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/2 transition-colors"
                  >
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">local_offer</span>
                      Flight Pack Savings
                    </span>
                    <span className={`material-symbols-outlined text-slate-600 text-base transition-transform duration-200 ${packOpen ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  </button>

                  {packOpen && (
                    <div className="px-6 pb-5 border-t border-white/5 pt-4 space-y-3">
                      <p className="text-[11px] text-slate-600">
                        For {formatDuration(estimatedHours)} at ${hourlyRate}/hr:
                      </p>

                      {/* Standard */}
                      <div className="flex items-center justify-between py-2.5 border-b border-white/5">
                        <div>
                          <p className="text-xs text-white/80 font-medium">Standard Hourly</p>
                          <p className="text-[10px] text-slate-600">${hourlyRate}/hr</p>
                        </div>
                        <span className="text-sm font-semibold text-white font-mono">{formatCurrency(standardCost)}</span>
                      </div>

                      {/* 10-hour pack */}
                      {pack10Cost != null && (
                        <div className="flex items-center justify-between py-2.5 border-b border-white/5">
                          <div>
                            <p className="text-xs text-white/80 font-medium">10-Hour Pack</p>
                            <p className="text-[10px] text-slate-600">
                              ${Math.round(hourlyRate * (1 - PACK_10H_DISCOUNT))}/hr · {Math.round(PACK_10H_DISCOUNT * 100)}% off
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-green-400 font-mono">{formatCurrency(pack10Cost)}</p>
                            <p className="text-[10px] text-green-600">save {formatCurrency(standardCost - pack10Cost)}</p>
                          </div>
                        </div>
                      )}

                      {/* 20-hour pack */}
                      {pack20Cost != null && (
                        <div className="flex items-center justify-between py-2.5">
                          <div>
                            <p className="text-xs text-white/80 font-medium">20-Hour Pack</p>
                            <p className="text-[10px] text-slate-600">
                              ${Math.round(hourlyRate * (1 - PACK_20H_DISCOUNT))}/hr · {Math.round(PACK_20H_DISCOUNT * 100)}% off
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-green-300 font-mono">{formatCurrency(pack20Cost)}</p>
                            <p className="text-[10px] text-green-600">save {formatCurrency(standardCost - pack20Cost)}</p>
                          </div>
                        </div>
                      )}

                      <p className="text-[10px] text-slate-700 pt-1 leading-relaxed">
                        Flight packs are optional and can reduce your effective hourly rate. Contact the team to purchase or apply a package.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Ops note */}
              <p className="text-[10px] text-slate-700 text-center px-2 leading-relaxed">
                Booking requests are reviewed and confirmed by the operations team. You will be notified of the outcome.
              </p>

            </div>
          </div>

        </div>
      </form>
    </div>
  )
}
