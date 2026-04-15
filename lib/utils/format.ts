/**
 * Shared timestamp formatter — produces IDENTICAL output on
 * both Node.js (SSR) and browser (client) to prevent React
 * hydration mismatches.
 *
 * Root cause of the hydration bug:
 *   toLocaleString('en-AU', { hour: '2-digit', ... }) uses
 *   locale-specific separators that differ between Node.js ICU
 *   data and the browser's native Intl implementation.
 *   Node may produce "15 Apr 2026, 12:15 pm"
 *   while the browser produces "15 Apr 2026 at 12:15 PM".
 *
 * This utility builds the string manually using UTC values so
 * the output is always deterministic regardless of environment.
 *
 * All dates stored in Supabase are UTC ISO strings.
 * We display them in UTC for consistency (no timezone mystery).
 * If you want AEST/AEDT, add the `timeZone` option to the
 * Intl.DateTimeFormat call below — but keep it explicit and
 * fixed so SSR and client agree.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Format an ISO timestamp as "15 Apr 2026, 12:15 pm"
 * Deterministic on both server and client.
 */
export function fmtTimestamp(iso: string): string {
  const d = new Date(iso)
  const day    = d.getUTCDate()
  const month  = MONTHS[d.getUTCMonth()]
  const year   = d.getUTCFullYear()
  const h24    = d.getUTCHours()
  const min    = String(d.getUTCMinutes()).padStart(2, '0')
  const ampm   = h24 >= 12 ? 'pm' : 'am'
  const h12    = h24 % 12 || 12
  return `${day} ${month} ${year}, ${h12}:${min} ${ampm}`
}

/**
 * Format an ISO timestamp as just "15 Apr 2026"
 */
export function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
