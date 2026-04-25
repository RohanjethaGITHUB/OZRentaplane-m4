'use client'

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react'
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
import { formatDate, formatDateTime, formatDateLong } from '@/lib/formatDateTime'

// ── Pricing constants (replace with DB config when available) ─────────────────

const PACK_10H_DISCOUNT = 0.15 // 15% off standard rate
const PACK_20H_DISCOUNT = 0.25 // 25% off standard rate

// ── Types ──────────────────────────────────────────────────────────────────────

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available';   message: string; debugError?: string }
  | { status: 'unavailable'; message: string; conflicts: SafeConflict[]; debugError?: string }

type SuccessState = {
  bookingId:        string
  bookingReference: string
  startDT:          string   // Sydney-local "YYYY-MM-DDTHH:MM" for display
  endDT:            string
  estimatedHours:   number | null
}

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

// ── Time options (full day 12:00 AM – 11:30 PM, 30-min increments) ───────────
// Covers the entire 24-hour window in Sydney local time.
// Departure/return dropdowns are filtered dynamically based on context.

const ALL_TIME_OPTIONS: TimeOption[] = (() => {
  const opts: TimeOption[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const value  = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const period = h < 12 ? 'AM' : 'PM'
      const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h
      opts.push({ value, label: `${h12}:${String(m).padStart(2, '0')} ${period}` })
    }
  }
  return opts
})()

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Format a YYYY-MM-DD string for display as "22 Apr 2026". */
function formatDateDisplay(dateStr: string): string {
  return formatDate(dateStr)
}

