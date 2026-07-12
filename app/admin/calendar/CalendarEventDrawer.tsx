'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef } from 'react'
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

function focusableElements(container: HTMLElement | null) {
  if (!container) return []
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
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

  useEffect(() => {
    if (!state) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

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
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [state, onClose, initialFocusTarget])

  const content = useMemo(() => {
    if (!state) return null
    if (state.mode === 'day') {
      return (
        <>
          <div className="border-b border-[rgba(12,35,64,0.08)] px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748b]">Events on</p>
            <h2 id="calendar-drawer-title" ref={headingRef} tabIndex={-1} className="mt-1 text-[18px] font-[650] text-[#152d5a]">
              {formatLongDateFromDateKey(state.dateKey)}
            </h2>
            {state.scopeLabel ? (
              <p className="mt-1 text-[12px] text-[#4b6390]">{state.scopeLabel}</p>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="space-y-3">
              {state.events.map((event) => (
                <button
                  key={event.eventId}
                  type="button"
                  onClick={(openEvent) => onOpenEvent(event, openEvent.currentTarget)}
                  className="flex w-full items-start gap-3 rounded-[12px] border border-[rgba(12,35,64,0.10)] bg-white px-3.5 py-3 text-left transition-colors hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
                >
                  <span className="material-symbols-outlined text-[18px] text-[#1a4fd6]" aria-hidden="true">
                    {getEventTypeIcon(event.eventType)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[#152d5a]">{event.title}</span>
                    <span className="mt-1 block text-[12px] text-[#4b6390]">{event.aircraftRegistration}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )
    }

    const event = state.event
    const actions = [
      event.bookingHref ? { href: event.bookingHref, label: 'Open booking', kind: 'internal' as const } : null,
      event.customerHref ? { href: event.customerHref, label: 'Open customer', kind: 'internal' as const } : null,
      event.aircraftHref ? { href: event.aircraftHref, label: 'Open aircraft', kind: 'internal' as const } : null,
      event.primaryHref === event.maintenanceHref && event.maintenanceHref
        ? { href: event.maintenanceHref, label: 'Open maintenance', kind: 'internal' as const }
        : null,
      event.customerEmail ? { href: `mailto:${event.customerEmail}`, label: 'Email customer', kind: 'external' as const } : null,
      event.customerPhone
        ? { href: `tel:${event.customerPhone.replace(/\s+/g, '')}`, label: 'Call customer', kind: 'external' as const }
        : null,
    ].filter(Boolean) as Array<{ href: string; label: string; kind: 'internal' | 'external' }>

    return (
      <>
        <div className="border-b border-[rgba(12,35,64,0.08)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#1a4fd6]" aria-hidden="true">
                  {getEventTypeIcon(event.eventType)}
                </span>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748b]">{event.eventTypeLabel}</p>
              </div>
              <h2 id="calendar-drawer-title" ref={headingRef} tabIndex={-1} className="mt-2 text-[18px] font-[650] leading-[1.25] text-[#152d5a]">
                {event.customerName || event.publicLabel || event.title}
              </h2>
              <p className="mt-1 text-[13px] text-[#4b6390]">
                {event.aircraftRegistration}{event.aircraftModel ? ` · ${event.aircraftModel}` : ''}
              </p>
            </div>
            <span className="inline-flex shrink-0 rounded-full border border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.92)] px-2.5 py-1 text-[11px] font-semibold text-[#152d5a]">
              {event.statusLabel || event.eventTypeLabel}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-5">
            <section className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748b]">Core details</p>
              <div className="space-y-2 text-[13px] text-[#152d5a]">
                {event.customerName ? <p><span className="font-semibold">Customer:</span> {event.customerName}</p> : null}
                <p><span className="font-semibold">Start:</span> {formatCalendarDateTime(event.startIso)}</p>
                <p><span className="font-semibold">End:</span> {formatCalendarDateTime(event.endIso)}</p>
                {event.durationMinutes != null ? <p><span className="font-semibold">Duration:</span> {event.durationMinutes} minutes</p> : null}
                {event.bookingType ? <p><span className="font-semibold">Booking type:</span> {event.bookingType}</p> : null}
                {event.publicLabel ? <p><span className="font-semibold">Public label:</span> {event.publicLabel}</p> : null}
                {event.internalReason ? <p><span className="font-semibold">Internal reason:</span> {event.internalReason}</p> : null}
                {event.isMultiDay ? <p><span className="font-semibold">Schedule span:</span> Multi-day or overnight event</p> : null}
              </div>
            </section>

            {(event.bookingStatus || event.paymentStatus || event.checkoutStatus || event.warningFlags.length > 0) ? (
              <section className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748b]">Operational state</p>
                <div className="space-y-2 text-[13px] text-[#152d5a]">
                  {event.bookingStatus ? <p><span className="font-semibold">Booking status:</span> {event.bookingStatus.replace(/_/g, ' ')}</p> : null}
                  {event.paymentStatus ? <p><span className="font-semibold">Payment status:</span> {event.paymentStatus.replace(/_/g, ' ')}</p> : null}
                  {event.checkoutStatus ? <p><span className="font-semibold">Checkout status:</span> {event.checkoutStatus.replace(/_/g, ' ')}</p> : null}
                  {event.warningFlags.length > 0 ? (
                    <p><span className="font-semibold">Warnings:</span> {event.warningFlags.map((flag) => flag.replace(/_/g, ' ')).join(', ')}</p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {actions.length > 0 ? (
              <section className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748b]">Actions</p>
                <div className="flex flex-wrap gap-2 pb-[max(env(safe-area-inset-bottom),0px)]">
                  {actions.map((action, index) => (
                    action.kind === 'internal' ? (
                      <Link
                        key={`${action.label}-${action.href}`}
                        href={action.href}
                        className={`inline-flex min-h-10 items-center justify-center rounded-[10px] px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30 ${
                          index === 0
                            ? 'border border-[#1a4fd6]/18 bg-[#1a4fd6] text-white hover:bg-[#1949c3]'
                            : 'border border-[rgba(12,35,64,0.10)] bg-white text-[#152d5a] hover:bg-[#f7fbff]'
                        }`}
                      >
                        {action.label}
                      </Link>
                    ) : (
                      <a
                        key={`${action.label}-${action.href}`}
                        href={action.href}
                        className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white px-3.5 text-[13px] font-semibold text-[#152d5a] transition-colors hover:bg-[#f7fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
                      >
                        {action.label}
                      </a>
                    )
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </>
    )
  }, [state, onOpenEvent])

  if (!state) return null

  return (
    <div className="fixed inset-0 z-50" aria-hidden={false}>
      <div className="absolute inset-0 bg-[rgba(12,23,40,0.26)] backdrop-blur-[1px]" onClick={onClose} />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-drawer-title"
        className="absolute inset-x-0 bottom-0 flex max-h-[96dvh] w-full flex-col rounded-t-[24px] border border-[rgba(12,35,64,0.10)] bg-white shadow-[0_-12px_36px_rgba(15,30,52,0.16)] focus:outline-none lg:inset-y-0 lg:right-0 lg:top-0 lg:max-h-none lg:max-w-[460px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-[0_24px_48px_rgba(15,30,52,0.18)]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-end rounded-t-[24px] bg-white px-4 pt-4 lg:rounded-none">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close calendar details"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(12,35,64,0.10)] bg-white text-[#152d5a] transition-colors hover:bg-[#f7fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
          </button>
        </div>
        {content}
      </div>
    </div>
  )
}
