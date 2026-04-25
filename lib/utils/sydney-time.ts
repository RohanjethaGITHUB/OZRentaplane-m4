/**
 * lib/utils/sydney-time.ts
 *
 * Shared timezone-aware formatters for all aircraft scheduling UI.
 *
 * Business rule: ALL aircraft scheduling times are displayed in Australia/Sydney
 * regardless of where the admin or customer browser is located.
 * The database stores UTC (timestamptz); these helpers handle conversion for
 * display and for interpreting datetime-local form inputs.
 *
 * Safe to use in both server components (Node.js Intl) and client components
 * (browser Intl). No React dependency.
 */

const SYD = 'Australia/Sydney'

/** Format a UTC ISO string as HH:MM (24h) in Sydney. */
export function formatSydTime(isoUTC: string): string {
  return new Date(isoUTC).toLocaleTimeString('en-AU', {
    timeZone: SYD,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Format a UTC ISO string as "Mon d MMM, HH:MM" in Sydney. */
export function formatSydDateTime(isoUTC: string): string {
  return new Date(isoUTC).toLocaleString('en-AU', {
    timeZone: SYD,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Return the Sydney calendar date as YYYY-MM-DD.
 * Use this as the grouping key in calendar views so blocks are filed under
 * the correct Sydney date, not the UTC date.
 */
export function sydneyDateKey(isoUTC: string): string {
  return new Date(isoUTC).toLocaleDateString('en-CA', { timeZone: SYD })
}

/** True when start and end fall on the same Sydney calendar date. */
export function isSameSydneyCalendarDay(startISO: string, endISO: string): boolean {
  return sydneyDateKey(startISO) === sydneyDateKey(endISO)
}

/**
 * Format a schedule block time range for display.
 *
 * Same Sydney day  → "HH:MM – HH:MM"
 * Different days   → "HH:MM, Tue 21 Apr – HH:MM, Wed 22 Apr"
 *
 * Using date + time for multi-day ranges prevents the confusing
 * "12:04 – 12:04" display for overnight / 24-hour blocks.
 */
export function formatAircraftTimeRange(startISO: string, endISO: string): string {
  const sameDay = isSameSydneyCalendarDay(startISO, endISO)

  const startTime = formatSydTime(startISO)
  const endTime   = formatSydTime(endISO)

  if (sameDay) return `${startTime} – ${endTime}`

  const startDate = new Date(startISO).toLocaleDateString('en-AU', {
    timeZone: SYD, weekday: 'short', day: 'numeric', month: 'short',
  })
  const endDate = new Date(endISO).toLocaleDateString('en-AU', {
    timeZone: SYD, weekday: 'short', day: 'numeric', month: 'short',
  })

  return `${startTime}, ${startDate} – ${endTime}, ${endDate}`
}

/**
 * Convert a datetime-local input value (YYYY-MM-DDTHH:MM) treated as
 * Sydney local time into a UTC ISO string.
 *
 * datetime-local inputs carry no timezone. Browsers and Node.js parse them as
 * local time, which differs by region. This function always anchors the
 * selected value to Australia/Sydney regardless of the runtime timezone.
 *
 * Returns null if the input is empty or unparseable.
 */
export function sydneyInputToUTC(dtLocalValue: string): string | null {
  if (!dtLocalValue || !dtLocalValue.includes('T')) return null
  // Append seconds so Date parsing is consistent across environments.
  const withSeconds = dtLocalValue.length === 16 ? `${dtLocalValue}:00` : dtLocalValue
  const naive = new Date(withSeconds)
  if (isNaN(naive.getTime())) return null

  // Compute the Sydney clock reading of `naive`, re-parsed as local time.
  // The difference between naive and sydneyEquiv is the offset we must apply.
  const sydneyEquiv = new Date(
    naive.toLocaleString('en-US', { timeZone: SYD }),
  )
  const offsetMs = naive.getTime() - sydneyEquiv.getTime()
  return new Date(naive.getTime() + offsetMs).toISOString()
}

/** Today's date as YYYY-MM-DD in Sydney timezone (for server-side "today" checks). */
export function todaySydneyDateKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: SYD })
}

/**
 * Debug snapshot for a schedule block — only for development use.
 * Returns a string summarising raw vs formatted values and the runtime timezone.
 */
export function debugBlockTimes(
  startISO: string,
  endISO:   string,
  label    = '',
): string {
  const runtimeTZ =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'unknown'
  return (
    `[ScheduleBlock${label ? ` (${label})` : ''}]\n` +
    `  raw start_time : ${startISO}\n` +
    `  raw end_time   : ${endISO}\n` +
    `  Sydney start   : ${formatSydDateTime(startISO)}\n` +
    `  Sydney end     : ${formatSydDateTime(endISO)}\n` +
    `  runtime TZ     : ${runtimeTZ}`
  )
}
