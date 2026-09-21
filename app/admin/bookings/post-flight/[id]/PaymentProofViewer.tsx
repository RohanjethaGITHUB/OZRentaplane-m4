'use client'

import { useState } from 'react'
import DocumentViewerModal, { type DocumentFile } from '@/components/ui/DocumentViewerModal'
import { formatDateTime } from '@/lib/formatDateTime'

type BankTransferData = {
  id: string
  receiptStoragePath: string | null
  receiptSignedUrl: string | null
  receiptFilename: string | null
  referenceNumber: string | null
  amountCents: number
  submittedAt: string | null
  status: string
}

type InvoiceData = {
  id: string
  invoiceNumber: string | null
  totalAmountCents: number
  totalPaidCents: number
  paymentMethod: string | null
  stripePaymentIntentId: string | null
  status: string
  createdAt: string
  paidAt: string | null
}

type Props = {
  invoice: InvoiceData | null
  bankSubmission: BankTransferData | null
  isBlockTime?: boolean
}

export default function PaymentProofViewer({ invoice, bankSubmission, isBlockTime }: Props) {
  const [viewerOpen, setViewerOpen] = useState(false)

  const isBankTransfer = invoice?.paymentMethod === 'bank_transfer' || Boolean(bankSubmission)
  const isCard = invoice?.paymentMethod === 'stripe_card' || invoice?.paymentMethod === 'card' || Boolean(invoice?.stripePaymentIntentId)

  const receiptFiles: DocumentFile[] = bankSubmission?.receiptSignedUrl
    ? [
        {
          url: bankSubmission.receiptSignedUrl,
          name: bankSubmission.receiptFilename || 'bank_transfer_receipt',
        },
      ]
    : []

  const formattedTotal = ((invoice?.totalAmountCents ?? bankSubmission?.amountCents ?? 0) / 100).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
  })

  return (
    <div className="rounded-2xl border border-[var(--admin-border)] bg-white p-6 shadow-[var(--admin-shadow-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--admin-border)] pb-4 mb-5">
        <div>
          <h3 className="text-base font-semibold text-[var(--admin-text)]">Payment Verification Proof</h3>
          <p className="text-xs text-[var(--admin-text-muted)] mt-0.5">
            Customer-submitted payment details and evidence proof
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          Payment Verification Required
        </span>
      </div>

      {isBankTransfer && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-[#1a4fd6]">
                <span className="material-symbols-outlined text-xl">account_balance</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">NAB Direct Deposit</p>
                <p className="text-[11px] text-slate-500">Bank Transfer Proof Attached</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-900 tabular-nums">{formattedTotal}</p>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-blue-600">Proof Submitted</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-slate-100 bg-[#f9fafb] p-3">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-1">
                Reference Provided
              </span>
              <span className="font-mono font-medium text-slate-800">
                {bankSubmission?.referenceNumber || '—'}
              </span>
            </div>
            <div className="rounded-xl border border-slate-100 bg-[#f9fafb] p-3">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-1">
                Submitted At
              </span>
              <span className="text-slate-800">
                {bankSubmission?.submittedAt ? formatDateTime(bankSubmission.submittedAt) : '—'}
              </span>
            </div>
          </div>

          {bankSubmission?.receiptSignedUrl ? (
            <div className="mt-4">
              <span className="text-xs font-medium text-slate-600 block mb-2">Attached Receipt Document</span>
              <div
                onClick={() => setViewerOpen(true)}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-900/5 p-4 text-center transition-all hover:border-[#1a4fd6] hover:bg-blue-50/50"
              >
                <div className="flex items-center justify-center gap-2 text-sm font-medium text-[#1a4fd6]">
                  <span className="material-symbols-outlined text-xl">receipt_long</span>
                  <span>View Full Receipt Document</span>
                  <span className="material-symbols-outlined text-base transition-transform group-hover:translate-x-0.5">
                    open_in_new
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {bankSubmission.receiptFilename || 'Click to view uploaded receipt file'}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              No receipt document file was attached with this bank transfer submission.
            </div>
          )}
        </div>
      )}

      {isCard && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <span className="material-symbols-outlined text-xl">credit_card</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">Stripe Card Payment</p>
                <p className="text-[11px] text-slate-500">Processed online via Stripe Checkout</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-900 tabular-nums">{formattedTotal}</p>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">Online Paid</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-slate-100 bg-[#f9fafb] p-3">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-1">
                Transaction / Intent Ref
              </span>
              <span className="font-mono text-[11px] text-slate-800 truncate block" title={invoice?.stripePaymentIntentId || ''}>
                {invoice?.stripePaymentIntentId ? invoice.stripePaymentIntentId.slice(-12) : 'Stripe Session'}
              </span>
            </div>
            <div className="rounded-xl border border-slate-100 bg-[#f9fafb] p-3">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-1">
                Status
              </span>
              <span className="font-semibold text-emerald-700">
                Payment Received (Pending Meter Verification)
              </span>
            </div>
          </div>
        </div>
      )}

      {isBlockTime && (
        <div className="rounded-xl bg-indigo-50/70 p-4 border border-indigo-200 text-xs">
          <div className="flex items-center gap-2 font-semibold text-indigo-950 mb-1">
            <span className="material-symbols-outlined text-indigo-700 text-base">timer</span>
            Block Time Hour Package
          </div>
          <p className="text-indigo-800">
            Flight hours deducted directly from pilot active block time purchase allocation.
          </p>
        </div>
      )}

      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        files={receiptFiles}
        title="Bank Transfer Receipt Proof"
      />
    </div>
  )
}
