import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/formatDateTime'
import { deriveBookingStatusForFlightRecord, isAwaitingFlightRecordDue } from '@/lib/booking/flight-record-status'
import {
  AdminActionButton,
  AdminAlertCallout,
  AdminDataTable,
  AdminMetricCard,
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionCard,
  AdminSegmentedTabs,
  AdminStatusBadge,
  FlightStrip,
} from '@/app/admin/components/AdminListView'
import BookingOverviewCharts from './BookingOverviewCharts'
import CheckoutOverviewCharts from '../checkouts/CheckoutOverviewCharts'

export const metadata = { title: 'Bookings | Admin' }

type ProfileRow = {
  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string | null
}

type AircraftRow = {
  id: string
  registration: string | null
  aircraft_type: string | null
}

type BookingQueueRow = {
  id: string
  booking_reference: string | null
  booking_type: string
  status: string
  scheduled_start: string | null
  scheduled_end: string | null
  created_at: string
  updated_at: string
  payment_status: string | null
  pic_name: string | null
  booking_owner_user_id: string | null
  aircraft: AircraftRow | AircraftRow[] | null
  flight_records?: { status: string | null; submitted_at: string | null }[] | null
  profiles?: ProfileRow | ProfileRow[] | null
}

type CheckoutInvoiceRow = {
  id: string
  booking_id: string | null
  status: string
  checkout_outcome: string | null
  stripe_amount_due_cents: number | null
  total_paid_cents: number | null
  created_at: string | null
  updated_at: string | null
  paid_at: string | null
}

type CheckoutOutcomeEventRow = {
  id: string
  booking_id: string | null
  created_at: string
  event_type: string
  new_value: Record<string, unknown> | null
}

type CheckoutManualReviewRow = {
  invoice_id: string | null
  status: string
}

type StandardManualReviewRow = {
  booking_id: string | null
  invoice_id: string | null
  status: string
}

function firstAircraft(aircraft: BookingQueueRow['aircraft']): AircraftRow | null {
  if (!aircraft) return null
  return Array.isArray(aircraft) ? aircraft[0] ?? null : aircraft
}

function firstProfile(profiles: BookingQueueRow['profiles']): ProfileRow | null {
  if (!profiles) return null
  return Array.isArray(profiles) ? profiles[0] ?? null : profiles
}

function fullCustomerName(profile: ProfileRow | null, picName: string | null) {
  if (profile?.first_name) return `${profile.first_name} ${profile.last_name ?? ''}`.trim()
  if (profile?.full_name) return profile.full_name
  if (picName) return picName
  return profile?.email ?? 'Customer'
}

function bookingReference(booking: BookingQueueRow) {
  return booking.booking_reference ?? booking.id.slice(0, 8).toUpperCase()
}

function formatFallbackStatus(value: string) {
  return value.replace(/_/g, ' ')
}

function statusTone(status: string) {
  switch (status) {
    case 'completed':
    case 'confirmed':
    case 'ready_for_dispatch':
    case 'checkout_confirmed':
      return 'success' as const
    case 'payment_pending':
    case 'checkout_payment_required':
    case 'pending_post_flight_review':
    case 'awaiting_flight_record':
    case 'checkout_requested':
    case 'on_hold_pending_documents':
      return 'warning' as const
    case 'checkout_completed_under_review':
    case 'dispatched':
      return 'info' as const
    case 'cancelled':
    case 'no_show':
    case 'flight_record_overdue':
    case 'cancellation_requested':
      return 'danger' as const
    default:
      return 'neutral' as const
  }
}

function paymentTone(label: string) {
  const normalized = label.toLowerCase()
  if (normalized.includes('paid') || normalized.includes('settled') || normalized.includes('cleared')) return 'success' as const
  if (normalized.includes('required') || normalized.includes('pending') || normalized.includes('review')) return 'warning' as const
  if (normalized.includes('cancelled') || normalized.includes('failed') || normalized.includes('void')) return 'danger' as const
  if (normalized.includes('manual')) return 'info' as const
  return 'neutral' as const
}

