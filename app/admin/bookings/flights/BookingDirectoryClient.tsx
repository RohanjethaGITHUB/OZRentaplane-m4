'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type BookingDirectoryRow = {
  id: string
  bookingId: string
  bookingReference: string
  bookingOwnerUserId: string
  customerName: string
  customerEmail: string
  aircraftRegistration: string
  aircraftType: string | null
  createdAt: string
  scheduledStart: string
  scheduledEnd: string
  scheduledLabel: string
  rawStatus: string
  displayStatus: string
  statusLabel: string
  bookingType: string
  billingMode: 'pay_as_you_fly' | 'block_time' | 'checkout' | null
  billingRateCentsPerHour: number | null
  blockTimePackageName: string | null
  billingBasisIsProvisional: boolean
  bookingTypePrimaryLabel: string
  bookingTypeSecondaryLabel: string
  paymentProofPendingReview?: boolean
  isLandingFeePending?: boolean
}

type SortKey = 'created' | 'customer' | 'email' | 'aircraft' | 'scheduled' | 'status' | 'ref'
type SortDir = 'asc' | 'desc'

type SummaryTone = 'info' | 'warning' | 'accent' | 'orange' | 'success'
type SummaryFilterKey = 'confirmed' | 'awaiting_flight_record' | 'pending_post_flight_review' | 'payment_pending' | 'completed'
type BookingFilterKey = 'all' | SummaryFilterKey

type SummaryConfig = {
  key: SummaryFilterKey
  label: string
  helper: string
  icon: string
  tone: SummaryTone
}

type BookingStatusPresentation = {
  label: string
  badgeClassName: string
  icon: string
  iconWrapClass: string
  iconClass: string
}

type SchedulePresentation = {
  dateRangeLabel: string
  timeRangeLabel: string
  durationLabel: string | null
  timezoneLabel: string | null
  isMultiDay: boolean
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DESKTOP_ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)_minmax(0,0.95fr)_minmax(0,1.35fr)] items-center gap-x-4'
const DESKTOP_ROW_PADDING = 'pl-6 pr-5'

const SUMMARY_CARDS: SummaryConfig[] = [
  {
    key: 'confirmed',
    label: 'Upcoming',
    helper: 'Scheduled flights',
    icon: 'calendar_month',
    tone: 'info',
  },
  {
    key: 'awaiting_flight_record',
    label: 'Awaiting Flight Record',
    helper: 'Flights waiting on a record',
    icon: 'assignment_late',
    tone: 'warning',
  },
  {
    key: 'pending_post_flight_review',
    label: 'Post-flight Review',
    helper: 'Records awaiting review',
    icon: 'rate_review',
    tone: 'accent',
  },
  {
    key: 'payment_pending',
    label: 'Payment Pending',
    helper: 'Bookings awaiting payment',
    icon: 'payments',
    tone: 'orange',
  },
  {
    key: 'completed',
    label: 'Completed',
    helper: 'Closed flight bookings',
    icon: 'check_circle',
    tone: 'success',
  },
]

const FILTER_TABS: Array<{ key: BookingFilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'confirmed', label: 'Upcoming' },
  { key: 'awaiting_flight_record', label: 'Awaiting Flight Record' },
  { key: 'pending_post_flight_review', label: 'Post-flight Review' },
  { key: 'payment_pending', label: 'Payment Pending' },
  { key: 'completed', label: 'Completed' },
]

const PAGE_SIZE = 10

function isBookingFilterKey(filter: string): filter is BookingFilterKey {
  return FILTER_TABS.some((tab) => tab.key === filter)
}

function isCheckoutBooking(row: BookingDirectoryRow) {
  return row.bookingType === 'checkout' || row.billingMode === 'checkout'
}

