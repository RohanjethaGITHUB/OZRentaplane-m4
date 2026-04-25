'use client'

import { useState } from 'react'
import { confirmBookingRequest, cancelBookingRequest } from '@/app/actions/admin-booking'

export default function PendingBookingActions({ bookingId }: { bookingId: string }) {
  const [loading, setLoading] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    try {
      setLoading(true)
      setError(null)
      await confirmBookingRequest(bookingId)
      // revalidate triggers automatically inside Server Action
    } catch (e: any) {
      console.error(e)
      setError(e.message || 'Failed to confirm booking.')
      setLoading(false)
    }
  }

  async function handleCancel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    try {
      setLoading(true)
      setError(null)
      const form = new FormData(e.currentTarget)
      const reason = form.get('reason') as string
      await cancelBookingRequest(bookingId, reason)
    } catch (e: any) {
      console.error(e)
      setError(e.message || 'Failed to cancel booking.')
      setLoading(false)
      setIsCancelling(false)
    }
  }

  if (isCancelling) {
    return (
      <form onSubmit={handleCancel} className="w-full space-y-4">
        <h4 className="text-sm font-medium text-rose-400">Cancel Booking</h4>
        <textarea
          name="reason"
          required
          rows={3}
          placeholder="Reason for cancellation..."
          className="w-full bg-[#111316] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50"
          disabled={loading}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsCancelling(false)}
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors"
          >
            {loading ? '...' : 'Confirm'}
          </button>
        </div>
        {error && <p className="text-[10px] text-rose-400 leading-tight">{error}</p>}
      </form>
    )
  }

  return (
    <div className="w-full space-y-3">
      <button
        onClick={handleConfirm}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[18px]">check_circle</span>
        Confirm
      </button>
      
      <button
        onClick={() => setIsCancelling(true)}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-transparent border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[18px]">cancel</span>
        Reject
      </button>

      {error && <p className="text-[10px] text-rose-400 leading-tight text-center mt-2">{error}</p>}
    </div>
  )
}
