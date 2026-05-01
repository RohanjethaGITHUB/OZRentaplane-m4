import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PendingBookingActions from '../requests/PendingBookingActions'
import { formatDateTime } from '@/lib/formatDateTime'
import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Booking Requests | Admin' }

// ── Status display ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  // Checkout lifecycle
  checkout_requested:              { label: 'New Checkout Request',     className: 'bg-blue-500/10 text-blue-400 border-blue-500/20'      },
  checkout_confirmed:              { label: 'Checkout Confirmed',       className: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  checkout_completed_under_review: { label: 'Awaiting Checkout Outcome',className: 'bg-amber-500/10 text-amber-400 border-amber-500/20'   },
  checkout_payment_required:       { label: 'Payment Required',         className: 'bg-orange-500/10 text-orange-400 border-orange-500/20'},
  // Standard lifecycle
  pending_confirmation:            { label: 'New Booking Request',      className: 'bg-blue-500/10 text-blue-400 border-blue-500/20'      },
  confirmed:                       { label: 'Confirmed',                className: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  ready_for_dispatch:              { label: 'Ready for Dispatch',       className: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  dispatched:                      { label: 'Dispatched',               className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  awaiting_flight_record:          { label: 'Awaiting Flight Record',   className: 'bg-amber-500/10 text-amber-400 border-amber-500/20'   },
  flight_record_overdue:           { label: 'Record Overdue',           className: 'bg-red-500/10 text-red-400 border-red-500/20'         },
  pending_post_flight_review:      { label: 'Post-Flight Review',       className: 'bg-purple-500/10 text-purple-400 border-purple-500/20'},
  needs_clarification:             { label: 'Clarification Needed',     className: 'bg-orange-500/10 text-orange-400 border-orange-500/20'},
  post_flight_approved:            { label: 'Approved',                 className: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  cancelled:                       { label: 'Cancelled',                className: 'bg-rose-500/10 text-rose-400 border-rose-500/20'      },
  no_show:                         { label: 'No Show',                  className: 'bg-rose-500/10 text-rose-400 border-rose-500/20'      },
  completed:                       { label: 'Completed',                className: 'bg-white/5 text-slate-400 border-white/10'            },
}

const BOOKING_TYPE_META: Record<string, { label: string; className: string }> = {
  checkout: { label: 'Checkout Flight',           className: 'bg-blue-500/10 text-blue-400 border-blue-500/20'   },
  standard: { label: 'Standard Aircraft Booking', className: 'bg-white/5 text-slate-400 border-white/10'         },
}

// ── Filter tab definitions ────────────────────────────────────────────────────

type FilterTab = { label: string; value: string; group?: string }

const FILTER_TABS: FilterTab[] = [
  { label: 'All',                value: 'all' },
  // Checkout group
  { label: 'New Requests',       value: 'checkout_requested',              group: 'Checkout Flights' },
  { label: 'Confirmed',          value: 'checkout_confirmed',              group: 'Checkout Flights' },
  { label: 'Awaiting Outcome',   value: 'checkout_completed_under_review', group: 'Checkout Flights' },
  { label: 'Payment Required',   value: 'checkout_payment_required',       group: 'Checkout Flights' },
  // Standard group
  { label: 'New Requests',       value: 'pending_confirmation',            group: 'Standard Bookings' },
  { label: 'Confirmed',          value: 'confirmed',                       group: 'Standard Bookings' },
  { label: 'Awaiting Records',   value: 'awaiting_flight_record',          group: 'Standard Bookings' },
  { label: 'Post-Flight Reviews',value: 'pending_post_flight_review',      group: 'Standard Bookings' },
]

const CHECKOUT_STATUSES = [
  'checkout_requested',
  'checkout_confirmed',
  'checkout_completed_under_review',
  'checkout_payment_required',
]

type SearchParams = { status?: string }

export default async function AdminBookingList({
  searchParams,
  bookingTypeFilter,
  pageTitle,
  pageSubtitle,
  basePath,
  hideFilters,
}: {
  searchParams: SearchParams
  bookingTypeFilter: 'checkout' | 'standard' | 'all'
  pageTitle: string
  pageSubtitle: string
  basePath: string
  hideFilters?: boolean
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const activeFilter = searchParams.status ?? 'all'

  let query = supabase
    .from('bookings')
    .select(`
      id,
      booking_reference,
      booking_type,
      created_at,
      scheduled_start,
      scheduled_end,
      status,
      pic_name,
      pic_arn,
      estimated_hours,
      estimated_amount,
      customer_notes,
      booking_owner_user_id,
      aircraft ( id, registration, aircraft_type )
    `)
    .order('created_at', { ascending: false })

  if (activeFilter !== 'all') {
    query = query.eq('status', activeFilter)
  }

  if (bookingTypeFilter !== 'all') {
    query = query.eq('booking_type', bookingTypeFilter)
  }

  const { data: bookings, error: bookingsError } = await query
  if (bookingsError) console.error('[AdminBookingRequestsPage] bookings query error:', bookingsError)

  // Fetch customer profiles for all booking owners
  const authorIds = Array.from(new Set((bookings ?? []).map(b => b.booking_owner_user_id)))

  // Fetch invoice IDs for bookings that are checkout_payment_required (for bank transfer badge)
  const paymentRequiredBookingIds = (bookings ?? [])
    .filter(b => b.status === 'checkout_payment_required')
    .map(b => b.id)
  let bankTransferPendingBookingIds = new Set<string>()
  if (paymentRequiredBookingIds.length > 0) {
    const { data: invoiceRows } = await supabase
      .from('checkout_invoices')
      .select('id, booking_id')
      .in('booking_id', paymentRequiredBookingIds)
    if (invoiceRows && invoiceRows.length > 0) {
      const invoiceIds = invoiceRows.map(r => r.id)
      const invoiceBookingMap = Object.fromEntries(invoiceRows.map(r => [r.id, r.booking_id]))
      const { data: pendingSubs } = await supabase
        .from('checkout_bank_transfer_submissions')
        .select('invoice_id')
        .in('invoice_id', invoiceIds)
        .eq('status', 'pending_review')
      for (const sub of pendingSubs ?? []) {
        const bookingId = invoiceBookingMap[sub.invoice_id]
        if (bookingId) bankTransferPendingBookingIds.add(bookingId)
      }
    }
  }
  let profilesData: {
    id: string
    full_name: string | null
    email: string | null
    pilot_clearance_status: string | null
  }[] = []
  if (authorIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, pilot_clearance_status')
      .in('id', authorIds)
    if (data) profilesData = data
  }

  const getProfile = (id: string) => profilesData.find(p => p.id === id)

  // Group FILTER_TABS into sections
  const checkoutTabs = FILTER_TABS.filter(t => t.group === 'Checkout Flights')
  const standardTabs = FILTER_TABS.filter(t => t.group === 'Standard Bookings')

  const filterLinkClass = (value: string) =>
    `px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors border whitespace-nowrap ${
      activeFilter === value
        ? 'bg-[#a7c8ff]/10 border-[#a7c8ff]/30 text-[#a7c8ff]'
        : 'border-white/10 text-white/30 hover:text-white/60 hover:border-white/20'
    }`

  return (
    <>
      <AdminPortalHero
        eyebrow="Booking Operations"
        title={pageTitle}
        subtitle={pageSubtitle}
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">

        {/* ── Filter area ─────────────────────────────────────────── */}
        {!hideFilters && (
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 mb-8 flex flex-col gap-4">
            {/* All */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={basePath} className={filterLinkClass('all')}>
              All
            </Link>
          </div>

          {/* Checkout Flights group */}
          {(bookingTypeFilter === 'all' || bookingTypeFilter === 'checkout') && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-[9px] font-bold uppercase tracking-widest text-blue-400/60 min-w-[130px]">
                Checkout Flights
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {checkoutTabs.map(tab => (
                  <Link key={tab.value} href={`${basePath}?status=${tab.value}`} className={filterLinkClass(tab.value)}>
                    {tab.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Standard Bookings group */}
          {(bookingTypeFilter === 'all' || bookingTypeFilter === 'standard') && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 min-w-[130px]">
                Standard Bookings
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {standardTabs.map(tab => (
                  <Link key={tab.value} href={`${basePath}?status=${tab.value}`} className={filterLinkClass(tab.value)}>
                    {tab.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* ── Booking list ─────────────────────────────────────────── */}
        {(!bookings || bookings.length === 0) ? (
          <div className="p-12 text-center text-slate-500 border border-white/5 rounded-2xl bg-white/5">
            <span
              className="material-symbols-outlined text-4xl mb-3 text-slate-600 block"
              style={{ fontVariationSettings: "'wght' 200" }}
            >
              inbox
            </span>
            No bookings found for this filter.
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map(booking => {
              const author      = getProfile(booking.booking_owner_user_id)
              const aircraft    = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
              const startStr    = formatDateTime(booking.scheduled_start)
              const endStr      = formatDateTime(booking.scheduled_end)
              const status      = booking.status as string
              const bookingType = (booking as { booking_type?: string }).booking_type ?? 'standard'
              const isCheckout  = bookingType === 'checkout'
              const isCheckoutStatus = CHECKOUT_STATUSES.includes(status)
              const badge       = STATUS_BADGE[status] ?? { label: status.replace(/_/g, ' '), className: 'bg-white/5 text-slate-400 border-white/10' }
              const typeMeta    = BOOKING_TYPE_META[bookingType] ?? BOOKING_TYPE_META.standard
              const bookingRef  = (booking as { booking_reference?: string }).booking_reference ?? booking.id.split('-')[0].toUpperCase()
              const isPending   = status === 'pending_confirmation'
              const hasBankTransferPending = bankTransferPendingBookingIds.has(booking.id)

              return (
                <div
                  key={booking.id}
                  className={`bg-[#1a1c1f] border rounded-2xl overflow-hidden flex flex-col md:flex-row hover:border-white/10 transition-colors ${
                    isCheckoutStatus ? 'border-blue-500/10' : 'border-white/[0.06]'
                  }`}
                >
                  {/* Left accent strip for checkout */}
                  {isCheckout && (
                    <div className="w-1 flex-shrink-0 bg-blue-500/30 hidden md:block" />
                  )}

                  {/* Main details */}
                  <div className="p-6 md:flex-1 flex flex-col justify-between">
                    <div>
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="min-w-0">
                          {/* Booking type + status badges */}
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${typeMeta.className}`}>
                              {typeMeta.label}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${badge.className}`}>
                              {badge.label}
                            </span>
                            {hasBankTransferPending && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border bg-amber-500/15 text-amber-400 border-amber-500/25 animate-pulse">
                                Bank Transfer · Pending Review
                              </span>
                            )}
                          </div>
                          {/* Aircraft */}
                          <h3 className="text-sm font-medium text-white mb-0.5">
                            {aircraft?.aircraft_type || 'Cessna 172N'} &middot; {aircraft?.registration || 'VH-KZG'}
                          </h3>
                          <p className="text-[10px] font-mono text-slate-600">{bookingRef}</p>
                        </div>
                        {/* Amount */}
                        <div className="text-right flex-shrink-0">
                          {booking.estimated_amount != null ? (
                            <>
                              <div className="text-lg font-serif text-blue-200">${booking.estimated_amount.toFixed(2)}</div>
                              {booking.estimated_hours != null && (
                                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                                  {Number(booking.estimated_hours).toFixed(1)} hrs
                                </p>
                              )}
                            </>
                          ) : (
                            <div className="text-sm text-slate-600">—</div>
                          )}
                        </div>
                      </div>

                      {/* Scheduled time */}
                      <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Scheduled</p>
                        <p className="text-sm text-slate-300 tabular-nums">
                          {startStr}
                        </p>
                        {booking.scheduled_end && (
                          <p className="text-xs text-slate-500 tabular-nums mt-0.5">to {endStr}</p>
                        )}
                      </div>

                      {/* Customer + PIC row */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Customer</p>
                          <p className="text-sm font-medium text-slate-300">{author?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-slate-500 truncate">{author?.email || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Pilot in Command</p>
                          <p className="text-sm text-slate-300">{booking.pic_name || '—'}</p>
                          {booking.pic_arn && (
                            <p className="text-xs text-slate-500">ARN: {booking.pic_arn}</p>
                          )}
                        </div>
                      </div>

                      {booking.customer_notes && (
                        <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Customer Notes</p>
                          <p className="text-sm text-slate-300 leading-relaxed italic line-clamp-2">
                            &quot;{booking.customer_notes}&quot;
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Submitted: {formatDateTime(booking.created_at)}</span>
                      <Link
                        href={`/admin/bookings/requests/${booking.id}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#a7c8ff]/10 hover:bg-[#a7c8ff]/20 text-[#a7c8ff] text-[10px] font-bold uppercase tracking-widest transition-colors border border-[#a7c8ff]/20"
                      >
                        <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                        {isCheckout ? 'Review Checkout' : 'View Details'}
                      </Link>
                    </div>
                  </div>

                  {/* Quick actions — only for standard pending bookings */}
                  {isPending && (
                    <div className="bg-[#0a0b0d] p-6 md:w-52 border-l border-white/5 flex items-center justify-center">
                      <PendingBookingActions bookingId={booking.id} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
