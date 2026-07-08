'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock3, X } from 'lucide-react'
import ModalPortal from '@/components/ModalPortal'
import { formatDateTime } from '@/lib/formatDateTime'
import { sydneyInputToUTC } from '@/lib/utils/sydney-time'

type BookingConfirmationModalProps = {
  open: boolean
  bookingId: string
  bookingReference: string
  bookingStatus: string
  bookingMode: 'single' | 'multi'
  startDT: string
  endDT: string
  estimatedHours: number | null
  onClose: () => void
}

function formatInputAsAU(dtLocal: string): string {
  const utc = sydneyInputToUTC(dtLocal)
  if (!utc) return '—'
  return formatDateTime(utc)
}

function formatDuration(hours: number): string {
  const wholeHours = Math.floor(hours)
  const minutes = Math.round((hours - wholeHours) * 60)
  if (minutes === 0) return `${wholeHours}h`
  if (wholeHours === 0) return `${minutes}m`
  return `${wholeHours}h ${minutes}m`
}

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function BookingConfirmationModal({
  open,
  bookingId,
  bookingReference,
  bookingStatus,
  bookingMode,
  startDT,
  endDT,
  estimatedHours,
  onClose,
}: BookingConfirmationModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const isConfirmed = bookingStatus === 'confirmed'

  useEffect(() => {
    if (!open) return

    closeButtonRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        <button
          type="button"
          aria-label="Close booking confirmation dialog"
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-confirmation-title"
          className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl border border-[#dbe3ef] bg-white text-[#152d5a] shadow-[0_24px_80px_rgba(21,45,90,0.18)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="absolute inset-x-0 top-0 h-1.5 bg-[#1a4fd6]" />

          <div className="flex items-start gap-4 px-6 pb-5 pt-6 sm:px-8 sm:pb-6">
            <div
              className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                isConfirmed ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-[#f0f6ff] text-[#1a4fd6] border border-[#dbe7f4]'
              }`}
            >
              <CheckCircle2 className="h-6 w-6" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
                {isConfirmed ? 'Booking confirmed' : 'Request received'}
              </p>
              <h3
                id="booking-confirmation-title"
                className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl"
              >
                {isConfirmed ? 'Your booking is confirmed' : 'Your booking request is submitted'}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#4b6390]">
                {isConfirmed
                  ? 'Review the booking details below, then open the booking directly or head back to your booking list.'
                  : 'Our operations team will review the request shortly. Review the details below, then open the booking directly or head back to your booking list.'}
              </p>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f1f5f9] hover:text-[#152d5a]"
              aria-label="Close booking confirmation dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-6 pb-6 sm:px-8">
            <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_0_rgba(21,45,90,0.02)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#1a4fd6]/80">
                  Booking reference
                </p>
                <p className="mt-2 font-mono text-3xl font-bold tracking-[0.18em] text-[#152d5a]">
                  {bookingReference}
                </p>
                <p className="mt-2 text-xs text-[#6b7280]">
                  Save this reference for your records.
                </p>
              </div>

              <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_0_rgba(21,45,90,0.02)]">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#64748b]">
                  <Clock3 className="h-4 w-4" />
                  Status
                </div>
                <p className="mt-2 text-lg font-semibold text-[#152d5a]">
                  {formatStatusLabel(bookingStatus)}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#4b6390]">
                  {isConfirmed
                    ? 'This booking is ready and visible in your bookings list.'
                    : 'This booking is waiting on operations review before final confirmation.'}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_0_rgba(21,45,90,0.02)] sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#94a3b8]">
                  Departure
                </p>
                <p className="mt-2 text-sm font-medium text-[#152d5a]">
                  {formatInputAsAU(startDT)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#94a3b8]">
                  Estimated return
                </p>
                <p className="mt-2 text-sm font-medium text-[#152d5a]">
                  {formatInputAsAU(endDT)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#94a3b8]">
                  {bookingMode === 'multi' ? 'Booking window' : 'Estimated duration'}
                </p>
                <p className="mt-2 text-sm font-semibold text-[#1a4fd6]">
                  {estimatedHours != null ? formatDuration(estimatedHours) : '—'}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/dashboard/bookings/${bookingId}`}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1a4fd6] px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#1847bf]"
              >
                View Booking
              </Link>
              <Link
                href="/dashboard/bookings"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#dbe3ef] bg-white px-5 py-3.5 text-sm font-semibold text-[#152d5a] transition-colors hover:bg-[#f8fafc]"
              >
                My Bookings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
