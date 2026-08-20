'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AdminStatusBadge } from './components/AdminUi'
import type { ActionItem } from './page'

type WorkflowFilter = 'all' | 'checkout' | 'rental' | 'document_review'

const PAGE_SIZE = 10

function formatRelativeAge(timestamp: string | null) {
  if (!timestamp) return 'Unknown'

  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = Math.max(0, now - then)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) {
    return 'Just now'
  }

  if (diff < hour) {
    const mins = Math.max(1, Math.floor(diff / minute))
    return `${mins} minute${mins === 1 ? '' : 's'} ago`
  }

  if (diff < day) {
    const hours = Math.floor(diff / hour)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }

  const days = Math.floor(diff / day)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function ActionBadge({ badge }: { badge: ActionItem['badge'] }) {
  if (badge === 'Checkout') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[12px] font-semibold text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-300">
        <span className="material-symbols-outlined text-[13px]">flight_takeoff</span>
        Checkout
      </span>
    )
  }
  if (badge === 'Rental') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
        <span className="material-symbols-outlined text-[13px]">flight</span>
        Rental
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[12px] font-semibold text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
      <span className="material-symbols-outlined text-[13px]">description</span>
      Document Review
    </span>
  )
}

function workflowLabel(workflow: Exclude<WorkflowFilter, 'all'>) {
  if (workflow === 'checkout') return 'Checkouts'
  if (workflow === 'rental') return 'Rentals'
  return 'Document Review'
}

function ToolbarChip({
  label,
  count,
  active,
  onClick,
  buttonRef,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
  buttonRef?: (node: HTMLButtonElement | null) => void
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-10 shrink-0 items-center rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-primary-navy)] ${
        active
          ? 'border-white/18 bg-white text-[var(--admin-primary-navy)] shadow-[0_8px_18px_rgba(2,7,18,0.18)]'
          : 'border-white/14 bg-white/8 text-white/82 hover:border-white/22 hover:bg-white/14 hover:text-white active:bg-white/18'
      }`}
    >
      <span>{label}</span>
      {typeof count === 'number' ? (
        <span
          className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
            active ? 'bg-[rgba(12,35,64,0.10)] text-[var(--admin-primary-navy)]' : 'bg-white/12 text-white'
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}

function MessagesToolbarLink({ count }: { count: number }) {
  return (
    <Link
      href="/admin/messages"
      className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-white/14 bg-white/8 px-3.5 py-2 text-[13px] font-semibold text-white/82 transition-colors hover:border-white/22 hover:bg-white/14 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-primary-navy)]"
    >
      <span>Messages</span>
      <span className="ml-2 rounded-full bg-white/12 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">
        {count}
      </span>
    </Link>
  )
}

function MetadataBlock({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--admin-text-muted)]">{label}</p>
      <div className="mt-1 text-[13px] font-medium leading-[1.35] text-[var(--admin-text)] sm:text-[13.5px]">{children}</div>
    </div>
  )
}

function QueueActionRow({ item }: { item: ActionItem }) {
  const router = useRouter()
  const customerLabel = item.customerLabel || 'Customer'

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => router.push(item.href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          router.push(item.href)
        }
      }}
      aria-label={`${item.nextStep}: ${item.title}`}
      className="group block cursor-pointer select-none rounded-[var(--admin-radius-row)] border border-slate-200/70 dark:border-slate-800/80 bg-[var(--admin-row)] hover:bg-[var(--admin-row-hover)] hover:border-slate-300 dark:hover:border-slate-700 shadow-sm hover:shadow-[var(--admin-shadow-row-hover)] transition-all outline-none focus:outline-none active:outline-none [-webkit-tap-highlight-color:transparent]"
    >
      <div className="p-4 sm:p-4.5">
        {/* Top metadata strip */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <ActionBadge badge={item.badge} />
            {item.aircraftLabel && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-[12px] font-semibold text-sky-700 dark:text-sky-300">
                <span className="material-symbols-outlined text-[13px]">flight</span>
                {item.aircraftLabel}
              </span>
            )}
            {item.aggregateOnly ? <AdminStatusBadge label="Aggregate" tone="neutral" /> : null}
          </div>

          <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--admin-text-secondary)]">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            <span>{formatRelativeAge(item.receivedAt)}</span>
          </div>
        </div>

        {/* Main Card Content Grid */}
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_auto] lg:items-center">
          {/* Title & Description */}
          <div className="min-w-0">
            <h3 className="text-[15px] sm:text-[15.5px] font-semibold leading-[1.3] text-[var(--admin-text)]">
              {item.title}
            </h3>
            <p className="mt-1 text-[13px] sm:text-[13.5px] font-normal leading-[1.4] text-[var(--admin-text-secondary)]">
              {item.description}
            </p>
            {item.scheduleLabel && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 px-2.5 py-1 text-[12px] font-medium text-[var(--admin-text)]">
                <span className="material-symbols-outlined text-[14px] text-sky-600 dark:text-sky-400">calendar_month</span>
                <span>{item.scheduleLabel}</span>
              </div>
            )}
            {item.issueLabel && (
              <p className="mt-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-400">
                {item.issueLabel}
              </p>
            )}
          </div>

          {/* Customer Details */}
          <div className="min-w-0 border-t border-[var(--admin-divider)] pt-3 lg:border-t-0 lg:pt-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--admin-text-muted)]">Customer</p>
            <div className="mt-0.5">
              <span className="block truncate text-[14px] font-semibold text-[var(--admin-text)]">
                {customerLabel}
              </span>
              {item.customerEmail && (
                <span className="block truncate text-[12px] text-[var(--admin-text-secondary)]">
                  {item.customerEmail}
                </span>
              )}
            </div>
          </div>

          {/* Action Button CTA */}
          <div className="flex items-center justify-center lg:justify-end pt-2 lg:pt-0 w-full lg:w-auto">
            <span
              className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 sm:px-3.5 text-[13px] sm:text-[12.5px] font-semibold shadow-sm transition-all group-hover:scale-[1.02] group-active:scale-[0.98] ${
                item.actionTone === 'amber'
                  ? 'border border-amber-300/90 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:border-amber-400 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200'
                  : item.actionTone === 'success'
                  ? 'border border-emerald-300/90 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : item.actionTone === 'indigo'
                  ? 'border border-indigo-300/90 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 hover:border-indigo-400 dark:border-indigo-700/60 dark:bg-indigo-950/40 dark:text-indigo-200'
                  : 'border border-sky-300/80 bg-sky-50 text-sky-800 hover:bg-sky-100 hover:border-sky-400 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-200'
              }`}
            >
              <span>{item.nextStep}</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}

