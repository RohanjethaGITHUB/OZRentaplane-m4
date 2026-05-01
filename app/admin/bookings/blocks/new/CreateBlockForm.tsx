'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createAdminScheduleBlock } from '@/app/actions/admin-booking'
import { sydneyInputToUTC, formatAircraftTimeRange } from '@/lib/utils/sydney-time'

const IS_DEV = process.env.NODE_ENV !== 'production'

export default function CreateBlockForm({ aircraftId }: { aircraftId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Conflicted blocks returned from check
  const [conflicts, setConflicts] = useState<any[] | null>(null)
  const [requireOverride, setRequireOverride] = useState(false)

  // Track raw input values for the dev debug panel
  const [startInput, setStartInput] = useState('')
  const [endInput,   setEndInput]   = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData         = new FormData(e.currentTarget)
    const block_type       = formData.get('block_type') as string
    const start_local      = formData.get('start_time') as string
    const end_local        = formData.get('end_time')   as string
    const public_label     = formData.get('public_label') as string
    const internal_reason  = formData.get('internal_reason') as string
    const is_public_visible = formData.get('is_public_visible') === 'on'
    const force_override   = requireOverride ? (formData.get('force_override') === 'on') : false

    // Convert datetime-local values (entered as Sydney time) to UTC ISO strings.
    const start_utc = sydneyInputToUTC(start_local)
    const end_utc   = sydneyInputToUTC(end_local)

    if (!start_utc || !end_utc) {
      setError('Invalid date/time values. Please check your input.')
      setLoading(false)
      return
    }

    if (start_utc === end_utc) {
      setError('Start and end time cannot be identical. For a 24-hour block, set the end time to the same clock time on the following day.')
      setLoading(false)
      return
    }

    if (new Date(end_utc) <= new Date(start_utc)) {
      setError('End time must be after start time.')
      setLoading(false)
      return
    }

    if (requireOverride && force_override && !internal_reason.trim()) {
      setError('An internal reason is strictly required when overriding conflicts.')
      setLoading(false)
      return
    }

    try {
      const result = await createAdminScheduleBlock({
        aircraft_id:      aircraftId,
        block_type:       block_type as any,
        start_time:       start_utc,
        end_time:         end_utc,
        public_label:     public_label     || null,
        internal_reason:  internal_reason  || null,
        is_public_visible,
        force_override,
      })

      if (!result.created) {
        setConflicts(result.conflicts || [])
        setRequireOverride(true)
        setLoading(false)
      } else {
        router.push('/admin/calendar')
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to create block.')
      setLoading(false)
    }
  }

  // Dev debug: show what the Sydney inputs would resolve to in UTC
  const resolvedStartUTC = IS_DEV && startInput ? sydneyInputToUTC(startInput) : null
  const resolvedEndUTC   = IS_DEV && endInput   ? sydneyInputToUTC(endInput)   : null
  const browserTZ        = IS_DEV ? Intl.DateTimeFormat().resolvedOptions().timeZone : null

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
          {error}
        </div>
      )}

      {requireOverride && conflicts && (
        <div className="p-5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            <div>
              <h3 className="font-medium text-amber-400 text-sm">Scheduling Conflicts Detected</h3>
              <p className="text-sm text-amber-200/70 mt-1">
                The requested timeframe overlaps with {conflicts.length} existing block(s).
              </p>
            </div>
          </div>
          <div className="pl-8 space-y-2">
            {conflicts.map(c => (
              <div key={c.id} className="text-xs font-mono text-amber-200/50 bg-amber-900/20 p-2 rounded">
                [{c.block_type}]{' '}
                {formatAircraftTimeRange(c.start_time, c.end_time)}{' '}
                <span className="text-amber-900/60">(Sydney)</span>
              </div>
            ))}
          </div>
          <div className="pl-8 mt-4 pt-4 border-t border-amber-500/20">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="force_override"
                className="w-4 h-4 rounded border-amber-500/30 bg-black/50 text-amber-500 focus:ring-amber-500 focus:ring-offset-[#111316]"
              />
              <span className="text-sm text-amber-300 font-medium tracking-wide">Force Override Conflict</span>
            </label>
            <p className="text-xs text-amber-500/60 mt-2">
              Bypasses overlap protection. You must provide an Internal Reason describing why this conflict is authorised.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <label className="block">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-widest block mb-2">Block Type</span>
          <select
            name="block_type"
            required
            className="w-full bg-[#0a0b0d] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
          >
            <option value="maintenance">Maintenance</option>
            <option value="admin_unavailable">Admin Unavailable</option>
            <option value="owner_use">Owner Use</option>
            <option value="inspection">Inspection</option>
            <option value="cleaning">Cleaning</option>
            <option value="weather_hold">Weather Hold</option>
            <option value="grounded">Grounded</option>
            <option value="ferry">Ferry</option>
            <option value="training_check">Training Check</option>
            <option value="temporary_hold">Temporary Hold</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="block md:col-start-1">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-widest block mb-2">
            Start Time <span className="text-blue-400/70 normal-case tracking-normal font-normal">(Sydney — AEST/AEDT)</span>
          </span>
          <input
            type="datetime-local"
            name="start_time"
            required
            value={startInput}
            onChange={e => setStartInput(e.target.value)}
            className="w-full bg-[#0a0b0d] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all [color-scheme:dark]"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-widest block mb-2">
            End Time <span className="text-blue-400/70 normal-case tracking-normal font-normal">(Sydney — AEST/AEDT)</span>
          </span>
          <input
            type="datetime-local"
            name="end_time"
            required
            value={endInput}
            onChange={e => setEndInput(e.target.value)}
            min={startInput || undefined}
            className="w-full bg-[#0a0b0d] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all [color-scheme:dark]"
          />
          <p className="text-[10px] text-slate-600 mt-1.5">
            For a 24-hour block enter the same clock time on the next day (e.g. 09:00 Tue → 09:00 Wed).
          </p>
        </label>
      </div>

      {/* Dev-only debug panel: confirms Sydney → UTC conversion */}
      {IS_DEV && (startInput || endInput) && (
        <div className="p-4 bg-slate-900/80 border border-slate-700/50 rounded-xl font-mono text-[10px] text-slate-500 space-y-1">
          <p className="text-slate-400 font-bold uppercase tracking-widest mb-2">Dev · Timezone Debug</p>
          <p>Browser TZ&nbsp;&nbsp;&nbsp;: <span className="text-slate-300">{browserTZ}</span></p>
          {startInput && (
            <>
              <p>Start input&nbsp;: <span className="text-slate-300">{startInput} (Sydney)</span></p>
              <p>Start UTC&nbsp;&nbsp;&nbsp;: <span className="text-green-400">{resolvedStartUTC ?? '—'}</span></p>
            </>
          )}
          {endInput && (
            <>
              <p>End input&nbsp;&nbsp;&nbsp;: <span className="text-slate-300">{endInput} (Sydney)</span></p>
              <p>End UTC&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <span className="text-green-400">{resolvedEndUTC ?? '—'}</span></p>
            </>
          )}
        </div>
      )}

      <div className="h-px w-full bg-white/5 my-4" />

      <label className="block">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-widest block mb-2">Public Label (Optional)</span>
        <input
          type="text"
          name="public_label"
          placeholder="e.g. 'Unavailable — Maintenance'"
          className="w-full bg-[#0a0b0d] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-widest block mb-2">
          Internal Reason{requireOverride && <span className="text-rose-400 ml-1">(Required for Override)</span>}
        </span>
        <textarea
          name="internal_reason"
          rows={3}
          required={requireOverride}
          placeholder="Admin notes explaining this block…"
          className="w-full bg-[#0a0b0d] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
        />
        <p className="text-xs text-slate-500 mt-2">Never shown to customers.</p>
      </label>

      <label className="flex items-center gap-3 cursor-pointer py-2">
        <input
          type="checkbox"
          name="is_public_visible"
          defaultChecked
          className="w-4 h-4 rounded border-white/10 bg-[#0a0b0d] text-blue-500 focus:ring-blue-500 focus:ring-offset-[#111316]"
        />
        <span className="text-sm font-medium text-slate-300">Visible to Customers on Calendar</span>
      </label>

      <div className="pt-6">
        <button
          type="submit"
          disabled={loading}
          className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-medium tracking-wide transition-colors"
        >
          {loading ? 'Processing…' : requireOverride ? 'Override & Create Block' : 'Create Schedule Block'}
        </button>
      </div>
    </form>
  )
}
