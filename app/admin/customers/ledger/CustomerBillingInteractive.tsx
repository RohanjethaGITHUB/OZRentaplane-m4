'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatDateFromISO } from '@/lib/formatDateTime'

export type TabKey = 'all' | 'manual_review' | 'payment_required' | 'pending' | 'paid' | 'waived' | 'cancelled'
export type ViewMode = 'invoices' | 'customers'

export type PaymentRow = {
  id: string
  invoiceId?: string | null
  bookingId?: string | null
  ownerId: string | null
  customer: string
  email: string
  booking_ref: string
  service_name?: string | null
  aircraft?: string | null
  is_checkout?: boolean
  flight_date?: string | null
  paid_at?: string | null
  amount_cents: number
  status: string
  method: string
  created?: string | null
  updated?: string | null
  href: string
  pdf_url?: string | null
  bank_reference?: string | null
  bank_submission_id?: string | null
  receipt_url?: string | null
}

export type CustomerSummary = {
  id: string
  name: string
  email: string
  totalPaidCents: number
  creditBalanceCents: number
  status: {
    label: string
    tone: 'blue' | 'amber' | 'orange' | 'emerald' | 'red' | 'slate' | 'indigo' | 'primary' | 'neutral' | 'success' | 'warning' | 'danger'
  }
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format((cents || 0) / 100)
}

function cleanAircraftName(aircraft?: string | null): string {
  if (!aircraft) return 'Cessna 172'
  return aircraft.replace(/^VH-[A-Z0-9]+\s*([·—\-–]\s*)?/i, '').trim() || 'Cessna 172'
}

function LedgerStatusBadge({ status, href }: { status: string; href?: string }) {
  const s = String(status || '').toLowerCase()

  if (s === 'paid') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
        Paid
      </span>
    )
  }

  if (s === 'partially_paid' || s === 'partial') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200/90 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
        Partially Paid
      </span>
    )
  }

  if (s === 'payment_required') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
        Payment Required
      </span>
    )
  }

  if (
    s === 'manual_review' ||
    s === 'payment_review_pending' ||
    s === 'bank_transfer_pending_review'
  ) {
    if (href && href !== '#') {
      return (
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 shrink-0 transition-all shadow-xs group cursor-pointer"
          title="Click to review bank transfer proof"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <span>Manual Review</span>
          <span className="material-symbols-outlined text-[13px] text-amber-700 group-hover:translate-x-0.5 transition-transform">
            arrow_forward
          </span>
        </Link>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
        Manual Review
      </span>
    )
  }

  if (s === 'pending' || s === 'awaiting') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
        Pending
      </span>
    )
  }

  if (s === 'waived' || s === 'admin_waived') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200/90 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0" />
        Waived
      </span>
    )
  }

  if (s === 'settled') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/90 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0" />
        Settled
      </span>
    )
  }

  if (s === 'refunded' || s === 'void') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/90 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
        Refunded
      </span>
    )
  }

  if (s === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
        Cancelled
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 capitalize shrink-0">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function ClearanceStatusBadge({ status }: { status: { label: string; tone: string } }) {
  const tone = status.tone
  if (tone === 'emerald' || tone === 'success') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
        {status.label}
      </span>
    )
  }
  if (tone === 'amber' || tone === 'warning' || tone === 'orange') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
        {status.label}
      </span>
    )
  }
  if (tone === 'blue' || tone === 'primary') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200/90 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
        {status.label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 shrink-0">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
      {status.label}
    </span>
  )
}

function LedgerMethodBadge({ method }: { method: string }) {
  const m = String(method || '').toLowerCase()

  if (m === 'card' || m === 'stripe') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#152d5a] bg-blue-50/80 px-2.5 py-1 rounded-lg border border-blue-200/60 shrink-0">
        <span className="material-symbols-outlined text-[14px] text-blue-600">credit_card</span>
        Card
      </span>
    )
  }

  if (m === 'bank_transfer') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 shrink-0">
        <span className="material-symbols-outlined text-[14px] text-blue-600">account_balance</span>
        Bank Transfer
      </span>
    )
  }

  if (m === 'cash') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0">
        <span className="material-symbols-outlined text-[14px] text-emerald-600">payments</span>
        Cash
      </span>
    )
  }

  if (m === 'advance_credit' || m === 'credit') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 shrink-0">
        <span className="material-symbols-outlined text-[14px] text-indigo-600">account_balance_wallet</span>
        Credit
      </span>
    )
  }

  if (m === 'block_time') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200 shrink-0">
        <span className="material-symbols-outlined text-[14px] text-sky-600">flight</span>
        Block Time
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 capitalize border border-slate-200 shrink-0">
      {m.replace(/_/g, ' ')}
    </span>
  )
}

