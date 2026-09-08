'use client'

import React from 'react'
import { SettlementType } from './types'

export default function SettlementTypeBadge({ type }: { type?: SettlementType | string | null }) {
  if (!type) {
    return <span className="text-slate-400 font-medium">—</span>
  }

  const t = String(type).toUpperCase()

  if (t === 'ADMIN_WAIVER' || t === 'WAIVED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 border border-slate-200">
        <span className="material-symbols-outlined text-[13px] text-slate-500">assignment_turned_in</span>
        Admin Waiver
      </span>
    )
  }

  if (t === 'ADMIN_SETTLEMENT' || t === 'SETTLED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-800 border border-teal-200">
        <span className="material-symbols-outlined text-[13px] text-teal-600">manage_accounts</span>
        Admin Settlement
      </span>
    )
  }

  if (t === 'REFUND' || t === 'REFUNDED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2.5 py-1 text-[11px] font-medium text-purple-700 border border-purple-200">
        <span className="material-symbols-outlined text-[13px] text-purple-500">undo</span>
        Refund
      </span>
    )
  }

  if (t === 'ADJUSTMENT') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 border border-amber-200">
        <span className="material-symbols-outlined text-[13px] text-amber-600">tune</span>
        Adjustment
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50/70 px-2.5 py-1 text-[11px] font-medium text-[#152d5a] border border-[#152d5a]/10">
      <span className="material-symbols-outlined text-[13px] text-blue-600">check_circle</span>
      Customer Payment
    </span>
  )
}