function queuePriority(status: string, tab: 'standard' | 'checkout') {
  if (tab === 'checkout') {
    switch (status) {
      case 'checkout_requested':
        return 1
      case 'checkout_payment_required':
        return 2
      case 'checkout_completed_under_review':
        return 3
      case 'checkout_reschedule_required':
        return 4
      case 'checkout_confirmed':
        return 5
      case 'completed':
        return 6
      case 'cancelled':
        return 7
      default:
        return 8
    }
  }

  switch (status) {
    case 'awaiting_flight_record':
    case 'flight_record_overdue':
      return 1
    case 'payment_pending':
      return 2
    case 'pending_post_flight_review':
      return 3
    case 'on_hold_pending_documents':
      return 4
    case 'confirmed':
    case 'ready_for_dispatch':
    case 'dispatched':
    case 'pending_confirmation':
      return 5
    case 'completed':
      return 6
    case 'cancelled':
    case 'no_show':
      return 7
    default:
      return 8
  }
}

function queueSortRows(rows: BookingQueueRow[], tab: 'standard' | 'checkout') {
  return [...rows].sort((a, b) => {
    const priorityA = queuePriority(a.status, tab)
    const priorityB = queuePriority(b.status, tab)
    if (priorityA !== priorityB) return priorityA - priorityB

    const startA = a.scheduled_start ? new Date(a.scheduled_start).getTime() : Number.POSITIVE_INFINITY
    const startB = b.scheduled_start ? new Date(b.scheduled_start).getTime() : Number.POSITIVE_INFINITY
    if (priorityA <= 4) return startA - startB

    const updatedA = new Date(a.updated_at).getTime()
    const updatedB = new Date(b.updated_at).getTime()
    if (priorityA >= 6) return updatedB - updatedA

    return startA - startB
  })
}

function standardBookingSummary(bookings: BookingQueueRow[], manualReviewCount: number) {
  return {
    total: bookings.length,
    completed: bookings.filter((booking) => booking.status === 'completed').length,
    paymentPending: bookings.filter((booking) => booking.status === 'payment_pending').length,
    postFlightReview: bookings.filter((booking) => booking.status === 'pending_post_flight_review').length,
    cancelled: bookings.filter((booking) => ['cancelled', 'no_show'].includes(booking.status)).length,
    awaitingFlightRecord: bookings.filter((booking) => isAwaitingFlightRecordDue(booking)).length,
    manualReview: manualReviewCount,
  }
}

function checkoutBookingSummary(bookings: BookingQueueRow[], manualReviewCount: number) {
  return {
    total: bookings.length,
    completed: bookings.filter((booking) => booking.status === 'completed').length,
    paymentPending: bookings.filter((booking) => booking.status === 'checkout_payment_required').length,
    postFlightReview: bookings.filter((booking) => booking.status === 'checkout_completed_under_review').length,
    cancelled: bookings.filter((booking) => booking.status === 'cancelled').length,
    awaitingFlightRecord: bookings.filter((booking) => booking.status === 'checkout_requested').length,
    manualReview: manualReviewCount,
  }
}

function bookingStatusLabel(booking: BookingQueueRow, tab: 'standard' | 'checkout') {
  if (tab === 'checkout') {
    switch (booking.status) {
      case 'checkout_requested':
        return 'New Request'
      case 'checkout_confirmed':
        return 'Scheduled'
      case 'checkout_completed_under_review':
        return 'Awaiting Outcome'
      case 'checkout_payment_required':
        return 'Payment Required'
      case 'completed':
        return 'Completed'
      case 'cancelled':
        return 'Cancelled'
      default:
        return formatFallbackStatus(booking.status)
    }
  }

  const derived = deriveBookingStatusForFlightRecord(booking)
  switch (derived) {
    case 'pending_confirmation':
      return 'Requested'
    case 'confirmed':
      return 'Upcoming'
    case 'ready_for_dispatch':
      return 'Ready to Dispatch'
    case 'dispatched':
      return 'In Progress'
    case 'awaiting_flight_record':
      return 'Awaiting Flight Record'
    case 'pending_post_flight_review':
      return 'Post-flight Review'
    case 'payment_pending':
      return 'Payment Pending'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    case 'no_show':
      return 'No Show'
    case 'on_hold_pending_documents':
      return 'On Hold'
    case 'cancellation_requested':
      return 'Cancellation Requested'
    default:
      return formatFallbackStatus(derived)
  }
}

