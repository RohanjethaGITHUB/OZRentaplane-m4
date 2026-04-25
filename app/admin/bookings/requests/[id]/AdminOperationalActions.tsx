'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  adminMarkReadyForDispatch,
  adminMarkDispatched,
  adminMarkAircraftReturned,
  adminMarkCompleted,
} from '@/app/actions/admin-booking'

// Maps each "launchable" status to the single next action available.
const ACTION_MAP: Record<string, {
  label:       string
  description: string
  icon:        string
  btnClass:    string
  action:      (id: string) => Promise<void>
}> = {
  confirmed: {
    label:       'Mark Ready for Dispatch',
    description: 'Pre-flight checks done. Customer cleared to arrive.',
    icon:        'flight_takeoff',
    btnClass:    'bg-green-700 hover:bg-green-600 text-white',
    action:      adminMarkReadyForDispatch,
  },
  ready_for_dispatch: {
    label:       'Mark Dispatched',
    description: 'Aircraft has departed. Flight is now active.',
    icon:        'flight',
    btnClass:    'bg-emerald-600 hover:bg-emerald-500 text-white',
    action:      adminMarkDispatched,
  },
  dispatched: {
    label:       'Mark Aircraft Returned',
    description: 'Aircraft back on ground. Customer must submit flight record.',
    icon:        'flight_land',
    btnClass:    'bg-blue-700 hover:bg-blue-600 text-white',
    action:      adminMarkAircraftReturned,
  },
  post_flight_approved: {
    label:       'Mark Completed',
    description: 'All records accepted. Close the booking.',
    icon:        'done_all',
    btnClass:    'bg-slate-600 hover:bg-slate-500 text-white',
    action:      adminMarkCompleted,
  },
}

export default function AdminOperationalActions({
  bookingId,
  status,
}: {
  bookingId: string
  status:    string
}) {
  const router              = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const cfg = ACTION_MAP[status]
  if (!cfg) return null

  async function handleAction() {
    try {
      setLoading(true)
      setError(null)
      await cfg.action(bookingId)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-slate-500 leading-relaxed">{cfg.description}</p>
      <button
        onClick={handleAction}
        disabled={loading}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${cfg.btnClass}`}
      >
        <span className="material-symbols-outlined text-[18px]">{cfg.icon}</span>
        {loading ? 'Updating…' : cfg.label}
      </button>
      {error && <p className="text-[10px] text-rose-400 leading-tight">{error}</p>}
    </div>
  )
}
