'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approvePostFlightReview, requestPostFlightClarification } from '@/app/actions/admin-booking'
import { CLARIFICATION_CATEGORY_LABELS, type ClarificationCategory } from '@/lib/supabase/booking-types'
import { LoadingButtonContent } from '@/components/ui/Spinner'

type Props = {
  flightRecordId: string
  bookingId: string
  customerId: string
  currentStatus: string
  paymentMethod?: string | null
  totalAmountCents?: number
}

const CATEGORIES = Object.entries(CLARIFICATION_CATEGORY_LABELS) as [ClarificationCategory, string][]

export default function PostFlightReviewConsole({
  flightRecordId,
  bookingId,
  customerId,
  currentStatus,
  paymentMethod,
  totalAmountCents = 0,
}: Props) {
  const router = useRouter()
  const [actionTab, setActionTab] = useState<'approve' | 'clarify'>('approve')
  const [mode, setMode] = useState<'approve' | 'correction'>('approve')
  const [adminNotes, setAdminNotes] = useState('')
  const [adminBookingNotes, setAdminBookingNotes] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')

  // Clarification state
  const [clarifyCategory, setClarifyCategory] = useState<ClarificationCategory | ''>('')
  const [clarifyMessage, setClarifyMessage] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isAwaitingCustomer = currentStatus === 'needs_clarification'

  if (isAwaitingCustomer) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <span className="material-symbols-outlined text-xl">hourglass_empty</span>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-amber-900">Awaiting Customer Clarification</h4>
            <p className="text-xs text-amber-700">
              A clarification request was dispatched. Approval is locked until the customer resubmits readings and payment proof.
            </p>
          </div>
        </div>
      </div>
    )
  }

  async function handleApprove(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (mode === 'correction' && !correctionReason.trim()) {
      setError('A correction reason is required when modifying readings.')
      setLoading(false)
      return
    }

    try {
      await approvePostFlightReview({
        flight_record_id: flightRecordId,
        with_correction: mode === 'correction',
        admin_notes: adminNotes || null,
        admin_booking_notes: adminBookingNotes || null,
        correction_reason: mode === 'correction' ? correctionReason : null,
      })
      setSuccess('Post-flight readings and payment approved successfully.')
      setTimeout(() => {
        router.push('/admin/bookings/post-flight')
        router.refresh()
      }, 1000)
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Failed to approve review.')
      setLoading(false)
    }
  }

  async function handleClarify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (!clarifyCategory) {
      setError('Please select a clarification category.')
      setLoading(false)
      return
    }
    if (!clarifyMessage.trim()) {
      setError('Please provide specific feedback for the customer.')
      setLoading(false)
      return
    }

    try {
      await requestPostFlightClarification({
        flightRecordId,
        bookingId,
        customerId,
        category: CLARIFICATION_CATEGORY_LABELS[clarifyCategory],
        message: clarifyMessage.trim(),
      })
      setSuccess('Clarification request and email sent to customer.')
      setTimeout(() => {
        router.refresh()
      }, 1000)
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Failed to request clarification.')
      setLoading(false)
    }
  }

  const formattedAmount = (totalAmountCents / 100).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
  })

  return (
    <div className="rounded-2xl border border-[var(--admin-border)] bg-white p-6 shadow-[var(--admin-shadow-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--admin-border)] pb-4 mb-6">
        <div>
          <h3 className="text-base font-semibold text-[var(--admin-text)]">Admin Review Decision</h3>
          <p className="text-xs text-[var(--admin-text-muted)] mt-0.5">
            Verify flight meters and payment to finalize this booking or request corrections.
          </p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => { setActionTab('approve'); setError(null); }}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              actionTab === 'approve'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-sm">check_circle</span>
            Approve & Settle
          </button>
          <button
            type="button"
            onClick={() => { setActionTab('clarify'); setError(null); }}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              actionTab === 'clarify'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-sm">edit_document</span>
            Decline / Request Fix
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800">
          <span className="material-symbols-outlined text-rose-500 text-base flex-shrink-0">error</span>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-800">
          <span className="material-symbols-outlined text-emerald-600 text-base flex-shrink-0">check_circle</span>
          <span>{success}</span>
        </div>
      )}

      {actionTab === 'approve' ? (
        <form onSubmit={handleApprove} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('approve')}
              className={`flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-xs font-medium transition-all ${
                mode === 'approve'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-semibold'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
              }`}
            >
              <span className="material-symbols-outlined text-base">verified</span>
              Confirm Readings & Pay
            </button>
            <button
              type="button"
              onClick={() => setMode('correction')}
              className={`flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-xs font-medium transition-all ${
                mode === 'correction'
                  ? 'border-amber-500 bg-amber-50 text-amber-800 font-semibold'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
              }`}
            >
              <span className="material-symbols-outlined text-base">edit_note</span>
              Approve with Correction
            </button>
          </div>

          {mode === 'correction' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <label className="block">
                <span className="text-xs font-semibold text-amber-900 uppercase tracking-wider block mb-1.5">
                  Internal Correction Reason <span className="text-rose-500">*</span>
                </span>
                <textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  rows={2}
                  required
                  placeholder="Explain meter adjustments made..."
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </label>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Payment Verification:</span>
              <span className="font-semibold text-slate-900">
                {paymentMethod === 'bank_transfer' ? 'NAB Bank Transfer' : 'Stripe Online Card'} ({formattedAmount})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Aircraft Official Log:</span>
              <span className="font-semibold text-slate-900">Meters will be committed to official history</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Schedule Lock:</span>
              <span className="font-semibold text-slate-900">Schedule blocks will be released</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Admin Notes (Optional)
            </label>
            <input
              type="text"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Internal record notes..."
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            <LoadingButtonContent loading={loading} loadingLabel="Finalizing & Approving...">
              <span className="material-symbols-outlined text-lg">verified</span>
              Approve Post-Flight & Confirm Payment
            </LoadingButtonContent>
          </button>
        </form>
      ) : (
        <form onSubmit={handleClarify} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Reason / Category <span className="text-rose-500">*</span>
            </label>
            <select
              value={clarifyCategory}
              onChange={(e) => setClarifyCategory(e.target.value as ClarificationCategory)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              required
            >
              <option value="" disabled>Select reason category...</option>
              {CATEGORIES.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Message to Customer <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={clarifyMessage}
              onChange={(e) => setClarifyMessage(e.target.value)}
              rows={4}
              required
              placeholder="Explain clearly what needs to be fixed (e.g., correct start meter from photos, upload legible bank receipt, update landing count)..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              An email and notification will be sent to the renter with a direct link to adjust readings and resubmit.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-500 disabled:opacity-50"
          >
            <LoadingButtonContent loading={loading} loadingLabel="Sending Request...">
              <span className="material-symbols-outlined text-lg">mail</span>
              Send Decline / Clarification Request
            </LoadingButtonContent>
          </button>
        </form>
      )}
    </div>
  )
}
