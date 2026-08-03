'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cancelOnHoldBookingAction } from './actions'

export type RejectedDocSummary = {
  id: string
  document_type: string
  review_notes: string | null
  reviewed_at: string | null
}

const DOC_LABELS: Record<string, string> = {
  pilot_licence: 'Pilot Licence',
  medical_certificate: 'Medical Certificate',
  photo_id: 'Photo ID',
  night_vfr_evidence: 'Night VFR Evidence',
}

function documentLabel(documentType: string) {
  return DOC_LABELS[documentType] ?? documentType.replaceAll('_', ' ')
}

type Props = {
  bookingId: string
  bookingReference: string
  customerId: string
  customerName: string | null
  customerEmail: string | null
  aircraftLabel: string | null
  scheduleLabel: string | null
  rejectedDocuments: RejectedDocSummary[]
}

export default function AdminRejectDocsPanel({
  bookingId,
  bookingReference,
  customerId,
  customerName,
  customerEmail,
  aircraftLabel,
  scheduleLabel,
  rejectedDocuments,
}: Props) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push('/admin/bookings')
  }

  function handleCancelBooking(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('A cancellation reason is required.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await cancelOnHoldBookingAction(bookingId, trimmed)
        handleBack()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to cancel booking.')
      }
    })
  }

  return (
    <div className="w-full max-w-md space-y-3 rounded-2xl border border-rose-500/20 bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-rose-600">
          Reject docs
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
          This booking is on hold because one or more required documents were rejected.
          Review the details below, then open documents or the booking as needed.
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Customer</p>
          <p className="mt-0.5 font-semibold text-slate-900">{customerName ?? 'Unknown customer'}</p>
          {customerEmail ? <p className="text-slate-500">{customerEmail}</p> : null}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Booking</p>
          <p className="mt-0.5 font-semibold text-slate-900">{bookingReference}</p>
          {aircraftLabel ? <p className="text-slate-500">{aircraftLabel}</p> : null}
          {scheduleLabel ? <p className="text-slate-500">{scheduleLabel}</p> : null}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Rejected document{rejectedDocuments.length === 1 ? '' : 's'}
          </p>
          {rejectedDocuments.length === 0 ? (
            <p className="mt-0.5 text-slate-500">No rejected documents found on the latest uploads.</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {rejectedDocuments.map((doc) => (
                <li key={doc.id} className="rounded-lg border border-rose-100 bg-rose-50/70 px-2.5 py-1.5">
                  <p className="font-semibold text-rose-800">{documentLabel(doc.document_type)}</p>
                  <p className="mt-0.5 text-[11px] text-rose-700/90">
                    Reason: {doc.review_notes?.trim() || 'No rejection reason recorded.'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/admin/bookings/requests/${bookingId}`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
        >
          View Booking
        </Link>
        <Link
          href={`/admin/users/${customerId}?tab=documents`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#1a4fd6]/20 bg-[#1a4fd6]/5 px-3 py-2.5 text-xs font-semibold text-[#1a4fd6] transition-colors hover:bg-[#1a4fd6]/10"
        >
          Review Documents
        </Link>
      </div>

      <button
        type="button"
        onClick={handleBack}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-rose-500"
      >
        <span className="material-symbols-outlined text-[18px]">undo</span>
        Back to previous page
      </button>

      <details className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Cancel booking instead
        </summary>
        <form onSubmit={handleCancelBooking} className="mt-3 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            rows={3}
            placeholder="Reason for cancellation..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-400/40 resize-none"
          />
          {error ? <p className="text-[11px] text-rose-600">{error}</p> : null}
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">cancel</span>
            {isPending ? 'Cancelling…' : 'Cancel booking'}
          </button>
        </form>
      </details>
    </div>
  )
}
