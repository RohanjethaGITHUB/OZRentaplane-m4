'use client'

import { useMemo } from 'react'
import { formatCalendarTime } from '@/lib/utils/calendar-format'
import {
  formatLongDateFromDateKey,
  getCurrentSydneyDateKey,
  getEventSegmentForSydneyDate,
  getOrderedEventsForSydneyDate,
  getWeekDateKeys,
} from './calendar-range'
import type { AdminCalendarAircraftOption, AdminCalendarEvent } from './calendar-types'

const EMPTY_FALLBACK_ROWS = 4
const MAX_VISIBLE_PER_CELL = 3

function toneClass(type: AdminCalendarEvent['eventType']) {
  if (type === 'checkout') return 'border-blue-200 bg-blue-50 text-blue-950'
  if (type === 'booking') return 'border-emerald-200 bg-emerald-50 text-emerald-950'
  if (type === 'maintenance') return 'border-amber-200 bg-amber-50 text-amber-950'
  if (type === 'blocked') return 'border-rose-200 bg-rose-50 text-rose-950'
  if (type === 'buffer') return 'border-slate-200 bg-slate-100 text-slate-900'
  return 'border-sky-200 bg-sky-50 text-sky-950'
}

function getCellTitle(event: AdminCalendarEvent) {
  if (event.eventType === 'maintenance') return event.publicLabel || event.title
  if (event.eventType === 'blocked') return event.publicLabel || 'Blocked time'
  if (event.eventType === 'buffer') return 'Buffer'
  return event.customerName || event.title
}

function getContinuation(event: AdminCalendarEvent, dateKey: string) {
  const segment = getEventSegmentForSydneyDate(event, dateKey)
  if (!segment) return null
  if (segment.continuesFromPreviousDay && segment.continuesIntoNextDay) return 'Continues'
  if (segment.continuesFromPreviousDay) return 'From previous day'
  if (segment.continuesIntoNextDay) return 'Continues later'
  return null
}

function getTimeLabel(event: AdminCalendarEvent, dateKey: string) {
  const segment = getEventSegmentForSydneyDate(event, dateKey)
  if (!segment) return ''
  if (segment.continuesFromPreviousDay && segment.continuesIntoNextDay) return 'All day'
  if (segment.continuesFromPreviousDay) return `Until ${formatCalendarTime(segment.segmentEndIso)}`
  if (segment.continuesIntoNextDay) return `${formatCalendarTime(segment.segmentStartIso)} onward`
  return `${formatCalendarTime(segment.segmentStartIso)} - ${formatCalendarTime(segment.segmentEndIso)}`
}

function getWeekCount(eventsByDate: Map<string, AdminCalendarEvent[]>) {
  let total = 0
  eventsByDate.forEach((dayEvents) => {
    total += dayEvents.length
  })
  return total
}

