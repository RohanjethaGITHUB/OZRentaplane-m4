'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ModalPortal from '@/components/ModalPortal'
import { permanentlyCloseBookingByAdmin } from './actions'

type Props = {
  bookingId: string
  bookingReference: string
  isCheckout: boolean
  currentStatusLabel: string
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  aircraftLabel: string
  scheduleRangeLabel: string
  timeRangeLabel: string
  durationLabel?: string | null
  isMultiDay?: boolean
  className?: string
}

export default function AdminCloseBookingButton({
  bookingId,
  bookingReference,
  isCheckout,
  currentStatusLabel,
  customerName,
  customerEmail,
  customerPhone,
  aircraftLabel,
  scheduleRangeLabel,
  timeRangeLabel,
  durationLabel,
  isMultiDay,
  className,
}: Props) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const itemTypeLabel = isCheckout ? 'Checkout' : 'Flight'

  const handleOpen = () => {
    setError(null)
    setReason('')
    setIsConfirmed(false)
    setIsOpen(true)
  }

  const handleClose = () => {
    if (isPending) return
    setIsOpen(false)
    setError(null)
  }

  const handleProceed = () => {
    if (!isConfirmed) return

    startTransition(async () => {
      try {
        await permanentlyCloseBookingByAdmin({
          bookingId,
          reason: reason.trim() || undefined,
        })
        setIsOpen(false)
        router.refresh()
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message.replace(/^VALIDATION: /, '')
            : `Failed to close ${itemTypeLabel.toLowerCase()}.`,
        )
      }
    })
  }

  return (
    <>
      <div className="relative inline-flex items-center group">
        <button
          type="button"
          onClick={handleOpen}
          className={
            className ||
            'inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-rose-700 hover:text-rose-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30'
          }
        >
          <span className="material-symbols-outlined text-[16px]">cancel</span>
          <span>Close {itemTypeLabel}</span>
        </button>

        {/* Custom Premium Floating Tooltip */}
        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-30 transition-all animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-slate-900/95 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg shadow-xl whitespace-nowrap backdrop-blur-xs border border-white/10 flex items-center gap-1.5 tracking-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
            <span>Permanently close this {itemTypeLabel.toLowerCase()}</span>
          </div>
          <div className="w-2 h-2 bg-slate-900/95 rotate-45 -mt-1 border-r border-b border-white/10" />
        </div>
      </div>

      {isOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
            <div className="w-full max-w-lg max-h-[92vh] flex flex-col bg-white border border-[#152d5a]/15 rounded-2xl shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-5 sm:px-6 py-4 border-b border-[#152d5a]/10 flex items-center justify-between bg-white flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[22px]">event_busy</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-[#152d5a] truncate">
                      Permanently Close {itemTypeLabel}
                    </h3>
                    <p className="text-xs text-[#64748b] truncate">
                      Admin closure for test, abandoned, or uncompleted bookings
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  aria-label="Close dialog"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748b] hover:text-[#152d5a] hover:bg-slate-100 transition-colors cursor-pointer flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="px-5 sm:px-6 py-4 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                {/* Details Summary Card */}
                <div className="bg-[#f8fbff] border border-[#152d5a]/12 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-[#152d5a]">{aircraftLabel}</span>
                        <span className="text-[10px] font-bold text-[#1a4fd6] bg-[#eff4ff] border border-[#dbeafe] px-2 py-0.5 rounded-full uppercase tracking-wider">
                          {isCheckout ? 'Checkout Flight' : isMultiDay ? 'Multi-Day Rental' : 'Standard Rental'}
                        </span>
                      </div>
                      <p className="text-xs text-[#4b6390] flex items-center gap-1.5 flex-wrap">
                        <span>Ref:</span>
                        <span className="font-mono font-semibold text-[#152d5a] bg-white px-2 py-0.5 rounded border border-[#152d5a]/15 text-[11px]">
                          {bookingReference}
                        </span>
                      </p>
                      <p className="text-xs font-semibold text-[#152d5a]">
                        {scheduleRangeLabel} · <span className="text-[#4b6390] font-normal">{timeRangeLabel}</span>
                      </p>
                      <p className="text-xs text-[#64748b] break-words">
                        Customer: <span className="font-semibold text-[#152d5a]">{customerName}</span>
                        {customerEmail ? (
                          <span className="text-[#4b6390]"> ({customerEmail})</span>
                        ) : null}
                        {customerPhone ? (
                          <span className="text-[#64748b]"> · {customerPhone}</span>
                        ) : null}
                      </p>
                    </div>
                    {durationLabel && (
                      <span className="flex-shrink-0 text-xs font-bold text-[#152d5a] bg-white border border-[#152d5a]/15 px-2.5 py-1 rounded-lg shadow-2xs">
                        {durationLabel}
                      </span>
                    )}
                  </div>

                  <div className="pt-2.5 border-t border-[#152d5a]/10 flex items-center justify-between text-xs gap-2">
                    <span className="text-[#4b6390] font-medium">Current Status:</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200/90 truncate">
                      {currentStatusLabel}
                    </span>
                  </div>
                </div>

                {/* Explanation Banner */}
                <div className="rounded-xl border border-amber-200/90 bg-amber-50/70 p-3.5 flex items-start gap-2.5 text-xs text-[#334155] leading-relaxed">
                  <span className="material-symbols-outlined text-amber-600 text-[20px] flex-shrink-0 mt-0.5">info</span>
                  <span>
                    Closing this {itemTypeLabel.toLowerCase()} will cancel the booking, release any held aircraft schedule blocks back to the fleet, and remove it from active operational and action queues.
                  </span>
                </div>

                {/* Reason Note (Optional) */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#152d5a] mb-1.5">
                    Reason or Admin Note <span className="text-[#64748b] font-normal lowercase">(optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value)
                      if (error) setError(null)
                    }}
                    disabled={isPending}
                    placeholder="e.g. Test booking / flight did not take place / customer no-show"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#152d5a]/20 focus:border-[#1a4fd6] focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/20 rounded-xl text-[#152d5a] text-sm placeholder:text-[#94a3b8] transition-colors resize-none leading-relaxed"
                  />
                </div>

                {/* Confirmation Checkbox Card */}
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 hover:bg-rose-50/70 cursor-pointer transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={(e) => {
                      setIsConfirmed(e.target.checked)
                      if (error) setError(null)
                    }}
                    disabled={isPending}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer flex-shrink-0 accent-rose-600"
                  />
                  <div className="text-xs min-w-0">
                    <span className="font-semibold text-sm text-[#152d5a] block tracking-tight">
                      I want to permanently close this {itemTypeLabel.toLowerCase()}
                    </span>
                    <span className="text-[#64748b] mt-0.5 block leading-relaxed">
                      I confirm that this {itemTypeLabel.toLowerCase()} did not take place or should be permanently closed and removed from active queues.
                    </span>
                  </div>
                </label>

                {error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs text-rose-800 font-semibold flex items-center gap-2 animate-in fade-in">
                    <span className="material-symbols-outlined text-[18px] text-rose-600 flex-shrink-0">error</span>
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 sm:px-6 py-4 border-t border-[#152d5a]/10 flex items-center justify-end gap-2.5 sm:gap-3 bg-white flex-shrink-0">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-semibold text-[#4b6390] hover:text-[#152d5a] border border-[#152d5a]/20 hover:border-[#152d5a]/40 rounded-xl transition-colors disabled:opacity-50 cursor-pointer bg-white"
                >
                  Keep {itemTypeLabel}
                </button>
                <button
                  type="button"
                  onClick={handleProceed}
                  disabled={isPending || !isConfirmed}
                  className="px-5 py-2 text-sm font-bold rounded-xl transition-all shadow-xs flex items-center gap-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isPending && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
                  {isPending ? 'Closing...' : `Proceed & Close ${itemTypeLabel}`}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
