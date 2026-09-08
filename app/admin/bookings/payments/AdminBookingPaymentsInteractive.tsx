'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { AdminStatusBadge } from '@/app/admin/components/AdminListView'

export type TabKey = 'all' | 'payment_required' | 'manual_review' | 'pending' | 'paid' | 'refunded' | 'cancelled'

export type PaymentRow = {
  id: string
  invoiceId?: string | null
  bookingId?: string | null
  ownerId: string | null
  customer: string
  email: string
  booking_ref: string
  flight_date?: string | null
  amount_cents: number
  status: string
  method: string
  created?: string | null
  updated?: string | null
  href: string
  pdf_url?: string | null
  bank_reference?: string | null
  bank_submission_id?: string | null
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format((cents || 0) / 100)
}

function paymentStatusMeta(status: string) {
  switch (status) {
    case 'payment_required':
      return { label: 'Payment Required', tone: 'amber' as const }
    case 'payment_review_pending':
    case 'bank_transfer_pending_review':
    case 'manual_review':
      return { label: 'Payment Review Pending', tone: 'amber' as const }
    case 'pending':
      return { label: 'Pending', tone: 'blue' as const }
    case 'paid':
      return { label: 'Paid', tone: 'emerald' as const }
    case 'refunded':
    case 'void':
      return { label: 'Refunded', tone: 'red' as const }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'slate' as const }
    default:
      return { label: status.replace(/_/g, ' '), tone: 'slate' as const }
  }
}

function methodLabel(method: string) {
  if (method === 'bank_transfer') return 'Bank Transfer'
  if (method === 'stripe' || method === 'card') return 'Credit Card'
  if (method === 'block_time') return 'Block Time'
  return method.replace(/_/g, ' ')
}

