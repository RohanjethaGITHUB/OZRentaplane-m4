import Link from 'next/link'
import type { PilotClearanceStatus, AccountStatus } from '@/lib/supabase/types'
import { CLEARANCE_LABEL, CLEARANCE_BADGE } from '@/lib/pilot-status'
import { formatDateTime } from '@/lib/formatDateTime'
import { CLEARANCE_ACTION } from './clearance-actions'
import UnblockCustomerButton from './UnblockCustomerButton'

type Props = {
  clearanceStatus: PilotClearanceStatus
  accountStatus: AccountStatus
  latestCheckoutBookingId: string | null
  adminReviewNote: string | null
  reviewedAt: string | null
  customerId: string
}

const URGENCY_GLOW: Record<string, string> = {
  high:   'bg-amber-300/4',
  medium: 'bg-blue-300/4',
  low:    'bg-red-300/3',
  none:   'bg-blue-300/2',
}

const STATUS_GLOW_OVERRIDE: Partial<Record<PilotClearanceStatus, string>> = {
  checkout_requested:             'bg-blue-300/5',
  checkout_confirmed:             'bg-blue-300/4',
  cleared_to_fly:                 'bg-green-300/4',
  checkout_payment_required:      'bg-orange-300/4',
}

const OUTCOME_OPTIONS = [
  { icon: 'flight_takeoff', color: 'text-green-400', label: 'Cleared to Fly' },
  { icon: 'schedule',       color: 'text-amber-400', label: 'Additional Checkout Required' },
  { icon: 'event_repeat',   color: 'text-amber-400', label: 'Checkout Reschedule Required' },
  { icon: 'person_off',     color: 'text-red-400',   label: 'Not Currently Eligible' },
]

export default function CurrentActionSection({
  clearanceStatus,
  accountStatus,
  latestCheckoutBookingId,
  adminReviewNote,
  reviewedAt,
  customerId,
}: Props) {
  const action = CLEARANCE_ACTION[clearanceStatus]
  const clearanceLabel = CLEARANCE_LABEL[clearanceStatus]
  const clearanceBadge = CLEARANCE_BADGE[clearanceStatus]
  const glowClass = STATUS_GLOW_OVERRIDE[clearanceStatus] ?? URGENCY_GLOW[action.urgency] ?? 'bg-blue-300/2'
  const isUnderReview = clearanceStatus === 'checkout_completed_under_review'
  const isBlocked = accountStatus === 'blocked'

  const displayDescription = isBlocked
    ? 'This account has been blocked. The customer cannot create new bookings or access the platform until unblocked.'
    : action.description

  return (
    <div className="space-y-8">
      {/* ── Status + description ─────────────────────────────────────── */}
      <div className="relative">
        <div className={`absolute inset-0 rounded-2xl blur-3xl -z-10 ${glowClass}`} />
        <div className="rounded-2xl p-8 flex gap-6 border bg-white border-[rgba(12,35,64,0.15)]">
          {/* Icon */}
          <div className="w-10 h-10 rounded-full bg-[#f6f9fc] flex items-center justify-center flex-shrink-0 mt-0.5">
            <span
              className={`material-symbols-outlined text-xl ${
                isBlocked
                  ? 'text-red-500'
                  : action.urgency === 'none' || clearanceStatus === 'cleared_to_fly'
                    ? 'text-green-600'
                    : action.urgency === 'high'
                      ? 'text-blue-600'
                      : 'text-[#3d5a80]'
              }`}
              style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
            >
              {isBlocked ? 'block' : action.icon}
            </span>
          </div>

          <div className="flex-1 space-y-3">
            {/* Clearance badge */}
            <div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${clearanceBadge}`}>
                {clearanceLabel}
              </span>
            </div>

            <p className="text-sm text-[#0C2340] leading-relaxed">{displayDescription}</p>

            {/* CTAs */}
            {!isBlocked && action.ctas.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {action.ctas.map((cta, i) => {
                  const href = cta.href(latestCheckoutBookingId)
                  if (cta.style === 'primary') {
                    return (
                      <Link
                        key={i}
                        href={href}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold uppercase tracking-wide transition-all hover:scale-[1.02] active:scale-[0.98] bg-[#1a4a7a] hover:bg-[#153d66] text-white"
                      >
                        {cta.label}
                        <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 300" }}>arrow_forward</span>
                      </Link>
                    )
                  }
                  return (
                    <Link
                      key={i}
                      href={href}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-[rgba(12,35,64,0.18)] text-[#3d5a80] hover:text-[#0C2340] hover:border-[rgba(12,35,64,0.28)] rounded-xl text-[13px] font-semibold uppercase tracking-wide transition-colors"
                    >
                      {cta.label}
                    </Link>
                  )
                })}
              </div>
            )}
            {isBlocked ? (
              <div className="pt-2">
                <UnblockCustomerButton customerId={customerId} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Available outcomes panel (only when checkout is under review) ── */}
      {isUnderReview && (
        <div className="bg-amber-500/5 border border-amber-500/12 rounded-xl p-6">
          <p className="text-[10px] text-amber-400/70 uppercase tracking-widest font-bold mb-4">
            Available Outcomes — Set via Booking Detail Page
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {OUTCOME_OPTIONS.map(opt => (
              <div
                key={opt.label}
                className="flex items-center gap-2 bg-white border border-[rgba(12,35,64,0.12)] rounded-lg p-3"
              >
                <span
                  className={`material-symbols-outlined text-[15px] ${opt.color}`}
                  style={{ fontVariationSettings: "'wght' 300" }}
                >
                  {opt.icon}
                </span>
                <span className="text-[10px] font-medium text-[#3d5a80] leading-tight">{opt.label}</span>
              </div>
            ))}
          </div>
          {latestCheckoutBookingId && (
            <div className="mt-4 pt-4 border-t border-[#152d5a]/8">
              <Link
                href={`/admin/bookings/requests/${latestCheckoutBookingId}`}
                className="inline-flex items-center gap-2 text-[13px] text-amber-400 hover:text-amber-300 font-medium transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 300" }}>open_in_new</span>
                Open checkout booking to set the outcome
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Admin review note ─────────────────────────────────────────── */}
      {adminReviewNote && (
        <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-2xl p-8">
          <p className="text-xs text-[#3d5a80] uppercase tracking-wide mb-4 font-semibold">
            Internal Review Note
            <span className="normal-case font-normal text-[#3d5a80] ml-2">(not visible to customer)</span>
          </p>
          <p className="text-sm text-[#0C2340] leading-relaxed whitespace-pre-wrap">{adminReviewNote}</p>
          {reviewedAt && (
            <p className="text-xs text-[#3d5a80] uppercase tracking-wide pt-5 mt-5 border-t border-[rgba(12,35,64,0.12)]">
              Recorded{' '}
              <span className="text-[#0C2340] font-medium">{formatDateTime(reviewedAt)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
