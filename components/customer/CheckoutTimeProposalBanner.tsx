'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { customerAcceptProposedCheckoutTime, customerRejectProposedCheckoutTime } from '@/app/actions/checkout'
import { formatDateFromISO, formatTime12hFromISO } from '@/lib/formatDateTime'
import ModalPortal from '@/components/ModalPortal'

type Props = {
  bookingId: string
  requestedStart: string
  requestedEnd?: string | null
  adminNote?: string | null
  variant?: 'card' | 'banner' | 'chat'
  onSuccess?: () => void
}

export default function CheckoutTimeProposalBanner({
  bookingId,
  requestedStart,
  requestedEnd,
  adminNote,
  variant = 'card',
  onSuccess,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [actionType, setActionType] = useState<'accept' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [showAcceptConfirm, setShowAcceptConfirm] = useState(false)

  const formattedDate = formatDateFromISO(requestedStart)
  const formattedStartTime = formatTime12hFromISO(requestedStart)
  const formattedEndTime = requestedEnd ? formatTime12hFromISO(requestedEnd) : null

  function handleAccept() {
    setError(null)
    setActionType('accept')
    startTransition(async () => {
      try {
        await customerAcceptProposedCheckoutTime(bookingId)
        setShowAcceptConfirm(false)
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
        setShowDeclineModal(false)
        setDeclineReason('')
        router.refresh()
        onSuccess?.()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Failed to decline time.')
        setActionType(null)
      }
    })
  }

  if (variant === 'chat') {
    return (
      <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50/90 p-2.5 sm:p-3 text-[#152d5a] shadow-xs w-full max-w-sm">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="material-symbols-outlined text-amber-600 text-sm">event_upcoming</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Proposed Flight Time
          </span>
        </div>

        <div className="bg-white/90 rounded-lg p-2 sm:p-2.5 border border-amber-200/80 mb-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#152d5a]">
            <span className="material-symbols-outlined text-[14px] text-[#1a4fd6]">calendar_today</span>
            <span>{formattedDate}</span>
          </div>
          <div className="flex items-start gap-1.5 text-xs text-[#334155]">
            <span className="material-symbols-outlined text-[14px] text-[#1a4fd6] mt-0.5 flex-shrink-0">schedule</span>
            <div className="min-w-0">
              <p className="font-semibold text-xs sm:text-[13px] text-[#152d5a] leading-tight">
                {formattedStartTime} {formattedEndTime ? `– ${formattedEndTime}` : ''}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">(Sydney time / 2 hrs)</p>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-[11px] text-red-600 mb-2 font-medium">{error}</p>
        )}

        <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-1.5 sm:gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setShowAcceptConfirm(true)}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs disabled:opacity-50 text-center whitespace-nowrap"
          >
            {isPending && actionType === 'accept' ? (
              <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-[14px]">check</span>
            )}
            <span>Accept Time</span>
          </button>
          <button
            type="button"
            onClick={() => setShowDeclineModal(true)}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 text-xs font-semibold transition-colors disabled:opacity-50 text-center whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
            <span>Decline</span>
          </button>
        </div>

        {/* Accept Confirmation Modal */}
        {showAcceptConfirm && (
          <ModalPortal>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4 border border-gray-100">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-2xl">event_available</span>
                </div>
                <div className="text-center space-y-1">
                  <h3 className="text-base font-bold text-[#152d5a]">Accept Proposed Checkout Time?</h3>
                  <p className="text-xs text-gray-500">
                    Your checkout booking will be scheduled for:
                  </p>
                  <p className="text-sm font-bold text-[#1a4fd6] pt-1">
                    {formattedDate} · {formattedStartTime} {formattedEndTime ? `– ${formattedEndTime}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAcceptConfirm(false)}
                    disabled={isPending}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={isPending}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    {isPending ? 'Confirming…' : 'Confirm & Schedule'}
                  </button>
                </div>
              </div>
            </div>
          </ModalPortal>
        )}

        {/* Decline Modal */}
        {showDeclineModal && (
          <ModalPortal>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4 border border-gray-100">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-2xl">event_busy</span>
                </div>
                <div className="text-center space-y-1">
                  <h3 className="text-base font-bold text-[#152d5a]">Decline Proposed Time</h3>
                  <p className="text-xs text-gray-500">
                    Your original requested time will remain active and the operations team will be notified.
                  </p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">
                    Optional reason or preferred availability:
                  </label>
                  <textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="e.g., Unable to fly at this time, prefer afternoons…"
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 p-3 text-xs text-[#152d5a] focus:outline-none focus:border-[#1a4fd6] resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeclineModal(false)}
                    disabled={isPending}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleDecline}
                    disabled={isPending}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    {isPending ? 'Declining…' : 'Decline Proposed Time'}
                  </button>
                </div>
              </div>
            </div>
          </ModalPortal>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50/95 via-amber-50/70 to-orange-50/50 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-lg">schedule_send</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-[#152d5a]">New Time Proposed by Operations</h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-amber-200/80 text-amber-900 border border-amber-300">
                Action Required
              </span>
            </div>
            <p className="text-xs text-[#4b6390] mt-0.5">
              The team proposed an alternative slot for your checkout flight.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowAcceptConfirm(true)}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all hover:shadow-md disabled:opacity-50"
          >
            {isPending && actionType === 'accept' ? (
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-sm">check_circle</span>
            )}
            Accept Time
          </button>
          <button
            type="button"
            onClick={() => setShowDeclineModal(true)}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 text-xs font-bold transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">cancel</span>
            Decline
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#152d5a]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-amber-700">calendar_month</span>
          <span>Proposed Date: <strong className="font-bold text-[#152d5a]">{formattedDate}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-amber-700">schedule</span>
          <span>Proposed Window: <strong className="font-bold text-[#152d5a]">{formattedStartTime} {formattedEndTime ? `– ${formattedEndTime}` : ''}</strong> <span className="text-gray-500">(Sydney time)</span></span>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 font-medium">
          {error}
        </div>
      )}

      {/* Accept Confirmation Modal */}
      {showAcceptConfirm && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4 border border-gray-100">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-2xl">event_available</span>
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-[#152d5a]">Accept Proposed Checkout Time?</h3>
                <p className="text-xs text-gray-500">
                  Your checkout booking will be updated to:
                </p>
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 mt-2">
                  <p className="text-sm font-bold text-emerald-900">
                    {formattedDate}
                  </p>
                  <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                    {formattedStartTime} {formattedEndTime ? `– ${formattedEndTime}` : ''} (Sydney time)
                  </p>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAcceptConfirm(false)}
                  disabled={isPending}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={isPending}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  {isPending ? 'Confirming…' : 'Accept & Schedule'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Decline Modal */}
      {showDeclineModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4 border border-gray-100">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-2xl">event_busy</span>
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-[#152d5a]">Decline Proposed Time</h3>
                <p className="text-xs text-gray-500">
                  Your original requested time will remain active and the operations team will be notified.
                </p>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 block mb-1">
                  Optional note for the team:
                </label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="e.g., Unable to fly at this time, prefer afternoons…"
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 p-3 text-xs text-[#152d5a] focus:outline-none focus:border-[#1a4fd6] resize-none"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeclineModal(false)}
                  disabled={isPending}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={isPending}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  {isPending ? 'Declining…' : 'Decline Proposed Time'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
