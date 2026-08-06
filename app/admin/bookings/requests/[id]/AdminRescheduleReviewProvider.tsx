'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import ModalPortal from '@/components/ModalPortal'
import AdminRescheduleReviewCard from './AdminRescheduleReviewCard'

type RescheduleReviewContextValue = {
  openReview: () => void
  closeReview: () => void
  isOpen: boolean
}

const RescheduleReviewContext = createContext<RescheduleReviewContextValue | null>(null)

export function useRescheduleReview() {
  const ctx = useContext(RescheduleReviewContext)
  if (!ctx) {
    throw new Error('useRescheduleReview must be used within AdminRescheduleReviewProvider')
  }
  return ctx
}

export function useRescheduleReviewOptional() {
  return useContext(RescheduleReviewContext)
}

type ProviderProps = {
  changeRequestId: string
  currentStart: string
  currentEnd: string
  requestedStart: string
  requestedEnd: string
  customerNote?: string | null
  customerName?: string | null
  children: ReactNode
}

export default function AdminRescheduleReviewProvider({
  changeRequestId,
  currentStart,
  currentEnd,
  requestedStart,
  requestedEnd,
  customerNote,
  customerName,
  children,
}: ProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const openReview = useCallback(() => setIsOpen(true), [])
  const closeReview = useCallback(() => setIsOpen(false), [])

  const value = useMemo(
    () => ({ openReview, closeReview, isOpen }),
    [openReview, closeReview, isOpen],
  )

  return (
    <RescheduleReviewContext.Provider value={value}>
      {children}
      {isOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1100] flex items-start justify-center overflow-y-auto p-4 pt-16 md:pt-20 bg-black/40 backdrop-blur-sm">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close dialog"
              onClick={closeReview}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reschedule-review-modal-title"
              className="relative w-full max-w-2xl mb-10"
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={closeReview}
                  className="absolute -top-2 -right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[#152d5a]/10 bg-white text-[#4b6390] shadow-md hover:text-[#152d5a] transition-colors"
                  aria-label="Close reschedule review"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
                <div id="reschedule-review-modal-title">
                  <AdminRescheduleReviewCard
                    changeRequestId={changeRequestId}
                    currentStart={currentStart}
                    currentEnd={currentEnd}
                    requestedStart={requestedStart}
                    requestedEnd={requestedEnd}
                    customerNote={customerNote}
                    customerName={customerName}
                  />
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </RescheduleReviewContext.Provider>
  )
}

export function RescheduleReviewButton({
  className,
  label = 'Review',
}: {
  className?: string
  label?: string
}) {
  const { openReview } = useRescheduleReview()
  return (
    <button
      type="button"
      onClick={openReview}
      className={
        className ??
        'inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 shadow-sm transition-colors hover:bg-amber-50'
      }
    >
      {label}
      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
    </button>
  )
}

export function RescheduleReviewFooterWarning() {
  const { openReview } = useRescheduleReview()
  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="material-symbols-outlined flex-shrink-0 text-amber-600 text-[18px] leading-none">
          warning
        </span>
        <span className="leading-snug">
          A new checkout time is waiting for your decision. Review the requested timings before confirming this checkout.
        </span>
      </div>
      <button
        type="button"
        onClick={openReview}
        className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 self-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 sm:self-auto"
      >
        Review new time
        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
      </button>
    </div>
  )
}

/** Sticky bar for confirmed checkouts that still need a reschedule decision (no Confirm Checkout footer). */
export function AdminRescheduleStickyBar() {
  const { openReview } = useRescheduleReview()
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] md:px-6 md:py-4 lg:left-72">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 min-w-0 text-sm text-amber-900">
          <span className="material-symbols-outlined flex-shrink-0 text-amber-600 text-[18px] leading-none">warning</span>
          <span className="leading-snug">
            Please review the requested new timings first. Approve or reject before continuing with this checkout.
          </span>
        </div>
        <button
          type="button"
          onClick={openReview}
          className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 self-end rounded-xl bg-[#152d5a] px-4 py-2.5 text-xs font-semibold text-white shadow-md transition-colors hover:bg-[#1a4fd6] sm:self-auto"
        >
          Review reschedule
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </button>
      </div>
    </div>
  )
}
