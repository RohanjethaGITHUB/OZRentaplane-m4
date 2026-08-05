'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveCheckoutReschedule, rejectCheckoutReschedule } from '@/app/actions/checkout'
import { LoadingButtonContent } from '@/components/ui/Spinner'

function formatSydney(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function RescheduleActionButtons({
  changeRequestId,
  tone = 'dark',
  currentStart,
  currentEnd,
  requestedStart,
  requestedEnd,
}: {
  changeRequestId: string
  tone?: 'dark' | 'light'
  currentStart?: string | null
  currentEnd?: string | null
  requestedStart?: string | null
  requestedEnd?: string | null
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onApprove() {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        await approveCheckoutReschedule(changeRequestId)
        setSuccess('Reschedule request approved.')
        setConfirmApprove(false)
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to approve reschedule request.'
        setError(msg)
        setConfirmApprove(false)
      }
    })
  }

  function onReject() {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        await rejectCheckoutReschedule(changeRequestId)
        setSuccess('Reschedule request rejected.')
        setConfirmReject(false)
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to reject reschedule request.'
        setError(msg)
        setConfirmReject(false)
      }
    })
  }

  const approveClass =
    tone === 'light'
      ? 'inline-flex items-center rounded-lg border border-blue-200 bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40'
      : 'inline-flex items-center rounded-lg border border-[rgba(96,165,250,0.24)] bg-[rgba(37,99,235,0.14)] px-3 py-1.5 text-sm font-medium text-[#bfdbfe] hover:bg-[rgba(37,99,235,0.24)] disabled:opacity-40'
  const rejectClass =
    tone === 'light'
      ? 'inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40'
      : 'inline-flex items-center rounded-lg border border-[rgba(251,191,36,0.24)] bg-[rgba(180,120,30,0.13)] px-3 py-1.5 text-sm font-medium text-amber-200 hover:bg-[rgba(194,65,12,0.2)] disabled:opacity-40'
  const errorClass = tone === 'light' ? 'text-xs text-red-600 text-right max-w-[320px]' : 'text-xs text-red-300 text-right max-w-[320px]'
  const successClass = tone === 'light' ? 'text-xs text-emerald-700 text-right max-w-[260px]' : 'text-xs text-emerald-300 text-right max-w-[260px]'

  const hasTimes = !!(currentStart && requestedStart)

  return (
    <div className="flex flex-col items-end gap-2">
      {(confirmApprove || confirmReject) && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-24 md:pt-28 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#13243a] border border-[#4c6b8f] rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-lg font-semibold text-white">
                {confirmApprove ? 'Approve reschedule request?' : 'Reject reschedule request?'}
              </h3>
            </div>
            <div className="px-5 py-5 space-y-4">
              <p className="text-sm text-slate-300">
                {confirmApprove
                  ? 'This will move the checkout booking to the requested slot if it is still available.'
                  : 'This will keep the current checkout time unchanged and mark this request as rejected.'}
              </p>
              {hasTimes && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                    <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1.5">Current (held)</p>
                    <p className="text-sm font-semibold text-white leading-snug">{formatSydney(currentStart!)}</p>
                    {currentEnd && (
                      <p className="text-xs text-slate-400 mt-1">to {formatSydney(currentEnd)}</p>
                    )}
                  </div>
                  <div className={`rounded-xl border p-3 ${
                    confirmApprove
                      ? 'border-blue-400/30 bg-blue-500/10'
                      : 'border-amber-400/30 bg-amber-500/10'
                  }`}>
                    <p className={`text-[9px] uppercase tracking-widest mb-1.5 ${
                      confirmApprove ? 'text-blue-300/80' : 'text-amber-300/80'
                    }`}>
                      {confirmApprove ? 'Approve to' : 'Rejecting'}
                    </p>
                    <p className={`text-sm font-semibold leading-snug ${
                      confirmApprove ? 'text-blue-100' : 'text-amber-100'
                    }`}>
                      {formatSydney(requestedStart!)}
                    </p>
                    {requestedEnd && (
                      <p className={`text-xs mt-1 ${confirmApprove ? 'text-blue-200/70' : 'text-amber-200/70'}`}>
                        to {formatSydney(requestedEnd)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-white/[0.06] flex justify-end gap-3">
              <button
                onClick={() => { setConfirmApprove(false); setConfirmReject(false) }}
                className="px-4 py-2 text-sm text-slate-300 border border-white/15 rounded-lg"
                disabled={isPending}
              >
                Back
              </button>
              <button
                onClick={confirmApprove ? onApprove : onReject}
                disabled={isPending}
                aria-busy={isPending || undefined}
                className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-40 flex items-center justify-center gap-2 ${
                  confirmApprove ? 'bg-blue-600 hover:bg-blue-500' : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                <LoadingButtonContent loading={isPending} loadingLabel="Saving…">
                  {confirmApprove ? 'Approve' : 'Reject'}
                </LoadingButtonContent>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setConfirmApprove(true)}
          disabled={isPending}
          className={approveClass}
        >
          Approve
        </button>
        <button
          onClick={() => setConfirmReject(true)}
          disabled={isPending}
          className={rejectClass}
        >
          Reject
        </button>
      </div>
      {error && <p className={errorClass}>{error}</p>}
      {success && <p className={successClass}>{success}</p>}
    </div>
  )
}