function paymentStatusLabel(
  booking: BookingQueueRow,
  tab: 'standard' | 'checkout',
  invoice: CheckoutInvoiceRow | null,
  manualReviewInvoiceIds: Set<string>,
  manualReviewBookingIds: Set<string>,
) {
  if (tab === 'checkout') {
    if (invoice?.status === 'paid') return 'Paid'
    if (invoice?.status === 'payment_required') return 'Payment Required'
    if (invoice?.status === 'pending') return invoice?.id && manualReviewInvoiceIds.has(invoice.id) ? 'Manual Review' : 'Pending'
    if (invoice?.status === 'waived') return 'Waived'
    if (invoice?.status === 'refunded') return 'Refunded'
    if (booking.status === 'checkout_completed_under_review') return 'Awaiting Outcome'
    if (booking.status === 'cancelled') return 'Not Needed'
    return invoice?.status ? formatFallbackStatus(invoice.status) : '—'
  }

  if (manualReviewBookingIds.has(booking.id)) return 'Payment Review Pending'
  if (booking.payment_status === 'paid') return 'Paid'
  if (booking.status === 'payment_pending') return 'Payment Pending'
  if (booking.status === 'pending_post_flight_review') return 'Awaiting Billing'
  return booking.payment_status ? formatFallbackStatus(booking.payment_status) : '—'
}

function queueActionLabel(booking: BookingQueueRow, tab: 'standard' | 'checkout') {
  if (tab === 'checkout') {
    if (booking.status === 'checkout_requested') return 'Review Checkout'
    if (booking.status === 'checkout_completed_under_review') return 'Review Outcome'
    if (booking.status === 'checkout_payment_required') return 'Review Payment'
    return 'Open Booking'
  }

  const derived = deriveBookingStatusForFlightRecord(booking)
  if (derived === 'awaiting_flight_record') return 'Review Record'
  if (derived === 'pending_post_flight_review') return 'Review Billing'
  if (derived === 'payment_pending') return 'Review Payment'
  if (booking.status === 'on_hold_pending_documents') return 'Open Booking'
  return 'View Details'
}

function bookingTone(booking: BookingQueueRow, tab: 'standard' | 'checkout') {
  if (tab === 'checkout') return statusTone(booking.status)
  return statusTone(deriveBookingStatusForFlightRecord(booking))
}

function routeLocationLabel(_booking: BookingQueueRow) {
  return null
}

function queueDesktopColumns(tab: 'standard' | 'checkout') {
  return tab === 'checkout'
    ? ['Ref', 'Aircraft', 'Customer', 'Scheduled', 'Status', 'Payment / Outcome', 'Action']
    : ['Ref', 'Aircraft', 'Customer', 'Scheduled', 'Status', 'Payment / Review', 'Action']
}

function bookingDetailHref(bookingId: string) {
  return `/admin/bookings/requests/${bookingId}`
}

function customerHref(booking: BookingQueueRow) {
  return booking.booking_owner_user_id ? `/admin/users/${booking.booking_owner_user_id}` : null
}

function aircraftHref(aircraft: AircraftRow | null) {
  return aircraft?.id ? `/admin/aircraft/${aircraft.id}` : null
}

