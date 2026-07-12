'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import CalendarTimelineEvent from './CalendarTimelineEvent'
import {
  doesEventOverlapSydneyDate,
  formatSydneyHourLabel,
  formatWeekdayDayFromDateKey,
  getCurrentSydneyMinutesOfDay,
  getCurrentSydneyDateKey,
  getEventSegmentForSydneyDate,
  getOrderedEventsForSydneyDate,
  getSydneyMinutesFromMidnight,
  isTodaySydneyDateKey,
} from './calendar-range'
import type { AdminCalendarAircraftOption, AdminCalendarEvent } from './calendar-types'

const HOUR_HEIGHT = 48
const DAY_HEIGHT = HOUR_HEIGHT * 24
const MIN_EVENT_HEIGHT = 28
const EMPTY_FALLBACK_COLUMNS = 4

type TimelineLayout = {
  event: AdminCalendarEvent
  top: number
  height: number
  leftPct: number
  widthPct: number
}

function buildOverlapLayouts(events: AdminCalendarEvent[], dateKey: string): TimelineLayout[] {
  const source = events
    .map((event) => {
      const segment = getEventSegmentForSydneyDate(event, dateKey)
      if (!segment) return null

      const start = getSydneyMinutesFromMidnight(segment.segmentStartIso)
      const end = Math.max(getSydneyMinutesFromMidnight(segment.segmentEndIso), start + 1)
      return { event, start, end }
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (!left || !right) return 0
      if (left.start !== right.start) return left.start - right.start
      if (left.end !== right.end) return left.end - right.end
      return left.event.eventId.localeCompare(right.event.eventId)
    }) as Array<{ event: AdminCalendarEvent; start: number; end: number }>

  const output: TimelineLayout[] = []
  let cluster: Array<{ event: AdminCalendarEvent; start: number; end: number; column: number }> = []
  let active: Array<{ end: number; column: number }> = []
  let clusterMax = 0

  function flushCluster() {
    if (cluster.length === 0) return
    output.push(
      ...cluster.map((item) => ({
        event: item.event,
        top: item.start * (HOUR_HEIGHT / 60),
        height: Math.max((item.end - item.start) * (HOUR_HEIGHT / 60), MIN_EVENT_HEIGHT),
        leftPct: (item.column / clusterMax) * 100,
        widthPct: 100 / clusterMax,
      })),
    )
    cluster = []
    active = []
    clusterMax = 0
  }

  for (const item of source) {
    active = active.filter((entry) => entry.end > item.start)
    if (active.length === 0) flushCluster()

    let column = 0
    while (active.some((entry) => entry.column === column)) column += 1
    active.push({ end: item.end, column })
    cluster.push({ ...item, column })
    clusterMax = Math.max(clusterMax, active.length)
  }

  flushCluster()
  return output
}

