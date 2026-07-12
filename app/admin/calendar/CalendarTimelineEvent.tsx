'use client'

import { formatCalendarTime } from '@/lib/utils/calendar-format'
import { getEventSegmentForSydneyDate } from './calendar-range'
import type { AdminCalendarEvent } from './calendar-types'

function getTone(type: AdminCalendarEvent['eventType']) {
  if (type === 'checkout') return 'border-blue-200 bg-blue-50 text-blue-950'
  if (type === 'booking') return 'border-emerald-200 bg-emerald-50 text-emerald-950'
  if (type === 'maintenance') return 'border-amber-200 bg-amber-50 text-amber-950'
  if (type === 'blocked') return 'border-rose-200 bg-rose-50 text-rose-950'
  if (type === 'buffer') return 'border-slate-200 bg-slate-100 text-slate-900'
  return 'border-sky-200 bg-sky-50 text-sky-950'
}

function getIcon(type: AdminCalendarEvent['eventType']) {
  if (type === 'checkout') return 'flight_takeoff'
  if (type === 'booking') return 'event_available'
  if (type === 'maintenance') return 'build'
  if (type === 'blocked') return 'block'
  if (type === 'buffer') return 'schedule'
  return 'event'
}

function getTitle(event: AdminCalendarEvent) {
  if (event.eventType === 'maintenance') return event.publicLabel || event.title
  if (event.eventType === 'blocked') return event.publicLabel || 'Blocked time'
  if (event.eventType === 'buffer') return 'Buffer'
  return event.customerName || event.title
}

function getAccessibleLabel(event: AdminCalendarEvent, dateKey: string) {
  const segment = getEventSegmentForSydneyDate(event, dateKey)
  const start = segment ? formatCalendarTime(segment.segmentStartIso) : formatCalendarTime(event.startIso)
  const end = segment ? formatCalendarTime(segment.segmentEndIso) : formatCalendarTime(event.endIso)
  return `Open ${event.eventTypeLabel.toLowerCase()} for ${getTitle(event)} on ${event.aircraftRegistration}, ${start} to ${end}`
}

export default function CalendarTimelineEvent({
  event,
  dateKey,
  layout,
  onOpen,
}: {
  event: AdminCalendarEvent
  dateKey: string
  layout: {
    top: number
    height: number
    leftPct: number
    widthPct: number
  }
  onOpen: (event: AdminCalendarEvent, trigger: HTMLButtonElement | null) => void
}) {
  const segment = getEventSegmentForSydneyDate(event, dateKey)
  const compact = layout.height < 56

  return (
    <button
      type="button"
      onClick={(openEvent) => onOpen(event, openEvent.currentTarget)}
      aria-label={getAccessibleLabel(event, dateKey)}
      className={`absolute overflow-hidden rounded-[12px] border-l-4 px-2.5 py-2 text-left shadow-[0_8px_16px_rgba(15,30,52,0.08)] transition-[box-shadow,transform] hover:shadow-[0_12px_22px_rgba(15,30,52,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30 active:translate-y-[1px] ${getTone(event.eventType)}`}
      style={{
        top: `${layout.top}px`,
        height: `${layout.height}px`,
        left: `calc(${layout.leftPct}% + 6px)`,
        width: `calc(${layout.widthPct}% - 10px)`,
      }}
    >
      <div className="flex items-start gap-1.5">
        <span className="material-symbols-outlined mt-[1px] text-[14px]" aria-hidden="true">
          {getIcon(event.eventType)}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`truncate ${compact ? 'text-[11.5px] font-semibold' : 'text-[12.5px] font-semibold'}`}>
            {getTitle(event)}
          </div>
          <div className={`${compact ? 'text-[10.5px]' : 'text-[11px]'} opacity-80`}>
            {segment
              ? `${formatCalendarTime(segment.segmentStartIso)} - ${formatCalendarTime(segment.segmentEndIso)}`
              : `${formatCalendarTime(event.startIso)} - ${formatCalendarTime(event.endIso)}`}
          </div>
          {!compact && event.eventType !== 'booking' && event.eventType !== 'checkout' ? (
            <div className="truncate text-[10.5px] opacity-75">
              {event.eventTypeLabel}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  )
}
