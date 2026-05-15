'use client'

import { useState, useTransition } from 'react'
import { cancelBookingNow, requestLateCancellation, markFlightReturned } from '@/app/actions/booking'

type Props = {
  bookingId:              string
  showCancelButton:       boolean
  showFlightRecordButton: boolean
  isWithin24Hours:        boolean
  departureSydney:        string
  heroLayout?:            boolean
  yellowPrimary?:         boolean
}

// Three possible modal states — null means no modal is open.
type ActiveModal = 'cancel_immediate' | 'cancel_late' | 'flight_record' | null

export default function CustomerBookingActions({
  bookingId,
  showCancelButton,
  showFlightRecordButton,
  isWithin24Hours,
  departureSydney,
  heroLayout = false,
  yellowPrimary = false,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  const [reason, setReason]           = useState('')
  const [error, setError]             = useState<string | null>(null)

  if (!showCancelButton && !showFlightRecordButton) return null

  function openModal(modal: ActiveModal) {
    setError(null)
    setReason('')
    setActiveModal(modal)
  }

  function closeModal() {
    if (isPending) return
    setActiveModal(null)
    setError(null)
  }

  // ── Case A: immediate cancel (>24 h) ──────────────────────────────────────
  function handleConfirmImmediateCancel() {
    startTransition(async () => {
      try {
        await cancelBookingNow(bookingId)
        setActiveModal(null)
      } catch (err) {
        setError(err instanceof Error ? err.message.replace('VALIDATION: ', '') : 'Failed to cancel booking.')
      }
    })
  }

  // ── Case B: late cancel request (≤24 h) ───────────────────────────────────
  function handleConfirmLateCancel() {
    startTransition(async () => {
      try {
        await requestLateCancellation(bookingId, reason.trim() || null)
        setActiveModal(null)
        setReason('')
      } catch (err) {
        setError(err instanceof Error ? err.message.replace('VALIDATION: ', '') : 'Failed to submit cancellation request.')
      }
    })
  }

  // ── Submit flight record ──────────────────────────────────────────────────
  function handleConfirmFlightRecord() {
    startTransition(async () => {
      try {
        await markFlightReturned(bookingId)
        setActiveModal(null)
      } catch (err) {
        setError(err instanceof Error ? err.message.replace('VALIDATION: ', '') : 'Failed to advance booking.')
      }
    })
  }

  return (
    <>
      {/* ── Trigger buttons ─────────────────────────────────────────────── */}
      <div className={heroLayout ? 'flex flex-col gap-3 w-full max-w-[400px]' : 'flex flex-wrap gap-2 mt-3'}>

        {showFlightRecordButton && (
          <button
            onClick={() => openModal('flight_record')}
            disabled={isPending}
            className={heroLayout
              ? (yellowPrimary
                  ? 'inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#f4b928] hover:bg-[#f9cb50] disabled:opacity-50 disabled:cursor-not-allowed text-[#0a1628] rounded-lg text-[11px] font-bold uppercase tracking-[0.14em] transition-colors w-full'
                  : 'inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-[11px] font-bold uppercase tracking-[0.14em] transition-colors w-full')
              : 'inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-colors'
            }
          >
            <span className="material-symbols-outlined text-sm">assignment</span>
            Submit Post Flight Records
            {heroLayout && <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>}
          </button>
        )}

        {showCancelButton && (
          <button
            onClick={() => openModal(isWithin24Hours ? 'cancel_late' : 'cancel_immediate')}
            disabled={isPending}
            className={heroLayout
              ? 'inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-transparent hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed border border-red-500/50 hover:border-red-500/70 text-red-400 hover:text-red-300 rounded-lg text-[11px] font-bold uppercase tracking-[0.14em] transition-colors w-full'
              : 'inline-flex items-center gap-1.5 px-4 py-2 bg-transparent hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed border border-red-500/40 hover:border-red-500/60 text-red-400 hover:text-red-300 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-colors'
            }
          >
            <span className="material-symbols-outlined text-sm">cancel</span>
            Cancel Booking
          </button>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {activeModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">

          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* ── Case A: Immediate cancel (>24 h) ──────────────────────── */}
          {activeModal === 'cancel_immediate' && (
            <div className="relative z-10 w-full max-w-md bg-[#0c1525] border border-white/10 rounded-2xl p-7 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-red-400 text-xl">cancel</span>
                <h2 className="text-sm font-bold uppercase tracking-widest text-red-300">
                  Cancel booking?
                </h2>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mb-6">
                Your booking will be cancelled and you will not be charged because it is more than 24 hours before your scheduled departure time.
              </p>
              {error && <ErrorLine message={error} />}
              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  disabled={isPending}
                  className="flex-1 py-2.5 border border-white/15 hover:border-white/25 text-slate-400 hover:text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-colors disabled:opacity-50"
                >
                  Keep booking
                </button>
                <button
                  onClick={handleConfirmImmediateCancel}
                  disabled={isPending}
                  className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-colors"
                >
                  {isPending ? 'Cancelling…' : 'Cancel booking'}
                </button>
              </div>
            </div>
          )}

          {/* ── Case B: Late cancel request (≤24 h) ───────────────────── */}
          {activeModal === 'cancel_late' && (
            <div className="relative z-10 w-full max-w-md bg-[#0c1525] border border-white/10 rounded-2xl p-7 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-amber-400 text-xl">warning</span>
                <h2 className="text-sm font-bold uppercase tracking-widest text-amber-300">
                  Request cancellation?
                </h2>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mb-5">
                This booking starts at{' '}
                <span className="text-white font-medium">{departureSydney}</span>, which is less than 24 hours away. As per the cancellation terms, you may still be charged for the booked time. If you would like the operations team to consider waiving the cancellation charge, please provide a reason below.
              </p>
              <div className="mb-5">
                <label className="block text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Reason for cancellation
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  disabled={isPending}
                  placeholder="Add a short note for the operations team..."
                  className="w-full px-4 py-3 bg-[#05080f] border border-white/[0.07] focus:border-amber-500/40 focus:outline-none rounded-xl text-white text-sm placeholder:text-slate-700 transition-colors resize-none leading-relaxed"
                />
              </div>
              {error && <ErrorLine message={error} />}
              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  disabled={isPending}
                  className="flex-1 py-2.5 border border-white/15 hover:border-white/25 text-slate-400 hover:text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-colors disabled:opacity-50"
                >
                  Keep booking
                </button>
                <button
                  onClick={handleConfirmLateCancel}
                  disabled={isPending}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-colors"
                >
                  {isPending ? 'Submitting…' : 'Submit cancellation request'}
                </button>
              </div>
            </div>
          )}

          {/* ── Submit Post Flight Records confirmation ────────────────── */}
          {activeModal === 'flight_record' && (
            <div className="relative z-10 w-full max-w-md bg-[#0c1525] border border-white/10 rounded-2xl p-7 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-blue-400 text-xl">assignment</span>
                <h2 className="text-sm font-bold uppercase tracking-widest text-blue-300">
                  Submit Post Flight Records?
                </h2>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mb-6">
                You are about to start the post flight records submission process for this booking. Please continue only if the aircraft has returned and you are ready to enter the required post-flight readings.
              </p>
              {error && <ErrorLine message={error} />}
              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  disabled={isPending}
                  className="flex-1 py-2.5 border border-white/15 hover:border-white/25 text-slate-400 hover:text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmFlightRecord}
                  disabled={isPending}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-colors"
                >
                  {isPending ? 'Proceeding…' : 'Proceed to flight record'}
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </>
  )
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p className="mb-4 text-[11px] text-red-400 flex items-center gap-1">
      <span className="material-symbols-outlined text-sm">error</span>
      {message}
    </p>
  )
}