export default function CalendarDesktopDayView({
  dateKey,
  events,
  aircraftOptions,
  selectedAircraftId,
  selectedAircraftRegistration,
  onOpenEvent,
}: {
  dateKey: string
  events: AdminCalendarEvent[]
  aircraftOptions: AdminCalendarAircraftOption[]
  selectedAircraftId: string | null
  selectedAircraftRegistration: string | null
  onOpenEvent: (event: AdminCalendarEvent, trigger: HTMLButtonElement | null) => void
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [currentMinutes, setCurrentMinutes] = useState(() => getCurrentSydneyMinutesOfDay())
  const today = isTodaySydneyDateKey(dateKey)
  const baseEventsByAircraft = useMemo(() => {
    const map = new Map<string, AdminCalendarEvent[]>()
    for (const event of events) {
      const bucket = map.get(event.aircraftId)
      if (bucket) bucket.push(event)
      else map.set(event.aircraftId, [event])
    }
    return map
  }, [events])

  const aircraftColumns = useMemo(() => {
    if (selectedAircraftId) {
      return aircraftOptions.filter((aircraft) => aircraft.id === selectedAircraftId)
    }

    const activeIds = new Set(
      events.filter((event) => doesEventOverlapSydneyDate(event, dateKey)).map((event) => event.aircraftId),
    )
    const matching = aircraftOptions.filter((aircraft) => activeIds.has(aircraft.id))
    if (matching.length > 0) return matching
    return aircraftOptions.slice(0, Math.min(aircraftOptions.length, EMPTY_FALLBACK_COLUMNS))
  }, [aircraftOptions, dateKey, events, selectedAircraftId])

  const eventsByAircraft = useMemo(() => {
    const map = new Map<string, AdminCalendarEvent[]>()
    for (const aircraft of aircraftColumns) {
      map.set(aircraft.id, getOrderedEventsForSydneyDate(baseEventsByAircraft.get(aircraft.id) ?? [], dateKey))
    }
    return map
  }, [aircraftColumns, baseEventsByAircraft, dateKey])

  const layoutsByAircraft = useMemo(() => {
    const map = new Map<string, TimelineLayout[]>()
    for (const aircraft of aircraftColumns) {
      map.set(aircraft.id, buildOverlapLayouts(eventsByAircraft.get(aircraft.id) ?? [], dateKey))
    }
    return map
  }, [aircraftColumns, dateKey, eventsByAircraft])

  useEffect(() => {
    if (!today) return undefined
    setCurrentMinutes(getCurrentSydneyMinutesOfDay())
    const interval = window.setInterval(() => {
      setCurrentMinutes(getCurrentSydneyMinutesOfDay())
    }, 60000)
    return () => window.clearInterval(interval)
  }, [today])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const allDayEvents = Array.from(eventsByAircraft.values()).flat()
    const earliestEvent = allDayEvents[0]
    let targetMinutes = 8 * 60

    if (today) {
      targetMinutes = Math.max(currentMinutes - 90, 0)
    } else if (earliestEvent) {
      const segment = getEventSegmentForSydneyDate(earliestEvent, dateKey)
      if (segment) targetMinutes = Math.max(getSydneyMinutesFromMidnight(segment.segmentStartIso) - 60, 0)
    }

    container.scrollTo({
      top: targetMinutes * (HOUR_HEIGHT / 60),
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [dateKey, eventsByAircraft, today])

  const emptyCopy = selectedAircraftRegistration
    ? `No calendar events are scheduled for ${selectedAircraftRegistration} on this date.`
    : 'No operations are scheduled on this date.'
  const totalVisibleEvents = Array.from(eventsByAircraft.values()).reduce((sum, lane) => sum + lane.length, 0)
  const gridTemplateColumns = `84px repeat(${Math.max(aircraftColumns.length, 1)}, minmax(220px, 1fr))`

  return (
    <div className="hidden lg:block">
      <div
        className="overflow-x-auto rounded-[18px] border border-[rgba(12,35,64,0.10)]"
        aria-label={`Day timeline for ${formatWeekdayDayFromDateKey(dateKey)}`}
      >
        <div className="min-w-[920px]">
          <div
            className="grid border-b border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.96)]"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-20 border-r border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.96)] px-3 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748b]">
              Time
            </div>
            {aircraftColumns.map((aircraft) => (
              <div
                key={aircraft.id}
                className="sticky top-0 z-10 border-r border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.96)] px-4 py-3 last:border-r-0"
              >
                <p className="text-[13px] font-semibold text-[#152d5a]">{aircraft.registration}</p>
                {aircraft.model ? <p className="text-[11.5px] text-[#4b6390]">{aircraft.model}</p> : null}
              </div>
            ))}
          </div>

          <div
            ref={scrollRef}
            className="relative max-h-[calc(100vh-320px)] overflow-y-auto"
            aria-label={`Scrollable day timeline for ${getCurrentSydneyDateKey() === dateKey ? 'today' : formatWeekdayDayFromDateKey(dateKey)}`}
          >
            <div className="grid" style={{ gridTemplateColumns }}>
              <div className="sticky left-0 z-10 border-r border-[rgba(12,35,64,0.08)] bg-white">
                <div className="relative" style={{ height: `${DAY_HEIGHT}px` }}>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div
                      key={hour}
                      className="absolute inset-x-0 border-t border-[rgba(12,35,64,0.08)] px-3 text-[11px] text-[#64748b]"
                      style={{ top: `${hour === 0 ? 6 : hour * HOUR_HEIGHT - 8}px` }}
                    >
                      {formatSydneyHourLabel(hour)}
                    </div>
                  ))}
                  {today ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20"
                      style={{ top: `${currentMinutes * (HOUR_HEIGHT / 60)}px` }}
                      aria-hidden="true"
                    >
                      <div className="ml-2 inline-flex rounded-full bg-[#1a4fd6] px-2 py-0.5 text-[10px] font-bold text-white">
                        {`${Math.floor(currentMinutes / 60) % 12 || 12}:${String(currentMinutes % 60).padStart(2, '0')} ${currentMinutes >= 720 ? 'PM' : 'AM'}`}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {aircraftColumns.map((aircraft) => {
                const laneEvents = eventsByAircraft.get(aircraft.id) ?? []
                const laneLayouts = layoutsByAircraft.get(aircraft.id) ?? []
                return (
                  <div key={aircraft.id} className="relative border-r border-[rgba(12,35,64,0.08)] last:border-r-0">
                    <div className="relative bg-white" style={{ height: `${DAY_HEIGHT}px` }}>
                      {Array.from({ length: 24 }, (_, hour) => (
                        <div
                          key={`${aircraft.id}-${hour}`}
                          className="absolute inset-x-0 border-t border-[rgba(12,35,64,0.08)]"
                          style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                        >
                          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-[rgba(12,35,64,0.05)]" />
                        </div>
                      ))}

                      {today ? (
                        <div
                          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-[#1a4fd6]"
                          style={{ top: `${currentMinutes * (HOUR_HEIGHT / 60)}px` }}
                          aria-hidden="true"
                        />
                      ) : null}

                      {laneLayouts.map((layout) => (
                        <CalendarTimelineEvent
                          key={layout.event.eventId}
                          event={layout.event}
                          dateKey={dateKey}
                          layout={layout}
                          onOpen={onOpenEvent}
                        />
                      ))}

                      {laneEvents.length === 0 ? (
                        <div className="pointer-events-none absolute inset-x-4 top-6 rounded-[12px] border border-dashed border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.55)] px-3 py-2 text-[12px] text-[#64748b]">
                          {totalVisibleEvents === 0 ? emptyCopy : 'No operations in this lane.'}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
