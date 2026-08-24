'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ModalPortal from '@/components/ModalPortal'
import { cancelBookingByAdmin } from './actions'

type Props = {
  bookingId: string
  customerName: string
  customerEmail?: string | null
  aircraftLabel: string
  scheduleRangeLabel: string
  timeRangeLabel: string
  durationLabel?: string | null
  isMultiDay?: boolean
}

export default function AdminCancelBookingButton({
  bookingId,
  customerName,
  customerEmail,
  aircraftLabel,
  scheduleRangeLabel,
  timeRangeLabel,
  durationLabel,
  isMultiDay,
}: Props) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleOpen = () => {
    setError(null)
    setReason('')
    setIsOpen(true)
  }

  const handleClose = () => {
    if (isPending) return
    setIsOpen(false)
    setError(null)
  }

  const handleConfirmCancel = () => {
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('Please provide a reason for cancellation.')
      return
    }

    startTransition(async () => {
      try {
        await cancelBookingByAdmin(bookingId, trimmed)
        setIsOpen(false)
        router.refresh()
      } catch (err: any) {
        setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Failed to cancel booking.')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white hover:bg-rose-50 border border-rose-300 text-rose-600 hover:text-rose-700 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs"
      >
        <span className="material-symbols-outlined text-[16px]">cancel</span>
        Cancel Flight
      </button>

      {isOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-6 py-4 border-b border-[#152d5a]/10 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[20px]">cancel</span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#152d5a]">Cancel Flight Booking</h3>
                    <p className="text-xs text-[#4b6390]">Admin cancellation & customer notification</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748b] hover:text-[#152d5a] hover:bg-[#f0f6ff] transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                {/* Flight details summary card */}
                <div className="bg-[#f8fbff] border border-[#152d5a]/15 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#152d5a]">{aircraftLabel}</span>
                        {isMultiDay && (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Multi-Day
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-[#152d5a] mt-1">
                        {scheduleRangeLabel} · <span className="text-[#4b6390]">{timeRangeLabel}</span>
                      </p>
                      <p className="text-xs text-[#64748b] mt-0.5">
                        Customer: <span className="font-semibold text-[#152d5a]">{customerName}</span>
                        {customerEmail ? ` (${customerEmail})` : ''}
                      </p>
                    </div>
                    {durationLabel && (
                      <span className="flex-shrink-0 text-xs font-bold text-[#152d5a] bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                        {durationLabel}
                      </span>
                    )}
                  </div>
                </div>

                {/* Reason Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#152d5a]">
                      Reason for cancellation <span className="text-rose-600">*</span>
                    </label>
                    <span className="text-[10px] text-[#64748b]">Sent to chat & email</span>
                  </div>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value)
                      if (error) setError(null)
                    }}
                    disabled={isPending}
                    placeholder="e.g. Unscheduled aircraft maintenance required / adverse weather forecast..."
                    className="w-full px-4 py-3 bg-white border border-[#152d5a]/20 focus:border-[#1a4fd6] focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/20 rounded-xl text-[#152d5a] text-sm placeholder:text-[#94a3b8] transition-colors resize-none leading-relaxed"
                  />
                  <p className="text-[11px] text-[#64748b] mt-1">
                    This message will be sent to the customer&apos;s chat and email, and logged in the booking status history.
                  </p>
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-rose-600 flex-shrink-0">error</span>
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-[#152d5a]/10 flex items-center justify-end gap-3 bg-white">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-semibold text-[#4b6390] hover:text-[#152d5a] border border-[#152d5a]/20 hover:border-[#152d5a]/40 rounded-xl transition-colors disabled:opacity-50"
                >
                  Keep flight
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={isPending || !reason.trim()}
                  className="px-5 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs flex items-center gap-2"
                >
                  {isPending && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
                  {isPending ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
