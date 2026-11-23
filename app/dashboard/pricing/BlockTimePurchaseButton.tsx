'use client'

import { useState, useTransition } from 'react'
import { createBlockTimeBankTransferPurchase } from '@/app/actions/block-time-bank-transfer'
import { LoadingButtonContent } from '@/components/ui/Spinner'

type Props = {
  packageId: string
  packageHours: number
  featured?: boolean
  pendingSectionId?: string
  pendingHref?: string
}

export default function BlockTimePurchaseButton({ packageId, packageHours, featured = false }: Props) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const bankButtonClassName = featured
    ? 'bg-[#f59e0b] text-white hover:bg-[#e08c00]'
    : 'bg-[#152d5a] text-white hover:bg-[#1a3a6e]'

  const handleBankTransfer = () => {
    setError('')
    startTransition(async () => {
      try {
        // Redirects to the bank transfer page on success.
        await createBlockTimeBankTransferPurchase(packageId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start purchase.')
      }
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleBankTransfer}
        disabled={isPending}
        aria-busy={isPending || undefined}
        className={`w-full rounded-xl px-4 py-3 text-center text-[12px] font-bold uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-70 flex items-center justify-center gap-2 ${bankButtonClassName}`}
      >
        <LoadingButtonContent loading={isPending} loadingLabel="Starting…">
          <span className="material-symbols-outlined text-[16px]">account_balance</span>
          {`Buy ${packageHours} Hours · Bank Transfer`}
        </LoadingButtonContent>
      </button>

      <div className="rounded-xl border border-[#152d5a]/10 bg-[#f8fafc] px-3 py-2.5 text-center">
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#4b6390]/70">
          <span className="material-symbols-outlined text-[14px]">credit_card_off</span>
          Pay online
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-[#4b6390]/80">
          Temporarily unavailable — please pay by bank transfer.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
          <p className="font-semibold">Purchase could not start</p>
          <p className="mt-0.5">{error}</p>
        </div>
      ) : null}
    </div>
  )
}
