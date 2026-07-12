import { sydneyInputToUTC, todaySydneyDateKey } from '@/lib/utils/sydney-time'
import type { AdminCalendarEvent, AdminCalendarView } from './calendar-types'

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export type CalendarRange = {
  rangeStartUtc: string
  rangeEndUtc: string
  anchorDateKey: string
  viewStartDateKey: string
  viewEndDateKeyExclusive: string
}

type DateParts = {
  year: number
  month: number
  day: number
}

function parseDateKeyParts(dateKey: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

function dateKeyToUtcDate(dateKey: string): Date {
  const parts = parseDateKeyParts(dateKey)
  if (!parts) throw new Error(`Invalid Sydney date key: ${dateKey}`)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

export function isValidSydneyDateKey(value: string | undefined): value is string {
  if (!value) return false
  return parseDateKeyParts(value) !== null
}

export function getCurrentSydneyDateKey() {
  return todaySydneyDateKey()
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = dateKeyToUtcDate(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDateKeyFromUtcDate(date)
}

export function formatDateKeyFromUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function getMonthStartDateKey(dateKey: string): string {
  const parts = parseDateKeyParts(dateKey)
  if (!parts) throw new Error(`Invalid Sydney date key: ${dateKey}`)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-01`
}

export function getMonthEndDateKey(dateKey: string): string {
  const parts = parseDateKeyParts(dateKey)
  if (!parts) throw new Error(`Invalid Sydney date key: ${dateKey}`)
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate()
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function getMondayIndex(dateKey: string): number {
  const utcDow = dateKeyToUtcDate(dateKey).getUTCDay()
  return (utcDow + 6) % 7
}

function getSydneyDayStartUtc(dateKey: string): string {
  const iso = sydneyInputToUTC(`${dateKey}T00:00`)
  if (!iso) throw new Error(`Could not derive Sydney UTC boundary for ${dateKey}`)
  return iso
}

export function getSydneyDayRange(dateKey: string): CalendarRange {
  return {
    rangeStartUtc: getSydneyDayStartUtc(dateKey),
    rangeEndUtc: getSydneyDayStartUtc(addDaysToDateKey(dateKey, 1)),
    anchorDateKey: dateKey,
    viewStartDateKey: dateKey,
    viewEndDateKeyExclusive: addDaysToDateKey(dateKey, 1),
  }
}

export function getSydneyWeekRange(dateKey: string): CalendarRange {
  const mondayOffset = getMondayIndex(dateKey)
  const weekStart = addDaysToDateKey(dateKey, -mondayOffset)
  const weekEndExclusive = addDaysToDateKey(weekStart, 7)

  return {
    rangeStartUtc: getSydneyDayStartUtc(weekStart),
    rangeEndUtc: getSydneyDayStartUtc(weekEndExclusive),
    anchorDateKey: dateKey,
    viewStartDateKey: weekStart,
    viewEndDateKeyExclusive: weekEndExclusive,
  }
}

export function getSydneyMonthVisibleRange(dateKey: string): CalendarRange {
  const monthStart = getMonthStartDateKey(dateKey)
  const monthEnd = getMonthEndDateKey(dateKey)
  const leadingDays = getMondayIndex(monthStart)
  const visibleStart = addDaysToDateKey(monthStart, -leadingDays)
  const trailingDays = 6 - getMondayIndex(monthEnd)
  const visibleEndExclusive = addDaysToDateKey(monthEnd, trailingDays + 1)

  return {
    rangeStartUtc: getSydneyDayStartUtc(visibleStart),
    rangeEndUtc: getSydneyDayStartUtc(visibleEndExclusive),
    anchorDateKey: dateKey,
    viewStartDateKey: visibleStart,
    viewEndDateKeyExclusive: visibleEndExclusive,
  }
}

export function getRangeForView(view: AdminCalendarView, dateKey: string): CalendarRange {
  if (view === 'day') return getSydneyDayRange(dateKey)
  if (view === 'week') return getSydneyWeekRange(dateKey)
  return getSydneyMonthVisibleRange(dateKey)
}

export function shiftDateKeyForView(view: AdminCalendarView, dateKey: string, delta: number): string {
  if (view === 'day') return addDaysToDateKey(dateKey, delta)
  if (view === 'week') return addDaysToDateKey(dateKey, delta * 7)

  const parts = parseDateKeyParts(dateKey)
  if (!parts) throw new Error(`Invalid Sydney date key: ${dateKey}`)
  return formatDateKeyFromUtcDate(new Date(Date.UTC(parts.year, parts.month - 1 + delta, 1)))
}

export function getWeekDateKeys(dateKey: string): string[] {
  const { viewStartDateKey } = getSydneyWeekRange(dateKey)
  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(viewStartDateKey, index))
}

export function getMonthDateKeys(dateKey: string): string[] {
  const monthStart = getMonthStartDateKey(dateKey)
  const monthEnd = getMonthEndDateKey(dateKey)
  const keys: string[] = []
  for (let cursor = monthStart; cursor <= monthEnd; cursor = addDaysToDateKey(cursor, 1)) {
    keys.push(cursor)
  }
  return keys
}

export function getMonthMatrixDateKeys(dateKey: string): string[] {
  const { viewStartDateKey, viewEndDateKeyExclusive } = getSydneyMonthVisibleRange(dateKey)
  const keys: string[] = []
  for (let cursor = viewStartDateKey; cursor < viewEndDateKeyExclusive; cursor = addDaysToDateKey(cursor, 1)) {
    keys.push(cursor)
  }
  return keys
}

export function getMonthPickerValue(dateKey: string): string {
  return dateKey.slice(0, 7)
}

export function getMonthOptions(dateKey: string) {
  const start = getMonthStartDateKey(dateKey)
  const parts = parseDateKeyParts(start)
  if (!parts) return []

  return Array.from({ length: 25 }, (_, index) => {
    const offset = index - 12
    const date = new Date(Date.UTC(parts.year, parts.month - 1 + offset, 1))
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    return {
      value,
      label: `${MONTHS_LONG[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
    }
  })
}

export function formatMonthLabelFromDateKey(dateKey: string) {
  const parts = parseDateKeyParts(dateKey)
  if (!parts) return dateKey
  return `${MONTHS_LONG[parts.month - 1]} ${parts.year}`
}

export function monthValueToDateKey(monthValue: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function formatWeekdayDayFromDateKey(dateKey: string) {
  const index = getMondayIndex(dateKey)
  return `${WEEKDAYS_SHORT[index]} ${dateKeyToUtcDate(dateKey).getUTCDate()}`
}

export function getWeekdayLabels() {
  return [...WEEKDAYS_SHORT]
}

export function getDayOfMonthFromDateKey(dateKey: string) {
  return dateKeyToUtcDate(dateKey).getUTCDate()
}

export function isSameMonthDateKey(a: string, b: string) {
  return a.slice(0, 7) === b.slice(0, 7)
}

export function formatLongDateFromDateKey(dateKey: string) {
  const parts = parseDateKeyParts(dateKey)
  if (!parts) return dateKey
  const weekday = WEEKDAYS_SHORT[getMondayIndex(dateKey)]
  return `${weekday}, ${parts.day} ${MONTHS_LONG[parts.month - 1]} ${parts.year}`
}

export function formatWeekRangeLabel(dateKey: string) {
  const { viewStartDateKey, viewEndDateKeyExclusive } = getSydneyWeekRange(dateKey)
  const weekEnd = addDaysToDateKey(viewEndDateKeyExclusive, -1)
  const startParts = parseDateKeyParts(viewStartDateKey)
  const endParts = parseDateKeyParts(weekEnd)
  if (!startParts || !endParts) return viewStartDateKey
  if (startParts.month === endParts.month && startParts.year === endParts.year) {
    return `${startParts.day}-${endParts.day} ${MONTHS_LONG[startParts.month - 1]} ${startParts.year}`
  }
  return `${startParts.day} ${MONTHS_LONG[startParts.month - 1]} - ${endParts.day} ${MONTHS_LONG[endParts.month - 1]} ${endParts.year}`
}

function getEventCoverageEndDateKey(endIso: string, fallbackStartKey: string): string {
  const endMs = new Date(endIso).getTime()
  if (!Number.isFinite(endMs)) return fallbackStartKey
  return new Date(Math.max(endMs - 1, 0)).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

export function deriveEventCoverageKeys(startIso: string, endIso: string) {
  const startSydneyDateKey = new Date(startIso).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const endSydneyDateKey = getEventCoverageEndDateKey(endIso, startSydneyDateKey)
  return {
    startSydneyDateKey,
    endSydneyDateKey,
    isMultiDay: startSydneyDateKey !== endSydneyDateKey,
  }
}

export function doesEventOverlapSydneyDate(event: Pick<AdminCalendarEvent, 'startIso' | 'endIso'>, dateKey: string) {
  const dayRange = getSydneyDayRange(dateKey)
  return event.startIso < dayRange.rangeEndUtc && event.endIso > dayRange.rangeStartUtc
}

export function getEventSegmentForSydneyDate(event: Pick<AdminCalendarEvent, 'startIso' | 'endIso'>, dateKey: string) {
  if (!doesEventOverlapSydneyDate(event, dateKey)) return null

  const dayRange = getSydneyDayRange(dateKey)
  return {
    segmentStartIso: event.startIso > dayRange.rangeStartUtc ? event.startIso : dayRange.rangeStartUtc,
    segmentEndIso: event.endIso < dayRange.rangeEndUtc ? event.endIso : dayRange.rangeEndUtc,
    continuesFromPreviousDay: event.startIso < dayRange.rangeStartUtc,
    continuesIntoNextDay: event.endIso > dayRange.rangeEndUtc,
  }
}

export function getOrderedEventsForSydneyDate(events: AdminCalendarEvent[], dateKey: string) {
  return events
    .filter((event) => doesEventOverlapSydneyDate(event, dateKey))
    .slice()
    .sort((left, right) => {
      const leftSegment = getEventSegmentForSydneyDate(left, dateKey)
      const rightSegment = getEventSegmentForSydneyDate(right, dateKey)
      const leftStart = leftSegment?.segmentStartIso ?? left.startIso
      const rightStart = rightSegment?.segmentStartIso ?? right.startIso

      if (leftStart !== rightStart) return leftStart.localeCompare(rightStart)
      if (left.aircraftRegistration !== right.aircraftRegistration) {
        return left.aircraftRegistration.localeCompare(right.aircraftRegistration)
      }
      return left.eventId.localeCompare(right.eventId)
    })
}

function getSydneyClockParts(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input)
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')

  return { hour, minute }
}

export function getSydneyMinutesFromMidnight(input: string | Date) {
  const { hour, minute } = getSydneyClockParts(input)
  return hour * 60 + minute
}

export function getCurrentSydneyMinutesOfDay() {
  return getSydneyMinutesFromMidnight(new Date())
}

export function isTodaySydneyDateKey(dateKey: string) {
  return getCurrentSydneyDateKey() === dateKey
}

export function formatSydneyHourLabel(hour: number) {
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}${period}`
}
