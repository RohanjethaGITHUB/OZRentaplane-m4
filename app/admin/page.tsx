import Link from 'next/link'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Actions | OZRentAPlane' }
export const dynamic = 'force-dynamic'

type Priority = 'high' | 'medium' | 'low'

type ActionRowData = {
  key: string
  title: string
  description: string
  count: number
  href: string
  priority: Priority
  blockerRank: number
  nextStep: string
  oldestAt: string | null
}

type SummaryItem = {
  label: string
  value: number
  detail: string
  icon: React.ReactNode
}

function priorityLabel(priority: Priority) {
  if (priority === 'high') return 'High'
  if (priority === 'medium') return 'Medium'
  return 'Low'
}

function priorityClass(priority: Priority) {
  if (priority === 'high') return 'bg-rose-400/85'
  if (priority === 'medium') return 'bg-amber-300/85'
  return 'bg-slate-300/80'
}

function formatRelativeAge(timestamp: string | null) {
  if (!timestamp) return 'Unknown'
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = Math.max(0, now - then)

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < hour) {
    const mins = Math.max(1, Math.floor(diff / minute))
    return `${mins} minute${mins === 1 ? '' : 's'}`
  }
  if (diff < day) {
    const hours = Math.floor(diff / hour)
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  const days = Math.floor(diff / day)
  return `${days} day${days === 1 ? '' : 's'}`
}

function rankPriority(priority: Priority) {
  if (priority === 'high') return 0
  if (priority === 'medium') return 1
  return 2
}

function sortActionRows(rows: ActionRowData[]) {
  return [...rows].sort((a, b) => {
    const priorityDelta = rankPriority(a.priority) - rankPriority(b.priority)
    if (priorityDelta !== 0) return priorityDelta

    const blockerDelta = a.blockerRank - b.blockerRank
    if (blockerDelta !== 0) return blockerDelta

    const aOldest = a.oldestAt ? new Date(a.oldestAt).getTime() : Number.MAX_SAFE_INTEGER
    const bOldest = b.oldestAt ? new Date(b.oldestAt).getTime() : Number.MAX_SAFE_INTEGER
    if (aOldest !== bOldest) return aOldest - bOldest

    return a.title.localeCompare(b.title)
  })
}

