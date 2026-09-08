'use client'

import React from 'react'
import { PaymentMethodType, CardDetails } from './types'

export function VisaIcon({ className = 'h-3.5 w-auto' }: { className?: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded bg-[#1a1f71] px-1.5 py-0.5 text-[9px] font-black italic tracking-widest text-white">
      VISA
    </span>
  )
}

export function MastercardIcon({ className = 'h-3.5 w-auto' }: { className?: string }) {
  return (
    <span className="inline-flex items-center">
      <span className="h-3.5 w-3.5 rounded-full bg-[#eb001b] opacity-90 -mr-1.5 inline-block" />
      <span className="h-3.5 w-3.5 rounded-full bg-[#f79e1b] opacity-90 inline-block" />
    </span>
  )
}

export function AmexIcon({ className = 'h-3.5 w-auto' }: { className?: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded bg-[#006fcf] px-1 py-0.5 text-[8px] font-bold uppercase text-white">
      AMEX
    </span>
  )
}

export function CardBrandIcon({ brand }: { brand?: string | null }) {
  const b = brand?.toLowerCase()
  if (b === 'visa') return <VisaIcon />
  if (b === 'mastercard' || b === 'mc') return <MastercardIcon />
  if (b === 'amex' || b === 'american_express') return <AmexIcon />
  return (
    <span className="material-symbols-outlined text-[15px] text-slate-500">
      credit_card
    </span>
  )
}

export default function PaymentMethodBadge({
  method,
  card,
  isWaivedOrSettled = false,
  status,
  detailed = false,
}: {
  method?: PaymentMethodType | string | null
  card?: CardDetails | null
  isWaivedOrSettled?: boolean
  status?: string | null
  detailed?: boolean
}) {
  const st = String(status || '').toUpperCase()
  if (st === 'WAIVED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
        <span className="material-symbols-outlined text-[14px] text-slate-500">assignment_turned_in</span>
        Waived
      </span>
    )
  }

  if (st === 'SETTLED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200">
        <span className="material-symbols-outlined text-[14px] text-teal-600">manage_accounts</span>
        Settled
      </span>
    )
  }

  if (isWaivedOrSettled || method === 'none' || !method) {
    return <span className="text-slate-400 font-medium">—</span>
  }

  const m = String(method).toLowerCase()

  if (m === 'card' || m === 'stripe') {
    if (detailed) {
      return (
        <div className="inline-flex items-center gap-2">
          <CardBrandIcon brand={card?.brand ?? (card?.last4?.startsWith('4') ? 'visa' : 'mastercard')} />
          <span className="font-mono text-xs text-slate-700 font-medium">
            •••• {card?.last4 || '4242'}
          </span>
        </div>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#152d5a] bg-blue-50/80 px-2.5 py-1 rounded-lg border border-blue-200/60">
        <span className="material-symbols-outlined text-[14px] text-blue-600">credit_card</span>
        Card
      </span>
    )
  }

  if (m === 'cash') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
        <span className="material-symbols-outlined text-[14px] text-emerald-600">payments</span>
        Cash
      </span>
    )
  }

  if (m === 'bank_transfer') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
        <span className="material-symbols-outlined text-[14px] text-blue-600">account_balance</span>
        Bank Transfer
      </span>
    )
  }

  if (m === 'online_payment' || m === 'online') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
        <span className="material-symbols-outlined text-[14px] text-indigo-600">language</span>
        Online Payment
      </span>
    )
  }

  if (m === 'block_time') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200">
        <span className="material-symbols-outlined text-[14px] text-sky-600">flight</span>
        Block Time
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 capitalize border border-slate-200">
      {m.replace(/_/g, ' ')}
    </span>
  )
}
