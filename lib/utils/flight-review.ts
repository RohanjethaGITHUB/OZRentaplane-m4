/**
 * Shared helpers for flight review date validation.
 *
 * Works in both Node.js (server actions) and modern browsers (client components).
 * All dates are evaluated in Sydney timezone.
 */

/**
 * Returns the earliest valid flight review date as a YYYY-MM-DD string in
 * Sydney local time. Dates earlier than this are more than 2 years in the past.
 */
export function getFlightReviewCutoff(): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const year  = parseInt(today.slice(0, 4), 10)
  return `${year - 2}${today.slice(4)}`
}

/**
 * Validates a flight review date string (expected: YYYY-MM-DD in Sydney time).
 * Returns null when valid, or a user-facing error message when invalid.
 */
export function validateFlightReviewDate(dateStr: string): string | null {
  const trimmed = dateStr.trim()
  if (!trimmed) return 'Flight review date is required.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return 'Invalid date format.'

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  if (trimmed > today) return 'Flight review date cannot be in the future.'

  const cutoff = getFlightReviewCutoff()
  if (trimmed < cutoff) return 'Flight review date cannot be more than 2 years in the past.'

  return null
}
