'use client'

import React from 'react'
import { RecentActivityItem } from './types'

export default function RecentPaymentActivity({
  activities,
  onViewAll,
}: {
  activities: RecentActivityItem[]
  onViewAll?: () => void
}) {
  if (!activities || activities.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-[#152d5a]/10 shadow-[0_4px_20px_rgba(21,45,90,0.04)]">
        <div className="flex items-center gap-2 mb-1 text-[#152d5a]">
          <span className="material-symbols-outlined text-[20px] text-blue-600">schedule</span>
          <h3 className="text-base font-bold">Recent payment activity</h3>
        </div>
        <p className="text-xs text-slate-500 mb-6">Latest updates on your invoices and payments.</p>
        <div className="py-8 text-center text-slate-400">
          <p className="text-xs">No payment activity yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 border border-[#152d5a]/10 shadow-[0_4px_20px_rgba(21,45,90,0.04)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 text-[#152d5a]">
            <span className="material-symbols-outlined text-[20px] text-blue-600">schedule</span>
            <h3 className="text-base font-bold">Recent payment activity</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Latest updates on your invoices and payments.</p>
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-bold text-[#1a4fd6] hover:underline inline-flex items-center gap-1"
          >
            View all activity →
          </button>
        )}
      </div>

      {/* Timeline List */}
      <div className="divide-y divide-slate-100">
        {activities.map((item) => {
          let icon = 'check'
          let iconBg = 'bg-emerald-500 text-white'

          if (item.type === 'invoice') {
            icon = 'description'
            iconBg = 'bg-blue-600 text-white'
          } else if (item.type === 'receipt') {
            icon = 'mail'
            iconBg = 'bg-blue-500 text-white'
          } else if (item.type === 'waiver') {
            icon = 'assignment_turned_in'
            iconBg = 'bg-slate-600 text-white'
          } else if (item.type === 'settlement') {
            icon = 'manage_accounts'
            iconBg = 'bg-teal-600 text-white'
          } else if (item.type === 'refund') {
            icon = 'undo'
            iconBg = 'bg-purple-600 text-white'
          }

          return (
            <div
              key={item.id}
              className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4 transition-colors hover:bg-slate-50/50 rounded-xl px-2 sm:px-0"
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0 shadow-sm mt-0.5`}
                >
                  <span className="material-symbols-outlined text-[18px]">{icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-[#152d5a]">{item.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.description}</p>
                  {/* Timestamp shown below on small screens */}
                  <div className="sm:hidden flex items-center gap-1 text-[11px] text-slate-400 font-medium mt-1.5">
                    <span className="material-symbols-outlined text-[13px]">schedule</span>
                    <span>{item.timestamp}</span>
                  </div>
                </div>
              </div>
              {/* Timestamp shown on the right on larger screens */}
              <span className="hidden sm:inline-block text-[11px] text-slate-400 font-medium whitespace-nowrap shrink-0 pl-2">
                {item.timestamp}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
