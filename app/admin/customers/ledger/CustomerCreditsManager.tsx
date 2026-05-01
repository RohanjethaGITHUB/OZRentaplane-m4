'use client'

import { useState, useEffect } from 'react'
import { searchCustomers, getCustomerCreditBalance, getCustomerCreditTransactions, recordAdvancePayment, reverseCreditEntry, recordRefund } from '@/app/actions/admin'
import { createClient } from '@/lib/supabase/client'

type Customer = {
  id: string
  full_name: string | null
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
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  
  const [balanceCents, setBalanceCents] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loadingData, setLoadingData] = useState(false)

  // Form state
  const [formMode, setFormMode] = useState<'payment' | 'refund'>('payment')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialCustomerId && !selectedCustomer) {
      const fetchCustomer = async () => {
        const supabase = createClient()
        const { data } = await supabase.from('profiles').select('id, full_name, verification_status').eq('id', initialCustomerId).single()
        if (data) setSelectedCustomer(data)
      }
      fetchCustomer()
    }
  }, [initialCustomerId, selectedCustomer])

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      const users = await searchCustomers(query)
      setResults(users)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

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
      getCustomerCreditTransactions(selectedCustomer.id)
    ]).then(([balance, txs]) => {
      if (isMounted) {
        setBalanceCents(balance)
        setTransactions(txs as Transaction[])
        setLoadingData(false)
      }
    }).catch(err => {
      console.error(err)
      if (isMounted) setLoadingData(false)
    })
    return () => { isMounted = false }
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
          note
        )
      } else {
        await recordRefund(
          selectedCustomer.id,
          amountNum,
          paymentMethod,
          reference,
          note
        )
      }
      
      // Reset form and refresh data
      setAmount('')
      setReference('')
      setNote('')
      
      const [balance, txs] = await Promise.all([
        getCustomerCreditBalance(selectedCustomer.id),
        getCustomerCreditTransactions(selectedCustomer.id)
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

    try {
      await reverseCreditEntry(txId, reason)
      // Refresh
      const [balance, txs] = await Promise.all([
        getCustomerCreditBalance(selectedCustomer!.id),
        getCustomerCreditTransactions(selectedCustomer!.id)
      ])
      setBalanceCents(balance)
      setTransactions(txs as Transaction[])
    } catch (err: any) {
      alert(err.message)
    }
  }

  const formatMoney = (cents: number) => {
    return '$' + (Math.abs(cents) / 100).toFixed(2)
  }

  const getEntryLabel = (type: string) => {
    switch (type) {
      case 'advance_credit': return 'Advance payment received'
      case 'advance_applied': return 'Advance payment applied'
      case 'refund': return 'Refunded'
      case 'credit_refunded': return 'Cash refunded to customer'
      case 'credit_reversed': return 'Reversed mistaken entry'
      case 'manual_adjustment': return 'Manual adjustment'
      default: return type
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* LEFT COLUMN: SEARCH & FORM */}
      <div className="lg:col-span-5 space-y-8">
        
        {/* Search */}
        <div className="bg-[#0c1326]/50 border border-white/5 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="text-white font-medium mb-4">Select Customer</h3>
          
          {!selectedCustomer ? (
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
              />
              {results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-xl overflow-hidden shadow-2xl z-10">
                  {results.map(user => (
                    <button
                      key={user.id}
                      onClick={() => {
                        setSelectedCustomer(user)
                        setQuery('')
                        setResults([])
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-slate-300 transition-colors border-b border-white/5 last:border-0 flex items-center justify-between"
                    >
                      <span>{user.full_name || 'Unnamed Pilot'}</span>
                      <span className="text-xs text-slate-500 bg-white/5 px-2 py-1 rounded-md">{user.verification_status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-blue-900/20 border border-blue-500/20 rounded-xl p-4">
              <div>
                <div className="text-sm text-slate-400 mb-1">Selected Customer</div>
                <div className="text-lg text-white font-medium">{selectedCustomer.full_name || 'Unnamed Pilot'}</div>
              </div>
              <button 
                onClick={() => setSelectedCustomer(null)}
                className="text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-white transition-colors bg-white/5 px-3 py-2 rounded-lg"
              >
                Change
              </button>
            </div>
          )}
        </div>

        {/* Record Form */}
        {selectedCustomer && (
          <div className="bg-[#0c1326]/50 border border-white/5 rounded-2xl p-6 backdrop-blur-xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-white font-medium">Record Entry</h3>
              <div className="flex bg-slate-900/50 rounded-lg p-1 border border-white/10">
                <button
                  onClick={() => { setFormMode('payment'); setError(null) }}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${formMode === 'payment' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}
                >
                  Payment
                </button>
                <button
                  onClick={() => { setFormMode('refund'); setError(null) }}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${formMode === 'refund' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-white'}`}
                >
                  Refund
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Amount (AUD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                    placeholder="e.g. 1500.00"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 transition-colors appearance-none"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Reference Number (Optional)</label>
                <input
                  type="text"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                  placeholder="e.g. Receipt # or Bank Ref"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Note {formMode === 'refund' ? '(Required)' : '(Optional)'}</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  required={formMode === 'refund'}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors resize-none h-24"
                  placeholder="Additional details..."
                />
              </div>

              {error && (
                <div className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full text-white font-medium py-3 rounded-xl transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  formMode === 'payment' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                {isSubmitting ? 'Recording...' : formMode === 'payment' ? 'Record Payment' : 'Record Refund'}
              </button>

            </form>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: BALANCE & LEDGER */}
      <div className="lg:col-span-7 space-y-8">
        
        {selectedCustomer ? (
          <>
            {/* Balance Card */}
            <div className="bg-gradient-to-br from-blue-900/40 to-[#0c1326]/80 border border-blue-500/20 rounded-2xl p-8 backdrop-blur-xl flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-blue-200/70 mb-1 uppercase tracking-widest">Available Credit</div>
                <div className="text-5xl font-serif tracking-tight text-white">{formatMoney(balanceCents)}</div>
              </div>
              <span className="material-symbols-outlined text-6xl text-blue-500/20" style={{ fontVariationSettings: "'FILL' 1" }}>
                account_balance_wallet
              </span>
            </div>

            {/* Ledger Table */}
            <div className="bg-[#0c1326]/50 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-xl">
              <div className="p-6 border-b border-white/5">
                <h3 className="text-white font-medium">Customer Credit History</h3>
              </div>
              
              {loadingData ? (
                <div className="p-10 text-center text-slate-500 text-sm">Loading ledger...</div>
              ) : transactions.length === 0 ? (
                <div className="p-10 text-center text-slate-500 text-sm">No credit history found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-slate-500 uppercase tracking-wider text-[10px] font-semibold bg-white/[0.02]">
                        <th className="px-6 py-4 font-medium">Date</th>
                        <th className="px-6 py-4 font-medium">Type</th>
                        <th className="px-6 py-4 font-medium">Details</th>
                        <th className="px-6 py-4 font-medium text-right">Amount</th>
                        <th className="px-6 py-4 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {transactions.map(tx => {
                        const isPositive = tx.amount_cents > 0
                        const isReversed = transactions.some(t => t.entry_type === 'credit_reversed' && t.reversed_entry_id === tx.id)
                        const canReverse = tx.entry_type === 'advance_credit' && !isReversed

                        return (
                          <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-6 py-4 text-slate-400 whitespace-nowrap">
                              {new Date(tx.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold ${
                                isPositive 
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}>
                                {getEntryLabel(tx.entry_type)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-300">
                              {tx.note || <span className="text-slate-600 italic">No notes</span>}
                            </td>
                            <td className={`px-6 py-4 text-right font-medium tabular-nums ${isPositive ? 'text-emerald-400' : 'text-slate-300'}`}>
                              {isPositive ? '+' : ''}{formatMoney(tx.amount_cents)}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {canReverse ? (
                                <button
                                  onClick={() => handleReverse(tx.id)}
                                  className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-red-400 transition-colors"
                                >
                                  Reverse
                                </button>
                              ) : isReversed ? (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Reversed</span>
                              ) : (
                                <span></span>
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
          </>
        ) : (
          <div className="h-full min-h-[400px] border border-white/5 border-dashed rounded-2xl flex flex-col items-center justify-center text-slate-500 p-10 text-center">
            <span className="material-symbols-outlined text-4xl mb-4 opacity-50">search</span>
            <p>Select a customer to view their available credit<br/>and transaction history.</p>
          </div>
        )}
      </div>
    </div>
  )
}
