'use client'

import { useEffect } from 'react'

type ErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center px-6 text-center">
      <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
      <p className="mt-2 text-sm text-slate-400">
        An unexpected error occurred while rendering this page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