function bookingTabLabel(tab: 'standard' | 'checkout') {
  return tab === 'checkout' ? 'Checkout' : 'Standard'
}

function summaryCardHref(activeTab: 'standard' | 'checkout', key: 'total' | 'completed' | 'paymentPending' | 'postFlightReview' | 'cancelled' | 'awaitingFlightRecord' | 'manualReview') {
  if (activeTab === 'checkout') {
    switch (key) {
      case 'total':
        return '/admin/checkouts/all'
      case 'completed':
        return '/admin/checkouts/history'
      case 'paymentPending':
        return '/admin/checkouts/payments?tab=payment_required'
      case 'postFlightReview':
        return '/admin/checkouts/awaiting-outcome'
      case 'cancelled':
        return '/admin/checkouts/cancelled'
      case 'awaitingFlightRecord':
        return '/admin/checkouts/new-requests'
      case 'manualReview':
        return '/admin/checkouts/payments?tab=manual_review'
    }
  }

  switch (key) {
    case 'total':
      return '/admin/bookings/upcoming-flights'
    case 'completed':
      return '/admin/bookings/history'
    case 'paymentPending':
      return '/admin/bookings/payments?tab=payment_required'
    case 'postFlightReview':
      return '/admin/bookings/post-flight-review'
    case 'cancelled':
      return '/admin/bookings/cancellations'
    case 'awaitingFlightRecord':
      return '/admin/bookings/awaiting-flight-records'
    case 'manualReview':
      return '/admin/bookings/payments?tab=manual_review'
  }
}

