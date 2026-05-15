import Link from 'next/link'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import CheckoutFilters from './CheckoutFilters'
import {
  AdminDataTable,
  AdminMetricCard,
  AdminMetricGrid,
  AdminPageHeader,
  AdminRowActionButton,
  AdminStatusBadge,
} from '@/app/admin/components/AdminListView'

type StatusFilter = 'all' | 'new_requests' | 'upcoming' | 'in_progress' | 'awaiting_outcome' | 'payment_required' | 'completed' | 'cancelled'
type OutcomeFilter = 'all' | 'cleared_to_fly' | 'additional_checkout_required' | 'checkout_reschedule_required' | 'not_currently_eligible' | 'none'
type PaymentFilter = 'all' | 'payment_required' | 'manual_review' | 'pending' | 'paid' | 'waived' | 'refunded' | 'cancelled' | 'no_record' | 'no_needed'
type SortKey = 'customer' | 'submitted' | 'scheduled' | 'status' | 'outcome' | 'payment'
type SortDir = 'asc' | 'desc'

function getStatusFilter(v?: string): StatusFilter {
  const vals: StatusFilter[] = ['all', 'new_requests', 'upcoming', 'in_progress', 'awaiting_outcome', 'payment_required', 'completed', 'cancelled']
  const candidate = (v ?? 'all') as StatusFilter
  return vals.includes(candidate) ? candidate : 'all'
}
function getOutcomeFilter(v?: string): OutcomeFilter {
  const vals: OutcomeFilter[] = ['all', 'cleared_to_fly', 'additional_checkout_required', 'checkout_reschedule_required', 'not_currently_eligible', 'none']
  const candidate = (v ?? 'all') as OutcomeFilter
  return vals.includes(candidate) ? candidate : 'all'
}
function getPaymentFilter(v?: string): PaymentFilter {
  const vals: PaymentFilter[] = ['all', 'payment_required', 'manual_review', 'pending', 'paid', 'waived', 'refunded', 'cancelled', 'no_record', 'no_needed']
  const candidate = (v ?? 'all') as PaymentFilter
  return vals.includes(candidate) ? candidate : 'all'
}

function outcomeLabel(v: string | null): string {
  if (!v) return 'No outcome yet'
  if (v === 'cleared_to_fly') return 'Cleared to Fly'
  if (v === 'additional_checkout_required') return 'Additional Checkout Required'
  if (v === 'checkout_reschedule_required') return 'Checkout Reschedule Required'
  if (v === 'not_currently_eligible') return 'Not Currently Eligible'
  return v.replace(/_/g, ' ')
}

function fullName(p: { first_name: string | null; last_name: string | null; full_name: string | null; email: string | null } | undefined, picName: string | null) {
  if (p?.first_name) return `${p.first_name} ${p.last_name ?? ''}`.trim()
  if (p?.full_name) return p.full_name
  if (picName) return picName
  return p?.email ?? 'Customer'
}

export const metadata = { title: 'All Checkouts | Admin' }
export const dynamic = 'force-dynamic'

