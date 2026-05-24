'use client'

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createBooking } from '@/app/actions/booking'
import {
  checkCustomerAvailability,
  type SafeConflict,
  type AvailabilityCheckResult,
} from '@/app/actions/customer-availability'
import type { CreateBookingInput } from '@/lib/supabase/booking-types'
import {
  sydneyInputToUTC,
  formatSydTime,
} from '@/lib/utils/sydney-time'
import { validateFlightReviewDate } from '@/lib/utils/flight-review'
import { formatDate, formatDateTime } from '@/lib/formatDateTime'
import CalendarDateField from '@/components/CalendarDateField'


// ── Types ──────────────────────────────────────────────────────────────────────

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available';   message: string; debugError?: string }
  | { status: 'unavailable'; message: string; conflicts: SafeConflict[]; debugError?: string }

type SuccessState = {
  bookingId:        string
  bookingReference: string
  bookingStatus:    string
  startDT:          string
  endDT:            string
  estimatedHours:   number | null
}

type TimeOption = { value: string; label: string }

type Props = {
  aircraftId:              string
  aircraftRegistration:    string
  aircraftType:            string
  aircraftStatus:          string
  hourlyRate:              number
  picName:                 string | null
  picArn:                  string | null
  eligibilityBlocked:      boolean
  eligibilityWarnings:     string[]
  initialLastFlightDate:   string
}

// ── Time options (full day, 15-min increments) ────────────────────────────────

