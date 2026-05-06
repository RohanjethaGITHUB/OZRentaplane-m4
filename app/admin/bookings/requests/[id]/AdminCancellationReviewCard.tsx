'use client'

import { useState, useTransition } from 'react'
import {
  adminApproveCancellationWaived,
  adminApproveCancellationCharged,
} from '@/app/actions/admin-booking'

type Props = {
  cancellationRequestId: string
  bookingReference:      string | null
  customerMessage:       string | null
  bookingStartTime:      string   // ISO — used for display
  estimatedAmount:       number | null
  estimatedHours:        number | null
}

export default function AdminCancellationReviewCard({
  cancellationRequestId,
  bookingReference,
  customerMessage,
  bookingStartTime,
  estimatedAmount,
  estimatedHours,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [modal, setModal]   = useState<'waive' | 'charge' | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [error, setError]   = useState<string | null>(null)

  const chargeDisplay = estimatedAmount
    ? `$${estimatedAmount.toFixed(2)}`
    : 'Amount TBD'

  const departureDisplay = new Date(bookingStartTime).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday:  'short',
    month:    'short',
    day:      'numeric',
    hour:     'numeric',
    minute:   '2-digit',
  })

  function handleDecision(decision: 'waive' | 'charge') {
    setError(null)
    setAdminNote('')
    setModal(decision)
  }

  function handleConfirm() {
    startTransition(async () => {
      try {
        if (modal === 'waive') {
          await adminApproveCancellationWaived(cancellationRequestId, adminNote || null)
        } else {
          await adminApproveCancellationCharged(cancellationRequestId, adminNote || null)
        }
        setModal(null)
      } catch (err) {
        setError(err instanceof Error ? err.message.replace('VALIDATION: ', '') : 'Action failed.')
      }
    })
  }

  return (
    <>
      <div className="bg-amber-500/[0.07] border border-amber-500/25 rounded-xl p-6 space-y-5">

        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-amber-400 text-xl animate-pulse">pending_actions</span>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400">
              Cancellation Request — Review Required
            </h3>
            <p className="text-[10px] text-amber-400/60 mt-0.5">
              Late cancellation (within 24 hours of departure)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Departure</p>
            <p className="text-sm text-white">{departureDisplay}</p>
          </div>
          {estimatedHours != null && (
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Estimated Hours</p>
              <p className="text-sm text-white">{estimatedHours.toFixed(1)} h</p>
            </div>
          )}
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Estimated Charge</p>
            <p className="text-sm font-semibold text-amber-300">{chargeDisplay}</p>
          </div>
        </div>

        {customerMessage && (
          <div className="bg-white/[0.04] border border-white/[0.07] rounded-lg p-4">
            <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-2">Customer Message</p>
            <p className="text-sm text-slate-300 leading-relaxed">{customerMessage}</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => handleDecision('waive')}
            disabled={isPending}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-bold uppercase tracking-[0.15em] transition-colors"
          >
            Waive charge
          </button>
          <button
            onClick={() => handleDecision('charge')}
            disabled={isPending}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-bold uppercase tracking-[0.15em] transition-colors"
          >
            Apply charge ({chargeDisplay})
          </button>
        </div>

      </div>

      {/* ── Decision modal ─────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => { if (!isPending) setModal(null) }}
          />
          <div className="relative z-10 w-full max-w-md bg-[#0c1525] border border-white/10 rounded-2xl p-7 shadow-2xl">

            <h2 className={`text-sm font-bold uppercase tracking-widest mb-1 ${modal === 'waive' ? 'text-green-300' : 'text-orange-300'}`}>
              {modal === 'waive' ? 'Approve — Waive Charge' : 'Approve — Apply Charge'}
            </h2>
            <p className="text-[11px] text-slate-400 mb-4">
              {modal === 'waive'
                ? `Booking ${bookingReference ?? ''} will be cancelled with no charge.`
                : `Booking ${bookingReference ?? ''} will be cancelled and a charge of ${chargeDisplay} will be applied.`}
            </p>

            <div className="mb-5">
              <label className="block text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                Admin note (optional)
              </label>
              <textarea
                rows={3}
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                disabled={isPending}
                placeholder="Add context for the status history…"
                className="w-full px-4 py-3 bg-[#05080f] border border-white/[0.07] focus:border-blue-500/40 focus:outline-none rounded-xl text-white text-sm placeholder:text-slate-700 transition-colors resize-none leading-relaxed"
              />
            </div>

            {error && (
              <p className="mb-4 text-[11px] text-red-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">error</span>
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setModal(null); setError(null) }}
                disabled={isPending}
                className="flex-1 py-2.5 border border-white/15 hover:border-white/25 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-[0.15em] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className={`flex-1 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-[10px] font-bold uppercase tracking-[0.15em] transition-colors ${
                  modal === 'waive'
                    ? 'bg-green-600 hover:bg-green-500'
                    : 'bg-orange-600 hover:bg-orange-500'
                }`}
              >
                {isPending ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
