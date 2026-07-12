'use client'

import CalendarAgendaItem from './CalendarAgendaItem'
import { formatLongDateFromDateKey, getCurrentSydneyDateKey } from './calendar-range'
import type { AdminCalendarEvent } from './calendar-types'

const SUMMARY_PRIORITY: Array<AdminCalendarEvent['eventType']> = ['checkout', 'booking', 'maintenance', 'blocked', 'buffer', 'fallback']

function getEventTypeSummary(eventType: AdminCalendarEvent['eventType'], count: number) {
  if (eventType === 'checkout') return `${count} checkout ${count === 1 ? 'flight' : 'flights'}`
  if (eventType === 'booking') return `${count} customer booking${count === 1 ? '' : 's'}`
  if (eventType === 'maintenance') return `${count} maintenance block${count === 1 ? '' : 's'}`
  if (eventType === 'blocked') return `${count} blocked time block${count === 1 ? '' : 's'}`
  if (eventType === 'buffer') return `${count} buffer${count === 1 ? '' : 's'}`
  return `${count} other operation${count === 1 ? '' : 's'}`
}

function buildSummaryLine(events: AdminCalendarEvent[]) {
  const counts = new Map<AdminCalendarEvent['eventType'], number>()
  for (const event of events) {
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1)
  }

  const segments: string[] = []
  for (const type of SUMMARY_PRIORITY) {
    const count = counts.get(type) ?? 0
    if (count > 0) segments.push(getEventTypeSummary(type, count))
  }
  return segments.join(' · ')
}

export default function CalendarDayAgenda({
  dateKey,
  events,
  selectedAircraftRegistration,
  onOpenEvent,
  onClearAircraft,
}: {
  dateKey: string
  events: AdminCalendarEvent[]
  selectedAircraftRegistration: string | null
  onOpenEvent: (event: AdminCalendarEvent, trigger: HTMLButtonElement | null) => void
  onClearAircraft?: () => void
}) {
  const isToday = dateKey === getCurrentSydneyDateKey()
  const firstEventType = events[0]?.eventType ?? null
  const totalLabel = selectedAircraftRegistration
    ? events.length === 1 && firstEventType
      ? `${getEventTypeSummary(firstEventType, 1)} for ${selectedAircraftRegistration}`
      : `${events.length} operations for ${selectedAircraftRegistration}`
    : events.length === 1 && firstEventType
    ? getEventTypeSummary(firstEventType, 1)
    : events.length > 0
    ? `${events.length} operations scheduled`
    : 'No operations scheduled'
  const typeSummary = events.length > 1 ? buildSummaryLine(events) : null
  const emptyCopy = selectedAircraftRegistration
    ? `No calendar events are scheduled for ${selectedAircraftRegistration} on this date.`
    : 'No calendar events are scheduled for this date.'

  return (
    <div className="space-y-2.5">
      <div className="rounded-[14px] border border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.88)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#152d5a]">{formatLongDateFromDateKey(dateKey)}</h2>
          {isToday ? (
            <span className="inline-flex rounded-full border border-[#1a4fd6]/18 bg-[#eaf2ff] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#1a4fd6]">
              Today
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[12.5px] font-medium text-[#1f365d]">{totalLabel}</p>
        {typeSummary ? <p className="mt-1 text-[11.5px] leading-[1.35] text-[#4b6390]">{typeSummary}</p> : null}
      </div>

      {events.length === 0 ? (
        <div className="rounded-[14px] border border-[rgba(12,35,64,0.08)] bg-white px-4 py-4 text-[13px] text-[#4b6390]">
          <p>{emptyCopy}</p>
          {selectedAircraftRegistration && onClearAircraft ? (
            <button
              type="button"
              onClick={onClearAircraft}
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.92)] px-3.5 text-[12.5px] font-semibold text-[#152d5a] transition-colors hover:bg-[#edf4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
            >
              Show all aircraft
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <CalendarAgendaItem
              key={`${dateKey}-${event.eventId}`}
              event={event}
              dateKey={dateKey}
              onOpen={onOpenEvent}
            />
          ))}
        </div>
      )}
    </div>
  )
}
