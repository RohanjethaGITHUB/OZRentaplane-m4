import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { blockTimeTransferReference } from '@/lib/payments/block-time-bank-transfer'
import { formatBonusHours } from '@/lib/promotions'
import BlockTimeBankTransferReviewPanel from './BlockTimeBankTransferReviewPanel'

export const metadata = { title: 'Block Time Purchase | Admin' }
export const dynamic = 'force-dynamic'

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null
}

function aud(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })
}

function sydney(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' })
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[13px] text-[#64748b]">{label}</dt>
      <dd className={`min-w-0 break-words text-right text-[13.5px] font-semibold text-[#0f2747] ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function Card({ icon, title, children, className = '' }: { icon: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-[0_8px_24px_rgba(15,30,52,0.05)] sm:p-6 ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0f2747]">
        <span className="material-symbols-outlined text-[18px] text-[#1d4ed8]">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

const PURCHASE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending payment', cls: 'border-[#f0b429]/60 bg-[#fff7db] text-[#7a4100]' },
  active: { label: 'Active', cls: 'border-[#86d39d]/70 bg-[#ecfdf3] text-[#166534]' },
  exhausted: { label: 'Used up', cls: 'border-slate-200 bg-slate-50 text-slate-600' },
  expired: { label: 'Expired', cls: 'border-slate-200 bg-slate-50 text-slate-600' },
  refunded: { label: 'Refunded', cls: 'border-[#f1b5b0] bg-[#fef2f2] text-[#912018]' },
}

export default async function AdminBlockTimePurchaseDetailPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') redirect('/dashboard')

  const { data: purchase } = await supabase
    .from('pilot_block_time_purchases')
    .select(`
      id, user_id, status, payment_method, hours_purchased, hours_remaining, bonus_hours, rate_per_hour,
      amount_paid, purchased_at, activated_at, expires_at,
      package:block_time_packages ( name, validity_days )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!purchase) notFound()

  const [{ data: customer }, { data: subRows }, { data: invoice }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone_country_code, phone_number, pilot_arn')
      .eq('id', purchase.user_id)
      .single(),
    supabase
      .from('block_time_bank_transfer_submissions')
      .select('id, status, reference, receipt_storage_path, admin_note, submitted_at, reviewed_at, promo_bonus_hours, promo_free_checkout')
      .eq('purchase_id', id)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('block_time_purchase_id', id)
      .eq('type', 'block_time_purchase')
      .maybeSingle(),
  ])

  const submissions = await Promise.all(
    (subRows ?? []).map(async (sub) => {
      const { data } = await supabase.storage.from('bank_transfer_receipts').createSignedUrl(sub.receipt_storage_path, 3600)
      return {
        ...sub,
        signedReceiptUrl: data?.signedUrl ?? null,
        isPdf: sub.receipt_storage_path.toLowerCase().endsWith('.pdf'),
      }
    }),
  )

  const pkg = one(purchase.package as any) as { name: string; validity_days: number } | null
  const firstReceipt = submissions[submissions.length - 1] ?? null
  const bonusHours = Number(firstReceipt?.promo_bonus_hours ?? 0)
  const freeCheckout = firstReceipt?.promo_free_checkout === true
  // Show the reference the customer actually used if a receipt exists.
  const reference = firstReceipt?.reference || blockTimeTransferReference(customer?.full_name, purchase.id, purchase.purchased_at)
  const hasPendingReview = submissions.some((s) => s.status === 'pending_review')
  const customerName = customer?.full_name || customer?.email || 'Customer'
  const pst = PURCHASE_STATUS[purchase.status] ?? { label: purchase.status, cls: 'border-slate-200 bg-slate-50 text-slate-600' }

  return (
    <>
      <div className="mx-auto max-w-[1180px] space-y-5 px-4 py-6 sm:px-6 md:px-10 md:py-9">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link
              href="/admin/block-time-purchases"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#1d4ed8] hover:underline"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              All block time purchases
            </Link>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#0f2747] sm:text-[28px]">
              Verify bank transfer
            </h1>
            <p className="mt-0.5 text-[14px] text-[#64748b]">
              Check the payment in the bank account, then approve to activate the package.
            </p>
          </div>
          <span className={`w-fit rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] ${pst.cls}`}>
            {pst.label}
          </span>
        </header>

        {/* Summary banner */}
        <section className="relative overflow-hidden rounded-2xl bg-[#0f2747] p-5 text-white shadow-[0_18px_40px_rgba(15,39,71,0.25)] sm:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#f59e0b]/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#fbbf24]">Amount to verify</p>
              <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{aud(Number(purchase.amount_paid))}</p>
              <p className="mt-2 text-[14px] text-white/75">
                {pkg?.name ?? 'Block Time'} · {Number(purchase.hours_purchased)} hours · {aud(Number(purchase.rate_per_hour))}/hr
              </p>
              {bonusHours > 0 || freeCheckout ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {bonusHours > 0 ? (
                    <span className="rounded-full bg-[#fbbf24]/20 px-3 py-1 text-[11px] font-bold text-[#fde68a]">{formatBonusHours(bonusHours)}</span>
                  ) : null}
                  {freeCheckout ? (
                    <span className="rounded-full bg-[#fbbf24]/20 px-3 py-1 text-[11px] font-bold text-[#fde68a]">Free checkout flight</span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">Expected reference</p>
                <p className="font-mono text-lg font-bold tracking-wider">{reference}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
          {/* Review column: first on mobile so the action is above the fold */}
          <div className="order-1 space-y-5 lg:order-2">
            <Card icon="receipt_long" title="Bank transfer receipts">
              <p className="mb-4 text-[13px] leading-relaxed text-[#64748b]">
                Confirm a transfer of <span className="font-semibold text-[#0f2747]">{aud(Number(purchase.amount_paid))}</span> with reference{' '}
                <span className="font-mono font-semibold text-[#0f2747]">{reference}</span> in the bank account before approving.
              </p>
              {submissions.length === 0 ? (
                <div className="flex flex-col items-center rounded-xl border border-dashed border-[#cbd5e1] px-6 py-8 text-center">
                  <span className="material-symbols-outlined text-[32px] text-[#94a3b8]">upload_file</span>
                  <p className="mt-2 text-sm font-semibold text-[#0f2747]">No receipt uploaded yet</p>
                  <p className="text-[13px] text-[#64748b]">You will get an email when the customer uploads one.</p>
                </div>
              ) : (
                <>
                  {purchase.status === 'pending' && !hasPendingReview ? (
                    <p className="mb-4 rounded-lg border border-[#f0b429]/60 bg-[#fff7db] px-3 py-2 text-[13px] text-[#7a4100]">
                      Waiting for the customer to upload a new receipt.
                    </p>
                  ) : null}
                  <BlockTimeBankTransferReviewPanel submissions={submissions} />
                </>
              )}
            </Card>
          </div>

          {/* Details column */}
          <div className="order-2 space-y-5 lg:order-1">
            <Card icon="person" title="Customer">
              <div className="mb-2 flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#152d5a] text-base font-bold text-white">
                  {initials(customerName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[#0f2747]">{customerName}</p>
                  <p className="truncate text-[13px] text-[#64748b]">{customer?.email}</p>
                </div>
              </div>
              <dl className="divide-y divide-[#eef2f7]">
                <Item
                  label="Phone"
                  value={customer?.phone_number ? `${customer.phone_country_code ?? ''} ${customer.phone_number}`.trim() : '—'}
                />
                <Item label="Pilot ARN" value={customer?.pilot_arn || '—'} />
              </dl>
              <Link href={`/admin/users/${purchase.user_id}`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#1d4ed8] hover:underline">
                Open customer profile
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            </Card>

            <Card icon="inventory_2" title="Purchase details">
              <dl className="divide-y divide-[#eef2f7]">
                <Item label="Package" value={pkg?.name ?? 'Block Time'} />
                <Item label="Hours" value={`${Number(purchase.hours_purchased)} hours`} />
                <Item label="Locked rate" value={`${aud(Number(purchase.rate_per_hour))}/hr`} />
                <Item label="Validity" value={`${pkg?.validity_days ?? '—'} days from approval`} />
                <Item label="Reserved" value={sydney(purchase.purchased_at)} />
                {invoice ? <Item label="Invoice" value={invoice.invoice_number} mono /> : null}
              </dl>

              {purchase.status === 'active' ? (
                <p className="mt-3 rounded-lg border border-[#86d39d] bg-[#ecfdf3] px-3 py-2 text-[13px] leading-relaxed text-[#166534]">
                  Active — {Number(purchase.hours_remaining).toFixed(1)} hours remaining, expires {sydney(purchase.expires_at)}. Refunds for bank transfer purchases must be paid back manually.
                </p>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
