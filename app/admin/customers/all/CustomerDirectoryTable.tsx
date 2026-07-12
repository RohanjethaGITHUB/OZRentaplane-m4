'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getCustomerDerivedStatusMeta,
  getStatusFromQuery,
  type CustomerFilterKey,
  type CustomerLifecycleStatus,
} from '@/app/admin/customers/customer-status'

type Row = {
  id: string
  fullName: string
  email: string
  phone?: string | null
  updatedAt: string
  lifecycleStatus: CustomerLifecycleStatus
  needsAttention: boolean
  attentionReason: string | null
}

type SummaryTone = 'success' | 'info' | 'warning' | 'danger'
type DirectoryMetricKey = 'checkout_not_requested' | 'payment_required' | 'needs_attention' | 'cleared_to_fly' | 'blocked'

type FilterConfig = {
  key: DirectoryMetricKey
  label: string
  helper: string
  icon: string
  tone: SummaryTone
}

type RowPresentation = {
  badgeLabel: string
  badgeToneClass: string
  accentClass: string
  icon: string
  iconClass: string
  iconWrapClass: string
}

const SUMMARY_CARDS: FilterConfig[] = [
  {
    key: 'cleared_to_fly',
    label: 'Cleared to Fly',
    helper: 'Ready for normal bookings',
    icon: 'verified',
    tone: 'success',
  },
  {
    key: 'payment_required',
    label: 'Payment Required',
    helper: 'Invoice payment pending',
    icon: 'payments',
    tone: 'warning',
  },
  {
    key: 'checkout_not_requested',
    label: 'Checkout Required',
    helper: 'Checkout still needed',
    icon: 'assignment_turned_in',
    tone: 'info',
  },
  {
    key: 'needs_attention',
    label: 'Needs Review',
    helper: 'Needs admin follow-up',
    icon: 'rate_review',
    tone: 'danger',
  },
  {
    key: 'blocked',
    label: 'Blocked',
    helper: 'Access restricted',
    icon: 'block',
    tone: 'danger',
  },
]

const FILTERS: Array<{ key: CustomerFilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'checkout_not_requested', label: 'Checkout Required' },
  { key: 'payment_required', label: 'Payment Required' },
  { key: 'needs_attention', label: 'Needs Review' },
  { key: 'cleared_to_fly', label: 'Cleared to Fly' },
  { key: 'blocked', label: 'Blocked' },
]

function formatPhone(phone?: string | null) {
  const raw = phone ?? ''
  const cleaned = raw.replace(/^\+\+61\s?/, '').replace(/^\+61\s?/, '').trim()
  return cleaned || '—'
}

function customerDetailHref(customerId: string) {
  return `/admin/users/${customerId}`
}

function hasTextSelection() {
  if (typeof window === 'undefined') return false
  const selection = window.getSelection()
  return Boolean(selection && selection.toString().trim().length > 0)
}

function getStatusFilterLabel(key: CustomerFilterKey) {
  return FILTERS.find((filter) => filter.key === key)?.label ?? 'All'
}

function matchesCustomerFilter(row: Row, filter: CustomerFilterKey) {
  if (filter === 'all') return true
  if (filter === 'needs_attention') return row.needsAttention
  return row.lifecycleStatus === filter
}

function getCustomerFilterCount(rows: Row[], filter: CustomerFilterKey) {
  return rows.filter((row) => matchesCustomerFilter(row, filter)).length
}