export default function CustomerBillingInteractive({
  rows,
  customers,
  initialTab = 'all',
  initialCustomerId,
  initialQuery = '',
  metrics,
}: {
  rows: PaymentRow[]
  customers: CustomerSummary[]
  initialTab?: TabKey
  initialCustomerId?: string
  initialQuery?: string
  metrics: {
    totalCollected: number
    outstanding: number
    manualReviewCount: number
    waivedCount: number
    totalCredits: number
  }
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('invoices')
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(() => {
    if (initialCustomerId) {
      return customers.find((c) => c.id === initialCustomerId) ?? null
    }
    return null
  })
  const [viewingReceipt, setViewingReceipt] = useState<{
    url: string
    reference?: string | null
    customer?: string
  } | null>(null)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Filtered Rows for Invoices Table
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {
      all: rows.length,
      manual_review: 0,
      payment_required: 0,
      pending: 0,
      paid: 0,
      waived: 0,
      cancelled: 0,
    }

    for (const r of rows) {
      if (
        r.status === 'payment_review_pending' ||
        r.status === 'bank_transfer_pending_review' ||
        r.status === 'manual_review' ||
        Boolean(r.bank_submission_id)
      ) {
        counts.manual_review++
      }
      if (r.status === 'payment_required') counts.payment_required++
      if (r.status === 'pending') counts.pending++
      if (r.status === 'paid') counts.paid++
      if (r.status === 'waived' || r.status === 'admin_waived' || r.status === 'void') counts.waived++
      if (r.status === 'cancelled') counts.cancelled++
    }

    return counts
  }, [rows])

  const filteredRows = useMemo(() => {
    let result = rows

    if (activeTab === 'manual_review') {
      result = result.filter(
        (r) =>
          r.status === 'payment_review_pending' ||
          r.status === 'bank_transfer_pending_review' ||
          r.status === 'manual_review' ||
          Boolean(r.bank_submission_id),
      )
    } else if (activeTab === 'payment_required') {
      result = result.filter((r) => r.status === 'payment_required')
    } else if (activeTab === 'pending') {
      result = result.filter((r) => r.status === 'pending')
    } else if (activeTab === 'paid') {
      result = result.filter((r) => r.status === 'paid')
    } else if (activeTab === 'waived') {
      result = result.filter((r) => r.status === 'waived' || r.status === 'admin_waived' || r.status === 'void')
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
          (r.invoiceId && r.invoiceId.toLowerCase().includes(query)) ||
          (r.id && r.id.toLowerCase().includes(query)) ||
          (r.bank_reference && r.bank_reference.toLowerCase().includes(query)),
      )
    }

    return result
  }, [rows, activeTab, searchQuery])

  // Filtered Customers
  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return customers
    return customers.filter(
      (c) => c.name.toLowerCase().includes(query) || c.email.toLowerCase().includes(query),
    )
  }, [customers, searchQuery])

  // Selected customer payments list for modal
  const selectedCustomerPayments = useMemo(() => {
    if (!selectedCustomer) return []
    return rows.filter(
      (r) =>
        r.ownerId === selectedCustomer.id ||
        r.email.toLowerCase() === selectedCustomer.email.toLowerCase(),
    )
  }, [rows, selectedCustomer])

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[100] max-w-md px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-200 ${
            toast.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <span className="material-symbols-outlined text-[20px] shrink-0">
            {toast.type === 'error' ? 'error' : 'check_circle'}
          </span>
          <span className="text-xs font-semibold">{toast.text}</span>
        </div>
      )}

      {/* 1. Top KPI Summary Cards (Glassmorphism responsive cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {/* Total Collected */}
        <div className="backdrop-blur-xl bg-white/85 hover:bg-white/95 rounded-2xl p-3.5 sm:p-5 border border-white/80 shadow-[0_16px_40px_rgba(8,20,50,0.12)] ring-1 ring-slate-900/5 transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">Total Collected</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/15 text-emerald-700 flex items-center justify-center border border-emerald-400/30 shrink-0">
              <span className="material-symbols-outlined text-[16px] sm:text-[18px]">payments</span>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-lg sm:text-3xl font-extrabold text-emerald-600 tracking-tight block truncate">
              {formatCurrency(metrics.totalCollected)}
            </span>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 font-medium truncate">Settled invoices &amp; payments</p>
          </div>
        </div>

        {/* Outstanding */}
        <div className="backdrop-blur-xl bg-white/85 hover:bg-white/95 rounded-2xl p-3.5 sm:p-5 border border-white/80 shadow-[0_16px_40px_rgba(8,20,50,0.12)] ring-1 ring-slate-900/5 transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">Outstanding</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/15 text-amber-700 flex items-center justify-center border border-amber-400/30 shrink-0">
              <span className="material-symbols-outlined text-[16px] sm:text-[18px]">pending_actions</span>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-lg sm:text-3xl font-extrabold text-amber-600 tracking-tight block truncate">
              {formatCurrency(metrics.outstanding)}
            </span>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 font-medium truncate">Awaiting payment</p>
          </div>
        </div>

        {/* Manual Review */}
        <div className="backdrop-blur-xl bg-white/85 hover:bg-white/95 rounded-2xl p-3.5 sm:p-5 border border-white/80 shadow-[0_16px_40px_rgba(8,20,50,0.12)] ring-1 ring-slate-900/5 transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">Manual Review</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-500/15 text-blue-700 flex items-center justify-center border border-blue-400/30 shrink-0">
              <span className="material-symbols-outlined text-[16px] sm:text-[18px]">fact_check</span>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-lg sm:text-3xl font-extrabold text-[#152d5a] tracking-tight block">
              {metrics.manualReviewCount}
            </span>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 font-medium truncate">Pending transfer review</p>
          </div>
        </div>

        {/* Customer Credits */}
        <div className="backdrop-blur-xl bg-white/85 hover:bg-white/95 rounded-2xl p-3.5 sm:p-5 border border-white/80 shadow-[0_16px_40px_rgba(8,20,50,0.12)] ring-1 ring-slate-900/5 transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">Customer Credits</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-500/15 text-indigo-700 flex items-center justify-center border border-indigo-400/30 shrink-0">
              <span className="material-symbols-outlined text-[16px] sm:text-[18px]">account_balance_wallet</span>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-lg sm:text-3xl font-extrabold text-indigo-700 tracking-tight block truncate">
              {formatCurrency(metrics.totalCredits)}
            </span>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 font-medium truncate">Prepaid balance</p>
          </div>
        </div>

        {/* Waived Payments */}
        <div className="backdrop-blur-xl bg-white/85 hover:bg-white/95 rounded-2xl p-3.5 sm:p-5 border border-white/80 shadow-[0_16px_40px_rgba(8,20,50,0.12)] ring-1 ring-slate-900/5 transition-all duration-300 hover:-translate-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">Waived Payments</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-500/15 text-purple-700 flex items-center justify-center border border-purple-400/30 shrink-0">
              <span className="material-symbols-outlined text-[16px] sm:text-[18px]">assignment_turned_in</span>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-lg sm:text-3xl font-extrabold text-purple-900 tracking-tight block">
              {metrics.waivedCount}
            </span>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 font-medium truncate">Settled via waiver</p>
          </div>
        </div>
      </div>

      {/* 2. Action Header: Search, View Switcher & Action Buttons */}
      <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-3.5 sm:p-5 shadow-sm space-y-3.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-xl">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                viewMode === 'invoices'
                  ? 'Search customer, email, booking ref...'
                  : 'Search customer name or email...'
              }
              className="w-full pl-10 pr-8 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white text-xs text-[#152d5a] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/20 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* Right Actions: View Toggle */}
          <div className="flex items-center gap-2 justify-stretch sm:justify-end shrink-0">
            <div className="grid grid-cols-2 sm:flex items-center p-1 rounded-xl bg-slate-100/90 border border-slate-200 text-xs font-semibold w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setViewMode('invoices')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  viewMode === 'invoices'
                    ? 'bg-white text-[#152d5a] shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                <span className="truncate">Invoices &amp; Payments</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('customers')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  viewMode === 'customers'
                    ? 'bg-white text-[#152d5a] shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">group</span>
                <span className="truncate">Customer Accounts</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter Tabs (only in Invoices view) */}
        {viewMode === 'invoices' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-t border-slate-100 pt-3 -mx-1 px-1">
            {[
              { key: 'all' as const, label: 'All', count: tabCounts.all, highlight: false },
              {
                key: 'manual_review' as const,
                label: 'Manual Review',
                count: tabCounts.manual_review,
                highlight: tabCounts.manual_review > 0,
              },
              { key: 'payment_required' as const, label: 'Payment Required', count: tabCounts.payment_required, highlight: false },
              { key: 'pending' as const, label: 'Pending', count: tabCounts.pending, highlight: false },
              { key: 'paid' as const, label: 'Paid', count: tabCounts.paid, highlight: false },
              { key: 'waived' as const, label: 'Waived', count: tabCounts.waived, highlight: false },
              { key: 'cancelled' as const, label: 'Cancelled', count: tabCounts.cancelled, highlight: false },
            ].map((tab) => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                    isActive
                      ? 'bg-[#152d5a] text-white shadow-sm'
                      : tab.highlight
                      ? 'bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100'
                      : 'bg-slate-100/70 hover:bg-slate-200/70 text-slate-600'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : tab.highlight
                        ? 'bg-amber-200 text-amber-900'
                        : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 3. Primary Content: Invoices Table OR Customer Accounts */}
      {viewMode === 'invoices' ? (
        /* Invoices & Payments View */
        <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] shadow-sm overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap min-w-[840px]">
              <thead className="border-b border-[var(--admin-divider)] bg-[var(--admin-table-header-bg)] text-[var(--admin-text-muted)]">
                <tr>
                  <th className="px-5 py-4 font-semibold uppercase tracking-wider text-[11px]">Customer</th>
                  <th className="px-5 py-4 font-semibold uppercase tracking-wider text-[11px]">Flight Type</th>
                  <th className="px-5 py-4 font-semibold uppercase tracking-wider text-[11px]">Paid At</th>
                  <th className="px-5 py-4 font-semibold uppercase tracking-wider text-[11px]">Amount</th>
                  <th className="px-5 py-4 font-semibold uppercase tracking-wider text-[11px]">Payment Status</th>
                  <th className="px-5 py-4 font-semibold uppercase tracking-wider text-[11px]">Method</th>
                  <th className="px-5 py-4 text-center font-semibold uppercase tracking-wider text-[11px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-divider)]">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-14 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-4xl text-slate-300">receipt_long</span>
                        <p className="font-semibold text-slate-700 text-sm">No payment records found</p>
                        <p className="text-xs text-slate-400">Try adjusting your filters or search query.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => {
                    const invoiceDownloadUrl = r.bookingId
                      ? `/dashboard/bookings/${r.bookingId}/invoice`
                      : r.pdf_url ?? null

                    const paidAtDisplay =
                      r.status === 'paid'
                        ? r.paid_at
                          ? formatDateFromISO(r.paid_at)
                          : r.updated
                          ? formatDateFromISO(r.updated)
                          : r.created
                          ? formatDateFromISO(r.created)
                          : '—'
                        : '—'

                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition-colors group">
                        {/* Customer */}
                        <td className="px-5 py-4 font-medium text-[var(--admin-text)]">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#1a4fd6]/10 text-[#1a4fd6] flex items-center justify-center font-bold text-xs shrink-0">
                              {r.customer.trim().charAt(0).toUpperCase() || 'C'}
                            </div>
                            <div className="min-w-0 max-w-[170px] lg:max-w-[220px]">
                              {r.ownerId ? (
                                <Link
                                  href={`/admin/users/${r.ownerId}`}
                                  title={r.customer}
                                  className="font-semibold text-[#152d5a] hover:underline hover:text-[#1a4fd6] transition-colors truncate block"
                                >
                                  {r.customer}
                                </Link>
                              ) : (
                                <span title={r.customer} className="font-semibold text-[#152d5a] truncate block">{r.customer}</span>
                              )}
                              <span title={r.email} className="text-[11px] text-slate-400 truncate block">{r.email}</span>
                            </div>
                          </div>
                        </td>

                        {/* Flight Type (Icon + Name, No booking reference) */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                                r.is_checkout
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                  : 'bg-blue-50 text-[#1a4fd6] border-blue-100'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                {r.is_checkout ? 'flight_takeoff' : 'flight'}
                              </span>
                            </div>
                            <div>
                              <span className="font-semibold text-xs text-[#152d5a] block">
                                {r.is_checkout ? 'Checkout Flight' : 'Aircraft Rental'}
                              </span>
                              {r.aircraft && (
                                <span className="text-[11px] text-slate-400 font-medium block">
                                  {cleanAircraftName(r.aircraft)}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Paid At Date */}
                        <td className="px-5 py-4 text-xs text-slate-600 font-medium">
                          {paidAtDisplay}
                        </td>

                        {/* Amount */}
                        <td className="px-5 py-4 font-bold text-xs sm:text-sm text-[#152d5a]">
                          {formatCurrency(r.amount_cents)}
                        </td>

                        {/* Payment Status */}
                        <td className="px-5 py-4">
                          <LedgerStatusBadge status={r.status} href={r.href} />
                        </td>

                        {/* Method */}
                        <td className="px-5 py-4">
                          {r.status === 'payment_required' || r.status === 'pending' ? (
                            <span className="text-slate-400 text-xs font-medium">—</span>
                          ) : (
                            <LedgerMethodBadge method={r.method} />
                          )}
                        </td>

                        {/* Actions: Download Invoice Centered */}
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center">
                            {invoiceDownloadUrl ? (
                              <a
                                href={invoiceDownloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1a4fd6] border border-blue-200/80 text-xs font-semibold transition-colors shadow-sm"
                                title="Download Invoice"
                              >
                                <span className="material-symbols-outlined text-[15px]">download</span>
                                Download Invoice
                              </a>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
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

          {/* Mobile Card List View (Matching Customer Billing Style) */}
          <div className="block md:hidden divide-y divide-slate-100 bg-white">
            {filteredRows.length === 0 ? (
              <div className="py-12 text-center text-slate-400 px-4">
                <span className="material-symbols-outlined text-4xl text-slate-300 mb-1">receipt_long</span>
                <p className="font-semibold text-slate-700 text-sm">No payment records found</p>
                <p className="text-xs text-slate-400 mt-0.5">Try adjusting your filters or search query.</p>
              </div>
            ) : (
              filteredRows.map((r) => {
                const invoiceDownloadUrl = r.bookingId
                  ? `/dashboard/bookings/${r.bookingId}/invoice`
                  : r.pdf_url ?? null

                const paidAtDisplay =
                  r.status === 'paid'
                    ? r.paid_at
                      ? formatDateFromISO(r.paid_at)
                      : r.updated
                      ? formatDateFromISO(r.updated)
                      : r.created
                      ? formatDateFromISO(r.created)
                      : '—'
                    : '—'

                return (
                  <div key={r.id} className="p-4 space-y-3 hover:bg-slate-50/60 transition-colors">
                    {/* Top Row: Customer info + Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#1a4fd6]/10 text-[#1a4fd6] flex items-center justify-center font-bold text-xs shrink-0">
                          {r.customer.trim().charAt(0).toUpperCase() || 'C'}
                        </div>
                        <div className="min-w-0 flex-1">
                          {r.ownerId ? (
                            <Link
                              href={`/admin/users/${r.ownerId}`}
                              title={r.customer}
                              className="font-bold text-xs text-[#152d5a] hover:underline hover:text-[#1a4fd6] truncate block"
                            >
                              {r.customer}
                            </Link>
                          ) : (
                            <span title={r.customer} className="font-bold text-xs text-[#152d5a] truncate block">{r.customer}</span>
                          )}
                          <span title={r.email} className="text-[10px] text-slate-400 truncate block">{r.email}</span>
                        </div>
                      </div>
                      <LedgerStatusBadge status={r.status} href={r.href} />
                    </div>

                    {/* Flight Details & Amount Card */}
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                            r.is_checkout
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                              : 'bg-blue-50 text-[#1a4fd6] border-blue-100'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[15px]">
                            {r.is_checkout ? 'flight_takeoff' : 'flight'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-xs text-[#152d5a] block truncate">
                            {r.is_checkout ? 'Checkout Flight' : 'Aircraft Rental'}
                          </span>
                          {r.aircraft && (
                            <span className="text-[10px] text-slate-500 font-medium block truncate">
                              {cleanAircraftName(r.aircraft)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">Amount</span>
                        <span className="font-extrabold text-sm text-[#152d5a] block">
                          {formatCurrency(r.amount_cents)}
                        </span>
                      </div>
                    </div>

                    {/* Metadata: Paid At & Method */}
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div>
                        <span className="text-slate-400 text-[10px] block uppercase font-bold">Paid At</span>
                        <span className="text-slate-700 font-medium text-xs">{paidAtDisplay}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block uppercase font-bold mb-0.5">Method</span>
                        {r.status === 'payment_required' || r.status === 'pending' ? (
                          <span className="text-slate-400 text-xs font-medium">—</span>
                        ) : (
                          <LedgerMethodBadge method={r.method} />
                        )}
                      </div>
                    </div>

                    {/* Action Download Button */}
                    {invoiceDownloadUrl && (
                      <div className="pt-1">
                        <a
                          href={invoiceDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1a4fd6] border border-blue-200/80 font-bold text-xs transition-colors shadow-sm"
                        >
                          <span className="material-symbols-outlined text-[15px]">download</span>
                          Download Invoice
                        </a>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Footer Count */}
          <div className="px-5 py-3 border-t border-[var(--admin-divider)] bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {filteredRows.length} of {rows.length} records
            </span>
          </div>
        </div>
      ) : (
        /* Customer Accounts & Credit Balances View */
        <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] shadow-sm overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap min-w-[760px]">
              <thead className="border-b border-[var(--admin-divider)] bg-[var(--admin-table-header-bg)] text-[var(--admin-text-muted)]">
                <tr>
                  <th className="px-5 py-4 font-semibold uppercase tracking-wider text-[11px]">Customer</th>
                  <th className="px-5 py-4 font-semibold uppercase tracking-wider text-[11px]">Cumulative Paid</th>
                  <th className="px-5 py-4 font-semibold uppercase tracking-wider text-[11px]">Prepaid Credit Balance</th>
                  <th className="px-5 py-4 font-semibold uppercase tracking-wider text-[11px]">Clearance Status</th>
                  <th className="px-5 py-4 text-center font-semibold uppercase tracking-wider text-[11px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-divider)]">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-14 text-center text-slate-400">
                      <p className="font-semibold text-slate-700 text-sm">No customers matched your search</p>
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => (
                    <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors group">
                      {/* Customer Info */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#152d5a]/10 text-[#152d5a] flex items-center justify-center font-bold text-xs shrink-0">
                            {cust.name.trim().charAt(0).toUpperCase() || 'C'}
                          </div>
                          <div className="min-w-0 max-w-[170px] lg:max-w-[220px]">
                            <Link
                              href={`/admin/users/${cust.id}`}
                              title={cust.name}
                              className="font-semibold text-[#152d5a] hover:underline hover:text-[#1a4fd6] transition-colors truncate block"
                            >
                              {cust.name}
                            </Link>
                            <span title={cust.email} className="text-[11px] text-slate-400 truncate block">{cust.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Cumulative Total Paid */}
                      <td className="px-5 py-4 font-bold text-xs sm:text-sm text-emerald-700">
                        {formatCurrency(cust.totalPaidCents)}
                      </td>

                      {/* Credit Balance */}
                      <td className="px-5 py-4">
                        <span
                          className={`font-bold text-xs sm:text-sm ${
                            cust.creditBalanceCents > 0 ? 'text-indigo-700 font-extrabold' : 'text-slate-600'
                          }`}
                        >
                          {formatCurrency(cust.creditBalanceCents)}
                        </span>
                      </td>

                      {/* Clearance Status */}
                      <td className="px-5 py-4">
                        <ClearanceStatusBadge status={cust.status} />
                      </td>

                      {/* Actions: View Payment Details Centered */}
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomer(cust)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/70 text-xs font-bold transition-colors cursor-pointer shadow-sm"
                            title="View Payment Details"
                          >
                            <span className="material-symbols-outlined text-[15px]">receipt_long</span>
                            View Payment Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="block md:hidden divide-y divide-slate-100 bg-white">
            {filteredCustomers.length === 0 ? (
              <div className="py-12 text-center text-slate-400 px-4">
                <p className="font-semibold text-slate-700 text-sm">No customers matched your search</p>
              </div>
            ) : (
              filteredCustomers.map((cust) => (
                <div key={cust.id} className="p-4 space-y-3 hover:bg-slate-50/60 transition-colors">
                  {/* Customer Top Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#152d5a]/10 text-[#152d5a] flex items-center justify-center font-bold text-xs shrink-0">
                        {cust.name.trim().charAt(0).toUpperCase() || 'C'}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/users/${cust.id}`}
                          className="font-bold text-xs text-[#152d5a] hover:underline hover:text-[#1a4fd6] truncate block"
                        >
                          {cust.name}
                        </Link>
                        <span className="text-[11px] text-slate-400 truncate block">{cust.email}</span>
                      </div>
                    </div>
                    <ClearanceStatusBadge status={cust.status} />
                  </div>

                  {/* Financial Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase font-bold">Cumulative Paid</span>
                      <span className="text-emerald-700 font-extrabold text-sm block">
                        {formatCurrency(cust.totalPaidCents)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase font-bold">Prepaid Credits</span>
                      <span
                        className={`font-extrabold text-sm block ${
                          cust.creditBalanceCents > 0 ? 'text-indigo-700' : 'text-slate-700'
                        }`}
                      >
                        {formatCurrency(cust.creditBalanceCents)}
                      </span>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(cust)}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/70 font-bold text-xs transition-colors shadow-sm cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">receipt_long</span>
                    View Payment Details
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer Count */}
          <div className="px-5 py-3 border-t border-[var(--admin-divider)] bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
            <span>Showing {filteredCustomers.length} customers</span>
          </div>
        </div>
      )}

      {/* 4. Customer Payment Details Modal (Centered Lightbox Dialog, Responsive & z-[1000]) */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
          <div
            className="relative w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200 my-auto"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/90 shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#152d5a] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                    {selectedCustomer.name.trim().charAt(0).toUpperCase() || 'C'}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-[#152d5a] truncate">
                      {selectedCustomer.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 truncate">{selectedCustomer.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Link
                    href={`/admin/users/${selectedCustomer.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-[#1a4fd6] hover:bg-blue-100 font-semibold text-xs transition-colors"
                    title="View Customer Profile"
                  >
                    <span>Profile</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
                    aria-label="Close dialog"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 flex-1 overflow-y-auto text-xs">
              {/* Customer Account Summary Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-[#f8fbff] to-blue-50/50 border border-[#1a4fd6]/15 shadow-sm">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                    Cumulative Paid
                  </span>
                  <span className="text-base sm:text-xl font-extrabold text-emerald-700 tracking-tight block truncate">
                    {formatCurrency(selectedCustomer.totalPaidCents)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                    Credit Balance
                  </span>
                  <span className="text-base sm:text-xl font-extrabold text-[#152d5a] tracking-tight block truncate">
                    {formatCurrency(selectedCustomer.creditBalanceCents)}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-blue-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Clearance Status
                  </span>
                  <ClearanceStatusBadge status={selectedCustomer.status} />
                </div>
              </div>

              {/* Transactions / Payment List */}
              <div className="space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                  Payment &amp; Billing History ({selectedCustomerPayments.length})
                </h4>

                {selectedCustomerPayments.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl p-4">
                    <span className="material-symbols-outlined text-4xl text-slate-300 mb-1">receipt_long</span>
                    <p className="font-semibold text-slate-700 text-xs">No payment records found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      There are no rental or checkout invoice records associated with this customer.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedCustomerPayments.map((p) => {
                      const invoiceUrl = p.bookingId
                        ? `/dashboard/bookings/${p.bookingId}/invoice`
                        : p.pdf_url ?? null

                      const pDate = p.paid_at
                        ? formatDateFromISO(p.paid_at)
                        : p.updated
                        ? formatDateFromISO(p.updated)
                        : p.created
                        ? formatDateFromISO(p.created)
                        : '—'

                      return (
                        <div
                          key={p.id}
                          className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm hover:border-blue-200/80 transition-all space-y-3"
                        >
                          {/* Top Row: Service & Status */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                                  p.is_checkout
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                    : 'bg-blue-50 text-[#1a4fd6] border-blue-100'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[16px]">
                                  {p.is_checkout ? 'flight_takeoff' : 'flight'}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-xs text-[#152d5a] block truncate">
                                  {p.is_checkout ? 'Checkout Flight' : 'Aircraft Rental'}
                                </span>
                                <span className="text-[11px] font-mono text-slate-500 font-medium truncate block">
                                  Ref: {p.booking_ref}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-bold text-sm text-[#152d5a] block">
                                {formatCurrency(p.amount_cents)}
                              </span>
                              <div className="mt-0.5">
                                <LedgerStatusBadge status={p.status} href={p.href} />
                              </div>
                            </div>
                          </div>

                          {/* Middle Row: Meta details with clear visible divider */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-200 text-[11px] text-slate-500">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>Paid: <strong className="text-slate-700 font-medium">{pDate}</strong></span>
                              <span>·</span>
                              <span>Method: <strong className="text-slate-700 font-medium">{p.status === 'payment_required' || p.status === 'pending' ? '—' : p.method.replace(/_/g, ' ')}</strong></span>
                              {p.bank_reference && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono text-[10px]">
                                  Ref: {p.bank_reference}
                                </span>
                              )}
                            </div>

                            {/* Action Links */}
                            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-end pt-1 sm:pt-0">
                              {/* Bank Receipt Button */}
                              {p.receipt_url && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewingReceipt({
                                      url: p.receipt_url!,
                                      reference: p.bank_reference || p.booking_ref,
                                      customer: selectedCustomer.name,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-lg transition-colors cursor-pointer"
                                  title="View Bank Transfer Receipt Proof"
                                >
                                  <span className="material-symbols-outlined text-[14px]">receipt</span>
                                  View Receipt
                                </button>
                              )}

                              {/* Download Invoice Button */}
                              {invoiceUrl && (
                                <a
                                  href={invoiceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/70 rounded-lg transition-colors"
                                  title="Download Invoice PDF"
                                >
                                  <span className="material-symbols-outlined text-[14px]">download</span>
                                  Download Invoice
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs shrink-0">
              <span className="text-slate-400">Total Records: {selectedCustomerPayments.length}</span>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-1.5 sm:py-2 rounded-xl bg-[#152d5a] text-white font-bold hover:bg-[#1a3a6e] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Bank Transfer Receipt Preview Lightbox Modal */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className="w-full max-w-3xl bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200 my-auto"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-700 flex items-center justify-center border border-amber-400/30 shrink-0">
                  <span className="material-symbols-outlined text-[18px]">receipt</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#152d5a] truncate">Bank Transfer Receipt Proof</h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    {viewingReceipt.customer ? `Customer: ${viewingReceipt.customer}` : ''}
                    {viewingReceipt.reference ? ` · Ref: ${viewingReceipt.reference}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={viewingReceipt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1a4fd6] border border-blue-200 text-xs font-bold transition-colors"
                  title="Open Original in New Tab"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  <span className="hidden sm:inline">Open Original</span>
                </a>
                <button
                  type="button"
                  onClick={() => setViewingReceipt(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Modal Body / Image Viewer */}
            <div className="p-3 sm:p-6 flex-1 overflow-y-auto bg-slate-100/60 flex items-center justify-center min-h-[220px]">
              {viewingReceipt.url.toLowerCase().includes('.pdf') ? (
                <iframe
                  src={viewingReceipt.url}
                  className="w-full h-[60vh] rounded-2xl border border-slate-200 shadow-sm"
                  title="Receipt PDF"
                />
              ) : (
                <div className="relative max-h-[65vh] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewingReceipt.url}
                    alt="Bank Transfer Receipt"
                    className="max-h-[65vh] max-w-full object-contain rounded-2xl border border-slate-200/80 shadow-md bg-white"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 sm:px-6 py-3 border-t border-slate-100 bg-white flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="truncate mr-2">Review payment proof</span>
              <button
                type="button"
                onClick={() => setViewingReceipt(null)}
                className="px-4 py-1.5 sm:py-2 rounded-xl bg-[#152d5a] text-white font-bold hover:bg-[#1a3a6e] transition-colors shrink-0"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