const ALL_TIME_OPTIONS: TimeOption[] = (() => {
  const opts: TimeOption[] = []
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateDisplay(dateStr: string): string {
  return formatDate(dateStr)
}

function formatInputAsAU(dtLocal: string): string {
  if (!dtLocal) return '—'
  const utc = sydneyInputToUTC(dtLocal)
  if (!utc) return '—'
  return formatDateTime(utc)
}

function formatDuration(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}


// ── Step indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ requirementsOk }: { requirementsOk: boolean }) {
  const steps = [
    { label: 'Requirements', state: requirementsOk ? 'done' : 'warn', num: 1 },
    { label: 'Flight Time',  state: 'active',   num: 2 },
    { label: 'Review & Submit', state: 'upcoming', num: 3 },
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
  max,
  disabled,
  onChange,
}: {
  value: string
  min?: string
  max?: string
  disabled?: boolean
  onChange: (v: string) => void
}) {
  const minYear = min ? Number(min.slice(0, 4)) || (new Date().getFullYear() - 20) : (new Date().getFullYear() - 20)
  const maxYear = max ? Number(max.slice(0, 4)) || (new Date().getFullYear() + 5) : (new Date().getFullYear() + 5)
  return (
    <CalendarDateField
      value={value}
      minDate={min}
      maxDate={max}
      minYear={minYear}
      maxYear={maxYear}
      disabled={disabled}
      onChange={onChange}
      className={`
        w-full px-4 py-3.5 bg-[#05080f] border border-white/[0.09]
        focus:border-blue-500/60 focus:outline-none rounded-lg
        text-white text-sm transition-colors
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

// ── Availability status ────────────────────────────────────────────────────────

function AvailabilityStatus({
  availability,
  startDT,
  endDT,
  endIsBeforeStart,
}: {
  availability: AvailabilityState
  startDT: string
  endDT: string
  endIsBeforeStart: boolean
}) {
  // Only show once the user has started entering times
  if (!startDT) return null

  if (availability.status === 'idle') {
    return (
      <div className="flex items-center gap-3 px-4 py-3.5 bg-white/[0.025] border border-white/[0.05] rounded-xl">
        <span className="material-symbols-outlined text-slate-600 text-base flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>
          info
        </span>
        <p className="text-xs text-slate-500">
          {!endDT || endIsBeforeStart
            ? 'Select an estimated return time to check availability.'
            : 'Select a departure and return time to check availability.'}
        </p>
      </div>
    )
  }

  if (availability.status === 'checking') {
    return (
      <div className="flex items-center gap-3 px-4 py-3.5 bg-white/[0.025] border border-white/[0.05] rounded-xl">
        <span className="material-symbols-outlined text-blue-500 text-base animate-spin flex-shrink-0">progress_activity</span>
        <p className="text-xs text-blue-400">Checking aircraft availability…</p>
      </div>
    )
  }

  if (availability.status === 'available') {
    return (
      <div className="flex items-center gap-3 bg-green-500/[0.07] border border-green-500/20 rounded-xl px-4 py-3.5">
        <span
          className="material-symbols-outlined text-green-400 text-base flex-shrink-0"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          check_circle
        </span>
        <p className="text-sm text-green-300 font-medium">Aircraft is available for the selected time.</p>
      </div>
    )
  }

  if (availability.status === 'unavailable') {
    return (
      <div className="bg-red-500/[0.07] border border-red-500/20 rounded-xl px-4 py-3.5 space-y-2.5">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-red-400 text-base flex-shrink-0 mt-0.5">error</span>
          <div>
            <p className="text-sm text-red-300 font-medium">Selected time is unavailable.</p>
            <p className="text-xs text-red-400/60 mt-1 leading-relaxed">
              Try adjusting your departure or estimated return time.
            </p>
          </div>
        </div>
        {availability.conflicts.length > 0 && (
          <div className="space-y-1.5 ml-7">
            {availability.conflicts.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                <span className="text-red-300/70">{c.label}</span>
                <span className="text-slate-500 font-mono ml-auto tabular-nums">
                  {formatSydTime(c.start_time)}–{formatSydTime(c.end_time)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return null
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
  initialLastFlightDate,
}: Props) {
  const [isSubmitting, startSubmit] = useTransition()

  // ── Split date/time state ─────────────────────────────────────────────────
  const [startDate,      setStartDate]      = useState('')
  const [startTime,      setStartTime]      = useState('')
  const [endDate,        setEndDate]        = useState('')
  const [endTime,        setEndTime]        = useState('')
  const [lastFlightDate, setLastFlightDate] = useState(initialLastFlightDate)
  const [notes,          setNotes]          = useState('')
  const [medical,        setMedical]        = useState(false)
  const [submitError,    setSubmitError]    = useState<string | null>(null)
  const [successState,   setSuccessState]   = useState<SuccessState | null>(null)

  // Flight review validation (silent — no UI for editing, value comes from profile)
  const flightReviewError = lastFlightDate ? validateFlightReviewDate(lastFlightDate) : null
  const flightReviewValid = !!lastFlightDate && !flightReviewError

  // ── Derived combined datetime strings ─────────────────────────────────────
  const startDT = startDate && startTime ? `${startDate}T${startTime}` : ''
  const endDT   = endDate   && endTime   ? `${endDate}T${endTime}`     : ''

  // ── Availability state ────────────────────────────────────────────────────
  const [availability, setAvailability] = useState<AvailabilityState>({ status: 'idle' })

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
    if (endDate && startDate && endDate === startDate && startTime) {
      return ALL_TIME_OPTIONS.filter(o => o.value > startTime)
    }
    return ALL_TIME_OPTIONS
  }, [endDate, startDate, startTime])

  // ── Cascade handlers ──────────────────────────────────────────────────────

  function handleStartDateChange(date: string) {
    setStartDate(date)
    if (date === minDate && startTime && startTime < minTimeToday) {
      setStartTime('')
    }
    if (endDate && date > endDate) {
      setEndDate('')
      setEndTime('')
    }
  }

  function handleStartTimeChange(time: string) {
    setStartTime(time)
    if (endDate && startDate && endDate === startDate && endTime && endTime <= time) {
      setEndTime('')
    }
  }

  function handleEndDateChange(date: string) {
    setEndDate(date)
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

  // ── Estimated duration ────────────────────────────────────────────────────
  const estimatedHours = useMemo(() => {
    const s = sydneyInputToUTC(startDT)
    const e = sydneyInputToUTC(endDT)
    if (!s || !e) return null
    const mins = (new Date(e).getTime() - new Date(s).getTime()) / 60000
    return mins > 0 ? mins / 60 : null
  }, [startDT, endDT])

  // ── Submit gate ───────────────────────────────────────────────────────────
  const endIsBeforeStart = !!(startDT && endDT && endDT <= startDT)

  const canSubmit =
    !isSubmitting &&
    !eligibilityBlocked &&
    !!startDT &&
    !!endDT &&
    !endIsBeforeStart &&
    availability.status === 'available' &&
    flightReviewValid &&
    medical

  function getDisabledReason(): string | null {
    if (eligibilityBlocked) return 'Booking access is suspended. See the eligibility notice above.'
    if (!startDate || !startTime) return 'Choose an available time and complete the required confirmations to continue.'
    if (!endDate || !endTime) return 'Select an estimated return date and time.'
    if (endIsBeforeStart) return 'Estimated return must be after departure.'
    if (availability.status === 'checking') return 'Checking availability…'
    if (availability.status === 'unavailable') return 'Selected time is unavailable.'
    if (!lastFlightDate) return 'Your flight review date is not on file. Please contact operations.'
    if (flightReviewError) return flightReviewError
    if (!medical) return 'Please complete the required confirmations.'
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
      setSubmitError('Booking access is currently unavailable. Please review the eligibility notice above.')
      return
    }
    if (availability.status !== 'available') {
      setSubmitError('Please wait for the availability check to complete, or choose a different time.')
      return
    }
    if (!medical) {
      setSubmitError('You must complete the required confirmations.')
      return
    }

    const flightReviewErr = validateFlightReviewDate(lastFlightDate)
    if (flightReviewErr) {
      setSubmitError(flightReviewErr)
      return
    }

    const input: CreateBookingInput = {
      aircraft_id:                    aircraftId,
      scheduled_start:                startUTC,
      scheduled_end:                  endUTC,
      last_flight_date:               lastFlightDate,
      pic_name:                       picName  ?? undefined,
      pic_arn:                        picArn   ?? undefined,
      customer_notes:                 notes || null,
      risk_acknowledgement_accepted:  medical,
    }

    startSubmit(async () => {
      try {
        const result = await createBooking(input)
        setSuccessState({
          bookingId:        result.bookingId,
          bookingReference: result.bookingReference,
          bookingStatus:    result.bookingStatus,
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
        } else if (msg.includes('CLEARANCE_REQUIRED') || msg.includes('VERIFICATION_REQUIRED')) {
          setSubmitError('You must complete your checkout flight and be cleared before booking aircraft.')
        } else {
          setSubmitError(msg)
        }
      }
    })
  }

  const disabledReason = getDisabledReason()

  // ── Success state ─────────────────────────────────────────────────────────

  if (successState) {
    const isConfirmed = successState.bookingStatus === 'confirmed'

    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-20">
        <div className="max-w-lg w-full text-center">

          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 ${
            isConfirmed
              ? 'bg-green-500/15 border border-green-500/20'
              : 'bg-blue-500/15 border border-blue-500/20'
          }`}>
            <span
              className={`material-symbols-outlined text-4xl ${isConfirmed ? 'text-green-400' : 'text-blue-400'}`}
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 400" }}
            >
              {isConfirmed ? 'check_circle' : 'pending_actions'}
            </span>
          </div>

          <p className={`text-[10px] font-bold uppercase tracking-[0.35em] mb-3 ${isConfirmed ? 'text-green-400/70' : 'text-blue-400/70'}`}>
            {isConfirmed ? 'Booking Confirmed' : 'Request Received'}
          </p>
          <h1 className="text-3xl md:text-4xl font-serif text-white mb-4 leading-tight">
            {isConfirmed ? 'Your Booking Is Confirmed' : 'Booking Request Submitted'}
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
            {isConfirmed
              ? 'Your aircraft booking has been confirmed. Please arrive at the aircraft at least 30 minutes before departure for pre-flight checks.'
              : 'Your request has been submitted and is awaiting review by our operations team.'}
          </p>

          <div className="bg-gradient-to-br from-[#0f1d38] to-[#080e1c] border-t border-white/[0.13] border-x border-b border-x-white/[0.06] border-b-white/[0.06] rounded-xl p-7 mb-6 relative overflow-hidden">
            <div
              className="absolute inset-0 rounded-xl pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(37,99,235,0.12) 0%, transparent 70%)' }}
            />
            <div className="relative">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400/70 mb-3">Booking Reference</p>
              <p className="text-3xl font-mono font-bold text-white tracking-[0.18em] mb-2">{successState.bookingReference}</p>
              <p className="text-[11px] text-slate-600">Save this reference for your records</p>
            </div>
          </div>

          {isConfirmed ? (
            <div className="bg-green-500/[0.07] border border-green-500/20 rounded-xl px-5 py-4 mb-6 flex items-start gap-3 text-left">
              <span className="material-symbols-outlined text-green-400 text-base flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <div>
                <p className="text-sm font-semibold text-green-300 mb-1">Booking confirmed</p>
                <p className="text-xs text-green-300/70 leading-relaxed">
                  Your booking is confirmed. Please arrive at the aircraft at least 30 minutes before your scheduled departure.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-blue-500/[0.07] border border-blue-500/20 rounded-xl px-5 py-4 mb-6 flex items-start gap-3 text-left">
              <span className="material-symbols-outlined text-blue-400 text-base flex-shrink-0 mt-0.5">pending_actions</span>
              <div>
                <p className="text-sm font-semibold text-blue-300 mb-1">Awaiting review</p>
                <p className="text-xs text-blue-300/70 leading-relaxed">
                  Our operations team will review your request and confirm the booking shortly.
                </p>
              </div>
            </div>
          )}

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
    <div data-testid="booking-form">

      {/* ══════════════════════════════════════════════════════════════════════
          COMPACT BOOKING HERO
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="relative py-14 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1428] via-[#071020] to-[#060d18]" />
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.04) 40px, rgba(255,255,255,0.04) 41px)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 50% 70%, rgba(59,130,246,0.13) 0%, transparent 65%)' }}
        />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-[0.045] pointer-events-none select-none hidden lg:block pr-8">
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '210px', fontVariationSettings: "'wght' 100, 'FILL' 0" }}
          >
            flight_takeoff
          </span>
        </div>
        <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-[#060d18] to-transparent" />
        <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-2xl mx-auto">
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-blue-400/70 mb-4">Fleet Booking</p>
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-white mb-3 leading-tight">Book a Flight</h1>
          <p className="text-slate-400 text-base leading-relaxed mb-2">
            Choose your preferred time and submit your request for review.
          </p>
          <p className="text-[11px] text-slate-600">All times are shown in Sydney time (AEST/AEDT).</p>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5">

            {/* Pilot */}
            <div>
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1.5 block">Pilot</span>
              {picName ? (
                <span className="text-sm font-semibold text-white leading-snug">{picName}</span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-semibold text-amber-300 leading-snug">
                  <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'wght' 400" }}>warning</span>
                  Missing
                </span>
              )}
            </div>

            {/* ARN */}
            <div>
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1.5 block">ARN</span>
              {picArn ? (
                <span className="text-sm font-semibold font-mono text-white leading-snug">{picArn}</span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-semibold text-amber-300 leading-snug">
                  <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'wght' 400" }}>warning</span>
                  Missing
                </span>
              )}
            </div>

            {/* Aircraft — combined registration + type */}
            <div className="col-span-2 sm:col-span-1">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1.5 block">Aircraft</span>
              <span className="text-sm font-semibold text-white leading-snug">
                {[aircraftRegistration, aircraftType || 'Unavailable'].filter(Boolean).join(' ')}
              </span>
            </div>

          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN CONTENT AREA
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10 pb-24">

        <div className="max-w-3xl mx-auto">
          <Link
            href="/dashboard/bookings"
            className="inline-flex items-center gap-1.5 text-blue-500/70 hover:text-blue-400 text-sm mb-8 transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            My Bookings
          </Link>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-w-3xl mx-auto space-y-6">

            {/* Aircraft status warning */}
            {aircraftStatus !== 'available' && (
              <div className="flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-5 py-3.5">
                <span className="material-symbols-outlined text-amber-400 text-lg flex-shrink-0">warning</span>
                <p className="text-sm text-amber-300">
                  {aircraftRegistration} is currently <strong>{aircraftStatus}</strong>. Requests may be delayed.
                </p>
              </div>
            )}

            {/* Eligibility warnings */}
            {eligibilityBlocked && eligibilityWarnings.length > 0 && (
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-5 py-4 flex items-start gap-3">
                <span className="material-symbols-outlined text-amber-400 mt-0.5 flex-shrink-0">notification_important</span>
                <div>
                  <p className="text-sm font-bold text-amber-400 mb-1.5">Booking Access Suspended</p>
                  <ul className="text-xs text-amber-300/80 space-y-1 list-disc list-inside">
                    {eligibilityWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              </div>
            )}

            {/* ── Choose your flight time ────────────────────────────────── */}
            <section className="relative bg-gradient-to-br from-[#0f1d38] to-[#080e1c] border-t border-white/[0.13] border-x border-b border-x-white/[0.06] border-b-white/[0.06] rounded-xl p-8 md:p-10 shadow-[0_8px_60px_rgba(0,0,0,0.45)] overflow-hidden">

              <div className="absolute left-0 top-8 bottom-8 w-[3px] bg-blue-500/65 rounded-r-full" />
              <div
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(37,99,235,0.09) 0%, transparent 65%)' }}
              />

              <div className="relative space-y-8">

                <div>
                  <h2 className="text-2xl md:text-3xl font-serif text-white mb-2 leading-tight">
                    Choose your flight time
                  </h2>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Start by selecting your departure and estimated return time.
                  </p>
                </div>

                {/* Departure */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400/70 mb-3 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'wght' 400" }}>flight_takeoff</span>
                    Departure
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-2">Date</label>
                      <DateInput value={startDate} min={minDate} onChange={handleStartDateChange} />
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
                    <p className="text-xs text-blue-400/70 mt-2 font-medium">{formatInputAsAU(startDT)}</p>
                  )}
                </div>

                {/* Estimated return */}
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
                    <p className="text-xs text-blue-400/70 mt-2 font-medium">{formatInputAsAU(endDT)}</p>
                  )}
                </div>

                {/* Availability status — inline, below return fields */}
                <AvailabilityStatus
                  availability={availability}
                  startDT={startDT}
                  endDT={endDT}
                  endIsBeforeStart={endIsBeforeStart}
                />

                {/* Estimated duration chip */}
                {estimatedHours != null && estimatedHours > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-blue-600/8 border border-blue-500/15 rounded-xl">
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

            {/* ── Flight Notes, confirmation & submit ───────────────────── */}
            <section className="bg-[#080e1c] border border-white/[0.07] rounded-xl p-7 md:p-8 space-y-6">

              {/* Notes */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-300 mb-1.5">Flight Notes</h3>
                <p className="text-[11px] text-slate-600 mb-4">Optional. Visible to the operations team only.</p>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add any specific requests, route intentions, or passenger details here…"
                  className="w-full px-4 py-3.5 bg-[#05080f] border border-white/[0.07] focus:border-blue-500/50 focus:outline-none rounded-lg text-white text-sm placeholder:text-slate-700 transition-colors resize-none leading-relaxed"
                />
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Confirmation + submit */}
              <div className="space-y-5">

                <label className="flex items-start gap-3.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={medical}
                    onChange={e => setMedical(e.target.checked)}
                    className="mt-0.5 w-5 h-5 accent-blue-500 rounded cursor-pointer flex-shrink-0"
                  />
                  <span className="text-sm text-slate-500 group-hover:text-slate-300 transition-colors leading-relaxed">
                    I confirm that I hold a valid medical certificate and will ensure it is carried during the flight.
                  </span>
                </label>

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
                  <p className="text-[11px] text-slate-600 text-center leading-snug">{disabledReason}</p>
                )}

                {submitError && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    <span className="material-symbols-outlined text-red-400 text-base flex-shrink-0 mt-0.5">error</span>
                    <p className="text-xs text-red-300">{submitError}</p>
                  </div>
                )}

              </div>
            </section>

            <p className="text-[10px] font-serif italic text-center text-slate-600 px-3 leading-relaxed pb-6">
              Booking requests are reviewed and confirmed by the operations team. You will be notified of the outcome.
            </p>

          </div>
        </form>
      </div>
    </div>
  )
}
