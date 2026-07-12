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

export function resolveMinimumVdoBilling(input: {
  bookingSlotHours: number
  actualVdoHours: number | null
  decision?: MinimumVdoDecision | null
}): MinimumVdoBilling {
  const bookingDays = input.bookingSlotHours >= 24
    ? Math.floor(input.bookingSlotHours / 24)
    : 0
  const minimumVdoHours = bookingDays * 4

  if (input.actualVdoHours == null) {
    // TEMP LIVE-VERIFY instrumentation — REMOVE
    console.log('[LIVE-VERIFY resolveMinimumVdoBilling] BRANCH=null-short-circuit (L59)', JSON.stringify({ bookingSlotHours: input.bookingSlotHours, bookingDays, minimumVdoHours, actualVdoHours: null }))
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
  // TEMP LIVE-VERIFY instrumentation — REMOVE
  console.log(`[LIVE-VERIFY resolveMinimumVdoBilling] BRANCH=${isBelowMinimum ? 'below-minimum (L84+)' : 'above-minimum (L72)'}`, JSON.stringify({ bookingSlotHours: input.bookingSlotHours, bookingDays, minimumVdoHours, actualVdoHours: input.actualVdoHours, decision: input.decision ?? null }))
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