function getCustomerInitials(fullName: string) {
  return fullName
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function toneClass(tone: SummaryTone, selected: boolean) {
  if (tone === 'success') {
    return selected
      ? 'border-emerald-300/90 bg-emerald-50/95 text-emerald-900 shadow-[0_10px_20px_rgba(22,101,52,0.10)]'
      : 'border-emerald-200/80 bg-white text-emerald-900 hover:border-emerald-300 hover:bg-emerald-50/55'
  }
  if (tone === 'warning') {
    return selected
      ? 'border-amber-300/90 bg-amber-50/95 text-amber-950 shadow-[0_10px_20px_rgba(180,83,9,0.10)]'
      : 'border-amber-200/80 bg-white text-amber-950 hover:border-amber-300 hover:bg-amber-50/55'
  }
  if (tone === 'danger') {
    return selected
      ? 'border-red-300/90 bg-red-50/95 text-red-950 shadow-[0_10px_20px_rgba(185,28,28,0.10)]'
      : 'border-red-200/80 bg-white text-red-950 hover:border-red-300 hover:bg-red-50/55'
  }
  return selected
    ? 'border-blue-300/90 bg-blue-50/95 text-blue-950 shadow-[0_10px_20px_rgba(26,79,214,0.10)]'
    : 'border-blue-200/80 bg-white text-blue-950 hover:border-blue-300 hover:bg-blue-50/55'
}

function toneIconWrapClass(tone: SummaryTone, selected: boolean) {
  if (tone === 'success') return selected ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-50 text-emerald-600'
  if (tone === 'warning') return selected ? 'bg-amber-100 text-amber-700' : 'bg-amber-50 text-amber-600'
  if (tone === 'danger') return selected ? 'bg-red-100 text-red-700' : 'bg-red-50 text-red-600'
  return selected ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 text-blue-600'
}

function toneValueClass(tone: SummaryTone) {
  if (tone === 'success') return 'text-emerald-700'
  if (tone === 'warning') return 'text-amber-700'
  if (tone === 'danger') return 'text-red-700'
  return 'text-blue-700'
}

function getRowPresentation(row: Row): RowPresentation {
  if (row.lifecycleStatus === 'blocked') {
    return {
      badgeLabel: 'Blocked',
      badgeToneClass: 'border-red-200 bg-red-50 text-red-700',
      accentClass: 'bg-red-500',
      icon: 'block',
      iconClass: 'text-red-600',
      iconWrapClass: 'bg-red-50 border-red-100',
    }
  }
  if (row.needsAttention) {
    return {
      badgeLabel: 'Needs Review',
      badgeToneClass: 'border-orange-200 bg-orange-50 text-orange-700',
      accentClass: 'bg-orange-500',
      icon: 'rate_review',
      iconClass: 'text-orange-600',
      iconWrapClass: 'bg-orange-50 border-orange-100',
    }
  }
  if (row.lifecycleStatus === 'payment_required') {
    return {
      badgeLabel: 'Payment Required',
      badgeToneClass: 'border-amber-200 bg-amber-50 text-amber-700',
      accentClass: 'bg-amber-500',
      icon: 'payments',
      iconClass: 'text-amber-600',
      iconWrapClass: 'bg-amber-50 border-amber-100',
    }
  }
  if (row.lifecycleStatus === 'checkout_not_requested') {
    return {
      badgeLabel: 'Checkout Required',
      badgeToneClass: 'border-blue-200 bg-blue-50 text-blue-700',
      accentClass: 'bg-blue-500',
      icon: 'assignment_turned_in',
      iconClass: 'text-blue-600',
      iconWrapClass: 'bg-blue-50 border-blue-100',
    }
  }
  if (row.lifecycleStatus === 'cleared_to_fly') {
    return {
      badgeLabel: 'Cleared to Fly',
      badgeToneClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      accentClass: 'bg-emerald-500',
      icon: 'flight_takeoff',
      iconClass: 'text-emerald-600',
      iconWrapClass: 'bg-emerald-50 border-emerald-100',
    }
  }
  return {
    badgeLabel: getCustomerDerivedStatusMeta(row.lifecycleStatus).label,
    badgeToneClass: 'border-slate-200 bg-slate-50 text-slate-700',
    accentClass: 'bg-slate-400',
    icon: 'person',
    iconClass: 'text-slate-600',
    iconWrapClass: 'bg-slate-50 border-slate-100',
  }
}

function SummaryCard({
  config,
  count,
  active,
  onClick,
}: {
  config: FilterConfig
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-controls="customer-readiness-list"
      className={`flex min-h-[96px] flex-col rounded-[14px] border px-3.5 py-3.5 text-left transition-[border-color,background-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.32)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-bg)] active:translate-y-[1px] sm:min-h-[100px] sm:px-4 sm:py-3.5 ${toneClass(config.tone, active)}`}
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

function RowLink({
  href,
  label,
  className,
  children,
}: {
  href: string
  label: string
  className: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={className}
      onClick={(event) => {
        if (hasTextSelection()) {
          event.preventDefault()
        }
      }}
      onKeyDown={(event) => {
        if (event.key === ' ') {
          event.preventDefault()
          event.currentTarget.click()
        }
      }}
    >
      {children}
    </Link>
  )
}

export default function CustomerDirectoryTable({
  rows,
  initialFilter,
}: {
  rows: Row[]
  initialFilter?: string
}) {
  const router = useRouter()
  const listRef = useRef<HTMLElement | null>(null)
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<CustomerFilterKey>(getStatusFromQuery(initialFilter))
  const [pendingListScroll, setPendingListScroll] = useState(0)

  useEffect(() => {
    setActiveFilter(getStatusFromQuery(initialFilter))
  }, [initialFilter])

  const filterCounts = useMemo(() => ({
    all: rows.length,
    checkout_not_requested: getCustomerFilterCount(rows, 'checkout_not_requested'),
    payment_required: getCustomerFilterCount(rows, 'payment_required'),
    needs_attention: getCustomerFilterCount(rows, 'needs_attention'),
    cleared_to_fly: getCustomerFilterCount(rows, 'cleared_to_fly'),
    blocked: getCustomerFilterCount(rows, 'blocked'),
  }), [rows])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (!matchesCustomerFilter(row, activeFilter)) return false
      if (!normalizedQuery) return true
      return (
        row.fullName.toLowerCase().includes(normalizedQuery) ||
        row.email.toLowerCase().includes(normalizedQuery) ||
        (row.phone ?? '').toLowerCase().includes(normalizedQuery)
      )
    })
  }, [rows, query, activeFilter])

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

  const hasFiltersApplied = activeFilter !== 'all' || query.trim().length > 0

  function replaceFilter(next: CustomerFilterKey) {
    setActiveFilter(next)
    router.replace(next === 'all' ? '/admin/customers/all' : `/admin/customers/all?status=${next}`, { scroll: false })
  }

  function clearFilters() {
    setQuery('')
    replaceFilter('all')
  }

  function handleSummaryCardClick(filter: Exclude<CustomerFilterKey, 'all'>) {
    replaceFilter(activeFilter === filter ? 'all' : filter)
    setPendingListScroll((current) => current + 1)
  }

  const activeFilterLabel = activeFilter !== 'all' ? getStatusFilterLabel(activeFilter) : null

  return (
    <div className="space-y-5 lg:space-y-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {SUMMARY_CARDS.map((card) => (
          <div key={card.key} className={card.key === 'blocked' ? 'col-span-2 lg:col-span-1' : ''}>
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
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search customers</span>
              <div className="relative">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--admin-text-dim)]">
                  search
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search customers by name, email, or phone"
                  className="h-11 w-full rounded-[12px] border border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.95)] pl-10 pr-4 text-[14px] text-[var(--admin-text)] placeholder:text-[var(--admin-text-dim)] focus:outline-none focus:ring-2 focus:ring-[rgba(26,79,214,0.16)]"
                />
              </div>
            </label>

            <div className="flex flex-col gap-2 sm:flex-row lg:items-center">
              {hasFiltersApplied ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex min-h-11 items-center justify-center rounded-[12px] border border-[rgba(12,35,64,0.10)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[var(--admin-text-muted)] transition-colors hover:border-[rgba(26,79,214,0.20)] hover:text-[var(--admin-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.18)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="relative">
            <div className="scrollbar-none overflow-x-auto pr-8 [-webkit-overflow-scrolling:touch]">
              <div className="flex min-w-max items-center gap-2 pr-4">
                {FILTERS.map((filter) => {
                  const active = activeFilter === filter.key
                  const count = filterCounts[filter.key as keyof typeof filterCounts]
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => replaceFilter(filter.key)}
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

          {(activeFilterLabel || query.trim()) ? (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--admin-text-muted)]">
              {activeFilterLabel ? (
                <span className="inline-flex min-h-9 items-center rounded-full border border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.9)] px-3 py-1.5">
                  Status: <span className="ml-1 font-semibold text-[var(--admin-text)]">{activeFilterLabel}</span>
                </span>
              ) : null}
              {query.trim() ? (
                <span className="inline-flex min-h-9 items-center rounded-full border border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.9)] px-3 py-1.5">
                  Search: <span className="ml-1 font-semibold text-[var(--admin-text)]">&quot;{query.trim()}&quot;</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section
        id="customer-readiness-list"
        ref={listRef}
        className="customer-directory-scroll-target overflow-hidden rounded-[16px] border border-[rgba(12,35,64,0.12)] bg-white shadow-[0_12px_28px_rgba(15,30,52,0.08)]"
      >
        <div className="bg-[var(--customer-directory-navy)] text-white">
          <div className="border-b border-white/10 px-4 py-4 sm:px-5 lg:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/68">
                  Customer Operations
                </p>
                <h2 className="mt-1 font-[var(--font-manrope)] text-[18px] font-[650] leading-[1.2] text-white">
                  Customer readiness list
                </h2>
              </div>
              <p className="text-[12.5px] font-semibold text-white/80">
                Showing {filteredRows.length} of {rows.length} customers
              </p>
            </div>
          </div>

          <div className="hidden lg:grid lg:grid-cols-[4px_minmax(0,0.48fr)_minmax(0,1.08fr)_minmax(0,1.7fr)_minmax(0,1.04fr)] lg:items-center lg:gap-x-5 lg:bg-[rgba(255,255,255,0.06)] lg:px-0 lg:py-3 lg:text-[11px] lg:font-bold lg:uppercase lg:tracking-[0.1em] lg:text-white/74">
            <span />
            <span className="px-0">Status</span>
            <span>Customer</span>
            <span>Readiness</span>
            <span>Contact</span>
          </div>
        </div>

        <div className="bg-white px-3 py-3 sm:px-4 sm:py-4 lg:px-0 lg:py-0">
          {filteredRows.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-[rgba(12,35,64,0.12)] bg-[rgba(242,246,251,0.9)] px-5 py-9 text-center">
              <p className="text-[15px] font-semibold text-[var(--admin-text)]">No customers match this view</p>
              <p className="mt-2 text-[13px] leading-[1.45] text-[var(--admin-text-muted)]">
                Adjust the search or readiness filter to see customer accounts.
              </p>
              {hasFiltersApplied ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[12px] border border-[rgba(12,35,64,0.10)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[var(--admin-text)] transition-colors hover:border-[rgba(26,79,214,0.18)] hover:text-[var(--admin-accent-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.18)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  Reset filters
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="hidden lg:block">
                <div className="divide-y divide-[rgba(12,35,64,0.08)]">
                  {filteredRows.map((row) => {
                    const status = getCustomerDerivedStatusMeta(row.lifecycleStatus)
                    const presentation = getRowPresentation(row)
                    const phoneText = formatPhone(row.phone)
                    const initials = getCustomerInitials(row.fullName)
                    const href = customerDetailHref(row.id)

                    return (
                      <RowLink
                        key={row.id}
                        href={href}
                        label={`Open ${row.fullName} customer profile`}
                        className="group block cursor-pointer select-text focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.26)] focus-visible:ring-inset"
                      >
                        <div className="grid min-h-[120px] grid-cols-[4px_minmax(0,0.48fr)_minmax(0,1.08fr)_minmax(0,1.7fr)_minmax(0,1.04fr)] items-center gap-x-5 bg-white px-0 py-0 transition-colors group-hover:bg-[var(--customer-directory-row-hover)] group-focus-visible:bg-[var(--customer-directory-row-hover)] group-active:bg-[rgba(26,79,214,0.04)]">
                          <div className={`h-full min-h-[120px] ${presentation.accentClass}`} />

                          <div className="flex justify-center py-5">
                            <div className={`flex h-12 w-12 items-center justify-center rounded-full border ${presentation.iconWrapClass}`}>
                              <span className={`material-symbols-outlined text-[18px] ${presentation.iconClass}`} aria-hidden="true">
                                {presentation.icon}
                              </span>
                            </div>
                          </div>

                          <div className="min-w-0 py-5">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(12,35,64,0.10)] bg-[rgba(242,246,251,0.95)] text-[12px] font-bold text-[var(--admin-text)]">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-[15px] font-[650] text-[var(--admin-text)]">{row.fullName}</p>
                                <p className="mt-1 text-[12.5px] text-[var(--admin-text-muted)]">{presentation.badgeLabel}</p>
                              </div>
                            </div>
                          </div>

                          <div className="min-w-0 py-5">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${presentation.badgeToneClass}`}>
                              {presentation.badgeLabel}
                            </span>
                            <p className="mt-2 max-w-[28rem] text-[13px] leading-[1.45] text-[var(--admin-text-muted)]">
                              {row.needsAttention ? row.attentionReason ?? status.description : status.description}
                            </p>
                          </div>

                          <div className="min-w-0 py-5 pr-6">
                            <p className="break-words text-[13px] font-medium text-[var(--admin-text)]">{row.email}</p>
                            <p className="mt-1 break-words text-[12.5px] text-[var(--admin-text-muted)]">{phoneText}</p>
                            <p className="mt-1 text-[12px] text-[var(--admin-text-muted)]">
                              {phoneText === '—' ? 'Email only on file' : 'Email and phone on file'}
                            </p>
                          </div>
                        </div>
                      </RowLink>
                    )
                  })}
                </div>
              </div>

              <div className="grid gap-3 lg:hidden">
                {filteredRows.map((row) => {
                  const status = getCustomerDerivedStatusMeta(row.lifecycleStatus)
                  const presentation = getRowPresentation(row)
                  const href = customerDetailHref(row.id)

                  return (
                    <RowLink
                      key={row.id}
                      href={href}
                      label={`Open ${row.fullName} customer profile`}
                      className="group relative block min-h-[180px] cursor-pointer overflow-hidden rounded-[12px] border border-[rgba(12,35,64,0.10)] bg-white transition-colors hover:bg-[var(--customer-directory-row-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.26)] focus-visible:ring-inset active:bg-[rgba(26,79,214,0.04)]"
                    >
                      <div className={`absolute inset-y-0 left-0 w-1 ${presentation.accentClass}`} />

                      <div className="relative flex flex-col gap-4 p-4 transition-colors group-focus-visible:bg-[var(--customer-directory-row-hover)]">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${presentation.iconWrapClass}`}>
                            <span className={`material-symbols-outlined text-[18px] ${presentation.iconClass}`} aria-hidden="true">
                              {presentation.icon}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="break-words text-[15px] font-[650] leading-[1.3] text-[var(--admin-text)]">
                                  {row.fullName}
                                </p>
                                <p className="mt-1 break-words text-[13px] text-[var(--admin-text-muted)]">
                                  {row.email}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3">
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${presentation.badgeToneClass}`}>
                                {presentation.badgeLabel}
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="text-[13px] leading-[1.45] text-[var(--admin-text-muted)]">
                          {row.needsAttention ? row.attentionReason ?? status.description : status.description}
                        </p>

                        <div className="grid gap-2 text-[13px] sm:grid-cols-2">
                          <div className="rounded-[10px] border border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.85)] px-3 py-2.5">
                            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-text-dim)]">Phone</p>
                            <p className="mt-1 text-[var(--admin-text)]">{formatPhone(row.phone)}</p>
                            <p className="mt-1 text-[12px] text-[var(--admin-text-muted)]">
                              {formatPhone(row.phone) === '—' ? 'No phone on file' : 'Phone available'}
                            </p>
                          </div>
                          <div className="rounded-[10px] border border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.85)] px-3 py-2.5">
                            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-text-dim)]">Email</p>
                            <p className="mt-1 break-words text-[var(--admin-text)]">{row.email}</p>
                            <p className="mt-1 text-[12px] text-[var(--admin-text-muted)]">Primary email on file</p>
                          </div>
                        </div>
                      </div>
                    </RowLink>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
