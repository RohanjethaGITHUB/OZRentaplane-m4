'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AdminStatusBadge } from './components/AdminUi'
import type { ActionItem } from './page'

type WorkflowFilter = 'all' | 'checkout' | 'rental' | 'document_review'

function formatRelativeAge(timestamp: string | null) {
  if (!timestamp) return 'Unknown'

  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = Math.max(0, now - then)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < hour) {
    const mins = Math.max(1, Math.floor(diff / minute))
    return `${mins} minute${mins === 1 ? '' : 's'}`
  }

  if (diff < day) {
    const hours = Math.floor(diff / hour)
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  const days = Math.floor(diff / day)
  return `${days} day${days === 1 ? '' : 's'}`
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
  const customerLabel = item.customerLabel || 'Customer'

  return (
    <article className="group">
      <Link
        href={item.href}
        aria-label={`${item.nextStep}: ${item.title}`}
        className="block cursor-pointer rounded-[var(--admin-radius-row)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-canvas)]"
      >
        <div className="rounded-[var(--admin-radius-row)] bg-[var(--admin-row)] px-4 py-[14px] transition-all group-hover:bg-[var(--admin-row-hover)] group-hover:shadow-[var(--admin-shadow-row-hover)] group-active:bg-[var(--admin-row-selected)] group-focus-visible:bg-[var(--admin-row-hover)] group-focus-visible:shadow-[var(--admin-shadow-row-hover)] sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <AdminStatusBadge label={item.badge} tone={item.badgeTone} />
            {item.aggregateOnly ? <AdminStatusBadge label="Aggregate" tone="neutral" /> : null}
          </div>

          <div className="mt-3 lg:hidden">
            <h3 className="text-[15px] font-semibold leading-[1.3] text-[var(--admin-text)]">{item.title}</h3>
            <p className="mt-2 text-[13px] font-normal leading-[1.4] text-[var(--admin-text-secondary)]">{item.description}</p>
            {item.issueLabel ? <p className="mt-2 text-[13px] font-medium text-[var(--admin-text-secondary)]">{item.issueLabel}</p> : null}
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-t border-[var(--admin-divider)] pt-3">
              <MetadataBlock label="Customer" className="min-w-0">
                <span className="block truncate font-semibold text-[14px] text-[var(--admin-text)]" title={customerLabel}>
                  {customerLabel}
                </span>
              </MetadataBlock>
              <MetadataBlock label="Received" className="text-right">
                <span>{formatRelativeAge(item.receivedAt)}</span>
              </MetadataBlock>
            </div>
          </div>

          <div className="hidden lg:grid lg:grid-cols-[minmax(0,3.9fr)_minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start lg:gap-x-6">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--admin-text-muted)]">Action</p>
              <h3 className="text-[15px] font-semibold leading-[1.3] text-[var(--admin-text)]">{item.title}</h3>
              <p className="mt-1.5 max-w-[34rem] text-[13px] font-normal leading-[1.4] text-[var(--admin-text-secondary)]">
                {item.description}
              </p>
              {item.issueLabel ? <p className="mt-2 text-[13px] font-medium text-[var(--admin-text-secondary)]">{item.issueLabel}</p> : null}
            </div>

            <MetadataBlock label="Customer" className="min-w-0">
              <span className="block truncate font-semibold text-[14px] text-[var(--admin-text)]" title={customerLabel}>
                {customerLabel}
              </span>
            </MetadataBlock>

            <MetadataBlock label="Received" className="min-w-0">
              <span>{formatRelativeAge(item.receivedAt)}</span>
            </MetadataBlock>
          </div>
        </div>
      </Link>
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
  const actionQueueRef = useRef<HTMLElement | null>(null)
  const workflowTabsRef = useRef<HTMLDivElement | null>(null)
  const workflowTabRefs = useRef<Partial<Record<WorkflowFilter, HTMLButtonElement | null>>>({})

  const filteredRows =
    activeWorkflow === 'all'
      ? actionRows
      : actionRows.filter((item) => item.groups.includes(activeWorkflow))
  const counts: Record<WorkflowFilter, number> = {
    all: actionRows.length,
    checkout: actionRows.filter((item) => item.groups.includes('checkout')).length,
    rental: actionRows.filter((item) => item.groups.includes('rental')).length,
    document_review: actionRows.filter((item) => item.groups.includes('document_review')).length,
  }

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
            <div className="divide-y divide-[var(--admin-divider)]">
              {filteredRows.map((item) => (
                <QueueActionRow key={item.key} item={item} />
              ))}
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
