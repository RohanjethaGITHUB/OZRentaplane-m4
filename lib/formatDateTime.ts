/**
 * Deterministic Sydney-timezone date/time formatters.
 *
 * Produces IDENTICAL output on Node.js (SSR) and browser to prevent
 * React hydration mismatches caused by Intl/locale differences between
 * environments.
 *
 * Strategy:
 *  1. Compute the exact UTC→Sydney offset in ms using the Swedish ('sv')
 *     locale, which formats dates as "YYYY-MM-DD HH:MM:SS" — a parseable
 *     ISO-like string we can diff to find the offset.
 *  2. Shift the Date by that offset so getUTC* methods return Sydney local time.
 *  3. Build the final string manually from our own constant arrays, avoiding
 *     any locale-specific separators or capitalization differences.
 *
 * All timestamps from Supabase are stored as UTC ISO strings.
 */

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const WEEKDAYS_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
]

/**
 * Returns the number of milliseconds Sydney is ahead of UTC for a given Date.
 * Either 36_000_000 (AEST, UTC+10) or 39_600_000 (AEDT, UTC+11).
 *
 * Uses the 'sv' (Swedish) locale which formats dates as "YYYY-MM-DD HH:MM:SS".
 * Treating both the UTC and Sydney strings as UTC references, we can compute
 * the difference exactly without relying on Intl timezone abbreviation output.
 */
function sydneyOffsetMs(date: Date): number {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('sv', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(date).replace(' ', 'T') + 'Z'

  return Date.parse(fmt('Australia/Sydney')) - Date.parse(fmt('UTC'))
}

/**
 * Format a UTC ISO timestamp in Sydney local time.
 *
 * Output: "22 Apr 2026, 11:25 AM Sydney time (AEST)"
 *      or "22 Oct 2026, 11:25 AM Sydney time (AEDT)" during daylight saving.
 *
 * @param iso - UTC ISO 8601 string, null, or undefined
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return '—'

  const offsetMs = sydneyOffsetMs(date)
  // Shift the timestamp so that getUTC* methods give Sydney local time
  const syd = new Date(date.getTime() + offsetMs)

  const day    = syd.getUTCDate()
  const month  = MONTHS_SHORT[syd.getUTCMonth()]
  const year   = syd.getUTCFullYear()
  const h24    = syd.getUTCHours()
  const min    = String(syd.getUTCMinutes()).padStart(2, '0')
  const h12    = h24 % 12 || 12
  const period = h24 >= 12 ? 'PM' : 'AM'
  const tz     = offsetMs >= 39_600_000 ? 'AEDT' : 'AEST'

  return `${day} ${month} ${year}, ${h12}:${min} ${period} Sydney time (${tz})`
}

/**
 * Format a date-only string (YYYY-MM-DD) as "22 Apr 2026".
 * Does not include a time or timezone label since only a calendar date is stored.
 * Use this for expiry dates and other YYYY-MM-DD fields where the date itself
 * has no timezone ambiguity.
 *
 * @param dateStr - "YYYY-MM-DD" string, null, or undefined
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const parts = dateStr.split('-')
  const year  = parseInt(parts[0] ?? '', 10)
  const month = parseInt(parts[1] ?? '', 10)
  const day   = parseInt(parts[2] ?? '', 10)
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '—'
  return `${day} ${MONTHS_SHORT[month - 1]} ${year}`
}

/**
 * Format a UTC ISO timestamp as just the Sydney calendar date: "22 Apr 2026".
 * Use this when you want the date portion of a timestamp in Sydney time
 * without showing the time itself (e.g. "Uploaded 22 Apr 2026").
 *
 * @param iso - UTC ISO 8601 string, null, or undefined
 */
export function formatDateFromISO(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return '—'
  const offsetMs = sydneyOffsetMs(date)
  const syd = new Date(date.getTime() + offsetMs)
  return `${syd.getUTCDate()} ${MONTHS_SHORT[syd.getUTCMonth()]} ${syd.getUTCFullYear()}`
}

/**
 * Format a date-only key (YYYY-MM-DD) as "Monday, 22 April 2026".
 * Used for calendar and schedule date section headers.
 * No time or timezone label since this is a pure calendar date.
 *
 * @param dateStr - "YYYY-MM-DD" string, null, or undefined
 */
export function formatDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const parts = dateStr.split('-')
  const year  = parseInt(parts[0] ?? '', 10)
  const month = parseInt(parts[1] ?? '', 10)
  const day   = parseInt(parts[2] ?? '', 10)
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '—'
  // Use noon UTC to get the correct weekday for any Sydney calendar date
  // (Sydney is UTC+10/+11, so noon UTC is always in the Sydney afternoon
  //  of the same calendar date as dateStr)
  const weekday = WEEKDAYS_LONG[new Date(`${dateStr}T12:00:00Z`).getUTCDay()]
  return `${weekday}, ${day} ${MONTHS_LONG[month - 1]} ${year}`
}
