'use client'

import React from 'react'

function formatAud(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(amount)
}

export default function PaymentSummaryCards({
  totalSpent,
  totalInvoicesCount,
  paidInvoicesCount,
  outstandingBalance,
  pendingInvoicesCount,
  onPayNowClick,
}: {
  totalSpent: number
  totalInvoicesCount: number
  paidInvoicesCount: number
  outstandingBalance: number
  pendingInvoicesCount: number
  onPayNowClick?: () => void
}) {
  const paidPercentage =
    totalInvoicesCount > 0
      ? Math.round((paidInvoicesCount / totalInvoicesCount) * 100)
      : 100

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {/* Card 1: Total Spent */}
      <div className="backdrop-blur-xl bg-white/80 hover:bg-white/95 rounded-2xl p-6 border border-white/70 shadow-[0_16px_40px_rgba(8,20,50,0.22)] ring-1 ring-white/30 flex flex-col justify-between min-h-[165px] transition-all duration-300 hover:-translate-y-1">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[#3b5480] text-[11px] font-bold uppercase tracking-wider">
              Total Spent (All-Time)
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-[#1a4fd6] shadow-sm border border-blue-400/30">
              <span className="material-symbols-outlined text-[20px]">
                account_balance_wallet
              </span>
            </div>
          </div>
          <p className="text-3xl font-extrabold text-[#0d1b3e] tracking-tight">
            {formatAud(totalSpent)}
          </p>
        </div>
        <p className="text-xs text-[#526582] mt-3 font-medium">
          Across {totalInvoicesCount} invoice{totalInvoicesCount === 1 ? '' : 's'}
        </p>
      </div>

      {/* Card 2: Paid Invoices */}
      <div className="backdrop-blur-xl bg-white/80 hover:bg-white/95 rounded-2xl p-6 border border-white/70 shadow-[0_16px_40px_rgba(8,20,50,0.22)] ring-1 ring-white/30 flex flex-col justify-between min-h-[165px] transition-all duration-300 hover:-translate-y-1">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[#3b5480] text-[11px] font-bold uppercase tracking-wider">
              Paid Invoices
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-700 shadow-sm border border-emerald-400/30">
              <span className="material-symbols-outlined text-[20px]">
                check_circle
              </span>
            </div>
          </div>
          <p className="text-3xl font-extrabold text-[#0d1b3e] tracking-tight">
            {paidInvoicesCount}
          </p>
        </div>
        <p className="text-xs text-[#526582] mt-3 font-medium">
          {paidPercentage}% of total invoices
        </p>
      </div>

      {/* Card 3: Outstanding Balance */}
      <div className="backdrop-blur-xl bg-white/80 hover:bg-white/95 rounded-2xl p-6 border border-white/70 shadow-[0_16px_40px_rgba(8,20,50,0.22)] ring-1 ring-white/30 flex flex-col justify-between min-h-[165px] transition-all duration-300 hover:-translate-y-1">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[#3b5480] text-[11px] font-bold uppercase tracking-wider">
              Outstanding Balance
            </span>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm border ${outstandingBalance > 0 ? 'bg-amber-500/15 text-amber-700 border-amber-400/30' : 'bg-emerald-500/15 text-emerald-700 border-emerald-400/30'}`}>
              <span className="material-symbols-outlined text-[20px]">
                {outstandingBalance > 0 ? 'schedule' : 'verified'}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className={`text-3xl font-extrabold tracking-tight ${outstandingBalance > 0 ? 'text-[#0d1b3e]' : 'text-emerald-700'}`}>
              {formatAud(outstandingBalance)}
            </p>
            {outstandingBalance > 0 && onPayNowClick && (
              <button
                type="button"
                onClick={onPayNowClick}
                className="px-3.5 py-1.5 rounded-lg bg-[#152d5a] hover:bg-[#1a3a6e] text-white text-xs font-bold transition-colors shadow-sm"
              >
                Pay Now
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-[#526582] mt-3 font-medium">
          {outstandingBalance > 0
            ? `${pendingInvoicesCount} invoice${pendingInvoicesCount === 1 ? '' : 's'} pending`
            : 'All invoices settled in full.'}
        </p>
      </div>
    </div>
  )
}
