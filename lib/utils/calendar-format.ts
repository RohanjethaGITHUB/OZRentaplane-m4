const SYDNEY_TZ = 'Australia/Sydney'
const DEFAULT_LOCALE = 'en-AU'

function sydneyOffsetMs(date: Date): number {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('sv', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(date)
      .replace(' ', 'T') + 'Z'

  return Date.parse(fmt(SYDNEY_TZ)) - Date.parse(fmt('UTC'))
}

function toSydneyLocalDate(input: string | Date): Date | null {
  const utcDate = input instanceof Date ? input : new Date(input)
  if (isNaN(utcDate.getTime())) return null
  const offset = sydneyOffsetMs(utcDate)
  return new Date(utcDate.getTime() + offset)
}

export function sydneyCalendarDateKey(input: string | Date): string {
  const syd = toSydneyLocalDate(input)
  if (!syd) return ''
  const y = syd.getUTCFullYear()
  const m = String(syd.getUTCMonth() + 1).padStart(2, '0')
  const d = String(syd.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatCalendarTime(input: string | Date): string {
  const syd = toSydneyLocalDate(input)
  if (!syd) return '—'
  const h24 = syd.getUTCHours()
  const min = String(syd.getUTCMinutes()).padStart(2, '0')
  const h12 = h24 % 12 || 12
  const period = h24 >= 12 ? 'PM' : 'AM'
  return `${h12}:${min} ${period}`
}

export function formatCalendarDateTime(input: string | Date): string {
  const syd = toSydneyLocalDate(input)
  if (!syd) return '—'
  const day = syd.getUTCDate()
  const month = syd.getUTCMonth() + 1
  const year = syd.getUTCFullYear()
  return `${day}/${month}/${year}, ${formatCalendarTime(input)}`
}

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
]

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatCalendarWeekdayDay(input: string | Date): string {
  const syd = toSydneyLocalDate(input)
  if (!syd) return '—'
  return `${WEEKDAYS_SHORT[syd.getUTCDay()]} ${syd.getUTCDate()}`
}

export function formatCalendarMonthLabel(year: number, monthIndexZeroBased: number): string {
  const month = MONTHS_LONG[monthIndexZeroBased]
  return `${month} ${year}`
}

export const CALENDAR_FORMAT_CONFIG = {
  timezone: SYDNEY_TZ,
  locale: DEFAULT_LOCALE,
} as const