function SummaryStrip({ items }: { items: SummaryItem[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1629]/80 shadow-[0_8px_40px_rgba(3,10,24,0.4)] backdrop-blur-sm overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={`px-5 py-4 min-h-[92px] ${index < items.length - 1 ? 'border-b sm:border-b-0 sm:border-r border-white/10' : ''}`}
          >
            <div className="flex items-center gap-2 text-slate-300 text-sm">
              {item.icon}
              <span>{item.label}</span>
            </div>
            <p className="text-3xl leading-none text-white mt-2 font-medium">{item.value}</p>
            <p className="text-sm text-slate-400 mt-1">{item.detail}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function ActionRow({ row }: { row: ActionRowData }) {
  const heading = `${row.count} ${row.title.toLowerCase()}`

  return (
    <Link
      href={row.href}
      className="group block rounded-2xl border border-white/10 bg-[#0a1424]/90 px-5 py-4 sm:px-6 sm:py-5 transition-all duration-200 hover:border-sky-300/35 hover:bg-[#0d1a2f]/95 hover:shadow-[0_10px_28px_rgba(2,8,22,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[1.13rem] leading-tight font-semibold text-white">{heading}</p>
          <p className="text-slate-300/90 mt-2 text-[0.97rem] leading-relaxed">{row.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
            <p className="inline-flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${priorityClass(row.priority)}`} />
              <span className="text-slate-300">Urgency: <span className="text-slate-100">{priorityLabel(row.priority)}</span></span>
            </p>
            <p className="text-slate-300">Oldest waiting: <span className="text-slate-100">{formatRelativeAge(row.oldestAt)}</span></p>
            <p className="text-slate-300">Next step: <span className="text-slate-100">{row.nextStep}</span></p>
          </div>
        </div>

        <div className="pt-1 shrink-0 text-slate-400 group-hover:text-sky-200 transition-colors">
          <span className="material-symbols-outlined text-[22px]">chevron_right</span>
        </div>
      </div>
    </Link>
  )
}

function EmptyActionState({ text, subtext }: { text: string; subtext?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-7 text-center">
      <p className="text-slate-200">{text}</p>
      {subtext ? <p className="mt-2 text-sm text-slate-400">{subtext}</p> : null}
    </div>
  )
}

function ActionPanelFooter({ note, moreHref, moreLabel }: { note: string; moreHref?: string; moreLabel?: string }) {
  return (
    <div className="pt-2 text-center text-slate-400 text-sm space-y-2">
      {moreHref && moreLabel ? (
        <Link href={moreHref} className="inline-block text-sky-200 hover:text-sky-100">
          {moreLabel}
        </Link>
      ) : null}
      <p>{note}</p>
    </div>
  )
}

function ActionGroupPanel({
  icon,
  title,
  subtitle,
  rows,
  emptyText,
  emptySubtext,
  footerNote,
  moreHref,
  moreLabel,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  rows: ActionRowData[]
  emptyText: string
  emptySubtext?: string
  footerNote: string
  moreHref?: string
  moreLabel?: string
}) {
  const sorted = sortActionRows(rows)
  const hasOverflow = sorted.length > 5
  const visibleRows = hasOverflow ? sorted.slice(0, 5) : sorted

  return (
    <section className="rounded-3xl border border-white/10 bg-[#071425]/75 shadow-[0_10px_44px_rgba(2,7,18,0.45)] p-5 sm:p-6">
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-sky-500/20 border border-sky-300/20 text-sky-200 flex items-center justify-center mb-4">
          {icon}
        </div>
        <h2 className="text-5xl sm:text-[2.2rem] leading-tight text-white font-semibold">{title}</h2>
        <p className="mt-2 text-slate-400">{subtitle}</p>
      </div>

      <div className="mt-6 space-y-3">
        {visibleRows.length === 0 ? (
          <EmptyActionState text={emptyText} subtext={emptySubtext} />
        ) : (
          visibleRows.map((row) => <ActionRow key={row.key} row={row} />)
        )}
      </div>

      <ActionPanelFooter
        note={footerNote}
        moreHref={hasOverflow ? moreHref : undefined}
        moreLabel={hasOverflow ? moreLabel : undefined}
      />
    </section>
  )
}

async function getOldestTimestamp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    table,
    filters,
    orderBy = 'created_at',
  }: {
    table: string
    filters: Array<{ type: 'eq' | 'in' | 'gte'; column: string; value: unknown }>
    orderBy?: string
  },
) {
  let query = supabase.from(table).select(`${orderBy}`).limit(1).order(orderBy, { ascending: true })

  for (const filter of filters) {
    if (filter.type === 'eq') query = query.eq(filter.column, filter.value)
    if (filter.type === 'in') query = query.in(filter.column, filter.value as string[])
    if (filter.type === 'gte') query = query.gte(filter.column, filter.value as string)
  }

  const { data } = await query
  const firstRow = (data?.[0] ?? null) as Record<string, unknown> | null
  const value = firstRow?.[orderBy]
  return typeof value === 'string' ? value : null
}

export default async function AdminActionsPage() {
  noStore()
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const nowIso = new Date().toISOString()

  const [
    { count: newCheckoutRequests },
    { count: upcomingCheckouts },
    { count: awaitingCheckoutOutcome },
    { count: checkoutPaymentsRequired },
    { count: manualCheckoutPaymentsReview },
    { count: checkoutIssues },
    { count: checkoutReschedulePending },
    { data: checkoutCancelRequestRows },
    { data: checkoutLifecycleCancelledRows },
    { count: upcomingFlights },
    { count: awaitingFlightRecords },
    { count: postFlightReviewRequired },
    { count: bookingPaymentsRequired },
    { count: manualBookingPaymentsReview },
    { count: cancellationRequests },

    oldestNewCheckout,
    oldestUpcomingCheckout,
    oldestAwaitingCheckout,
    oldestCheckoutPayments,
    oldestManualCheckoutPayments,
    oldestCheckoutIssues,
    oldestCheckoutReschedulePending,
    oldestCheckoutCancellations,
    oldestUpcomingFlights,
    oldestAwaitingRecords,
    oldestPostFlightReview,
    oldestBookingPayments,
    oldestManualBookingPayments,
    oldestCancellationRequests,
  ] = await Promise.all([
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_requested'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_confirmed').gte('scheduled_start', nowIso),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_completed_under_review'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_payment_required'),
    supabase.from('checkout_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'customer')
      .in('pilot_clearance_status', ['additional_checkout_required', 'checkout_reschedule_required', 'not_currently_eligible']),
    supabase.from('checkout_change_requests').select('*', { count: 'exact', head: true }).eq('request_type', 'reschedule').eq('status', 'pending'),
    supabase.from('checkout_change_requests').select('checkout_request_id, created_at').eq('request_type', 'cancel'),
    supabase.from('bookings').select('id, updated_at').eq('booking_type', 'checkout').in('checkout_lifecycle_status', ['cancelled_by_customer', 'cancelled_by_admin']),

    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').in('status', ['confirmed', 'ready_for_dispatch']).gte('scheduled_start', nowIso),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'awaiting_flight_record'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'pending_post_flight_review'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'payment_pending'),
    supabase.from('booking_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('booking_cancellation_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),

    getOldestTimestamp(supabase, {
      table: 'bookings',
      filters: [
        { type: 'eq', column: 'booking_type', value: 'checkout' },
        { type: 'eq', column: 'status', value: 'checkout_requested' },
      ],
    }),
    getOldestTimestamp(supabase, {
      table: 'bookings',
      filters: [
        { type: 'eq', column: 'booking_type', value: 'checkout' },
        { type: 'eq', column: 'status', value: 'checkout_confirmed' },
        { type: 'gte', column: 'scheduled_start', value: nowIso },
      ],
    }),
    getOldestTimestamp(supabase, {
      table: 'bookings',
      filters: [
        { type: 'eq', column: 'booking_type', value: 'checkout' },
        { type: 'eq', column: 'status', value: 'checkout_completed_under_review' },
      ],
    }),
    getOldestTimestamp(supabase, {
      table: 'bookings',
      filters: [
        { type: 'eq', column: 'booking_type', value: 'checkout' },
        { type: 'eq', column: 'status', value: 'checkout_payment_required' },
      ],
    }),
    getOldestTimestamp(supabase, {
      table: 'checkout_bank_transfer_submissions',
      filters: [{ type: 'eq', column: 'status', value: 'pending_review' }],
    }),
    getOldestTimestamp(supabase, {
      table: 'profiles',
      filters: [
        { type: 'eq', column: 'role', value: 'customer' },
        {
          type: 'in',
          column: 'pilot_clearance_status',
          value: ['additional_checkout_required', 'checkout_reschedule_required', 'not_currently_eligible'],
        },
      ],
    }),
    getOldestTimestamp(supabase, {
      table: 'checkout_change_requests',
      filters: [
        { type: 'eq', column: 'request_type', value: 'reschedule' },
        { type: 'eq', column: 'status', value: 'pending' },
      ],
    }),
    getOldestTimestamp(supabase, {
      table: 'checkout_change_requests',
      filters: [{ type: 'eq', column: 'request_type', value: 'cancel' }],
    }),

    getOldestTimestamp(supabase, {
      table: 'bookings',
      filters: [
        { type: 'eq', column: 'booking_type', value: 'standard' },
        { type: 'in', column: 'status', value: ['confirmed', 'ready_for_dispatch'] },
        { type: 'gte', column: 'scheduled_start', value: nowIso },
      ],
    }),
    getOldestTimestamp(supabase, {
      table: 'bookings',
      filters: [
        { type: 'eq', column: 'booking_type', value: 'standard' },
        { type: 'eq', column: 'status', value: 'awaiting_flight_record' },
      ],
    }),
    getOldestTimestamp(supabase, {
      table: 'bookings',
      filters: [
        { type: 'eq', column: 'booking_type', value: 'standard' },
        { type: 'eq', column: 'status', value: 'pending_post_flight_review' },
      ],
    }),
    getOldestTimestamp(supabase, {
      table: 'bookings',
      filters: [
        { type: 'eq', column: 'booking_type', value: 'standard' },
        { type: 'eq', column: 'status', value: 'payment_pending' },
      ],
    }),
    getOldestTimestamp(supabase, {
      table: 'booking_bank_transfer_submissions',
      filters: [{ type: 'eq', column: 'status', value: 'pending_review' }],
    }),
    getOldestTimestamp(supabase, {
      table: 'booking_cancellation_requests',
      filters: [{ type: 'eq', column: 'status', value: 'pending' }],
    }),
  ])

  const checkoutRowsAll: ActionRowData[] = [
    // Checkout cancellation awareness queue (visible records, non-actionable).
    ...(() => {
      const cancelledCheckoutIds = new Set<string>([
        ...(checkoutCancelRequestRows ?? []).map((row) => row.checkout_request_id),
        ...(checkoutLifecycleCancelledRows ?? []).map((row) => row.id),
      ])
      const lifecycleOldest = (checkoutLifecycleCancelledRows ?? [])
        .map((row) => row.updated_at)
        .filter((v): v is string => typeof v === 'string')
        .sort()[0] ?? null
      const oldest = oldestCheckoutCancellations
        ? (lifecycleOldest ? (new Date(oldestCheckoutCancellations) <= new Date(lifecycleOldest) ? oldestCheckoutCancellations : lifecycleOldest) : oldestCheckoutCancellations)
        : lifecycleOldest
      return [{
        key: 'checkout-cancellations',
        title: 'Checkout cancellations',
        description: 'Monitor cancelled checkout records from customers and admins.',
        count: cancelledCheckoutIds.size,
        href: '/admin/checkouts/cancelled',
        priority: 'low' as const,
        blockerRank: 2,
        nextStep: 'Review cancellation history',
        oldestAt: oldest,
      }]
    })(),
    {
      key: 'new-checkout-requests',
      title: 'New checkout requests',
      description: 'Review and confirm new checkout requests.',
      count: newCheckoutRequests ?? 0,
      href: '/admin/checkouts/new-requests',
      priority: 'high',
      blockerRank: 2,
      nextStep: 'Review and confirm',
      oldestAt: oldestNewCheckout,
    },
    {
      key: 'awaiting-checkout-outcome',
      title: 'Awaiting checkout outcome',
      description: 'Record checkout outcomes and apply next clearance step.',
      count: awaitingCheckoutOutcome ?? 0,
      href: '/admin/checkouts/awaiting-outcome',
      priority: 'medium',
      blockerRank: 1,
      nextStep: 'Record outcome',
      oldestAt: oldestAwaitingCheckout,
    },
    {
      key: 'checkout-payments-required',
      title: 'Checkout payments required',
      description: 'Follow up checkout bookings waiting for payment.',
      count: checkoutPaymentsRequired ?? 0,
      href: '/admin/checkouts/payments?tab=payment_required',
      priority: 'medium',
      blockerRank: 0,
      nextStep: 'Review payment',
      oldestAt: oldestCheckoutPayments,
    },
    {
      key: 'manual-checkout-payments-to-review',
      title: 'Manual checkout payments to review',
      description: 'Approve or reject submitted checkout bank transfers.',
      count: manualCheckoutPaymentsReview ?? 0,
      href: '/admin/checkouts/payments?tab=manual_review',
      priority: 'medium',
      blockerRank: 0,
      nextStep: 'Approve or reject',
      oldestAt: oldestManualCheckoutPayments,
    },
    {
      key: 'checkout-issues',
      title: 'Checkout issues / needs attention',
      description: 'Customers requiring additional checkout follow-up.',
      count: checkoutIssues ?? 0,
      href: '/admin/customers',
      priority: 'low',
      blockerRank: 1,
      nextStep: 'Review customer issues',
      oldestAt: oldestCheckoutIssues,
    },
    {
      key: 'checkout-cancel-reschedule',
      title: 'Checkout reschedule requests',
      description: 'Review pending customer checkout reschedule requests.',
      count: checkoutReschedulePending ?? 0,
      href: '/admin/checkouts/reschedule?tab=pending',
      priority: 'medium',
      blockerRank: 1,
      nextStep: 'Approve or reject',
      oldestAt: oldestCheckoutReschedulePending,
    },
    {
      key: 'upcoming-checkouts',
      title: 'Upcoming checkouts',
      description: 'Prepare and confirm upcoming checkout flights.',
      count: upcomingCheckouts ?? 0,
      href: '/admin/checkouts/upcoming',
      priority: 'low',
      blockerRank: 3,
      nextStep: 'Review schedule readiness',
      oldestAt: oldestUpcomingCheckout,
    },
  ]
  const checkoutRows = checkoutRowsAll.filter((row) => row.count > 0)

  const bookingRowsAll: ActionRowData[] = [
    {
      key: 'upcoming-flights',
      title: 'Upcoming flights',
      description: 'Upcoming standard flights requiring dispatch readiness.',
      count: upcomingFlights ?? 0,
      href: '/admin/bookings/upcoming-flights',
      priority: 'high',
      blockerRank: 3,
      nextStep: 'Review flight readiness',
      oldestAt: oldestUpcomingFlights,
    },
    {
      key: 'awaiting-flight-records',
      title: 'Awaiting flight records',
      description: 'Bookings waiting for customer flight record submission.',
      count: awaitingFlightRecords ?? 0,
      href: '/admin/bookings/awaiting-flight-records',
      priority: 'medium',
      blockerRank: 1,
      nextStep: 'Check submitted records',
      oldestAt: oldestAwaitingRecords,
    },
    {
      key: 'post-flight-review-required',
      title: 'Post-flight review required',
      description: 'Bookings ready for admin post-flight review decisions.',
      count: postFlightReviewRequired ?? 0,
      href: '/admin/bookings/post-flight-review',
      priority: 'medium',
      blockerRank: 0,
      nextStep: 'Review and complete',
      oldestAt: oldestPostFlightReview,
    },
    {
      key: 'booking-payments-required',
      title: 'Booking payments required',
      description: 'Standard booking invoices waiting on customer payment.',
      count: bookingPaymentsRequired ?? 0,
      href: '/admin/bookings/payment-required',
      priority: 'medium',
      blockerRank: 0,
      nextStep: 'Review payment',
      oldestAt: oldestBookingPayments,
    },
    {
      key: 'manual-booking-payments-to-review',
      title: 'Manual booking payments to review',
      description: 'Review standard booking bank transfer submissions.',
      count: manualBookingPaymentsReview ?? 0,
      href: '/admin/bookings/payments',
      priority: 'medium',
      blockerRank: 0,
      nextStep: 'Approve or reject',
      oldestAt: oldestManualBookingPayments,
    },
    {
      key: 'cancellation-requests',
      title: 'Cancellation requests',
      description: 'Review and resolve pending cancellation requests.',
      count: cancellationRequests ?? 0,
      href: '/admin/bookings/cancellations',
      priority: 'low',
      blockerRank: 1,
      nextStep: 'Review cancellation',
      oldestAt: oldestCancellationRequests,
    },
  ]
  const bookingRows = bookingRowsAll.filter((row) => row.count > 0)

  const openActions = [...checkoutRows, ...bookingRows].reduce((sum, row) => sum + row.count, 0)
  const urgentCount = [...checkoutRows, ...bookingRows]
    .filter((row) => row.priority === 'high')
    .reduce((sum, row) => sum + row.count, 0)
  const paymentsCount = (checkoutPaymentsRequired ?? 0) + (manualCheckoutPaymentsReview ?? 0) + (bookingPaymentsRequired ?? 0) + (manualBookingPaymentsReview ?? 0)
  const flightRecordsCount = awaitingFlightRecords ?? 0

  const summaryItems: SummaryItem[] = [
    {
      label: 'Open actions',
      value: openActions,
      detail: 'Across all workflows',
      icon: (
        <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="7" width="16" height="13" rx="2" />
          <path d="M8 7V5a4 4 0 0 1 8 0v2" />
        </svg>
      ),
    },
    {
      label: 'Urgent',
      value: urgentCount,
      detail: 'Require immediate attention',
      icon: (
        <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 text-rose-300" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6" />
          <circle cx="12" cy="16.5" r="0.7" fill="currentColor" />
        </svg>
      ),
    },
    {
      label: 'Payments',
      value: paymentsCount,
      detail: 'Awaiting admin review',
      icon: (
        <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 text-sky-300" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
          <path d="M7 15h4" />
        </svg>
      ),
    },
    {
      label: 'Flight records',
      value: flightRecordsCount,
      detail: 'Awaiting submission',
      icon: (
        <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 16l14-8-7 8 1 4-2-2-3 1 1-3-4 0z" />
        </svg>
      ),
    },
  ]

  return (
    <>
      <AdminPortalHero
        eyebrow="Operations"
        title="Actions"
        subtitle="Operational inbox for checkouts and bookings."
      />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 xl:px-10 py-6 sm:py-8 pb-20 space-y-5">
        <SummaryStrip items={summaryItems} />

        <section className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
          <ActionGroupPanel
            icon={
              <svg aria-hidden viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="9" cy="19" r="1.5" />
                <circle cx="17" cy="19" r="1.5" />
                <path d="M4 5h2l2 9h10l2-6H7" />
              </svg>
            }
            title="Checkout Actions"
            subtitle="Immediate checkout workflow actions."
            rows={checkoutRows}
            emptyText="No checkout actions at this time."
            footerNote="No other checkout actions at this time."
            moreHref="/admin/checkouts"
            moreLabel="View all checkout actions"
          />

          <ActionGroupPanel
            icon={
              <svg aria-hidden viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3l3.3 5.8 4.7 1.7-4.7 1.8L12 21l-3.3-8.7-4.7-1.8 4.7-1.7z" />
                <path d="M12 8v9" />
              </svg>
            }
            title="Booking Actions"
            subtitle="Immediate booking workflow actions."
            rows={bookingRows}
            emptyText="No booking actions need attention right now."
            emptySubtext="New flight records, payments, or booking issues will appear here."
            footerNote="No other booking actions at this time."
            moreHref="/admin/bookings"
            moreLabel="View all booking actions"
          />
        </section>
      </div>
    </>
  )
}
