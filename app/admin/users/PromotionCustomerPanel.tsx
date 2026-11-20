'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  cancelCheckoutCredit,
  getCustomerPromotionSummary,
  grantBonusHours,
  issueCheckoutCredit,
  type CustomerPromotionSummary,
} from '@/app/actions/promotions'

function shortDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium' })
}

const inputClass = 'w-full rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-sm text-[#152d5a] focus:border-[#1a4fd6] focus:outline-none'

/**
 * Admin: bonus hours (case-by-case, never advertised) and free checkout credits
 * for one customer. Loads its own data so the large profile page stays unchanged.
 */
export default function PromotionCustomerPanel({ customerId }: { customerId: string }) {
  const router = useRouter()
  const [summary, setSummary] = useState<CustomerPromotionSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const [purchaseId, setPurchaseId] = useState('')
  const [hours, setHours] = useState('1')
  const [reason, setReason] = useState('')
  const [creditReason, setCreditReason] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await getCustomerPromotionSummary(customerId)
      setSummary(data)
      setPurchaseId((current) => current || data.purchases.find((p) => p.status === 'active')?.id || data.purchases[0]?.id || '')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load promotion details.')
    }
  }, [customerId])

  useEffect(() => { void load() }, [load])

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, after?: () => void) {
    setMessage(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) return setMessage({ tone: 'error', text: res.error })
      setMessage({ tone: 'ok', text: success })
      after?.()
      await load()
      router.refresh()
    })
  }

  const availableCredits = summary?.credits.filter((c) => c.status === 'available') ?? []

  return (
    <div className="rounded-2xl border border-[#152d5a]/10 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-amber-600">redeem</span>
        <h4 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-[#152d5a]">Bonus hours &amp; free checkout</h4>
      </div>
      <p className="mt-1 text-xs text-[#4b6390]">
        Black Friday extras for this customer, plus case-by-case hours you agree with them directly (not advertised).
      </p>

      {loadError ? <p className="mt-4 text-sm text-red-700">{loadError}</p> : null}
      {!summary && !loadError ? <p className="mt-4 text-sm text-[#4b6390]">Loading…</p> : null}

      {summary ? (
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Free checkout */}
          <div className="rounded-xl border border-[#152d5a]/8 bg-[#f8fbff] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#152d5a]">Free checkout credits</p>
            {summary.credits.length === 0 ? (
              <p className="mt-2 text-sm text-[#4b6390]">None.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {summary.credits.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[#152d5a]">
                      {c.promotion_name ?? 'Manual'} · {shortDate(c.created_at)}
                      {c.used_at ? ` · used ${shortDate(c.used_at)}` : ''}
                      {c.cancelled_reason ? ` · ${c.cancelled_reason}` : ''}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                        c.status === 'available' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : c.status === 'used' ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}>{c.status}</span>
                      {c.status === 'available' ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            const why = window.prompt('Reason for cancelling this free checkout credit?')
                            if (why) run(() => cancelCheckoutCredit(c.id, why), 'Credit cancelled.')
                          }}
                          className="text-[11px] font-semibold text-red-700 hover:underline disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {availableCredits.length > 0 ? (
              <p className="mt-3 text-xs text-emerald-800">
                The next checkout outcome you record for this pilot will be covered automatically ($0).
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <input
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                placeholder="Reason, e.g. goodwill"
                className={inputClass}
              />
              <button
                type="button"
                disabled={isPending || !creditReason.trim()}
                onClick={() => run(() => issueCheckoutCredit(customerId, creditReason), 'Free checkout credit issued.', () => setCreditReason(''))}
                className="shrink-0 rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-sm font-semibold text-[#152d5a] hover:bg-slate-50 disabled:opacity-50"
              >
                Give free checkout
              </button>
            </div>
          </div>

          {/* Bonus hours */}
          <div className="rounded-xl border border-amber-200/70 bg-[#fffdf7] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#152d5a]">Add bonus hours</p>
            {summary.purchases.length === 0 ? (
              <p className="mt-2 text-sm text-[#4b6390]">This customer has no active block time package. Bonus hours are added to a package.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <select value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)} className={inputClass}>
                  {summary.purchases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.package_name} — {p.hours_remaining.toFixed(1)} h left
                      {p.bonus_hours > 0 ? ` (incl. ${p.bonus_hours} bonus)` : ''}
                      {p.promotion_name ? ` · ${p.promotion_name}` : ''}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input type="number" min={0.5} max={50} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} className={`${inputClass} w-24`} aria-label="Hours" />
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. regular customer — agreed by phone" className={inputClass} />
                </div>
                <button
                  type="button"
                  disabled={isPending || !purchaseId || !reason.trim() || !(Number(hours) > 0)}
                  onClick={() =>
                    run(
                      () => grantBonusHours({ customerId, purchaseId, hours: Number(hours), reason }),
                      `${hours} bonus hour(s) added. The customer has been notified.`,
                      () => setReason(''),
                    )
                  }
                  className="rounded-lg bg-[#152d5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0C2340] disabled:opacity-50"
                >
                  {isPending ? 'Saving…' : 'Add bonus hours'}
                </button>
              </div>
            )}
            {summary.grants.length > 0 ? (
              <ul className="mt-4 space-y-1.5 border-t border-amber-200/60 pt-3">
                {summary.grants.map((g) => (
                  <li key={g.id} className="flex justify-between gap-3 text-xs text-[#4b6390]">
                    <span>
                      {g.source === 'promotion' ? 'Black Friday bonus' : g.reason} · {g.package_name ?? 'Package'} · {shortDate(g.created_at)}
                    </span>
                    <span className="font-semibold text-amber-700">+{g.hours} h</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`mt-4 text-sm ${message.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`} role="status">{message.text}</p>
      ) : null}
    </div>
  )
}
