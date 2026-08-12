'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCalendarDateTime } from '@/lib/utils/calendar-format'
import { formatLongDateFromDateKey } from './calendar-range'
import type { AdminCalendarEvent } from './calendar-types'

type DrawerState =
  | { mode: 'event'; event: AdminCalendarEvent }
  | { mode: 'day'; dateKey: string; events: AdminCalendarEvent[]; scopeLabel?: string | null }

function getEventTypeIcon(type: AdminCalendarEvent['eventType']) {
  if (type === 'checkout') return 'flight_takeoff'
  if (type === 'booking') return 'event_available'
  if (type === 'maintenance') return 'build'
  if (type === 'blocked') return 'block'
  if (type === 'buffer') return 'schedule'
  return 'event'
}

function getEventTypeAccent(type: AdminCalendarEvent['eventType']) {
  if (type === 'checkout') return { iconBg: 'bg-[#fff7e8]', iconText: 'text-[#b45309]', bar: 'bg-[#f59e0b]' }
  if (type === 'booking') return { iconBg: 'bg-[#eef5ff]', iconText: 'text-[#1a4fd6]', bar: 'bg-[#1a4fd6]' }
  if (type === 'maintenance') return { iconBg: 'bg-[#fff4ec]', iconText: 'text-[#c2410c]', bar: 'bg-[#ea580c]' }
  if (type === 'blocked') return { iconBg: 'bg-[#fef2f2]', iconText: 'text-[#b91c1c]', bar: 'bg-[#ef4444]' }
  if (type === 'buffer') return { iconBg: 'bg-[#f1f5f9]', iconText: 'text-[#64748b]', bar: 'bg-[#94a3b8]' }
  return { iconBg: 'bg-[#eef5ff]', iconText: 'text-[#1a4fd6]', bar: 'bg-[#1a4fd6]' }
}

function focusableElements(container: HTMLElement | null) {
  if (!container) return []
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-[rgba(12,35,64,0.06)] py-2.5 last:border-b-0 sm:grid-cols-[140px_minmax(0,1fr)]">
      <dt className="text-[12px] font-medium text-[#64748b]">{label}</dt>
      <dd className="text-[13px] font-semibold text-[#152d5a]">{value}</dd>
    </div>
  )
}

