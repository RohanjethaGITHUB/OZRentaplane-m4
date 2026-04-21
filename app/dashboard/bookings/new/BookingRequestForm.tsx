'use client'

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
  formatAircraftTimeRange,
} from '@/lib/utils/sydney-time'

// ── Types ─────────────────────────────────────────────────────────────────────

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available';   message: string; debugError?: string }
  | { status: 'unavailable'; message: string; conflicts: SafeConflict[]; debugError?: string }

type Props = {
  aircraftId:         string
  picName:            string | null
  picArn:             string | null
  eligibilityBlocked: boolean
}

// Derive Sydney-local date string from a datetime-local input value
function getDatePart(dtLocalValue: string): string {
  return dtLocalValue ? dtLocalValue.split('T')[0] : ''
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BookingRequestForm({ aircraftId, picName, picArn, eligibilityBlocked }: Props) {
  const router = useRouter()
  const [isSubmitting, startSubmit] = useTransition()

  const [startDT, setStartDT] = useState('') // "YYYY-MM-DDTHH:MM"
  const [endDT,   setEndDT]   = useState('') // "YYYY-MM-DDTHH:MM"
  const [notes,   setNotes]   = useState('')
  const [terms,   setTerms]   = useState(false)
  const [risk,    setRisk]    = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [availability, setAvailability] = useState<AvailabilityState>({ status: 'idle' })

  // ── Live availability check (debounced, called on start/end change) ────────
  const runAvailabilityCheck = useCallback(
    async (start: string, end: string) => {
      const startUTC = sydneyInputToUTC(start)
      const endUTC   = sydneyInputToUTC(end)
      if (!startUTC || !endUTC) return

      const startDate = new Date(startUTC)
      const endDate   = new Date(endUTC)
      if (endDate <= startDate) return // invalid range — handled by form validation

      setAvailability({ status: 'checking' })

      let result: AvailabilityCheckResult
      try {
        result = await checkCustomerAvailability(aircraftId, startUTC, endUTC)
      } catch {
        setAvailability({ status: 'unavailable', message: 'Unable to check availability. Please try again.', conflicts: [] })
        return
      }

      if (result.available) {
        setAvailability({ status: 'available', message: result.message, debugError: result.debugError })
      } else {
        setAvailability({ status: 'unavailable', message: result.message, conflicts: result.conflicts, debugError: result.debugError })
      }
    },
    [aircraftId],
  )

  // Debounce: run check 600ms after user stops typing
  useEffect(() => {
    if (!startDT || !endDT) {
      setAvailability({ status: 'idle' })
      return
    }
    const timer = setTimeout(() => runAvailabilityCheck(startDT, endDT), 600)
    return () => clearTimeout(timer)
  }, [startDT, endDT, runAvailabilityCheck])

  // ── Selected date → fetch upcomingSlots for the day panel ───────────────
  const selectedDate = getDatePart(startDT)
  const [daySlots, setDaySlots] = useState<SafeConflict[]>([])
  const [daySlotsLoading, setDaySlotsLoading] = useState(false)
  const [daySlotsError, setDaySlotsError] = useState(false)

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

  // ── Min time: 1 hour from now in Sydney ──────────────────────────────────
  const minStartDT = (() => {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    const sydStr = d.toLocaleString('sv-SE', { timeZone: 'Australia/Sydney' })
    return sydStr.slice(0, 16) // "YYYY-MM-DD HH:MM" → "YYYY-MM-DDTHH:MM"
      .replace(' ', 'T')
  })()

  // ── Submit gate ───────────────────────────────────────────────────────────
  const canSubmit =
    !isSubmitting &&
    !eligibilityBlocked &&
    !!startDT &&
    !!endDT &&
    availability.status === 'available' &&
    terms &&
    risk

  // ── Handle submit ─────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    if (!startDT || !endDT) {
      setSubmitError('Please select a start and end date/time.')
      return
    }
    const startUTC = sydneyInputToUTC(startDT)
    const endUTC   = sydneyInputToUTC(endDT)
    if (!startUTC || !endUTC) {
      setSubmitError('Invalid date/time values.')
      return
    }
    if (new Date(endUTC) <= new Date(startUTC)) {
      setSubmitError('End time must be after start time.')
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
    if (!terms || !risk) {
      setSubmitError('You must accept the terms and risk acknowledgement.')
      return
    }

    const input: CreateBookingInput = {
      aircraft_id:    aircraftId,
      scheduled_start: startUTC,
      scheduled_end:   endUTC,
      pic_name:        picName  ?? undefined,
      pic_arn:         picArn   ?? undefined,
      customer_notes:  notes || null,
      terms_accepted:  terms,
      risk_acknowledgement_accepted: risk,
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

      {/* ── Form (3/5 width) ───────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-6">

        {/* Start datetime */}
        <div>
          <label className="block text-[10px] uppercase tracking-widest font-bold text-oz-muted mb-2">
            Departure — Date &amp; Time (Sydney) <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-oz-blue/60 text-base pointer-events-none z-10"
              style={{ fontVariationSettings: "'wght' 300" }}>flight_takeoff</span>
            <input
              type="datetime-local"
              required
              value={startDT}
              min={minStartDT}
              onChange={e => { setStartDT(e.target.value); if (endDT && e.target.value >= endDT) setEndDT('') }}
              className="w-full pl-10 pr-4 py-3 bg-[#050B14] border border-white/10 focus:border-oz-blue/50 focus:outline-none rounded-xl text-white text-sm transition-colors [color-scheme:dark]"
            />
          </div>
          <p className="text-[10px] text-oz-muted mt-1">Times are interpreted as Sydney local time (AEST/AEDT).</p>
        </div>

        {/* End datetime */}
        <div>
          <label className="block text-[10px] uppercase tracking-widest font-bold text-oz-muted mb-2">
            Return — Date &amp; Time (Sydney) <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-oz-blue/60 text-base pointer-events-none z-10"
              style={{ fontVariationSettings: "'wght' 300" }}>flight_land</span>
            <input
              type="datetime-local"
              required
              value={endDT}
              min={startDT || minStartDT}
              disabled={!startDT}
              onChange={e => setEndDT(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#050B14] border border-white/10 focus:border-oz-blue/50 focus:outline-none rounded-xl text-white text-sm transition-colors [color-scheme:dark] disabled:opacity-40"
            />
          </div>
          {endDT && startDT && endDT <= startDT && (
            <p className="text-[10px] text-red-400 mt-1">Return time must be after departure time.</p>
          )}
        </div>

        {/* Duration badge */}
        {estimatedHours && estimatedHours > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-oz-blue/10 border border-oz-blue/20 rounded-xl">
            <span className="material-symbols-outlined text-oz-blue text-sm" style={{ fontVariationSettings: "'wght' 300" }}>timer</span>
            <span className="text-sm text-white font-medium">Estimated duration: {estimatedHours.toFixed(1)} h</span>
            <span className="text-[10px] text-oz-muted ml-auto">(Subject to actual meter time)</span>
          </div>
        )}

        {/* Availability status */}
        {availability.status === 'idle' && (
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/5 rounded-xl">
            <span className="material-symbols-outlined text-slate-500 text-base" style={{ fontVariationSettings: "'wght' 300" }}>info</span>
            <p className="text-xs text-oz-muted">Select a start and end time to check availability.</p>
          </div>
        )}
        {availability.status === 'checking' && (
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/5 rounded-xl">
            <span className="material-symbols-outlined text-oz-blue text-base animate-spin">progress_activity</span>
            <p className="text-xs text-oz-blue">Checking aircraft availability…</p>
          </div>
        )}
        {availability.status === 'available' && (
          <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-5 py-4">
            <span className="material-symbols-outlined text-green-400 text-lg flex-shrink-0 mt-0.5">check_circle</span>
            <div className="flex-1">
              <p className="text-sm text-green-300">{availability.message}</p>
              {availability.debugError && (
                <div className="mt-2 text-xs font-mono text-green-300/60 bg-green-900/10 p-2 rounded border border-green-500/10">
                  <strong>Debug:</strong> {availability.debugError}
                </div>
              )}
            </div>
          </div>
        )}
        {availability.status === 'unavailable' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 space-y-2">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-red-400 text-lg flex-shrink-0 mt-0.5">error</span>
              <div className="flex-1">
                <p className="text-sm text-red-300 font-medium">{availability.message}</p>
                {availability.debugError && (
                  <div className="mt-2 text-xs font-mono text-red-300/60 bg-red-900/10 p-2 rounded border border-red-500/10">
                    <strong>Debug:</strong> {availability.debugError}
                  </div>
                )}
              </div>
            </div>
            {availability.conflicts.length > 0 && (
              <div className="space-y-1 ml-7">
                {availability.conflicts.map((c, i) => (
                  <div key={i} className="text-[10px] text-red-400/80 flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                    <span>{c.label}</span>
                    <span className="font-mono text-oz-muted">
                      {formatAircraftTimeRange(c.start_time, c.end_time)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-[10px] uppercase tracking-widest font-bold text-oz-muted mb-2">Customer Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any additional information for the operations team…"
            className="w-full px-4 py-3 bg-[#050B14] border border-white/10 focus:border-oz-blue/50 focus:outline-none rounded-xl text-white text-sm placeholder:text-oz-subtle transition-colors resize-none"
          />
        </div>

        {/* Agreements */}
        <div className="space-y-3 bg-white/5 border border-white/5 rounded-xl p-5">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)}
              className="mt-1 w-4 h-4 accent-oz-blue rounded cursor-pointer" />
            <span className="text-sm text-oz-muted group-hover:text-white/80 transition-colors leading-relaxed">
              I accept the{' '}
              <a href="/terms-and-conditions" target="_blank" className="text-oz-blue hover:underline">Terms and Conditions</a>{' '}
              of OZRentAPlane.
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input type="checkbox" checked={risk} onChange={e => setRisk(e.target.checked)}
              className="mt-1 w-4 h-4 accent-oz-blue rounded cursor-pointer" />
            <span className="text-sm text-oz-muted group-hover:text-white/80 transition-colors leading-relaxed">
              I acknowledge the{' '}
              <a href="/safety-disclaimer" target="_blank" className="text-oz-blue hover:underline">Safety Disclaimer</a>{' '}
              and accept the inherent risks of general aviation.
            </span>
          </label>
        </div>

        {/* Submit error */}
        {submitError && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4">
            <span className="material-symbols-outlined text-red-400 text-lg flex-shrink-0 mt-0.5">error</span>
            <p className="text-sm text-red-300">{submitError}</p>
          </div>
        )}

        {/* CTA */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/30 disabled:cursor-not-allowed text-white font-bold text-sm uppercase tracking-widest rounded-full transition-colors shadow-[0_0_20px_rgba(37,99,235,0.3)] flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              Submitting Request…
            </>
          ) : availability.status === 'checking' ? (
            <>
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              Checking Availability…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm">send</span>
              Submit Booking Request
            </>
          )}
        </button>
        <p className="text-center text-[10px] text-oz-muted">
          Booking requests are reviewed and confirmed by the operations team. You will be notified of the outcome.
        </p>
      </form>

      {/* ── Right panel: day timeline (2/5 width) ─────────────────────────── */}
      <div className="lg:col-span-2">
        <div className="bg-[#0c121e]/60 border border-white/5 rounded-[1.25rem] p-6 sticky top-24">
          <h3 className="text-[10px] uppercase tracking-widest font-bold text-oz-blue/70 mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">event</span>
            {selectedDate ? 'Day Availability' : 'Upcoming Blocks'}
          </h3>

          {!selectedDate ? (
            <div className="mt-4 text-center py-8">
              <span className="material-symbols-outlined text-3xl text-slate-600 mb-3 block" style={{ fontVariationSettings: "'wght' 200" }}>calendar_month</span>
              <p className="text-xs text-oz-muted leading-relaxed">Select a date to view availability for that day.</p>
            </div>
          ) : daySlotsLoading ? (
            <div className="mt-4 text-center py-8">
              <span className="material-symbols-outlined text-2xl text-oz-blue/50 mb-3 block animate-spin">progress_activity</span>
              <p className="text-xs text-oz-muted">Loading day availability…</p>
            </div>
          ) : daySlotsError ? (
            <div className="mt-4 text-center py-8">
              <span className="material-symbols-outlined text-3xl text-amber-400/70 mb-3 block">warning</span>
              <p className="text-xs text-amber-400 font-medium">Unable to load day availability.</p>
              <p className="text-[10px] text-oz-muted mt-1">Please try selecting the date again.</p>
            </div>
          ) : daySlots.length === 0 ? (
            <div className="mt-4 text-center py-8">
              <span className="material-symbols-outlined text-3xl text-green-400/70 mb-3 block">event_available</span>
              <p className="text-xs text-green-400 font-medium">No unavailable periods for this day.</p>
              <p className="text-[10px] text-oz-muted mt-1">Aircraft appears available.</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] text-oz-muted mt-1 mb-4">
                {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-AU', {
                  timeZone: 'Australia/Sydney', weekday: 'long', month: 'long', day: 'numeric',
                })}
              </p>
              <div className="space-y-2">
                {daySlots.map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-red-500/10 border border-red-500/10 rounded-xl px-4 py-3">
                    <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-red-300">{slot.label}</p>
                      <p className="text-[10px] text-oz-muted font-mono tabular-nums mt-0.5">
                        {formatSydTime(slot.start_time)} – {formatSydTime(slot.end_time)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Conflict overlay from live check */}
          {availability.status === 'unavailable' && availability.conflicts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-[9px] uppercase tracking-widest font-bold text-red-400/60 mb-2">Selected window conflict</p>
              {availability.conflicts.map((c, i) => (
                <div key={i} className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                  <span className="text-[10px] text-red-300 flex-1">{c.label}</span>
                  <span className="text-[9px] text-oz-muted font-mono tabular-nums whitespace-nowrap">
                    {formatSydTime(c.start_time)}–{formatSydTime(c.end_time)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-white/5 flex gap-4 text-[9px] uppercase tracking-widest text-slate-600">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" /> Unavailable</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400" /> Available</span>
          </div>
        </div>
      </div>

    </div>
  )
}
