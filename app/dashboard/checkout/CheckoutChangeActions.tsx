'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelCheckoutRequest, requestCheckoutReschedule, requestLateCheckoutCancellation } from '@/app/actions/checkout'
import { checkCustomerAvailability, getDayAvailability, type SafeConflict } from '@/app/actions/customer-availability'
import CalendarDateField from '@/components/CalendarDateField'
import ModalPortal from '@/components/ModalPortal'
import CheckoutTimeProposalModal from '@/components/customer/CheckoutTimeProposalModal'
import { sydneyInputToUTC } from '@/lib/utils/sydney-time'
import { getDayVfrWindow, isWithinDayVfrWindow } from '@/lib/utils/day-vfr'
import { isCheckoutSelfServiceAllowed } from '@/lib/checkout-policy'
import { ADMIN_CONTACT_PHONE_DISPLAY, ADMIN_CONTACT_PHONE_TEL } from '@/lib/contact'
import { formatDateTime } from '@/lib/formatDateTime'

type BookingLite = {
  id: string
  booking_type: string
  status: string
  scheduled_start: string
  scheduled_end?: string | null
  checkout_lifecycle_status: string | null
}

type RescheduleRequestLite = {
  id: string
  status: string
  requested_scheduled_start: string | null
  requested_scheduled_end: string | null
  admin_note?: string | null
}

type Props = {
  checkout: BookingLite
  aircraftId: string
  pendingRescheduleRequest: RescheduleRequestLite | null
  latestRescheduleRequest: RescheduleRequestLite | null
  /** `listCard` matches upcoming-flight action column styles on /dashboard/bookings */
  variant?: 'default' | 'listCard'
}

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; message: string }

const DEFAULT_CHECKOUT_START_TIME = '09:00'
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

