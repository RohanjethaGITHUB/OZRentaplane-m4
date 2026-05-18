'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelCheckoutRequest, requestCheckoutReschedule } from '@/app/actions/checkout'
import { checkCustomerAvailability, getDayAvailability, type SafeConflict } from '@/app/actions/customer-availability'
import CalendarDateField from '@/components/CalendarDateField'
import ModalPortal from '@/components/ModalPortal'
import { sydneyInputToUTC } from '@/lib/utils/sydney-time'
import { getDayVfrWindow, isWithinDayVfrWindow } from '@/lib/utils/day-vfr'
import { isCheckoutSelfServiceAllowed } from '@/lib/checkout-policy'
import { ADMIN_CONTACT_PHONE_DISPLAY, ADMIN_CONTACT_PHONE_TEL } from '@/lib/contact'

type BookingLite = {
  id: string
  booking_type: string
  status: string
  scheduled_start: string
  checkout_lifecycle_status: string | null
}

type RescheduleRequestLite = {
  id: string
  status: string
  requested_scheduled_start: string | null
  requested_scheduled_end: string | null
}

type Props = {
  checkout: BookingLite
  aircraftId: string
  pendingRescheduleRequest: RescheduleRequestLite | null
  latestRescheduleRequest: RescheduleRequestLite | null
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
    if (selected) return selected.scrollIntoView({ block: 'nearest' })
    const defaultStart = listRef.current.querySelector('[data-default-start="true"]') as HTMLElement | null
    defaultStart?.scrollIntoView({ block: 'center' })
  }, [open])

  const selectedLabel = options.find(o => o.value === value)?.label ?? value

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/60 flex items-center justify-between transition-colors hover:border-white/25 text-white"
      >
        <span className={value === '' ? 'text-slate-500' : ''}>{value === '' ? 'Select departure time' : selectedLabel}</span>
        <span className={`material-symbols-outlined text-[18px] text-slate-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
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
          className={`relative h-10 rounded-lg overflow-hidden border ${dayVfrWindow ? 'bg-[#0a1628] border-white/15' : 'bg-green-500/15 border-green-500/10'} ${onTimeChange ? 'cursor-pointer' : ''}`}
        >
          {dayVfrWindow && (
            <>
              <div
                className="absolute top-0 bottom-0 bg-slate-800/60 flex items-center justify-center overflow-hidden"
                style={{ left: '0%', right: `${100 - (timeStrToMin(dayVfrWindow.start) / (24 * 60)) * 100}%` }}
              >
                <span className="text-[8px] text-slate-600 select-none leading-none">🌙</span>
              </div>
              <div
                className="absolute top-0 bottom-0 bg-green-500/15"
                style={{
                  left: `${(timeStrToMin(dayVfrWindow.start) / (24 * 60)) * 100}%`,
                  right: `${100 - (timeStrToMin(dayVfrWindow.end) / (24 * 60)) * 100}%`,
                }}
              />
              <div
                className="absolute top-0 bottom-0 bg-slate-800/60 flex items-center justify-center overflow-hidden"
                style={{ left: `${(timeStrToMin(dayVfrWindow.end) / (24 * 60)) * 100}%`, right: '0%' }}
              >
                <span className="text-[8px] text-slate-600 select-none leading-none">🌙</span>
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
            className="absolute text-[9px] font-medium text-slate-600 -translate-x-1/2 select-none leading-none uppercase"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {hourLabel(h)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-5 pt-1">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-600">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500/40 inline-block" />
          {dayVfrWindow ? `Day VFR (${dayVfrWindow.start}-${dayVfrWindow.end})` : 'Available'}
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
      checkCustomerAvailability(aircraftId, startUTC, endUTC)
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
      <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
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
                minDate={getSydneyToday()}
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
                onTimeChange={(next) => { setStartTime(next); setError(null) }}
                dayVfrWindow={dayVfrWindow}
              />
            </div>
          )}

          {nightVfrTimeError && <p className="text-sm text-amber-300">{nightVfrTimeError}</p>}
          {dayVfrWindow && (
            <p className="text-[11px] text-slate-400">Day VFR window: {dayVfrWindow.start} - {dayVfrWindow.end}</p>
          )}
          {avail.status === 'checking' && <p className="text-sm text-slate-400">Checking availability...</p>}
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
}: Props) {
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false)
  const [isCancelling, startCancelTransition] = useTransition()
  const [isRescheduling, startRescheduleTransition] = useTransition()
  const [pendingState, setPendingState] = useState<RescheduleRequestLite | null>(pendingRescheduleRequest)

  useEffect(() => {
    setPendingState(pendingRescheduleRequest)
  }, [pendingRescheduleRequest])

  const canModify = canModifyCheckoutUi(checkout)
  const selfServiceBlockedByCutoff =
    checkout.booking_type === 'checkout' &&
    ['checkout_requested', 'checkout_confirmed'].includes(checkout.status) &&
    !isCheckoutSelfServiceAllowed(checkout.scheduled_start, new Date())
  const hasPendingReschedule = pendingState?.status === 'pending'

  const requestedRescheduleLabel = useMemo(() => {
    if (!pendingState?.requested_scheduled_start) return null
    return new Date(pendingState.requested_scheduled_start).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }, [pendingState])

  const latestApproved = latestRescheduleRequest?.status === 'approved'
  const latestRejected = latestRescheduleRequest?.status === 'rejected'

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

  if (!canModify && !selfServiceBlockedByCutoff && checkout.checkout_lifecycle_status !== 'cancelled_by_customer') return null

  return (
    <>
      {cancelModalOpen && canModify && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#13243a] border border-[#4c6b8f] rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-lg font-semibold text-white">Cancel checkout flight?</h3>
            </div>
            <div className="px-5 py-5">
              <p className="text-sm text-slate-300 leading-relaxed">
                You can cancel your checkout flight if it is more than 12 hours away. This will release your current checkout slot.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-white/[0.06] flex justify-end gap-3">
              <button onClick={() => setCancelModalOpen(false)} className="px-4 py-2 text-sm text-slate-300 border border-white/15 rounded-lg">
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

      {selfServiceBlockedByCutoff && (cancelModalOpen || rescheduleModalOpen) && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-[#13243a] border border-[#4c6b8f] rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06]">
                <h3 className="text-lg font-semibold text-white">Manual approval required</h3>
              </div>
              <div className="px-5 py-5 space-y-3">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Your checkout flight is less than 12 hours away.
                </p>
                <p className="text-sm text-slate-300 leading-relaxed">
                  To cancel or reschedule at this stage, please call OZ Rent A Plane so the team can review and approve the change manually.
                </p>
                <p className="text-sm text-white">
                  Call:{' '}
                  <a href={`tel:${ADMIN_CONTACT_PHONE_TEL}`} className="text-blue-300 hover:text-blue-200 underline underline-offset-2">
                    {ADMIN_CONTACT_PHONE_DISPLAY}
                  </a>
                </p>
              </div>
              <div className="px-5 py-4 border-t border-white/[0.06] flex justify-end">
                <button
                  onClick={() => { setCancelModalOpen(false); setRescheduleModalOpen(false) }}
                  className="px-4 py-2 text-sm text-slate-300 border border-white/15 rounded-lg"
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

      <div className="mt-4 space-y-3">
        {checkout.checkout_lifecycle_status === 'cancelled_by_customer' && (
          <p className="text-sm text-emerald-300">Your checkout flight has been cancelled.</p>
        )}
        {hasPendingReschedule && (
          <p className="text-sm text-amber-300">
            Your reschedule request is waiting for admin review. Your current checkout time remains active.
            {requestedRescheduleLabel ? ` Requested time: ${requestedRescheduleLabel}.` : ''}
          </p>
        )}
        {!hasPendingReschedule && latestApproved && (
          <p className="text-sm text-emerald-300">Your checkout flight has been rescheduled.</p>
        )}
        {!hasPendingReschedule && latestRejected && (
          <p className="text-sm text-amber-300">Your reschedule request was not approved. Your original checkout time remains active.</p>
        )}
        {actionError && <p className="text-sm text-red-300">{actionError}</p>}
        {!hasPendingReschedule && actionSuccess && <p className="text-sm text-emerald-300">{actionSuccess}</p>}

        {checkout.checkout_lifecycle_status !== 'cancelled_by_customer' && checkout.checkout_lifecycle_status !== 'cancelled_by_admin' && checkout.checkout_lifecycle_status !== 'completed' && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setRescheduleModalOpen(true)}
              disabled={hasPendingReschedule || isRescheduling || checkout.status === 'cancelled'}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700/40 disabled:text-slate-400 text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
            >
              {isRescheduling ? 'Sending...' : 'Reschedule checkout'}
            </button>
            <button
              onClick={() => setCancelModalOpen(true)}
              disabled={isCancelling || checkout.status === 'cancelled'}
              className="inline-flex items-center gap-2 px-6 py-3 border border-rose-300/25 hover:border-rose-300/40 text-rose-200 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel checkout'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
