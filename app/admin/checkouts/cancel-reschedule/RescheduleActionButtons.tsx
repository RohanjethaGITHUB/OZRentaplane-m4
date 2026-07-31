'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveCheckoutReschedule, rejectCheckoutReschedule } from '@/app/actions/checkout'
import { LoadingButtonContent } from '@/components/ui/Spinner'

export default function RescheduleActionButtons({
  changeRequestId,
}: {
  changeRequestId: string
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
      }
    })
  }

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
            <div className="px-5 py-5">
              <p className="text-sm text-slate-300">
                {confirmApprove
                  ? 'This will move the checkout booking to the requested slot if it is still available.'
                  : 'This will keep the current checkout time unchanged and mark this request as rejected.'}
              </p>
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
          className="inline-flex items-center rounded-lg border border-[rgba(96,165,250,0.24)] bg-[rgba(37,99,235,0.14)] px-3 py-1.5 text-sm font-medium text-[#bfdbfe] hover:bg-[rgba(37,99,235,0.24)] disabled:opacity-40"
        >
          Approve
        </button>
        <button
          onClick={() => setConfirmReject(true)}
          disabled={isPending}
          className="inline-flex items-center rounded-lg border border-[rgba(251,191,36,0.24)] bg-[rgba(180,120,30,0.13)] px-3 py-1.5 text-sm font-medium text-amber-200 hover:bg-[rgba(194,65,12,0.2)] disabled:opacity-40"
        >
          Reject
        </button>
      </div>
      {error && <p className="text-xs text-red-300 text-right max-w-[260px]">{error}</p>}
      {success && <p className="text-xs text-emerald-300 text-right max-w-[260px]">{success}</p>}
    </div>
  )
}