export default function CalendarEventDrawer({
  state,
  onClose,
  onOpenEvent,
  initialFocusTarget,
}: {
  state: DrawerState | null
  onClose: () => void
  onOpenEvent: (event: AdminCalendarEvent, trigger: HTMLButtonElement | null) => void
  initialFocusTarget?: 'close' | 'heading'
}) {
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!state) return
    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const main = document.querySelector('main') as HTMLElement | null
    const previousMainOverflow = main?.style.overflow ?? ''
    if (main) main.style.overflow = 'hidden'

    const focusTarget = initialFocusTarget === 'heading' ? headingRef.current : closeButtonRef.current
    focusTarget?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusables = focusableElements(drawerRef.current)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousBodyOverflow
      if (main) main.style.overflow = previousMainOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [state, onClose, initialFocusTarget])

  const content = useMemo(() => {
    if (!state) return null

    if (state.mode === 'day') {
      return (
        <>
          <div className="border-b border-[rgba(12,35,64,0.08)] px-6 pb-5 pt-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748b]">Events on</p>
            <h2
              id="calendar-drawer-title"
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 text-[22px] font-[650] tracking-tight text-[#152d5a]"
            >
              {formatLongDateFromDateKey(state.dateKey)}
            </h2>
            {state.scopeLabel ? (
              <p className="mt-1 text-[13px] text-[#4b6390]">{state.scopeLabel}</p>
            ) : (
              <p className="mt-1 text-[13px] text-[#4b6390]">
                {state.events.length} scheduled {state.events.length === 1 ? 'item' : 'items'}
              </p>
            )}
          </div>

          <div className="max-h-[min(60vh,480px)] overflow-y-auto px-6 py-5">
            <div className="space-y-2.5">
              {state.events.map((event) => {
                const accent = getEventTypeAccent(event.eventType)
                return (
                  <button
                    key={event.eventId}
                    type="button"
                    onClick={(openEvent) => onOpenEvent(event, openEvent.currentTarget)}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-[rgba(12,35,64,0.10)] bg-[#fbfdff] px-3.5 py-3 text-left transition-all hover:border-[#1a4fd6]/25 hover:bg-white hover:shadow-[0_10px_24px_rgba(15,30,52,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
                  >
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent.iconBg} ${accent.iconText}`}
                      aria-hidden="true"
                    >
                      <span className="material-symbols-outlined text-[18px]">{getEventTypeIcon(event.eventType)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-[#152d5a]">{event.title}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-[#4b6390]">
                        {event.aircraftRegistration}
                        {event.aircraftModel ? ` · ${event.aircraftModel}` : ''}
                      </span>
                    </span>
                    <span className="material-symbols-outlined text-[18px] text-[#94a3b8] transition-colors group-hover:text-[#1a4fd6]" aria-hidden="true">
                      chevron_right
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )
    }

    const event = state.event
    const accent = getEventTypeAccent(event.eventType)
    const actions = [
      event.bookingHref ? { href: event.bookingHref, label: 'Open booking', icon: 'open_in_new', kind: 'internal' as const } : null,
      event.customerHref ? { href: event.customerHref, label: 'Open customer', icon: 'person', kind: 'internal' as const } : null,
      event.aircraftHref ? { href: event.aircraftHref, label: 'Open aircraft', icon: 'flight', kind: 'internal' as const } : null,
      event.primaryHref === event.maintenanceHref && event.maintenanceHref
        ? { href: event.maintenanceHref, label: 'Open maintenance', icon: 'build', kind: 'internal' as const }
        : null,
      event.customerEmail
        ? { href: `mailto:${event.customerEmail}`, label: 'Email customer', icon: 'mail', kind: 'external' as const }
        : null,
      event.customerPhone
        ? { href: `tel:${event.customerPhone.replace(/\s+/g, '')}`, label: 'Call customer', icon: 'call', kind: 'external' as const }
        : null,
    ].filter(Boolean) as Array<{ href: string; label: string; icon: string; kind: 'internal' | 'external' }>

    const primaryAction = actions[0] ?? null
    const secondaryActions = actions.slice(1)

    return (
      <>
        <div className={`h-1.5 w-full ${accent.bar}`} />

        <div className="border-b border-[rgba(12,35,64,0.08)] px-6 pb-5 pt-5">
          <div className="flex items-start gap-4">
            <span
              className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${accent.iconBg} ${accent.iconText}`}
              aria-hidden="true"
            >
              <span className="material-symbols-outlined text-[22px]">{getEventTypeIcon(event.eventType)}</span>
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748b]">{event.eventTypeLabel}</p>
                <span className="inline-flex rounded-full border border-[rgba(12,35,64,0.10)] bg-[#f7fbff] px-2.5 py-0.5 text-[11px] font-semibold text-[#152d5a]">
                  {event.statusLabel || event.eventTypeLabel}
                </span>
              </div>
              <h2
                id="calendar-drawer-title"
                ref={headingRef}
                tabIndex={-1}
                className="mt-1.5 text-[22px] font-[650] leading-tight tracking-tight text-[#152d5a]"
              >
                {event.customerName || event.publicLabel || event.title}
              </h2>
              <p className="mt-1 text-[13px] text-[#4b6390]">
                {event.aircraftRegistration}
                {event.aircraftModel ? ` · ${event.aircraftModel}` : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="max-h-[min(58vh,520px)] overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <section>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748b]">Core details</p>
              <dl className="rounded-2xl border border-[rgba(12,35,64,0.08)] bg-[#fbfdff] px-4">
                {event.customerName ? <DetailRow label="Customer" value={event.customerName} /> : null}
                <DetailRow label="Start" value={formatCalendarDateTime(event.startIso)} />
                <DetailRow label="End" value={formatCalendarDateTime(event.endIso)} />
                {event.durationMinutes != null ? (
                  <DetailRow label="Duration" value={`${event.durationMinutes} minutes`} />
                ) : null}
                {event.bookingType ? <DetailRow label="Booking type" value={event.bookingType} /> : null}
                {event.publicLabel ? <DetailRow label="Public label" value={event.publicLabel} /> : null}
                {event.internalReason ? <DetailRow label="Internal reason" value={event.internalReason} /> : null}
                {event.isMultiDay ? <DetailRow label="Schedule span" value="Multi-day or overnight event" /> : null}
              </dl>
            </section>

            {(event.bookingStatus || event.paymentStatus || event.checkoutStatus || event.warningFlags.length > 0) ? (
              <section>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748b]">Operational state</p>
                <dl className="rounded-2xl border border-[rgba(12,35,64,0.08)] bg-[#fbfdff] px-4">
                  {event.bookingStatus ? (
                    <DetailRow label="Booking status" value={event.bookingStatus.replace(/_/g, ' ')} />
                  ) : null}
                  {event.paymentStatus ? (
                    <DetailRow label="Payment status" value={event.paymentStatus.replace(/_/g, ' ')} />
                  ) : null}
                  {event.checkoutStatus ? (
                    <DetailRow label="Checkout status" value={event.checkoutStatus.replace(/_/g, ' ')} />
                  ) : null}
                  {event.warningFlags.length > 0 ? (
                    <DetailRow
                      label="Warnings"
                      value={event.warningFlags.map((flag) => flag.replace(/_/g, ' ')).join(', ')}
                    />
                  ) : null}
                </dl>
              </section>
            ) : null}
          </div>
        </div>

        {actions.length > 0 ? (
          <div className="border-t border-[rgba(12,35,64,0.08)] bg-[#f8fbff] px-6 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {primaryAction ? (
                primaryAction.kind === 'internal' ? (
                  <Link
                    href={primaryAction.href}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1a4fd6] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#1949c3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/35 sm:flex-none"
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{primaryAction.icon}</span>
                    {primaryAction.label}
                  </Link>
                ) : (
                  <a
                    href={primaryAction.href}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1a4fd6] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#1949c3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/35 sm:flex-none"
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{primaryAction.icon}</span>
                    {primaryAction.label}
                  </a>
                )
              ) : null}

              {secondaryActions.map((action) =>
                action.kind === 'internal' ? (
                  <Link
                    key={`${action.label}-${action.href}`}
                    href={action.href}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(12,35,64,0.12)] bg-white px-3.5 text-[13px] font-semibold text-[#152d5a] transition-colors hover:bg-[#eef5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
                  >
                    <span className="material-symbols-outlined text-[17px] text-[#4b6390]" aria-hidden="true">{action.icon}</span>
                    {action.label}
                  </Link>
                ) : (
                  <a
                    key={`${action.label}-${action.href}`}
                    href={action.href}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(12,35,64,0.12)] bg-white px-3.5 text-[13px] font-semibold text-[#152d5a] transition-colors hover:bg-[#eef5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
                  >
                    <span className="material-symbols-outlined text-[17px] text-[#4b6390]" aria-hidden="true">{action.icon}</span>
                    {action.label}
                  </a>
                ),
              )}
            </div>
          </div>
        ) : null}
      </>
    )
  }, [state, onOpenEvent])

  if (!state || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 sm:p-6" aria-hidden={false}>
      <div
        className="absolute inset-0 bg-[rgba(8,16,32,0.48)] backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-drawer-title"
        className="relative z-10 flex max-h-[min(92dvh,760px)] w-full max-w-[560px] flex-col overflow-hidden rounded-[24px] border border-[rgba(12,35,64,0.10)] bg-white shadow-[0_28px_80px_rgba(8,16,32,0.28)] focus:outline-none"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close calendar details"
          className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(12,35,64,0.10)] bg-white/95 text-[#152d5a] shadow-sm transition-colors hover:bg-[#f7fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
        </button>

        {content}
      </div>
    </div>,
    document.body,
  )
}
