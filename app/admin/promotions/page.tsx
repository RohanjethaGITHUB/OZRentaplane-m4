import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { getPromotionStatus, type PromotionRow } from '@/lib/promotions'
import PromotionSettingsForm, { type AdminPromotionRule } from './PromotionSettingsForm'

export const metadata = { title: 'Promotions | Admin' }
export const dynamic = 'force-dynamic'

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null
}

function sydneyDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' })
}

function aud(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })
}

const CREDIT_PILL: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  used:      'bg-blue-50 text-blue-700 border-blue-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
}

export default async function AdminPromotionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') redirect('/dashboard')

  const { data: promotions } = await supabase
    .from('promotions')
    .select('id, slug, name, is_enabled, starts_at, ends_at, allow_uncleared_purchase, headline, marquee_text, updated_at')
    .order('starts_at', { ascending: false })

  const promo = (promotions?.[0] ?? null) as PromotionRow | null

  if (!promo) {
    return (
      <>
        <AdminPortalHero eyebrow="Sales" title="Promotions" subtitle="Black Friday and other block time offers." />
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
            No promotion is set up yet. Apply database migration <code>115_black_friday_promotion.sql</code> to create the Black Friday promotion.
          </div>
        </div>
      </>
    )
  }

  const [rulesRes, purchasesRes, creditsRes, grantsRes] = await Promise.all([
    supabase
      .from('promotion_package_rules')
      .select('id, package_id, bonus_hours, includes_free_checkout, package:block_time_packages ( name, hours, rate_per_hour, total_price, display_order )')
      .eq('promotion_id', promo.id),
    supabase
      .from('pilot_block_time_purchases')
      .select('id, user_id, status, hours_purchased, bonus_hours, hours_remaining, amount_paid, purchased_at, package:block_time_packages ( name )')
      .eq('promotion_id', promo.id)
      .neq('status', 'pending')
      .order('purchased_at', { ascending: false }),
    supabase
      .from('checkout_credits')
      .select('id, user_id, status, created_at, used_at, used_on_booking_id, cancelled_reason, promotion_id')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('block_time_bonus_grants')
      .select('id, user_id, hours, source, reason, created_at, granted_by')
      .eq('source', 'manual')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  // Customer names for credits/grants (profiles join is not declared on these FKs).
  const userIds = Array.from(new Set([
    ...(creditsRes.data ?? []).map((c) => c.user_id),
    ...(grantsRes.data ?? []).map((g) => g.user_id),
    ...(purchasesRes.data ?? []).map((p: any) => p.user_id),
  ]))
  const { data: people } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const personOf = (id: string) => (people ?? []).find((x) => x.id === id) ?? null
  const nameOf = (id: string) => {
    const p = personOf(id)
    return p?.full_name || p?.email || 'Customer'
  }

  const rules: AdminPromotionRule[] = (rulesRes.data ?? [])
    .map((r: any) => {
      const pkg = one<any>(r.package)
      return {
        id: r.id,
        packageName: pkg?.name ?? 'Package',
        packageHours: Number(pkg?.hours ?? 0),
        totalPrice: Number(pkg?.total_price ?? 0),
        displayOrder: Number(pkg?.display_order ?? 0),
        bonusHours: Number(r.bonus_hours),
        includesFreeCheckout: Boolean(r.includes_free_checkout),
      }
    })
    .sort((a, b) => a.displayOrder - b.displayOrder || a.packageHours - b.packageHours)

  const purchases = (purchasesRes.data ?? []) as any[]
  const credits = (creditsRes.data ?? []) as any[]
  const grants = (grantsRes.data ?? []) as any[]

  const revenue = purchases.filter((p) => p.status !== 'refunded').reduce((s, p) => s + Number(p.amount_paid || 0), 0)
  const bonusGiven = purchases.reduce((s, p) => s + Number(p.bonus_hours || 0), 0)
  const creditsAvailable = credits.filter((c) => c.status === 'available').length
  const creditsUsed = credits.filter((c) => c.status === 'used').length
  const status = getPromotionStatus(promo)

  const csvRows = [
    ['Customer', 'Email', 'Package', 'Paid hours', 'Bonus hours', 'Hours remaining', 'Amount paid', 'Status', 'Purchased (Sydney)'],
    ...purchases.map((p) => {
      return [nameOf(p.user_id), personOf(p.user_id)?.email ?? '', one<any>(p.package)?.name ?? '', p.hours_purchased, p.bonus_hours, p.hours_remaining, p.amount_paid, p.status, sydneyDate(p.purchased_at)]
    }),
  ]
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'))}`

  return (
    <>
      <AdminPortalHero
        eyebrow="Sales"
        title="Promotions"
        subtitle="Switch the Black Friday sale on or off, set its dates, and see what it has sold."
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 space-y-10 pb-24">
        <PromotionSettingsForm promotion={promo} status={status} rules={rules} />

        {/* Summary */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Packages sold', value: String(purchases.length) },
            { label: 'Revenue (incl. GST)', value: aud(revenue) },
            { label: 'Bonus hours given', value: `${bonusGiven.toFixed(1)} h` },
            { label: 'Free checkouts', value: `${creditsUsed} used · ${creditsAvailable} waiting` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80]">{s.label}</p>
              <p className="mt-2 text-2xl font-semibold text-[#0C2340] tabular-nums">{s.value}</p>
            </div>
          ))}
        </section>

        {/* Purchases */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-[#0C2340] tracking-tight">Sale purchases</h3>
            {purchases.length > 0 ? (
              <a href={csvHref} download={`${promo.slug}-purchases.csv`} className="inline-flex items-center gap-1.5 rounded-lg border border-[#0C2340]/15 bg-white px-3 py-2 text-sm font-medium text-[#0C2340] hover:bg-slate-50">
                <span className="material-symbols-outlined text-[18px]">download</span>
                Export CSV
              </a>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-[#f6f9fc] text-left text-xs uppercase tracking-wide text-[#3d5a80]">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3 text-right">Paid h</th>
                  <th className="px-4 py-3 text-right">Bonus h</th>
                  <th className="px-4 py-3 text-right">Remaining</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Purchased</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchases.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-[#3d5a80]">No sale purchases yet.</td></tr>
                ) : purchases.map((p) => {
                  const c = personOf(p.user_id)
                  return (
                    <tr key={p.id} className="text-[#0C2340]">
                      <td className="px-4 py-3">
                        <Link href={`/admin/users/${p.user_id}`} className="font-medium hover:underline">{c?.full_name || nameOf(p.user_id)}</Link>
                        <p className="text-xs text-[#3d5a80]">{c?.email}</p>
                      </td>
                      <td className="px-4 py-3">{one<any>(p.package)?.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{Number(p.hours_purchased)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-700 font-semibold">+{Number(p.bonus_hours)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{Number(p.hours_remaining).toFixed(1)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{aud(Number(p.amount_paid))}</td>
                      <td className="px-4 py-3 capitalize">{p.status}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{sydneyDate(p.purchased_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Credits + manual grants */}
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-[#0C2340] tracking-tight">Free checkout credits</h3>
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
              {credits.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[#3d5a80]">No credits issued yet.</p>
              ) : credits.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <Link href={`/admin/users/${c.user_id}`} className="font-medium text-[#0C2340] hover:underline">{nameOf(c.user_id)}</Link>
                    <p className="text-xs text-[#3d5a80]">
                      Issued {sydneyDate(c.created_at)}
                      {c.used_at ? ` · used ${sydneyDate(c.used_at)}` : ''}
                      {c.cancelled_reason ? ` · ${c.cancelled_reason}` : ''}
                      {!c.promotion_id ? ' · manual' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.used_on_booking_id ? (
                      <Link href={`/admin/bookings/requests/${c.used_on_booking_id}`} className="text-xs font-medium text-[#1a4fd6] hover:underline">Checkout</Link>
                    ) : null}
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${CREDIT_PILL[c.status] ?? CREDIT_PILL.cancelled}`}>{c.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-[#0C2340] tracking-tight">Case-by-case bonus hours</h3>
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
              {grants.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[#3d5a80]">
                  None yet. Add them from a customer&apos;s profile → Billing → Bonus hours &amp; free checkout.
                </p>
              ) : grants.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <Link href={`/admin/users/${g.user_id}`} className="font-medium text-[#0C2340] hover:underline">{nameOf(g.user_id)}</Link>
                    <p className="text-xs text-[#3d5a80]">{g.reason} · {sydneyDate(g.created_at)} · by {nameOf(g.granted_by)}</p>
                  </div>
                  <span className="font-semibold text-amber-700 tabular-nums">+{Number(g.hours)} h</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
