'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  getCustomerCreditBalance,
  getCustomerCreditTransactions,
  recordAdvancePayment,
  reverseCreditEntry,
  recordRefund,
} from '@/app/actions/admin'
import { createClient } from '@/lib/supabase/client'
import { formatDateFromISO } from '@/lib/formatDateTime'
import Spinner, { LoadingButtonContent } from '@/components/ui/Spinner'
import { AdminStatusBadge } from '@/app/admin/components/AdminListView'

type Customer = {
  id: string
  full_name: string | null
  email?: string | null
  verification_status: string
}

type Transaction = {
  id: string
  amount_cents: number
  entry_type: string
  payment_method: string | null
  note: string | null
  created_at: string
  reversed_entry_id?: string | null
}

type CustomerInvoiceItem = {
  id: string
  bookingId?: string | null
  invoiceNumber?: string | null
  amountCents: number
  status: string
  paymentMethod?: string | null
  createdAt: string
  pdfUrl?: string | null
  bookingRef?: string | null
}

function invoiceStatusMeta(status: string) {
  switch (status) {
    case 'paid':
      return { label: 'Paid', tone: 'emerald' as const }
    case 'payment_required':
      return { label: 'Payment Required', tone: 'amber' as const }
    case 'bank_transfer_pending_review':
    case 'payment_review_pending':
      return { label: 'Review Pending', tone: 'amber' as const }
    case 'pending':
      return { label: 'Pending', tone: 'blue' as const }
    case 'refunded':
    case 'void':
      return { label: 'Refunded', tone: 'red' as const }
    default:
      return { label: status.replace(/_/g, ' '), tone: 'slate' as const }
  }
}

