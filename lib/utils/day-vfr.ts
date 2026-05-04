/**
 * Day VFR booking window helpers.
 *
 * Seasonal rules for Sydney (AEST/AEDT):
 *   Short daylight season — first Sunday in April → first Sunday in October:
 *     Allowed departure window: 08:00 – 16:30
 *
 *   Long daylight season  — first Sunday in October → first Sunday in April:
 *     Allowed departure window: 08:00 – 19:00
 *
 * All dateStr parameters must be YYYY-MM-DD strings in Sydney local time.
 */

// Returns YYYY-MM-DD of the first Sunday of a given month/year using UTC arithmetic.
function firstSundayOf(year: number, month: number): string {
  // month is 1-indexed
  const d   = new Date(Date.UTC(year, month - 1, 1))
  const dow = d.getUTCDay()                          // 0 = Sunday
  const offset = dow === 0 ? 0 : 7 - dow
  const sun = new Date(Date.UTC(year, month - 1, 1 + offset))
  return [
    sun.getUTCFullYear(),
    String(sun.getUTCMonth() + 1).padStart(2, '0'),
    String(sun.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Returns the allowed Day VFR departure window for a Sydney date string.
 * Both start and end are HH:MM strings (24-hour).
 * A departure time is valid when: start <= departureTime < end.
 */
export function getDayVfrWindow(dateStr: string): { start: string; end: string } {
  if (!dateStr) return { start: '08:00', end: '16:30' }
  const year       = parseInt(dateStr.slice(0, 4), 10)
  const aprSunday  = firstSundayOf(year, 4)   // first Sunday in April
  const octSunday  = firstSundayOf(year, 10)  // first Sunday in October

  // Short daylight (winter): April first Sunday → October first Sunday
  if (dateStr >= aprSunday && dateStr < octSunday) {
    return { start: '08:00', end: '16:30' }
  }
  // Long daylight (summer): October first Sunday → April first Sunday
  return { start: '08:00', end: '19:00' }
}

/**
 * Returns true if the HH:MM departure time is within the allowed Day VFR window
 * for the given Sydney date. Inclusive of start, exclusive of end.
 */
export function isWithinDayVfrWindow(timeStr: string, dateStr: string): boolean {
  if (!timeStr || !dateStr) return false
  const w = getDayVfrWindow(dateStr)
  return timeStr >= w.start && timeStr < w.end
}

/**
 * Server-side: returns true if the booking is allowed given the pilot's Night VFR status.
 * Converts the UTC ISO scheduled_start to Sydney local time before window-checking.
 * Pilots with Night VFR = true bypass the window check entirely.
 */
export function isBookingTimeAllowed(
  scheduledStartUTC: string,
  hasNightVfrRating: boolean | null,
): boolean {
  if (hasNightVfrRating === true) return true

  const d = new Date(scheduledStartUTC)

  // en-CA gives YYYY-MM-DD natively; en-GB with hour12:false gives HH:MM (24h)
  const sydDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
  }).format(d)

  const sydTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Sydney',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  }).format(d)

  return isWithinDayVfrWindow(sydTime, sydDate)
}