function addTwoHours(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const totalMin = (h * 60 + m) + 120
  const newH = Math.min(23, Math.floor(totalMin / 60))
  const newM = totalMin % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

function getSydneyToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

function timeStrToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function canModifyCheckoutUi(checkout: BookingLite) {
  if (!checkout || checkout.booking_type !== 'checkout') return false
  if (!['checkout_requested', 'checkout_confirmed'].includes(checkout.status)) return false
  if (!checkout.scheduled_start || !isCheckoutSelfServiceAllowed(checkout.scheduled_start, new Date())) return false
  if (['cancelled_by_customer', 'cancelled_by_admin', 'completed'].includes(checkout.checkout_lifecycle_status ?? '')) return false
  if (['cancelled', 'completed'].includes(checkout.status)) return false
  return true
}

function TimeDropdown({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
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
      return
    }
    const defaultStart = listRef.current.querySelector('[data-default-start="true"]') as HTMLElement | null
    defaultStart?.scrollIntoView({ block: 'center' })
  }, [open])

  const selectedLabel = options.find(o => o.value === value)?.label ?? value

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full bg-white border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/60 flex items-center justify-between transition-colors hover:border-[#152d5a]/30 text-[#152d5a]"
      >
        <span className={value === '' ? 'text-[#94a3b8]' : ''}>{value === '' ? 'Select departure time' : selectedLabel}</span>
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

function AvailabilityTimeline({
  selectedDate,
  daySlots,
  startDT,
  endDT,
  onTimeChange,
  dayVfrWindow,
}: {
  selectedDate: string
  daySlots: SafeConflict[]
  startDT: string
  endDT: string
  onTimeChange?: (newTime: string) => void
  dayVfrWindow?: { start: string; end: string } | null
}) {
  if (!selectedDate) return null

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

  const selLeft = hasSelection ? toPercent(selStartUTC!) : 0
  const selRight = hasSelection ? 100 - toPercent(selEndUTC!) : 0
  const barContainerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  function toSnappedTime(rawMinutes: number): string {
    const snappedMinutes = Math.round(rawMinutes / 15) * 15
    const minClamp = dayVfrWindow ? timeStrToMin(dayVfrWindow.start) : 0
    const maxClamp = dayVfrWindow ? timeStrToMin(dayVfrWindow.end) - 120 : 22 * 60
    const clamped = Math.max(minClamp, Math.min(maxClamp, snappedMinutes))
    const h = Math.floor(clamped / 60)
    const m = clamped % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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
      <div className="relative" ref={barContainerRef}>
        <div
          onClick={handleTimelineClick}
          className={`relative h-10 rounded-lg overflow-hidden border ${dayVfrWindow ? 'bg-[#dbeafe] border-[#93c5fd]' : 'bg-green-50 border-green-200'} ${onTimeChange ? 'cursor-pointer' : ''}`}
        >
          {dayVfrWindow && (
            <>
              <div
                className="absolute top-0 bottom-0 bg-[#1a3a6b]/90 flex items-center justify-center overflow-hidden"
                style={{ left: '0%', right: `${100 - (timeStrToMin(dayVfrWindow.start) / (24 * 60)) * 100}%` }}
              >
                <span className="text-[8px] text-[#eff6ff] select-none leading-none">🌙</span>
              </div>
              <div
                className="absolute top-0 bottom-0 bg-[#bfdbfe]"
                style={{
                  left: `${(timeStrToMin(dayVfrWindow.start) / (24 * 60)) * 100}%`,
                  right: `${100 - (timeStrToMin(dayVfrWindow.end) / (24 * 60)) * 100}%`,
                }}
              />
              <div
                className="absolute top-0 bottom-0 bg-[#1a3a6b]/90 flex items-center justify-center overflow-hidden"
                style={{ left: `${(timeStrToMin(dayVfrWindow.end) / (24 * 60)) * 100}%`, right: '0%' }}
              >
                <span className="text-[8px] text-[#eff6ff] select-none leading-none">🌙</span>
              </div>
            </>
          )}

          {visibleSlots.map((slot, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 bg-red-500/60"
              style={{ left: `${toPercent(slot.start_time)}%`, right: `${100 - toPercent(slot.end_time)}%` }}
              title={slot.label}
            />
          ))}

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
                left: `${selLeft}%`,
                right: `${selRight}%`,
                touchAction: onTimeChange ? 'none' : undefined,
              }}
              title={onTimeChange ? 'Drag to move selected time' : undefined}
            >
              <div className="flex items-center gap-[3px] pointer-events-none select-none opacity-60">
                <div className="w-px h-3.5 bg-blue-300 rounded-full" />
                <div className="w-px h-3.5 bg-blue-300 rounded-full" />
              </div>
            </div>
          )}
        </div>
      </div>
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
      <div className="flex flex-wrap gap-5 pt-1">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#64748b]">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500/40 inline-block" />
          {dayVfrWindow ? `Day VFR (${dayVfrWindow.start}-${dayVfrWindow.end})` : 'Available'}
        </span>
        {dayVfrWindow && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#64748b]">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#1a3a6b] border border-[#93c5fd] inline-block" />Night restricted
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#64748b]">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500/60 inline-block" />Booked
        </span>
        {hasSelection && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#64748b]">
            <span className="w-2.5 h-2.5 rounded-sm border-2 border-blue-400/80 inline-block" />
            Selected time ({startDT.split('T')[1] ?? '--:--'}) - drag or click timeline
          </span>
        )}
      </div>
    </div>
  )
}

function CheckoutRescheduleModal({
  aircraftId,
  submitting,
  onClose,
  onSubmit,
}: {
  aircraftId: string
  submitting: boolean
  onClose: () => void
  onSubmit: (date: string, time: string) => void
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
      setAvail({ status: 'idle' })
      return
    }
    if (new Date(startUTC) <= new Date()) {
      setAvail({ status: 'unavailable', message: 'Please select a future checkout time.' })
      return
    }
    setAvail({ status: 'checking' })
    const timer = setTimeout(() => {
      checkCustomerAvailability(aircraftId, startUTC, endUTC, 'checkout')
        .then(r => {
          if (r.available) setAvail({ status: 'available' })
          else setAvail({ status: 'unavailable', message: 'This time slot is not available.' })
        })
        .catch(() => setAvail({ status: 'idle' }))
    }, 500)
    return () => clearTimeout(timer)
  }, [startUTC, endUTC, aircraftId])

  const handleSubmit = () => {
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
      <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
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
                minDate={getSydneyToday()}
                className="w-full h-11 bg-white border border-[#152d5a]/15 rounded-xl px-4 py-3 text-base text-[#152d5a] text-left flex items-center justify-between"
              />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#64748b] mb-2">Departure time</p>
              <TimeDropdown value={startTime} options={timeOptions} onChange={(v) => { setStartTime(v); setError(null) }} />
              <p className="mt-2 text-[11px] text-[#152d5a] leading-snug">
                Expected duration: <span className="font-semibold">2 hours</span>
                <span className="text-[#334155]"> · Approx. 1 hr familiarisation + 1 hr checkout</span>
              </p>
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
                onTimeChange={(next) => { setStartTime(next); setError(null) }}
                dayVfrWindow={dayVfrWindow}
              />
            </div>
          )}

          {nightVfrTimeError && <p className="text-sm text-amber-600">{nightVfrTimeError}</p>}
          {dayVfrWindow && (
            <p className="text-[11px] text-[#64748b]">Day VFR window: {dayVfrWindow.start} - {dayVfrWindow.end}</p>
          )}
          {avail.status === 'checking' && <p className="text-sm text-[#64748b]">Checking availability...</p>}
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
            {submitting ? 'Sending...' : 'Send reschedule request'}
          </button>
        </div>
      </div>
      </div>
    </ModalPortal>
  )
}

