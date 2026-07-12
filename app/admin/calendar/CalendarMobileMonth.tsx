'use client'

import {
  formatLongDateFromDateKey,
  getCurrentSydneyDateKey,
  getMonthMatrixDateKeys,
  getWeekdayLabels,
  isSameMonthDateKey,
} from './calendar-range'
import type { AdminCalendarEvent } from './calendar-types'

const EVENT_TYPE_PRIORITY = ['checkout', 'booking', 'maintenance', 'blocked', 'buffer', 'fallback'] as const

function getDateLabel(dateKey: string, eventCount: number, isToday: boolean, isSelected: boolean) {
  const states = [
    formatLongDateFromDateKey(dateKey),
    isToday ? 'today' : null,
    isSelected ? 'selected' : null,
    `${eventCount} ${eventCount === 1 ? 'event' : 'events'}`,
  ].filter(Boolean)

  return states.join(', ')
}

function getIndicatorTone(type: AdminCalendarEvent['eventType']) {
  if (type === 'checkout') return 'bg-blue-500'
  if (type === 'booking') return 'bg-emerald-500'
  if (type === 'maintenance') return 'bg-amber-500'
  if (type === 'blocked') return 'bg-rose-500'
  if (type === 'buffer') return 'bg-slate-500'
  return 'bg-sky-500'
}

function getPriorityTypes(events: AdminCalendarEvent[]) {
  const seen = new Set<AdminCalendarEvent['eventType']>()
  const ordered: AdminCalendarEvent['eventType'][] = []

  for (const type of EVENT_TYPE_PRIORITY) {
    for (const event of events) {
      if (event.eventType === type && !seen.has(type)) {
        seen.add(type)
        ordered.push(type)
      }
    }
  }

  return ordered
}

export default function CalendarMobileMonth({
  visibleMonthDateKey,
  selectedDateKey,
  events,
  onSelectDate,
}: {
  visibleMonthDateKey: string
  selectedDateKey: string
  events: AdminCalendarEvent[]
  onSelectDate: (dateKey: string) => void
}) {
  const todayDateKey = getCurrentSydneyDateKey()
  const matrixDateKeys = getMonthMatrixDateKeys(visibleMonthDateKey)
  const weekdayLabels = getWeekdayLabels()

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1 rounded-[18px] border border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.92)] p-2">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="flex h-7 items-center justify-center text-[10px] font-bold uppercase tracking-[0.08em] text-[#64748b]"
          >
            {label}
          </div>
        ))}

        {matrixDateKeys.map((dateKey) => {
          const isToday = dateKey === todayDateKey
          const isSelected = dateKey === selectedDateKey
          const isAdjacentMonth = !isSameMonthDateKey(dateKey, visibleMonthDateKey)
          const dailyEvents = events.filter(
            (event) => event.startSydneyDateKey <= dateKey && event.endSydneyDateKey >= dateKey,
          )
          const priorityTypes = getPriorityTypes(dailyEvents)
          const compactCount = dailyEvents.length > 3

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(dateKey)}
              aria-pressed={isSelected}
              aria-label={getDateLabel(dateKey, dailyEvents.length, isToday, isSelected)}
              className={`flex aspect-square min-h-[46px] flex-col items-center justify-between rounded-[14px] px-1 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/35 ${
                isSelected
                  ? 'bg-[#1a4fd6] text-white shadow-[0_8px_18px_rgba(26,79,214,0.22)]'
                  : isToday
                  ? 'bg-[#eaf2ff] text-[#1a4fd6]'
                  : 'bg-white text-[#152d5a] hover:bg-[#f6faff]'
              } ${isAdjacentMonth && !isSelected ? 'text-[#94a3b8]' : ''}`}
            >
              <span className="text-[12px] font-semibold leading-none">
                {dateKey.slice(-2).replace(/^0/, '')}
              </span>
              <span className="flex min-h-[14px] items-center justify-center gap-1.5" aria-hidden="true">
                {compactCount ? (
                  <span
                    className={`inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none ${
                      isSelected ? 'bg-white/16 text-white' : 'bg-[#dbe7ff] text-[#1a4fd6]'
                    }`}
                  >
                    {dailyEvents.length}
                  </span>
                ) : (
                  priorityTypes.slice(0, 2).map((type, index) => (
                    <span
                      key={`${dateKey}-${type}-${index}`}
                      className={`h-[5px] w-3 rounded-full ${isSelected ? 'bg-white' : getIndicatorTone(type)}`}
                    />
                  ))
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