export default function AdminBookingPaymentsInteractive({
  rows,
  initialTab = 'all',
  metrics,
}: {
  rows: PaymentRow[]
  initialTab?: TabKey
  metrics: {
    totalCollected: number
    outstanding: number
    manualReviewCount: number
    refundsCount: number
  }
}) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRow, setSelectedRow] = useState<PaymentRow | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {
      all: rows.length,
      payment_required: 0,
      manual_review: 0,
      pending: 0,
      paid: 0,
      refunded: 0,
      cancelled: 0,
    }

    for (const r of rows) {
      if (r.status === 'payment_required') counts.payment_required++
      if (
        r.status === 'payment_review_pending' ||
        r.status === 'bank_transfer_pending_review' ||
        r.status === 'manual_review' ||
        r.bank_submission_id
      )
        counts.manual_review++
      if (r.status === 'pending') counts.pending++
      if (r.status === 'paid') counts.paid++
      if (r.status === 'refunded' || r.status === 'void') counts.refunded++
      if (r.status === 'cancelled') counts.cancelled++
    }

    return counts
  }, [rows])

  const filteredRows = useMemo(() => {
    let result = rows

    if (activeTab === 'payment_required') {
      result = result.filter((r) => r.status === 'payment_required')
    } else if (activeTab === 'manual_review') {
      result = result.filter(
        (r) =>
          r.status === 'payment_review_pending' ||
          r.status === 'bank_transfer_pending_review' ||
          r.status === 'manual_review' ||
          Boolean(r.bank_submission_id),
      )
    } else if (activeTab === 'pending') {
      result = result.filter((r) => r.status === 'pending')
    } else if (activeTab === 'paid') {
      result = result.filter((r) => r.status === 'paid')
    } else if (activeTab === 'refunded') {
      result = result.filter((r) => r.status === 'refunded' || r.status === 'void')
    } else if (activeTab === 'cancelled') {
      result = result.filter((r) => r.status === 'cancelled')
    }

    const query = searchQuery.trim().toLowerCase()
    if (query) {
      result = result.filter(
        (r) =>
          r.customer.toLowerCase().includes(query) ||
          r.email.toLowerCase().includes(query) ||
          r.booking_ref.toLowerCase().includes(query) ||
          (r.id && r.id.toLowerCase().includes(query)) ||
          (r.bank_reference && r.bank_reference.toLowerCase().includes(query)),
      )
    }

    return result
  }, [rows, activeTab, searchQuery])

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'all', label: 'All', count: tabCounts.all },
    { key: 'manual_review', label: 'Manual Review', count: tabCounts.manual_review },
    { key: 'payment_required', label: 'Payment Required', count: tabCounts.payment_required },
    { key: 'pending', label: 'Pending', count: tabCounts.pending },
    { key: 'paid', label: 'Paid', count: tabCounts.paid },
    { key: 'refunded', label: 'Refunded', count: tabCounts.refunded },
    { key: 'cancelled', label: 'Cancelled', count: tabCounts.cancelled },
  ]

  return (
    <div className="space-y-6">
      {/* Financial Overview Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[var(--admin-radius-xl)] border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 shadow-[var(--admin-shadow-panel)]">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--admin-text-muted)] font-semibold">Total collected</p>
          <p className="mt-3 text-3xl font-bold text-emerald-700">{formatCurrency(metrics.totalCollected)}</p>
          <p className="mt-1 text-xs text-[var(--admin-text-muted)]">Settled payments across invoices.</p>
        </div>
        <div className="rounded-[var(--admin-radius-xl)] border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 shadow-[var(--admin-shadow-panel)]">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--admin-text-muted)] font-semibold">Outstanding</p>
          <p className="mt-3 text-3xl font-bold text-amber-600">{formatCurrency(metrics.outstanding)}</p>
          <p className="mt-1 text-xs text-[var(--admin-text-muted)]">Awaiting customer payment.</p>
        </div>
        <div className="rounded-[var(--admin-radius-xl)] border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 shadow-[var(--admin-shadow-panel)]">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--admin-text-muted)] font-semibold">Manual review</p>
          <p className="mt-3 text-3xl font-bold text-[#b45309]">{metrics.manualReviewCount}</p>
          <p className="mt-1 text-xs text-[var(--admin-text-muted)]">Bank transfers pending verification.</p>
        </div>
        <div className="rounded-[var(--admin-radius-xl)] border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 shadow-[var(--admin-shadow-panel)]">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--admin-text-muted)] font-semibold">Refunded items</p>
          <p className="mt-3 text-3xl font-bold text-[#991b1b]">{metrics.refundsCount}</p>
          <p className="mt-1 text-xs text-[var(--admin-text-muted)]">Invoices marked refunded or void.</p>
        </div>
      </div>

      {/* Search and Tabs Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Search input */}
        <div className="relative min-w-0 flex-1 max-w-md">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--admin-text-muted)]">
            search
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer, email, booking ref, invoice ID..."
            className="h-10 w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] pl-10 pr-4 text-sm text-[var(--admin-text)] placeholder:text-[var(--admin-text-muted)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]"
          />
        </div>

        {/* Live filtered count */}
        <div className="text-xs font-semibold text-[var(--admin-text-muted)] self-center">
          Showing {filteredRows.length} of {rows.length} records
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-2 flex flex-wrap gap-1.5 shadow-sm">
        {tabs.map((t) => {
          const isActive = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-[#152d5a] text-white shadow-sm'
                  : 'text-[var(--admin-text-muted)] hover:bg-[#f0f6ff] hover:text-[#152d5a]'
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {t.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Interactive Invoices Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] shadow-[var(--admin-shadow-panel)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-slate-50/80 text-[var(--admin-text-muted)]">
              <tr className="border-b border-[var(--admin-divider)]">
                <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Customer</th>
                <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Booking Reference</th>
                <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Flight Date</th>
                <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Amount</th>
                <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Payment Status</th>
                <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Method</th>
                <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Updated</th>
                <th className="px-5 py-4 text-right font-semibold uppercase tracking-[0.12em] text-[11px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--admin-divider)]">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-[var(--admin-text-muted)]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-4xl text-slate-300">receipt_long</span>
                      <p className="font-medium text-slate-700">No payment records found</p>
                      <p className="text-xs text-slate-400">Try adjusting your filters or search query.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const statusMeta = paymentStatusMeta(r.status)
                  const invoiceDownloadUrl = r.bookingId
                    ? `/dashboard/bookings/${r.bookingId}/invoice`
                    : r.pdf_url ?? null

                  return (
                    <tr
                      key={r.id}
                      className="text-[var(--admin-text-muted)] hover:bg-[#f6f9fd] transition-colors cursor-pointer"
                      onClick={() => setSelectedRow(r)}
                    >
                      {/* Customer */}
                      <td className="px-5 py-4 font-medium text-[var(--admin-text)]">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#1a4fd6]/10 text-[#1a4fd6] flex items-center justify-center font-bold text-xs shrink-0">
                            {r.customer.trim().charAt(0).toUpperCase() || 'P'}
                          </div>
                          <div>
                            {r.ownerId ? (
                              <Link
                                href={`/admin/users/${r.ownerId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-semibold text-[#152d5a] hover:underline hover:text-[#1a4fd6] transition-colors block"
                              >
                                {r.customer}
                              </Link>
                            ) : (
                              <span className="font-semibold text-[#152d5a] block">{r.customer}</span>
                            )}
                            <span className="text-xs text-slate-400 block">{r.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Booking Ref */}
                      <td className="px-5 py-4">
                        <Link
                          href={r.href}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono font-medium text-xs px-2.5 py-1 rounded-md bg-[#f0f6ff] text-[#1a4fd6] border border-[#1a4fd6]/15 hover:bg-[#e0eeff] transition-colors inline-block"
                        >
                          {r.booking_ref}
                        </Link>
                        {r.bank_reference && (
                          <div className="text-[10px] text-amber-700 font-mono mt-0.5">
                            Ref: {r.bank_reference}
                          </div>
                        )}
                      </td>

                      {/* Flight Date */}
                      <td className="px-5 py-4 text-xs text-[var(--admin-text)]">
                        {r.flight_date ? new Date(r.flight_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>

                      {/* Amount */}
                      <td className="px-5 py-4 font-bold text-[14px] text-[#152d5a]">
                        {formatCurrency(r.amount_cents)}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <AdminStatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                      </td>

                      {/* Method */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center rounded-full border border-[var(--admin-border)] bg-[var(--admin-panel-bg-soft)] px-2.5 py-1 text-xs font-medium text-[var(--admin-text)]">
                          {methodLabel(r.method)}
                        </span>
                      </td>

                      {/* Updated */}
                      <td className="px-5 py-4 text-xs text-[var(--admin-text-muted)]">
                        {r.updated ? new Date(r.updated).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }) : '—'}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {/* Quick View Button */}
                          <button
                            type="button"
                            onClick={() => setSelectedRow(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#152d5a] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Quick View Invoice"
                          >
                            <span className="material-symbols-outlined text-[15px]">visibility</span>
                            View
                          </button>

                          {/* Download PDF Button */}
                          {invoiceDownloadUrl && (
                            <a
                              href={invoiceDownloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#1a4fd6] bg-[#f0f6ff] hover:bg-[#e0eeff] border border-[#1a4fd6]/20 rounded-lg transition-colors"
                              title="Download Invoice PDF"
                            >
                              <span className="material-symbols-outlined text-[15px]">download</span>
                              PDF
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Slide-over Details Drawer */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#152d5a] text-white flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-[20px]">receipt_long</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#152d5a]">Invoice & Payment Details</h3>
                  <p className="text-xs text-slate-400 font-mono">ID: {selectedRow.id.slice(0, 12)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-6 flex-1">
              {/* Status Banner */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-[#f8fbff] border border-[#1a4fd6]/15">
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Amount</span>
                  <span className="text-2xl font-bold text-[#152d5a]">{formatCurrency(selectedRow.amount_cents)}</span>
                </div>
                <AdminStatusBadge label={paymentStatusMeta(selectedRow.status).label} tone={paymentStatusMeta(selectedRow.status).tone} />
              </div>

              {/* Customer Information */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Customer Information</h4>
                <div className="rounded-xl border border-slate-100 p-4 space-y-3 bg-slate-50/40 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Name</span>
                    <span className="font-semibold text-[#152d5a]">{selectedRow.customer}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Email</span>
                    <span className="text-slate-700 font-medium">{selectedRow.email}</span>
                  </div>
                  {selectedRow.ownerId && (
                    <div className="pt-2 border-t border-slate-100 flex justify-end">
                      <Link
                        href={`/admin/users/${selectedRow.ownerId}`}
                        className="text-xs font-semibold text-[#1a4fd6] hover:underline inline-flex items-center gap-1"
                      >
                        View Customer Profile
                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Booking Information */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Booking Information</h4>
                <div className="rounded-xl border border-slate-100 p-4 space-y-3 bg-slate-50/40 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Booking Reference</span>
                    <span className="font-mono font-bold text-[#152d5a]">{selectedRow.booking_ref}</span>
                  </div>
                  {selectedRow.flight_date && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Flight Date</span>
                      <span className="text-slate-700">{new Date(selectedRow.flight_date).toLocaleString('en-AU')}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Payment Method</span>
                    <span className="font-medium text-slate-800">{methodLabel(selectedRow.method)}</span>
                  </div>
                  {selectedRow.bank_reference && (
                    <div className="flex justify-between items-center p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                      <span className="text-xs font-semibold">Bank Reference</span>
                      <span className="font-mono font-bold text-xs">{selectedRow.bank_reference}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Timestamp metadata */}
              <div className="text-xs text-slate-400 space-y-1">
                {selectedRow.created && <div>Created: {new Date(selectedRow.created).toLocaleString('en-AU')}</div>}
                {selectedRow.updated && <div>Last Updated: {new Date(selectedRow.updated).toLocaleString('en-AU')}</div>}
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/60 flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                {/* Download PDF */}
                {selectedRow.bookingId ? (
                  <a
                    href={`/dashboard/bookings/${selectedRow.bookingId}/invoice`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#152d5a] text-white text-xs font-bold hover:bg-[#1a3a6e] transition-colors shadow-sm text-center"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    Download PDF
                  </a>
                ) : selectedRow.pdf_url ? (
                  <a
                    href={selectedRow.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#152d5a] text-white text-xs font-bold hover:bg-[#1a3a6e] transition-colors shadow-sm text-center"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    Download PDF
                  </a>
                ) : null}

                {/* View Booking */}
                <Link
                  href={selectedRow.href}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[#152d5a] text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm text-center"
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  Manage Booking
                </Link>
              </div>

              {/* Copy Reference */}
              <button
                type="button"
                onClick={() => copyToClipboard(selectedRow.booking_ref, selectedRow.id)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {copiedId === selectedRow.id ? 'check' : 'content_copy'}
                </span>
                {copiedId === selectedRow.id ? 'Reference Copied!' : 'Copy Booking Reference'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
