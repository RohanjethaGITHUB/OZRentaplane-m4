'use client'

import React, { useEffect } from 'react'
import Link from 'next/link'
import ModalPortal from '@/components/ModalPortal'
import { CustomerInvoice, CustomerBillingDetails } from './types'
import PaymentMethodBadge from './PaymentMethodBadge'
import SettlementTypeBadge from './SettlementTypeBadge'
import InvoiceStatusBadge from './InvoiceStatusBadge'
import { formatDateFromISO, formatDashboardTimestamp } from '@/lib/formatDateTime'

function formatAud(amount: number, currency: string = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency.toUpperCase() || 'AUD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function cleanAircraftName(model?: string | null, reg?: string | null): string {
  if (!model && !reg) return 'Cessna 172'
  if (!model) return reg || 'Cessna 172'
  return model.replace(/^VH-[A-Z0-9]+\s*([·—\-–]\s*)?/i, '').trim() || model
}

export default function InvoiceDetailsDrawer({
  invoice,
  billingDetails,
  isOpen,
  onClose,
  onDownloadPdf,
  isDownloading = false,
}: {
  invoice: CustomerInvoice | null
  billingDetails: CustomerBillingDetails
  isOpen: boolean
  onClose: () => void
  onDownloadPdf: (invoice: CustomerInvoice) => void
  isDownloading?: boolean
}) {
  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !invoice) return null

  const isWaived = invoice.settlementType === 'ADMIN_WAIVER' || invoice.status === 'WAIVED'
  const isSettled = invoice.settlementType === 'ADMIN_SETTLEMENT' || invoice.status === 'SETTLED'
  const isRefunded = invoice.status === 'REFUNDED' || (invoice.refunds && invoice.refunds.length > 0)
  const isPartial = invoice.status === 'PARTIALLY_PAID' || (invoice.paidAmount > 0 && invoice.outstandingAmount > 0)
  const percentagePaid = invoice.total > 0 ? Math.min(100, Math.round((invoice.paidAmount / invoice.total) * 100)) : 100
  const isCheckout =
    invoice.serviceType === 'checkout' ||
    invoice.serviceName?.toLowerCase().includes('checkout') ||
    invoice.invoiceNumber?.toLowerCase().includes('chk')
  const isPackage =
    invoice.serviceType === 'package' ||
    invoice.serviceName?.toLowerCase().includes('package') ||
    invoice.invoiceNumber?.toLowerCase().includes('pkg')

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-2xl max-h-[90vh] bg-white border border-[#152d5a]/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Invoice Details"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Header */}
          <div className="px-5 py-4 sm:px-6 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-slate-50/50 sticky top-0 z-20 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#152d5a] text-white flex items-center justify-center font-bold shadow-sm shrink-0">
                <span className="material-symbols-outlined text-[20px]">receipt_long</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-[#152d5a] truncate">Invoice Details</h3>
                <p className="text-xs text-slate-500 font-mono truncate mt-0.5">{invoice.invoiceNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <InvoiceStatusBadge status={invoice.status} />
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ml-2"
                aria-label="Close details"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </div>

          {/* Modal Body Content */}
          <div className="p-5 sm:p-6 space-y-6 flex-1 overflow-y-auto text-xs sm:text-sm">
          {/* Main Summary Header Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-[#f8fbff] to-[#edf4fc] border border-[#1a4fd6]/15 space-y-3 shadow-sm">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Total Amount
                </span>
                <span className="text-2xl font-extrabold text-[#152d5a] tracking-tight">
                  {formatAud(invoice.amount, invoice.currency)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {isWaived ? 'Waived Date' : isSettled ? 'Settled Date' : 'Payment Date'}
                </span>
                <span className="text-xs font-semibold text-slate-700">
                  {formatDateFromISO(invoice.date)}
                </span>
              </div>
            </div>

            {/* Partial Payment Progress Bar */}
            {isPartial && (
              <div className="pt-2 border-t border-slate-200/60 space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-blue-700">{percentagePaid}% Paid ({formatAud(invoice.paidAmount)})</span>
                  <span className="text-amber-700">Due: {formatAud(invoice.outstandingAmount)}</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{ width: `${percentagePaid}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Booking & Aircraft Summary */}
          {(invoice.bookingReference || invoice.aircraftRegistration) && (
            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                    isCheckout
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                      : isPackage
                      ? 'bg-amber-50 text-amber-700 border-amber-100'
                      : 'bg-blue-50 text-[#1a4fd6] border-blue-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {isCheckout ? 'flight_takeoff' : isPackage ? 'inventory_2' : 'flight'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-[#152d5a] block text-xs">
                    {invoice.serviceName}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {cleanAircraftName(invoice.aircraftModel, invoice.aircraftRegistration)}
                  </span>
                </div>
              </div>
              {invoice.bookingReference && (
                <span className="px-2 py-0.5 rounded bg-slate-200/70 font-mono text-[11px] font-bold text-slate-700">
                  {invoice.bookingReference}
                </span>
              )}
            </div>
          )}

          {/* Section 1: PAYMENT & SETTLEMENT */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5 text-[#152d5a]">
              <span className="material-symbols-outlined text-[16px] text-emerald-600">credit_card</span>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#4b6390]">
                Payment & Settlement
              </h4>
            </div>

            {/* Specific Layout per Settlement Mechanism */}
            {isWaived ? (
              /* Admin Waiver Details */
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/70 space-y-3">
                <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-slate-500 shrink-0 mt-0.5">
                    info
                  </span>
                  <div>
                    <strong className="block font-semibold">Administrator Waiver</strong>
                    This amount was waived by an administrator. The customer was not charged.
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block">Settlement Type</span>
                    <SettlementTypeBadge type="ADMIN_WAIVER" />
                  </div>
                  <div>
                    <span className="text-slate-400 block">Status</span>
                    <InvoiceStatusBadge status="WAIVED" />
                  </div>
                  <div>
                    <span className="text-slate-400 block">Waived Amount</span>
                    <span className="font-bold text-[#152d5a]">{formatAud(invoice.amount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Waived Date</span>
                    <span className="text-slate-700 font-medium">{formatDateFromISO(invoice.waivedAt || invoice.date)}</span>
                  </div>
                  {invoice.waivedBy && (
                    <div className="col-span-2">
                      <span className="text-slate-400 block">Waived By</span>
                      <span className="text-slate-800 font-medium">{invoice.waivedBy}</span>
                    </div>
                  )}
                  {invoice.waiverReason && (
                    <div className="col-span-2">
                      <span className="text-slate-400 block">Reason</span>
                      <span className="text-slate-800 font-medium italic">{invoice.waiverReason}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : isSettled ? (
              /* Admin Settlement Details */
              <div className="rounded-xl border border-teal-200/80 p-4 bg-teal-50/30 space-y-3">
                <div className="p-2.5 rounded-lg bg-teal-100/50 border border-teal-200 text-teal-900 text-xs flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-teal-600 shrink-0 mt-0.5">
                    manage_accounts
                  </span>
                  <div>
                    <strong className="block font-semibold">Administrative Settlement</strong>
                    This balance was manually resolved by management.
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block">Settlement Type</span>
                    <SettlementTypeBadge type="ADMIN_SETTLEMENT" />
                  </div>
                  <div>
                    <span className="text-slate-400 block">Status</span>
                    <InvoiceStatusBadge status="SETTLED" />
                  </div>
                  <div>
                    <span className="text-slate-400 block">Settled Amount</span>
                    <span className="font-bold text-[#152d5a]">{formatAud(invoice.amount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Settlement Date</span>
                    <span className="text-slate-700 font-medium">{formatDateFromISO(invoice.settledAt || invoice.date)}</span>
                  </div>
                  {invoice.settledBy && (
                    <div className="col-span-2">
                      <span className="text-slate-400 block">Settled By</span>
                      <span className="text-slate-800 font-medium">{invoice.settledBy}</span>
                    </div>
                  )}
                  {invoice.settlementReason && (
                    <div className="col-span-2">
                      <span className="text-slate-400 block">Reason</span>
                      <span className="text-slate-800 font-medium italic">{invoice.settlementReason}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Customer Payment (Card, Cash, Online, Bank Transfer) */
              <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/50 space-y-2.5">
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-500">Payment Method</span>
                  <PaymentMethodBadge method={invoice.paymentMethod} card={invoice.card} />
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-500">Payment Type</span>
                  <span className="font-semibold text-[#152d5a]">Customer Payment</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-500">Payment Status</span>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-500">Payment Date</span>
                  <span className="text-slate-700 font-medium">{formatDateFromISO(invoice.date)}</span>
                </div>
                {invoice.transactionId && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500">Transaction ID</span>
                    <span className="font-mono text-slate-700 text-[11px] font-semibold">{invoice.transactionId}</span>
                  </div>
                )}
                {invoice.provider && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500">Payment Provider</span>
                    <span className="font-medium text-slate-700">{invoice.provider}</span>
                  </div>
                )}
                {invoice.bankReference && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500">Bank Reference</span>
                    <span className="font-mono text-slate-700 font-bold">{invoice.bankReference}</span>
                  </div>
                )}
                {invoice.adminName && invoice.paymentMethod === 'cash' && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500">Recorded By</span>
                    <span className="text-slate-700 font-medium">{invoice.adminName}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Refund Breakdown if applicable */}
          {isRefunded && invoice.refunds && invoice.refunds.length > 0 && (
            <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-900 text-xs flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px]">undo</span>
                  Refund Information
                </span>
                <span className="text-xs font-semibold text-purple-700">
                  {formatDateFromISO(invoice.refunds[0].refundDate)}
                </span>
              </div>
              <div className="text-xs text-purple-800 space-y-1 pt-1">
                <div className="flex justify-between">
                  <span>Refund Amount:</span>
                  <span className="font-bold">{formatAud(invoice.refunds[0].amount)}</span>
                </div>
                <div className="flex justify-between font-mono text-[11px]">
                  <span>Reference:</span>
                  <span>{invoice.refunds[0].reference}</span>
                </div>
              </div>
            </div>
          )}

          {/* Section 2: CUSTOMER BILLING DETAILS */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5 text-[#152d5a]">
              <span className="material-symbols-outlined text-[16px] text-blue-600">person</span>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#4b6390]">
                Customer Billing Details
              </h4>
            </div>
            <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Name</span>
                <span className="font-bold text-[#152d5a]">{billingDetails.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Email</span>
                <span className="text-slate-700">{billingDetails.email}</span>
              </div>
              {billingDetails.phone && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Phone</span>
                  <span className="text-slate-700">{billingDetails.phone}</span>
                </div>
              )}
              {billingDetails.address && (
                <div className="flex justify-between items-start pt-1 border-t border-slate-100">
                  <span className="text-slate-500 shrink-0">Billing Address</span>
                  <span className="text-slate-700 text-right max-w-[220px]">{billingDetails.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: INVOICE ITEMS */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5 text-[#152d5a]">
              <span className="material-symbols-outlined text-[16px] text-indigo-600">description</span>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#4b6390]">
                Invoice Items
              </h4>
            </div>
            <div className="rounded-xl border border-slate-100 overflow-hidden bg-slate-50/30">
              <div className="p-3 bg-slate-100/70 border-b border-slate-100 flex justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <span>Description</span>
                <span>Amount ({invoice.currency})</span>
              </div>
              <div className="divide-y divide-slate-100 p-3 space-y-2 text-xs">
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-1">
                      <span className="text-slate-700">{item.description}</span>
                      <span className="font-semibold text-slate-800">{formatAud(item.amount, invoice.currency)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-700">{invoice.serviceName}</span>
                    <span className="font-semibold text-slate-800">{formatAud(invoice.amount, invoice.currency)}</span>
                  </div>
                )}

                {/* Subtotal, GST, Total */}
                <div className="pt-2 border-t border-slate-200 space-y-1 text-slate-600">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-medium">{formatAud(invoice.subtotal, invoice.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST (10%)</span>
                    <span className="font-medium">{formatAud(invoice.gst, invoice.currency)}</span>
                  </div>
                  {invoice.serviceFee && invoice.serviceFee > 0 ? (
                    <div className="flex justify-between">
                      <span>Service fee</span>
                      <span className="font-medium">{formatAud(invoice.serviceFee, invoice.currency)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-sm text-[#152d5a]">
                    <span>Total</span>
                    <span>{formatAud(invoice.total, invoice.currency)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: PAYMENT HISTORY */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5 text-[#152d5a]">
              <span className="material-symbols-outlined text-[16px] text-amber-600">history</span>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#4b6390]">
                Payment History
              </h4>
            </div>
            <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/50 space-y-3">
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-2 before:w-0.5 before:bg-slate-200">
                {invoice.timeline && invoice.timeline.length > 0 ? (
                  invoice.timeline.map((ev) => (
                    <div key={ev.id} className="flex items-start gap-3 relative">
                      <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-sm shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-[#152d5a] text-xs">{ev.title}</div>
                        <div className="text-[11px] text-slate-500">{ev.description}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{ev.timestamp}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex items-start gap-3 relative">
                      <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-sm shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-[#152d5a] text-xs">
                          {isWaived ? 'Admin waiver applied' : isSettled ? 'Admin settlement completed' : 'Payment received'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatAud(invoice.amount)} · {isWaived ? 'Waived' : isSettled ? 'Settled' : 'Card'}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{formatDateFromISO(invoice.date)}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 relative">
                      <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-sm shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-[#152d5a] text-xs">Invoice issued</div>
                        <div className="text-[11px] text-slate-500">{invoice.invoiceNumber}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{formatDateFromISO(invoice.date)}</div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end shrink-0">
          <button
            type="button"
            disabled={isDownloading}
            onClick={() => onDownloadPdf(invoice)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#152d5a] hover:bg-[#1a3a6e] text-white text-xs sm:text-sm font-bold transition-all shadow-sm disabled:opacity-60 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">
              {isDownloading ? 'hourglass_top' : 'download'}
            </span>
            {isDownloading ? 'Generating PDF...' : 'Download Invoice PDF'}
          </button>
        </div>
      </div>
    </div>
  </ModalPortal>
  )
}
