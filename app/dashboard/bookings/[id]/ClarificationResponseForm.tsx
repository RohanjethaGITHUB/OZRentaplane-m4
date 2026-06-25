'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitClarificationResponse } from '@/app/actions/booking'

export default function ClarificationResponseForm({ bookingId }: { bookingId: string }) {
  const router   = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const response = (new FormData(e.currentTarget).get('response') as string ?? '').trim()
    if (!response) { setError('Please enter a response before submitting.'); return }

    try {
      setLoading(true)
      setError(null)
      await submitClarificationResponse(bookingId, response)
      setDone(true)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit response.')
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="mt-4 flex items-center gap-2 text-green-400 text-sm">
        <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        Response submitted — your booking is back under review.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4b6390]">Your response</p>
      <textarea
        name="response"
        required
        rows={4}
        placeholder="Type your response here…"
        className="w-full bg-white border border-[#dbe7f4] rounded-xl px-4 py-3 text-sm text-[#152d5a] placeholder:text-[#94a3b8] focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-200 resize-none shadow-[0_1px_0_rgba(255,255,255,0.8)]"
        disabled={loading}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
      >
        <span className="material-symbols-outlined text-[16px]">send</span>
        {loading ? 'Submitting…' : 'Submit Response'}
      </button>
    </form>
  )
}