export default async function AllCheckoutsPage({ searchParams }: { searchParams: { status?: string; outcome?: string; payment?: string; sort?: string; dir?: string } }) {
  noStore()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const statusFilter = getStatusFilter(searchParams.status)
  const outcomeFilter = getOutcomeFilter(searchParams.outcome)
  const paymentFilter = getPaymentFilter(searchParams.payment)
  const sort = (searchParams.sort as SortKey | undefined) ?? 'submitted'
  const dir = (searchParams.dir as SortDir | undefined) === 'asc' ? 'asc' : 'desc'

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, booking_reference, booking_owner_user_id, pic_name, status, scheduled_start, scheduled_end, created_at, updated_at, aircraft ( registration )')
    .eq('booking_type', 'checkout')

  const bookingIds = (bookings ?? []).map((b) => b.id)
  const ownerIds = Array.from(new Set((bookings ?? []).map((b) => b.booking_owner_user_id).filter(Boolean)))

  const [{ data: profiles }, { data: invoices }, { data: outcomeEvents }] = await Promise.all([
    ownerIds.length ? supabase.from('profiles').select('id, first_name, last_name, full_name, email').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
    bookingIds.length ? supabase.from('checkout_payment_invoices').select('id, booking_id, status, checkout_outcome, payment_method, paid_at, updated_at').in('booking_id', bookingIds) : Promise.resolve({ data: [] as any[] }),
    bookingIds.length ? supabase.from('booking_audit_events').select('booking_id, created_at, new_value').eq('event_type', 'checkout_outcome_recorded').in('booking_id', bookingIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
  ])

  const invoiceIds = (invoices ?? []).map((i) => i.id)
  const { data: manualSubs } = invoiceIds.length
    ? await supabase.from('checkout_bank_transfer_submissions').select('invoice_id, status').in('invoice_id', invoiceIds)
    : { data: [] as any[] }

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const invoiceByBooking = new Map<string, any>()
  for (const inv of invoices ?? []) {
    const prev = invoiceByBooking.get(inv.booking_id)
    if (!prev || new Date(inv.updated_at ?? 0).getTime() > new Date(prev.updated_at ?? 0).getTime()) invoiceByBooking.set(inv.booking_id, inv)
  }
  const outcomeByBooking = new Map<string, { outcome: string; recordedAt: string }>()
  for (const event of outcomeEvents ?? []) {
    if (!event.booking_id) continue
    const outcome = typeof event.new_value?.outcome === 'string' ? event.new_value.outcome : null
    if (!outcome) continue
    if (!outcomeByBooking.has(event.booking_id)) outcomeByBooking.set(event.booking_id, { outcome, recordedAt: event.created_at })
  }

  const manualByInvoice = new Map<string, string>()
  for (const m of manualSubs ?? []) {
    if (m.status === 'pending_review') manualByInvoice.set(m.invoice_id, m.status)
  }

  const now = new Date()

  const enriched = (bookings ?? []).map((b) => {
    const inv = invoiceByBooking.get(b.id)
    const outcomeEvent = outcomeByBooking.get(b.id)
    const outcome = outcomeEvent?.outcome ?? inv?.checkout_outcome ?? null
    const outcomeAt = outcomeEvent?.recordedAt ?? null
    const start = b.scheduled_start ? new Date(b.scheduled_start) : null
    const end = b.scheduled_end ? new Date(b.scheduled_end) : null

    let stage: StatusFilter = 'all'
    let statusLabel = b.status.replace(/_/g, ' ')

    if (b.status === 'checkout_requested') { stage = 'new_requests'; statusLabel = 'New Request' }
    else if (b.status === 'checkout_payment_required') { stage = 'payment_required'; statusLabel = 'Payment Required' }
    else if (b.status === 'checkout_completed_under_review') { stage = 'awaiting_outcome'; statusLabel = 'Awaiting Outcome' }
    else if (b.status === 'cancelled') { stage = 'cancelled'; statusLabel = 'Cancelled' }
    else if (outcome || b.status === 'completed') { stage = 'completed'; statusLabel = 'Completed' }
    else if (start && end && now >= start && now <= end) { stage = 'in_progress'; statusLabel = 'In Progress' }
    else if (start && now < start) { stage = 'upcoming'; statusLabel = 'Upcoming' }
    else if (start && end && now > end) { stage = 'awaiting_outcome'; statusLabel = 'Awaiting Outcome' }

    let payment = 'No Payment Record'
    if (inv?.status) payment = inv.status.replace(/_/g, ' ')
    if (inv?.id && manualByInvoice.has(inv.id)) payment = 'Manual Review'
    if (!inv && outcome && stage === 'completed') payment = 'No Payment Needed'
    if (!inv && stage !== 'completed' && stage !== 'cancelled') payment = 'No Payment Record'
    if (!inv && stage === 'cancelled') payment = '-'

    const owner = profileMap.get(b.booking_owner_user_id)
    const customer = fullName(owner, b.pic_name)
    const email = owner?.email ?? '-'

    return {
      id: b.id,
      bookingRef: b.booking_reference ?? b.id.slice(0, 8).toUpperCase(),
      customer,
      email,
      submitted: b.created_at,
      scheduled: b.scheduled_start,
      stage,
      statusLabel,
      outcome,
      outcomeLabel: outcome ? outcomeLabel(outcome) : (stage === 'completed' ? 'Not recorded' : 'No outcome yet'),
      payment,
      updatedAt: b.updated_at,
    }
  })

  const filteredBase = enriched.filter((r) => {
    if (outcomeFilter !== 'all') {
      if (outcomeFilter === 'none' && r.outcome) return false
      if (outcomeFilter !== 'none' && r.outcome !== outcomeFilter) return false
    }

    if (paymentFilter !== 'all') {
      const payNorm = r.payment.toLowerCase().replace(/\s+/g, '_')
      if (paymentFilter === 'no_record' && payNorm !== 'no_payment_record') return false
      else if (paymentFilter === 'no_needed' && payNorm !== 'no_payment_needed') return false
      else if (!['no_record', 'no_needed'].includes(paymentFilter) && payNorm !== paymentFilter) return false
    }

    return true
  })

  const statusCounts: Record<StatusFilter, number> = {
    all: filteredBase.length,
    new_requests: 0,
    upcoming: 0,
    in_progress: 0,
    awaiting_outcome: 0,
    payment_required: 0,
    completed: 0,
    cancelled: 0,
  }
  for (const r of filteredBase) statusCounts[r.stage] += 1

  const rows = filteredBase
    .filter((r) => statusFilter === 'all' || r.stage === statusFilter)
    .sort((a, b) => {
      // Sort by urgency first, then temporal relevance.
      const priority = (s: StatusFilter) => s === 'new_requests' ? 1 : s === 'awaiting_outcome' ? 2 : s === 'payment_required' ? 3 : s === 'in_progress' ? 4 : s === 'upcoming' ? 5 : s === 'completed' ? 6 : s === 'cancelled' ? 7 : 8
      const pa = priority(a.stage)
      const pb = priority(b.stage)
      if (pa !== pb) return pa - pb
      if (a.stage === 'upcoming') return new Date(a.scheduled ?? 0).getTime() - new Date(b.scheduled ?? 0).getTime()
      if (a.stage === 'completed' || a.stage === 'cancelled') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      return new Date(b.submitted).getTime() - new Date(a.submitted).getTime()
    })
  const sortedRows = [...rows].sort((a, b) => {
    const va: Record<SortKey, string | number> = {
      customer: a.customer.toLowerCase(),
      submitted: new Date(a.submitted).getTime(),
      scheduled: new Date(a.scheduled ?? 0).getTime(),
      status: a.statusLabel.toLowerCase(),
      outcome: a.outcomeLabel.toLowerCase(),
      payment: a.payment.toLowerCase(),
    }
    const vb: Record<SortKey, string | number> = {
      customer: b.customer.toLowerCase(),
      submitted: new Date(b.submitted).getTime(),
      scheduled: new Date(b.scheduled ?? 0).getTime(),
      status: b.statusLabel.toLowerCase(),
      outcome: b.outcomeLabel.toLowerCase(),
      payment: b.payment.toLowerCase(),
    }
    const cmp = va[sort] < vb[sort] ? -1 : va[sort] > vb[sort] ? 1 : 0
    return dir === 'asc' ? cmp : -cmp
  })
  const sortHref = (key: SortKey) => {
    const nextDir = sort === key && dir === 'asc' ? 'desc' : 'asc'
    return `/admin/checkouts/all?status=${statusFilter}&outcome=${outcomeFilter}&payment=${paymentFilter}&sort=${key}&dir=${nextDir}`
  }
  const sortLabel = (label: string, key: SortKey) => (
    <Link href={sortHref(key)} className="inline-flex items-center gap-1.5">
      {label}
      <span className="material-symbols-outlined text-[14px]">{sort === key ? (dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
    </Link>
  )

  const tabs: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'new_requests', label: 'New Requests' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'awaiting_outcome', label: 'Awaiting Outcome' },
    { key: 'payment_required', label: 'Payment Required' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ]

  const summary = {
    total: rows.length,
    needsAction: rows.filter((r) => ['new_requests', 'awaiting_outcome', 'payment_required'].includes(r.stage)).length,
    paymentRequired: rows.filter((r) => r.stage === 'payment_required' || r.payment === 'Manual Review').length,
    awaitingOutcome: rows.filter((r) => r.stage === 'awaiting_outcome').length,
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Checkouts"
        title="All Checkouts"
        subtitle="Operational control view for checkout workflow, outcomes, and payment state."
      />
      <div className="max-w-[1450px] mx-auto px-6 md:px-10 py-12 pb-24 space-y-7">
        <AdminMetricGrid>
          <AdminMetricCard label="Total checkouts" value={summary.total} />
          <AdminMetricCard label="Needs action" value={summary.needsAction} tone="warning" />
          <AdminMetricCard label="Payment required" value={summary.paymentRequired} />
          <AdminMetricCard label="Awaiting outcome" value={summary.awaitingOutcome} />
        </AdminMetricGrid>

        <Suspense fallback={null}>
          <CheckoutFilters
            status={statusFilter}
            outcome={outcomeFilter}
            payment={paymentFilter}
            tabs={tabs}
            statusCounts={statusCounts}
          />
        </Suspense>

        <section className="space-y-4">
          <div>
            <h2 className="text-[2rem] leading-none font-semibold text-[var(--admin-text)]">Checkout requests</h2>
            <p className="text-[1.02rem] text-[var(--admin-text-muted)] mt-2">Showing {tabs.find((t) => t.key === statusFilter)?.label ?? 'All'} ({rows.length})</p>
          </div>
          <AdminDataTable columns={[sortLabel('Customer', 'customer'), sortLabel('Submitted', 'submitted'), sortLabel('Scheduled', 'scheduled'), sortLabel('Status', 'status'), sortLabel('Outcome', 'outcome'), sortLabel('Payment', 'payment'), 'Action']}>
              {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-[var(--admin-text-muted)]">No checkout requests found for this filter.</td></tr>}
              {sortedRows.map((r, idx) => {
                const action = r.stage === 'new_requests' ? 'Review Request' : r.stage === 'awaiting_outcome' ? 'Record Outcome' : r.stage === 'payment_required' ? 'Review Payment' : r.stage === 'cancelled' || r.stage === 'completed' ? 'View Details' : 'View Checkout'
                const pay = r.payment.toLowerCase()
                const statusTone = r.stage === 'new_requests'
                  ? 'blue'
                  : r.stage === 'awaiting_outcome'
                  ? 'amber'
                  : r.stage === 'payment_required'
                  ? 'orange'
                  : r.stage === 'completed'
                  ? 'emerald'
                  : r.stage === 'cancelled'
                  ? 'red'
                  : 'slate'
                const outcomeTone = r.outcomeLabel.includes('Cleared')
                  ? 'emerald'
                  : r.outcomeLabel.includes('Additional') || r.outcomeLabel.includes('Reschedule')
                  ? 'amber'
                  : r.outcomeLabel.includes('Not Currently')
                  ? 'red'
                  : 'slate'
                const paymentTone = pay.includes('paid')
                  ? 'emerald'
                  : pay.includes('required')
                  ? 'orange'
                  : pay.includes('manual') || pay.includes('pending')
                  ? 'amber'
                  : pay.includes('refund') || pay.includes('cancel')
                  ? 'red'
                  : 'slate'

                return (
                  <tr key={r.id} className={`${idx % 2 === 0 ? 'bg-transparent' : 'bg-transparent'} border-t border-[var(--admin-divider)] hover:bg-[var(--admin-row-hover)] transition-colors`}> 
                    <td className="px-5 py-[16px]">
                      <p className="text-lg leading-tight font-semibold text-[var(--admin-text)]">{r.customer}</p>
                      <p className="text-sm text-[var(--admin-text-muted)] mt-1">{r.email}</p>
                    </td>
                    <td className="px-5 py-[16px] text-[14px] text-[var(--admin-text)]">{new Date(r.submitted).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td className="px-5 py-[16px] text-[14px] text-[var(--admin-text)]">{r.scheduled ? new Date(r.scheduled).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'}</td>
                    <td className="px-5 py-[16px]"><AdminStatusBadge label={r.statusLabel} tone={statusTone} /></td>
                    <td className="px-5 py-[16px]"><AdminStatusBadge label={r.outcomeLabel} tone={outcomeTone} /></td>
                    <td className="px-5 py-[16px]"><AdminStatusBadge label={r.payment} tone={paymentTone} /></td>
                    <td className="px-5 py-[16px] text-right"><AdminRowActionButton href={`/admin/bookings/requests/${r.id}`} label={action} /></td>
                  </tr>
                )
              })}
          </AdminDataTable>
        </section>
      </div>
    </div>
  )
}
