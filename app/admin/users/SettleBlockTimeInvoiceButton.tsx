'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminSettleBlockTimeInvoice } from '@/app/actions/payment'
import { LoadingButtonContent } from '@/components/ui/Spinner'

type ManualPaymentMethod = 'cash' | 'card_in_person' | 'bank_transfer'

const METHOD_OPTIONS: { value: ManualPaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card_in_person', label: 'Card (in person)' },
  { value: 'bank_transfer', label: 'Bank transfer (verified)' },
]

// Case 3 ("mark paid") control for an awaiting block time flight invoice —
// an overage or landing fee invoice settled cash / in person, or a bank
// transfer the admin has verified. Settling an overage invoice lifts the
// customer's booking gate automatically.
export default function SettleBlockTimeInvoiceButton({
  invoiceId,
  invoiceNumber,
  isOverage,
}: {
  invoiceId: string
  invoiceNumber: string
  isOverage: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<ManualPaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSettle() {
    setError(null)
    startTransition(async () => {
      try {
        await adminSettleBlockTimeInvoice({
          invoiceId,
          paymentMethod: method,
          note: note.trim() || undefined,
        })
        setOpen(false)
        router.refresh()
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : 'Action failed. Please try again.'
        setError(message.replace(/^VALIDATION: /, ''))
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg border border-[#152d5a]/20 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#152d5a] transition-colors hover:bg-[#f0f6ff]"
      >
        Mark settled
      </button>
    )
  }

  return (
    <div className="w-full rounded-xl border border-[#152d5a]/15 bg-[#f7f9fc] p-3 space-y-2 sm:max-w-xs">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#4b6390]">
        Settle {invoiceNumber}
      </p>
      <select
        value={method}
        onChange={(e) => setMethod(e.target.value as ManualPaymentMethod)}
        disabled={isPending}
        className="w-full rounded-lg border border-[#152d5a]/15 bg-white px-2 py-1.5 text-[12px] text-[#152d5a] focus:outline-none"
      >
        {METHOD_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        disabled={isPending}
        className="w-full rounded-lg border border-[#152d5a]/15 bg-white px-2 py-1.5 text-[12px] text-[#152d5a] focus:outline-none"
      />
      {isOverage && (
        <p className="text-[11px] text-[#4b6390] leading-relaxed">
          Settling this overage lifts the customer&apos;s booking / purchase gate immediately.
        </p>
      )}
      {error && (
        <p className="text-[11px] text-rose-600 leading-relaxed">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSettle}
          disabled={isPending}
          aria-busy={isPending || undefined}
          className="flex-1 rounded-lg bg-[#1a4fd6] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#1540a8] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <LoadingButtonContent loading={isPending} loadingLabel="Settling…">
            Confirm settled
          </LoadingButtonContent>
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          disabled={isPending}
          className="rounded-lg border border-[#152d5a]/20 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#152d5a] transition-colors hover:bg-[#f0f6ff] disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
