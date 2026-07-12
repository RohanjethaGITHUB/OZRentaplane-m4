'use client'

import { formatCalendarTime } from '@/lib/utils/calendar-format'
import { formatLongDateFromDateKey, getEventSegmentForSydneyDate } from './calendar-range'
import type { AdminCalendarEvent } from './calendar-types'

function toneClass(type: AdminCalendarEvent['eventType']) {
  if (type === 'checkout') return 'border-blue-200 bg-blue-50 text-blue-950'
  if (type === 'booking') return 'border-emerald-200 bg-emerald-50 text-emerald-950'
  if (type === 'maintenance') return 'border-amber-200 bg-amber-50 text-amber-950'
  if (type === 'blocked') return 'border-rose-200 bg-rose-50 text-rose-950'
  if (type === 'buffer') return 'border-slate-200 bg-slate-100 text-slate-900'
  return 'border-sky-200 bg-sky-50 text-sky-950'
}

function iconName(type: AdminCalendarEvent['eventType']) {
  if (type === 'checkout') return 'flight_takeoff'
  if (type === 'booking') return 'event_available'
  if (type === 'maintenance') return 'build'
  if (type === 'blocked') return 'block'
  if (type === 'buffer') return 'schedule'
  return 'event'
}

function getTimeLabel(event: AdminCalendarEvent, dayKey: string) {
  const segment = getEventSegmentForSydneyDate(event, dayKey)
  if (!segment) return ''
  if (segment.continuesFromPreviousDay && segment.continuesIntoNextDay) return 'Continues'
  if (segment.continuesFromPreviousDay) return `Until ${formatCalendarTime(segment.segmentEndIso)}`
  if (segment.continuesIntoNextDay) return `${formatCalendarTime(segment.segmentStartIso)} onward`
  if (event.eventType === 'buffer') return `${formatCalendarTime(segment.segmentStartIso)}-${formatCalendarTime(segment.segmentEndIso)}`
  return formatCalendarTime(segment.segmentStartIso)
}

function getPrimaryLine(event: AdminCalendarEvent, dayKey: string) {
  const timeLabel = getTimeLabel(event, dayKey)
  if (event.eventType === 'checkout' || event.eventType === 'booking') {
    return `${timeLabel ? `${timeLabel} ` : ''}${event.customerName || event.title}`
  }
  if (event.eventType === 'maintenance') {
    return `${timeLabel ? `${timeLabel} ` : ''}${event.publicLabel || event.title}`
  }
  if (event.eventType === 'blocked') {
    return `${timeLabel ? `${timeLabel} ` : ''}${event.publicLabel || 'Blocked time'}`
  }
  if (event.eventType === 'buffer') {
    return `${event.title}${timeLabel ? ` ${timeLabel}` : ''}`
  }
  return `${timeLabel ? `${timeLabel} ` : ''}${event.title}`
}

function getSecondaryLine(event: AdminCalendarEvent) {
  if (event.eventType === 'maintenance' && event.publicLabel && event.publicLabel !== event.title) {
    return `${event.aircraftRegistration} · ${event.publicLabel}`
  }
  return event.aircraftRegistration
}

function getAccessibleLabel(event: AdminCalendarEvent) {
  const subject =
    event.customerName ||
    event.publicLabel ||
    event.title
  return `Open ${event.eventTypeLabel.toLowerCase()} for ${subject} on ${event.aircraftRegistration} from ${formatLongDateFromDateKey(event.startSydneyDateKey)} to ${formatLongDateFromDateKey(event.endSydneyDateKey)}`
}

export default function CalendarEventChip({
  event,
  dayKey,
  onOpen,
}: {
  event: AdminCalendarEvent
  dayKey: string
  onOpen: (event: AdminCalendarEvent, trigger: HTMLButtonElement | null) => void
}) {
  return (
    <button
      type="button"
      onClick={(openEvent) => {
        openEvent.stopPropagation()
        onOpen(event, openEvent.currentTarget)
      }}
      className={`group flex w-full flex-col items-start gap-0.5 rounded-[8px] border px-2 py-1.5 text-left transition-[border-color,box-shadow,transform] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30 focus-visible:ring-offset-1 focus-visible:ring-offset-white active:translate-y-[1px] ${toneClass(event.eventType)}`}
      aria-label={getAccessibleLabel(event)}
    >
      <div className="flex w-full items-start gap-1.5">
        <span className="material-symbols-outlined mt-[1px] text-[13px]" aria-hidden="true">
          {iconName(event.eventType)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-[1.25]">
          {getPrimaryLine(event, dayKey)}
        </span>
        {event.warningFlags.length > 0 ? (
          <span className="material-symbols-outlined text-[13px] text-amber-700" aria-hidden="true">
            warning
          </span>
        ) : null}
      </div>
      <span className="w-full truncate pl-[18px] text-[10.5px] leading-[1.2] opacity-80">
        {getSecondaryLine(event)}
      </span>
    </button>
  )
}