export default async function AdminBookingsOverviewPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const activeTab = searchParams?.tab === 'checkout' ? 'checkout' : 'standard'

  let standardBookings: BookingQueueRow[] = []
  let cancellations: Parameters<typeof BookingOverviewCharts>[0]['cancellations'] = []
  let manualBookingPaymentReviewCount = 0
  let standardManualReviewRows: StandardManualReviewRow[] = []
  let checkoutBookings: BookingQueueRow[] = []
  let invoices: CheckoutInvoiceRow[] = []
  let checkoutOutcomeEvents: CheckoutOutcomeEventRow[] = []
  let manualPendingCount = 0
  let checkoutManualReviewRows: CheckoutManualReviewRow[] = []

  if (activeTab === 'checkout') {
    const [
      { data: checkoutBookingsData },
      { data: invoicesData },
      { data: checkoutOutcomeEventsData },
      { count: manualPendingCountData },
      { data: manualReviewRowsData },
    ] = await Promise.all([
      supabase
        .from('bookings')
        .select(`
          id,
          booking_reference,
          booking_type,
          status,
          scheduled_start,
          scheduled_end,
          created_at,
          updated_at,
          payment_status,
          pic_name,
          booking_owner_user_id,
          aircraft ( id, registration, aircraft_type ),
          profiles:booking_owner_user_id ( first_name, last_name, full_name, email )
        `)
        .eq('booking_type', 'checkout')
        .order('created_at', { ascending: true }),
      supabase.from('checkout_payment_invoices').select('id, booking_id, status, checkout_outcome, stripe_amount_due_cents, total_paid_cents, created_at, updated_at, paid_at'),
      supabase
        .from('booking_audit_events')
        .select('id, booking_id, created_at, event_type, new_value')
        .eq('event_type', 'checkout_outcome_recorded')
        .order('created_at', { ascending: false }),
      supabase.from('checkout_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('checkout_bank_transfer_submissions').select('invoice_id, status').eq('status', 'pending_review'),
    ])

    checkoutBookings = (checkoutBookingsData ?? []) as BookingQueueRow[]
    invoices = (invoicesData ?? []) as CheckoutInvoiceRow[]
    checkoutOutcomeEvents = (checkoutOutcomeEventsData ?? []) as CheckoutOutcomeEventRow[]
    manualPendingCount = manualPendingCountData ?? 0
    checkoutManualReviewRows = (manualReviewRowsData ?? []) as CheckoutManualReviewRow[]
  } else {
    const [
      { data: standardBookingsData },
      { data: cancellationsData },
      { count: manualBookingPaymentReviewCountData },
      { data: standardManualReviewRowsData },
    ] = await Promise.all([
      supabase
        .from('bookings')
        .select(`
          id,
          booking_reference,
          booking_type,
          status,
          scheduled_start,
          scheduled_end,
          created_at,
          updated_at,
          payment_status,
          pic_name,
          booking_owner_user_id,
          aircraft ( id, registration, aircraft_type ),
          flight_records ( status, submitted_at ),
          profiles:booking_owner_user_id ( first_name, last_name, full_name, email )
        `)
        .eq('booking_type', 'standard')
        .order('created_at', { ascending: true }),
      supabase.from('booking_cancellation_requests').select('id, created_at'),
      supabase.from('booking_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase
        .from('booking_bank_transfer_submissions')
        .select('booking_id, invoice_id, status, submitted_at')
        .eq('status', 'pending_review')
        .order('submitted_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    ])

    standardBookings = (standardBookingsData ?? []) as BookingQueueRow[]
    cancellations = (cancellationsData ?? []) as Parameters<typeof BookingOverviewCharts>[0]['cancellations']
    manualBookingPaymentReviewCount = manualBookingPaymentReviewCountData ?? 0
    standardManualReviewRows = (standardManualReviewRowsData ?? []) as StandardManualReviewRow[]
  }

  const bookingsForTab = activeTab === 'checkout' ? checkoutBookings : standardBookings
  const sortedQueueRows = queueSortRows(bookingsForTab, activeTab)
  const queueCount = sortedQueueRows.length
  const selectedBookingRows = activeTab === 'checkout'
    ? checkoutBookings
    : standardBookings

  const tabs = [
    {
      label: 'Standard Bookings',
      href: '/admin/bookings',
      active: activeTab === 'standard',
      badge: standardBookings.length,
    },
    {
      label: 'Checkouts',
      href: '/admin/bookings?tab=checkout',
      active: activeTab === 'checkout',
      badge: checkoutBookings.length,
    },
  ]

  const headerActions = activeTab === 'checkout'
    ? <AdminActionButton href="/admin/bookings/checkout" label="Open Checkout Queue" />
    : <AdminActionButton href="/admin/bookings/upcoming-flights" label="Open Flight Queue" />

  const analyticsSubtitle = activeTab === 'checkout'
    ? 'Checkout requests, outcome states, and payment follow-up in the current operational window.'
    : 'Standard bookings, payment state, post-flight review, and cancellation workload in one control board.'

  const queueSubtitle = activeTab === 'checkout'
    ? 'Desktop shows a command-style table. Mobile stacks the same work into tap-friendly cards.'
    : 'Desktop shows the operational queue. Mobile stacks the same work into tap-friendly cards.'

  const invoiceByBooking = new Map<string, CheckoutInvoiceRow>()
  const manualReviewInvoiceIds = new Set<string>()
  const standardManualReviewBookingIds = new Set<string>()
  for (const row of checkoutManualReviewRows) {
    if (row.status === 'pending_review' && row.invoice_id) manualReviewInvoiceIds.add(row.invoice_id)
  }
  for (const row of standardManualReviewRows) {
    if (row.status === 'pending_review' && row.booking_id) standardManualReviewBookingIds.add(row.booking_id)
  }
  if (activeTab === 'standard') {
    manualBookingPaymentReviewCount = standardManualReviewBookingIds.size
  }
  for (const invoice of invoices) {
    if (!invoice.booking_id) continue
    const prev = invoiceByBooking.get(invoice.booking_id)
    if (!prev || new Date(invoice.updated_at ?? invoice.created_at ?? 0).getTime() > new Date(prev.updated_at ?? prev.created_at ?? 0).getTime()) {
      invoiceByBooking.set(invoice.booking_id, invoice)
    }
  }
  const bookingStats = activeTab === 'checkout'
    ? checkoutBookingSummary(selectedBookingRows, manualPendingCount)
    : standardBookingSummary(selectedBookingRows, standardManualReviewBookingIds.size)

  return (
    <>
      <AdminPageHeader
        eyebrow="Bookings"
        title="Bookings Control Board"
        subtitle="Monitor booking performance, payment status, post-flight reviews, and operational readiness."
        actions={headerActions}
        breadcrumbs={{
          parentLabel: 'Operations',
          parentHref: '/admin',
          currentLabel: 'Bookings',
        }}
      />

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 md:px-10 py-8 pb-24 space-y-6">
        <AdminSegmentedTabs tabs={tabs} />

        <AdminSectionCard
          title="Booking Summary Strip"
          subtitle={activeTab === 'checkout'
            ? 'Current checkout workload at a glance.'
            : 'Current standard booking workload at a glance.'}
        >
          <AdminMetricGrid>
            <AdminMetricCard
              label={activeTab === 'checkout' ? 'Total Checkouts' : 'Total Bookings'}
              value={bookingStats.total}
              tone="primary"
              href={summaryCardHref(activeTab, 'total')}
              helper={activeTab === 'checkout' ? 'All checkout records in scope.' : 'All standard bookings in scope.'}
            />
            <AdminMetricCard
              label="Completed"
              value={bookingStats.completed}
              tone="success"
              href={summaryCardHref(activeTab, 'completed')}
              helper="Closed records ready for history review."
            />
            <AdminMetricCard
              label={activeTab === 'checkout' ? 'Payment Required' : 'Payment Pending'}
              value={bookingStats.paymentPending}
              tone="warning"
              href={summaryCardHref(activeTab, 'paymentPending')}
              helper={activeTab === 'checkout' ? 'Checkout invoices awaiting payment.' : 'Bookings waiting on payment resolution.'}
            />
            <AdminMetricCard
              label={activeTab === 'checkout' ? 'Awaiting Outcome' : 'Post-flight Review'}
              value={bookingStats.postFlightReview}
              tone="info"
              href={summaryCardHref(activeTab, 'postFlightReview')}
              helper={activeTab === 'checkout' ? 'Checkout flights still under review.' : 'Submitted flight records awaiting approval.'}
            />
            <AdminMetricCard
              label="Cancelled"
              value={bookingStats.cancelled}
              tone="danger"
              href={summaryCardHref(activeTab, 'cancelled')}
              helper="Cancelled and no-show records."
            />
            <AdminMetricCard
              label={activeTab === 'checkout' ? 'New Requests' : 'Awaiting Flight Record'}
              value={bookingStats.awaitingFlightRecord}
              tone="neutral"
              href={summaryCardHref(activeTab, 'awaitingFlightRecord')}
              helper={activeTab === 'checkout' ? 'New checkout requests from customers.' : 'Flown bookings waiting on a record.'}
            />
            {activeTab === 'checkout' ? (
              <AdminMetricCard
                label="Manual Review"
                value={bookingStats.manualReview}
                tone="accent"
                href={summaryCardHref(activeTab, 'manualReview')}
                helper="Bank transfer invoices waiting on review."
              />
            ) : null}
          </AdminMetricGrid>
        </AdminSectionCard>

        <AdminSectionCard
          title="Analytics Overview"
          subtitle={analyticsSubtitle}
        >
          {activeTab === 'checkout' ? (
            <CheckoutOverviewCharts
              bookings={checkoutBookings}
              invoices={invoices}
              outcomeEvents={checkoutOutcomeEvents}
              manualPendingCount={manualPendingCount}
            />
          ) : (
            <BookingOverviewCharts
              bookings={standardBookings}
              cancellations={cancellations}
              manualPaymentReviewCount={manualBookingPaymentReviewCount}
            />
          )}
        </AdminSectionCard>

        <FlightStrip
          title="Operational Queue"
          subtitle={queueSubtitle}
          actions={
            <>
              <AdminActionButton
                href={activeTab === 'checkout' ? '/admin/bookings/checkout' : '/admin/bookings/upcoming-flights'}
                label={activeTab === 'checkout' ? 'Open checkout view' : 'Open booking view'}
                tone="secondary"
                className="w-full justify-center sm:w-auto"
              />
            </>
          }
        >
          {queueCount === 0 ? (
            <AdminAlertCallout tone="neutral" title="No queue items right now">
              {activeTab === 'checkout'
                ? 'Checkout bookings are clear for the moment. New requests and payment review work will appear here when they arrive.'
                : 'Standard bookings are clear for the moment. Upcoming flights, flight records, and post-flight review work will appear here when they arrive.'}
            </AdminAlertCallout>
          ) : (
            <>
              <div className="hidden lg:block">
                <AdminDataTable columns={queueDesktopColumns(activeTab)}>
                  {sortedQueueRows.map((booking) => {
                    const aircraft = firstAircraft(booking.aircraft)
                    const profile = firstProfile(booking.profiles)
                    const customer = fullCustomerName(profile, booking.pic_name)
                    const statusLabel = bookingStatusLabel(booking, activeTab)
                    const paymentLabel = paymentStatusLabel(
                      booking,
                      activeTab,
                      invoiceByBooking.get(booking.id) ?? null,
                      manualReviewInvoiceIds,
                      standardManualReviewBookingIds,
                    )
                    const routeLabel = routeLocationLabel(booking)
                    const actionLabel = queueActionLabel(booking, activeTab)
                    const statusBadgeTone = bookingTone(booking, activeTab)
                    const paymentBadgeTone = paymentTone(paymentLabel)

                    return (
                      <tr key={booking.id} className="border-t border-[var(--admin-divider)] hover:bg-[var(--admin-muted-surface)] transition-colors">
                        <td className="px-5 py-4 align-top">
                          <Link href={bookingDetailHref(booking.id)} className="font-mono text-[var(--admin-text)] hover:text-[var(--admin-accent-blue)] hover:underline">
                            {bookingReference(booking)}
                          </Link>
                          <div className="mt-1 text-[11px] text-[var(--admin-text-muted)]">{bookingTabLabel(activeTab)}</div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          {aircraftHref(aircraft) ? (
                            <Link href={aircraftHref(aircraft)!} className="font-medium text-[var(--admin-text)] hover:text-[var(--admin-accent-blue)] hover:underline">
                              {aircraft?.registration ?? 'Aircraft pending'}
                            </Link>
                          ) : (
                            <div className="font-medium text-[var(--admin-text)]">{aircraft?.registration ?? 'Aircraft pending'}</div>
                          )}
                          <div className="mt-1 text-[11px] text-[var(--admin-text-muted)]">{aircraft?.aircraft_type ?? '—'}</div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          {customerHref(booking) ? (
                            <Link href={customerHref(booking)!} className="font-medium text-[var(--admin-text)] hover:text-[var(--admin-accent-blue)] hover:underline">
                              {customer}
                            </Link>
                          ) : (
                            <div className="font-medium text-[var(--admin-text)]">{customer}</div>
                          )}
                          <div className="mt-1 text-[11px] text-[var(--admin-text-muted)]">{profile?.email ?? '—'}</div>
                          {routeLabel ? <div className="mt-1 text-[11px] text-[var(--admin-text-muted)]">{routeLabel}</div> : null}
                        </td>
                        <td className="px-5 py-4 align-top text-[var(--admin-text)]">{formatDateTime(booking.scheduled_start)}</td>
                        <td className="px-5 py-4 align-top">
                          <AdminStatusBadge label={statusLabel} tone={statusBadgeTone} />
                        </td>
                        <td className="px-5 py-4 align-top">
                          <AdminStatusBadge label={paymentLabel} tone={paymentBadgeTone} />
                        </td>
                        <td className="px-5 py-4 align-top text-right">
                          <AdminActionButton
                            href={`/admin/bookings/requests/${booking.id}`}
                            label={actionLabel}
                            className="justify-center"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </AdminDataTable>
              </div>

              <div className="lg:hidden space-y-3">
                {sortedQueueRows.map((booking) => {
                  const aircraft = firstAircraft(booking.aircraft)
                  const profile = firstProfile(booking.profiles)
                  const customer = fullCustomerName(profile, booking.pic_name)
                  const statusLabel = bookingStatusLabel(booking, activeTab)
                  const paymentLabel = paymentStatusLabel(
                    booking,
                    activeTab,
                    invoiceByBooking.get(booking.id) ?? null,
                    manualReviewInvoiceIds,
                    standardManualReviewBookingIds,
                  )
                  const statusBadgeTone = bookingTone(booking, activeTab)
                  const paymentBadgeTone = paymentTone(paymentLabel)
                  const routeLabel = routeLocationLabel(booking)
                  const actionLabel = queueActionLabel(booking, activeTab)

                  return (
                    <div
                      key={booking.id}
                      className="rounded-[var(--admin-radius-xl)] border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-4 shadow-[var(--admin-soft-shadow)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={bookingDetailHref(booking.id)} className="font-mono text-[var(--admin-text)] hover:text-[var(--admin-accent-blue)] hover:underline">
                            {bookingReference(booking)}
                          </Link>
                          <p className="mt-1 text-[var(--admin-text-sm)] text-[var(--admin-text-muted)]">{bookingTabLabel(activeTab)} booking</p>
                        </div>
                        <AdminStatusBadge label={statusLabel} tone={statusBadgeTone} />
                      </div>

                      <div className="mt-4 grid gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--admin-text-muted)]">Aircraft</p>
                          {aircraftHref(aircraft) ? (
                            <Link href={aircraftHref(aircraft)!} className="mt-1 block font-medium text-[var(--admin-text)] hover:text-[var(--admin-accent-blue)] hover:underline">
                              {aircraft?.registration ?? 'Aircraft pending'}
                            </Link>
                          ) : (
                            <p className="mt-1 font-medium text-[var(--admin-text)]">{aircraft?.registration ?? 'Aircraft pending'}</p>
                          )}
                          <p className="text-[var(--admin-text-sm)] text-[var(--admin-text-muted)]">{aircraft?.aircraft_type ?? '—'}</p>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--admin-text-muted)]">Customer</p>
                          {customerHref(booking) ? (
                            <Link href={customerHref(booking)!} className="mt-1 block font-medium text-[var(--admin-text)] hover:text-[var(--admin-accent-blue)] hover:underline">
                              {customer}
                            </Link>
                          ) : (
                            <p className="mt-1 font-medium text-[var(--admin-text)]">{customer}</p>
                          )}
                          <p className="text-[var(--admin-text-sm)] text-[var(--admin-text-muted)]">{profile?.email ?? '—'}</p>
                          {routeLabel ? <p className="text-[var(--admin-text-sm)] text-[var(--admin-text-muted)]">{routeLabel}</p> : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <AdminStatusBadge label={paymentLabel} tone={paymentBadgeTone} />
                          <span className="text-[var(--admin-text-sm)] text-[var(--admin-text-muted)]">{formatDateTime(booking.scheduled_start)}</span>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-[var(--admin-text-sm)] text-[var(--admin-text-muted)]">{actionLabel}</span>
                        <Link
                          href={bookingDetailHref(booking.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[rgba(96,165,250,0.24)] bg-[var(--admin-button-bg)] px-3 py-2 text-[12px] font-medium text-[var(--admin-accent-blue)] hover:bg-[rgba(37,99,235,0.16)]"
                        >
                          Open booking
                          <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </FlightStrip>
      </div>
    </>
  )
}
