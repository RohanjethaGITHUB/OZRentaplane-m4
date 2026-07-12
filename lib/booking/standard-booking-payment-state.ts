export type StandardBookingPaymentDisplayState =
  | 'payment_required'
  | 'payment_still_due'
  | 'payment_review_pending'
  | 'payment_proof_rejected'
  | 'paid'
  | 'waived'
  | 'void'
  | 'failed'
  | 'unknown'

export type StandardBookingPaymentStateInput = {
  bookingStatus?: string | null
  invoiceStatus?: string | null
  invoicePaidAt?: string | null
  invoiceAmountDueCents?: number | null
  invoiceTotalPaidCents?: number | null
  latestSubmissionStatus?: string | null
  paymentStatus?: string | null
}

export function isStandardBookingInvoicePaid(
  input: Pick<
    StandardBookingPaymentStateInput,
    'invoiceStatus' | 'invoicePaidAt' | 'invoiceAmountDueCents' | 'invoiceTotalPaidCents'
  >,
): boolean {
  if (input.invoiceStatus === 'paid') {
    return true
  }

  const invoiceAmountDueCents = input.invoiceAmountDueCents ?? 0
  const invoiceTotalPaidCents = input.invoiceTotalPaidCents ?? 0

  return Boolean(input.invoicePaidAt) &&
    invoiceAmountDueCents > 0 &&
    invoiceTotalPaidCents >= invoiceAmountDueCents
}

export function getStandardBookingPaymentDisplayState(
  input: StandardBookingPaymentStateInput,
): StandardBookingPaymentDisplayState {
  const bookingStatus = input.bookingStatus ?? ''
  const invoiceStatus = input.invoiceStatus ?? ''
  const latestSubmissionStatus = input.latestSubmissionStatus ?? ''
  const invoiceAmountDueCents = input.invoiceAmountDueCents ?? 0
  const invoiceTotalPaidCents = input.invoiceTotalPaidCents ?? 0

  if (invoiceStatus === 'waived') return 'waived'
  if (invoiceStatus === 'void') return 'void'
  if (invoiceStatus === 'failed') return 'failed'
  if (isStandardBookingInvoicePaid(input)) return 'paid'

  if (
    invoiceStatus === 'bank_transfer_pending_review' ||
    latestSubmissionStatus === 'pending_review'
  ) {
    return 'payment_review_pending'
  }

  if (latestSubmissionStatus === 'rejected') {
    return 'payment_proof_rejected'
  }

  if (
    invoiceTotalPaidCents > 0 ||
    (invoiceAmountDueCents > 0 && Boolean(input.invoicePaidAt) && !isStandardBookingInvoicePaid(input))
  ) {
    return 'payment_still_due'
  }

  if (
    invoiceStatus === 'payment_required' ||
    bookingStatus === 'invoice_generated' ||
    bookingStatus === 'payment_pending' ||
    input.paymentStatus === 'invoice_generated'
  ) {
    return 'payment_required'
  }

  if (bookingStatus === 'completed') return 'unknown'

  return 'unknown'
}
