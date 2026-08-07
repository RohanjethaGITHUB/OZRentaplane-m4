'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  adminApproveCancellationWaived,
  adminApproveCancellationCharged,
} from '@/app/actions/admin-booking'
import ModalPortal from '@/components/ModalPortal'
import { LoadingButtonContent } from '@/components/ui/Spinner'
import { CHECKOUT_RATE_PER_HOUR, PAYF_RATE_PER_HOUR } from '@/lib/pricing-constants'

type Props = {
  cancellationRequestId: string
  bookingReference:      string | null
  bookingType:           string
  customerMessage:       string | null
  bookingStartTime:      string   // ISO — used for display
  estimatedAmount:       number | null
  estimatedHours:        number | null
}

function suggestedChargeDollars(
  bookingType: string,
  estimatedAmount: number | null,
  estimatedHours: number | null,
): number | null {
  if (estimatedAmount != null && estimatedAmount > 0) return estimatedAmount
  if (estimatedHours != null && estimatedHours > 0) {
    const rate = bookingType === 'checkout' ? CHECKOUT_RATE_PER_HOUR : PAYF_RATE_PER_HOUR
    return Math.round(estimatedHours * rate * 100) / 100
  }
  return null
}

export default function AdminCancellationReviewCard({
  cancellationRequestId,
  bookingReference,
  bookingType,
  customerMessage,
  bookingStartTime,
  estimatedAmount,
  estimatedHours,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [modal, setModal]   = useState<'waive' | 'charge' | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [chargeInput, setChargeInput] = useState('')
  const [error, setError]   = useState<string | null>(null)

  const suggested = useMemo(
    () => suggestedChargeDollars(bookingType, estimatedAmount, estimatedHours),
    [bookingType, estimatedAmount, estimatedHours],
  )

  const chargeDisplay = suggested != null ? `$${suggested.toFixed(2)}` : 'Enter amount'

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
    setChargeInput(suggested != null ? suggested.toFixed(2) : '')
    setModal(decision)
  }

  function handleConfirm() {
    startTransition(async () => {
      try {
        if (modal === 'waive') {
          await adminApproveCancellationWaived(cancellationRequestId, adminNote || null)
        } else {
          const parsed = Number(chargeInput)
          if (!Number.isFinite(parsed) || parsed <= 0) {
            setError('Enter a charge amount greater than zero.')
            return
          }
          await adminApproveCancellationCharged(
            cancellationRequestId,
            adminNote || null,
            parsed,
          )
        }
        setModal(null)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message.replace('VALIDATION: ', '') : 'Action failed.')
      }
    })
  }

  return (
    <>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-5">

        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-amber-600 text-xl animate-pulse">pending_actions</span>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-amber-800">
              Cancellation Request — Review Required
            </h3>
            <p className="text-[11px] text-amber-700/80 mt-0.5">
              Late cancellation pending admin review
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-[#4b6390] mb-1">Departure</p>
            <p className="text-sm font-medium text-[#152d5a]">{departureDisplay}</p>
          </div>
          {estimatedHours != null && (
            <div>
              <p className="text-[9px] uppercase tracking-widest text-[#4b6390] mb-1">Estimated Hours</p>
              <p className="text-sm font-medium text-[#152d5a]">{estimatedHours.toFixed(1)} h</p>
            </div>
          )}
          <div>
            <p className="text-[9px] uppercase tracking-widest text-[#4b6390] mb-1">Estimated Charge</p>
            <p className="text-sm font-semibold text-amber-800">{chargeDisplay}</p>
          </div>
        </div>

        {customerMessage && (
          <div className="rounded-lg border border-amber-200/80 bg-white px-4 py-3">
            <p className="text-[9px] uppercase tracking-widest text-[#4b6390] mb-2">Customer Message</p>
            <p className="text-sm text-[#152d5a] leading-relaxed">{customerMessage}</p>
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
            Apply charge
          </button>
        </div>

      </div>

      {/* ── Decision modal ─────────────────────────────────────────────────── */}
      {modal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => { if (!isPending) setModal(null) }}
            />
            <div className="relative z-10 w-full max-w-md bg-white border border-[#152d5a]/10 rounded-2xl p-7 shadow-2xl">

              <h2 className={`text-sm font-bold uppercase tracking-widest mb-1 ${modal === 'waive' ? 'text-green-700' : 'text-orange-700'}`}>
                {modal === 'waive' ? 'Approve — Waive Charge' : 'Approve — Apply Charge'}
              </h2>
              <p className="text-[12px] text-[#4b6390] mb-4 leading-relaxed">
                {modal === 'waive'
                  ? `Booking ${bookingReference ?? ''} will be cancelled with no charge.`
                  : `Booking ${bookingReference ?? ''} will be cancelled and the charge below will be applied.`}
              </p>

              {modal === 'charge' && (
                <div className="mb-4">
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-[#4b6390] mb-2">
                    Charge amount (AUD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#4b6390]">$</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={chargeInput}
                      onChange={e => setChargeInput(e.target.value)}
                      disabled={isPending}
                      placeholder="0.00"
                      className="w-full pl-7 pr-4 py-3 bg-white border border-[#152d5a]/15 focus:border-orange-400/60 focus:outline-none focus:ring-1 focus:ring-orange-200 rounded-xl text-[#152d5a] text-sm transition-colors"
                    />
                  </div>
                  {suggested != null && (
                    <p className="mt-1.5 text-[11px] text-[#4b6390]">
                      Suggested from booking estimate: ${suggested.toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              <div className="mb-5">
                <label className="block text-[9px] font-bold uppercase tracking-widest text-[#4b6390] mb-2">
                  Admin note (optional)
                </label>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  disabled={isPending}
                  placeholder="Add context for the status history…"
                  className="w-full px-4 py-3 bg-white border border-[#152d5a]/15 focus:border-[#1a4fd6]/40 focus:outline-none focus:ring-1 focus:ring-[#1a4fd6]/20 rounded-xl text-[#152d5a] text-sm placeholder:text-[#94a3b8] transition-colors resize-none leading-relaxed"
                />
              </div>

              {error && (
                <p className="mb-4 text-[11px] text-red-600 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">error</span>
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setModal(null); setError(null) }}
                  disabled={isPending}
                  className="flex-1 py-2.5 border border-[#152d5a]/15 hover:border-[#152d5a]/25 text-[#4b6390] hover:text-[#152d5a] rounded-lg text-[10px] font-bold uppercase tracking-[0.15em] transition-colors disabled:opacity-50 bg-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isPending}
                  aria-busy={isPending || undefined}
                  className={`flex-1 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-[10px] font-bold uppercase tracking-[0.15em] transition-colors flex items-center justify-center gap-2 ${
                    modal === 'waive'
                      ? 'bg-green-600 hover:bg-green-500'
                      : 'bg-orange-600 hover:bg-orange-500'
                  }`}
                >
                  <LoadingButtonContent loading={isPending} loadingLabel="Processing…">
                    Confirm
                  </LoadingButtonContent>
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
