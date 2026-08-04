/**
 * Resolve checkout outcome for display when no checkout_invoice exists
 * (e.g. admin clearance override / manual completion without billing).
 */
export function outcomeFromAuditNewValue(newValue: unknown): string | null {
  if (!newValue || typeof newValue !== 'object') return null
  const record = newValue as Record<string, unknown>
  const outcome = record.outcome ?? record.pilot_clearance_status ?? record.checkout_outcome
  if (typeof outcome !== 'string' || !outcome.trim()) return null
  return outcome
}

export const CHECKOUT_OUTCOME_AUDIT_EVENT_TYPES = [
  'checkout_manual_completion_submitted',
  'checkout_outcome_recorded',
] as const
