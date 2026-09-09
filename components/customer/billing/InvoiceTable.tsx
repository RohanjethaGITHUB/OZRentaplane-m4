'use client'

import React from 'react'
import { CustomerInvoice } from './types'
import PaymentMethodBadge from './PaymentMethodBadge'
import InvoiceStatusBadge from './InvoiceStatusBadge'
import { formatDateFromISO } from '@/lib/formatDateTime'

function formatAud(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function cleanAircraftName(model?: string | null, reg?: string | null): string {
  if (!model && !reg) return 'Cessna 172'
  if (!model) return reg || 'Cessna 172'
  // Remove any redundant registration prefix in model string if present e.g. "VH-KZG — Cessna 172" -> "Cessna 172"
  return model.replace(/^VH-[A-Z0-9]+\s*([·—\-–]\s*)?/i, '').trim() || model
}

export default function InvoiceTable({
  invoices,
  onDownloadInvoice,
  downloadingId,
  sortField,
  sortOrder,
  onSortChange,
  page,
  pageSize,
  onPageChange,
}: {
  invoices: CustomerInvoice[]
  onDownloadInvoice: (invoice: CustomerInvoice) => void
  downloadingId: string | null
  sortField: 'date' | 'amount'
  sortOrder: 'asc' | 'desc'
  onSortChange: (field: 'date' | 'amount') => void
  page: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const totalInvoices = invoices.length
  const totalPages = Math.ceil(totalInvoices / pageSize) || 1
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalInvoices)
  const paginatedInvoices = invoices.slice(startIndex, endIndex)

  return (
    <div className="w-full flex flex-col justify-between min-h-[360px]">
      {/* Desktop / Tablet Table View */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <th className="px-6 py-4">Invoice #</th>
              <th className="px-6 py-4">Booking / Aircraft</th>
              <th className="px-6 py-4">
                <button
                  type="button"
                  onClick={() => onSortChange('date')}
                  className="inline-flex items-center gap-1 font-bold hover:text-[#152d5a] transition-colors"
                >
                  Date
                  <span className="material-symbols-outlined text-[14px]">
                    {sortField === 'date'
                      ? sortOrder === 'asc'
                        ? 'arrow_upward'
                        : 'arrow_downward'
                      : 'unfold_more'}
                  </span>
                </button>
              </th>
              <th className="px-6 py-4 text-center">
                <button
                  type="button"
                  onClick={() => onSortChange('amount')}
                  className="inline-flex items-center gap-1 font-bold hover:text-[#152d5a] transition-colors justify-center w-full"
                >
                  Amount (AUD)
                  <span className="material-symbols-outlined text-[14px]">
                    {sortField === 'amount'
                      ? sortOrder === 'asc'
                        ? 'arrow_upward'
                        : 'arrow_downward'
                      : 'unfold_more'}
                  </span>
                </button>
              </th>
              <th className="px-6 py-4">Payment Method</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-4xl text-slate-300">
                      receipt_long
                    </span>
                    <p className="font-semibold text-slate-700 text-sm">No invoices found</p>
                    <p className="text-xs text-slate-400">Try changing your search or filters.</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedInvoices.map((inv) => {
                const isDownloading = downloadingId === inv.id
                const aircraftDisplay = cleanAircraftName(inv.aircraftModel, inv.aircraftRegistration)
                const isCheckout =
                  inv.serviceType === 'checkout' ||
                  inv.serviceName?.toLowerCase().includes('checkout') ||
                  inv.invoiceNumber?.toLowerCase().includes('chk')
                const isPackage =
                  inv.serviceType === 'package' ||
                  inv.serviceName?.toLowerCase().includes('package') ||
                  inv.invoiceNumber?.toLowerCase().includes('pkg')

                return (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors group">
                    {/* Invoice # */}
                    <td className="px-6 py-4 font-mono font-bold text-xs text-[#152d5a]">
                      <span className="font-mono">{inv.invoiceNumber}</span>
                    </td>

                    {/* Booking / Aircraft */}
                    <td className="px-6 py-4">
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
                          <div className="font-semibold text-[#152d5a] text-xs">
                            {inv.serviceName}
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium">
                            {aircraftDisplay}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4 text-xs text-slate-600">
                      {formatDateFromISO(inv.date)}
                    </td>

                    {/* Amount */}
                    <td className="px-6 py-4 text-center font-bold text-xs sm:text-sm text-[#152d5a]">
                      {formatAud(inv.amount)}
                    </td>

                    {/* Payment Method */}
                    <td className="px-6 py-4 text-xs">
                      <PaymentMethodBadge
                        method={inv.paymentMethod}
                        status={inv.status}
                        card={inv.card}
                      />
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center justify-center">
                        {/* Direct Download Button */}
                        <button
                          type="button"
                          disabled={isDownloading}
                          onClick={() => onDownloadInvoice(inv)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1a4fd6] border border-blue-200/80 text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
                          aria-label={`Download invoice ${inv.invoiceNumber}`}
                        >
                          <span className="material-symbols-outlined text-[15px]">
                            {isDownloading ? 'hourglass_top' : 'download'}
                          </span>
                          {isDownloading ? 'Downloading...' : 'Download Invoice'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View with Thick Row Dividers */}
      <div className="block sm:hidden divide-y-4 divide-slate-200/90 bg-slate-100/40">
        {paginatedInvoices.length === 0 ? (
          <div className="py-12 text-center text-slate-400 px-4">
            <span className="material-symbols-outlined text-4xl text-slate-300 mb-1">
              receipt_long
            </span>
            <p className="font-semibold text-slate-700 text-sm">No invoices found</p>
            <p className="text-xs text-slate-400">Try changing your search or filters.</p>
          </div>
        ) : (
          paginatedInvoices.map((inv) => {
            const aircraftDisplay = cleanAircraftName(inv.aircraftModel, inv.aircraftRegistration)
            const isCheckout =
              inv.serviceType === 'checkout' ||
              inv.serviceName?.toLowerCase().includes('checkout') ||
              inv.invoiceNumber?.toLowerCase().includes('chk')
            const isPackage =
              inv.serviceType === 'package' ||
              inv.serviceName?.toLowerCase().includes('package') ||
              inv.invoiceNumber?.toLowerCase().includes('pkg')

            return (
              <div key={inv.id} className="p-4 space-y-3 bg-white">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border mt-0.5 ${
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
                      <span className="font-mono font-bold text-xs text-[#152d5a]">
                        {inv.invoiceNumber}
                      </span>
                      <div className="text-xs font-semibold text-slate-800 mt-0.5">
                        {inv.serviceName}
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {aircraftDisplay}
                      </span>
                    </div>
                  </div>
                  <InvoiceStatusBadge status={inv.status} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-slate-50">
                  <div>
                    <span className="text-slate-400 text-[10px] block uppercase">Date</span>
                    <span className="text-slate-700 font-medium">
                      {formatDateFromISO(inv.date)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block uppercase">Amount</span>
                    <span className="text-[#152d5a] font-bold text-sm">
                      {formatAud(inv.amount)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 text-[10px] block uppercase mb-1">Payment Method</span>
                    <PaymentMethodBadge
                      method={inv.paymentMethod}
                      status={inv.status}
                      card={inv.card}
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    disabled={downloadingId === inv.id}
                    onClick={() => onDownloadInvoice(inv)}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1a4fd6] border border-blue-200/60 font-semibold text-xs transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {downloadingId === inv.id ? 'hourglass_top' : 'download'}
                    </span>
                    {downloadingId === inv.id ? 'Downloading...' : 'Download Invoice'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination Footer */}
      {totalInvoices > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/40 text-xs text-slate-500 mt-auto">
          <div>
            Showing <span className="font-semibold text-[#152d5a]">{startIndex + 1}</span>–
            <span className="font-semibold text-[#152d5a]">{endIndex}</span> of{' '}
            <span className="font-semibold text-[#152d5a]">{totalInvoices}</span> invoices
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                aria-label="Previous page"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const isCurrent = p === currentPage
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPageChange(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                      isCurrent
                        ? 'bg-[#152d5a] text-white shadow-sm'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                aria-label="Next page"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
