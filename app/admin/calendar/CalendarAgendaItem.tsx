'use client'

import { formatCalendarTime } from '@/lib/utils/calendar-format'
import { getEventSegmentForSydneyDate } from './calendar-range'
import type { AdminCalendarEvent } from './calendar-types'

function getTone(type: AdminCalendarEvent['eventType']) {
  if (type === 'checkout') {
    return {
      rail: 'bg-blue-500',
      badge: 'bg-blue-50 text-blue-900 border-blue-200',
      icon: 'text-blue-700',
    }
  }
  if (type === 'booking') {
    return {
      rail: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      icon: 'text-emerald-700',
    }
  }
  if (type === 'maintenance') {
    return {
      rail: 'bg-amber-500',
      badge: 'bg-amber-50 text-amber-900 border-amber-200',
      icon: 'text-amber-700',
    }
  }
  if (type === 'blocked') {
    return {
      rail: 'bg-rose-500',
      badge: 'bg-rose-50 text-rose-900 border-rose-200',
      icon: 'text-rose-700',
    }
  }
  if (type === 'buffer') {
    return {
      rail: 'bg-slate-500',
      badge: 'bg-slate-100 text-slate-900 border-slate-200',
      icon: 'text-slate-700',
    }
  }
  return {
    rail: 'bg-sky-500',
    badge: 'bg-sky-50 text-sky-900 border-sky-200',
    icon: 'text-sky-700',
  }
}

function getIcon(type: AdminCalendarEvent['eventType']) {
  if (type === 'checkout') return 'flight_takeoff'
  if (type === 'booking') return 'event_available'
  if (type === 'maintenance') return 'build'
  if (type === 'blocked') return 'block'
  if (type === 'buffer') return 'schedule'
  return 'event'
}

function getPrimaryTitle(event: AdminCalendarEvent) {
  if (event.eventType === 'maintenance') return event.publicLabel || event.title
  if (event.eventType === 'blocked') return event.publicLabel || event.title || 'Blocked time'
  return event.customerName || event.publicLabel || event.title
}

function getTimeSummary(event: AdminCalendarEvent, dateKey: string) {
  const segment = getEventSegmentForSydneyDate(event, dateKey)
  if (!segment) return 'Time unavailable'

  if (segment.continuesFromPreviousDay && segment.continuesIntoNextDay) {
    return 'Continues all day'
  }
  if (segment.continuesFromPreviousDay) {
    return `Continues until ${formatCalendarTime(segment.segmentEndIso)}`
  }
  if (segment.continuesIntoNextDay) {
    return `Starts ${formatCalendarTime(segment.segmentStartIso)} · continues later`
  }
  return `${formatCalendarTime(segment.segmentStartIso)} - ${formatCalendarTime(segment.segmentEndIso)}`
}

function getContinuationLabel(event: AdminCalendarEvent, dateKey: string) {
  const segment = getEventSegmentForSydneyDate(event, dateKey)
  if (!segment) return null
  if (segment.continuesFromPreviousDay && segment.continuesIntoNextDay) return 'Started earlier and continues later'
  if (segment.continuesFromPreviousDay) return 'Started on an earlier date'
  if (segment.continuesIntoNextDay) return 'Continues into the next date'
  return null
}

function getAccessibleLabel(event: AdminCalendarEvent, dateKey: string) {
  const primary = getPrimaryTitle(event)
  const timing = getTimeSummary(event, dateKey)
  return `Open ${event.eventTypeLabel.toLowerCase()} details for ${primary}, ${timing}, ${event.aircraftRegistration}`
}

export default function CalendarAgendaItem({
  event,
  dateKey,
  onOpen,
}: {
  event: AdminCalendarEvent
  dateKey: string
  onOpen: (event: AdminCalendarEvent, trigger: HTMLButtonElement | null) => void
}) {
  const tone = getTone(event.eventType)
  const continuationLabel = getContinuationLabel(event, dateKey)
  const secondaryStatus = event.statusLabel && event.statusLabel !== event.eventTypeLabel ? event.statusLabel : null
  const title = getPrimaryTitle(event)

  return (
    <button
      type="button"
      onClick={(openEvent) => onOpen(event, openEvent.currentTarget)}
      aria-label={getAccessibleLabel(event, dateKey)}
      className="group relative flex w-full items-start gap-3 overflow-hidden rounded-[14px] border border-[rgba(12,35,64,0.12)] bg-white px-3.5 py-3 text-left shadow-[0_10px_20px_rgba(15,30,52,0.05)] transition-[transform,box-shadow,border-color,background-color] hover:border-[rgba(26,79,214,0.20)] hover:bg-[#fbfdff] hover:shadow-[0_14px_26px_rgba(15,30,52,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30 active:translate-y-[1px]"
    >
      <span className={`absolute inset-y-0 left-0 w-[4px] ${tone.rail}`} aria-hidden="true" />
      <span
        className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border ${tone.badge}`}
        aria-hidden="true"
      >
        <span className={`material-symbols-outlined text-[18px] ${tone.icon}`}>{getIcon(event.eventType)}</span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] ${tone.badge}`}>
            {event.eventTypeLabel}
          </span>
          {event.warningFlags.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
              <span className="material-symbols-outlined text-[13px]" aria-hidden="true">warning</span>
              Warning
            </span>
          ) : null}
          {secondaryStatus ? (
            <span className="inline-flex rounded-full border border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.92)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#4b6390]">
              {secondaryStatus}
            </span>
          ) : null}
        </span>

        <span
          className="mt-2 block text-[14.5px] font-semibold leading-[1.25] text-[#12284a]"
          style={{
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
          }}
        >
          {title}
        </span>

        <span className="mt-2 flex items-start gap-2 text-[13.5px] font-semibold leading-[1.25] text-[#152d5a]">
          <span className="material-symbols-outlined mt-[1px] text-[15px] text-[#4b6390]" aria-hidden="true">
            schedule
          </span>
          <span>{getTimeSummary(event, dateKey)}</span>
        </span>

        <span className="mt-1.5 flex items-start gap-2 text-[12.5px] text-[#4b6390]">
          <span className="material-symbols-outlined mt-[1px] text-[15px] text-[#64748b]" aria-hidden="true">
            flight_takeoff
          </span>
          <span className="min-w-0">
            <span className="font-semibold text-[#152d5a]">{event.aircraftRegistration}</span>
            {event.aircraftModel ? <span> · {event.aircraftModel}</span> : null}
          </span>
        </span>

        {continuationLabel ? (
          <span className="mt-1 block text-[11.5px] text-[#64748b]">
            {continuationLabel}
          </span>
        ) : null}
      </span>

      <span className="material-symbols-outlined mt-3 shrink-0 text-[20px] text-[#64748b] transition-colors group-hover:text-[#152d5a]" aria-hidden="true">
        chevron_right
      </span>
    </button>
  )
}
