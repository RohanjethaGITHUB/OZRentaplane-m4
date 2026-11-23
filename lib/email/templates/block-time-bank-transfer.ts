import { renderBaseTemplate } from '@/lib/email/templates/base-template'
import { getAppUrl } from '@/lib/email/app-url'

const appUrl = getAppUrl()

type PurchaseDetails = {
  packageName: string
  packageHours: number
  amount: string
  transferReference: string
}

function purchaseDetails(d: PurchaseDetails) {
  return [
    { label: 'Package', value: `${d.packageName} (${d.packageHours} hours)` },
    { label: 'Amount', value: d.amount },
    { label: 'Payment Reference', value: d.transferReference },
  ]
}

/** Customer: we received the receipt and it is awaiting admin review. */
export function blockTimeBankTransferReceivedEmail(d: PurchaseDetails & { purchaseId: string }) {
  return {
    subject: `Receipt received — ${d.packageName} Block Time — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Payment receipt received',
      message:
        'Thanks — we have received your bank transfer receipt. Our team will verify the payment, usually within 2 to 24 hours. Your block time will be activated as soon as it is confirmed.',
      details: [...purchaseDetails(d), { label: 'Status', value: 'Awaiting admin review' }],
      ctaLabel: 'View Purchase',
      ctaUrl: `${appUrl}/dashboard/purchases/${d.purchaseId}/bank-transfer`,
    }),
  }
}

/** Admin: a customer uploaded a receipt that needs review. */
export function adminBlockTimeBankTransferUploadedEmail(
  d: PurchaseDetails & {
    purchaseId: string
    customerName: string
    customerEmail: string
    bonusHours?: number
    freeCheckout?: boolean
    isResubmission?: boolean
  },
) {
  return {
    subject: `[Action needed] Block time bank transfer to verify — ${d.customerName} — ${d.amount}`,
    html: renderBaseTemplate({
      headline: d.isResubmission ? 'New receipt uploaded for review' : 'Block time bank transfer receipt uploaded',
      message: `${d.customerName} uploaded a bank transfer receipt for a block time purchase. Please verify the payment against the bank account and approve, request a clearer receipt, or reject.`,
      details: [
        { label: 'Customer', value: `${d.customerName} (${d.customerEmail})` },
        ...purchaseDetails(d),
        ...(d.bonusHours && d.bonusHours > 0 ? [{ label: 'Promo Bonus Hours', value: `+${d.bonusHours}` }] : []),
        ...(d.freeCheckout ? [{ label: 'Promo', value: 'Includes free checkout flight' }] : []),
      ],
      ctaLabel: 'Review Receipt',
      ctaUrl: `${appUrl}/admin/block-time-purchases/${d.purchaseId}`,
    }),
  }
}

/** Customer: admin needs a clearer / different receipt. */
export function blockTimeBankTransferResubmitEmail(d: PurchaseDetails & { purchaseId: string; note: string }) {
  return {
    subject: `Action needed: please re-upload your payment receipt — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Please upload a new receipt',
      message: `We could not complete verification of your bank transfer with the receipt provided. Reason: ${d.note}. Please upload a clear receipt or screenshot showing the successful transfer.`,
      details: [
        ...purchaseDetails(d),
        { label: 'Status', value: 'New receipt required' },
        { label: 'Reviewer Note', value: d.note },
      ],
      ctaLabel: 'Upload New Receipt',
      ctaUrl: `${appUrl}/dashboard/purchases/${d.purchaseId}/bank-transfer`,
    }),
  }
}

/** Customer: payment could not be verified. */
export function blockTimeBankTransferRejectedEmail(d: PurchaseDetails & { purchaseId: string; note: string }) {
  return {
    subject: `Payment verification update — ${d.packageName} Block Time — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Payment could not be verified',
      message: `Your bank transfer for this block time purchase could not be verified. Reason: ${d.note}. If you have already paid, please upload a new receipt or contact us. Your package has not been activated.`,
      details: [
        ...purchaseDetails(d),
        { label: 'Status', value: 'Payment not verified' },
        { label: 'Reviewer Note', value: d.note },
      ],
      ctaLabel: 'View Purchase',
      ctaUrl: `${appUrl}/dashboard/purchases/${d.purchaseId}/bank-transfer`,
    }),
  }
}
