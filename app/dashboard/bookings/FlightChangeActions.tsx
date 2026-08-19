'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelBookingNow, requestLateCancellation, rescheduleFlightBooking } from '@/app/actions/booking'
import { checkCustomerAvailability } from '@/app/actions/customer-availability'
import CalendarDateField from '@/components/CalendarDateField'
import ModalPortal from '@/components/ModalPortal'
import { sydneyInputToUTC } from '@/lib/utils/sydney-time'
import { getDayVfrWindow, isWithinDayVfrWindow } from '@/lib/utils/day-vfr'
import { ADMIN_CONTACT_PHONE_DISPLAY, ADMIN_CONTACT_PHONE_TEL } from '@/lib/contact'

type BookingLite = {
  id: string
  booking_type: string
  status: string
  scheduled_start: string
  scheduled_end?: string | null
}

type Props = {
  booking: BookingLite
  aircraftId: string
  variant?: 'default' | 'listCard'
}

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; message: string }

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

function TimeDropdown({
  value,
  options,
  onChange,
  placeholder = 'Select time',
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  placeholder?: string
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
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [open])

  const selectedLabel = options.find(o => o.value === value)?.label ?? value

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full bg-white border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/60 flex items-center justify-between transition-colors hover:border-[#152d5a]/30 text-[#152d5a]"
      >
        <span className={value === '' ? 'text-[#94a3b8]' : ''}>{value === '' ? placeholder : selectedLabel}</span>
        <span className={`material-symbols-outlined text-[18px] text-[#94a3b8] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
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
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                  o.value === value ? 'bg-blue-50 text-[#1a4fd6] font-semibold' : 'text-[#152d5a] hover:bg-[#f0f6ff]'
                }`}
              >
                <span>{o.label}</span>
                {o.value === value && <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">check</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FlightRescheduleModal({
  aircraftId,
  originalDurationMin,
  submitting,
  onClose,
  onSubmit,
}: {
  aircraftId: string
  originalDurationMin: number
  submitting: boolean
  onClose: () => void
  onSubmit: (date: string, startTime: string, endTime: string) => void
}) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedStartTime, setSelectedStartTime] = useState('')
  const [selectedEndTime, setSelectedEndTime] = useState('')
  const [availability, setAvailability] = useState<AvailabilityState>({ status: 'idle' })
  const [dayVfrError, setDayVfrError] = useState<string | null>(null)

  const minDate = useMemo(() => getSydneyToday(), [])

  // Auto-calculate end time when start time changes if not set
  const handleStartTimeChange = (start: string) => {
    setSelectedStartTime(start)
    if (start) {
      const [h, m] = start.split(':').map(Number)
      const totalMin = (h * 60 + m) + originalDurationMin
      const newH = Math.min(23, Math.floor(totalMin / 60))
      const newM = totalMin % 60
      const calcEnd = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
      setSelectedEndTime(calcEnd)
    }
  }

  useEffect(() => {
    if (!selectedDate || !selectedStartTime || !selectedEndTime) {
      setAvailability({ status: 'idle' })
      setDayVfrError(null)
      return
    }

    const startMin = timeStrToMin(selectedStartTime)
    const endMin = timeStrToMin(selectedEndTime)
    if (endMin <= startMin) {
      setAvailability({ status: 'unavailable', message: 'Return time must be after departure time.' })
      return
    }

    const durationMin = endMin - startMin
    const window = getDayVfrWindow(selectedDate)
    const within = isWithinDayVfrWindow(selectedStartTime, selectedDate, durationMin)
    if (!within) {
      setDayVfrError(`Selected slot must fall within Day VFR (${window.start} - ${window.end}).`)
      setAvailability({ status: 'unavailable', message: 'Outside allowed Day VFR window.' })
      return
    }
    setDayVfrError(null)

    let cancelled = false
    setAvailability({ status: 'checking' })

    const startUtc = sydneyInputToUTC(`${selectedDate}T${selectedStartTime}`)
    const endUtc = sydneyInputToUTC(`${selectedDate}T${selectedEndTime}`)
    if (!startUtc || !endUtc) {
      setAvailability({ status: 'unavailable', message: 'Invalid date/time.' })
      return
    }

    checkCustomerAvailability(aircraftId, startUtc, endUtc)
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
          })
        }
      })
      .catch(() => {
        if (!cancelled) setAvailability({ status: 'unavailable', message: 'Could not verify availability.' })
      })

    return () => {
      cancelled = true
    }
  }, [selectedDate, selectedStartTime, selectedEndTime, aircraftId])

  const canSubmit =
    Boolean(selectedDate && selectedStartTime && selectedEndTime) &&
    availability.status === 'available' &&
    !dayVfrError &&
    !submitting

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="w-full max-w-lg bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#152d5a]/10">
            <h3 className="text-lg font-semibold text-[#152d5a]">Reschedule Flight</h3>
          </div>

          <div className="px-5 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
            <p className="text-sm text-[#4b6390] leading-relaxed">
              Select a new date and time for your flight. Your slot will be updated immediately.
            </p>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4b6390] mb-1.5">
                New flight date
              </label>
              <CalendarDateField
                value={selectedDate}
                onChange={setSelectedDate}
                minYear={new Date().getFullYear()}
                maxYear={new Date().getFullYear() + 2}
                minDate={minDate}
                className="w-full bg-white border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm text-[#152d5a] text-left flex items-center justify-between"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4b6390] mb-1.5">
                  Departure time
                </label>
                <TimeDropdown
                  value={selectedStartTime}
                  options={ALL_TIME_OPTIONS}
                  onChange={handleStartTimeChange}
                  placeholder="Select departure"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4b6390] mb-1.5">
                  Return time
                </label>
                <TimeDropdown
                  value={selectedEndTime}
                  options={ALL_TIME_OPTIONS}
                  onChange={setSelectedEndTime}
                  placeholder="Select return"
                />
              </div>
            </div>

            {dayVfrError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
                {dayVfrError}
              </div>
            )}

            {availability.status === 'checking' && (
              <p className="text-xs text-blue-600">Verifying aircraft slot availability...</p>
            )}

            {availability.status === 'available' && !dayVfrError && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>This flight time slot is available!</span>
              </div>
            )}

            {availability.status === 'unavailable' && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {availability.message}
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-[#152d5a]/10 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-[#4b6390] border border-[#152d5a]/15 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onSubmit(selectedDate, selectedStartTime, selectedEndTime)}
              disabled={!canSubmit}
              className="px-4 py-2 text-sm text-white bg-[#152d5a] hover:bg-[#1a3a6e] rounded-lg disabled:opacity-40 font-semibold"
            >
              {submitting ? 'Updating...' : 'Confirm Reschedule'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

export default function FlightChangeActions({
  booking,
  aircraftId,
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

  const originalDurationMin = useMemo(() => {
    if (!booking.scheduled_start || !booking.scheduled_end) return 120
    const diff = new Date(booking.scheduled_end).getTime() - new Date(booking.scheduled_start).getTime()
    return Math.max(30, Math.floor(diff / 60_000))
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

  const handleRescheduleSubmit = (date: string, startTime: string, endTime: string) => {
    startTransition(async () => {
      try {
        await rescheduleFlightBooking(booking.id, date, startTime, endTime)
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
          aircraftId={aircraftId}
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
              <div className="px-5 py-4 border-b border-[#152d5a]/10">
                <h3 className="text-lg font-semibold text-[#152d5a]">Manual approval required</h3>
              </div>
              <div className="px-5 py-5 space-y-3">
                <p className="text-sm text-[#4b6390] leading-relaxed">
                  Your flight is less than 12 hours away.
                </p>
                <p className="text-sm text-[#4b6390] leading-relaxed">
                  To reschedule at this stage, please call OZ Rent A Plane so the operations team can review and approve the change manually.
                </p>
                <p className="text-sm text-[#152d5a]">
                  Call:{' '}
                  <a href={`tel:${ADMIN_CONTACT_PHONE_TEL}`} className="text-[#1a4fd6] hover:text-[#1540a8] underline underline-offset-2">
                    {ADMIN_CONTACT_PHONE_DISPLAY}
                  </a>
                </p>
              </div>
              <div className="px-5 py-4 border-t border-[#152d5a]/10 flex justify-end">
                <button
                  onClick={() => setRescheduleBlockedModalOpen(false)}
                  className="px-4 py-2 text-sm text-[#4b6390] border border-[#152d5a]/15 rounded-lg"
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
              <div className="px-5 py-4 border-b border-[#152d5a]/10">
                <h3 className="text-lg font-semibold text-[#152d5a]">Cancel flight booking?</h3>
              </div>
              <div className="px-5 py-5">
                <p className="text-sm text-[#4b6390] leading-relaxed">
                  Your booking will be cancelled and your aircraft reservation released without charge because departure is more than 24 hours away.
                </p>
                {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
              </div>
              <div className="px-5 py-4 border-t border-[#152d5a]/10 flex justify-end gap-3">
                <button
                  onClick={() => setCancelModalOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 text-sm text-[#4b6390] border border-[#152d5a]/15 rounded-lg"
                >
                  Keep flight
                </button>
                <button
                  onClick={handleImmediateCancel}
                  disabled={isPending}
                  className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg font-semibold disabled:opacity-50"
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
              <div className="px-5 py-4 border-b border-[#152d5a]/10">
                <h3 className="text-lg font-semibold text-[#152d5a]">Request flight cancellation?</h3>
              </div>
              <div className="px-5 py-5 space-y-4">
                <p className="text-sm text-[#4b6390] leading-relaxed">
                  This flight is scheduled within 24 hours. A late cancellation request will be submitted for operations team review.
                </p>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4b6390] mb-2">
                    Reason for cancellation
                  </label>
                  <textarea
                    rows={3}
                    value={lateCancelReason}
                    onChange={(e) => setLateCancelReason(e.target.value)}
                    disabled={isPending}
                    placeholder="Add a short note for the operations team..."
                    className="w-full px-4 py-3 bg-white border border-[#152d5a]/15 focus:border-[#1a4fd6]/50 focus:outline-none focus:ring-1 focus:ring-[#1a4fd6]/20 rounded-xl text-[#152d5a] text-sm placeholder:text-[#94a3b8] transition-colors resize-none leading-relaxed"
                  />
                </div>
                {actionError && <p className="text-sm text-red-600">{actionError}</p>}
              </div>
              <div className="px-5 py-4 border-t border-[#152d5a]/10 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setLateCancelModalOpen(false)
                    setLateCancelReason('')
                  }}
                  disabled={isPending}
                  className="px-4 py-2 text-sm text-[#4b6390] border border-[#152d5a]/15 rounded-lg"
                >
                  Keep flight
                </button>
                <button
                  onClick={handleLateCancelSubmit}
                  disabled={isPending}
                  className="px-4 py-2 text-sm text-white bg-amber-500 hover:bg-amber-600 rounded-lg font-semibold disabled:opacity-50"
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