/** Format a combined "YYYY-MM-DDTHH:MM" Sydney-local value as AU-style string. */
function formatInputAsAU(dtLocal: string): string {
  if (!dtLocal) return '—'
  const utc = sydneyInputToUTC(dtLocal)
  if (!utc) return '—'
  return formatDateTime(utc)
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
// Covers the full Sydney day (midnight → midnight) in two layers:
//   Layer 1 — the bar (overflow-hidden): green base + red unavailable blocks clipped inside.
//   Layer 2 — absolute overlay outside the clip: blue selected-window bracket on top.

// Add one day to a YYYY-MM-DD string without relying on Date parsing assumptions.
function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

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
  if (!selectedDate) return null

  // Full day: midnight Sydney → midnight Sydney (next day)
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
  const hasSelection =
    !!(selStartUTC && selEndUTC && new Date(selEndUTC) > new Date(selStartUTC))

  // Only render unavailable slots that overlap the visible window
  const visibleSlots = daySlots.filter(s => {
    const slotEnd   = new Date(s.end_time).getTime()
    const slotStart = new Date(s.start_time).getTime()
    return slotEnd > opStartMs && slotStart < opEndMs
  })

  // Show every 3 hours for a cleaner look (0, 3, 6, 9, 12, 15, 18, 21)
  const majorTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24]

  function hourLabel(h: number): string {
    if (h === 0 || h === 24) return '12 AM'
    if (h === 12) return '12 PM'
    return h < 12 ? `${h} AM` : `${h - 12} PM`
  }

  const selLeft  = hasSelection ? toPercent(selStartUTC!) : 0
  const selRight = hasSelection ? 100 - toPercent(selEndUTC!) : 0

  return (
    <div className="space-y-3">

      {/* ── Two-layer timeline ── */}
      <div className="relative">
        {/* Layer 1: green base + red unavailable blocks (clipped to bar) */}
        <div className="relative h-10 bg-green-500/15 rounded-lg overflow-hidden border border-green-500/10">
          {visibleSlots.map((slot, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 bg-red-500/60"
              style={{
                left:  `${toPercent(slot.start_time)}%`,
                right: `${100 - toPercent(slot.end_time)}%`,
              }}
              title={slot.label}
            />
          ))}
        </div>

        {/* Layer 2: blue selected-window bracket (outside clip, on top) */}
        {hasSelection && (
          <div
            className="absolute inset-y-[-2px] rounded-lg border-2 border-blue-400/80 bg-blue-500/10 pointer-events-none"
            style={{ left: `${selLeft}%`, right: `${selRight}%` }}
          />
        )}
      </div>

      {/* Major tick labels */}
      <div className="relative h-4">
        {majorTicks.map(h => {
          const pct = (h / 24) * 100
          return (
            <span
              key={h}
              className="absolute text-[9px] font-medium text-slate-600 -translate-x-1/2 select-none leading-none uppercase tracking-wide"
              style={{ left: `${pct}%` }}
            >
              {hourLabel(h)}
            </span>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-5 pt-1">
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-slate-600">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500/40 inline-block flex-shrink-0" />
          Available
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-slate-600">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500/60 inline-block flex-shrink-0" />
          Booked
        </span>
        {hasSelection && (
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm border-2 border-blue-400/80 inline-block flex-shrink-0" />
            Selected
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
}: {
  label: string
  value: string
  mono?: boolean
  dim?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-white/[0.06] last:border-0 last:pb-0">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className={`text-sm text-right leading-snug font-medium
        ${mono ? 'font-mono tabular-nums' : ''}
        ${dim ? 'text-slate-500' : 'text-white/90'}
      `}>
        {value}
      </span>
    </div>
  )
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ requirementsOk }: { requirementsOk: boolean }) {
  const steps = [
    {
      label: 'Requirements',
      state: requirementsOk ? 'done' : 'warn',
      num: 1,
    },
    {
      label: 'Flight Time',
      state: 'active',
      num: 2,
    },
    {
      label: 'Review & Submit',
      state: 'upcoming',
      num: 3,
    },
  ] as const

  return (
    <div className="flex items-center gap-8 sm:gap-12">
      {steps.map((step, idx) => (
        <div key={step.label} className="flex items-center">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
              ${step.state === 'done'     ? 'bg-green-500/15 border border-green-500/40 text-green-400' : ''}
              ${step.state === 'warn'     ? 'bg-amber-500/15 border border-amber-500/40 text-amber-400' : ''}
              ${step.state === 'active'   ? 'bg-blue-600/20 border border-blue-500/50 text-blue-400' : ''}
              ${step.state === 'upcoming' ? 'bg-white/[0.04] border border-white/10 text-slate-600' : ''}
            `}>
              {step.state === 'done' ? (
                <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'wght' 600" }}>check</span>
              ) : step.state === 'warn' ? (
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 400" }}>warning</span>
              ) : (
                step.num
              )}
            </div>
            <span className={`text-[11px] font-semibold uppercase tracking-widest hidden sm:block
              ${step.state === 'done'     ? 'text-green-400/70' : ''}
              ${step.state === 'warn'     ? 'text-amber-400/70' : ''}
              ${step.state === 'active'   ? 'text-white' : ''}
              ${step.state === 'upcoming' ? 'text-slate-600' : ''}
            `}>
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className={`w-8 sm:w-16 h-px mx-3 flex-shrink-0
              ${idx === 0 && requirementsOk ? 'bg-green-500/25' : 'bg-white/[0.07]'}
            `} />
          )}
        </div>
      ))}
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
        w-full px-4 py-3.5 bg-[#05080f] border border-white/[0.09]
        focus:border-blue-500/60 focus:outline-none rounded-lg
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
          w-full pl-4 pr-9 py-3.5 bg-[#05080f] border border-white/[0.09]
          focus:border-blue-500/60 focus:outline-none rounded-lg
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
  const [isSubmitting, startSubmit] = useTransition()

  // ── Split date/time state ─────────────────────────────────────────────────
  const [startDate, setStartDate] = useState('')  // YYYY-MM-DD
  const [startTime, setStartTime] = useState('')  // HH:MM
  const [endDate,   setEndDate]   = useState('')
  const [endTime,   setEndTime]   = useState('')
  const [notes,     setNotes]     = useState('')
  const [medical,   setMedical]   = useState(false)
  const [terms,     setTerms]     = useState(false)
  const [submitError,  setSubmitError]  = useState<string | null>(null)
  const [successState, setSuccessState] = useState<SuccessState | null>(null)

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
  const selectedDate = startDate
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
        const { bookingId, bookingReference } = await createBooking(input)
        setSuccessState({
          bookingId,
          bookingReference,
          startDT,
          endDT,
          estimatedHours,
        })
        window.scrollTo({ top: 0, behavior: 'smooth' })
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

  // ── Success state ─────────────────────────────────────────────────────────

  if (successState) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-20">
        <div className="max-w-lg w-full text-center">

          {/* Check icon */}
          <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/20 flex items-center justify-center mx-auto mb-8">
            <span
              className="material-symbols-outlined text-green-400 text-4xl"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 400" }}
            >
              check_circle
            </span>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-green-400/70 mb-3">
            Request Received
          </p>
          <h1 className="text-3xl md:text-4xl font-serif text-white mb-4 leading-tight">
            Booking Request Submitted
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
            Your request has been submitted and is awaiting review by our operations team.
          </p>

          {/* Booking reference card */}
          <div className="bg-gradient-to-br from-[#0f1d38] to-[#080e1c] border-t border-white/[0.13] border-x border-b border-x-white/[0.06] border-b-white/[0.06] rounded-xl p-7 mb-6 relative overflow-hidden">
            <div
              className="absolute inset-0 rounded-xl pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(37,99,235,0.12) 0%, transparent 70%)' }}
            />
            <div className="relative">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400/70 mb-3">
                Booking Reference
              </p>
              <p className="text-3xl font-mono font-bold text-white tracking-[0.18em] mb-2">
                {successState.bookingReference}
              </p>
              <p className="text-[11px] text-slate-600">Save this reference for your records</p>
            </div>
          </div>

          {/* Pending notice */}
          <div className="bg-amber-500/[0.07] border border-amber-500/20 rounded-xl px-5 py-4 mb-6 flex items-start gap-3 text-left">
            <span className="material-symbols-outlined text-amber-400 text-base flex-shrink-0 mt-0.5">info</span>
            <div>
              <p className="text-sm font-semibold text-amber-300 mb-1">This is not a confirmed booking</p>
              <p className="text-xs text-amber-300/70 leading-relaxed">
                Your request is pending review. You will receive an email once a decision has been made. Typical response time is within 24 hours.
              </p>
            </div>
          </div>

          {/* Flight summary */}
          {(successState.startDT || successState.estimatedHours != null) && (
            <div className="bg-[#080e1c] border border-white/[0.07] rounded-xl p-5 mb-8 text-left space-y-3">
              {successState.startDT && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Departure</span>
                  <span className="text-xs text-white font-medium">{formatInputAsAU(successState.startDT)}</span>
                </div>
              )}
              {successState.endDT && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Est. Return</span>
                  <span className="text-xs text-white font-medium">{formatInputAsAU(successState.endDT)}</span>
                </div>
              )}
              {successState.estimatedHours != null && (
                <div className="flex justify-between items-center border-t border-white/[0.05] pt-3">
                  <span className="text-xs text-slate-500">Est. Duration</span>
                  <span className="text-xs text-blue-400 font-semibold">{formatDuration(successState.estimatedHours)}</span>
                </div>
              )}
            </div>
          )}

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={`/dashboard/bookings/${successState.bookingId}`}
              className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-[0.2em] rounded-lg transition-all flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(37,99,235,0.25)]"
            >
              <span className="material-symbols-outlined text-sm">receipt_long</span>
              View Booking
            </Link>
            <Link
              href="/dashboard/bookings"
              className="flex-1 py-4 bg-white/[0.06] hover:bg-white/[0.09] text-white font-bold text-xs uppercase tracking-[0.2em] rounded-lg transition-all flex items-center justify-center gap-2 border border-white/[0.08]"
            >
              <span className="material-symbols-outlined text-sm">format_list_bulleted</span>
              My Bookings
            </Link>
          </div>

        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ══════════════════════════════════════════════════════════════════════
          COMPACT BOOKING HERO
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="relative py-14 overflow-hidden">

        {/* Deep navy gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1428] via-[#071020] to-[#060d18]" />

        {/* Runway lines texture */}
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.04) 40px, rgba(255,255,255,0.04) 41px)',
          }}
        />

        {/* Radial aviation glow */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 50% 70%, rgba(59,130,246,0.13) 0%, transparent 65%)' }}
        />

        {/* Aircraft silhouette ornament — right edge, very faint */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-[0.045] pointer-events-none select-none hidden lg:block pr-8">
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '210px', fontVariationSettings: "'wght' 100, 'FILL' 0" }}
          >
            flight_takeoff
          </span>
        </div>

        {/* Bottom fade into page */}
        <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-[#060d18] to-transparent" />

        {/* Hero content */}
        <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-2xl mx-auto">
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-blue-400/70 mb-4">
            Fleet Booking
          </p>
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-white mb-3 leading-tight">
            Book a Flight
          </h1>
          <p className="text-slate-400 text-base leading-relaxed mb-2">
            Choose your preferred time and submit your request for review.
          </p>
          <p className="text-[11px] text-slate-600">
            All times are shown in Sydney time (AEST/AEDT).
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          STEP INDICATOR BAR
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="border-b border-white/[0.06] bg-[#05090f] py-5">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 flex justify-center">
          <StepIndicator requirementsOk={!eligibilityBlocked} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          PILOT + AIRCRAFT INFO STRIP
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-[#070c19] border-b border-white/[0.05]">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-5">
          <div className="flex flex-wrap items-center gap-y-5 gap-x-0 xl:justify-between">

            {/* Pilot */}
            <div className="flex flex-col min-w-[120px] flex-1 xl:flex-none">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Pilot</span>
              <span className={`text-sm font-semibold leading-snug ${!picName ? 'text-amber-300' : 'text-white'}`}>
                {picName || (
                  <span className="flex items-center gap-1 text-amber-300">
                    <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'wght' 400" }}>warning</span>
                    Missing
                  </span>
                )}
              </span>
            </div>

            <div className="w-px h-8 bg-white/[0.07] hidden xl:block flex-shrink-0" />

            {/* ARN */}
            <div className="flex flex-col min-w-[120px] flex-1 xl:flex-none">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">ARN</span>
              <span className={`text-sm font-semibold font-mono leading-snug ${!picArn ? 'text-amber-300' : 'text-white'}`}>
                {picArn || (
                  <span className="flex items-center gap-1 text-amber-300">
                    <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'wght' 400" }}>warning</span>
                    Missing
                  </span>
                )}
              </span>
            </div>

            <div className="w-px h-8 bg-white/[0.07] hidden xl:block flex-shrink-0" />

            {/* Aircraft */}
            <div className="flex flex-col min-w-[100px] flex-1 xl:flex-none">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Aircraft</span>
              <span className="text-sm font-semibold text-white uppercase leading-snug">{aircraftRegistration}</span>
            </div>

            <div className="w-px h-8 bg-white/[0.07] hidden xl:block flex-shrink-0" />

            {/* Model */}
            <div className="flex flex-col min-w-[100px] flex-1 xl:flex-none">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Model</span>
              <span className="text-sm font-semibold text-white leading-snug">{aircraftType || 'Unavailable'}</span>
            </div>

            <div className="w-px h-8 bg-white/[0.07] hidden xl:block flex-shrink-0" />

            {/* Rate */}
            <div className="flex flex-col min-w-[80px] flex-1 xl:flex-none">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Rate</span>
              <span className="text-sm font-semibold text-blue-400 leading-snug">${hourlyRate}/hr</span>
            </div>

          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN CONTENT AREA
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10 pb-24">

        {/* Back link */}
        <Link
          href="/dashboard/bookings"
          className="inline-flex items-center gap-1.5 text-blue-500/70 hover:text-blue-400 text-sm mb-8 transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          My Bookings
        </Link>

        {/* Aircraft status warning */}
        {aircraftStatus !== 'available' && (
          <div className="mb-6 flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-5 py-3.5">
            <span className="material-symbols-outlined text-amber-400 text-lg flex-shrink-0">warning</span>
            <p className="text-sm text-amber-300">
              {aircraftRegistration} is currently <strong>{aircraftStatus}</strong>. Requests may be delayed.
            </p>
          </div>
        )}

        {/* Eligibility warnings */}
        {eligibilityBlocked && eligibilityWarnings.length > 0 && (
          <div className="mb-6 bg-amber-500/8 border border-amber-500/20 rounded-xl px-5 py-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-400 mt-0.5 flex-shrink-0">notification_important</span>
            <div>
              <p className="text-sm font-bold text-amber-400 mb-1.5">Booking Access Suspended</p>
              <ul className="text-xs text-amber-300/80 space-y-1 list-disc list-inside">
                {eligibilityWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          </div>
        )}

        {/* Two-column layout */}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">

            {/* ══ LEFT COLUMN ══════════════════════════════════════════════ */}
            <div className="xl:col-span-8 space-y-6">

              {/* ── Choose your flight time (primary card) ─────────────── */}
              <section className="relative bg-gradient-to-br from-[#0f1d38] to-[#080e1c] border-t border-white/[0.13] border-x border-b border-x-white/[0.06] border-b-white/[0.06] rounded-xl p-8 md:p-10 shadow-[0_8px_60px_rgba(0,0,0,0.45)] overflow-hidden">

                {/* Blue left accent bar */}
                <div className="absolute left-0 top-8 bottom-8 w-[3px] bg-blue-500/65 rounded-r-full" />

                {/* Soft blue interior glow */}
                <div
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(37,99,235,0.09) 0%, transparent 65%)' }}
                />

                <div className="relative">
                  <div className="mb-8">
                    <h2 className="text-2xl md:text-3xl font-serif text-white mb-2 leading-tight">
                      Choose your flight time
                    </h2>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      Start by selecting your departure and estimated return time.
                    </p>
                  </div>

                  <div className="space-y-8">

                    {/* Departure */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400/70 mb-3 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'wght' 400" }}>flight_takeoff</span>
                        Departure
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-2">Date</label>
                          <DateInput
                            value={startDate}
                            min={minDate}
                            onChange={handleStartDateChange}
                          />
                          {startDate && (
                            <p className="text-[11px] text-blue-400/50 mt-1.5">{formatDateDisplay(startDate)}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-2">Time</label>
                          <TimeSelect
                            value={startTime}
                            options={startTimeOptions}
                            disabled={!startDate}
                            placeholder="Select time"
                            onChange={handleStartTimeChange}
                          />
                        </div>
                      </div>
                      {startDT && (
                        <p className="text-xs text-blue-400/70 mt-2 font-medium">
                          {formatInputAsAU(startDT)}
                        </p>
                      )}
                    </div>

                    {/* Estimated Return */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400/70 mb-3 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'wght' 400" }}>flight_land</span>
                        Estimated Return
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-2">Date</label>
                          <DateInput
                            value={endDate}
                            min={startDate || minDate}
                            disabled={!startDate}
                            onChange={handleEndDateChange}
                          />
                          {endDate && (
                            <p className="text-[11px] text-blue-400/50 mt-1.5">{formatDateDisplay(endDate)}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-2">Time</label>
                          <TimeSelect
                            value={endTime}
                            options={endTimeOptions}
                            disabled={!endDate}
                            placeholder="Select time"
                            onChange={setEndTime}
                          />
                          {endIsBeforeStart && (
                            <p className="text-[11px] text-red-400 mt-1.5">Must be after departure</p>
                          )}
                        </div>
                      </div>
                      {endDT && !endIsBeforeStart && (
                        <p className="text-xs text-blue-400/70 mt-2 font-medium">
                          {formatInputAsAU(endDT)}
                        </p>
                      )}
                    </div>

                  </div>

                  {/* Estimated duration chip */}
                  {estimatedHours != null && estimatedHours > 0 && (
                    <div className="mt-7 flex items-center gap-3 px-4 py-3 bg-blue-600/8 border border-blue-500/15 rounded-xl">
                      <span className="material-symbols-outlined text-blue-500 text-base flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>timer</span>
                      <span className="text-sm text-white">
                        Estimated duration:{' '}
                        <span className="text-blue-400 font-semibold">{formatDuration(estimatedHours)}</span>
                      </span>
                      <span className="text-[10px] text-slate-600 ml-auto hidden sm:block">Subject to actual meter time</span>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Aircraft Availability ──────────────────────────────── */}
              <section className="bg-[#080e1c] border border-white/[0.07] rounded-xl p-7 md:p-8">

                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
                      Aircraft Availability
                    </h3>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-medium uppercase tracking-widest">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-2 h-2 rounded-full bg-green-500/50 inline-block" />
                      Available
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-2 h-2 rounded-full bg-red-500/60 inline-block" />
                      Booked
                    </div>
                    {startDT && endDT && !endIsBeforeStart && (
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="w-2 h-2 rounded-full bg-blue-500/70 inline-block" />
                        Selected
                      </div>
                    )}
                  </div>
                </div>

                {selectedDate && (
                  <p className="text-[10px] font-medium uppercase tracking-widest text-slate-600 mb-4">
                    {formatDateLong(selectedDate)}
                  </p>
                )}

                {/* Availability status banner */}
                {availability.status === 'idle' && (
                  <div className="flex items-center gap-3 px-4 py-3.5 bg-white/[0.025] border border-white/[0.05] rounded-xl mb-6">
                    <span className="material-symbols-outlined text-slate-600 text-base" style={{ fontVariationSettings: "'wght' 300" }}>info</span>
                    <p className="text-xs text-slate-500">Select a departure and estimated return to check availability.</p>
                  </div>
                )}
                {availability.status === 'checking' && (
                  <div className="flex items-center gap-3 px-4 py-3.5 bg-white/[0.025] border border-white/[0.05] rounded-xl mb-6">
                    <span className="material-symbols-outlined text-blue-500 text-base animate-spin">progress_activity</span>
                    <p className="text-xs text-blue-400">Checking aircraft availability…</p>
                  </div>
                )}
                {availability.status === 'available' && (
                  <div className="flex items-start gap-3 bg-green-500/[0.07] border border-green-500/20 rounded-xl px-5 py-4 mb-6">
                    <span className="material-symbols-outlined text-green-400 text-lg flex-shrink-0 mt-0.5">check_circle</span>
                    <div>
                      <p className="text-sm text-green-300 font-medium">Aircraft is available for the selected time.</p>
                      <p className="text-[11px] text-green-400/50 mt-0.5">{availability.message}</p>
                    </div>
                  </div>
                )}
                {availability.status === 'unavailable' && (
                  <div className="bg-red-500/[0.07] border border-red-500/20 rounded-xl px-5 py-4 space-y-3 mb-6">
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
                  <div className="text-center py-8">
                    <span className="material-symbols-outlined text-3xl text-slate-700 mb-2 block" style={{ fontVariationSettings: "'wght' 200" }}>calendar_month</span>
                    <p className="text-xs text-slate-600">Select a departure date to view the day&apos;s availability.</p>
                  </div>
                ) : daySlotsLoading ? (
                  <div className="text-center py-8">
                    <span className="material-symbols-outlined text-2xl text-blue-500/40 mb-2 block animate-spin">progress_activity</span>
                    <p className="text-xs text-slate-600">Loading availability…</p>
                  </div>
                ) : daySlotsError ? (
                  <div className="text-center py-6">
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

              {/* ── Flight Notes ───────────────────────────────────────── */}
              <section className="bg-[#080e1c] border border-white/[0.07] rounded-xl p-7 md:p-8">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-300 mb-1.5">Flight Notes</h3>
                <p className="text-[11px] text-slate-600 mb-4">Optional. Visible to the operations team only.</p>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add any specific requests, route intentions, or passenger details here…"
                  className="w-full px-4 py-3.5 bg-[#05080f] border border-white/[0.07] focus:border-blue-500/50 focus:outline-none rounded-lg text-white text-sm placeholder:text-slate-700 transition-colors resize-none leading-relaxed"
                />
              </section>

              {/* ── Before You Submit ──────────────────────────────────── */}
              <section className="bg-[#080e1c] border border-white/[0.07] rounded-xl p-7 md:p-8">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-300 mb-5">Before You Submit</h3>
                <div className="space-y-4">
                  <label className="flex items-start gap-3.5 cursor-pointer group">
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
                  <label className="flex items-start gap-3.5 cursor-pointer group">
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

            {/* ══ RIGHT COLUMN — STICKY SUMMARY ════════════════════════ */}
            <div className="xl:col-span-4">
              <div className="sticky top-28 space-y-5">

                {/* Booking Summary card */}
                <div className="bg-gradient-to-br from-[#0f1d38] to-[#080e1c] border-t border-white/[0.13] border-x border-b border-x-white/[0.06] border-b-white/[0.06] rounded-xl p-8 shadow-[0_8px_60px_rgba(0,0,0,0.45)] relative overflow-hidden">

                  {/* Decorative receipt ornament */}
                  <div className="absolute top-0 right-0 p-4 opacity-[0.05] pointer-events-none">
                    <span className="material-symbols-outlined text-5xl">receipt_long</span>
                  </div>

                  <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-400 mb-7">
                    Booking Summary
                  </h3>

                  {/* Summary rows */}
                  <div className="mb-7">
                    <SummaryRow label="Aircraft"      value={aircraftRegistration} />
                    <SummaryRow label="Model"         value={aircraftType} dim />
                    <SummaryRow
                      label="Departure"
                      value={startDT ? formatInputAsAU(startDT) : '—'}
                      dim={!startDT}
                    />
                    <SummaryRow
                      label="Est. Return"
                      value={endDT && !endIsBeforeStart ? formatInputAsAU(endDT) : endIsBeforeStart ? 'Invalid' : '—'}
                      dim={!endDT || endIsBeforeStart}
                    />
                    <SummaryRow
                      label="Est. Duration"
                      value={estimatedHours != null ? formatDuration(estimatedHours) : '—'}
                      dim={estimatedHours == null}
                    />
                    <SummaryRow
                      label="Rate"
                      value={`$${hourlyRate} / hr`}
                      mono
                    />
                  </div>

                  {/* Estimated cost highlight box */}
                  {standardCost != null ? (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-4 mb-2 flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">Estimated Cost</span>
                      <span className="text-2xl font-bold text-white tabular-nums">{formatCurrency(standardCost)}</span>
                    </div>
                  ) : (
                    <div className="bg-white/[0.025] border border-white/[0.06] rounded-xl px-5 py-4 mb-2 flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Estimated Cost</span>
                      <span className="text-xl font-bold text-slate-600">—</span>
                    </div>
                  )}

                  {standardCost != null && (
                    <p className="text-[10px] text-slate-600 mb-6 leading-relaxed">
                      Estimate only. Final charges are based on actual billed flight time.
                    </p>
                  )}

                  {/* Submit button */}
                  <div className="mt-6">
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/15 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-[0.2em] rounded-lg transition-all shadow-[0_0_24px_rgba(37,99,235,0.25)] disabled:shadow-none flex items-center justify-center gap-2"
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
                      <p className="text-[11px] text-slate-600 text-center mt-3 leading-snug px-2">
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
                  <div className="bg-[#080e1c] border border-white/[0.07] rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPackOpen(o => !o)}
                      className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02] transition-colors"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">local_offer</span>
                        Flight Pack Savings
                      </span>
                      <span className={`material-symbols-outlined text-slate-600 text-base transition-transform duration-200 ${packOpen ? 'rotate-180' : ''}`}>
                        expand_more
                      </span>
                    </button>

                    {packOpen && (
                      <div className="px-6 pb-5 border-t border-white/[0.05] pt-4 space-y-3">
                        <p className="text-[11px] text-slate-600 mb-1">
                          For {formatDuration(estimatedHours)} at ${hourlyRate}/hr:
                        </p>

                        {/* Standard */}
                        <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05]">
                          <div>
                            <p className="text-xs text-white/80 font-medium">Standard Hourly</p>
                            <p className="text-[10px] text-slate-600">${hourlyRate}/hr</p>
                          </div>
                          <span className="text-sm font-semibold text-white font-mono">{formatCurrency(standardCost)}</span>
                        </div>

                        {/* 10-hour pack */}
                        {pack10Cost != null && (
                          <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05]">
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
                <p className="text-[10px] font-serif italic text-center text-slate-600 px-3 leading-relaxed">
                  Booking requests are reviewed and confirmed by the operations team. You will be notified of the outcome.
                </p>

              </div>
            </div>

          </div>
        </form>
      </div>

    </div>
  )
}
