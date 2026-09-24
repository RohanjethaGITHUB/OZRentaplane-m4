'use client'

import { useMemo, useState, useTransition } from 'react'
import { createBlockTimeTopupIntent } from '@/app/actions/payment'
import {
  blockTimeTopupMinimumHours,
  blockTimeTopupExtensionDays,
} from '@/lib/payments/block-time-topup'
import { formatDateFromISO } from '@/lib/formatDateTime'
import { LoadingButtonContent } from '@/components/ui/Spinner'

type Props = {
  purchaseId: string
  packageName: string
  hoursPurchased: number
  hoursRemaining: number
  ratePerHour: number
  expiresAt: string
  validityDays: number
  isModal?: boolean
}

function formatAud(value: number): string {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
}

function formatDate(value: Date): string {
  return formatDateFromISO(value.toISOString())
}

export default function BlockTimeTopupCard({
  purchaseId,
  packageName,
  hoursPurchased,
  hoursRemaining,
  ratePerHour,
  expiresAt,
  validityDays,
  isModal = false,
}: Props) {
  const minHours = blockTimeTopupMinimumHours(hoursPurchased)
  const extensionDays = blockTimeTopupExtensionDays(validityDays)

  const [hoursInput, setHoursInput] = useState(String(minHours))
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const hours = useMemo(() => {
    const parsed = Number(hoursInput)
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return Math.round(parsed * 100) / 100
  }, [hoursInput])

  const belowMinimum = hours !== null && hours + 1e-9 < minHours
  const canSubmit = hours !== null && !belowMinimum && !isPending

  const cost = hours !== null ? Math.round(hours * ratePerHour * 100) / 100 : null
  const newBalance = hours !== null ? Math.round((hoursRemaining + hours) * 100) / 100 : null
  const currentExpiry = new Date(expiresAt)
  const newExpiry = new Date(currentExpiry.getTime() + extensionDays * 24 * 60 * 60 * 1000)

  const handleTopup = () => {
    if (hours === null || belowMinimum) return
    setError('')
    startTransition(async () => {
      try {
        await createBlockTimeTopupIntent(purchaseId, hours)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start the top-up.')
      }
    })
  }

  return (
    <div
      id={isModal ? undefined : "top-up"}
      className={
        isModal
          ? "w-full"
          : "mt-6 scroll-mt-24 rounded-xl border border-[#1a4fd6]/15 bg-[#f8fbff]/70 p-5 md:p-6"
      }
    >
      {!isModal && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3
              className="text-[22px] font-normal leading-tight text-[#152d5a]"
              style={{ fontFamily: 'Newsreader, Georgia, serif' }}
            >
              Top up {packageName}
            </h3>
            <p className="text-[12px] font-semibold text-[#1a4fd6]">
              ${ratePerHour.toFixed(0)}/hr — your locked-in rate
            </p>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-[#4b6390]">
            Add hours to your existing package at the rate you originally locked in. Each top-up also
            extends your expiry by {extensionDays} days. Minimum top-up: {minHours} hours.
          </p>
        </>
      )}

      <div className={isModal ? "flex flex-col gap-4 sm:flex-row sm:items-start" : "mt-4 flex flex-col gap-4 md:flex-row md:items-start"}>
        <div className={isModal ? "sm:w-[180px]" : "md:w-[220px]"}>
          <label htmlFor="topup-hours" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6]">
            Hours to add
          </label>
          <input
            id="topup-hours"
            type="number"
            inputMode="decimal"
            min={minHours}
            step={0.5}
            value={hoursInput}
            onChange={(e) => setHoursInput(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-[#152d5a]/15 bg-white px-3.5 py-2.5 text-[17px] font-semibold text-[#152d5a] outline-none transition-colors focus:border-[#1a4fd6]"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[minHours, minHours + 2, minHours + 5, minHours + 10].filter((v, i, arr) => arr.indexOf(v) === i).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setHoursInput(String(preset))}
                className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  hoursInput === String(preset)
                    ? 'border-[#1a4fd6] bg-[#f0f6ff] text-[#1a4fd6]'
                    : 'border-[#152d5a]/10 bg-white text-[#4b6390] hover:bg-[#f8fafc]'
                }`}
              >
                +{preset}h
              </button>
            ))}
          </div>
          {belowMinimum ? (
            <p className="mt-1.5 text-[11px] font-medium text-amber-700">
              Minimum top-up is {minHours}h (10% of package).
            </p>
          ) : null}
        </div>

        <div className="flex-1 rounded-xl border border-[#152d5a]/10 bg-[#f8fbff]/70 p-3.5 sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6]">Live Breakdown</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px] sm:text-[13px] sm:grid-cols-4">
            <div>
              <dt className="text-[#4b6390]">Hours added</dt>
              <dd className="mt-0.5 font-semibold text-[#152d5a]">
                {hours !== null ? `+${hours}h` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[#4b6390]">Cost</dt>
              <dd className="mt-0.5 font-semibold text-[#1a4fd6]">
                {cost !== null ? formatAud(cost) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[#4b6390]">New balance</dt>
              <dd className="mt-0.5 font-semibold text-[#152d5a]">
                {newBalance !== null ? `${newBalance.toFixed(1)}h` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[#4b6390]">New expiry</dt>
              <dd className="mt-0.5 font-semibold text-[#152d5a]">
                {formatDate(newExpiry)}
                <span className="ml-1 rounded-full border border-[#1a4fd6]/15 bg-[#f0f6ff] px-1 py-0.2 text-[9px] font-bold text-[#1a4fd6]">
                  +{extensionDays}d
                </span>
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-[#4b6390]/80">
            Current expiry {formatDate(currentExpiry)} · extended by {extensionDays} days upon payment.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handleTopup}
          disabled={!canSubmit}
          aria-busy={isPending || undefined}
          className="w-full sm:w-auto rounded-xl bg-[#f59e0b] px-6 py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#e08c00] disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center gap-2 text-center"
        >
          <LoadingButtonContent loading={isPending} loadingLabel="Starting…">
            {hours !== null && cost !== null && !belowMinimum
              ? `Top up ${hours}h for ${formatAud(cost)}`
              : 'Top up'}
          </LoadingButtonContent>
        </button>
        <p className="text-[11px] text-[#4b6390]/80">
          You will be sent to Stripe checkout to complete payment securely. Prices include GST.
        </p>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
          <p className="font-semibold">Top-up could not start</p>
          <p className="mt-0.5">{error}</p>
        </div>
      ) : null}
    </div>
  )
}
