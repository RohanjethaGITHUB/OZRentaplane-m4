'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approvePostFlightReview } from '@/app/actions/admin-booking'

type Props = {
  flightRecordId: string
  currentStatus:  string
}

export default function FlightRecordApprovalForm({ flightRecordId, currentStatus }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [mode,    setMode]    = useState<'approve' | 'correction'>('approve')

  // Hard block: approval is not permitted while needs_clarification.
  // The customer must formally resubmit before this form becomes active.
  if (currentStatus === 'needs_clarification') {
    return (
      <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-400 text-[18px]">lock</span>
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Approval Locked
          </span>
        </div>
        <p className="text-xs text-amber-400/75 leading-relaxed">
          You requested clarification on this record. Approval is blocked until the
          customer formally resubmits. Sending a message alone does not unblock approval.
        </p>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData          = new FormData(e.currentTarget)
    const admin_notes       = formData.get('admin_notes') as string
    const admin_booking_notes = formData.get('admin_booking_notes') as string
    const correction_reason = formData.get('correction_reason') as string

    if (mode === 'correction' && !correction_reason.trim()) {
      setError('A correction reason is required when modifying readings.')
      setLoading(false)
      return
    }

    try {
      await approvePostFlightReview({
        flight_record_id:    flightRecordId,
        with_correction:     mode === 'correction',
        admin_notes:         admin_notes || null,
        admin_booking_notes: admin_booking_notes || null,
        correction_reason:   mode === 'correction' ? correction_reason : null,
      })
      router.push('/admin/bookings/post-flight')
      router.refresh()
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Failed to approve review.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* Mode Selection */}
      <div className="flex gap-4">
        <label className={`flex-1 flex items-center justify-center cursor-pointer px-4 py-4 rounded-xl border-2 transition-all ${
          mode === 'approve'
            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
            : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white'
        }`}>
          <input type="radio" name="mode" value="approve" checked={mode === 'approve'} onChange={() => setMode('approve')} className="hidden" />
          <div className="flex flex-col items-center gap-1">
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            <span className="text-sm font-medium tracking-wide">Standard Approval</span>
          </div>
        </label>

        <label className={`flex-1 flex items-center justify-center cursor-pointer px-4 py-4 rounded-xl border-2 transition-all ${
          mode === 'correction'
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
            : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white'
        }`}>
          <input type="radio" name="mode" value="correction" checked={mode === 'correction'} onChange={() => setMode('correction')} className="hidden" />
          <div className="flex flex-col items-center gap-1">
            <span className="material-symbols-outlined text-[20px]">edit_note</span>
            <span className="text-sm font-medium tracking-wide">Correction Override</span>
          </div>
        </label>
      </div>

      {mode === 'correction' && (
        <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-xl mt-4">
          <label className="block">
            <span className="text-xs font-medium text-amber-400 uppercase tracking-widest block mb-2">
              Internal Correction Reason (Required)
            </span>
            <textarea
              name="correction_reason"
              required
              rows={2}
              placeholder="Explain why an admin correction was necessary..."
              className="w-full bg-[#0a0b0d] border border-amber-500/20 rounded-lg px-4 py-3 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </label>
        </div>
      )}

      <label className="block">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-widest block mb-2">
          Admin Notes (Flight Record)
        </span>
        <textarea
          name="admin_notes"
          rows={2}
          placeholder="Optional notes attached to the flight record..."
          className="w-full bg-[#111316] border border-white/10 rounded-lg px-4 py-3 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </label>

      <label className="block flex items-center justify-between pointer-events-none opacity-50 select-none">
        <div>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-widest block mb-1">
            Xero Invoice Generation
          </span>
          <p className="text-[10px] text-slate-500">Milestone Phase 2 (Coming Soon)</p>
        </div>
        <div className="w-12 h-6 bg-white/5 rounded-full relative">
          <div className="w-4 h-4 bg-slate-600 rounded-full absolute top-1 left-1" />
        </div>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-8 py-4 rounded-xl font-medium tracking-wide transition-colors mt-6 shadow-xl shadow-blue-900/20"
      >
        {loading
          ? 'Processing...'
          : mode === 'correction'
          ? 'Commit With Correction'
          : 'Commit & Commit Meter Readings'}
      </button>
    </form>
  )
}