export default function CalendarDesktopWeekView({
  dateKey,
  events,
  aircraftOptions,
  selectedAircraftId,
  onSelectDate,
  onOpenEvent,
  onOpenDayList,
}: {
  dateKey: string
  events: AdminCalendarEvent[]
  aircraftOptions: AdminCalendarAircraftOption[]
  selectedAircraftId: string | null
  onSelectDate: (dateKey: string) => void
  onOpenEvent: (event: AdminCalendarEvent, trigger: HTMLButtonElement | null) => void
  onOpenDayList: (
    dateKey: string,
    trigger: HTMLButtonElement | null,
    scopedEvents?: AdminCalendarEvent[],
    scopeLabel?: string | null,
  ) => void
}) {
  const weekDays = getWeekDateKeys(dateKey)
  const baseEventsByAircraft = useMemo(() => {
    const map = new Map<string, AdminCalendarEvent[]>()
    for (const event of events) {
      const bucket = map.get(event.aircraftId)
      if (bucket) bucket.push(event)
      else map.set(event.aircraftId, [event])
    }
    return map
  }, [events])

  const aircraftRows = useMemo(() => {
    if (selectedAircraftId) {
      return aircraftOptions.filter((aircraft) => aircraft.id === selectedAircraftId)
    }

    const activeIds = new Set(events.map((event) => event.aircraftId))
    const matching = aircraftOptions.filter((aircraft) => activeIds.has(aircraft.id))
    if (matching.length > 0) return matching
    return aircraftOptions.slice(0, Math.min(aircraftOptions.length, EMPTY_FALLBACK_ROWS))
  }, [aircraftOptions, events, selectedAircraftId])

  const eventIndex = useMemo(() => {
    const index = new Map<string, Map<string, AdminCalendarEvent[]>>()
    for (const aircraft of aircraftRows) {
      const aircraftEvents = baseEventsByAircraft.get(aircraft.id) ?? []
      const byDate = new Map<string, AdminCalendarEvent[]>()
      for (const day of weekDays) {
        byDate.set(day, getOrderedEventsForSydneyDate(aircraftEvents, day))
      }
      index.set(aircraft.id, byDate)
    }
    return index
  }, [aircraftRows, baseEventsByAircraft, weekDays])

  return (
    <div className="hidden lg:block">
      <div
        className="overflow-x-auto rounded-[18px] border border-[rgba(12,35,64,0.10)]"
        aria-label="Weekly aircraft operations matrix"
      >
        <div className="min-w-[1120px]">
          <div
            role="table"
            aria-label="Aircraft by day calendar week view"
            className="grid grid-cols-[220px_repeat(7,minmax(180px,1fr))]"
          >
            <div className="sticky left-0 top-0 z-30 border-b border-r border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.96)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748b]">
              Aircraft
            </div>

            {weekDays.map((day) => {
              const isToday = day === getCurrentSydneyDateKey()
              const isSelected = day === dateKey
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => onSelectDate(day)}
                  className={`sticky top-0 z-20 border-b border-r border-[rgba(12,35,64,0.08)] px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a4fd6]/30 ${
                    isSelected ? 'bg-[#f4f8ff]' : 'bg-[rgba(247,251,255,0.96)] hover:bg-[#f5f9ff]'
                  }`}
                  aria-pressed={isSelected}
                  aria-label={`Select ${formatLongDateFromDateKey(day)}${isToday ? ', today' : ''}${isSelected ? ', selected' : ''}`}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748b]">
                    {day === getCurrentSydneyDateKey() ? 'Today' : formatLongDateFromDateKey(day).split(',')[0]}
                  </p>
                  <p className={`mt-1 text-[13px] font-semibold ${isSelected ? 'text-[#1a4fd6]' : 'text-[#152d5a]'}`}>
                    {day.slice(-2).replace(/^0/, '')}
                  </p>
                </button>
              )
            })}

            {aircraftRows.map((aircraft) => {
              const byDate = eventIndex.get(aircraft.id) ?? new Map<string, AdminCalendarEvent[]>()
              const weekCount = getWeekCount(byDate)

              return (
                <div
                  key={aircraft.id}
                  className="contents"
                >
                  <div
                    className="sticky left-0 z-10 border-b border-r border-[rgba(12,35,64,0.08)] bg-white px-4 py-4"
                  >
                    <p className="text-[13px] font-semibold text-[#152d5a]">{aircraft.registration}</p>
                    {aircraft.model ? <p className="text-[11.5px] text-[#4b6390]">{aircraft.model}</p> : null}
                    {weekCount > 0 ? <p className="mt-1 text-[11px] text-[#64748b]">{weekCount} scheduled</p> : null}
                  </div>

                  {weekDays.map((day) => {
                    const cellEvents = byDate.get(day) ?? []
                    const hiddenCount = Math.max(0, cellEvents.length - MAX_VISIBLE_PER_CELL)

                    return (
                      <div
                        key={`${aircraft.id}-${day}`}
                        role="gridcell"
                        className="border-b border-r border-[rgba(12,35,64,0.08)] bg-white px-2.5 py-2.5 align-top"
                      >
                        <div className="space-y-2">
                          {cellEvents.slice(0, MAX_VISIBLE_PER_CELL).map((event) => (
                            <button
                              key={event.eventId}
                              type="button"
                              onClick={(openEvent) => onOpenEvent(event, openEvent.currentTarget)}
                              className={`flex w-full flex-col items-start gap-0.5 rounded-[10px] border-l-4 px-2.5 py-2 text-left transition-[box-shadow,transform] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30 active:translate-y-[1px] ${toneClass(event.eventType)}`}
                              aria-label={`Open ${event.eventTypeLabel.toLowerCase()} for ${getCellTitle(event)} on ${aircraft.registration}, ${getTimeLabel(event, day)}`}
                            >
                              <span className="truncate text-[11.5px] font-semibold">{getCellTitle(event)}</span>
                              <span className="text-[10.5px] opacity-80">{getTimeLabel(event, day)}</span>
                              {getContinuation(event, day) ? (
                                <span className="text-[10px] opacity-70">{getContinuation(event, day)}</span>
                              ) : null}
                            </button>
                          ))}

                          {hiddenCount > 0 ? (
                            <button
                              type="button"
                              onClick={(event) => onOpenDayList(day, event.currentTarget, cellEvents, aircraft.registration)}
                              className="inline-flex min-h-8 items-center rounded-[8px] border border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.92)] px-2.5 text-[11px] font-semibold text-[#1a4fd6] transition-colors hover:bg-[#edf4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
                              aria-label={`Show ${hiddenCount} more events for ${aircraft.registration} on ${formatLongDateFromDateKey(day)}`}
                            >
                              +{hiddenCount} more
                            </button>
                          ) : null}

                          {cellEvents.length === 0 ? (
                            <p className="text-[11px] text-[#94a3b8]">No operations</p>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
