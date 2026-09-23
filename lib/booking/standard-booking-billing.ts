export type StandardBookingSubmissionMode = 'send_invoice' | 'mark_paid' | 'waived'

// How a "mark paid" settlement was actually received. Recorded on the ledger
// row's payment_method for reconciliation; never affects the credit balance.
export type ManualSettlementMethod = 'cash' | 'card_in_person' | 'bank_transfer'

export type MinimumVdoDecision = 'enforce_minimum' | 'bill_actual'

export type MinimumVdoBilling = {
  bookingDays: number
  minimumVdoHours: number
  actualVdoHours: number | null
  billedVdoHours: number | null
  isBelowMinimum: boolean
  requiresDecision: boolean
  appliedDecision: MinimumVdoDecision | null
}

export type StandardBookingBillingBranch =
  | {
      kind: 'waived'
      invoicePaymentMethod: null
      manualPaymentMethod: null
    }
  | {
      kind: 'invoice'
      invoicePaymentMethod: null
      manualPaymentMethod: null
    }

export function resolveStandardBookingBillingBranch(input: {
  submissionMode: StandardBookingSubmissionMode
}): StandardBookingBillingBranch {
  if (input.submissionMode === 'waived') {
    return {
      kind: 'waived',
      invoicePaymentMethod: null,
      manualPaymentMethod: null,
    }
  }

  return {
    kind: 'invoice',
    invoicePaymentMethod: null,
    manualPaymentMethod: null,
  }
}

/**
 * Maximum billable VDO hours for a booking.
 * Sub-24h (same-day) slots still allow up to 24h; multi-day slots allow 24h × days.
 * Important: do not multiply by bookingDays when it is 0 — that incorrectly
 * rejects every positive VDO readi ng on normal short bookings.
 */
export function resolveMaximumVdoHours(bookingDays: number): number {
  return 24.0 * Math.max(1, bookingDays)
}

/**
 * Calculates the number of booking days for multi-day rental policy.
 * Multi-day bookings spanning across Sydney calendar dates count unique calendar days.
 * Standalone hour-based slots without dates use 24h ceiling.
 * Sub-24h single-day slots return 0.
 */
function extractSydneyDatePart(val: string | Date | null | undefined): string | null {
  if (!val) return null
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  }
  if (typeof val === 'string') {
    const directDate = new Date(val)
    if (!isNaN(directDate.getTime())) {
      return directDate.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
    }
    // Handle formatted string e.g. "23 Dec 2026, 10:00 AM Sydney time (AEDT)"
    const cleaned = val.replace(/\s*Sydney time\s*\([A-Z]+\)/i, '').replace(/\s*\([A-Z]+\)/i, '').trim()
    const cleanedDate = new Date(cleaned)
    if (!isNaN(cleanedDate.getTime())) {
      return cleanedDate.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
    }
  }
  return null
}

export function calculateBookingDays(input: {
  bookingSlotHours?: number | null
  scheduledStart?: string | Date | null
  scheduledEnd?: string | Date | null
  bookingDays?: number | null
}): number {
  if (input.bookingDays != null && input.bookingDays > 0) {
    return input.bookingDays
  }
  if (input.scheduledStart && input.scheduledEnd) {
    const startStr = extractSydneyDatePart(input.scheduledStart)
    const endStr = extractSydneyDatePart(input.scheduledEnd)
    if (startStr && endStr) {
      if (startStr === endStr) return 0
      const startD = new Date(startStr + 'T00:00:00')
      const endD = new Date(endStr + 'T00:00:00')
      const diffDays = Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1
      return Math.max(2, diffDays)
    }
  }
  if (input.bookingSlotHours != null && input.bookingSlotHours >= 24) {
    return Math.max(2, Math.ceil(input.bookingSlotHours / 24))
  }
  return 0
}

