import Link from 'next/link'
import type { ReactNode } from 'react'
import type { PilotClearanceStatus, AccountStatus } from '@/lib/supabase/types'
import { CLEARANCE_ACTION } from './clearance-actions'

type Props = {
  clearanceStatus: PilotClearanceStatus
  accountStatus: AccountStatus
  latestCheckoutBookingId: string | null
  historicalCheckoutAction?: ReactNode
}

export default function NextActionCard({ clearanceStatus, accountStatus, latestCheckoutBookingId, historicalCheckoutAction }: Props) {
  if (accountStatus === 'blocked') {
    return (
      <div className="border rounded-xl p-6 flex flex-col gap-4 bg-white border-[rgba(12,35,64,0.15)]">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-2xl text-red-400" style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}>block</span>
          <p className="text-xs text-[#3d5a80] uppercase tracking-wide font-semibold">Next Required Action</p>
        </div>
        <p className="text-sm text-[#0C2340] leading-relaxed">This account is blocked. No bookings can be made.</p>
      </div>
    )
  }

  const action = CLEARANCE_ACTION[clearanceStatus]

  return (
    <div className="border rounded-xl p-6 flex flex-col gap-4 bg-white border-[rgba(12,35,64,0.15)]">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <span
          className={`material-symbols-outlined text-2xl ${
            action.urgency === 'none' || clearanceStatus === 'cleared_to_fly'
              ? 'text-green-600'
              : action.urgency === 'high'
                ? 'text-amber-500'
                : clearanceStatus === 'checkout_payment_required'
                  ? 'text-orange-500'
                  : 'text-[#3d5a80]'
          }`}
          style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
        >
          {action.icon}
        </span>
        <p className="text-xs text-[#3d5a80] uppercase tracking-wide font-semibold">
          Next Required Action
        </p>
      </div>

      <p className="text-sm text-[#0C2340] leading-relaxed">{action.description}</p>

      {/* CTAs */}
      {action.ctas.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          {action.ctas.map((cta, i) => {
            const href = cta.href(latestCheckoutBookingId)
            if (cta.style === 'primary') {
              return (
                <Link
                  key={i}
                  href={href}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1a4a7a] hover:bg-[#153d66] text-white rounded-xl text-xs font-semibold uppercase tracking-wide transition-colors"
                >
                  {cta.label}
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>arrow_forward</span>
                </Link>
              )
            }
            return (
              <Link
                key={i}
                href={href}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-[rgba(12,35,64,0.18)] text-[#3d5a80] hover:text-[#0C2340] hover:border-[rgba(12,35,64,0.28)] rounded-xl text-xs font-semibold uppercase tracking-wide transition-colors"
              >
                {cta.label}
              </Link>
            )
          })}
        </div>
      )}
      {clearanceStatus === 'checkout_required' && historicalCheckoutAction ? (
        <div className="mt-1">{historicalCheckoutAction}</div>
      ) : null}
    </div>
  )
}