export default function CheckoutChangeActions({
  checkout,
  aircraftId,
  pendingRescheduleRequest,
  latestRescheduleRequest,
  variant = 'default',
}: Props) {
  const router = useRouter()
  const isListCard = variant === 'listCard'
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [lateCancelModalOpen, setLateCancelModalOpen] = useState(false)
  const [lateCancelReason, setLateCancelReason] = useState('')
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false)
  const [rescheduleBlockedModalOpen, setRescheduleBlockedModalOpen] = useState(false)
  const [proposalModalOpen, setProposalModalOpen] = useState(false)
  const [isCancelling, startCancelTransition] = useTransition()
  const [isRescheduling, startRescheduleTransition] = useTransition()
  const [pendingState, setPendingState] = useState<RescheduleRequestLite | null>(pendingRescheduleRequest)

  useEffect(() => {
    setPendingState(pendingRescheduleRequest)
  }, [pendingRescheduleRequest])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('reviewProposal') === '1' || params.get('reviewProposal') === 'true') {
        if (pendingState?.status === 'pending' && pendingState.admin_note === 'admin_proposed') {
          setProposalModalOpen(true)
        }
      }
    }
  }, [pendingState])

  const canModify = canModifyCheckoutUi(checkout)
  const selfServiceBlockedByCutoff =
    checkout.booking_type === 'checkout' &&
    ['checkout_requested', 'checkout_confirmed'].includes(checkout.status) &&
    !isCheckoutSelfServiceAllowed(checkout.scheduled_start, new Date())
  const isLateCancelPending = checkout.status === 'cancellation_requested'
  const hasPendingReschedule = pendingState?.status === 'pending'

  const requestedRescheduleLabel = useMemo(() => {
    if (!pendingState?.requested_scheduled_start) return null
    return new Date(pendingState.requested_scheduled_start).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }, [pendingState])

  const rejectedRescheduleLabel = useMemo(() => {
    if (
      latestRescheduleRequest?.status !== 'rejected' ||
      latestRescheduleRequest.admin_note === 'admin_proposed' ||
      !latestRescheduleRequest.requested_scheduled_start
    ) {
      return null
    }
    const start = new Date(latestRescheduleRequest.requested_scheduled_start).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    if (!latestRescheduleRequest.requested_scheduled_end) return start
    const end = new Date(latestRescheduleRequest.requested_scheduled_end).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      hour: 'numeric',
      minute: '2-digit',
    })
    return `${start} – ${end}`
  }, [latestRescheduleRequest])

  const latestApproved = latestRescheduleRequest?.status === 'approved'
  const latestRejected = latestRescheduleRequest?.status === 'rejected' && latestRescheduleRequest.admin_note !== 'admin_proposed'

  const handleCancel = () => {
    setActionError(null)
    setActionSuccess(null)
    startCancelTransition(async () => {
      try {
        await cancelCheckoutRequest(checkout.id)
        setPendingState(null)
        setActionSuccess('Your checkout flight has been cancelled.')
        setCancelModalOpen(false)
        setRescheduleModalOpen(false)
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not cancel checkout.'
        setActionError(msg.replace(/^VALIDATION: /, ''))
      }
    })
  }

  const handleLateCancel = () => {
    setActionError(null)
    setActionSuccess(null)
    startCancelTransition(async () => {
      try {
        await requestLateCheckoutCancellation(checkout.id, lateCancelReason.trim() || null)
        setLateCancelModalOpen(false)
        setLateCancelReason('')
        setActionSuccess('Your cancellation request has been submitted for review.')
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not submit cancellation request.'
        setActionError(msg.replace(/^VALIDATION: /, ''))
      }
    })
  }

  const openCancelFlow = () => {
    setActionError(null)
    if (selfServiceBlockedByCutoff) {
      setLateCancelModalOpen(true)
      return
    }
    setCancelModalOpen(true)
  }

  const openRescheduleFlow = () => {
    setActionError(null)
    if (selfServiceBlockedByCutoff) {
      setRescheduleBlockedModalOpen(true)
      return
    }
    setRescheduleModalOpen(true)
  }

  const handleRescheduleSubmit = (date: string, time: string) => {
    setActionError(null)
    setActionSuccess(null)
    startRescheduleTransition(async () => {
      try {
        await requestCheckoutReschedule(checkout.id, date, time)
        const nextStartUtc = sydneyInputToUTC(`${date}T${time}`)
        const nextEndUtc = nextStartUtc
          ? new Date(new Date(nextStartUtc).getTime() + 2 * 60 * 60 * 1000).toISOString()
          : null
        setPendingState({
          id: `pending-${checkout.id}`,
          status: 'pending',
          requested_scheduled_start: nextStartUtc,
          requested_scheduled_end: nextEndUtc,
        })
        setRescheduleModalOpen(false)
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not submit reschedule request.'
        setActionError(msg.replace(/^VALIDATION: |^AVAILABILITY: /, ''))
      }
    })
  }

  if (
    !canModify &&
    !selfServiceBlockedByCutoff &&
    !isLateCancelPending &&
    checkout.checkout_lifecycle_status !== 'cancelled_by_customer'
  ) {
    return null
  }

  const showActionButtons =
    !isLateCancelPending &&
    checkout.checkout_lifecycle_status !== 'cancelled_by_customer' &&
    checkout.checkout_lifecycle_status !== 'cancelled_by_admin' &&
    checkout.checkout_lifecycle_status !== 'completed'

  const cancelButtonClass = isListCard
    ? 'flex items-center justify-center whitespace-nowrap border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-bold tracking-[0.06em] uppercase px-5 py-2.5 rounded-xl transition-colors w-full min-h-[40px]'
    : 'inline-flex items-center gap-2 px-6 py-3 border border-rose-300 bg-white text-rose-600 hover:bg-rose-50 disabled:bg-[#f8fafc] disabled:border-[#e2e8f0] disabled:text-[#94a3b8] rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all'

  const modifyButtonClass = isListCard
    ? 'flex items-center justify-center whitespace-nowrap border border-[#152d5a]/20 text-[#152d5a] hover:bg-[#f0f6ff] disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-bold tracking-[0.06em] uppercase px-5 py-2.5 rounded-xl transition-colors w-full min-h-[40px]'
    : 'inline-flex items-center gap-2 px-6 py-3 bg-[#152d5a] hover:bg-[#1a3a6e] disabled:bg-[#e2e8f0] disabled:text-[#64748b] text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all'

  return (
    <>
      {cancelModalOpen && canModify && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#152d5a]/10">
              <h3 className="text-lg font-semibold text-[#152d5a]">Cancel checkout flight?</h3>
            </div>
            <div className="px-5 py-5">
              <p className="text-sm text-[#4b6390] leading-relaxed">
                You can cancel your checkout flight if it is more than 12 hours away. This will release your current checkout slot.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-[#152d5a]/10 flex justify-end gap-3">
              <button onClick={() => setCancelModalOpen(false)} className="px-4 py-2 text-sm text-[#4b6390] border border-[#152d5a]/15 rounded-lg">
                Keep checkout
              </button>
              <button
                onClick={handleCancel}
                disabled={isCancelling}
                className="px-4 py-2 text-sm text-white bg-rose-500/70 hover:bg-rose-500 rounded-lg disabled:opacity-40"
              >
                {isCancelling ? 'Cancelling...' : 'Cancel checkout'}
              </button>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {lateCancelModalOpen && selfServiceBlockedByCutoff && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#152d5a]/10">
                <h3 className="text-lg font-semibold text-[#152d5a]">Request cancellation?</h3>
              </div>
              <div className="px-5 py-5 space-y-4">
                <p className="text-sm text-[#4b6390] leading-relaxed">
                  Your checkout flight is less than 12 hours away. You can submit a cancellation request for operations review.
                  A cancellation charge may apply — the team can waive or apply the charge when they review your request.
                </p>
                <div className="rounded-xl border border-[#1a4fd6]/15 bg-[#f7faff] px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b6390]">Checkout details</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b6390]">Departure</p>
                      <p className="mt-1 text-[13px] font-semibold text-[#152d5a] leading-snug">
                        {formatDateTime(checkout.scheduled_start)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b6390]">Return</p>
                      <p className="mt-1 text-[13px] font-semibold text-[#152d5a] leading-snug">
                        {formatDateTime(checkout.scheduled_end)}
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4b6390] mb-2">
                    Reason for cancellation
                  </label>
                  <textarea
                    rows={3}
                    value={lateCancelReason}
                    onChange={(e) => setLateCancelReason(e.target.value)}
                    disabled={isCancelling}
                    placeholder="Add a short note for the operations team..."
                    className="w-full px-4 py-3 bg-white border border-[#152d5a]/15 focus:border-[#1a4fd6]/50 focus:outline-none focus:ring-1 focus:ring-[#1a4fd6]/20 rounded-xl text-[#152d5a] text-sm placeholder:text-[#94a3b8] transition-colors resize-none leading-relaxed"
                  />
                </div>
                {actionError && <p className="text-sm text-red-600">{actionError}</p>}
              </div>
              <div className="px-5 py-4 border-t border-[#152d5a]/10 flex justify-end gap-3">
                <button
                  onClick={() => {
                    if (isCancelling) return
                    setLateCancelModalOpen(false)
                    setLateCancelReason('')
                    setActionError(null)
                  }}
                  disabled={isCancelling}
                  className="px-4 py-2 text-sm text-[#4b6390] border border-[#152d5a]/15 rounded-lg disabled:opacity-50"
                >
                  Keep checkout
                </button>
                <button
                  onClick={handleLateCancel}
                  disabled={isCancelling}
                  className="px-4 py-2 text-sm text-white bg-amber-500 hover:bg-amber-600 rounded-lg disabled:opacity-40"
                >
                  {isCancelling ? 'Submitting...' : 'Submit cancellation request'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {rescheduleBlockedModalOpen && selfServiceBlockedByCutoff && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#152d5a]/10">
                <h3 className="text-lg font-semibold text-[#152d5a]">Manual approval required</h3>
              </div>
              <div className="px-5 py-5 space-y-3">
                <p className="text-sm text-[#4b6390] leading-relaxed">
                  Your checkout flight is less than 12 hours away.
                </p>
                <p className="text-sm text-[#4b6390] leading-relaxed">
                  To reschedule at this stage, please call OZ Rent A Plane so the team can review and approve the change manually.
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

      {rescheduleModalOpen && canModify && !hasPendingReschedule && (
        <CheckoutRescheduleModal
          aircraftId={aircraftId}
          submitting={isRescheduling}
          onClose={() => setRescheduleModalOpen(false)}
          onSubmit={handleRescheduleSubmit}
        />
      )}

      {proposalModalOpen && pendingState?.requested_scheduled_start && (
        <CheckoutTimeProposalModal
          open={proposalModalOpen}
          onClose={() => setProposalModalOpen(false)}
          bookingId={checkout.id}
          requestedStart={pendingState.requested_scheduled_start}
          requestedEnd={pendingState.requested_scheduled_end}
          originalStart={checkout.scheduled_start}
          originalEnd={checkout.scheduled_end}
        />
      )}

      <div className={isListCard ? 'space-y-2' : 'mt-4 space-y-3'}>
        {!isListCard && checkout.checkout_lifecycle_status === 'cancelled_by_customer' && (
          <p className="text-sm text-emerald-600">Your checkout flight has been cancelled.</p>
        )}
        {isLateCancelPending && !isListCard && (
          <p className="text-sm text-amber-600">
            Your cancellation request is waiting for admin review. A charge may apply.
          </p>
        )}
        {!isListCard && hasPendingReschedule && (
          pendingState?.admin_note === 'admin_proposed' ? (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50/90 p-4 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-800 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-amber-600">schedule_send</span>
                  Time Proposed by Operations
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-amber-200 text-amber-900 border border-amber-300">
                  Action Required
                </span>
              </div>
              <p className="text-sm text-amber-950 font-medium">
                The operations team proposed a new time for your checkout flight: <strong className="font-bold">{requestedRescheduleLabel}</strong>.
              </p>
              <button
                type="button"
                onClick={() => setProposalModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors shadow-sm"
              >
                Review proposed time
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Reschedule Under Review</p>
              <p className="text-sm text-amber-900/90 leading-relaxed">
                Your reschedule request is waiting for admin review. Your current checkout time remains active.
                {requestedRescheduleLabel ? (
                  <>
                    {' '}
                    <span className="font-semibold">Requested time: {requestedRescheduleLabel}.</span>
                  </>
                ) : null}
              </p>
            </div>
          )
        )}
        {!isListCard && !hasPendingReschedule && latestApproved && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">New Time Confirmed</p>
            <p className="text-sm text-emerald-800">Your checkout flight has been rescheduled to the approved time.</p>
          </div>
        )}
        {!isListCard && !hasPendingReschedule && latestRejected && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Reschedule Not Approved</p>
            <p className="text-sm text-amber-900/90 leading-relaxed">
              Your reschedule request was not approved. Your original checkout time remains active.
              {rejectedRescheduleLabel ? (
                <>
                  {' '}
                  <span className="font-semibold">Rejected request: {rejectedRescheduleLabel}.</span>
                </>
              ) : null}
              {' '}You can submit a different time if needed.
            </p>
          </div>
        )}
        {isListCard && !hasPendingReschedule && latestRejected && rejectedRescheduleLabel && (
          <p className="text-[11px] text-amber-700 leading-snug font-medium">
            Reschedule not approved · {rejectedRescheduleLabel}
          </p>
        )}
        {actionError && !lateCancelModalOpen && (
          <p className={`text-red-600 ${isListCard ? 'text-[11px] leading-snug' : 'text-sm'}`}>{actionError}</p>
        )}
        {!isListCard && !hasPendingReschedule && actionSuccess && <p className="text-sm text-emerald-600">{actionSuccess}</p>}
        {isListCard && hasPendingReschedule && (
          pendingState?.admin_note === 'admin_proposed' ? (
            <button
              type="button"
              onClick={() => setProposalModalOpen(true)}
              className="flex items-center justify-between gap-1.5 w-full rounded-xl bg-amber-50 hover:bg-amber-100/90 border border-amber-300 px-3 py-2 text-left transition-all shadow-sm group"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px] text-amber-600">schedule_send</span>
                  New Time Proposed
                </span>
                <span className="text-[11px] font-bold text-[#152d5a] truncate">
                  Review proposed time
                </span>
              </div>
              <span className="material-symbols-outlined text-base text-amber-700 group-hover:translate-x-0.5 transition-transform flex-shrink-0">
                arrow_forward
              </span>
            </button>
          ) : (
            <p className="text-[11px] text-amber-700 leading-snug font-medium">
              Reschedule pending review
              {requestedRescheduleLabel ? ` · ${requestedRescheduleLabel}` : ''}
            </p>
          )
        )}
        {isListCard && isLateCancelPending && (
          <p className="text-[11px] text-amber-700 leading-snug font-medium">Cancellation pending review</p>
        )}

        {showActionButtons && (
          <div className={isListCard ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-3'}>
            {!hasPendingReschedule && (
              <button
                type="button"
                onClick={openRescheduleFlow}
                disabled={isRescheduling || checkout.status === 'cancelled'}
                className={modifyButtonClass}
              >
                {isRescheduling ? 'Sending...' : 'Reschedule checkout'}
              </button>
            )}
            <button
              type="button"
              onClick={openCancelFlow}
              disabled={isCancelling || checkout.status === 'cancelled'}
              className={cancelButtonClass}
            >
              {isCancelling ? 'Cancelling...' : 'Cancel checkout'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
