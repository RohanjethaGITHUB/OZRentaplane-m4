'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  cancelCheckoutBooking,
  markCheckoutFlightCompleted,
  markCheckoutOutcome,
} from '@/app/actions/admin-booking'

// checkout_requested is handled by AdminCheckoutReviewPanel (left column)
type CheckoutStatus =
  | 'checkout_confirmed'
  | 'checkout_completed_under_review'

type Props = {
  bookingId: string
  status:    CheckoutStatus
}

type OutcomeKey = 'cleared_for_solo_hire' | 'additional_supervised_time_required' | 'reschedule_required' | 'not_currently_eligible'

const OUTCOMES: { key: OutcomeKey; label: string; body: string; color: string; border: string; textColor: string; icon: string }[] = [
  {
    key:       'cleared_for_solo_hire',
    label:     'Cleared for Solo Hire',
    body:      'Pilot is cleared for standard aircraft bookings.',
    color:     'bg-emerald-600 hover:bg-emerald-500',
    border:    'border-emerald-500/30',
    textColor: 'text-emerald-400',
    icon:      'verified',
  },
  {
    key:       'additional_supervised_time_required',
    label:     'Additional Supervised Time Required',
    body:      'Pilot requires more supervised sessions.',
    color:     'bg-amber-600 hover:bg-amber-500',
    border:    'border-amber-500/30',
    textColor: 'text-amber-400',
    icon:      'schedule',
  },
  {
    key:       'reschedule_required',
    label:     'Reschedule Required',
    body:      'Checkout needs to be rescheduled.',
    color:     'bg-orange-600 hover:bg-orange-500',
    border:    'border-orange-500/30',
    textColor: 'text-orange-400',
    icon:      'event_repeat',
  },
  {
    key:       'not_currently_eligible',
    label:     'Not Currently Eligible',
    body:      'Pilot is not eligible for solo hire.',
    color:     'bg-rose-700 hover:bg-rose-600',
    border:    'border-rose-500/30',
    textColor: 'text-rose-400',
    icon:      'block',
  },
]

export default function AdminCheckoutActions({ bookingId, status }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError]             = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [confirmingOutcome, setConfirmingOutcome] = useState<OutcomeKey | null>(null)
  const [adminNote, setAdminNote] = useState('')

  function run(fn: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Action failed. Please try again.'
        setError(msg.replace(/^VALIDATION: /, ''))
      }
    })
  }

  // ── Cancel flow (shared) ───────────────────────────────────────────────────

  if (isCancelling) {
    return (
      <div className="space-y-3">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-rose-400">Cancel Checkout Booking</h4>
        <textarea
          value={cancelReason}
          onChange={e => setCancelReason(e.target.value)}
          rows={4}
          placeholder="Reason for cancellation (will be recorded in audit trail)…"
          className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 resize-none"
          disabled={isPending}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setIsCancelling(false); setError(null) }}
            disabled={isPending}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            disabled={isPending || !cancelReason.trim()}
            onClick={() => run(() => cancelCheckoutBooking(bookingId, cancelReason))}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-rose-700 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
          >
            {isPending ? 'Cancelling…' : 'Cancel Booking'}
          </button>
        </div>
        {error && <p className="text-[10px] text-rose-400 leading-tight">{error}</p>}
      </div>
    )
  }

  // ── checkout_confirmed ────────────────────────────────────────────────────

  if (status === 'checkout_confirmed') {
    return (
      <div className="space-y-3">
        <button
          onClick={() => run(() => markCheckoutFlightCompleted(bookingId))}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">flight_land</span>
          {isPending ? 'Updating…' : 'Mark Checkout Completed'}
        </button>
        <p className="text-[9px] text-slate-600 leading-relaxed text-center">
          Click after the checkout flight has physically occurred. You will then record the outcome.
        </p>
        <button
          onClick={() => setIsCancelling(true)}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 bg-transparent border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">cancel</span>
          Cancel Checkout
        </button>
        {error && <p className="text-[10px] text-rose-400 leading-tight text-center">{error}</p>}
      </div>
    )
  }

  // ── checkout_completed_under_review — outcome selection ───────────────────

  if (confirmingOutcome) {
    const outcome = OUTCOMES.find(o => o.key === confirmingOutcome)!
    return (
      <div className="space-y-4">
        <div className={`rounded-xl border p-4 ${outcome.border} bg-white/[0.02]`}>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${outcome.textColor} mb-1`}>
            Recording: {outcome.label}
          </p>
          <p className="text-[11px] text-slate-500 leading-relaxed mb-3">{outcome.body}</p>
          <textarea
            value={adminNote}
            onChange={e => setAdminNote(e.target.value)}
            rows={3}
            placeholder="Optional internal note…"
            className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none resize-none"
            disabled={isPending}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setConfirmingOutcome(null); setAdminNote(''); setError(null) }}
            disabled={isPending}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => markCheckoutOutcome({ bookingId, outcome: confirmingOutcome, adminNote: adminNote || undefined }))}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium ${outcome.color} text-white transition-colors disabled:opacity-50`}
          >
            {isPending ? 'Recording…' : 'Confirm Outcome'}
          </button>
        </div>
        {error && <p className="text-[10px] text-rose-400 leading-tight">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[9px] uppercase tracking-widest font-bold text-slate-500 mb-3">
        Record Checkout Outcome
      </p>
      {OUTCOMES.map(outcome => (
        <button
          key={outcome.key}
          onClick={() => setConfirmingOutcome(outcome.key)}
          disabled={isPending}
          className="w-full flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-white/15 hover:bg-white/[0.06] text-left transition-all disabled:opacity-50"
        >
          <span
            className={`material-symbols-outlined text-[18px] flex-shrink-0 mt-0.5 ${outcome.textColor}`}
            style={{ fontVariationSettings: "'wght' 300" }}
          >
            {outcome.icon}
          </span>
          <div className="min-w-0">
            <p className={`text-[11px] font-semibold ${outcome.textColor}`}>{outcome.label}</p>
            <p className="text-[10px] text-slate-600 leading-relaxed mt-0.5">{outcome.body}</p>
          </div>
        </button>
      ))}
      {error && <p className="text-[10px] text-rose-400 leading-tight">{error}</p>}
    </div>
  )
}
