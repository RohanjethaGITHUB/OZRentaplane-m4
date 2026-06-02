import Link from 'next/link'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import StatusPills from './StatusPills'
import {
  AdminDataTable,
  AdminPageHeader,
  AdminStatusBadge,
} from '@/app/admin/components/AdminListView'

type StatusFilter = 'all' | 'new_requests' | 'upcoming' | 'in_progress' | 'awaiting_outcome' | 'payment_required' | 'completed' | 'reschedule' | 'cancelled' | 'no_show'
type SortKey = 'customer' | 'submitted' | 'scheduled' | 'status' | 'outcome' | 'payment'
type SortDir = 'asc' | 'desc'

function getStatusFilter(v?: string): StatusFilter {
  const vals: StatusFilter[] = ['all', 'new_requests', 'upcoming', 'in_progress', 'awaiting_outcome', 'payment_required', 'completed', 'reschedule', 'cancelled', 'no_show']
  const candidate = (v ?? 'all') as StatusFilter
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

export default async function AllCheckoutsPage({ searchParams }: { searchParams: { status?: string; sort?: string; dir?: string; page?: string } }) {
  noStore()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const statusFilter = getStatusFilter(searchParams.status)
  const sort = (searchParams.sort as SortKey | undefined) ?? 'submitted'
  const dir = (searchParams.dir as SortDir | undefined) === 'asc' ? 'asc' : 'desc'
  const pageSize = 10
  const parsedPage = Number(searchParams.page ?? 1)
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, booking_reference, booking_owner_user_id, pic_name, status, scheduled_start, scheduled_end, created_at, updated_at, aircraft ( registration )')
    .eq('booking_type', 'checkout')

  const bookingIds = (bookings ?? []).map((b) => b.id)
  const ownerIds = Array.from(new Set((bookings ?? []).map((b) => b.booking_owner_user_id).filter(Boolean)))

  const [{ data: profiles }, { data: invoices }, { data: outcomeEvents }, { data: rescheduleRequests }] = await Promise.all([
    ownerIds.length ? supabase.from('profiles').select('id, first_name, last_name, full_name, email').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
    bookingIds.length ? supabase.from('checkout_payment_invoices').select('id, booking_id, status, checkout_outcome, payment_method, paid_at, updated_at').in('booking_id', bookingIds) : Promise.resolve({ data: [] as any[] }),
    bookingIds.length ? supabase.from('booking_audit_events').select('booking_id, created_at, new_value').eq('event_type', 'checkout_outcome_recorded').in('booking_id', bookingIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
    bookingIds.length ? supabase.from('checkout_change_requests').select('checkout_request_id, status, created_at').eq('request_type', 'reschedule').in('checkout_request_id', bookingIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
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
  const latestRescheduleByBooking = new Map<string, string>()
  for (const req of rescheduleRequests ?? []) {
    if (!req.checkout_request_id) continue
    if (!latestRescheduleByBooking.has(req.checkout_request_id)) latestRescheduleByBooking.set(req.checkout_request_id, req.status)
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

    const latestRescheduleStatus = latestRescheduleByBooking.get(b.id) ?? null

    if (b.status === 'checkout_requested') { stage = 'new_requests'; statusLabel = 'New Request' }
    else if (b.status === 'no_show') { stage = 'no_show'; statusLabel = 'No Show' }
    else if (latestRescheduleStatus === 'pending' || b.status === 'checkout_reschedule_required') { stage = 'reschedule'; statusLabel = 'Reschedule' }
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

  const filteredBase = enriched

  const statusCounts: Record<StatusFilter, number> = {
    all: filteredBase.length,
    new_requests: 0,
    upcoming: 0,
    in_progress: 0,
    awaiting_outcome: 0,
    payment_required: 0,
    completed: 0,
    reschedule: 0,
    cancelled: 0,
    no_show: 0,
  }
  for (const r of filteredBase) statusCounts[r.stage] += 1

  const rows = filteredBase
    .filter((r) => statusFilter === 'all' || r.stage === statusFilter)
    .sort((a, b) => {
      // Sort by urgency first, then temporal relevance.
      const priority = (s: StatusFilter) => s === 'new_requests' ? 1 : s === 'awaiting_outcome' ? 2 : s === 'payment_required' ? 3 : s === 'reschedule' ? 4 : s === 'no_show' ? 5 : s === 'in_progress' ? 6 : s === 'upcoming' ? 7 : s === 'completed' ? 8 : s === 'cancelled' ? 9 : 10
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
    return `/admin/checkouts/all?status=${statusFilter}&sort=${key}&dir=${nextDir}`
  }
  const sortLabel = (label: string, key: SortKey) => (
    <Link href={sortHref(key)} className="inline-flex items-center gap-1.5">
      {label}
      <span className="material-symbols-outlined text-[14px]">{sort === key ? (dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
    </Link>
  )
  const totalResults = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const showingStart = totalResults === 0 ? 0 : (safePage - 1) * pageSize + 1
  const showingEnd = totalResults === 0 ? 0 : Math.min(safePage * pageSize, totalResults)
  const pageHref = (page: number) => {
    const p = new URLSearchParams()
    if (statusFilter !== 'all') p.set('status', statusFilter)
    if (sort !== 'submitted') p.set('sort', sort)
    if (dir !== 'desc') p.set('dir', dir)
    if (page > 1) p.set('page', String(page))
    const query = p.toString()
    return query ? `/admin/checkouts/all?${query}` : '/admin/checkouts/all'
  }

  const tabs: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'new_requests', label: 'New Requests' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'awaiting_outcome', label: 'Awaiting Outcome' },
    { key: 'payment_required', label: 'Payment Required' },
    { key: 'completed', label: 'Completed' },
    { key: 'reschedule', label: 'Reschedule' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'no_show', label: 'No Show' },
  ]

  return (
    <div>
      <AdminPageHeader
        eyebrow="Checkouts"
        title="All Checkouts"
        subtitle="Operational control view for checkout workflow, outcomes, and payment state."
      />
      <div className="max-w-[1450px] mx-auto px-6 md:px-10 py-12 pb-24 space-y-6">
        <section className="space-y-5">
          <StatusPills tabs={tabs} statusCounts={statusCounts} statusFilter={statusFilter} sort={sort} dir={dir} />
          <div className="hidden md:block">
            <AdminDataTable columns={[sortLabel('Customer', 'customer'), sortLabel('Submitted', 'submitted'), sortLabel('Scheduled', 'scheduled'), sortLabel('Status', 'status'), sortLabel('Outcome', 'outcome'), sortLabel('Payment', 'payment'), '' ]}>
                {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-[var(--admin-text-muted)]">No checkout requests found for this filter.</td></tr>}
                {paginatedRows.map((r, idx) => {
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
                        <Link href={`/admin/bookings/requests/${r.id}`} className="group block hover:text-[#1a4fd6] transition-colors">
                          <p className="text-lg leading-tight font-semibold text-[var(--admin-text)] group-hover:text-[#1a4fd6]">
                            {r.customer}
                          </p>
                          <p className="text-sm text-[var(--admin-text-muted)] mt-1">
                            {r.email}
                          </p>
                        </Link>
                      </td>
                      <td className="px-5 py-[16px] text-[14px] text-[var(--admin-text)]">{new Date(r.submitted).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                      <td className="px-5 py-[16px] text-[14px] text-[var(--admin-text)]">{r.scheduled ? new Date(r.scheduled).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'}</td>
                      <td className="px-5 py-[16px]"><AdminStatusBadge label={r.statusLabel} tone={statusTone} /></td>
                      <td className="px-5 py-[16px]"><AdminStatusBadge label={r.outcomeLabel} tone={outcomeTone} /></td>
                      <td className="px-5 py-[16px]"><AdminStatusBadge label={r.payment} tone={paymentTone} /></td>
                      <td className="px-5 py-[16px] text-right">
                        {r.stage === 'completed' || r.stage === 'cancelled' ? null : r.stage === 'new_requests' || r.stage === 'payment_required' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1a4fd6]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#1a4fd6] animate-pulse" />
                            {action}
                          </span>
                        ) : r.stage === 'awaiting_outcome' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            {action}
                          </span>
                        ) : (
                          <span className="text-[#4b6390] text-xs">{action}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </AdminDataTable>
            <div className="flex items-center justify-between px-2 pt-4">
              <p className="text-[#4b6390] text-sm">Showing {showingStart}-{showingEnd} of {totalResults} results</p>
              <div className="flex items-center gap-2">
                <Link href={pageHref(safePage - 1)} className={`px-4 py-2 rounded-xl border text-sm ${safePage === 1 ? 'opacity-30 pointer-events-none cursor-not-allowed text-[#152d5a]/30 border-[#152d5a]/10' : 'text-[#1a4fd6] border-[#1a4fd6]/30 hover:bg-[#1a4fd6]/5 font-medium'}`}>Prev</Link>
                <Link href={pageHref(safePage + 1)} className={`px-4 py-2 rounded-xl border text-sm ${safePage >= totalPages ? 'opacity-30 pointer-events-none cursor-not-allowed text-[#152d5a]/30 border-[#152d5a]/10' : 'text-[#1a4fd6] border-[#1a4fd6]/30 hover:bg-[#1a4fd6]/5 font-medium'}`}>Next</Link>
              </div>
            </div>
          </div>
          <div className="md:hidden space-y-3">
            {paginatedRows.map((r) => {
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
                <Link key={r.id} href={`/admin/bookings/requests/${r.id}`} className="block bg-white rounded-2xl border border-[#152d5a]/10 shadow-sm overflow-hidden hover:shadow-md hover:border-[#1a4fd6]/20 transition-all">
                  <div className="px-4 pt-4 pb-3">
                    <p className="text-deep-ink font-semibold text-base">{r.customer}</p>
                    <p className="text-[#4b6390] text-sm mt-1">{r.email}</p>
                  </div>
                  <div className="px-4 py-3 border-t border-[#152d5a]/8 space-y-2.5">
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-[9px] uppercase tracking-widest font-semibold text-[#4b6390]">Scheduled</span>
                      <span className="text-right text-sm text-deep-ink">{r.scheduled ? new Date(r.scheduled).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'}</span>
                    </div>
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-[9px] uppercase tracking-widest font-semibold text-[#4b6390]">Status</span>
                      <div className="text-right"><AdminStatusBadge label={r.statusLabel} tone={statusTone} /></div>
                    </div>
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-[9px] uppercase tracking-widest font-semibold text-[#4b6390]">Outcome</span>
                      <div className="text-right"><AdminStatusBadge label={r.outcomeLabel} tone={outcomeTone} /></div>
                    </div>
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-[9px] uppercase tracking-widest font-semibold text-[#4b6390]">Payment</span>
                      <div className="text-right"><AdminStatusBadge label={r.payment} tone={paymentTone} /></div>
                    </div>
                  </div>
                  <div className="border-t border-[#152d5a]/8">
                    <div className="px-4 py-3 flex items-center justify-between text-[#1a4fd6] font-medium text-sm">
                      <span>{action}</span>
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </div>
                  </div>
                </Link>
              )
            })}
            <div className="flex items-center justify-between px-2 pt-4">
              <p className="text-[#4b6390] text-sm">Showing {showingStart}-{showingEnd} of {totalResults} results</p>
              <div className="flex items-center gap-2">
                <Link href={pageHref(safePage - 1)} className={`px-4 py-2 rounded-xl border text-sm ${safePage === 1 ? 'opacity-30 pointer-events-none cursor-not-allowed text-[#152d5a]/30 border-[#152d5a]/10' : 'text-[#1a4fd6] border-[#1a4fd6]/30 hover:bg-[#1a4fd6]/5 font-medium'}`}>Prev</Link>
                <Link href={pageHref(safePage + 1)} className={`px-4 py-2 rounded-xl border text-sm ${safePage >= totalPages ? 'opacity-30 pointer-events-none cursor-not-allowed text-[#152d5a]/30 border-[#152d5a]/10' : 'text-[#1a4fd6] border-[#1a4fd6]/30 hover:bg-[#1a4fd6]/5 font-medium'}`}>Next</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
