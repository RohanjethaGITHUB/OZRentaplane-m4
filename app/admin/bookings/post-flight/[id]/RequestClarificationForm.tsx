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
    <form onSubmit={handleSubmit} className="space-y-5 mt-6 pt-6 border-t border-[var(--admin-border)]">
      <h4 className="text-sm font-semibold text-[#152d5a] uppercase tracking-widest">
        Request Clarification
      </h4>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
          {error}
        </div>
      )}

      {/* Category */}
      <div>
        <label className="block text-xs font-medium text-[var(--admin-text-muted)] uppercase tracking-widest mb-2">
          Category <span className="text-rose-400">*</span>
        </label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as ClarificationCategory)}
          className="w-full bg-white border border-[var(--admin-border)] rounded-lg px-4 py-2.5 text-sm text-[var(--admin-text)] focus:outline-none focus:border-[rgba(26,79,214,0.35)] focus:ring-1 focus:ring-blue-200 appearance-none"
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
        <label className="block text-xs font-medium text-[var(--admin-text-muted)] uppercase tracking-widest mb-2">
          Message to Customer <span className="text-rose-400">*</span>
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          placeholder="Describe exactly what the customer needs to provide or correct…"
          className="w-full bg-white border border-[var(--admin-border)] rounded-lg px-4 py-3 text-sm text-[var(--admin-text)] placeholder:text-[var(--admin-text-muted)] focus:outline-none focus:border-[rgba(26,79,214,0.35)] focus:ring-1 focus:ring-blue-200 resize-none"
          required
        />
        <p className="mt-1 text-[10px] text-[var(--admin-text-muted)]">
          This message will be emailed to the customer and posted in their messages inbox.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-[#1a4fd6] hover:bg-[#1540a8] border border-[#1a4fd6] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-sm"
        >
          {loading ? 'Sending…' : 'Send Clarification Request'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 border border-[var(--admin-border)] hover:border-[rgba(26,79,214,0.2)] text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] rounded-xl text-xs font-medium transition-colors bg-white"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
