'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestPostFlightClarification } from '@/app/actions/admin-booking'
import type { ClarificationCategory } from '@/lib/supabase/booking-types'
import { CLARIFICATION_CATEGORY_LABELS } from '@/lib/supabase/booking-types'

const CATEGORIES = Object.entries(CLARIFICATION_CATEGORY_LABELS) as [ClarificationCategory, string][]

type Props = {
  flightRecordId: string
  bookingId:      string
  customerId:     string
  onCancel:       () => void
}

export default function RequestClarificationForm({
  flightRecordId,
  bookingId,
  customerId,
  onCancel,
}: Props) {
  const router  = useRouter()
  const [category, setCategory] = useState<ClarificationCategory | ''>('')
  const [message,  setMessage]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!category) { setError('Select a clarification category.'); return }
    if (!message.trim()) { setError('A message to the customer is required.'); return }

    try {
      setLoading(true)
      await requestPostFlightClarification({
        flightRecordId,
        bookingId,
        customerId,
        category: CLARIFICATION_CATEGORY_LABELS[category],
        message: message.trim(),
      })
      router.refresh()
      onCancel()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Request failed.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 mt-6 pt-6 border-t border-white/10">
      <h4 className="text-sm font-medium text-amber-300 uppercase tracking-widest">
        Request Clarification
      </h4>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
          {error}
        </div>
      )}

      {/* Category */}
      <div>
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">
          Category <span className="text-rose-400">*</span>
        </label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as ClarificationCategory)}
          className="w-full bg-[#111316] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 appearance-none"
          required
        >
          <option value="" disabled>Select a category…</option>
          {CATEGORIES.map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Message */}
      <div>
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">
          Message to Customer <span className="text-rose-400">*</span>
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          placeholder="Describe exactly what the customer needs to provide or correct…"
          className="w-full bg-[#111316] border border-white/10 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 resize-none"
          required
        />
        <p className="mt-1 text-[10px] text-slate-600">
          This message will be emailed to the customer and posted in their messages inbox.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 disabled:opacity-50 text-amber-300 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
        >
          {loading ? 'Sending…' : 'Send Clarification Request'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 border border-white/10 hover:border-white/20 text-slate-400 hover:text-white rounded-xl text-xs font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
