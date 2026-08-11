'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AdminStatusBadge } from '@/app/admin/components/AdminListView'
import { getCustomerDerivedStatusMeta, type CustomerLifecycleStatus } from '@/app/admin/customers/customer-status'

type BillingRow = {
  id: string
  name: string
  email: string
  totalPaidCents: number
  status: CustomerLifecycleStatus
}

const PAGE_SIZE = 10

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Math.abs(cents) / 100)
}

export default function CustomerBillingTable({
  rows,
  initialQuery = '',
  selectedCustomerId,
  compact = false,
}: {
  rows: BillingRow[]
  initialQuery?: string
  selectedCustomerId?: string
  compact?: boolean
}) {
  const [query, setQuery] = useState(initialQuery)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const selectedRowRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return rows
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(normalized) ||
        row.email.toLowerCase().includes(normalized),
    )
  }, [rows, query])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query, rows.length])

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleCount),
    [filteredRows, visibleCount],
  )
  const hasMoreRows = visibleCount < filteredRows.length

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

  useEffect(() => {
    if (!selectedCustomerId || !selectedRowRef.current) return
    selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedCustomerId, visibleRows])

  return (
    <section className="overflow-hidden rounded-[16px] border border-[rgba(12,35,64,0.12)] bg-white shadow-[0_12px_28px_rgba(15,30,52,0.08)]">
      <div className="border-b border-[rgba(12,35,64,0.08)] bg-[linear-gradient(180deg,rgba(247,251,255,0.98),rgba(255,255,255,0.96))] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative min-w-0 flex-1 sm:max-w-[420px]">
            <span className="sr-only">Search customers</span>
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--admin-text-muted)]">
              search
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or email…"
              className="h-11 w-full rounded-[12px] border border-[rgba(12,35,64,0.12)] bg-white pl-10 pr-4 text-[14px] text-[var(--admin-text)] placeholder:text-[var(--admin-text-muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] focus:outline-none focus:ring-2 focus:ring-[rgba(26,79,214,0.16)]"
            />
          </label>
          <p className="shrink-0 text-[12.5px] font-semibold tabular-nums text-[var(--admin-text-muted)]">
            {filteredRows.length} customer{filteredRows.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="hidden border-b border-[rgba(12,35,64,0.08)] bg-[rgba(12,35,64,0.03)] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--admin-text-muted)] lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.7fr)_minmax(0,0.95fr)] lg:gap-x-5">
        <span>Customer</span>
        <span className="text-right">Total Paid</span>
        <span className="text-right">Status</span>
      </div>

      <div className="bg-white">
        {filteredRows.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[15px] font-semibold text-[var(--admin-text)]">
              {query.trim() ? 'No customers match your search' : 'No customer ledger records found'}
            </p>
            {query.trim() ? (
              <p className="mt-1.5 text-[13px] text-[var(--admin-text-muted)]">
                Try a different name or email.
              </p>
            ) : null}
          </div>
        ) : (
          <div
            ref={listScrollRef}
            className={
              compact
                ? 'max-h-[min(70vh,640px)] overflow-y-auto'
                : 'max-h-[calc(100vh-12rem)] overflow-y-auto sm:max-h-[calc(100vh-14rem)]'
            }
          >
            <div className="divide-y divide-[rgba(12,35,64,0.08)]">
              {visibleRows.map((row) => {
                const status = getCustomerDerivedStatusMeta(row.status)
                const amountClass = row.totalPaidCents > 0 ? 'text-emerald-700' : 'text-[var(--admin-text-muted)]'
                const isSelected = selectedCustomerId === row.id

                return (
                  <Link
                    key={row.id}
                    ref={isSelected ? selectedRowRef : undefined}
                    href={`/admin/customers/ledger?customerId=${row.id}`}
                    aria-current={isSelected ? 'page' : undefined}
                    className={`grid grid-cols-1 gap-3 px-5 py-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.26)] focus-visible:ring-inset lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.7fr)_minmax(0,0.95fr)] lg:items-center lg:gap-x-5 ${
                      isSelected
                        ? 'bg-[rgba(26,79,214,0.06)] ring-1 ring-inset ring-[rgba(26,79,214,0.14)]'
                        : 'hover:bg-[var(--admin-row-hover)]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold leading-tight text-[var(--admin-text)]">
                        {row.name}
                      </p>
                      <p className="mt-1 truncate text-[13px] text-[var(--admin-text-muted)]">{row.email}</p>
                    </div>
                    <div className={`text-[15px] font-semibold tabular-nums lg:text-right ${amountClass}`}>
                      {formatMoney(row.totalPaidCents)}
                    </div>
                    <div className="lg:flex lg:justify-end">
                      <AdminStatusBadge label={status.label} tone={status.tone} />
                    </div>
                  </Link>
                )
              })}
            </div>
            {hasMoreRows ? <div ref={loadMoreRef} className="h-px" /> : null}
          </div>
        )}
      </div>
    </section>
  )
}
