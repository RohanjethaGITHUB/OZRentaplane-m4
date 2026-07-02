'use client'

import { useState, useTransition } from 'react'
import { createBlockTimePurchaseIntent } from '@/app/actions/payment'

type Props = {
  packageId: string
  packageHours: number
  featured?: boolean
  pendingSectionId: string
}

function isPendingPurchaseError(message: string): boolean {
  return /pending block time purchase/i.test(message)
}

export default function BlockTimePurchaseButton({
  packageId,
  packageHours,
  featured = false,
  pendingSectionId,
}: Props) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const buttonClassName = featured
    ? 'bg-[#f59e0b] text-white hover:bg-[#e08c00]'
    : 'bg-[#152d5a] text-white hover:bg-[#1a3a6e]'

  const handleClick = () => {
    setError('')
    startTransition(async () => {
      try {
        await createBlockTimePurchaseIntent(packageId)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start purchase.'
        setError(message)

        if (isPendingPurchaseError(message)) {
          const target = document.getElementById(pendingSectionId)
          target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={`w-full rounded-xl px-4 py-3 text-center text-[12px] font-bold uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${buttonClassName}`}
      >
        {isPending ? 'Starting…' : `Buy ${packageHours} Hours`}
      </button>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
          <p className="font-semibold">Purchase could not start</p>
          <p className="mt-0.5">{error}</p>
        </div>
      ) : null}
    </div>
  )
}
