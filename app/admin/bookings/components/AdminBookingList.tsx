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

function fullCustomerName(profile: { first_name: string | null; last_name: string | null; full_name: string | null; email: string | null } | undefined, picName: string | null) {
  if (profile?.first_name) return `${profile.first_name} ${profile.last_name ?? ''}`.trim()
  if (profile?.full_name) return profile.full_name
  if (picName) return picName
  return profile?.email ?? 'Customer'
}

export default async function AdminBookingList({
  searchParams,
  bookingTypeFilter,
  pageTitle,
  pageSubtitle,
  basePath,
  hideFilters,
}: {
  searchParams: SearchParams & { sort?: string; dir?: string }
  bookingTypeFilter: 'checkout' | 'standard' | 'all'
  pageTitle: string
  pageSubtitle: string
  basePath: string
  hideFilters?: boolean
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

  const standardTabs = [
    { label: 'Upcoming', value: 'confirmed' },
    { label: 'In Progress', value: 'dispatched' },
    { label: 'Awaiting Flight Record', value: 'awaiting_flight_record' },
    { label: 'Post-flight Review', value: 'pending_post_flight_review' },
    { label: 'Completed', value: 'completed' },
  ]

  const tabs = bookingTypeFilter === 'checkout' ? checkoutTabs : bookingTypeFilter === 'standard' ? standardTabs : []

  return (
    <>
      <AdminPortalHero eyebrow="Operations" title={pageTitle} subtitle={pageSubtitle} />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">
        {!hideFilters && tabs.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-6 flex flex-wrap gap-2">
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
          <div className="p-12 text-center text-slate-400 border border-white/10 rounded-2xl bg-white/[0.02]">No records found for this view.</div>
        ) : (
          <>
            <div className="hidden lg:block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
              <table className="w-full text-sm">
                <thead className="bg-[#111316] text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium"><Link href={sortHref('customer')} className="inline-flex items-center gap-1.5">Customer<span className="material-symbols-outlined text-[14px]">{sortIcon('customer')}</span></Link></th>
                    <th className="px-4 py-3 text-left font-medium"><Link href={sortHref('email')} className="inline-flex items-center gap-1.5">Email<span className="material-symbols-outlined text-[14px]">{sortIcon('email')}</span></Link></th>
                    <th className="px-4 py-3 text-left font-medium"><Link href={sortHref('aircraft')} className="inline-flex items-center gap-1.5">Aircraft<span className="material-symbols-outlined text-[14px]">{sortIcon('aircraft')}</span></Link></th>
                    <th className="px-4 py-3 text-left font-medium"><Link href={sortHref('scheduled')} className="inline-flex items-center gap-1.5">Scheduled<span className="material-symbols-outlined text-[14px]">{sortIcon('scheduled')}</span></Link></th>
                    <th className="px-4 py-3 text-left font-medium"><Link href={sortHref('status')} className="inline-flex items-center gap-1.5">Status<span className="material-symbols-outlined text-[14px]">{sortIcon('status')}</span></Link></th>
                    <th className="px-4 py-3 text-left font-medium"><Link href={sortHref('ref')} className="inline-flex items-center gap-1.5">Ref<span className="material-symbols-outlined text-[14px]">{sortIcon('ref')}</span></Link></th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {sortedRows.map((booking) => {
                    const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
                    const prof = profileMap.get(booking.booking_owner_user_id)
                    const customerName = fullCustomerName(prof, booking.pic_name)
                    const email = prof?.email ?? '—'
                    const displayStatus = deriveBookingStatusForFlightRecord(booking)
                    const badge = STATUS_BADGE[displayStatus] ?? { label: displayStatus.replace(/_/g, ' '), className: 'bg-white/5 text-slate-300 border-white/10' }
                    const actionLabel = basePath.includes('/awaiting-outcome') ? 'Record Outcome' : basePath.includes('/new-requests') ? 'Review' : 'View'
                    return (
                      <tr key={booking.id} className="text-slate-200 hover:bg-white/[0.03]">
                        <td className="px-4 py-3 text-white font-medium">{customerName}</td>
                        <td className="px-4 py-3 text-slate-300">{email}</td>
                        <td className="px-4 py-3">{aircraft?.registration ?? 'VH-KZG'}</td>
                        <td className="px-4 py-3">{formatDateTime(booking.scheduled_start)}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs border ${badge.className}`}>{badge.label}</span></td>
                        <td className="px-4 py-3 text-slate-400">{booking.booking_reference || booking.id.slice(0, 8).toUpperCase()}</td>
                        <td className="px-4 py-3 text-right"><Link href={`/admin/bookings/requests/${booking.id}`} className="inline-flex items-center rounded-lg border border-blue-400/40 bg-blue-500/15 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-500/25">{actionLabel}</Link></td>
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
                const badge = STATUS_BADGE[displayStatus] ?? { label: displayStatus.replace(/_/g, ' '), className: 'bg-white/5 text-slate-300 border-white/10' }
                return (
                  <Link key={booking.id} href={`/admin/bookings/requests/${booking.id}`} className="block rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white font-medium">{customerName}</p>
                      <span className={`px-2 py-1 rounded-full text-[11px] border ${badge.className}`}>{badge.label}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{email}</p>
                    <p className="text-sm text-slate-300 mt-2">{aircraft?.registration ?? 'VH-KZG'} · {formatDateTime(booking.scheduled_start)}</p>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
