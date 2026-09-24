'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[DashboardError] Captured dashboard error:', error)
  }, [error])

  return (
    <div className="mx-auto my-12 max-w-lg rounded-2xl border border-[#d8e5fb] bg-white p-8 text-center shadow-lg">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <span className="material-symbols-outlined text-3xl">refresh</span>
      </div>
      <h2 className="mt-4 font-serif text-2xl font-bold text-[#152d5a]">
        Updating Dashboard
      </h2>
      <p className="mt-2 text-sm text-[#4b6390]">
        Your recent action was processed. Click below to refresh your dashboard view.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-[#1a4fd6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#153eb5]"
        >
          Refresh Dashboard
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}
