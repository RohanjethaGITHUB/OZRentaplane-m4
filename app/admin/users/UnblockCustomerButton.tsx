'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateAccountStatus } from '@/app/actions/admin'
import { LoadingButtonContent } from '@/components/ui/Spinner'

export default function UnblockCustomerButton({ customerId }: { customerId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleConfirm = () => {
    setError(null)
    startTransition(async () => {
      try {
        await updateAccountStatus(customerId, 'active')
        setOpen(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to unblock customer.')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-green-400/25 bg-green-500/10 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-green-200 transition-colors hover:bg-green-500/20"
      >
        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>lock_open</span>
        Unblock Customer
      </button>

      {open ? (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-2xl">
            <h3 className="text-xl font-semibold text-white">Unblock customer account?</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Unblocking will restore normal platform access for this customer. Their ability to request checkout flights or make bookings will still depend on their current clearance, document, and booking status.
            </p>
            {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                aria-busy={isPending || undefined}
                className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <LoadingButtonContent loading={isPending} loadingLabel="Unblocking...">
                  Confirm Unblock
                </LoadingButtonContent>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
