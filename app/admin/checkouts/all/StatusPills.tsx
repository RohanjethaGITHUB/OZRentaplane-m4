'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

type StatusFilter = 'all' | 'new_requests' | 'upcoming' | 'in_progress' | 'awaiting_outcome' | 'payment_required' | 'completed' | 'reschedule' | 'cancelled' | 'no_show'

const SEEN_STORAGE_KEY = 'admin_checkout_status_seen_v1'
const ACTION_TABS = new Set<StatusFilter>(['new_requests', 'awaiting_outcome', 'payment_required', 'reschedule', 'cancelled', 'no_show'])
const ACTION_TAB_LIST: StatusFilter[] = ['new_requests', 'awaiting_outcome', 'payment_required', 'reschedule', 'cancelled', 'no_show']

export default function StatusPills({
  tabs,
  statusCounts,
  statusFilter,
  sort,
  dir,
}: {
  tabs: Array<{ key: StatusFilter; label: string }>
  statusCounts: Record<StatusFilter, number>
  statusFilter: StatusFilter
  sort: 'customer' | 'submitted' | 'scheduled' | 'status' | 'outcome' | 'payment'
  dir: 'asc' | 'desc'
}) {
  const pathname = usePathname()
  const [seen, setSeen] = useState<Record<string, number>>({})

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SEEN_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, number>
      setSeen(parsed)
    } catch {
      setSeen({})
    }
  }, [])

  useEffect(() => {
    if (!ACTION_TABS.has(statusFilter)) return
    const currentCount = statusCounts[statusFilter] ?? 0
    if (currentCount <= 0) return

    const timer = window.setTimeout(() => {
      setSeen((prev) => {
        const next = { ...prev, [statusFilter]: currentCount }
        try {
          window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(next))
        } catch {
          // ignore storage failures
        }
        return next
      })
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [statusFilter, statusCounts])

  const tabHref = (tab: StatusFilter) => {
    const basePath = pathname ?? '/admin/checkouts/all'
    const p = new URLSearchParams()
    if (tab !== 'all') p.set('status', tab)
    if (sort !== 'submitted') p.set('sort', sort)
    if (dir !== 'desc') p.set('dir', dir)
    const q = p.toString()
    return q ? `${basePath}?${q}` : basePath
  }

  const unseenCounts = useMemo(() => {
    const out: Record<StatusFilter, number> = {
      all: statusCounts.all,
      new_requests: 0,
      upcoming: 0,
      in_progress: 0,
      awaiting_outcome: 0,
      payment_required: 0,
      completed: 0,
      reschedule: 0,
      cancelled: 0,
      no_show: 0,
    }
    for (const key of ACTION_TAB_LIST) {
      const current = statusCounts[key] ?? 0
      const seenCount = seen[key] ?? 0
      out[key] = Math.max(0, current - seenCount)
    }
    return out
  }, [seen, statusCounts])

  return (
    <div className="space-y-3.5">
      <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--admin-text-muted)]">
        <span className="h-[6px] w-[6px] rounded-full bg-amber-300/80 shadow-[0_0_10px_rgba(252,211,77,0.4)]" />
        Status
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {tabs.map((t) => {
          const active = t.key === statusFilter
          const count = statusCounts[t.key]
          const alertCount = ACTION_TABS.has(t.key) ? unseenCounts[t.key] : 0
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={`group inline-flex min-h-[38px] items-center gap-2.5 rounded-full border px-[18px] py-2 text-[13px] font-semibold tracking-[0.01em] transition-all duration-200 ${
                active
                  ? 'border-[rgba(96,165,250,0.52)] bg-[linear-gradient(180deg,rgba(30,64,175,0.34),rgba(30,58,138,0.24))] text-[#eff6ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_0_1px_rgba(250,204,21,0.22),0_10px_18px_rgba(2,6,23,0.35)]'
                  : 'border-[var(--admin-border)] bg-[rgba(15,23,42,0.5)] text-[var(--admin-text-muted)] hover:border-[rgba(96,165,250,0.3)] hover:bg-[rgba(30,41,59,0.72)] hover:text-[var(--admin-text)] hover:shadow-[0_6px_14px_rgba(2,6,23,0.25)]'
              }`}
            >
              {active && <span className="h-3 w-[2px] rounded-full bg-amber-300/90 shadow-[0_0_10px_rgba(252,211,77,0.38)]" />}
              <span>{t.label}</span>
              {alertCount > 0 ? (
                <span className="ml-0.5 flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-[10px] font-bold text-white tabular-nums border border-red-200/30">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              ) : count > 0 ? (
                <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${active ? 'bg-slate-950/35 text-slate-200' : 'bg-black/20 text-[var(--admin-text-muted)]'}`}>
                  {count > 99 ? '99+' : count}
                </span>
              ) : null}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
