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

export default function CustomerCreditsManager({ initialCustomerId }: { initialCustomerId?: string }) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [balanceCents, setBalanceCents] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
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
      return
    }
    let isMounted = true
    setLoadingData(true)
    Promise.all([
      getCustomerCreditBalance(selectedCustomer.id),
      getCustomerCreditTransactions(selectedCustomer.id),
    ])
      .then(([balance, txs]) => {
        if (isMounted) {
          setBalanceCents(balance)
          setTransactions(txs as Transaction[])
          setLoadingData(false)
        }
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

  const handleReverse = async (txId: string) => {
    const reason = window.prompt('Please enter a reason for this reversal:')
    if (!reason) return

    setReversingId(txId)
    try {
      await reverseCreditEntry(txId, reason)
      const [balance, txs] = await Promise.all([
        getCustomerCreditBalance(selectedCustomer!.id),
        getCustomerCreditTransactions(selectedCustomer!.id),
      ])
      setBalanceCents(balance)
      setTransactions(txs as Transaction[])
    } catch (err: any) {
      alert(err.message)
    } finally {
      setReversingId(null)
    }
  }

  const formatMoney = (cents: number) => {
    return '$' + (Math.abs(cents) / 100).toFixed(2)
  }

  const getEntryLabel = (type: string) => {
    switch (type) {
      case 'advance_credit':
        return 'Advance payment received'
      case 'advance_applied':
        return 'Advance payment applied'
      case 'refund':
        return 'Refunded'
      case 'credit_refunded':
        return 'Cash refunded to customer'
      case 'credit_reversed':
        return 'Reversed mistaken entry'
      case 'manual_adjustment':
        return 'Manual adjustment'
      case 'bank_transfer':
        return 'Bank transfer'
      default:
        return type
    }
  }

  if (!initialCustomerId) return null

  if (loadingCustomer) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-[16px] border border-[rgba(12,35,64,0.12)] bg-white shadow-[0_12px_28px_rgba(15,30,52,0.08)]">
        <div className="flex items-center gap-2 text-sm text-[var(--admin-text-muted)]">
          <Spinner size="sm" />
          Loading customer…
        </div>
      </div>
    )
  }

  if (!selectedCustomer) {
    return (
      <div className="rounded-[16px] border border-dashed border-[rgba(12,35,64,0.16)] bg-white px-6 py-10 text-center shadow-[0_12px_28px_rgba(15,30,52,0.06)]">
        <p className="text-[15px] font-semibold text-[var(--admin-text)]">Customer not found</p>
        <Link
          href="/admin/customers/ledger"
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-[12px] border border-[rgba(12,35,64,0.12)] bg-white px-4 text-[13px] font-semibold text-[var(--admin-text)] transition-colors hover:border-[rgba(26,79,214,0.2)] hover:text-[var(--admin-accent-blue)]"
        >
          Back to billing directory
        </Link>
      </div>
    )
  }

  const inputClass =
    'w-full rounded-[12px] border border-[rgba(12,35,64,0.12)] bg-[rgba(247,251,255,0.95)] px-3.5 py-2.5 text-sm text-[var(--admin-text)] placeholder:text-[var(--admin-text-muted)] focus:outline-none focus:ring-2 focus:ring-[rgba(26,79,214,0.16)]'
  const labelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--admin-text-muted)]'

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[16px] border border-[rgba(12,35,64,0.12)] bg-white shadow-[0_12px_28px_rgba(15,30,52,0.08)]">
        <div className="flex flex-col gap-4 border-b border-[rgba(12,35,64,0.08)] bg-[linear-gradient(135deg,#0C2340_0%,#163a66_100%)] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">Available credit</p>
            <p className="mt-1 truncate text-[18px] font-semibold leading-tight">
              {selectedCustomer.full_name || 'Unnamed customer'}
            </p>
            {selectedCustomer.email ? (
              <p className="mt-1 truncate text-[13px] text-white/70">{selectedCustomer.email}</p>
            ) : null}
          </div>
          <div className="flex items-end justify-between gap-4 sm:flex-col sm:items-end">
            <p className="font-serif text-[40px] font-semibold leading-none tracking-tight tabular-nums">
              {formatMoney(balanceCents)}
            </p>
            <Link
              href="/admin/customers/ledger"
              className="inline-flex min-h-9 items-center rounded-lg border border-white/20 bg-white/10 px-3 text-[12px] font-semibold text-white/90 transition-colors hover:bg-white/16"
            >
              Clear selection
            </Link>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="border-b border-[rgba(12,35,64,0.08)] p-5 lg:border-b-0 lg:border-r">
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
      </div>
    </div>
  )
}
