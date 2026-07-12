'use client'

import { useEffect, useState } from 'react'
import { formatLongDateFromDateKey, getCurrentSydneyDateKey, getMonthMatrixDateKeys, getWeekdayLabels, isSameMonthDateKey } from './calendar-range'
import CalendarEventChip from './CalendarEventChip'
import type { AdminCalendarEvent } from './calendar-types'

export default function CalendarMonthView({
  visibleMonthDateKey,
  selectedDateKey,
  events,
  selectedAircraftRegistration,
  onSelectDate,
  onOpenEvent,
  onOpenDayList,
  onShowAllAircraft,
}: {
  visibleMonthDateKey: string
  selectedDateKey: string
  events: AdminCalendarEvent[]
  selectedAircraftRegistration: string | null
  onSelectDate: (dateKey: string) => void
  onOpenEvent: (event: AdminCalendarEvent, trigger: HTMLButtonElement | null) => void
  onOpenDayList: (dateKey: string, trigger: HTMLButtonElement | null) => void
  onShowAllAircraft?: () => void
}) {
  const todayDateKey = getCurrentSydneyDateKey()
  const matrixDateKeys = getMonthMatrixDateKeys(visibleMonthDateKey)
  const weekdayLabels = getWeekdayLabels()
  const emptyMonth = events.length === 0
  const [maxVisibleEvents, setMaxVisibleEvents] = useState(2)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia('(min-width: 1400px)')
    const sync = () => setMaxVisibleEvents(mediaQuery.matches ? 3 : 2)

    sync()
    mediaQuery.addEventListener('change', sync)
    return () => mediaQuery.removeEventListener('change', sync)
  }, [])

  return (
    <div className="space-y-4">
      {emptyMonth ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.9)] px-4 py-3 text-[13px] text-[#4b6390]">
          <p>
            {selectedAircraftRegistration
              ? `${selectedAircraftRegistration} has no calendar events in this range.`
              : 'No operations are scheduled in this calendar range.'}
          </p>
          {selectedAircraftRegistration && onShowAllAircraft ? (
            <button
              type="button"
              onClick={onShowAllAircraft}
              className="inline-flex min-h-9 items-center justify-center rounded-[9px] border border-[rgba(12,35,64,0.10)] bg-white px-3 text-[12px] font-semibold text-[#152d5a] transition-colors hover:bg-[#edf4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
            >
              Show all aircraft
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-7 gap-0 rounded-[16px] border border-[rgba(12,35,64,0.10)] bg-white shadow-[0_10px_24px_rgba(15,30,52,0.06)]">
        {weekdayLabels.map((label) => (
          <div key={label} className="border-b border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.92)] px-3 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748b]">
            {label}
          </div>
        ))}

        {matrixDateKeys.map((dateKey, index) => {
          const isSelected = selectedDateKey === dateKey
          const isToday = todayDateKey === dateKey
          const isAdjacentMonth = !isSameMonthDateKey(dateKey, visibleMonthDateKey)
          const dailyEvents = events.filter((event) => {
            return event.startSydneyDateKey <= dateKey && event.endSydneyDateKey >= dateKey
          })
          const hiddenCount = Math.max(0, dailyEvents.length - maxVisibleEvents)
          const isLastRow = index >= matrixDateKeys.length - 7

          return (
            <div
              key={dateKey}
              role="button"
              tabIndex={0}
              aria-label={`Select ${formatLongDateFromDateKey(dateKey)}, ${dailyEvents.length} events`}
              onClick={() => onSelectDate(dateKey)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectDate(dateKey)
                }
              }}
              className={`group relative min-h-[126px] overflow-hidden border-r border-[rgba(12,35,64,0.08)] px-2.5 py-2 outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a4fd6]/30 ${isLastRow ? '' : 'border-b border-[rgba(12,35,64,0.08)]'} ${index % 7 === 6 ? 'border-r-0' : ''} ${isSelected ? 'bg-[#f4f8ff] ring-1 ring-inset ring-[#1a4fd6]/20' : 'bg-white hover:bg-[#f9fbfe]'} ${isAdjacentMonth ? 'bg-[rgba(249,251,254,0.72)]' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span
                  className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[12.5px] font-semibold ${isToday ? 'bg-[#1a4fd6] text-white' : isSelected ? 'bg-[#eaf2ff] text-[#1a4fd6]' : isAdjacentMonth ? 'text-[#94a3b8]' : 'text-[#152d5a]'}`}
                >
                  {dateKey.slice(-2).replace(/^0/, '')}
                </span>
                {dailyEvents.length > 0 ? (
                  <span className="text-[10.5px] font-medium text-[#94a3b8]">{dailyEvents.length}</span>
                ) : null}
              </div>

              <div className="space-y-1">
                {dailyEvents.slice(0, maxVisibleEvents).map((event) => (
                  <CalendarEventChip key={`${dateKey}-${event.eventId}`} event={event} dayKey={dateKey} onOpen={onOpenEvent} />
                ))}
                {hiddenCount > 0 ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenDayList(dateKey, event.currentTarget)
                    }}
                    className="inline-flex min-h-7 items-center rounded-[7px] border border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.92)] px-2 text-[11px] font-semibold text-[#1a4fd6] transition-colors hover:bg-[#edf4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
                  >
                    +{hiddenCount} more
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