function matchesBookingFilter(row: BookingDirectoryRow, filter: string) {
  if (filter === 'all') return true
  if (filter === 'confirmed') {
    // Upcoming = confirmed/scheduled flights that are not yet past end / awaiting a record.
    // Include checkout_confirmed so confirmed checkouts appear alongside standard upcoming flights.
    const isUpcomingStatus =
      row.rawStatus === 'confirmed' ||
      row.rawStatus === 'checkout_confirmed' ||
      row.rawStatus === 'ready_for_dispatch'
    return isUpcomingStatus && row.displayStatus !== 'awaiting_flight_record'
  }
  if (filter === 'awaiting_flight_record') return row.displayStatus === 'awaiting_flight_record'
  if (filter === 'pending_post_flight_review') {
    return (
      row.rawStatus === 'pending_post_flight_review' ||
      row.rawStatus === 'checkout_completed_under_review'
    )
  }
  if (filter === 'payment_pending') {
    // Standard invoices use payment_pending; checkout invoices use checkout_payment_required.
    return row.rawStatus === 'payment_pending' || row.rawStatus === 'checkout_payment_required'
  }
  if (filter === 'completed') return row.rawStatus === 'completed'
  return row.displayStatus === filter || row.rawStatus === filter
}

function getBookingFilterCount(rows: BookingDirectoryRow[], filter: string) {
  return rows.filter((row) => matchesBookingFilter(row, filter)).length
}

