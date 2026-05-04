/**
 * checkout-payment-state.ts
 *
 * Shared helper for deriving the customer-facing checkout payment display state.
 * This is the single source of truth for what the customer sees — never expose
 * raw DB status strings directly in customer-facing UI.
 *
 * Display states:
 *   no_invoice                       — No checkout invoice exists yet
 *   awaiting_payment                 — Invoice issued, no payment attempt yet
 *   awaiting_manual_payment_confirmation — Bank transfer submitted, awaiting admin review
 *   paid                             — Payment confirmed (Stripe or admin-approved bank transfer)
 *   waived                           — Payment waived by admin
 */

export type CheckoutPaymentDisplayState =
  | 'no_invoice'
  | 'awaiting_payment'
  | 'awaiting_manual_payment_confirmation'
  | 'paid'
  | 'waived'

type InvoiceInput = {
  status: string // e.g. 'payment_required', 'paid', 'waived'
} | null

type BankTransferInput = {
  status: string // e.g. 'pending_review', 'approved', 'rejected'
} | null

/**
 * Derives a display state from the invoice status and the latest bank transfer
 * submission. This is used to determine what the customer sees on:
 *  - their dashboard/homepage (hero card CTA)
 *  - their booking detail page (next action card)
 *  - any "pay invoice" shortcut links
 *
 * Rules:
 * 1. No invoice → no_invoice
 * 2. Invoice is waived → waived
 * 3. Invoice is paid → paid
 * 4. Bank transfer is pending_review or approved (but invoice still payment_required)
 *    → awaiting_manual_payment_confirmation
 *    (approved-but-invoice-still-payment_required is a brief race condition window
 *    between the bank transfer approval and the invoice status update — treat the
 *    same as pending to avoid confusing the customer)
 * 5. Otherwise → awaiting_payment (Stripe payment still expected)
 */
export function getCheckoutPaymentDisplayState(
  invoice: InvoiceInput,
  bankTransferSubmission: BankTransferInput,
): CheckoutPaymentDisplayState {
  if (!invoice) return 'no_invoice'

  if (invoice.status === 'waived') return 'waived'
  if (invoice.status === 'paid')   return 'paid'

  // Bank transfer submitted and pending admin review or briefly in approved state
  // while the invoice webhook/action has not yet settled
  if (
    bankTransferSubmission &&
    (bankTransferSubmission.status === 'pending_review' ||
      bankTransferSubmission.status === 'approved')
  ) {
    return 'awaiting_manual_payment_confirmation'
  }

  return 'awaiting_payment'
}
