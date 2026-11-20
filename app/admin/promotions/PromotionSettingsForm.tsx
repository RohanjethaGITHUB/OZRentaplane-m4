'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { endPromotionNow, updatePromotion, updatePromotionRules } from '@/app/actions/promotions'
import type { PromotionRow, PromotionStatus } from '@/lib/promotions'
import SydneyDateTimeField, { formatDateLabel, formatTimeLabel, parseLocal, sydneyNowValue, sydneyZoneLabel } from './SydneyDateTimeField'

export type AdminPromotionRule = {
  id: string
  packageName: string
  packageHours: number
  totalPrice: number
  displayOrder: number
  bonusHours: number
  includesFreeCheckout: boolean
}

const STATUS_STYLE: Record<PromotionStatus, { label: string; className: string; hint: string }> = {
  live:      { label: 'Live now',  className: 'bg-emerald-50 text-emerald-700 border-emerald-200', hint: 'Customers can see the banner and buy at sale terms.' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-50 text-blue-700 border-blue-200',          hint: 'Switched on — it goes live automatically at the start time.' },
  ended:     { label: 'Ended',     className: 'bg-slate-50 text-slate-600 border-slate-200',       hint: 'The end time has passed. Move the end date to extend the sale.' },
  disabled:  { label: 'Off',       className: 'bg-amber-50 text-amber-800 border-amber-200',       hint: 'Switched off — the site behaves exactly as normal.' },
}

/** ISO → "YYYY-MM-DDTHH:mm" in Sydney time for <input type="datetime-local">. */
function toSydneyInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

const inputClass =
  'w-full rounded-lg border border-[#0C2340]/15 bg-white px-3 py-2.5 text-sm text-[#0C2340] focus:border-[#1a4fd6] focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/15'
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#3d5a80]'

const chipClass =
  'inline-flex items-center gap-1.5 rounded-full border border-[#0C2340]/15 bg-white px-3 py-1.5 text-xs font-semibold text-[#0C2340] transition-colors hover:border-[#1a4fd6]/40 hover:bg-[#eef4ff]'

function Section({ icon, title, subtitle, first, children }: { icon: string; title: string; subtitle?: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div className={`px-6 py-5 ${first ? '' : 'border-t border-slate-100'}`}>
      <div className="mb-3 flex items-start gap-2.5">
        <span className="material-symbols-outlined mt-px text-[18px] text-[#1a4fd6]">{icon}</span>
        <div>
          <h4 className="text-sm font-bold text-[#0C2340]">{title}</h4>
          {subtitle ? <p className="mt-0.5 text-xs text-[#3d5a80]">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </div>
  )
}

/** "Runs Fri 27 Nov 2026, 12:00 AM → Mon 30 Nov 2026, 11:59 PM (AEDT) · 4 days". */
function WindowSummary({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const s = parseLocal(startsAt)
  const e = parseLocal(endsAt)
  if (!s || !e) return null
  const ms = Date.UTC(e.y, e.m - 1, e.d, e.h, e.min) - Date.UTC(s.y, s.m - 1, s.d, s.h, s.min)
  if (ms <= 0) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
        <span className="material-symbols-outlined text-[18px]">error</span>
        The end must be after the start.
      </div>
    )
  }
  const hours = Math.round(ms / 3_600_000)
  const length = hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`
  const zone = sydneyZoneLabel(s) === sydneyZoneLabel(e) ? sydneyZoneLabel(s) : `${sydneyZoneLabel(s)}/${sydneyZoneLabel(e)}`
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#1a4fd6]/15 bg-[#f5f9ff] px-3.5 py-3 text-sm text-[#0C2340]">
      <span className="material-symbols-outlined mt-px text-[18px] text-[#1a4fd6]">date_range</span>
      <p className="leading-relaxed">
        Runs <strong>{formatDateLabel(s)}, {formatTimeLabel(s)}</strong> to{' '}
        <strong>{formatDateLabel(e)}, {formatTimeLabel(e)}</strong>{' '}
        <span className="text-[#3d5a80]">Sydney time ({zone}) · {length}</span>
      </p>
    </div>
  )
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-4 rounded-xl border border-[#0C2340]/10 bg-[#f8fbff] p-4 text-left transition-colors hover:border-[#0C2340]/20"
    >
      <span className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-[#0C2340]">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-[#3d5a80]">{description}</span>
      </span>
    </button>
  )
}

export default function PromotionSettingsForm({
  promotion,
  status,
  rules: initialRules,
}: {
  promotion: PromotionRow
  status: PromotionStatus
  rules: AdminPromotionRule[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)

  const [name, setName] = useState(promotion.name)
  const [isEnabled, setIsEnabled] = useState(promotion.is_enabled)
  const [startsAt, setStartsAt] = useState(toSydneyInput(promotion.starts_at))
  const [endsAt, setEndsAt] = useState(toSydneyInput(promotion.ends_at))
  const [allowUncleared, setAllowUncleared] = useState(promotion.allow_uncleared_purchase)
  const [headline, setHeadline] = useState(promotion.headline ?? '')
  const [marquee, setMarquee] = useState(promotion.marquee_text ?? '')
  const [rules, setRules] = useState(initialRules)

  const statusStyle = STATUS_STYLE[status]

  function save() {
    setMessage(null)
    startTransition(async () => {
      const res = await updatePromotion({
        promotionId: promotion.id,
        name,
        isEnabled,
        startsAtSydney: startsAt,
        endsAtSydney: endsAt,
        allowUnclearedPurchase: allowUncleared,
        headline,
        marqueeText: marquee,
      })
      if (!res.ok) return setMessage({ tone: 'error', text: res.error })
      const rulesRes = await updatePromotionRules(
        rules.map((r) => ({ ruleId: r.id, bonusHours: r.bonusHours, includesFreeCheckout: r.includesFreeCheckout })),
      )
      if (!rulesRes.ok) return setMessage({ tone: 'error', text: rulesRes.error })
      setMessage({ tone: 'ok', text: 'Saved. The website and customer portal now use these settings.' })
      router.refresh()
    })
  }

  function endNow() {
    setConfirmEnd(false)
    setMessage(null)
    startTransition(async () => {
      const res = await endPromotionNow(promotion.id)
      if (!res.ok) return setMessage({ tone: 'error', text: res.error })
      setMessage({ tone: 'ok', text: 'The sale has ended. The banner is gone and prices are back to normal.' })
      router.refresh()
    })
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-semibold text-[#0C2340] tracking-tight">{promotion.name}</h3>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusStyle.className}`}>
            {status === 'live' ? <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle" /> : null}
            {statusStyle.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a href="/black-friday" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#0C2340]/15 bg-white px-3 py-2 text-sm font-medium text-[#0C2340] hover:bg-slate-50">
            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            View sale page
          </a>
          {status === 'live' || status === 'scheduled' ? (
            <button type="button" onClick={() => setConfirmEnd(true)} disabled={isPending} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">
              End sale now
            </button>
          ) : null}
        </div>
      </div>
      <p className="-mt-3 text-sm text-[#3d5a80]">{statusStyle.hint}</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Settings */}
        <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-white shadow-sm">
          <Section icon="toggle_on" title="Sale status" first>
            <Toggle
              checked={isEnabled}
              onChange={setIsEnabled}
              label={isEnabled ? 'Sale switched on' : 'Sale switched off'}
              description="Master switch. When off, the banner, sale page and bonus offers disappear immediately."
            />
          </Section>

          <Section icon="schedule" title="Sale window" subtitle="All times are Sydney time, the same as bookings on the website.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SydneyDateTimeField id="promo-start" label="Starts" value={startsAt} onChange={setStartsAt} />
              <SydneyDateTimeField
                id="promo-end"
                label="Ends"
                value={endsAt}
                onChange={setEndsAt}
                minValue={startsAt}
                hint="Change this any time to extend or shorten the sale."
              />
            </div>
            <WindowSummary startsAt={startsAt} endsAt={endsAt} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setStartsAt(sydneyNowValue())} className={chipClass}>
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                Start now
              </button>
              <button
                type="button"
                onClick={() => { setStartsAt('2026-11-27T00:00'); setEndsAt('2026-11-30T23:59') }}
                className={chipClass}
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                Reset to Black Friday → Cyber Monday
              </button>
            </div>
          </Section>

          <Section icon="how_to_reg" title="Who can buy">
            <Toggle
              checked={allowUncleared}
              onChange={setAllowUncleared}
              label="Let new pilots buy before their checkout"
              description="During the sale, pilots who are not yet cleared can buy a package and use the included free checkout. Outside the sale, the normal rule applies."
            />
          </Section>

          <Section icon="campaign" title="Customer-facing text">
            <div className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="promo-headline">Headline</label>
                <input id="promo-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Free checkout flight with every flight block" className={inputClass} />
                <p className="mt-1 text-xs text-[#3d5a80]">Shown on the sale page and the customer Block Time page.</p>
              </div>
              <div>
                <label className={labelClass} htmlFor="promo-marquee">Scrolling banner text</label>
                <textarea id="promo-marquee" value={marquee} onChange={(e) => setMarquee(e.target.value)} rows={3} className={inputClass} />
                <p className="mt-1 text-xs text-[#3d5a80]">Scrolls across the top of the website and customer portal while the sale is live. Separate items with “·”.</p>
              </div>
              <div>
                <label className={labelClass} htmlFor="promo-name">Internal name (admin only)</label>
                <input id="promo-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </div>
            </div>
          </Section>
        </div>

        {/* Package rules */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-wide text-[#0C2340]">What each package gets</h4>
          <p className="mt-1 text-xs text-[#3d5a80]">Customers pay the normal package price. Changes apply to new purchases only.</p>
          <div className="mt-4 divide-y divide-slate-100">
            {rules.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#3d5a80]">No package rules. Check that block time packages exist.</p>
            ) : rules.map((rule, i) => (
              <div key={rule.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-[#0C2340]">{rule.packageHours} hr · {rule.packageName}</p>
                  <p className="text-xs text-[#3d5a80] tabular-nums">
                    {rule.totalPrice.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-[#0C2340]">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80]">Bonus</span>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      value={rule.bonusHours}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setRules((rs) => rs.map((r, j) => (j === i ? { ...r, bonusHours: Number.isFinite(v) ? v : 0 } : r)))
                      }}
                      className="w-20 rounded-lg border border-[#0C2340]/15 px-2 py-1.5 text-sm tabular-nums"
                    />
                    <span className="text-xs text-[#3d5a80]">hrs</span>
                  </label>
                  <label className="ml-auto flex items-center gap-2 text-sm text-[#0C2340]">
                    <input
                      type="checkbox"
                      checked={rule.includesFreeCheckout}
                      onChange={(e) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, includesFreeCheckout: e.target.checked } : r)))}
                      className="h-4 w-4 rounded border-slate-300 text-[#1a4fd6]"
                    />
                    Free checkout
                  </label>
                </div>
                <p className="mt-1.5 text-xs text-[#3d5a80]">
                  Customer gets <strong className="text-[#0C2340]">{rule.packageHours + rule.bonusHours} hours</strong>
                  {rule.includesFreeCheckout ? ' + a free checkout flight' : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-lg bg-[#0C2340] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#152d5a] disabled:opacity-60"
        >
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        {message ? (
          <p className={`text-sm ${message.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`} role="status">{message.text}</p>
        ) : null}
      </div>

      <ConfirmModal
        open={confirmEnd}
        variant="danger"
        isPending={isPending}
        title="End the sale now?"
        description="The banner, sale page and bonus offers disappear straight away. Customers who already bought keep their bonus hours and free checkout."
        confirmLabel="End sale"
        onConfirm={endNow}
        onCancel={() => setConfirmEnd(false)}
      />
    </section>
  )
}
