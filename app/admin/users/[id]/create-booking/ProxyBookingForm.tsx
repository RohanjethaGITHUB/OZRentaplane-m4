'use client'

import type { FormEvent } from 'react'
import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { createProxyBooking } from '@/app/actions/admin-proxy-booking'
import {
  checkCustomerAvailability,
  type AvailabilityCheckResult,
} from '@/app/actions/customer-availability'
import CalendarDateField from '@/components/CalendarDateField'
import { formatDate } from '@/lib/formatDateTime'
import { sydneyInputToUTC, todaySydneyDateKey } from '@/lib/utils/sydney-time'

type CustomerRow = {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  pilot_clearance_status: string | null
}

type AircraftRow = {
  id: string
  registration: string
  display_name: string
  aircraft_type: string
}

type Props = {
  customer: CustomerRow
  aircraft: AircraftRow[]
  documents: Array<{ id: string }>
  termsAcceptedAt: string | null
}

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; message: string }
  | { status: 'unavailable'; message: string }

const ALL_TIME_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = []
  for (let h = 0; h < 24; h += 1) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const period = h < 12 ? 'AM' : 'PM'
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      opts.push({ value, label: `${h12}:${String(m).padStart(2, '0')} ${period}` })
    }
  }
  return opts
})()

const CHECKOUT_WINDOW_STARTS = (() => {
  const slots: string[] = []
  for (let minutes = 8 * 60; minutes <= 18 * 60; minutes += 15) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    slots.push(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`)
  }
  return slots
})()

const DATE_OPTIONS_MIN_YEAR = new Date().getFullYear() - 20
const DATE_OPTIONS_MAX_YEAR = new Date().getFullYear() + 5

function formatCustomerName(customer: CustomerRow): string {
  if (customer.full_name?.trim()) return customer.full_name.trim()
  const parts = [customer.first_name?.trim(), customer.last_name?.trim()].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : 'Unknown Customer'
}

function formatDisplayTime(time: string): string {
  const [hourPart, minutePart] = time.split(':')
  const hour = Number(hourPart)
  const minute = Number(minutePart)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`
}

function addMinutesToTime(time: string, minutesToAdd: number): string {
  const [hourPart, minutePart] = time.split(':')
  const hour = Number(hourPart)
  const minute = Number(minutePart)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time
  const totalMinutes = hour * 60 + minute + minutesToAdd
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const nextHour = Math.floor(normalized / 60)
  const nextMinute = normalized % 60
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`
}

function buildCheckoutWindowOptions(minTimeToday: string, includeMinFilter: boolean) {
  return CHECKOUT_WINDOW_STARTS
    .filter((slot) => !includeMinFilter || slot >= minTimeToday)
    .map((slot) => ({
      value: slot,
      label: `${formatDisplayTime(slot)} – ${formatDisplayTime(addMinutesToTime(slot, 120))}`,
    }))
}

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
  const minYear = min ? Number(min.slice(0, 4)) || DATE_OPTIONS_MIN_YEAR : DATE_OPTIONS_MIN_YEAR
  const maxYear = max ? Number(max.slice(0, 4)) || DATE_OPTIONS_MAX_YEAR : DATE_OPTIONS_MAX_YEAR

  return (
    <div className="proxy-calendar-override">
      <CalendarDateField
        value={value}
        minDate={min}
        maxDate={max}
        minYear={minYear}
        maxYear={maxYear}
        disabled={disabled}
        onChange={onChange}
        className={`
          w-full px-4 py-3.5 bg-white border border-slate-200
          focus:border-[#152d5a]/40 focus:outline-none rounded-xl
          text-sm text-slate-700 transition-colors
          ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-slate-300'}
        `}
      />
    </div>
  )
}

function TimeSelect({
  value,
  options,
  disabled,
  placeholder,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  disabled?: boolean
  placeholder: string
  onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`
          w-full pl-4 pr-9 py-3.5 bg-white border border-slate-200
          focus:border-[#152d5a]/40 focus:outline-none rounded-xl
          text-sm appearance-none transition-colors
          ${disabled ? 'opacity-40 cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-700 hover:border-slate-300'}
          ${!value ? 'text-slate-400' : ''}
        `}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span
        className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none"
        style={{ fontVariationSettings: "'wght' 300" }}
      >
        expand_more
      </span>
    </div>
  )
}

function validateForm(values: {
  aircraftId: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
}): string | null {
  if (!values.aircraftId) return 'Please select an aircraft.'
  if (!values.startDate) return 'Please choose a booking date.'
  if (!values.endDate) return 'Please choose a booking date.'
  if (!values.startTime) return 'Please choose a start time.'
  if (!values.endTime) return 'Please choose an end time.'

  const startUtc = sydneyInputToUTC(`${values.startDate}T${values.startTime}`)
  const endUtc = sydneyInputToUTC(`${values.endDate}T${values.endTime}`)
  if (!startUtc || !endUtc) return 'Please enter a valid date and time.'
  if (new Date(endUtc).getTime() <= new Date(startUtc).getTime()) {
    return 'The end time must be after the start time.'
  }

  return null
}

export default function ProxyBookingForm({
  customer,
  aircraft,
  documents,
  termsAcceptedAt,
}: Props) {
  const [isSubmitting, startSubmit] = useTransition()
  const [bookingType, setBookingType] = useState<'standard' | 'checkout' | null>(
    customer.pilot_clearance_status === 'cleared_to_fly' ? 'standard' : 'checkout',
  )
  const [selectedAircraftId, setSelectedAircraftId] = useState(aircraft[0]?.id ?? '')
  const [startDate, setStartDate] = useState(todaySydneyDateKey())
  const [endDate, setEndDate] = useState(todaySydneyDateKey())
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
  const [checkoutWindowStart, setCheckoutWindowStart] = useState('')
  const [availability, setAvailability] = useState<AvailabilityState>({ status: 'idle' })
  const [standardAttempted, setStandardAttempted] = useState(false)

  const minDate = useMemo(() => {
    const now = new Date(Date.now() + 60 * 60 * 1000)
    return now.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  }, [])
  const minTimeToday = useMemo(() => {
    const now = new Date(Date.now() + 60 * 60 * 1000)
    return now.toLocaleTimeString('sv-SE', { timeZone: 'Australia/Sydney' }).slice(0, 5)
  }, [])

  useEffect(() => {
    console.log('[ProxyBookingForm] documents/termsAcceptedAt', {
      documents,
      termsAcceptedAt,
    })
  }, [documents, termsAcceptedAt])

  useEffect(() => {
    if (!startTime) {
      setStartTime(startDate === minDate && minTimeToday > '09:00' ? minTimeToday : '09:00')
      return
    }
    if (startDate === minDate && startTime < minTimeToday) {
      setStartTime(minTimeToday)
    }
  }, [minDate, minTimeToday, startDate, startTime])

  const checkoutWindowOptions = useMemo(
    () => buildCheckoutWindowOptions(minTimeToday, startDate === minDate),
    [minDate, minTimeToday, startDate],
  )

  useEffect(() => {
    if (bookingType !== 'checkout' || !checkoutWindowStart) return
    if (!checkoutWindowOptions.some((option) => option.value === checkoutWindowStart)) {
      setCheckoutWindowStart('')
    }
  }, [bookingType, checkoutWindowOptions, checkoutWindowStart])

  useEffect(() => {
    const tagPortal = () => {
      document.querySelectorAll('div[style*="z-index: 1300"]').forEach((node) => {
        node.classList.add('proxy-calendar-portal')
      })
    }

    tagPortal()
    const observer = new MutationObserver(tagPortal)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const startTimeOptions = useMemo(() => {
    if (startDate === minDate) return ALL_TIME_OPTIONS.filter((o) => o.value >= minTimeToday)
    return ALL_TIME_OPTIONS
  }, [startDate, minDate, minTimeToday])

  const endTimeOptions = useMemo(() => {
    if (startTime) return ALL_TIME_OPTIONS.filter((o) => o.value > startTime)
    return ALL_TIME_OPTIONS
  }, [startTime])

  const activeStartTime = bookingType === 'checkout' ? checkoutWindowStart : startTime
  const activeEndTime = bookingType === 'checkout'
    ? checkoutWindowStart
      ? addMinutesToTime(checkoutWindowStart, 120)
      : ''
    : endTime

  const activeStartDate = startDate
  const activeEndDate = bookingType === 'checkout' ? startDate : endDate

  const startDT = activeStartDate && activeStartTime ? `${activeStartDate}T${activeStartTime}` : ''
  const endDT = activeEndDate && activeEndTime ? `${activeEndDate}T${activeEndTime}` : ''
  const startUTC = startDT ? sydneyInputToUTC(startDT) : null
  const endUTC = endDT ? sydneyInputToUTC(endDT) : null
  const endIsBeforeStart = !!(startUTC && endUTC && new Date(endUTC).getTime() <= new Date(startUTC).getTime())

  const estimatedHours = useMemo(() => {
    if (!startUTC || !endUTC) return null
    const diffHours = (new Date(endUTC).getTime() - new Date(startUTC).getTime()) / (1000 * 60 * 60)
    if (!(diffHours > 0)) return null
    return Number(diffHours.toFixed(2))
  }, [startUTC, endUTC])

  const checkoutWarnings = useMemo(() => {
    if (bookingType !== 'checkout') return []
    const warnings: string[] = []
    if (documents.length === 0) warnings.push('No documents are on file for this customer.')
    if (!termsAcceptedAt) warnings.push('Booking terms have not been accepted.')
    return warnings
  }, [bookingType, documents, termsAcceptedAt])

  const pilotClearanceStatus = customer.pilot_clearance_status
  const standardFlightDisabled = pilotClearanceStatus !== 'cleared_to_fly'
  const checkoutFlightDisabled = pilotClearanceStatus === 'cleared_to_fly'
  const showStandardFlightReadiness = bookingType === null || standardAttempted

  const timeSelectionComplete = bookingType === 'checkout' ? Boolean(checkoutWindowStart) : Boolean(startTime) && Boolean(endTime)

  const canSubmit =
    !isSubmitting &&
    bookingType !== null &&
    Boolean(selectedAircraftId) &&
    Boolean(startDate) &&
    Boolean(endDate) &&
    timeSelectionComplete &&
    !endIsBeforeStart &&
    estimatedHours !== null &&
    availability.status === 'available' &&
    checkoutWarnings.length === 0

  useEffect(() => {
    if (!startUTC || !endUTC || new Date(endUTC).getTime() <= new Date(startUTC).getTime()) {
      setAvailability({ status: 'idle' })
      return
    }

    if (new Date(startUTC).getTime() <= Date.now()) {
      setAvailability({ status: 'unavailable', message: 'Please select a future checkout time.' })
      return
    }

    setAvailability({ status: 'checking' })
    const timer = setTimeout(() => {
      checkCustomerAvailability(selectedAircraftId, startUTC, endUTC)
        .then((result: AvailabilityCheckResult) => {
          if (result.available) {
            setAvailability({ status: 'available', message: result.message })
          } else {
            setAvailability({ status: 'unavailable', message: result.message })
          }
        })
        .catch(() => {
          setAvailability({ status: 'unavailable', message: 'Unable to check availability. Please try again.' })
        })
    }, 600)

    return () => clearTimeout(timer)
  }, [selectedAircraftId, startUTC, endUTC])

  function getDisabledReason(): string | null {
    if (bookingType === null) return 'Select a booking type to continue.'
    if (!selectedAircraftId) return 'Please select an aircraft.'
    if (!startDate) return 'Please choose a booking date.'
    if (bookingType === 'checkout' && !checkoutWindowStart) return 'Select a flight window to continue.'
    if (bookingType === 'standard' && !startTime) return 'Choose a departure date and time to continue.'
    if (bookingType === 'standard' && !endDate) return 'Please choose an end date.'
    if (bookingType === 'standard' && !endTime) return 'Select an estimated return time.'
    if (endIsBeforeStart) return 'The estimated return must be after departure.'
    if (availability.status === 'checking') return 'Checking availability...'
    if (availability.status === 'unavailable') return availability.message
    if (estimatedHours === null) return 'Select a valid departure and return time.'
    if (bookingType === 'checkout' && documents.length === 0) return 'This customer has no documents on file.'
    if (bookingType === 'checkout' && !termsAcceptedAt) return 'This customer has not accepted the booking terms.'
    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (bookingType === null) return

    const validationError = validateForm({
      aircraftId: selectedAircraftId,
      startDate: activeStartDate,
      startTime: activeStartTime,
      endDate: activeEndDate,
      endTime: activeEndTime,
    })

    if (validationError) return

    if (estimatedHours === null) return

    if (availability.status !== 'available') return

    if (checkoutWarnings.length > 0) return

    const formData = new FormData()
    formData.set('customerId', customer.id)
    formData.set('bookingType', bookingType)
    formData.set('aircraftId', selectedAircraftId)
    formData.set('scheduledStart', `${startDate}T${activeStartTime}`)
    formData.set('scheduledEnd', `${endDate}T${activeEndTime}`)
    formData.set('estimatedHours', estimatedHours.toFixed(2))
    formData.set('adminNotes', adminNotes)
    formData.set('customerNotes', customerNotes)

    startSubmit(async () => {
      try {
        const result = await createProxyBooking(formData)
        if (result && 'error' in result) {
          console.error(result.error)
        }
      } catch {
        console.error('Failed to create booking. Please try again.')
      }
    })
  }

  const disabledReason = getDisabledReason()

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-5 border-b border-slate-200 pb-5">
          <div>
            <span className="mb-3 block text-sm font-semibold uppercase tracking-wide text-slate-800">
              Booking Type
            </span>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="group relative">
                <button
                type="button"
                onClick={() => {
                  if (standardFlightDisabled) {
                    setStandardAttempted(true)
                    return
                  }
                  setBookingType('standard')
                  setStandardAttempted(false)
                }}
                className={`rounded-2xl p-4 text-left transition-all ${
                  standardFlightDisabled
                    ? 'border border-slate-200 bg-slate-50 text-slate-500 opacity-40 cursor-not-allowed'
                    : bookingType === 'standard'
                    ? 'border-2 border-[#152d5a] bg-[#eef3fa] shadow-sm'
                      : 'border border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`material-symbols-outlined text-[18px] mt-0.5 ${
                      bookingType === 'standard' ? 'text-[#152d5a]' : 'text-slate-400'
                    }`}
                    style={{ fontVariationSettings: "'wght' 300" }}
                  >
                    flight_takeoff
                  </span>
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-semibold ${
                        bookingType === 'standard' ? 'text-[#152d5a]' : 'text-slate-500'
                      }`}
                    >
                      Standard Flight
                    </div>
                    <div className="mt-1 text-sm text-slate-600">Regular flight booking, confirmed immediately</div>
                    {standardFlightDisabled ? (
                      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                        <span
                          className="material-symbols-outlined text-sm"
                          style={{ fontVariationSettings: "'wght' 300" }}
                        >
                          lock
                        </span>
                        Requires clearance
                      </div>
                    ) : null}
                    {standardFlightDisabled ? (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 md:hidden">
                        <span className="material-symbols-outlined text-sm leading-none" style={{ fontVariationSettings: "'wght' 300" }}>
                          warning
                        </span>
                        <span>Not available - customer not cleared to fly (status: {pilotClearanceStatus})</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                </button>
                {standardFlightDisabled ? (
                  <div className="pointer-events-none absolute bottom-full left-0 mb-2 hidden w-64 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white shadow-lg z-10 group-hover:block">
                    Standard bookings require cleared to fly status. This customer is currently {pilotClearanceStatus}.
                    <div className="absolute -bottom-1 left-4 h-2 w-2 rotate-45 bg-slate-800" />
                  </div>
                ) : null}
              </div>

              <div className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    if (checkoutFlightDisabled) return
                    setBookingType('checkout')
                    setStandardAttempted(false)
                  }}
                  className={`rounded-2xl p-4 text-left transition-all ${
                    checkoutFlightDisabled
                      ? 'border border-slate-200 bg-slate-50 text-slate-500 opacity-40 cursor-not-allowed'
                      : bookingType === 'checkout'
                        ? 'border-2 border-amber-500 bg-amber-50 shadow-sm'
                        : 'border border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'
                  }`}
                  disabled={checkoutFlightDisabled}
                >
                <div className="flex items-start gap-3">
                  <span
                    className={`material-symbols-outlined text-[18px] mt-0.5 ${
                      bookingType === 'checkout' ? 'text-amber-600' : 'text-slate-400'
                    }`}
                    style={{ fontVariationSettings: "'wght' 300" }}
                  >
                    school
                  </span>
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-semibold ${
                      bookingType === 'checkout' ? 'text-amber-700' : 'text-slate-500'
                    }`}
                    >
                      Checkout Flight
                    </div>
                    <div className="mt-1 text-sm text-slate-600">Supervised assessment flight</div>
                    {checkoutFlightDisabled ? (
                      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                        <span
                          className="material-symbols-outlined text-sm"
                          style={{ fontVariationSettings: "'wght' 300" }}
                        >
                          lock
                        </span>
                        ALREADY CLEARED
                      </div>
                    ) : null}
                    {checkoutFlightDisabled ? (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 md:hidden">
                        <span className="material-symbols-outlined text-sm leading-none" style={{ fontVariationSettings: "'wght' 300" }}>
                          warning
                        </span>
                        <span>Not needed - customer is already cleared to fly</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                </button>
                {checkoutFlightDisabled ? (
                  <div className="pointer-events-none absolute bottom-full left-0 mb-2 hidden w-64 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white shadow-lg z-10 group-hover:block">
                    Checkout flights are only needed before a customer is cleared to fly. This customer is already cleared.
                    <div className="absolute -bottom-1 left-4 h-2 w-2 rotate-45 bg-slate-700" />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {bookingType === 'checkout' ? (
          checkoutWarnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined mt-0.5 text-amber-600 text-base">warning</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-800">Checkout readiness</p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-900/80">
                    {checkoutWarnings.map((warning) => (
                      <li key={warning} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-amber-500" />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4">
                    <Link
                      href={`/admin/messages?userId=${customer.id}`}
                      className="inline-flex items-center justify-center rounded-lg border border-[#152d5a] bg-transparent px-4 py-2 text-sm font-medium text-[#152d5a] transition-colors hover:bg-[#152d5a] hover:text-white"
                    >
                      Send message to customer
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined mt-0.5 text-slate-500 text-base">info</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Checkout flight selected</p>
                  <p className="mt-1 text-sm text-slate-600">
                    This customer is ready for checkout booking.
                  </p>
                </div>
              </div>
            </div>
          )
        ) : showStandardFlightReadiness ? (
          pilotClearanceStatus !== 'cleared_to_fly' ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined mt-0.5 text-amber-600 text-base">warning</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-800">Standard flight readiness</p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-900/80">
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-amber-500" />
                      <span>
                        This customer is not cleared to fly (status: {pilotClearanceStatus}). Verify
                        eligibility before the scheduled date.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined mt-0.5 text-green-600 text-base">check_circle</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-green-800">Standard flight readiness</p>
                  <p className="mt-2 text-sm text-green-900/80">Customer is cleared to fly.</p>
                </div>
              </div>
            </div>
          )
        ) : null}

        <div className={`space-y-6 ${bookingType === null ? 'pointer-events-none opacity-50' : ''}`}>
          <div>
            <span className="mb-3 block text-sm font-semibold uppercase tracking-wide text-slate-800">
              Aircraft
            </span>
            <select
              value={selectedAircraftId}
              onChange={(event) => setSelectedAircraftId(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 focus:outline-none focus:border-[#152d5a]/40 focus:ring-2 focus:ring-[#152d5a]/8"
              required
            >
              <option value="" disabled>
                Select an aircraft
              </option>
              {aircraft.map((plane) => (
                <option key={plane.id} value={plane.id}>
                  {plane.registration} - {plane.display_name || plane.aircraft_type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="mb-3 block text-sm font-semibold uppercase tracking-wide text-slate-800">
              Date & Time
            </span>
            <div className="space-y-4">
              {bookingType === 'checkout' ? (
                <div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
                        Date
                      </label>
                      <DateInput
                        value={startDate}
                        min={minDate}
                        onChange={(next) => {
                          setStartDate(next)
                          setAvailability({ status: 'idle' })
                        }}
                      />
                      {startDate && <p className="mt-1.5 text-[11px] text-[#152d5a]/60">{formatDate(startDate)}</p>}
                    </div>

                    <div>
                      <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
                        FLIGHT WINDOW
                      </label>
                      <TimeSelect
                        value={checkoutWindowStart}
                        options={checkoutWindowOptions}
                        placeholder="Select a 2-hour window"
                        disabled={!startDate || !selectedAircraftId}
                        onChange={(value) => {
                          setCheckoutWindowStart(value)
                          setAvailability({ status: 'idle' })
                        }}
                      />
                      {!checkoutWindowStart ? (
                        <p className="mt-1.5 text-[11px] text-slate-500">Select a flight window to continue.</p>
                      ) : null}
                      {checkoutWindowStart && (
                        <p className="mt-1.5 text-[11px] text-[#152d5a]/60">
                          {formatDisplayTime(checkoutWindowStart)} – {formatDisplayTime(addMinutesToTime(checkoutWindowStart, 120))}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
                        Start date
                      </label>
                      <DateInput
                        value={startDate}
                        min={minDate}
                        onChange={(next) => {
                          setStartDate(next)
                          if (endDate < next) setEndDate(next)
                          setAvailability({ status: 'idle' })
                        }}
                      />
                      {startDate && <p className="mt-1.5 text-[11px] text-[#152d5a]/60">{formatDate(startDate)}</p>}
                    </div>

                    <div>
                      <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
                        Start time
                      </label>
                      <TimeSelect
                        value={startTime}
                        options={startTimeOptions}
                        placeholder="Select time"
                        disabled={!startDate || !selectedAircraftId}
                        onChange={(value) => {
                          setStartTime(value)
                          if (endDate === startDate && endTime && endTime <= value) setEndTime('')
                          setAvailability({ status: 'idle' })
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
                        End date
                      </label>
                      <DateInput
                        value={endDate}
                        min={startDate}
                        onChange={(next) => {
                          setEndDate(next)
                          setAvailability({ status: 'idle' })
                        }}
                      />
                      {endDate && <p className="mt-1.5 text-[11px] text-[#152d5a]/60">{formatDate(endDate)}</p>}
                    </div>

                    <div>
                      <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
                        End time
                      </label>
                      <TimeSelect
                        value={endTime}
                        options={endTimeOptions}
                        placeholder="Select time"
                        disabled={!endDate || !startTime}
                        onChange={(value) => {
                          setEndTime(value)
                          setAvailability({ status: 'idle' })
                        }}
                      />
                      {endIsBeforeStart && <p className="mt-1.5 text-[11px] text-red-600">Must be after departure</p>}
                    </div>
                  </div>
                </div>
              )}

              {estimatedHours != null && (
                <p className="text-sm text-slate-600">
                  Estimated duration: <span className="font-semibold text-[#152d5a]">{estimatedHours.toFixed(2)} hours</span>
                </p>
              )}
            </div>
          </div>

          <div>
            <span className="mb-3 block text-sm font-semibold uppercase tracking-wide text-slate-800">
              Notes
            </span>
            <div className="grid grid-cols-1 gap-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--admin-text)]">Admin notes</span>
                <textarea
                  value={adminNotes}
                  onChange={(event) => setAdminNotes(event.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#152d5a]/40 focus:ring-2 focus:ring-[#152d5a]/8"
                  placeholder="Optional internal note"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--admin-text)]">Customer notes</span>
                <textarea
                  value={customerNotes}
                  onChange={(event) => setCustomerNotes(event.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#152d5a]/40 focus:ring-2 focus:ring-[#152d5a]/8"
                  placeholder="Optional note that will be stored on the booking"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex w-full items-center justify-center rounded-xl bg-[#152d5a] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1d3d79] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? 'Creating booking...'
              : bookingType === 'checkout'
                ? 'Confirm Checkout Flight'
                : 'Confirm Standard Flight'}
          </button>
        </div>

      </form>

      <style jsx global>{`
        .proxy-calendar-portal {
          background: #ffffff !important;
          border-color: rgb(226 232 240) !important;
        }

        .proxy-calendar-portal select {
          background: #ffffff !important;
          border-color: rgb(226 232 240) !important;
          color: rgb(15 23 42) !important;
        }

        .proxy-calendar-portal option {
          background: #ffffff !important;
          color: rgb(15 23 42) !important;
        }

        .proxy-calendar-portal div[class*="text-white/35"] {
          color: rgb(100 116 139) !important;
        }

        .proxy-calendar-portal button[class*="bg-white/[0.02]"] {
          background: #ffffff !important;
          border-color: rgb(226 232 240) !important;
          color: rgb(30 41 59) !important;
        }

        .proxy-calendar-portal button[class*="bg-white/[0.08]"] {
          background: rgb(241 245 249) !important;
          border-color: rgb(203 213 225) !important;
          color: rgb(15 23 42) !important;
        }

        .proxy-calendar-portal button[class*="bg-oz-blue/25"] {
          background: #152d5a !important;
          border-color: #152d5a !important;
          color: #ffffff !important;
        }

        .proxy-calendar-override button {
          background: #ffffff !important;
          color: rgb(15 23 42) !important;
        }
      `}</style>
    </>
  )
}