export function resolveMinimumVdoBilling(input: {
  bookingSlotHours: number
  actualVdoHours: number | null
  decision?: MinimumVdoDecision | null
  scheduledStart?: string | Date | null
  scheduledEnd?: string | Date | null
  bookingDays?: number | null
}): MinimumVdoBilling {
  const bookingDays = calculateBookingDays({
    bookingSlotHours: input.bookingSlotHours,
    scheduledStart: input.scheduledStart,
    scheduledEnd: input.scheduledEnd,
    bookingDays: input.bookingDays,
  })
  const minimumVdoHours = bookingDays * 4

  if (input.actualVdoHours == null) {
    return {
      bookingDays,
      minimumVdoHours,
      actualVdoHours: null,
      billedVdoHours: null,
      isBelowMinimum: false,
      requiresDecision: false,
      appliedDecision: null,
    }
  }

  const isBelowMinimum = input.actualVdoHours < minimumVdoHours
  if (!isBelowMinimum) {
    return {
      bookingDays,
      minimumVdoHours,
      actualVdoHours: input.actualVdoHours,
      billedVdoHours: input.actualVdoHours,
      isBelowMinimum: false,
      requiresDecision: false,
      appliedDecision: null,
    }
  }

  if (input.decision == null) {
    return {
      bookingDays,
      minimumVdoHours,
      actualVdoHours: input.actualVdoHours,
      billedVdoHours: null,
      isBelowMinimum: true,
      requiresDecision: true,
      appliedDecision: null,
    }
  }

  const billedVdoHours = input.decision === 'enforce_minimum'
    ? minimumVdoHours
    : input.actualVdoHours

  return {
    bookingDays,
    minimumVdoHours,
    actualVdoHours: input.actualVdoHours,
    billedVdoHours,
    isBelowMinimum: true,
    requiresDecision: false,
    appliedDecision: input.decision,
  }
}

export function formatMinimumVdoBillingConfirmation(input: {
  billedVdoHours: number | null
  decision: MinimumVdoDecision | null
}): string {
  if (input.billedVdoHours == null) {
    return 'Choose a billing option to confirm the billed VDO hours.'
  }

  const billedVdoReason = input.decision === 'enforce_minimum'
    ? 'minimum enforced'
    : 'actual hours flown'

  return `This booking will be billed for ${input.billedVdoHours.toFixed(1)} h (${billedVdoReason}).`
}

export type MinimumVdoBillingDisplay = {
  billedVdoHours: number | null
  billedVdoSummary: string
  billedVdoConfirmation: string
}

export function resolveMinimumVdoBillingDisplay(input: MinimumVdoBilling): MinimumVdoBillingDisplay {
  const billedVdoHours = input.billedVdoHours ?? input.actualVdoHours

  return {
    billedVdoHours,
    billedVdoSummary: billedVdoHours != null ? `${billedVdoHours.toFixed(1)} h` : '—',
    billedVdoConfirmation: formatMinimumVdoBillingConfirmation({
      billedVdoHours,
      decision: input.appliedDecision,
    }),
  }
}

// ─── Block time landing invoice settlement ────────────────────────────────────
// The block time drawdown creates the landing fee invoice 'awaiting' with no
// payment method (invoices table, migration 106). This maps the admin's
// payment-path choice — the same chooser PAYF uses — onto that invoice.
// Overage invoices are NOT routed here: they always stay 'awaiting' and gate
// the account until paid (Stripe self-service or admin manual settlement).

export type BlockTimeLandingSettlement =
  | {
      // Case 2 — invoice-and-wait. The invoice keeps status 'awaiting' and
      // the customer chooses the payment method on their dashboard.
      action: 'await_payment'
    }
  | {
      // Case 3 — already paid in person. Settle immediately via the manual
      // payment path (ledger entry + invoice marked paid).
      action: 'settle_manual'
    }
  | {
      // Admin waived the landing fee. Invoice status becomes 'waived'.
      action: 'waive'
    }

export function resolveBlockTimeLandingSettlement(input: {
  submissionMode: StandardBookingSubmissionMode
}): BlockTimeLandingSettlement {
  if (input.submissionMode === 'waived') {
    return { action: 'waive' }
  }
  if (input.submissionMode === 'mark_paid') {
    return { action: 'settle_manual' }
  }
  return { action: 'await_payment' }
}
