import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/formatDateTime'
import AdminPortalHero from '@/components/AdminPortalHero'
import { TabLink } from '@/app/admin/components/AdminUi'
import { deriveBookingStatusForFlightRecord, isAwaitingFlightRecordDue } from '@/lib/booking/flight-record-status'

type SearchParams = { status?: string }
type SortKey = 'customer' | 'email' | 'aircraft' | 'scheduled' | 'status' | 'ref'
type SortDir = 'asc' | 'desc'

type BookingRow = {
  id: string
  booking_reference: string | null
  booking_type: string
  created_at: string
  scheduled_start: string
  scheduled_end: string
  status: string
  pic_name: string | null
  estimated_amount: number | null
  booking_owner_user_id: string
  aircraft: { id: string; registration: string; aircraft_type: string } | { id: string; registration: string; aircraft_type: string }[] | null
  flight_records?: { status: string | null; submitted_at: string | null }[] | null
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  checkout_requested: { label: 'New Request', className: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
  checkout_confirmed: { label: 'Scheduled', className: 'bg-green-500/10 text-green-300 border-green-500/20' },
  checkout_completed_under_review: { label: 'Awaiting Outcome', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  checkout_payment_required: { label: 'Payment Required', className: 'bg-orange-500/10 text-orange-300 border-orange-500/20' },
  pending_confirmation: { label: 'Requested', className: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
  confirmed: { label: 'Upcoming', className: 'bg-green-500/10 text-green-300 border-green-500/20' },
  ready_for_dispatch: { label: 'Upcoming', className: 'bg-green-500/10 text-green-300 border-green-500/20' },
  dispatched: { label: 'In Progress', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  awaiting_flight_record: { label: 'Awaiting Flight Record', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  on_hold_pending_documents: { label: 'On Hold', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  pending_post_flight_review: { label: 'Post-flight Review', className: 'bg-purple-500/10 text-purple-300 border-purple-500/20' },
  payment_pending: { label: 'Payment Pending', className: 'bg-orange-500/10 text-orange-300 border-orange-500/20' },
  completed: { label: 'Completed', className: 'bg-white/5 text-slate-300 border-white/10' },
  cancelled: { label: 'Cancelled', className: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
  no_show: { label: 'No Show', className: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
  cancellation_requested: { label: 'Cancellation Requested', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
}

const LIGHT_STATUS_BADGE: Record<string, string> = {
  checkout_requested: 'bg-[rgba(36,88,197,0.10)] text-[var(--admin-info)] border-[rgba(36,88,197,0.20)]',
  checkout_confirmed: 'bg-[rgba(31,106,67,0.10)] text-[var(--admin-success)] border-[rgba(31,106,67,0.20)]',
  checkout_completed_under_review: 'bg-[rgba(178,106,18,0.12)] text-[var(--admin-warning)] border-[rgba(178,106,18,0.24)]',
  checkout_payment_required: 'bg-[rgba(194,65,12,0.10)] text-[rgb(194,65,12)] border-[rgba(194,65,12,0.22)]',
  pending_confirmation: 'bg-[rgba(36,88,197,0.10)] text-[var(--admin-info)] border-[rgba(36,88,197,0.20)]',
  confirmed: 'bg-[rgba(31,106,67,0.10)] text-[var(--admin-success)] border-[rgba(31,106,67,0.20)]',
  ready_for_dispatch: 'bg-[rgba(31,106,67,0.10)] text-[var(--admin-success)] border-[rgba(31,106,67,0.20)]',
  dispatched: 'bg-[rgba(31,106,67,0.12)] text-[var(--admin-success)] border-[rgba(31,106,67,0.22)]',
  awaiting_flight_record: 'bg-[rgba(178,106,18,0.12)] text-[var(--admin-warning)] border-[rgba(178,106,18,0.24)]',
  on_hold_pending_documents: 'bg-[rgba(178,106,18,0.12)] text-[var(--admin-warning)] border-[rgba(178,106,18,0.24)]',
  pending_post_flight_review: 'bg-[rgba(109,40,217,0.08)] text-[rgb(109,40,217)] border-[rgba(109,40,217,0.18)]',
  payment_pending: 'bg-[rgba(194,65,12,0.10)] text-[rgb(194,65,12)] border-[rgba(194,65,12,0.22)]',
  completed: 'bg-[rgba(100,116,139,0.10)] text-[var(--admin-neutral)] border-[rgba(148,163,184,0.24)]',
  cancelled: 'bg-[rgba(180,65,65,0.10)] text-[var(--admin-danger)] border-[rgba(180,65,65,0.22)]',
  no_show: 'bg-[rgba(180,65,65,0.10)] text-[var(--admin-danger)] border-[rgba(180,65,65,0.22)]',
  cancellation_requested: 'bg-[rgba(178,106,18,0.12)] text-[var(--admin-warning)] border-[rgba(178,106,18,0.24)]',
}

function fullCustomerName(profile: { first_name: string | null; last_name: string | null; full_name: string | null; email: string | null } | undefined, picName: string | null) {
  if (profile?.first_name) return `${profile.first_name} ${profile.last_name ?? ''}`.trim()
  if (profile?.full_name) return profile.full_name
  if (picName) return picName
  return profile?.email ?? 'Customer'
}

function getStatusBadge(
  displayStatus: string,
  appearance: 'default' | 'light-operational',
  options?: { pendingReschedule?: boolean },
) {
  if (options?.pendingReschedule) {
    return appearance === 'light-operational'
      ? {
          label: 'Reschedule Requested',
          className: 'bg-[rgba(178,106,18,0.12)] text-[var(--admin-warning)] border-[rgba(178,106,18,0.24)]',
        }
      : {
          label: 'Reschedule Requested',
          className: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
        }
  }
  const fallbackClassName = appearance === 'light-operational'
    ? 'bg-[rgba(100,116,139,0.10)] text-[var(--admin-neutral)] border-[rgba(148,163,184,0.24)]'
    : 'bg-white/5 text-slate-300 border-white/10'
  const baseBadge = STATUS_BADGE[displayStatus] ?? { label: displayStatus.replace(/_/g, ' '), className: fallbackClassName }
  if (appearance !== 'light-operational') return baseBadge
  return {
    label: baseBadge.label,
    className: LIGHT_STATUS_BADGE[displayStatus] ?? fallbackClassName,
  }
}

export default async function AdminBookingList({
  searchParams,
  bookingTypeFilter,
  pageTitle,
  pageSubtitle,
  basePath,
  hideFilters,
  appearance = 'default',
}: {
  searchParams: SearchParams & { sort?: string; dir?: string }
  bookingTypeFilter: 'checkout' | 'standard' | 'all'
  pageTitle: string
  pageSubtitle: string
  basePath: string
  hideFilters?: boolean
  appearance?: 'default' | 'light-operational'
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const requestedFilter = searchParams.status ?? 'all'
  const sort = (searchParams.sort as SortKey | undefined) ?? 'scheduled'
  const dir = (searchParams.dir as SortDir | undefined) === 'asc' ? 'asc' : 'desc'
  const normalizeStatusFilter = (value: string) => {
    if (bookingTypeFilter !== 'checkout') return value
    const aliasMap: Record<string, string> = {
      new_requests: 'checkout_requested',
      payment_required: 'checkout_payment_required',
      awaiting_outcome: 'checkout_completed_under_review',
    }
    return aliasMap[value] ?? value
  }
  const activeFilter = normalizeStatusFilter(requestedFilter)

  let query = supabase
    .from('bookings')
    .select(`
      id, booking_reference, booking_type, created_at, scheduled_start, scheduled_end, status,
      pic_name, estimated_amount, booking_owner_user_id,
      aircraft ( id, registration, aircraft_type ),
      flight_records ( status, submitted_at )
    `)

  if (activeFilter === 'awaiting_flight_record' && bookingTypeFilter !== 'checkout') {
    query = query
      .in('status', ['confirmed', 'ready_for_dispatch', 'dispatched', 'awaiting_flight_record', 'flight_record_overdue'])
      .lte('scheduled_end', new Date().toISOString())
  } else if (activeFilter !== 'all') {
    query = query.eq('status', activeFilter)
  }
  if (bookingTypeFilter !== 'all') query = query.eq('booking_type', bookingTypeFilter)

  const { data } = await query
  const fetchedBookings = (data ?? []) as BookingRow[]
  const bookings = activeFilter === 'awaiting_flight_record' && bookingTypeFilter !== 'checkout'
    ? fetchedBookings.filter((booking) => isAwaitingFlightRecordDue(booking))
    : fetchedBookings
  if (bookingTypeFilter === 'checkout' && process.env.NODE_ENV !== 'production') {
    console.info('[admin-checkout-list] basePath=%s requestedFilter=%s normalizedFilter=%s resultCount=%d', basePath, requestedFilter, activeFilter, bookings.length)
  }

  const customerIds = Array.from(new Set(bookings.map((b) => b.booking_owner_user_id).filter(Boolean)))
  const profileMap = new Map<string, { first_name: string | null; last_name: string | null; full_name: string | null; email: string | null }>()
  const pendingRescheduleIds = new Set<string>()

  if (customerIds.length > 0) {
    const { data: customerProfiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, full_name, email')
      .in('id', customerIds)

    for (const p of customerProfiles ?? []) {
      profileMap.set(p.id, {
        first_name: p.first_name,
        last_name: p.last_name,
        full_name: p.full_name,
        email: p.email,
      })
    }
  }

  if (bookingTypeFilter === 'checkout' && bookings.length > 0) {
    const { data: pendingRescheduleRows } = await supabase
      .from('checkout_change_requests')
      .select('checkout_request_id')
      .eq('request_type', 'reschedule')
      .eq('status', 'pending')
      .in('checkout_request_id', bookings.map((b) => b.id))

    for (const row of pendingRescheduleRows ?? []) {
      if (row.checkout_request_id) pendingRescheduleIds.add(row.checkout_request_id as string)
    }
  }

  const rows = [...bookings].sort((a, b) => {
    if (basePath.includes('/new-requests')) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (basePath.includes('/upcoming') || basePath.includes('/upcoming-flights')) return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
    if (basePath.includes('/awaiting-outcome')) return new Date(b.scheduled_end).getTime() - new Date(a.scheduled_end).getTime()
    if (basePath.includes('/history')) return new Date(b.scheduled_end).getTime() - new Date(a.scheduled_end).getTime()
    if (basePath.includes('/awaiting-flight-records')) return new Date(a.scheduled_end).getTime() - new Date(b.scheduled_end).getTime()
    return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
  })

  const sortedRows = [...rows].sort((a, b) => {
    const aircraftA = Array.isArray(a.aircraft) ? a.aircraft[0] : a.aircraft
    const aircraftB = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
    const pa = profileMap.get(a.booking_owner_user_id)
    const pb = profileMap.get(b.booking_owner_user_id)
    const va: Record<SortKey, string | number> = {
      customer: fullCustomerName(pa, a.pic_name).toLowerCase(),
      email: (pa?.email ?? '').toLowerCase(),
      aircraft: (aircraftA?.registration ?? '').toLowerCase(),
      scheduled: new Date(a.scheduled_start).getTime(),
      status: (STATUS_BADGE[deriveBookingStatusForFlightRecord(a)]?.label ?? deriveBookingStatusForFlightRecord(a)).toLowerCase(),
      ref: (a.booking_reference ?? a.id).toLowerCase(),
    }
    const vb: Record<SortKey, string | number> = {
      customer: fullCustomerName(pb, b.pic_name).toLowerCase(),
      email: (pb?.email ?? '').toLowerCase(),
      aircraft: (aircraftB?.registration ?? '').toLowerCase(),
      scheduled: new Date(b.scheduled_start).getTime(),
      status: (STATUS_BADGE[deriveBookingStatusForFlightRecord(b)]?.label ?? deriveBookingStatusForFlightRecord(b)).toLowerCase(),
      ref: (b.booking_reference ?? b.id).toLowerCase(),
    }
    const cmp = va[sort] < vb[sort] ? -1 : va[sort] > vb[sort] ? 1 : 0
    return dir === 'asc' ? cmp : -cmp
  })

  const nextDir = (key: SortKey): SortDir => (sort === key && dir === 'asc' ? 'desc' : 'asc')
  const sortHref = (key: SortKey) => `${basePath}?status=${encodeURIComponent(requestedFilter)}&sort=${key}&dir=${nextDir(key)}`
  const sortIcon = (key: SortKey) => (sort === key ? (dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more')

  const checkoutTabs = [
    { label: 'New Requests', value: 'checkout_requested' },
    { label: 'Scheduled', value: 'checkout_confirmed' },
    { label: 'Awaiting Outcome', value: 'checkout_completed_under_review' },
    { label: 'Payment Required', value: 'checkout_payment_required' },
    { label: 'Completed', value: 'completed' },
  ]

  // The manual dispatch step has been removed — nothing sets 'dispatched'
  // anymore, so the queue tabs jump from Upcoming straight to the post-flight
  // states. Legacy 'dispatched' rows still render with their badge under All.
  const standardTabs = [
    { label: 'Upcoming', value: 'confirmed' },
    { label: 'Awaiting Flight Record', value: 'awaiting_flight_record' },
    { label: 'Post-flight Review', value: 'pending_post_flight_review' },
    { label: 'Completed', value: 'completed' },
  ]

  const tabs = bookingTypeFilter === 'checkout' ? checkoutTabs : bookingTypeFilter === 'standard' ? standardTabs : []
  const isLightOperational = appearance === 'light-operational'
  const wrapperClassName = isLightOperational
    ? 'max-w-[1400px] mx-auto px-4 md:px-10 py-6 md:py-7 pb-24'
    : 'max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24'
  const filterStripClassName = isLightOperational
    ? 'rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-4 mb-5 flex flex-wrap gap-2 shadow-[0_10px_26px_rgba(15,30,52,0.08)]'
    : 'rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-4 mb-6 flex flex-wrap gap-2 shadow-[var(--admin-shadow-panel)]'
  const moduleShellClassName = isLightOperational
    ? 'overflow-hidden rounded-2xl border border-[rgba(12,35,64,0.12)] bg-white shadow-[0_10px_26px_rgba(15,30,52,0.08)]'
    : 'overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] shadow-[var(--admin-shadow-panel)]'
  const emptyStateClassName = isLightOperational
    ? 'rounded-2xl border border-[rgba(12,35,64,0.12)] bg-white px-6 py-8 text-center shadow-[0_10px_26px_rgba(15,30,52,0.08)]'
    : 'p-12 text-center text-slate-400 border border-white/10 rounded-2xl bg-white/[0.02]'
  const headerCellClassName = isLightOperational
    ? 'px-4 py-3 text-left text-[11.5px] font-bold uppercase tracking-[0.12em] text-[var(--admin-text-secondary)]'
    : 'px-4 py-3 text-left font-medium'
  const headerActionClassName = isLightOperational
    ? 'inline-flex items-center gap-1.5 text-[var(--admin-text-secondary)] transition-colors hover:text-[var(--admin-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-panel-bg-soft)] rounded-sm'
    : 'inline-flex items-center gap-1.5'
  const desktopHeadClassName = isLightOperational
    ? 'bg-[var(--admin-panel-bg-soft)] text-[var(--admin-text-secondary)] border-b border-[rgba(12,35,64,0.08)]'
    : 'bg-[#111316] text-slate-400'
  const desktopBodyClassName = isLightOperational
    ? 'divide-y divide-[rgba(12,35,64,0.08)]'
    : 'divide-y divide-white/10'
  const rowClassName = isLightOperational
    ? 'text-[var(--admin-text)] hover:bg-[var(--admin-panel-bg-soft)]'
    : 'text-slate-200 hover:bg-white/[0.03]'
  const customerCellClassName = isLightOperational ? 'px-4 py-3.5 text-[14px] font-semibold text-[var(--admin-text)]' : 'px-4 py-3 text-white font-medium'
  const customerLinkClassName = isLightOperational
    ? 'transition-colors hover:text-[var(--admin-accent-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-sm'
    : 'hover:underline hover:text-blue-400 transition-colors'
  const bodyValueClassName = isLightOperational ? 'px-4 py-3.5 text-[13.5px] font-medium text-[var(--admin-text)]' : 'px-4 py-3'
  const emailCellClassName = isLightOperational ? 'px-4 py-3.5 text-[13px] text-[var(--admin-text-secondary)]' : 'px-4 py-3 text-slate-300'
  const refCellClassName = isLightOperational ? 'px-4 py-3.5 text-[13px] text-[var(--admin-text-secondary)]' : 'px-4 py-3 text-slate-400'
  const refLinkClassName = isLightOperational
    ? 'font-mono font-semibold text-[var(--admin-text)] transition-colors hover:text-[var(--admin-accent-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-sm'
    : 'hover:underline hover:text-blue-400 transition-colors font-mono'
  const actionButtonClassName = isLightOperational
    ? 'inline-flex min-h-9 items-center rounded-lg border border-[rgba(26,79,214,0.22)] bg-[rgba(26,79,214,0.08)] px-3 py-1.5 text-[13px] font-semibold text-[var(--admin-accent-blue)] transition-colors hover:bg-[rgba(26,79,214,0.14)] hover:text-[var(--admin-primary-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-white'
    : 'inline-flex items-center rounded-lg border border-blue-400/40 bg-blue-500/15 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-500/25'
  const mobileCardClassName = isLightOperational
    ? 'block rounded-2xl border border-[rgba(12,35,64,0.12)] bg-white p-4 shadow-[0_10px_26px_rgba(15,30,52,0.08)] transition-colors hover:bg-[var(--admin-panel-bg-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-bg)]'
    : 'block rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-4 shadow-[var(--admin-shadow-panel)]'

  return (
    <>
      <AdminPortalHero eyebrow="Operations" title={pageTitle} subtitle={pageSubtitle} />
      <div className={wrapperClassName}>
        {!hideFilters && tabs.length > 0 && (
          <div className={filterStripClassName}>
            {tabs.map((tab) => (
              <TabLink
                key={tab.value}
                active={activeFilter === tab.value}
                href={`${basePath}?status=${tab.value}`}
                label={tab.label}
              />
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <div className={emptyStateClassName}>
            <p className={isLightOperational ? 'text-[15px] font-medium text-[var(--admin-text)]' : 'text-slate-400'}>No records found for this view.</p>
            {isLightOperational ? (
              <p className="mt-2 text-[13px] leading-[1.45] text-[var(--admin-text-secondary)]">
                No upcoming flights currently require dispatch readiness.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className={`hidden lg:block ${moduleShellClassName}`}>
              <table className={`w-full ${isLightOperational ? 'text-[13px]' : 'text-sm'}`}>
                <thead className={desktopHeadClassName}>
                  <tr>
                    <th className={headerCellClassName}><Link href={sortHref('customer')} className={headerActionClassName}>Customer<span className="material-symbols-outlined text-[14px]">{sortIcon('customer')}</span></Link></th>
                    <th className={headerCellClassName}><Link href={sortHref('email')} className={headerActionClassName}>Email<span className="material-symbols-outlined text-[14px]">{sortIcon('email')}</span></Link></th>
                    <th className={headerCellClassName}><Link href={sortHref('aircraft')} className={headerActionClassName}>Aircraft<span className="material-symbols-outlined text-[14px]">{sortIcon('aircraft')}</span></Link></th>
                    <th className={headerCellClassName}><Link href={sortHref('scheduled')} className={headerActionClassName}>Scheduled<span className="material-symbols-outlined text-[14px]">{sortIcon('scheduled')}</span></Link></th>
                    <th className={headerCellClassName}><Link href={sortHref('status')} className={headerActionClassName}>Status<span className="material-symbols-outlined text-[14px]">{sortIcon('status')}</span></Link></th>
                    <th className={headerCellClassName}><Link href={sortHref('ref')} className={headerActionClassName}>Ref<span className="material-symbols-outlined text-[14px]">{sortIcon('ref')}</span></Link></th>
                    <th className={isLightOperational ? 'px-4 py-3 text-right text-[11.5px] font-bold uppercase tracking-[0.12em] text-[var(--admin-text-secondary)]' : 'px-4 py-3 text-right font-medium'}>Action</th>
                  </tr>
                </thead>
                <tbody className={desktopBodyClassName}>
                  {sortedRows.map((booking) => {
                    const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
                    const prof = profileMap.get(booking.booking_owner_user_id)
                    const customerName = fullCustomerName(prof, booking.pic_name)
                    const email = prof?.email ?? '—'
                    const displayStatus = deriveBookingStatusForFlightRecord(booking)
                    const badge = getStatusBadge(displayStatus, appearance, {
                      pendingReschedule: pendingRescheduleIds.has(booking.id),
                    })
                    const actionLabel = pendingRescheduleIds.has(booking.id)
                      ? 'Review Reschedule'
                      : basePath.includes('/awaiting-outcome')
                        ? 'Record Outcome'
                        : basePath.includes('/new-requests')
                          ? 'Review'
                          : 'View'
                    return (
                      <tr key={booking.id} className={rowClassName}>
                        <td className={customerCellClassName}>
                          <Link href={`/admin/users/${booking.booking_owner_user_id}`} className={customerLinkClassName}>
                            {customerName}
                          </Link>
                        </td>
                        <td className={emailCellClassName}>{email}</td>
                        <td className={bodyValueClassName}>{aircraft?.registration ?? 'VH-KZG'}</td>
                        <td className={bodyValueClassName}>{formatDateTime(booking.scheduled_start)}</td>
                        <td className="px-4 py-3.5"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${badge.className}`}>{badge.label}</span></td>
                        <td className={refCellClassName}>
                          <Link href={`/admin/bookings/requests/${booking.id}`} className={refLinkClassName}>
                            {booking.booking_reference || booking.id.slice(0, 8).toUpperCase()}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-right"><Link href={`/admin/bookings/requests/${booking.id}`} className={actionButtonClassName}>{actionLabel}</Link></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden space-y-3">
              {sortedRows.map((booking) => {
                const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
                const prof = profileMap.get(booking.booking_owner_user_id)
                const customerName = fullCustomerName(prof, booking.pic_name)
                const email = prof?.email ?? '—'
                const displayStatus = deriveBookingStatusForFlightRecord(booking)
                const badge = getStatusBadge(displayStatus, appearance, {
                  pendingReschedule: pendingRescheduleIds.has(booking.id),
                })
                return (
                  <div key={booking.id} className={mobileCardClassName}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={isLightOperational ? 'text-[14px] font-semibold text-[var(--admin-text)]' : 'text-white font-medium'}>{customerName}</p>
                        <p className={isLightOperational ? 'mt-1 text-[13px] text-[var(--admin-text-secondary)]' : 'text-xs text-slate-400 mt-1'}>{formatDateTime(booking.scheduled_start)}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${badge.className}`}>{badge.label}</span>
                    </div>
                    <p className={isLightOperational ? 'mt-3 text-[13px] font-medium text-[var(--admin-text)]' : 'text-sm text-slate-300 mt-2'}>
                      {aircraft?.registration ?? 'VH-KZG'}
                    </p>
                    <p className={isLightOperational ? 'mt-1 text-[13px] text-[var(--admin-text-secondary)]' : 'text-xs text-slate-400 mt-1'}>{email}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <Link href={`/admin/bookings/requests/${booking.id}`} className={isLightOperational ? 'font-mono text-[13px] font-semibold text-[var(--admin-text)] transition-colors hover:text-[var(--admin-accent-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-sm' : 'hover:underline hover:text-blue-400 transition-colors font-mono text-slate-300'}>
                        {booking.booking_reference || booking.id.slice(0, 8).toUpperCase()}
                      </Link>
                      <Link href={`/admin/bookings/requests/${booking.id}`} className={actionButtonClassName}>
                        {pendingRescheduleIds.has(booking.id) ? 'Review Reschedule' : 'View'}
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