export default function CustomerCreditsManager({ initialCustomerId }: { initialCustomerId?: string }) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [balanceCents, setBalanceCents] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [invoices, setInvoices] = useState<CustomerInvoiceItem[]>([])
  const [activeTab, setActiveTab] = useState<'credits' | 'invoices'>('credits')
  const [loadingData, setLoadingData] = useState(false)
  const [loadingCustomer, setLoadingCustomer] = useState(Boolean(initialCustomerId))

  const [formMode, setFormMode] = useState<'payment' | 'refund'>('payment')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reversingId, setReversingId] = useState<string | null>(null)

  useEffect(() => {
    if (!initialCustomerId) {
      setSelectedCustomer(null)
      setLoadingCustomer(false)
      return
    }

    let isMounted = true
    setLoadingCustomer(true)
    const fetchCustomer = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, verification_status')
        .eq('id', initialCustomerId)
        .single()
      if (isMounted) {
        setSelectedCustomer(data)
        setLoadingCustomer(false)
      }
    }
    fetchCustomer()
    return () => {
      isMounted = false
    }
  }, [initialCustomerId])

  useEffect(() => {
    if (!selectedCustomer) {
      setBalanceCents(0)
      setTransactions([])
      setInvoices([])
      return
    }
    let isMounted = true
    setLoadingData(true)
    const supabase = createClient()

    Promise.all([
      getCustomerCreditBalance(selectedCustomer.id),
      getCustomerCreditTransactions(selectedCustomer.id),
      supabase
        .from('bookings')
        .select('id, booking_reference, booking_type, scheduled_start, status, checkout_lifecycle_status, aircraft ( registration, display_name ), created_at')
        .eq('booking_owner_user_id', selectedCustomer.id),
      supabase
        .from('invoices')
        .select('id, invoice_number, total, status, payment_method, created_at, pdf_url')
        .eq('user_id', selectedCustomer.id)
        .order('created_at', { ascending: false }),
      // checkout_invoices is fetched AFTER we know booking IDs
      Promise.resolve({ data: [] as any[] }),
    ])
      .then(async ([balance, txs, bookingsRes, genInvoicesRes, _]) => {
        if (!isMounted) return
        setBalanceCents(balance)
        setTransactions(txs as Transaction[])

        const bookings = bookingsRes.data ?? []
        const bookingIds = bookings.map((b) => b.id)
        const bookingRefMap = new Map(bookings.map((b) => [b.id, b.booking_reference]))
        const seenBookingIds = new Set<string>()

        // Fetch checkout invoices by customer ID or booking IDs
        const { data: chkRes } = await (bookingIds.length > 0
          ? supabase
              .from('checkout_invoices')
              .select('id, booking_id, customer_id, status, payment_method, subtotal_cents, stripe_amount_due_cents, total_paid_cents, created_at, pdf_url')
              .or(`customer_id.eq.${selectedCustomer.id},booking_id.in.(${bookingIds.join(',')})`)
              .order('created_at', { ascending: false })
          : supabase
              .from('checkout_invoices')
              .select('id, booking_id, customer_id, status, payment_method, subtotal_cents, stripe_amount_due_cents, total_paid_cents, created_at, pdf_url')
              .eq('customer_id', selectedCustomer.id)
              .order('created_at', { ascending: false }))
        const chkRawData = chkRes ?? []

        let bookingInvoices: any[] = []
        if (bookingIds.length > 0) {
          const { data: bInvs } = await supabase
            .from('booking_invoices')
            .select('id, booking_id, status, payment_method, subtotal_cents, stripe_amount_due_cents, total_paid_cents, created_at, pdf_url')
            .or(`customer_id.eq.${selectedCustomer.id},booking_id.in.(${bookingIds.join(',')})`)
            .order('created_at', { ascending: false })
          bookingInvoices = bInvs ?? []
        } else {
          const { data: bInvs } = await supabase
            .from('booking_invoices')
            .select('id, booking_id, status, payment_method, subtotal_cents, stripe_amount_due_cents, total_paid_cents, created_at, pdf_url')
            .eq('customer_id', selectedCustomer.id)
            .order('created_at', { ascending: false })
          bookingInvoices = bInvs ?? []
        }

        const chkInvoices = chkRawData.map((ci) => {
          if (ci.booking_id) seenBookingIds.add(ci.booking_id)
          const b = bookings.find((bk) => bk.id === ci.booking_id)
          const amt = ci.status === 'paid'
            ? (ci.total_paid_cents ?? ci.subtotal_cents ?? 0)
            : (ci.stripe_amount_due_cents ?? ci.subtotal_cents ?? 0)
          return {
            id: ci.id,
            bookingId: ci.booking_id,
            invoiceNumber: `INV-CHK-${ci.id.slice(0, 6).toUpperCase()}`,
            amountCents: amt > 0 ? amt : 25000,
            status: ci.status === 'paid' ? 'paid' : ci.status || 'pending',
            paymentMethod: ci.payment_method ?? 'stripe',
            createdAt: b?.scheduled_start ?? ci.created_at,
            pdfUrl: ci.pdf_url ?? (ci.booking_id ? `/dashboard/bookings/${ci.booking_id}/invoice` : null),
            bookingRef: b?.booking_reference ?? (ci.booking_id ? `CHK-${ci.booking_id.slice(0, 6).toUpperCase()}` : '—'),
          }
        })

        const stdInvoices = bookingInvoices.map((bi) => {
          if (bi.booking_id) seenBookingIds.add(bi.booking_id)
          return {
            id: bi.id,
            bookingId: bi.booking_id,
            invoiceNumber: `INV-${bi.id.slice(0, 8).toUpperCase()}`,
            amountCents: bi.status === 'paid' ? (bi.total_paid_cents ?? 0) : (bi.stripe_amount_due_cents ?? bi.subtotal_cents ?? 0),
            status: bi.status,
            paymentMethod: bi.payment_method,
            createdAt: bi.created_at,
            pdfUrl: bi.pdf_url ?? `/dashboard/bookings/${bi.booking_id}/invoice`,
            bookingRef: bookingRefMap.get(bi.booking_id) ?? (bi.booking_id ? bi.booking_id.slice(0, 8).toUpperCase() : '—'),
          }
        })

        // Fallback for checkouts without separate invoice record
        const fallbackCheckouts = bookings
          .filter((b) => b.booking_type === 'checkout' && !seenBookingIds.has(b.id))
          .map((b) => ({
            id: b.id,
            bookingId: b.id,
            invoiceNumber: `INV-CHK-${b.id.slice(0, 6).toUpperCase()}`,
            amountCents: 25000,
            status: b.status === 'completed' || b.checkout_lifecycle_status === 'cleared_to_fly' ? 'paid' : 'pending',
            paymentMethod: 'stripe',
            createdAt: b.scheduled_start || b.created_at,
            pdfUrl: `/dashboard/bookings/${b.id}/invoice`,
            bookingRef: b.booking_reference ?? `CHK-${b.id.slice(0, 6).toUpperCase()}`,
          }))

        const combinedInvoices: CustomerInvoiceItem[] = [
          ...chkInvoices,
          ...stdInvoices,
          ...fallbackCheckouts,
          ...(genInvoicesRes.data ?? []).map((gi) => ({
            id: gi.id,
            bookingId: null,
            invoiceNumber: gi.invoice_number,
            amountCents: Math.round((gi.total || 0) * 100),
            status: gi.status,
            paymentMethod: gi.payment_method,
            createdAt: gi.created_at,
            pdfUrl: gi.pdf_url,
            bookingRef: null,
          })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        setInvoices(combinedInvoices)
        setLoadingData(false)
      })
      .catch((err) => {
        console.error(err)
        if (isMounted) setLoadingData(false)
      })
    return () => {
      isMounted = false
    }
  }, [selectedCustomer])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCustomer) return
    setError(null)
    setIsSubmitting(true)

    try {
      const amountNum = parseFloat(amount)
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Please enter a valid amount greater than 0.')
      }

      if (formMode === 'payment') {
        await recordAdvancePayment(
          selectedCustomer.id,
          amountNum,
          paymentMethod,
          new Date().toISOString(),
          reference,
          note,
        )
      } else {
        await recordRefund(selectedCustomer.id, amountNum, paymentMethod, reference, note)
      }

      setAmount('')
      setReference('')
      setNote('')

      const [balance, txs] = await Promise.all([
        getCustomerCreditBalance(selectedCustomer.id),
        getCustomerCreditTransactions(selectedCustomer.id),
      ])
      setBalanceCents(balance)
      setTransactions(txs as Transaction[])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReverse = async (transactionId: string) => {
    if (!selectedCustomer) return
    if (!confirm('Are you sure you want to reverse this credit transaction?')) return

    setReversingId(transactionId)
    try {
      await reverseCreditEntry(transactionId, 'Reversal requested by admin')
      const [balance, txs] = await Promise.all([
        getCustomerCreditBalance(selectedCustomer.id),
        getCustomerCreditTransactions(selectedCustomer.id),
      ])
      setBalanceCents(balance)
      setTransactions(txs as Transaction[])
    } catch (err: any) {
      alert(`Failed to reverse transaction: ${err.message}`)
    } finally {
      setReversingId(null)
    }
  }

  const formatMoney = (cents: number) => {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
  }

  const getEntryLabel = (type: string) => {
    switch (type) {
      case 'advance_credit':
        return 'Advance Payment'
      case 'refund':
        return 'Refund'
      case 'flight_charge':
        return 'Flight Charge'
      case 'credit_reversed':
        return 'Reversal'
      default:
        return type.replace(/_/g, ' ')
    }
  }

  const inputClass =
    'h-11 w-full rounded-[12px] border border-[rgba(12,35,64,0.14)] bg-white px-3.5 text-[14px] text-[var(--admin-text)] placeholder:text-[var(--admin-text-muted)] focus:outline-none focus:ring-2 focus:ring-[rgba(26,79,214,0.16)]'
  const labelClass = 'mb-1.5 block text-[12px] font-semibold text-[var(--admin-text-muted)]'

  if (loadingCustomer) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-[16px] border border-[rgba(12,35,64,0.12)] bg-white shadow-[0_12px_28px_rgba(15,30,52,0.08)]">
        <Spinner size="md" />
      </div>
    )
  }

  if (!selectedCustomer) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[16px] border border-[rgba(12,35,64,0.12)] bg-white p-12 text-center shadow-[0_12px_28px_rgba(15,30,52,0.08)]">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(26,79,214,0.08)] text-[var(--admin-primary-blue)]">
          <span className="material-symbols-outlined text-[24px]">account_balance_wallet</span>
        </div>
        <h3 className="text-[17px] font-bold text-[var(--admin-text)]">Select a customer</h3>
        <p className="mt-1 max-w-sm text-[13px] text-[var(--admin-text-muted)]">
          Choose a customer from the directory to manage their advance payments, credit balance, and invoices.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Customer Header Card */}
      <div className="overflow-hidden rounded-[16px] border border-[rgba(12,35,64,0.12)] bg-white shadow-[0_12px_28px_rgba(15,30,52,0.08)]">
        <div className="border-b border-[rgba(12,35,64,0.08)] bg-[linear-gradient(180deg,rgba(247,251,255,0.98),rgba(255,255,255,0.96))] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[18px] font-bold text-[var(--admin-text)]">{selectedCustomer.full_name}</h2>
                <Link
                  href={`/admin/users/${selectedCustomer.id}`}
                  className="text-xs font-semibold text-[#1a4fd6] hover:underline"
                >
                  View Profile ↗
                </Link>
              </div>
              <p className="mt-0.5 text-[13px] text-[var(--admin-text-muted)]">{selectedCustomer.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--admin-text-muted)]">
                  Credit balance
                </span>
                <span className="text-[20px] font-bold text-emerald-700">{formatMoney(balanceCents)}</span>
              </div>
            </div>
          </div>

          {/* Section Navigation Tabs */}
          <div className="mt-5 flex gap-2 border-t border-[rgba(12,35,64,0.08)] pt-4">
            <button
              type="button"
              onClick={() => setActiveTab('credits')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'credits'
                  ? 'bg-[#152d5a] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">account_balance_wallet</span>
              Credit Ledger & Payment
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('invoices')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'invoices'
                  ? 'bg-[#152d5a] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">receipt_long</span>
              Invoices & Receipts ({invoices.length})
            </button>
          </div>
        </div>

        {activeTab === 'credits' ? (
          <div className="divide-y divide-[rgba(12,35,64,0.08)]">
            {/* Record Entry Form */}
            <div className="p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-semibold text-[var(--admin-text)]">Record entry</h3>
                <div className="flex rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.95)] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFormMode('payment')
                      setError(null)
                    }}
                    className={`rounded-[8px] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                      formMode === 'payment'
                        ? 'bg-[var(--admin-primary-navy)] text-white shadow-sm'
                        : 'text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]'
                    }`}
                  >
                    Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormMode('refund')
                      setError(null)
                    }}
                    className={`rounded-[8px] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                      formMode === 'refund'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]'
                    }`}
                  >
                    Refund
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Amount (AUD)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className={inputClass}
                      placeholder="e.g. 1500.00"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Payment method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className={`${inputClass} appearance-none`}
                    >
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="cash">Cash</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Reference number (optional)</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className={inputClass}
                    placeholder="Receipt # or bank ref"
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Note {formMode === 'refund' ? '(required)' : '(optional)'}
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    required={formMode === 'refund'}
                    className={`${inputClass} h-24 resize-none`}
                    placeholder="Additional details…"
                  />
                </div>

                {error ? (
                  <div className="rounded-[12px] border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting || undefined}
                  className={`inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-[12px] px-4 text-[14px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    formMode === 'payment'
                      ? 'bg-[var(--admin-primary-navy)] hover:bg-[#163a66]'
                      : 'bg-amber-600 hover:bg-amber-500'
                  }`}
                >
                  <LoadingButtonContent loading={isSubmitting} loadingLabel="Recording...">
                    {formMode === 'payment' ? 'Record payment' : 'Record refund'}
                  </LoadingButtonContent>
                </button>
              </form>
            </div>

            {/* Credit History Table */}
            <div className="p-5">
              <h3 className="mb-4 text-[15px] font-semibold text-[var(--admin-text)]">Credit history</h3>

              {loadingData ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--admin-text-muted)]">
                  <Spinner size="sm" />
                  Loading ledger…
                </div>
              ) : transactions.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-[rgba(12,35,64,0.14)] bg-[rgba(247,251,255,0.7)] px-5 py-12 text-center text-[13px] text-[var(--admin-text-muted)]">
                  No credit history yet for this customer.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-[12px] border border-[rgba(12,35,64,0.10)]">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[rgba(12,35,64,0.08)] bg-[rgba(12,35,64,0.03)] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-text-muted)]">
                        <th className="px-4 py-3 font-bold">Date</th>
                        <th className="px-4 py-3 font-bold">Type</th>
                        <th className="px-4 py-3 font-bold">Details</th>
                        <th className="px-4 py-3 text-right font-bold">Amount</th>
                        <th className="px-4 py-3 text-right font-bold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(12,35,64,0.08)]">
                      {transactions.map((tx) => {
                        const isPositive = tx.amount_cents > 0
                        const isReversed = transactions.some(
                          (t) => t.entry_type === 'credit_reversed' && t.reversed_entry_id === tx.id,
                        )
                        const canReverse = tx.entry_type === 'advance_credit' && !isReversed

                        return (
                          <tr key={tx.id} className="bg-white transition-colors hover:bg-[rgba(247,251,255,0.9)]">
                            <td className="whitespace-nowrap px-4 py-3.5 text-[var(--admin-text-muted)]">
                              {formatDateFromISO(tx.created_at)}
                            </td>
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                                  isPositive
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-amber-200 bg-amber-50 text-amber-700'
                                }`}
                              >
                                {getEntryLabel(tx.entry_type)}
                              </span>
                            </td>
                            <td className="max-w-[180px] px-4 py-3.5 text-[var(--admin-text)]">
                              {tx.note || <span className="italic text-[var(--admin-text-muted)]">No notes</span>}
                            </td>
                            <td
                              className={`px-4 py-3.5 text-right font-semibold tabular-nums ${
                                isPositive ? 'text-emerald-700' : 'text-[var(--admin-text)]'
                              }`}
                            >
                              {isPositive ? '+' : ''}
                              {formatMoney(tx.amount_cents)}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              {canReverse ? (
                                <button
                                  type="button"
                                  onClick={() => handleReverse(tx.id)}
                                  disabled={reversingId === tx.id}
                                  aria-busy={reversingId === tx.id || undefined}
                                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--admin-text-muted)] transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <LoadingButtonContent loading={reversingId === tx.id} loadingLabel="Reversing...">
                                    Reverse
                                  </LoadingButtonContent>
                                </button>
                              ) : isReversed ? (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--admin-text-muted)]">
                                  Reversed
                                </span>
                              ) : (
                                <span />
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Invoices Tab */
          <div className="p-5 sm:p-6">
            <h3 className="mb-4 text-[15px] font-semibold text-[var(--admin-text)]">Customer Invoices & Receipts</h3>

            {loadingData ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--admin-text-muted)]">
                <Spinner size="sm" />
                Loading invoices…
              </div>
            ) : invoices.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[rgba(12,35,64,0.14)] bg-[rgba(247,251,255,0.7)] px-5 py-12 text-center text-[13px] text-[var(--admin-text-muted)]">
                No invoices found for this customer.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[12px] border border-[rgba(12,35,64,0.10)]">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-[rgba(12,35,64,0.08)] bg-[rgba(12,35,64,0.03)] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-text-muted)]">
                      <th className="px-4 py-3 font-bold">Date</th>
                      <th className="px-4 py-3 font-bold">Reference / ID</th>
                      <th className="px-4 py-3 font-bold">Status</th>
                      <th className="px-4 py-3 text-right font-bold">Amount</th>
                      <th className="px-4 py-3 text-right font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(12,35,64,0.08)]">
                    {invoices.map((inv) => {
                      const smeta = invoiceStatusMeta(inv.status)
                      const pdfUrl = inv.bookingId
                        ? `/dashboard/bookings/${inv.bookingId}/invoice`
                        : inv.pdfUrl ?? null

                      return (
                        <tr key={inv.id} className="bg-white transition-colors hover:bg-[rgba(247,251,255,0.9)]">
                          <td className="whitespace-nowrap px-4 py-3.5 text-xs text-[var(--admin-text-muted)]">
                            {formatDateFromISO(inv.createdAt)}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-xs font-semibold text-[#152d5a]">
                            {inv.bookingRef ?? inv.invoiceNumber ?? inv.id.slice(0, 8).toUpperCase()}
                          </td>
                          <td className="px-4 py-3.5">
                            <AdminStatusBadge label={smeta.label} tone={smeta.tone} />
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-[#152d5a]">
                            {formatMoney(inv.amountCents)}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {pdfUrl ? (
                              <a
                                href={pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#1a4fd6] bg-[#f0f6ff] hover:bg-[#e0eeff] border border-[#1a4fd6]/20 rounded-lg transition-colors"
                              >
                                <span className="material-symbols-outlined text-[14px]">download</span>
                                PDF
                              </a>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
