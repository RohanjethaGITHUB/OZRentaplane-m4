'use client'

import React from 'react'
import { PaymentStatus } from './types'

export default function InvoiceStatusBadge({ status }: { status: PaymentStatus | string }) {
  const s = String(status).toUpperCase()

  switch (s) {
    case 'PAID':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Paid
        </span>
      )

    case 'PARTIALLY_PAID':
    case 'PARTIAL':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          Partially Paid
        </span>
      )

    case 'PENDING':
    case 'PAYMENT_REQUIRED':
    case 'AWAITING':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          Pending
        </span>
      )

    case 'WAIVED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
          Waived
        </span>
      )

    case 'SETTLED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
          Settled
        </span>
      )

    case 'REFUNDED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
          Refunded
        </span>
      )

    case 'FAILED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Failed
        </span>
      )

    case 'CANCELLED':
    case 'VOID':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          Cancelled
        </span>
      )

    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 capitalize">
          {status.replace(/_/g, ' ')}
        </span>
      )
  }
}