function getSortHref(basePath: string, filter: string, currentSort: SortKey, currentDir: SortDir, nextKey: SortKey) {
  const params = new URLSearchParams()
  if (filter !== 'all') params.set('status', filter)
  params.set('sort', nextKey)
  params.set('dir', currentSort === nextKey && currentDir === 'asc' ? 'desc' : 'asc')
  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

function getSortIcon(currentSort: SortKey, currentDir: SortDir, key: SortKey) {
  if (currentSort !== key) return 'unfold_more'
  return currentDir === 'asc' ? 'arrow_upward' : 'arrow_downward'
}

function prettifyFilterLabel(filter: string) {
  if (filter === 'all') return 'All'
  if (filter === 'confirmed') return 'Upcoming'
  if (filter === 'awaiting_flight_record') return 'Awaiting Flight Record'
  if (filter === 'pending_post_flight_review') return 'Post-flight Review'
  if (filter === 'payment_pending') return 'Payment Pending'
  if (filter === 'completed') return 'Completed'
  if (filter === 'ready_for_dispatch') return 'Upcoming'
  if (filter === 'dispatched') return 'In Progress'
  if (filter === 'cancelled') return 'Cancelled'
  if (filter === 'no_show') return 'No Show'
  if (filter === 'cancellation_requested') return 'Cancellation Requested'
  if (filter === 'on_hold_pending_documents') return 'On Hold'
  if (filter === 'pending_confirmation') return 'Requested'
  return filter.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function toneCardClass(tone: SummaryTone, active: boolean) {
  if (tone === 'success') {
    return active
      ? 'border-emerald-300/90 bg-emerald-50/95 text-emerald-950 shadow-[0_10px_20px_rgba(22,101,52,0.10)]'
      : 'border-emerald-200/80 bg-white text-emerald-950 hover:border-emerald-300 hover:bg-emerald-50/55'
  }
  if (tone === 'warning') {
    return active
      ? 'border-amber-300/90 bg-amber-50/95 text-amber-950 shadow-[0_10px_20px_rgba(180,83,9,0.10)]'
      : 'border-amber-200/80 bg-white text-amber-950 hover:border-amber-300 hover:bg-amber-50/55'
  }
  if (tone === 'accent') {
    return active
      ? 'border-violet-300/90 bg-violet-50/95 text-violet-950 shadow-[0_10px_20px_rgba(109,40,217,0.10)]'
      : 'border-violet-200/80 bg-white text-violet-950 hover:border-violet-300 hover:bg-violet-50/55'
  }
  if (tone === 'orange') {
    return active
      ? 'border-orange-300/90 bg-orange-50/95 text-orange-950 shadow-[0_10px_20px_rgba(194,65,12,0.10)]'
      : 'border-orange-200/80 bg-white text-orange-950 hover:border-orange-300 hover:bg-orange-50/55'
  }
  return active
    ? 'border-blue-300/90 bg-blue-50/95 text-blue-950 shadow-[0_10px_20px_rgba(26,79,214,0.10)]'
    : 'border-blue-200/80 bg-white text-blue-950 hover:border-blue-300 hover:bg-blue-50/55'
}

function toneIconWrapClass(tone: SummaryTone, active: boolean) {
  if (tone === 'success') return active ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-50 text-emerald-600'
  if (tone === 'warning') return active ? 'bg-amber-100 text-amber-700' : 'bg-amber-50 text-amber-600'
  if (tone === 'accent') return active ? 'bg-violet-100 text-violet-700' : 'bg-violet-50 text-violet-600'
  if (tone === 'orange') return active ? 'bg-orange-100 text-orange-700' : 'bg-orange-50 text-orange-600'
  return active ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 text-blue-600'
}

function toneValueClass(tone: SummaryTone) {
  if (tone === 'success') return 'text-emerald-700'
  if (tone === 'warning') return 'text-amber-700'
  if (tone === 'accent') return 'text-violet-700'
  if (tone === 'orange') return 'text-orange-700'
  return 'text-blue-700'
}

function sydneyOffsetMs(date: Date): number {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('sv', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date).replace(' ', 'T') + 'Z'

  return Date.parse(fmt('Australia/Sydney')) - Date.parse(fmt('UTC'))
}

function formatSydneyParts(date: Date) {
  const offsetMs = sydneyOffsetMs(date)
  const syd = new Date(date.getTime() + offsetMs)
  const h24 = syd.getUTCHours()
  return {
    day: syd.getUTCDate(),
    month: syd.getUTCMonth(),
    year: syd.getUTCFullYear(),
    hour12: h24 % 12 || 12,
    minute: String(syd.getUTCMinutes()).padStart(2, '0'),
    period: h24 >= 12 ? 'PM' : 'AM',
    tz: offsetMs >= 39_600_000 ? 'AEDT' : 'AEST',
  }
}

function formatSchedulePresentation(startIso: string | null | undefined, endIso: string | null | undefined): SchedulePresentation {
  const start = startIso ? new Date(startIso) : null
  if (!start || Number.isNaN(start.getTime())) {
    return {
      dateRangeLabel: '—',
      timeRangeLabel: '—',
      durationLabel: null,
      timezoneLabel: null,
      isMultiDay: false,
    }
  }

  const end = endIso ? new Date(endIso) : null
  const endIsValid = Boolean(end && !Number.isNaN(end.getTime()))
  const startParts = formatSydneyParts(start)
  const endParts = endIsValid && end ? formatSydneyParts(end) : null
  const isMultiDay = Boolean(endParts && (startParts.year !== endParts.year || startParts.month !== endParts.month || startParts.day !== endParts.day))
  const startDateLabel = `${startParts.day} ${MONTHS_SHORT[startParts.month]} ${startParts.year}`
  const endDateLabel = endParts ? `${endParts.day} ${MONTHS_SHORT[endParts.month]} ${endParts.year}` : null
  const startTimeLabel = `${startParts.hour12}:${startParts.minute} ${startParts.period}`
  const endTimeLabel = endParts ? `${endParts.hour12}:${endParts.minute} ${endParts.period}` : null
  const timezoneLabel = `Sydney time (${startParts.tz})`
  const durationLabel = endParts
    ? (() => {
        const endDate = end as Date
        const ms = endDate.getTime() - start.getTime()
        if (ms <= 0) return null
        const totalMinutes = Math.round(ms / 60000)
        const hours = Math.floor(totalMinutes / 60)
        const minutes = totalMinutes % 60
        if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
        return `${minutes}m`
      })()
    : null

  return {
    dateRangeLabel: endParts
      ? (startParts.year === endParts.year
        ? `${startParts.day} ${MONTHS_SHORT[startParts.month]} – ${endParts.day} ${MONTHS_SHORT[endParts.month]} ${endParts.year}`
        : `${startDateLabel} – ${endDateLabel}`)
      : startDateLabel,
    timeRangeLabel: endTimeLabel ? `${startTimeLabel} – ${endTimeLabel}` : startTimeLabel,
    durationLabel,
    timezoneLabel,
    isMultiDay,
  }
}

function getStatusPresentationBase(row: BookingDirectoryRow): BookingStatusPresentation {
  const isCheckout = isCheckoutBooking(row)

  if (row.displayStatus === 'awaiting_flight_record') {
    return {
      label: 'Awaiting Flight Record',
      badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
      icon: 'assignment_late',
      iconWrapClass: 'bg-amber-50 border-amber-100',
      iconClass: 'text-amber-600',
    }
  }
  if (row.rawStatus === 'checkout_requested') {
    return {
      label: 'Checkout Requested',
      badgeClassName: 'border-slate-200 bg-slate-50 text-slate-700',
      icon: 'pending',
      iconWrapClass: 'bg-slate-50 border-slate-100',
      iconClass: 'text-slate-600',
    }
  }
  if (row.rawStatus === 'checkout_completed_under_review' || row.rawStatus === 'pending_post_flight_review') {
    return {
      label: isCheckout ? 'Awaiting Checkout Review' : 'Post-flight Review',
      badgeClassName: 'border-violet-200 bg-violet-50 text-violet-700',
      icon: 'rate_review',
      iconWrapClass: 'bg-violet-50 border-violet-100',
      iconClass: 'text-violet-600',
    }
  }
  if (row.rawStatus === 'checkout_payment_required' || row.rawStatus === 'payment_pending') {
    if (row.paymentProofPendingReview) {
      return {
        label: isCheckout
          ? 'Payment Verification Pending'
          : row.isLandingFeePending
            ? 'Landing Fee Review Pending'
            : 'Payment Review Pending',
        badgeClassName: 'border-blue-200 bg-blue-50 text-blue-700',
        icon: 'hourglass_top',
        iconWrapClass: 'bg-blue-50 border-blue-100',
        iconClass: 'text-blue-600',
      }
    }
    return {
      label: isCheckout
        ? 'Checkout Payment Due'
        : row.isLandingFeePending
          ? 'Landing Fee Pending'
          : 'Payment Pending',
      badgeClassName: 'border-orange-200 bg-orange-50 text-orange-700',
      icon: 'payments',
      iconWrapClass: 'bg-orange-50 border-orange-100',
      iconClass: 'text-orange-600',
    }
  }
  if (row.rawStatus === 'completed') {
    return {
      label: 'Completed',
      badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      icon: 'check_circle',
      iconWrapClass: 'bg-emerald-50 border-emerald-100',
      iconClass: 'text-emerald-600',
    }
  }
  if (row.rawStatus === 'cancelled' || row.rawStatus === 'no_show' || row.rawStatus === 'cancellation_requested') {
    return {
      label: row.statusLabel,
      badgeClassName: 'border-red-200 bg-red-50 text-red-700',
      icon: 'cancel',
      iconWrapClass: 'bg-red-50 border-red-100',
      iconClass: 'text-red-600',
    }
  }
  if (
    row.rawStatus === 'confirmed' ||
    row.rawStatus === 'checkout_confirmed' ||
    row.rawStatus === 'ready_for_dispatch'
  ) {
    return {
      label: 'Upcoming',
      badgeClassName: 'border-blue-200 bg-blue-50 text-blue-700',
      icon: isCheckout ? 'assignment_turned_in' : 'calendar_month',
      iconWrapClass: 'bg-blue-50 border-blue-100',
      iconClass: 'text-blue-600',
    }
  }
  if (row.rawStatus === 'dispatched') {
    return {
      label: 'In Progress',
      badgeClassName: 'border-sky-200 bg-sky-50 text-sky-700',
      icon: 'flight_takeoff',
      iconWrapClass: 'bg-sky-50 border-sky-100',
      iconClass: 'text-sky-600',
    }
  }
  return {
    label: row.statusLabel,
    badgeClassName: 'border-slate-200 bg-slate-50 text-slate-700',
    icon: isCheckout ? 'assignment_turned_in' : 'flight',
    iconWrapClass: 'bg-slate-50 border-slate-100',
    iconClass: 'text-slate-600',
  }
}

function getStatusPresentation(row: BookingDirectoryRow): BookingStatusPresentation {
  const status = getStatusPresentationBase(row)
  return {
    ...status,
    badgeClassName: 'border-[rgba(12,35,64,0.12)] bg-white text-[var(--admin-text)]',
    iconWrapClass: 'bg-[var(--admin-muted-surface)] border-[rgba(12,35,64,0.10)]',
    iconClass: 'text-[var(--admin-text-muted)]',
  }
}

function BookingTypePresentation({ row }: { row: BookingDirectoryRow }) {
  const isCheckout = isCheckoutBooking(row)
  const detailLabel = isCheckout
    ? row.bookingTypeSecondaryLabel
    : row.bookingTypePrimaryLabel.replace(/^Rental\s*[—–-]\s*/i, '')

  return (
    <div title={row.billingBasisIsProvisional ? 'Billing basis may change before flight finalisation.' : undefined}>
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ${
          isCheckout
            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}
      >
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
          {isCheckout ? 'assignment_turned_in' : 'flight'}
        </span>
        {isCheckout ? 'Checkout' : 'Rental'}
      </span>
      <p className="mt-1.5 text-[13px] font-medium text-[var(--admin-text)]">{detailLabel}</p>
      {!isCheckout ? (
        <p className="mt-1 text-[12.5px] text-[var(--admin-text-muted)]">{row.bookingTypeSecondaryLabel}</p>
      ) : null}
    </div>
  )
}

function SummaryCard({
  config,
  count,
  active,
  onClick,
}: {
  config: SummaryConfig
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-controls="booking-directory-list"
      className={`flex min-h-[96px] flex-col rounded-[14px] border px-3.5 py-3.5 text-left transition-[border-color,background-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.32)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-bg)] active:translate-y-[1px] sm:min-h-[100px] sm:px-4 sm:py-3.5 ${toneCardClass(config.tone, active)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full border text-[18px] ${toneIconWrapClass(config.tone, active)}`}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            {config.icon}
          </span>
        </div>
        <span className={`text-[1.7rem] font-semibold leading-none tabular-nums sm:text-[1.85rem] ${toneValueClass(config.tone)}`}>
          {count}
        </span>
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[rgba(12,35,64,0.74)]">
          {config.label}
        </p>
        <p className="text-[12.5px] leading-[1.35] text-[rgba(12,35,64,0.72)]">
          {config.helper}
        </p>
      </div>
    </button>
  )
}

export default function BookingDirectoryClient({
  rows,
  initialFilter,
  sort,
  dir,
  basePath,
}: {
  rows: BookingDirectoryRow[]
  initialFilter: string
  sort: SortKey
  dir: SortDir
  basePath: string
}) {
  const router = useRouter()
  const listRef = useRef<HTMLElement | null>(null)
  const [activeFilter, setActiveFilter] = useState<BookingFilterKey>(isBookingFilterKey(initialFilter) ? initialFilter : 'all')
  const [pendingListScroll, setPendingListScroll] = useState(0)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setActiveFilter(isBookingFilterKey(initialFilter) ? initialFilter : 'all')
  }, [initialFilter])

  const filterCounts = useMemo(() => ({
    all: rows.length,
    confirmed: getBookingFilterCount(rows, 'confirmed'),
    awaiting_flight_record: getBookingFilterCount(rows, 'awaiting_flight_record'),
    pending_post_flight_review: getBookingFilterCount(rows, 'pending_post_flight_review'),
    payment_pending: getBookingFilterCount(rows, 'payment_pending'),
    completed: getBookingFilterCount(rows, 'completed'),
  }), [rows])

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesBookingFilter(row, activeFilter)),
    [rows, activeFilter],
  )

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [activeFilter, rows.length])

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleCount),
    [filteredRows, visibleCount],
  )

  const hasMoreRows = visibleCount < filteredRows.length

  useEffect(() => {
    if (pendingListScroll === 0) return

    const frame = window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      listRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      })
      setPendingListScroll(0)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [filteredRows.length, activeFilter, pendingListScroll])

  const listScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!loadMoreRef.current || !hasMoreRows || !listScrollRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredRows.length))
        }
      },
      {
        root: listScrollRef.current,
        rootMargin: '0px 0px 240px 0px',
        threshold: 0.1,
      },
    )

    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [filteredRows.length, hasMoreRows])

  function replaceFilter(nextFilter: BookingFilterKey) {
    setActiveFilter(nextFilter)
    const params = new URLSearchParams()
    if (nextFilter !== 'all') params.set('status', nextFilter)
    params.set('sort', sort)
    params.set('dir', dir)
    const query = params.toString()
    router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false })
  }

  function handleSummaryCardClick(filter: SummaryFilterKey) {
    replaceFilter(activeFilter === filter ? 'all' : filter)
    setPendingListScroll((current) => current + 1)
  }

  function handleTabClick(filter: BookingFilterKey) {
    replaceFilter(activeFilter === filter && filter !== 'all' ? 'all' : filter)
    setPendingListScroll((current) => current + 1)
  }

  const hasActiveFilter = activeFilter !== 'all'
  const activeFilterLabel = hasActiveFilter ? prettifyFilterLabel(activeFilter) : null

  return (
    <div className="space-y-4 lg:space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {SUMMARY_CARDS.map((card) => (
          <div key={card.key} className={card.key === 'completed' ? 'col-span-2 lg:col-span-1' : ''}>
            <SummaryCard
              config={card}
              count={filterCounts[card.key]}
              active={activeFilter === card.key}
              onClick={() => handleSummaryCardClick(card.key)}
            />
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-[14px] border border-[rgba(12,35,64,0.10)] bg-white shadow-[0_8px_22px_rgba(15,30,52,0.05)]">
        <div className="flex flex-col gap-3 p-4 sm:p-[16px]">
          <div className="relative">
            <div className="scrollbar-none overflow-x-auto pr-8 [-webkit-overflow-scrolling:touch]">
              <div className="flex min-w-max items-center gap-2 pr-4">
                {FILTER_TABS.map((filter) => {
                  const active = activeFilter === filter.key
                  const count = filterCounts[filter.key]
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => handleTabClick(filter.key)}
                      aria-pressed={active}
                      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.22)] focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                        active
                          ? 'border-[rgba(26,79,214,0.24)] bg-[rgba(26,79,214,0.08)] text-[var(--admin-accent-blue)]'
                          : 'border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.95)] text-[var(--admin-text-muted)] hover:border-[rgba(26,79,214,0.18)] hover:bg-white hover:text-[var(--admin-text)]'
                      }`}
                    >
                      <span>{filter.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${active ? 'bg-white text-[var(--admin-accent-blue)]' : 'bg-[rgba(12,35,64,0.06)] text-[var(--admin-text-secondary)]'}`}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.92)_58%,rgba(255,255,255,1))] lg:hidden"
            />
          </div>
        </div>
      </section>

      <section
        id="booking-directory-list"
        ref={listRef}
        className="booking-directory-scroll-target overflow-hidden rounded-[16px] border border-[rgba(12,35,64,0.12)] bg-white shadow-[0_12px_28px_rgba(15,30,52,0.08)]"
      >
        <div className="bg-[var(--booking-directory-navy)] text-white">
          <div className="border-b border-white/10 px-4 py-4 sm:px-5 lg:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/68">
                  Booking Operations
                </p>
                <h2 className="mt-1 text-[18px] font-[650] leading-[1.2] text-white">
                  Flight booking directory
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[12.5px] font-semibold text-white/80">
                  Showing {visibleRows.length} of {filteredRows.length} bookings
                </p>
                {activeFilterLabel ? (
                  <span className="inline-flex min-h-8 items-center rounded-full border border-white/14 bg-white/8 px-3 py-1 text-[11.5px] font-semibold text-white/82">
                    {activeFilterLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className={`hidden lg:grid ${DESKTOP_ROW_GRID} ${DESKTOP_ROW_PADDING} bg-[rgba(255,255,255,0.06)] py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-white/74`}>
            <Link href={getSortHref(basePath, activeFilter, sort, dir, 'aircraft')} className="inline-flex transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--booking-directory-navy)]">
              Booking Type
              <span className="material-symbols-outlined ml-1 align-[-2px] text-[13px]">{getSortIcon(sort, dir, 'aircraft')}</span>
            </Link>
            <Link href={getSortHref(basePath, activeFilter, sort, dir, 'customer')} className="inline-flex transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--booking-directory-navy)]">
              Customer
              <span className="material-symbols-outlined ml-1 align-[-2px] text-[13px]">{getSortIcon(sort, dir, 'customer')}</span>
            </Link>
            <Link href={getSortHref(basePath, activeFilter, sort, dir, 'status')} className="inline-flex w-full justify-center text-center transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--booking-directory-navy)]">
              Status
              <span className="material-symbols-outlined ml-1 align-[-2px] text-[13px]">{getSortIcon(sort, dir, 'status')}</span>
            </Link>
            <Link href={getSortHref(basePath, activeFilter, sort, dir, 'scheduled')} className="inline-flex transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--booking-directory-navy)]">
              Schedule
              <span className="material-symbols-outlined ml-1 align-[-2px] text-[13px]">{getSortIcon(sort, dir, 'scheduled')}</span>
            </Link>
          </div>
        </div>

        <div className="bg-white px-3 py-3 sm:px-4 sm:py-4 lg:px-0 lg:py-0">
          {filteredRows.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-[rgba(12,35,64,0.12)] bg-[rgba(242,246,251,0.9)] px-5 py-9 text-center">
              <p className="text-[15px] font-semibold text-[var(--admin-text)]">No bookings match this view</p>
              <p className="mt-2 text-[13px] leading-[1.45] text-[var(--admin-text-muted)]">
                No flight bookings match the selected status filter right now.
              </p>
              {hasActiveFilter ? (
                <button
                  type="button"
                  onClick={() => replaceFilter('all')}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[12px] border border-[rgba(12,35,64,0.10)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[var(--admin-text)] transition-colors hover:border-[rgba(26,79,214,0.18)] hover:text-[var(--admin-accent-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.18)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  Reset filter
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div ref={listScrollRef} className="max-h-[calc(100vh-9.5rem)] overflow-y-auto sm:max-h-[calc(100vh-11.5rem)] lg:max-h-[calc(100vh-13.5rem)]">
                <div className="divide-y divide-[rgba(12,35,64,0.08)] lg:block hidden">
                  {visibleRows.map((row) => {
                    const status = getStatusPresentation(row)
                    const schedule = formatSchedulePresentation(row.scheduledStart, row.scheduledEnd)
                    const isCheckout = isCheckoutBooking(row)

                    return (
                      <article key={row.id} className="group relative cursor-pointer">
                        <Link
                          href={`/admin/bookings/requests/${row.bookingId}`}
                          aria-label={`Open booking ${row.bookingReference} for ${row.customerName}`}
                          className="absolute inset-0 z-10 rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.26)] focus-visible:ring-inset"
                        >
                          <span className="sr-only">Open booking {row.bookingReference}</span>
                        </Link>

                        <div className={`relative z-0 ${DESKTOP_ROW_GRID} ${isCheckout ? 'bg-violet-50/55' : 'bg-emerald-50/55'} ${DESKTOP_ROW_PADDING} py-0 transition-colors group-hover:bg-[var(--booking-directory-row-hover)]`}>
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] ${isCheckout ? 'bg-indigo-500' : 'bg-emerald-500'}`}
                          />
                          <div className="pointer-events-none relative z-0 py-5">
                            <BookingTypePresentation row={row} />
                          </div>
                          <div className="relative z-0 min-w-0 py-5">
                            <Link
                              href={`/admin/users/${row.bookingOwnerUserId}`}
                              className="relative z-20 inline-flex max-w-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.26)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                            >
                              <span className="truncate text-[15px] font-[650] text-[var(--admin-text)] transition-colors hover:text-[var(--admin-accent-blue)]">
                                {row.customerName}
                              </span>
                              <span className="mt-1 break-words text-[13px] text-[var(--admin-text-muted)]">
                                {row.customerEmail}
                              </span>
                            </Link>
                          </div>

                          <div className="pointer-events-none relative z-0 min-w-0 py-5 text-center">
                            <span className="text-[13px] font-medium text-[var(--admin-text)]">
                              {status.label}
                            </span>
                          </div>

                          <div className="pointer-events-none relative z-0 py-5">
                            <p className="text-[13px] font-medium leading-[1.45] text-[var(--admin-text)]">{schedule.dateRangeLabel}</p>
                            <p className="mt-1 text-[12.5px] text-[var(--admin-text-muted)]">{schedule.timeRangeLabel}</p>
                            <p className="mt-1 text-[12px] text-[var(--admin-text-muted)]">
                              {schedule.durationLabel ? `${schedule.durationLabel} · ${schedule.timezoneLabel}` : schedule.timezoneLabel}
                            </p>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>

                <div className="grid gap-3 lg:hidden">
                  {visibleRows.map((row) => {
                    const status = getStatusPresentation(row)
                    const schedule = formatSchedulePresentation(row.scheduledStart, row.scheduledEnd)
                    const isCheckout = isCheckoutBooking(row)

                    return (
                      <article key={row.id} className={`group relative cursor-pointer overflow-hidden rounded-[12px] border border-[rgba(12,35,64,0.10)] ${isCheckout ? 'bg-violet-50/55' : 'bg-emerald-50/55'}`}>
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none absolute inset-y-0 left-0 z-20 w-[3px] ${isCheckout ? 'bg-indigo-500' : 'bg-emerald-500'}`}
                        />
                        <Link
                          href={`/admin/bookings/requests/${row.bookingId}`}
                          aria-label={`Open booking ${row.bookingReference} for ${row.customerName}`}
                          className="absolute inset-0 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.26)] focus-visible:ring-inset"
                        >
                          <span className="sr-only">Open booking {row.bookingReference}</span>
                        </Link>

                        <div className="relative z-0 flex flex-col gap-4 px-5 py-4 transition-colors group-hover:bg-[var(--booking-directory-row-hover)]">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/admin/users/${row.bookingOwnerUserId}`}
                                className="relative z-20 inline-flex max-w-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.26)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                              >
                                <span className="break-words text-[15px] font-[650] leading-[1.3] text-[var(--admin-text)] transition-colors hover:text-[var(--admin-accent-blue)]">
                                  {row.customerName}
                                </span>
                                <span className="mt-1 break-words text-[13px] text-[var(--admin-text-muted)]">
                                  {row.customerEmail}
                                </span>
                              </Link>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <span className="text-[13px] font-medium text-[var(--admin-text)]">
                                {status.label}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-2 text-[13px] sm:grid-cols-2">
                            <div className="rounded-[10px] border border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.85)] px-3 py-2.5">
                              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-text-dim)]">Booking Type</p>
                              <div className="mt-1.5">
                                <BookingTypePresentation row={row} />
                              </div>
                            </div>
                            <div className="rounded-[10px] border border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.85)] px-3 py-2.5">
                              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-text-dim)]">Schedule</p>
                              <p className="mt-1 text-[var(--admin-text)]">{schedule.dateRangeLabel}</p>
                              <p className="mt-1 text-[12px] text-[var(--admin-text-muted)]">{schedule.timeRangeLabel}</p>
                              <p className="mt-1 text-[12px] text-[var(--admin-text-muted)]">
                                {schedule.durationLabel ? `${schedule.durationLabel} · ${schedule.timezoneLabel}` : schedule.timezoneLabel}
                              </p>
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>

                {hasMoreRows ? <div ref={loadMoreRef} className="h-px" /> : null}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
