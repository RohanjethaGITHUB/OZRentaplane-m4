'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { refundBlockTimePurchase } from '@/app/actions/block-time'

import { formatDateFromISO } from '@/lib/formatDateTime'
import { LoadingButtonContent } from '@/components/ui/Spinner'

export type AdminBlockTimePurchase = {
  id: string
  status: string
  hours_purchased: number
  hours_remaining: number
  rate_per_hour: number
  amount_paid: number
  purchased_at: string
  expires_at: string
  refund_amount: number | null
  refunded_at: string | null
  refund_stripe_id: string | null
  stripe_payment_intent_id: string | null
  package_name: string
}

const STATUS_PILL: Record<string, string> = {
  active:    'text-emerald-700 bg-emerald-50 border-emerald-200',
  pending:   'text-amber-700 bg-amber-50 border-amber-200',
  exhausted: 'text-slate-600 bg-slate-50 border-slate-200',
  expired:   'text-slate-600 bg-slate-50 border-slate-200',
  refunded:  'text-red-700 bg-red-50 border-red-200',
}

function shortDate(value: string | null | undefined): string {
  if (!value) return '—'
  return formatDateFromISO(value)
}

function aud(value: number): string {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
}

export default function BlockTimePurchasesSection({ purchases }: { purchases: AdminBlockTimePurchase[] }) {
  const router = useRouter()
  const [confirmTarget, setConfirmTarget] = useState<AdminBlockTimePurchase | null>(null)
  const [result, setResult] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function requestRefund(purchase: AdminBlockTimePurchase) {
    setResult(null)
    setConfirmTarget(purchase)
  }

  function runRefund() {
    const target = confirmTarget
    setConfirmTarget(null)
    if (!target) return
    startTransition(async () => {
      try {
        const outcome = await refundBlockTimePurchase(target.id)
        setResult({
          kind: 'success',
          message: outcome.bookkeepingComplete
            ? `Refunded ${aud(outcome.refundAmount)} (Stripe refund ${outcome.refundId}).`
            : `Stripe refund ${outcome.refundId} succeeded, but recording it in the database failed — see the admin alert for manual follow-up.`,
        })
        router.refresh()
      } catch (err: unknown) {
        setResult({ kind: 'error', message: err instanceof Error ? err.message : 'Refund failed.' })
      }
    })
  }

  return (
    <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5 mt-3">
      <h4 className="text-[11px] uppercase tracking-widest font-semibold text-[#4b6390] mb-3">Block time purchases</h4>

      {result ? (
        <div
          className={`mb-3 rounded-xl border px-4 py-3 text-[13px] ${
            result.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {result.message}
        </div>
      ) : null}

      {purchases.length === 0 ? (
        <p className="text-[12px] text-[#4b6390]">No block time purchases yet.</p>
      ) : (
        purchases.map((purchase) => {
          const hoursUsed = Number(purchase.hours_purchased) - Number(purchase.hours_remaining)
          const isUntouched = purchase.status === 'active' && hoursUsed === 0
          const refundBlockedReason =
            purchase.status === 'refunded'
              ? null
              : purchase.status === 'pending'
                ? 'Never paid'
                : purchase.status !== 'active'
                  ? 'Already consumed'
                  : hoursUsed > 0
                    ? `${hoursUsed.toFixed(1)}h flown — partially used packages are not refundable`
                    : !purchase.stripe_payment_intent_id
                      ? 'No Stripe payment on record'
                      : null

          return (
            <div
              key={purchase.id}
              className="flex flex-col gap-2 py-3 border-b border-[#152d5a]/8 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-semibold text-[#152d5a]">{purchase.package_name}</p>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      STATUS_PILL[purchase.status] ?? STATUS_PILL.exhausted
                    }`}
                  >
                    {purchase.status}
                  </span>
                </div>
                <p className="text-[12px] text-[#4b6390] mt-0.5">
                  {Number(purchase.hours_purchased).toFixed(0)}h at ${Number(purchase.rate_per_hour).toFixed(0)}/hr ·{' '}
                  {aud(Number(purchase.amount_paid))} · purchased {shortDate(purchase.purchased_at)}
                  {purchase.status === 'active' ? (
                    <> · {Number(purchase.hours_remaining).toFixed(1)}h remaining · expires {shortDate(purchase.expires_at)}</>
                  ) : null}
                </p>
                {purchase.status === 'refunded' ? (
                  <p className="text-[12px] font-medium text-red-600 mt-0.5">
                    Refunded {aud(Number(purchase.refund_amount ?? purchase.amount_paid))} on {shortDate(purchase.refunded_at)}
                    {purchase.refund_stripe_id ? <> · {purchase.refund_stripe_id}</> : ' · Stripe id missing — check alerts'}
                  </p>
                ) : null}
              </div>

              <div className="flex-shrink-0">
                {isUntouched && purchase.stripe_payment_intent_id ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => requestRefund(purchase)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-red-200 px-4 py-1.5 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <LoadingButtonContent loading={isPending} loadingLabel="Refunding…">Refund</LoadingButtonContent>
                  </button>
                ) : refundBlockedReason ? (
                  <p className="text-[11px] text-[#4b6390]/70 sm:text-right sm:max-w-[220px]">{refundBlockedReason}</p>
                ) : null}
              </div>
            </div>
          )
        })
      )}

      <ConfirmModal
        open={confirmTarget !== null}
        title="Refund this block time purchase?"
        description={
          confirmTarget
            ? `${confirmTarget.package_name} — ${aud(Number(confirmTarget.amount_paid))} will be refunded in full to the customer's original payment method, and the package will no longer be usable for flights.`
            : undefined
        }
        confirmLabel={isPending ? 'Refunding…' : 'Refund in full'}
        variant="danger"
        isPending={isPending}
        onConfirm={runRefund}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  )
}
