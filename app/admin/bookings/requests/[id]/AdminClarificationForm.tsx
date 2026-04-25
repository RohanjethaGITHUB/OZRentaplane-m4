'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestClarification } from '@/app/actions/admin-booking'

export default function AdminClarificationForm({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const message = (new FormData(e.currentTarget).get('message') as string ?? '').trim()
    if (!message) { setError('A message is required.'); return }

    try {
      setLoading(true)
      setError(null)
      await requestClarification(bookingId, message)
      router.push('/admin/bookings/requests')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send clarification request.')
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 bg-transparent border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">help</span>
        Request Clarification
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h4 className="text-xs font-medium text-orange-400">Request clarification from customer</h4>
      <textarea
        name="message"
        required
        rows={4}
        placeholder="What information do you need? The customer will see this message and their slot will remain held."
        className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 resize-none"
        disabled={loading}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Request'}
        </button>
      </div>
      {error && <p className="text-[10px] text-rose-400 leading-tight">{error}</p>}
    </form>
  )
}
