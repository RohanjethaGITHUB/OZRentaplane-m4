/**
 * Timezone helpers for Sydney (Australia/Sydney) scheduled jobs.
 * Accurately handles AEST (UTC+10) and AEDT (UTC+11 daylight saving).
 */

const SYDNEY_TZ = 'Australia/Sydney'

/**
 * Returns YYYY-MM-DD in Sydney local time for any given Date.
 */
export function getSydneyDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date) // Output: "YYYY-MM-DD"
}

/**
 * Returns tomorrow's YYYY-MM-DD in Sydney local time.
 */
export function getSydneyTomorrowDateString(date: Date = new Date()): string {
  // To get tomorrow in Sydney safely, add 24 hours in milliseconds and compute Sydney date string
  const tomorrowApprox = new Date(date.getTime() + 24 * 60 * 60 * 1000)
  return getSydneyDateString(tomorrowApprox)
}

/**
 * Given a "YYYY-MM-DD" Sydney calendar date, calculates the exact UTC ISO
 * timestamp range for the full 24-hour day in Sydney (00:00:00.000 to 23:59:59.999).
 */
export function getSydneyDayUtcRange(dateStr: string): { startUtc: string; endUtc: string } {
  // Convert local Sydney midnight to UTC Date
  const startUtc = sydneyLocalToUtc(dateStr, '00:00:00.000')
  const endUtc = sydneyLocalToUtc(dateStr, '23:59:59.999')

  return {
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
  }
}

/**
 * Converts a "YYYY-MM-DD" date and "HH:mm:ss.sss" time in Sydney to a UTC Date object.
 */
function sydneyLocalToUtc(dateStr: string, timeStr: string): Date {
  // Guess UTC time first
  const tentativeUtc = new Date(`${dateStr}T${timeStr}Z`)
  
  // Format tentative date in Sydney to see the offset
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('sv', {
      timeZone: SYDNEY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d).replace(' ', 'T') + 'Z'

  const offsetMs = Date.parse(fmt(tentativeUtc)) - Date.parse(tentativeUtc.toISOString())
  
  // Adjust tentative UTC by the offset
  return new Date(tentativeUtc.getTime() - offsetMs)
}

/**
 * Calculates how many days until a target YYYY-MM-DD in Sydney from today in Sydney.
 */
export function getDaysUntilInSydney(targetDateStr: string, now: Date = new Date()): number {
  const todaySydney = getSydneyDateString(now)
  const targetMs = Date.parse(`${targetDateStr}T00:00:00Z`)
  const todayMs = Date.parse(`${todaySydney}T00:00:00Z`)
  return Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24))
}

/**
 * Returns the exact 7-day reporting range for the Friday 6 AM Weekly Digest in Sydney time.
 * Reporting window: Previous Friday 00:00:00 through Thursday 23:59:59 (7 complete days).
 */
export function getSydneyWeeklyDigestRange(now: Date = new Date()): {
  startDateStr: string
  endDateStr: string
  startUtc: string
  endUtc: string
  label: string
} {
  // Determine current day of week in Sydney (0 = Sun, 1 = Mon, ..., 4 = Thu, 5 = Fri, 6 = Sat)
  const sydneyDateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: SYDNEY_TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const weekdayStr = sydneyDateParts.find((p) => p.type === 'weekday')?.value ?? 'Fri'
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  const sydneyDayOfWeek = weekdayMap[weekdayStr] ?? 5

  // Calculate days back to the most recently concluded Thursday
  // If run on Friday (5), Thursday was 1 day ago.
  // If run on Saturday (6), Thursday was 2 days ago.
  // If run on Thursday (4), Thursday was 7 days ago.
  const daysSinceThursday = (sydneyDayOfWeek + 7 - 4) % 7 || 7

  const thursdayApprox = new Date(now.getTime() - daysSinceThursday * 24 * 60 * 60 * 1000)
  const thursdayDateStr = getSydneyDateString(thursdayApprox)

  const fridayApprox = new Date(thursdayApprox.getTime() - 6 * 24 * 60 * 60 * 1000)
  const fridayDateStr = getSydneyDateString(fridayApprox)

  const startUtc = sydneyLocalToUtc(fridayDateStr, '00:00:00.000').toISOString()
  const endUtc = sydneyLocalToUtc(thursdayDateStr, '23:59:59.999').toISOString()

  // Build human-friendly label in Sydney time
  const startFmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(startUtc))

  const endFmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(endUtc))

  const label = `${startFmt} – ${endFmt}`

  return {
    startDateStr: fridayDateStr,
    endDateStr: thursdayDateStr,
    startUtc,
    endUtc,
    label,
  }
}

