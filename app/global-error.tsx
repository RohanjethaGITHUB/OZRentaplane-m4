'use client'

type GlobalErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html>
      <body className="bg-[#0b0d10] text-white">
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <h2 className="text-xl font-semibold">Application error</h2>
          <p className="mt-2 text-sm text-slate-400 max-w-lg">
            A critical rendering error occurred. Refresh the page or try again.
          </p>
          {error?.digest && (
            <p className="mt-3 text-xs text-slate-500 font-mono">Digest: {error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            className="mt-5 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
