import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { blockTimeTransferReference } from '@/lib/payments/block-time-bank-transfer'

export const metadata = { title: 'Block Time Purchases | Admin' }
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

const STATUS: Record<string, { label: string; pill: string; dot: string; icon: string }> = {
  pending_review: { label: 'Needs review', pill: 'border-[#f0b429]/60 bg-[#fff7db] text-[#7a4100]', dot: 'bg-[#f59e0b]', icon: 'hourglass_top' },
  resubmission_requested: { label: 'New receipt requested', pill: 'border-[#93c5fd]/70 bg-[#eff6ff] text-[#1d4ed8]', dot: 'bg-[#3b82f6]', icon: 'photo_camera' },
  rejected: { label: 'Rejected', pill: 'border-[#f1b5b0] bg-[#fef2f2] text-[#912018]', dot: 'bg-[#ef4444]', icon: 'cancel' },
  approved: { label: 'Approved', pill: 'border-[#86d39d]/70 bg-[#ecfdf3] text-[#166534]', dot: 'bg-[#22c55e]', icon: 'check_circle' },
}

function StatTile({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-[0_8px_24px_rgba(15,30,52,0.05)]">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <span className="material-symbols-outlined text-[22px]">{icon}</span>
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none tabular-nums text-[#0f2747]">{value}</p>
        <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">{label}</p>
      </div>
    </div>
  )
}

export default async function AdminBlockTimePurchasesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') redirect('/dashboard')

  const { data: rows } = await supabase
    .from('block_time_bank_transfer_submissions')
    .select(`
      id, purchase_id, customer_id, status, submitted_at, reviewed_at,
      purchase:pilot_block_time_purchases ( status, hours_purchased, amount_paid, purchased_at, package:block_time_packages ( name ) )
    `)
    .order('submitted_at', { ascending: false })
    .limit(300)

  const customerIds = Array.from(new Set((rows ?? []).map((r) => r.customer_id)))
  const { data: profiles } = customerIds.length
    ? await supabase.from('profiles').select('id, full_name, email, phone_country_code, phone_number').in('id', customerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; phone_country_code: string | null; phone_number: string | null }[] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  // One row per purchase: its latest submission.
  const latestByPurchase = new Map<string, NonNullable<typeof rows>[number]>()
  for (const row of rows ?? []) {
    if (!latestByPurchase.has(row.purchase_id)) latestByPurchase.set(row.purchase_id, row)
  }
  const items = Array.from(latestByPurchase.values())
  const needsReview = items.filter((r) => r.status === 'pending_review')
  const waitingCustomer = items.filter((r) => r.status === 'resubmission_requested' || r.status === 'rejected')
  const approved = items.filter((r) => r.status === 'approved')
  const others = items.filter((r) => r.status !== 'pending_review')

  const renderRow = (r: (typeof items)[number]) => {
    const purchase = one(r.purchase as any) as {
      status: string
      hours_purchased: number
      amount_paid: number
      purchased_at: string
      package: { name: string } | { name: string }[] | null
    } | null
    const customer = profileById.get(r.customer_id)
    const name = customer?.full_name || customer?.email || 'Customer'
    const st = STATUS[r.status] ?? { label: r.status, pill: 'border-slate-200 bg-slate-50 text-slate-600', dot: 'bg-slate-400', icon: 'help' }
    const urgent = r.status === 'pending_review'

    const phoneDisplay = customer?.phone_number
      ? `${customer.phone_country_code ?? ''} ${customer.phone_number}`.trim()
      : ''
    const callablePhone = customer?.phone_number
      ? `${customer.phone_country_code ?? ''}${customer.phone_number}`.replace(/[^\d+]/g, '')
      : ''

    // Row is a div with a stretched overlay link so the email/phone links can be real
    // <a> tags (nested anchors are invalid HTML).
    return (
      <div
        key={r.purchase_id}
        className={`group relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-white p-4 shadow-[0_8px_24px_rgba(15,30,52,0.05)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(15,30,52,0.10)] sm:flex-row sm:items-center sm:p-5 ${
          urgent ? 'border-[#f0b429]/60' : 'border-[#e2e8f0]'
        }`}
      >
        <Link
          href={`/admin/block-time-purchases/${r.purchase_id}`}
          aria-label={`Review block time purchase for ${name}`}
          className="absolute inset-0 z-0"
        />
        {urgent ? <span className="absolute inset-y-0 left-0 w-1 bg-[#f59e0b]" /> : null}

        <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#152d5a] text-sm font-bold text-white">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[#0f2747]">{name}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-[#64748b]">
              {customer?.email ? (
                <a
                  href={`mailto:${customer.email}`}
                  title={`Send email to ${customer.email}`}
                  className="pointer-events-auto inline-flex min-w-0 items-center gap-1 hover:text-[#1d4ed8] hover:underline"
                >
                  <span className="material-symbols-outlined text-[#D97706]" style={{ fontSize: 14, lineHeight: 1 }}>mail</span>
                  <span className="truncate">{customer.email}</span>
                </a>
              ) : null}
              {callablePhone ? (
                <a
                  href={`tel:${callablePhone}`}
                  title={`Call ${name}`}
                  aria-label={`Call ${name} at ${phoneDisplay}`}
                  className="pointer-events-auto inline-flex items-center gap-1 tabular-nums hover:text-[#1d4ed8] hover:underline"
                >
                  <span className="material-symbols-outlined text-[#0284C7]" style={{ fontSize: 14, lineHeight: 1 }}>call</span>
                  {phoneDisplay}
                </a>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
              <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 font-semibold text-[#334155]">
                {one(purchase?.package as any)?.name ?? 'Block Time'} · {Number(purchase?.hours_purchased ?? 0)}h
              </span>
              <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 font-mono font-semibold text-[#334155]">
                {blockTimeTransferReference(customer?.full_name, r.purchase_id, purchase?.purchased_at)}
              </span>
              <span className="text-[#94a3b8]">· {sydney(r.submitted_at)}</span>
            </div>
          </div>
        </div>

        <div className="pointer-events-none relative z-10 flex items-center justify-between gap-4 border-t border-[#eef2f7] pt-3 sm:min-w-[260px] sm:justify-end sm:border-0 sm:pt-0">
          <p className="text-xl font-bold tabular-nums text-[#0f2747]">{aud(Number(purchase?.amount_paid ?? 0))}</p>
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${st.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
            {st.label}
          </span>
          <span className="material-symbols-outlined hidden text-[20px] text-[#94a3b8] transition-transform group-hover:translate-x-0.5 sm:block">
            chevron_right
          </span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mx-auto max-w-[1100px] space-y-7 px-4 py-6 sm:px-6 md:px-10 md:py-9">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#152d5a] text-white shadow-[0_10px_24px_rgba(21,45,90,0.3)]">
              <span className="material-symbols-outlined text-[26px]">account_balance</span>
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-[#0f2747] sm:text-[28px]">Block Time Purchases</h1>
              <p className="mt-0.5 text-[14px] text-[#64748b]">
                Verify bank transfer receipts. Approving a receipt activates the package.
              </p>
            </div>
          </div>
          {needsReview.length > 0 ? (
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#f0b429]/60 bg-[#fff7db] px-4 py-2 text-[12px] font-bold text-[#7a4100]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#f59e0b]" />
              {needsReview.length} awaiting your review
            </span>
          ) : null}
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile icon="hourglass_top" label="Needs review" value={needsReview.length} tone="bg-[#fff7db] text-[#b45309]" />
          <StatTile icon="mark_email_unread" label="Waiting on customer" value={waitingCustomer.length} tone="bg-[#eff6ff] text-[#1d4ed8]" />
          <StatTile icon="verified" label="Approved" value={approved.length} tone="bg-[#ecfdf3] text-[#15803d]" />
        </div>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#64748b]">
            <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
            Needs review ({needsReview.length})
          </h2>
          {needsReview.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#cbd5e1] bg-white px-6 py-10 text-center">
              <span className="material-symbols-outlined text-[36px] text-[#22c55e]">task_alt</span>
              <p className="mt-2 text-sm font-semibold text-[#0f2747]">All caught up</p>
              <p className="text-[13px] text-[#64748b]">No receipts are waiting for review.</p>
            </div>
          ) : (
            <div className="space-y-3">{needsReview.map(renderRow)}</div>
          )}
        </section>

        {others.length > 0 ? (
          <section>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#64748b]">History</h2>
            <div className="space-y-3">{others.map(renderRow)}</div>
          </section>
        ) : null}
      </div>
    </>
  )
}
