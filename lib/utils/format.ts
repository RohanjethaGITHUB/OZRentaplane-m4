/**
 * Re-exports from the canonical date/time formatter.
 *
 * Existing callers (DocumentsPanel, DashboardContent) import fmtTimestamp and
 * fmtDate from here. This shim keeps those imports working while switching the
 * implementation to the deterministic Sydney-timezone utility.
 *
 * fmtTimestamp(iso)  → "22 Apr 2026, 11:25 AM Sydney time (AEST)"
 * fmtDate(iso)       → "22 Apr 2026"  (Sydney date extracted from ISO timestamp)
 */
export { formatDateTime as fmtTimestamp, formatDateFromISO as fmtDate } from '@/lib/formatDateTime'
