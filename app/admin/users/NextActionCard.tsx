import Link from 'next/link'
import type { PilotClearanceStatus, AccountStatus } from '@/lib/supabase/types'
import { CLEARANCE_ACTION } from './clearance-actions'

type Props = {
  clearanceStatus: PilotClearanceStatus
  accountStatus: AccountStatus
  latestCheckoutBookingId: string | null
}

// Visual style per urgency level
const URGENCY_STYLE = {
  high:   { cardBg: 'bg-amber-900/10',   cardBorder: 'border-amber-500/20',  iconColor: 'text-amber-400'  },
  medium: { cardBg: 'bg-blue-900/10',    cardBorder: 'border-blue-500/15',   iconColor: 'text-blue-300'   },
  low:    { cardBg: 'bg-red-900/10',     cardBorder: 'border-red-500/20',    iconColor: 'text-red-400'    },
  none:   { cardBg: 'bg-[#1e2023]/60',   cardBorder: 'border-white/8',       iconColor: 'text-slate-400'  },
}

// Per-status overrides for cases where urgency alone doesn't capture the visual intent
const STATUS_STYLE_OVERRIDE: Partial<Record<PilotClearanceStatus, typeof URGENCY_STYLE.high>> = {
  checkout_requested:  { cardBg: 'bg-blue-900/10',  cardBorder: 'border-blue-500/20',  iconColor: 'text-blue-300'  },
  checkout_confirmed:  { cardBg: 'bg-blue-900/10',  cardBorder: 'border-blue-500/15',  iconColor: 'text-blue-300'  },
  cleared_to_fly: { cardBg: 'bg-green-900/10', cardBorder: 'border-green-500/15', iconColor: 'text-green-400' },
  checkout_payment_required: { cardBg: 'bg-orange-900/10', cardBorder: 'border-orange-500/20', iconColor: 'text-orange-400' },
}

export default function NextActionCard({ clearanceStatus, accountStatus, latestCheckoutBookingId }: Props) {
  if (accountStatus === 'blocked') {
    return (
      <div className="backdrop-blur-xl border rounded-xl p-6 flex flex-col gap-4 bg-red-900/10 border-red-500/20">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-2xl text-red-400" style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}>block</span>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Next Required Action</p>
        </div>
        <p className="text-sm text-blue-100/80 leading-relaxed">This account is blocked. No bookings can be made.</p>
      </div>
    )
  }

  const action = CLEARANCE_ACTION[clearanceStatus]
  const style  = STATUS_STYLE_OVERRIDE[clearanceStatus] ?? URGENCY_STYLE[action.urgency]

  return (
    <div className={`backdrop-blur-xl border rounded-xl p-6 flex flex-col gap-4 ${style.cardBg} ${style.cardBorder}`}>
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <span
          className={`material-symbols-outlined text-2xl ${style.iconColor}`}
          style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
        >
          {action.icon}
        </span>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
          Next Required Action
        </p>
      </div>

      <p className="text-sm text-blue-100/80 leading-relaxed">{action.description}</p>

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
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors"
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
                className="flex items-center justify-center gap-2 px-4 py-2 border border-blue-300/15 text-slate-400 hover:text-white hover:border-blue-300/30 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors"
              >
                {cta.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