export function ActionQueueSection({
  actionRows,
  emptyMessage,
  filteredEmptyMessageByWorkflow,
  unreadMessageCount = 0,
}: {
  actionRows: ActionItem[]
  emptyMessage: string
  filteredEmptyMessageByWorkflow: Record<Exclude<WorkflowFilter, 'all'>, string>
  unreadMessageCount?: number
}) {
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowFilter>('all')
  const [pendingQueueScroll, setPendingQueueScroll] = useState(0)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const actionQueueRef = useRef<HTMLElement | null>(null)
  const workflowTabsRef = useRef<HTMLDivElement | null>(null)
  const workflowTabRefs = useRef<Partial<Record<WorkflowFilter, HTMLButtonElement | null>>>({})
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const filteredRows = useMemo(
    () =>
      activeWorkflow === 'all'
        ? actionRows
        : actionRows.filter((item) => item.groups.includes(activeWorkflow)),
    [actionRows, activeWorkflow],
  )
  const counts: Record<WorkflowFilter, number> = {
    all: actionRows.length,
    checkout: actionRows.filter((item) => item.groups.includes('checkout')).length,
    rental: actionRows.filter((item) => item.groups.includes('rental')).length,
    document_review: actionRows.filter((item) => item.groups.includes('document_review')).length,
  }

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [activeWorkflow, actionRows.length])

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleCount),
    [filteredRows, visibleCount],
  )
  const hasMoreRows = visibleCount < filteredRows.length

  const emptyStateMessage = activeWorkflow === 'all' ? emptyMessage : filteredEmptyMessageByWorkflow[activeWorkflow]

  const toolbarWorkflows: WorkflowFilter[] = ['all', 'checkout', 'rental', 'document_review']

  useEffect(() => {
    if (pendingQueueScroll === 0) return

    const frame = window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      actionQueueRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      })
      setPendingQueueScroll(0)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeWorkflow, filteredRows.length, pendingQueueScroll])

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
    const container = workflowTabsRef.current
    const activeTab = workflowTabRefs.current[activeWorkflow]
    if (!container || !activeTab) return

    const frame = window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const containerRect = container.getBoundingClientRect()
      const tabRect = activeTab.getBoundingClientRect()
      const leftBuffer = 12
      const rightBuffer = 28

      let nextLeft: number | null = null

      if (tabRect.left < containerRect.left + leftBuffer) {
        nextLeft = container.scrollLeft - ((containerRect.left + leftBuffer) - tabRect.left)
      } else if (tabRect.right > containerRect.right - rightBuffer) {
        nextLeft = container.scrollLeft + (tabRect.right - (containerRect.right - rightBuffer))
      }

      if (nextLeft != null) {
        container.scrollTo({
          left: Math.max(0, nextLeft),
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        })
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeWorkflow])

  function handleSummaryMetricClick(workflow: Exclude<WorkflowFilter, 'all'>) {
    setActiveWorkflow((current) => (current === workflow ? 'all' : workflow))
    setPendingQueueScroll((current) => current + 1)
  }

  const emptyStateTitle = activeWorkflow === 'document_review' ? 'No documents awaiting review' : 'No actions in this view'

  return (
    <section
      id="action-queue"
      ref={actionQueueRef}
      className="scroll-mt-20 md:scroll-mt-10 overflow-hidden rounded-[var(--admin-radius-module)] border border-[var(--admin-border-default)] bg-[var(--admin-module)] shadow-[var(--admin-shadow-module)]"
    >
        <div className="border-b border-white/10 bg-[var(--admin-primary-navy)] px-4 py-4 text-white sm:px-5 md:px-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/68">Action Feed</p>
                <h2 className="mt-1 text-[17px] font-semibold leading-[1.2] text-white sm:text-[18px]">
                  Action Queue
                </h2>
                <p className="mt-1 text-[13px] font-normal leading-[1.4] text-white/74">
                  Latest operational actions for active admin follow-up.
                </p>
              </div>
              <p className="text-[12.5px] font-semibold text-white/80">
                Showing {visibleRows.length} of {filteredRows.length} actions
              </p>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
              <div className="relative">
                <div
                  ref={workflowTabsRef}
                  className="-mx-1 overflow-x-auto px-1 pb-1"
                >
                  <div className="flex min-w-max flex-nowrap items-center gap-2 sm:min-w-0 sm:flex-wrap">
                    {toolbarWorkflows.map((workflow) => (
                      <ToolbarChip
                        key={workflow}
                        buttonRef={(node: HTMLButtonElement | null) => {
                          workflowTabRefs.current[workflow] = node
                        }}
                        label={workflow === 'all' ? 'All' : workflowLabel(workflow)}
                        count={counts[workflow]}
                        active={activeWorkflow === workflow}
                        onClick={() => {
                          if (workflow === 'all') {
                            setActiveWorkflow('all')
                            return
                          }
                          handleSummaryMetricClick(workflow)
                        }}
                      />
                    ))}
                    <MessagesToolbarLink count={unreadMessageCount} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-3 py-2 sm:px-4 sm:py-3 md:px-5 md:py-4">
          {filteredRows.length > 0 ? (
            <div
              ref={listScrollRef}
              className="max-h-[calc(100vh-9.5rem)] overflow-y-auto sm:max-h-[calc(100vh-11.5rem)] lg:max-h-[calc(100vh-13.5rem)]"
            >
              <div className="flex flex-col gap-2 sm:gap-2.5">
                {visibleRows.map((item) => (
                  <QueueActionRow key={item.key} item={item} />
                ))}
              </div>
              {hasMoreRows ? <div ref={loadMoreRef} className="h-px" /> : null}
            </div>
          ) : (
            <div className="rounded-[var(--admin-radius-card)] border border-dashed border-[var(--admin-border-default)] bg-[var(--admin-inset)] px-5 py-10 text-center">
              <p className="text-[15px] font-medium text-[var(--admin-text)]">{emptyStateTitle}</p>
              <p className="mt-2 text-[14px] leading-[1.45] text-[var(--admin-text-secondary)]">{emptyStateMessage}</p>
            </div>
          )}
        </div>
    </section>
  )
}
