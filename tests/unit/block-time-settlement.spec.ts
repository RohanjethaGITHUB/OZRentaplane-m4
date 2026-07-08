import { expect, test } from '@playwright/test'
import {
  resolveBlockTimeLandingSettlement,
  resolveStandardBookingBillingBranch,
  type StandardBookingSubmissionMode,
} from '@/lib/booking/standard-booking-billing'

// ─── Block time landing invoice settlement routing ───────────────────────────
// The landing invoice created by process_block_time_flight (migration 106,
// status 'awaiting', payment_method NULL) is routed by the same Case 1/2/3
// chooser PAYF uses. These tests pin the full 2×3 matrix.

test('Case 2 — send invoice leaves the invoice awaiting without a preselected method', () => {
  expect(
    resolveBlockTimeLandingSettlement({ submissionMode: 'send_invoice' }),
  ).toEqual({ action: 'await_payment' })
})

test('Case 2 — send invoice stays methodless for landing-fee routing', () => {
  expect(
    resolveBlockTimeLandingSettlement({ submissionMode: 'send_invoice' }),
  ).toEqual({ action: 'await_payment' })
})

test('Case 3 — mark paid settles manually without recording a method', () => {
  expect(
    resolveBlockTimeLandingSettlement({ submissionMode: 'mark_paid' }),
  ).toEqual({ action: 'settle_manual' })
})

test('Case 3 — mark paid stays on the manual-settlement path', () => {
  expect(
    resolveBlockTimeLandingSettlement({ submissionMode: 'mark_paid' }),
  ).toEqual({ action: 'settle_manual' })
})

test('waived resolves to waive regardless of payment method', () => {
  expect(resolveBlockTimeLandingSettlement({ submissionMode: 'waived' })).toEqual({ action: 'waive' })
})

test('no settlement outcome ever charges a stored card — every mode maps to await/manual/waive', () => {
  const modes: StandardBookingSubmissionMode[] = ['send_invoice', 'mark_paid', 'waived']
  for (const submissionMode of modes) {
    const settlement = resolveBlockTimeLandingSettlement({ submissionMode })
    expect(['await_payment', 'settle_manual', 'waive']).toContain(settlement.action)
  }
})

// ─── Standard booking regression — the selector-free branch is now null-based ─

test('standard booking billing branch is null-based for all non-waived modes', () => {
  expect(
    resolveStandardBookingBillingBranch({ submissionMode: 'send_invoice' }),
  ).toEqual({ kind: 'invoice', invoicePaymentMethod: null, manualPaymentMethod: null })

  expect(
    resolveStandardBookingBillingBranch({ submissionMode: 'mark_paid' }),
  ).toEqual({ kind: 'invoice', invoicePaymentMethod: null, manualPaymentMethod: null })

  expect(
    resolveStandardBookingBillingBranch({ submissionMode: 'waived' }),
  ).toEqual({ kind: 'waived', invoicePaymentMethod: null, manualPaymentMethod: null })
})

// The block-time resolver should still route mark-paid decisions to the
// manual-settlement path, but it no longer assigns a payment method.
test('block time mark paid still routes to manual settlement without a method', () => {
  const settlement = resolveBlockTimeLandingSettlement({ submissionMode: 'mark_paid' })
  expect(settlement).toEqual({ action: 'settle_manual' })
})
