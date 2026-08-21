'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { customerAcceptProposedCheckoutTime, customerRejectProposedCheckoutTime } from '@/app/actions/checkout'
import { formatDateFromISO, formatTime12hFromISO } from '@/lib/formatDateTime'
import ModalPortal from '@/components/ModalPortal'

type Props = {
  open: boolean
  onClose: () => void
  bookingId: string
  requestedStart: string
  requestedEnd?: string | null
  originalStart?: string | null
  originalEnd?: string | null
  aircraftReg?: string | null
  onSuccess?: () => void
}

export default function CheckoutTimeProposalModal({
  open,
  onClose,
  bookingId,
  requestedStart,
  requestedEnd,
  originalStart,
  originalEnd,
  aircraftReg,
  onSuccess,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [actionType, setActionType] = useState<'accept' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDeclineInput, setShowDeclineInput] = useState(false)
  const [declineReason, setDeclineReason] = useState('')

  if (!open) return null

  const propDate = formatDateFromISO(requestedStart)
  const propStartTime = formatTime12hFromISO(requestedStart)
  const propEndTime = requestedEnd ? formatTime12hFromISO(requestedEnd) : null

  const origDate = originalStart ? formatDateFromISO(originalStart) : null
  const origStartTime = originalStart ? formatTime12hFromISO(originalStart) : null
  const origEndTime = originalEnd ? formatTime12hFromISO(originalEnd) : null

  function handleAccept() {
    setError(null)
    setActionType('accept')
    startTransition(async () => {
      try {
        await customerAcceptProposedCheckoutTime(bookingId)
        onClose()
        router.refresh()
        onSuccess?.()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message.replace(/^VALIDATION: |^AVAILABILITY: /, '') : 'Failed to accept time.')
        setActionType(null)
      }
    })
  }

  function handleDecline() {
    setError(null)
    setActionType('reject')
    startTransition(async () => {
      try {
        await customerRejectProposedCheckoutTime(bookingId, declineReason)
        setShowDeclineInput(false)
        setDeclineReason('')
        onClose()
        router.refresh()
        onSuccess?.()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Failed to decline time.')
        setActionType(null)
      }
    })
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[1200] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/50 backdrop-blur-sm animate-fadeIn">
        <div className="w-full max-w-lg max-h-[92vh] bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[#152d5a]/10 bg-gradient-to-r from-amber-50/60 to-white flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm flex-shrink-0">
                <span className="material-symbols-outlined text-base sm:text-lg">schedule_send</span>
              </div>
              <div>
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  Operations Proposal
                </p>
                <h3 className="text-sm sm:text-base font-bold text-[#152d5a]">
                  Review Proposed Checkout Time
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg sm:text-xl">close</span>
            </button>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
            <p className="text-xs text-[#4b6390] leading-relaxed">
              Our operations team proposed an alternative time slot for your checkout flight{aircraftReg ? ` on ${aircraftReg}` : ''}. Please review the proposed time below and accept or decline.
            </p>

            {/* Time Comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Original */}
              {originalStart && (
                <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3.5 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                    Current / Original Slot
                  </span>
                  <p className="text-xs font-bold text-[#152d5a]">
                    {origDate}
                  </p>
                  <p className="text-xs text-[#4b6390] tabular-nums">
                    {origStartTime} {origEndTime ? `– ${origEndTime}` : ''}
                  </p>
                  <span className="text-[10px] text-gray-400 block pt-0.5">
                    (Held pending your decision)
                  </span>
                </div>
              )}

              {/* Proposed */}
              <div className="rounded-xl border-2 border-amber-300 bg-amber-50/90 p-3.5 space-y-1 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    Proposed New Slot
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-amber-200 text-amber-900">
                    New
                  </span>
                </div>
                <p className="text-xs font-bold text-amber-950">
                  {propDate}
                </p>
                <p className="text-xs font-semibold text-amber-900 tabular-nums">
                  {propStartTime} {propEndTime ? `– ${propEndTime}` : ''}
                </p>
                <span className="text-[10px] text-amber-700 block pt-0.5">
                  Sydney time · 2 hrs fixed
                </span>
              </div>
            </div>

            {/* Info note */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-[11px] text-[#152d5a] space-y-1">
              <p className="font-semibold text-blue-900 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#1a4fd6]">info</span>
                How this works
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-blue-800/90 pl-1">
                <li><strong>Accept:</strong> Your checkout booking will be scheduled for this new time immediately.</li>
                <li><strong>Decline:</strong> Your original requested slot stays active, and operations will be notified.</li>
              </ul>
            </div>

            {/* Optional Decline Reason Form */}
            {showDeclineInput && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 space-y-2 animate-fadeIn">
                <label className="text-[11px] font-bold text-rose-900 block">
                  Add an optional reason or preferred availability:
                </label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="e.g. Unable to make this time, prefer afternoons or weekend slots…"
                  rows={2}
                  disabled={isPending}
                  className="w-full rounded-xl border border-rose-200 bg-white p-2.5 text-xs text-[#152d5a] focus:outline-none focus:border-[#1a4fd6] resize-none"
                />
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeclineInput(false)}
                    disabled={isPending}
                    className="inline-flex items-center justify-center px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg shadow-xs transition-colors w-full sm:w-auto"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDecline}
                    disabled={isPending}
                    className="inline-flex items-center justify-center gap-1 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-colors w-full sm:w-auto"
                  >
                    {isPending && actionType === 'reject' ? 'Declining…' : 'Confirm Decline'}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 font-medium">
                {error}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          {!showDeclineInput && (
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 px-4 sm:px-6 py-4 border-t border-[#152d5a]/10 bg-gray-50/80">
              <button
                type="button"
                onClick={() => setShowDeclineInput(true)}
                disabled={isPending}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold shadow-xs transition-colors disabled:opacity-50 w-full sm:w-auto"
              >
                <span className="material-symbols-outlined text-sm">cancel</span>
                Decline Time
              </button>

              <div className="flex flex-col-reverse sm:flex-row items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPending}
                  className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-xs transition-colors w-full sm:w-auto"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={isPending}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all disabled:opacity-50 w-full sm:w-auto"
                >
                  {isPending && actionType === 'accept' ? (
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                  )}
                  Accept Proposed Time
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}
