// Customer-facing label for a block time purchase. A purchase stays 'pending'
// until the admin approves the bank transfer, so the label depends on where the
// latest receipt is in review. Safe to import from client components.

export type ReceiptStatus = 'pending_review' | 'approved' | 'resubmission_requested' | 'rejected' | string | null | undefined

export type PurchaseStatusDisplay = {
  label: string
  /** Tailwind classes for a pill (text + bg + border). */
  pillClass: string
  dotClass: string
}

export function pendingPurchaseDisplay(receiptStatus: ReceiptStatus): PurchaseStatusDisplay {
  switch (receiptStatus) {
    case 'pending_review':
      return {
        label: 'Payment verification pending',
        pillClass: 'text-amber-700 bg-amber-50 border-amber-200',
        dotClass: 'bg-amber-400',
      }
    case 'resubmission_requested':
      return {
        label: 'New receipt needed',
        pillClass: 'text-blue-700 bg-blue-50 border-blue-200',
        dotClass: 'bg-blue-500',
      }
    case 'rejected':
      return {
        label: 'Payment not verified',
        pillClass: 'text-red-700 bg-red-50 border-red-200',
        dotClass: 'bg-red-400',
      }
    default:
      return {
        label: 'Awaiting payment',
        pillClass: 'text-slate-700 bg-slate-50 border-slate-200',
        dotClass: 'bg-slate-400',
      }
  }
}
