import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { createClient, getCachedProfile, getCachedUser } from '@/lib/supabase/server'
import { countAwaitingFlightRecords } from '@/lib/booking/flight-record-status'
import {
  getCachedAdminDocumentReviewRows,
  getCachedAdminShellBadges,
} from '@/lib/admin/operational-counts'
import { ActionQueueSection } from './ActionQueueSection'
import { createPerfLogger } from '@/lib/perf/timing'

export const metadata = { title: 'Command Board | OZRentAPlane' }
export const dynamic = 'force-dynamic'

type WorkflowFilter = 'all' | 'checkout' | 'rental' | 'document_review'

const WORKFLOW_LABELS: Record<WorkflowFilter, string> = {
  all: 'All',
  checkout: 'Checkouts',
  rental: 'Rentals',
  document_review: 'Document Review',
}

type ProfileRow = {
  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string | null
}

type AircraftRow = {
  id: string
  registration: string | null
}

type BookingRow = {
  id: string
  booking_reference: string | null
  booking_type: string
  status: string
  payment_status?: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  created_at: string
  updated_at: string
  booking_owner_user_id: string | null
  pic_name: string | null
  aircraft: AircraftRow | AircraftRow[] | null
}

type BookingInvoiceRow = {
  id: string
  booking_id: string
  status: string
  payment_method: string | null
  stripe_amount_due_cents: number | null
  total_paid_cents: number | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

type BookingBankTransferSubmissionRow = {
  id: string
  invoice_id: string
  booking_id: string
  reference: string | null
  receipt_storage_path: string | null
  status: string
  admin_note: string | null
  submitted_at: string
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

type CancelRequestRow = {
  id: string
  checkout_request_id?: string | null
  booking_id?: string | null
  status?: string | null
  created_at: string
  customer_message: string | null
  bookings: BookingRow | BookingRow[] | null
}

export type ActionItem = {
  key: string
  groups: WorkflowFilter[]
  badge: 'Checkout' | 'Rental' | 'Document Review'
  badgeTone: 'primary' | 'info' | 'warning' | 'success' | 'danger'
  title: string
  description: string
  customerLabel: string
  customerHref: string | null
  referenceLabel: string
  referenceHref: string | null
  aircraftLabel: string | null
  aircraftHref: string | null
  receivedAt: string | null
  nextStep: string
  href: string
  aggregateOnly?: boolean
  issueLabel?: string | null
  sortHint?: number | null
}

type UserDocumentRow = {
  id: string
  user_id: string
  document_type: string
  status: string
  uploaded_at: string | null
  created_at: string
  updated_at: string
}

type SafeQueryResult<T> = { data: T[] | null; count?: number | null }

// Guard each board source: a failing query must degrade its own card only,
// never zero out the whole board.
async function safeQuery<T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; count?: number | null; error: { message: string } | null }>,
): Promise<SafeQueryResult<T>> {
  try {
    const { data, count, error } = await query
    if (error) {
      console.error(`[admin command board] "${label}" query failed:`, error.message)
      return { data: null, count: null }
    }
    return { data, count }
  } catch (err) {
    console.error(`[admin command board] "${label}" query threw:`, err)
    return { data: null, count: null }
  }
}

function firstItem<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function fullCustomerName(profile: ProfileRow | null, fallback: string | null) {
  if (profile?.first_name) return `${profile.first_name} ${profile.last_name ?? ''}`.trim()
  if (profile?.full_name) return profile.full_name
  if (fallback) return fallback
  return profile?.email ?? 'Customer'
}

function bookingReference(booking: BookingRow) {
  return booking.booking_reference ?? booking.id.slice(0, 8).toUpperCase()
}

function getWorkflowLabel(workflow: WorkflowFilter) {
  return WORKFLOW_LABELS[workflow]
}

function parentWorkflowFromBookingType(bookingType: string | null | undefined): Exclude<WorkflowFilter, 'all'> {
  return bookingType === 'checkout' ? 'checkout' : 'rental'
}

function badgeFromWorkflow(workflow: Exclude<WorkflowFilter, 'all'>): ActionItem['badge'] {
  if (workflow === 'checkout') return 'Checkout'
  if (workflow === 'rental') return 'Rental'
  return 'Document Review'
}

function dedupeActionItems(items: ActionItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.key)) return false
    seen.add(item.key)
    return true
  })
}

function getEmptyStateMessage(workflowFilter: WorkflowFilter) {
  if (workflowFilter === 'document_review') {
    return 'All uploaded customer documents have been reviewed.'
  }
  if (workflowFilter !== 'all') {
    return `No actions match the ${getWorkflowLabel(workflowFilter)} workflow filter.`
  }
  return 'No open actions are available right now.'
}

const REQUIRED_DOCUMENT_TYPES = ['pilot_licence', 'medical_certificate', 'photo_id'] as const

function documentTypeLabel(documentType: string) {
  if (documentType === 'pilot_licence') return 'Pilot licence'
  if (documentType === 'medical_certificate') return 'Medical certificate'
  if (documentType === 'photo_id') return 'Photo ID'
  return documentType.replace(/_/g, ' ')
}

function joinDocumentLabels(labels: string[]) {
  if (labels.length <= 1) return labels[0] ?? 'Document'
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

type CheckoutBankTransferSubmissionRow = {
  id: string
  booking_id: string
  reference: string | null
  receipt_storage_path: string | null
  status: string
  submitted_at: string
  created_at: string
}

function getCheckoutPaymentActionState(
  booking: BookingRow,
  submissions: CheckoutBankTransferSubmissionRow[],
): Pick<ActionItem, 'title' | 'description' | 'nextStep' | 'href' | 'receivedAt'> {
  const latestSubmission = submissions[0] ?? null

  if (latestSubmission?.status === 'pending_review') {
    const hasReceipt = Boolean(latestSubmission.receipt_storage_path)
    return {
      title: 'Payment verification pending',
      description: hasReceipt
        ? 'The customer submitted bank transfer proof. Verify the receipt and confirm payment.'
        : 'The customer reported the bank transfer as completed. Verify and approve or reject the payment.',
      nextStep: 'Open payment review',
      href: `/admin/bookings/requests/${booking.id}`,
      receivedAt: latestSubmission.submitted_at ?? latestSubmission.created_at,
    }
  }

  return {
    title: 'Checkout payment required',
    description: 'Follow up with the customer regarding payment.',
    nextStep: 'Review payment',
    href: `/admin/bookings/requests/${booking.id}`,
    receivedAt: booking.updated_at,
  }
}

function getRentalPaymentActionState(
  booking: BookingRow,
  invoice: BookingInvoiceRow | null,
  submissions: BookingBankTransferSubmissionRow[],
): Pick<ActionItem, 'title' | 'description' | 'nextStep' | 'href' | 'receivedAt'> | null {
  const latestSubmission = submissions[0] ?? null

  if (!invoice) {
    return {
      title: 'Rental payment required',
      description: 'Payment is still pending for this rental.',
      nextStep: 'Review payment',
      href: `/admin/bookings/requests/${booking.id}`,
      receivedAt: booking.updated_at,
    }
  }

  if (invoice.status === 'paid' || (invoice.total_paid_cents ?? 0) > 0) return null

  if (latestSubmission?.status === 'pending_review') {
    const hasReceipt = Boolean(latestSubmission.receipt_storage_path)
    const receivedAt = latestSubmission.submitted_at ?? latestSubmission.created_at
    return {
      title: 'Bank transfer review required',
      description: hasReceipt
        ? 'The customer submitted bank transfer proof. Approve or reject the payment.'
        : 'The customer reported the bank transfer as completed. Verify and approve or reject the payment.',
      nextStep: 'Open payment review',
      href: `/admin/bookings/requests/${booking.id}#standard-bank-transfer-review`,
      receivedAt,
    }
  }

  if (latestSubmission?.status === 'rejected') {
    return null
  }

  if (invoice.status === 'failed' && invoice.payment_method !== 'bank_transfer') {
    return {
      title: 'Online payment failed',
      description: 'An online payment attempt did not complete successfully for this rental.',
      nextStep: 'Review payment',
      href: `/admin/bookings/requests/${booking.id}`,
      receivedAt: invoice.updated_at,
    }
  }

  if (invoice.payment_method === 'bank_transfer') {
    return {
      title: 'Bank transfer pending',
      description: 'The customer has selected bank transfer but has not submitted payment proof.',
      nextStep: 'Review payment',
      href: `/admin/bookings/requests/${booking.id}`,
      receivedAt: invoice.updated_at,
    }
  }

  return {
    title: 'Rental payment required',
    description: 'Payment is still pending for this rental.',
    nextStep: 'Review payment',
    href: `/admin/bookings/requests/${booking.id}`,
    receivedAt: invoice.updated_at,
  }
}


export default async function AdminActionsPage({
  searchParams,
}: {
  searchParams?: { sort?: string; urgency?: string }
}) {
  const perf = createPerfLogger({ route: '/admin', role: 'admin' })
  const markTotal = perf.start('admin_home', 'total_server_page_preparation')
  noStore()
  const supabase = await createClient()

  const {
    data: { user },
  } = await perf.time('admin_home', 'identity_preparation', () => getCachedUser())
  if (!user) redirect('/login')

  const { data: profile } = await perf.time(
    'admin_home',
    'profile_preparation',
    () => getCachedProfile(user.id, 'admin'),
    (result) => ({ rowCount: result.data ? 1 : 0 }),
  )
  if (profile?.role !== 'admin') redirect('/dashboard')

  const nowIso = new Date().toISOString()
  const [
    shellBadges,
    customerDocumentRows,
    { data: overageInvoiceRows },
    { count: manualCheckoutPaymentsReview },
    { count: checkoutIssues },
    { data: checkoutRequestedRows },
    { data: checkoutPaymentRows },
    { data: checkoutReviewRows },
    { data: checkoutRescheduleRows },
    { data: checkoutCancelRows },
    { data: standardAwaitingFlightRows },
    { data: standardPostFlightRows },
    { data: standardPaymentRows },
    { data: bookingCancellationRows },
  ] = await perf.time('admin_home', 'primary_query_group', () => Promise.all([
    // Shares request cache with admin layout sidebar badges (no duplicate unread/doc fan-out).
    getCachedAdminShellBadges(),
    getCachedAdminDocumentReviewRows(),
    safeQuery('block time overage invoices', supabase.from('invoices').select('id, invoice_number, created_at, user_id, bookings ( booking_type, pic_name, aircraft ( id, registration ) )').eq('is_block_time_overage', true).eq('status', 'awaiting')),
    safeQuery('checkout manual review count', supabase.from('checkout_bank_transfer_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending_review')),
    safeQuery('checkout issue count', supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer').in('pilot_clearance_status', ['additional_checkout_required', 'checkout_reschedule_required', 'not_currently_eligible'])),
    safeQuery('checkout requested rows', supabase
      .from('bookings')
      .select('id, booking_reference, booking_type, status, scheduled_start, scheduled_end, created_at, updated_at, booking_owner_user_id, pic_name, aircraft ( id, registration )')
      .eq('booking_type', 'checkout')
      .eq('status', 'checkout_requested')
      .order('created_at', { ascending: true })),
    safeQuery('checkout payment rows', supabase
      .from('bookings')
      .select('id, booking_reference, booking_type, status, scheduled_start, scheduled_end, created_at, updated_at, booking_owner_user_id, pic_name, aircraft ( id, registration )')
      .eq('booking_type', 'checkout')
      .eq('status', 'checkout_payment_required')
      .order('created_at', { ascending: true })),
    safeQuery('checkout review rows', supabase
      .from('bookings')
      .select('id, booking_reference, booking_type, status, scheduled_start, scheduled_end, created_at, updated_at, booking_owner_user_id, pic_name, aircraft ( id, registration )')
      .eq('booking_type', 'checkout')
      .eq('status', 'checkout_completed_under_review')
      .order('updated_at', { ascending: true })),
    safeQuery('checkout reschedule rows', supabase
      .from('checkout_change_requests')
      .select('id, checkout_request_id, status, created_at, customer_message, bookings ( id, booking_reference, booking_type, status, scheduled_start, scheduled_end, created_at, updated_at, booking_owner_user_id, pic_name, aircraft ( id, registration ) )')
      .eq('request_type', 'reschedule')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })),
    safeQuery('checkout cancel rows', supabase
      .from('checkout_change_requests')
      .select('id, checkout_request_id, status, created_at, customer_message, bookings ( id, booking_reference, booking_type, status, scheduled_start, scheduled_end, created_at, updated_at, booking_owner_user_id, pic_name, aircraft ( id, registration ) )')
      .eq('request_type', 'cancel')
      .order('created_at', { ascending: true })),
    safeQuery('awaiting flight record rows', supabase
      .from('bookings')
      .select('id, booking_reference, booking_type, status, scheduled_start, scheduled_end, created_at, updated_at, booking_owner_user_id, pic_name, aircraft ( id, registration ), flight_records ( status, submitted_at )')
      .eq('booking_type', 'standard')
      .in('status', ['confirmed', 'ready_for_dispatch', 'dispatched', 'awaiting_flight_record', 'flight_record_overdue'])
      .lte('scheduled_end', nowIso)
      .order('scheduled_end', { ascending: true })),
    safeQuery('post-flight review rows', supabase
      .from('bookings')
      .select('id, booking_reference, booking_type, status, scheduled_start, scheduled_end, created_at, updated_at, booking_owner_user_id, pic_name, aircraft ( id, registration )')
      .eq('booking_type', 'standard')
      .eq('status', 'pending_post_flight_review')
      .order('updated_at', { ascending: true })),
    safeQuery('booking payment rows', supabase
      .from('bookings')
      .select('id, booking_reference, booking_type, status, payment_status, scheduled_start, scheduled_end, created_at, updated_at, booking_owner_user_id, pic_name, aircraft ( id, registration )')
      .eq('booking_type', 'standard')
      .eq('status', 'payment_pending')
      .order('created_at', { ascending: true })),
    safeQuery('booking cancellation rows', supabase
      .from('booking_cancellation_requests')
      .select('id, booking_id, customer_message, created_at, bookings ( id, booking_reference, booking_type, status, scheduled_start, scheduled_end, created_at, updated_at, booking_owner_user_id, pic_name, aircraft ( id, registration ) )')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })),
  ]))

  // bookings.booking_owner_user_id references auth.users, so profiles cannot be
  // embedded in the queries above — resolve customer names with one batched lookup.
  const ownerUserIds = new Set<string>()
  for (const rows of [checkoutRequestedRows, checkoutPaymentRows, checkoutReviewRows, standardAwaitingFlightRows, standardPostFlightRows, standardPaymentRows]) {
    for (const row of rows ?? []) {
      const ownerId = (row as { booking_owner_user_id?: string | null }).booking_owner_user_id
      if (ownerId) ownerUserIds.add(ownerId)
    }
  }
  for (const rows of [checkoutRescheduleRows, checkoutCancelRows, bookingCancellationRows]) {
    for (const row of rows ?? []) {
      const booking = firstItem((row as CancelRequestRow).bookings)
      if (booking?.booking_owner_user_id) ownerUserIds.add(booking.booking_owner_user_id)
    }
  }
  for (const row of overageInvoiceRows ?? []) {
    const invoice = row as { user_id?: string | null; bookings?: unknown }
    if (invoice.user_id) ownerUserIds.add(invoice.user_id)
  }

  const latestDocumentByUserType = new Map<string, UserDocumentRow>()
  for (const row of customerDocumentRows) {
    const doc = row as UserDocumentRow
    const key = `${doc.user_id}:${doc.document_type}`
    if (!latestDocumentByUserType.has(key)) {
      latestDocumentByUserType.set(key, doc)
      ownerUserIds.add(doc.user_id)
    }
  }

  const pendingDocumentsByUser = new Map<string, UserDocumentRow[]>()
  for (const doc of Array.from(latestDocumentByUserType.values())) {
    if (doc.status !== 'uploaded') continue
    const list = pendingDocumentsByUser.get(doc.user_id) ?? []
    list.push(doc)
    pendingDocumentsByUser.set(doc.user_id, list)
  }

  const documentReviewUserIds = Array.from(pendingDocumentsByUser.keys())
  const standardPaymentBookingIds = Array.from(new Set((standardPaymentRows ?? []).map((row) => (row as BookingRow).id)))
  const checkoutPaymentBookingIds = Array.from(new Set((checkoutPaymentRows ?? []).map((row) => (row as BookingRow).id)))

  const [
    { data: ownerProfiles },
    { data: documentReviewBookingRows },
    { data: bookingInvoiceRows },
    { data: bookingBankTransferSubmissionRows },
    { data: checkoutBankTransferSubmissionRows },
  ] = await perf.time(
    'admin_home',
    'followup_parallel_group',
    () => Promise.all([
      ownerUserIds.size
        ? safeQuery(
            'owner profiles',
            supabase.from('profiles').select('id, first_name, last_name, full_name, email').in('id', Array.from(ownerUserIds)),
          )
        : Promise.resolve({ data: [] as Array<ProfileRow & { id: string }> }),
      documentReviewUserIds.length
        ? safeQuery(
            'document review booking rows',
            supabase
              .from('bookings')
              .select('id, booking_owner_user_id, booking_type, status, scheduled_start, created_at, updated_at')
              .in('booking_owner_user_id', documentReviewUserIds)
              .in('status', [
                'on_hold_pending_documents',
                'checkout_requested',
                'checkout_confirmed',
                'checkout_completed_under_review',
                'checkout_payment_required',
                'confirmed',
                'ready_for_dispatch',
                'dispatched',
                'awaiting_flight_record',
                'flight_record_overdue',
              ])
              .order('scheduled_start', { ascending: true }),
          )
        : Promise.resolve({ data: [] as BookingRow[] }),
      standardPaymentBookingIds.length
        ? safeQuery(
            'booking invoice rows',
            supabase
              .from('booking_invoices')
              .select('id, booking_id, status, payment_method, stripe_amount_due_cents, total_paid_cents, paid_at, created_at, updated_at')
              .in('booking_id', standardPaymentBookingIds),
          )
        : Promise.resolve({ data: [] as BookingInvoiceRow[] }),
      standardPaymentBookingIds.length
        ? safeQuery(
            'booking bank transfer submission rows',
            supabase
              .from('booking_bank_transfer_submissions')
              .select('id, invoice_id, booking_id, reference, receipt_storage_path, status, admin_note, submitted_at, reviewed_at, created_at, updated_at')
              .in('booking_id', standardPaymentBookingIds)
              .order('submitted_at', { ascending: false }),
          )
        : Promise.resolve({ data: [] as BookingBankTransferSubmissionRow[] }),
      checkoutPaymentBookingIds.length
        ? safeQuery(
            'checkout bank transfer submission rows',
            supabase
              .from('checkout_bank_transfer_submissions')
              .select('id, booking_id, reference, receipt_storage_path, status, submitted_at, created_at')
              .in('booking_id', checkoutPaymentBookingIds)
              .order('submitted_at', { ascending: false }),
          )
        : Promise.resolve({ data: [] as CheckoutBankTransferSubmissionRow[] }),
    ]),
    (result) => ({
      rowCount: result.reduce((sum, source) => sum + (source.data?.length ?? 0), 0),
    }),
  )
  const profilesById = new Map((ownerProfiles ?? []).map((p: any) => [p.id as string, p as ProfileRow]))
  const profileFor = (userId: string | null | undefined): ProfileRow | null =>
    userId ? profilesById.get(userId) ?? null : null

  const documentReviewBookingsByUser = new Map<string, BookingRow[]>()
  for (const row of documentReviewBookingRows ?? []) {
    const booking = row as BookingRow
    if (!booking.booking_owner_user_id) continue
    const list = documentReviewBookingsByUser.get(booking.booking_owner_user_id) ?? []
    list.push(booking)
    documentReviewBookingsByUser.set(booking.booking_owner_user_id, list)
  }

  const bookingInvoicesByBookingId = new Map<string, BookingInvoiceRow>()
  for (const row of bookingInvoiceRows ?? []) {
    const invoice = row as BookingInvoiceRow
    const current = bookingInvoicesByBookingId.get(invoice.booking_id)
    if (!current || new Date(invoice.updated_at).getTime() > new Date(current.updated_at).getTime()) {
      bookingInvoicesByBookingId.set(invoice.booking_id, invoice)
    }
  }

  const standardPaymentInvoiceIds = Array.from(bookingInvoicesByBookingId.values()).map((invoice) => invoice.id)
  const standardPaymentInvoiceIdSet = new Set(standardPaymentInvoiceIds)
  const bookingBankTransferSubmissionsByBookingId = new Map<string, BookingBankTransferSubmissionRow[]>()
  for (const row of bookingBankTransferSubmissionRows ?? []) {
    const submission = row as BookingBankTransferSubmissionRow
    if (!standardPaymentInvoiceIdSet.has(submission.invoice_id)) continue
    const list = bookingBankTransferSubmissionsByBookingId.get(submission.booking_id) ?? []
    list.push(submission)
    bookingBankTransferSubmissionsByBookingId.set(submission.booking_id, list)
  }

  const checkoutBankTransferSubmissionsByBookingId = new Map<string, CheckoutBankTransferSubmissionRow[]>()
  for (const row of checkoutBankTransferSubmissionRows ?? []) {
    const submission = row as CheckoutBankTransferSubmissionRow
    const list = checkoutBankTransferSubmissionsByBookingId.get(submission.booking_id) ?? []
    list.push(submission)
    checkoutBankTransferSubmissionsByBookingId.set(submission.booking_id, list)
  }

  const awaitingFlightRecords = perf.timeSync(
    'admin_home',
    'dashboard_metric_preparation',
    () => countAwaitingFlightRecords(standardAwaitingFlightRows),
  )

  const checkoutCancelPendingRows = (checkoutCancelRows ?? [])
    .map((row) => {
      const booking = firstItem((row as CancelRequestRow).bookings)
      if (!booking) return null
      const aircraft = firstItem(booking.aircraft)
      const profile = profileFor(booking.booking_owner_user_id)
      const customerLabel = fullCustomerName(profile, booking.pic_name)

      return {
        key: `checkout-cancel-${row.checkout_request_id}`,
        groups: ['checkout'] as WorkflowFilter[],
        badge: 'Checkout' as const,
        badgeTone: 'primary' as const,
        title: 'Checkout cancellation requested',
        description: row.customer_message ? 'Customer submitted a cancellation request.' : 'Pending cancellation request awaiting review.',
        customerLabel,
        customerHref: booking.booking_owner_user_id ? `/admin/users/${booking.booking_owner_user_id}` : null,
        referenceLabel: bookingReference(booking),
        referenceHref: `/admin/bookings/requests/${booking.id}`,
        aircraftLabel: aircraft?.registration ?? null,
        aircraftHref: aircraft?.id ? `/admin/aircraft/${aircraft.id}` : null,
        receivedAt: row.created_at,
        nextStep: 'Review cancellation',
        href: `/admin/bookings/requests/${booking.id}`,
      } satisfies ActionItem
    })
    .filter(Boolean) as ActionItem[]

  const pendingRescheduleBookingIds = new Set(
    (checkoutRescheduleRows ?? [])
      .map((row) => firstItem((row as CancelRequestRow).bookings)?.id)
      .filter((id): id is string => Boolean(id)),
  )

  const checkoutRescheduleItems = (checkoutRescheduleRows ?? [])
    .map((row) => {
      const booking = firstItem((row as CancelRequestRow).bookings)
      if (!booking) return null
      const aircraft = firstItem(booking.aircraft)
      const profile = profileFor(booking.booking_owner_user_id)
      const customerLabel = fullCustomerName(profile, booking.pic_name)

      return {
        key: `checkout-reschedule-${row.checkout_request_id}`,
        groups: ['checkout'] as WorkflowFilter[],
        badge: 'Checkout' as const,
        badgeTone: 'warning' as const,
        title: 'Reschedule requested',
        description: row.customer_message
          ? 'Customer proposed a new checkout time — review and approve or reject.'
          : 'Pending reschedule request awaiting your approval.',
        customerLabel,
        customerHref: booking.booking_owner_user_id ? `/admin/users/${booking.booking_owner_user_id}` : null,
        referenceLabel: bookingReference(booking),
        referenceHref: `/admin/bookings/requests/${booking.id}`,
        aircraftLabel: aircraft?.registration ?? null,
        aircraftHref: aircraft?.id ? `/admin/aircraft/${aircraft.id}` : null,
        receivedAt: row.created_at,
        nextStep: 'Approve or reject',
        href: `/admin/bookings/requests/${booking.id}`,
      } satisfies ActionItem
    })
    .filter(Boolean) as ActionItem[]

  const checkoutRequestItems = (checkoutRequestedRows ?? [])
    .filter((row) => !pendingRescheduleBookingIds.has((row as BookingRow).id))
    .map((row) => {
    const booking = row as BookingRow
    const aircraft = firstItem(booking.aircraft)
    const profile = profileFor(booking.booking_owner_user_id)
    const customerLabel = fullCustomerName(profile, booking.pic_name)
    return {
      key: `checkout-request-${booking.id}`,
      groups: ['checkout'] as WorkflowFilter[],
      badge: 'Checkout' as const,
      badgeTone: 'primary' as const,
      title: 'New checkout request',
      description: 'Review documents and confirm the new checkout request.',
      customerLabel,
      customerHref: booking.booking_owner_user_id ? `/admin/users/${booking.booking_owner_user_id}` : null,
      referenceLabel: bookingReference(booking),
      referenceHref: `/admin/bookings/requests/${booking.id}`,
      aircraftLabel: aircraft?.registration ?? null,
      aircraftHref: aircraft?.id ? `/admin/aircraft/${aircraft.id}` : null,
      receivedAt: booking.created_at,
      nextStep: 'Review and confirm',
      href: `/admin/bookings/requests/${booking.id}`,
    } satisfies ActionItem
  })

  const checkoutOutcomeItems = (checkoutReviewRows ?? []).map((row) => {
    const booking = row as BookingRow
    const aircraft = firstItem(booking.aircraft)
    const profile = profileFor(booking.booking_owner_user_id)
    const customerLabel = fullCustomerName(profile, booking.pic_name)
    return {
      key: `checkout-review-${booking.id}`,
      groups: ['checkout'] as WorkflowFilter[],
      badge: 'Checkout' as const,
      badgeTone: 'success' as const,
      title: 'Checkout completed — record outcome',
      description: 'Flight is done. Record the checkout outcome and move the booking forward.',
      customerLabel,
      customerHref: booking.booking_owner_user_id ? `/admin/users/${booking.booking_owner_user_id}` : null,
      referenceLabel: bookingReference(booking),
      referenceHref: `/admin/bookings/requests/${booking.id}`,
      aircraftLabel: aircraft?.registration ?? null,
      aircraftHref: aircraft?.id ? `/admin/aircraft/${aircraft.id}` : null,
      receivedAt: booking.updated_at,
      nextStep: 'Record outcome',
      href: `/admin/bookings/requests/${booking.id}`,
    } satisfies ActionItem
  })

  const checkoutPaymentItems = (checkoutPaymentRows ?? []).map((row) => {
    const booking = row as BookingRow
    const aircraft = firstItem(booking.aircraft)
    const profile = profileFor(booking.booking_owner_user_id)
    const customerLabel = fullCustomerName(profile, booking.pic_name)
    const workflow = parentWorkflowFromBookingType(booking.booking_type)
    const paymentState = getCheckoutPaymentActionState(
      booking,
      checkoutBankTransferSubmissionsByBookingId.get(booking.id) ?? [],
    )
    return {
      key: `checkout-payment-${booking.id}`,
      groups: [workflow] as WorkflowFilter[],
      badge: badgeFromWorkflow(workflow),
      badgeTone: 'warning' as const,
      title: paymentState.title,
      description: paymentState.description,
      customerLabel,
      customerHref: booking.booking_owner_user_id ? `/admin/users/${booking.booking_owner_user_id}` : null,
      referenceLabel: bookingReference(booking),
      referenceHref: `/admin/bookings/requests/${booking.id}`,
      aircraftLabel: aircraft?.registration ?? null,
      aircraftHref: aircraft?.id ? `/admin/aircraft/${aircraft.id}` : null,
      receivedAt: paymentState.receivedAt,
      nextStep: paymentState.nextStep,
      href: paymentState.href,
    } satisfies ActionItem
  })

  const documentReviewItems = Array.from(pendingDocumentsByUser.entries()).map(([userId, pendingDocs]) => {
    const profile = profileFor(userId)
    const customerLabel = fullCustomerName(profile, null)
    const pendingLabels = pendingDocs.map((doc) => documentTypeLabel(doc.document_type))
    const receivedAt =
      pendingDocs
        .map((doc) => doc.uploaded_at ?? doc.created_at)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
    const relatedBookings = documentReviewBookingsByUser.get(userId) ?? []
    const hasUpcomingActivity = relatedBookings.some((booking) => {
      if (booking.status === 'on_hold_pending_documents') return true
      return Boolean(booking.scheduled_start && new Date(booking.scheduled_start).getTime() >= Date.now())
    })
    const pendingAgeHours =
      receivedAt ? (Date.now() - new Date(receivedAt).getTime()) / (1000 * 60 * 60) : 0
    const description =
      pendingLabels.length <= 3
        ? `${joinDocumentLabels(pendingLabels)} ${pendingLabels.length === 1 ? 'is' : 'are'} awaiting approval.`
        : `${pendingLabels.length} uploaded documents are awaiting approval.`

    return {
      key: `document-review-${userId}`,
      groups: ['document_review'] as WorkflowFilter[],
      badge: 'Document Review' as const,
      badgeTone: 'warning' as const,
      title: 'Review customer documents',
      description,
      customerLabel,
      customerHref: `/admin/users/${userId}?tab=documents`,
      referenceLabel: 'Documents',
      referenceHref: `/admin/users/${userId}?tab=documents`,
      aircraftLabel: null,
      aircraftHref: null,
      receivedAt,
      nextStep: 'Open documents',
      href: `/admin/users/${userId}?tab=documents`,
      sortHint: hasUpcomingActivity ? 0 : 1,
    } satisfies ActionItem
  })

  const overageInvoiceItems = (overageInvoiceRows ?? []).map((row: any) => {
    const booking = firstItem(row.bookings)
    const profile = profileFor(row.user_id)
    const customerLabel = profile ? fullCustomerName(profile, booking?.pic_name ?? null) : 'Customer'
    const workflow = parentWorkflowFromBookingType(booking?.booking_type)
    return {
      key: `overage-${row.id}`,
      groups: [workflow] as WorkflowFilter[],
      badge: badgeFromWorkflow(workflow),
      badgeTone: 'warning' as const,
      title: 'Unpaid block time overage',
      description: 'Customer flew over their purchased block time and is gated until paid.',
      customerLabel,
      customerHref: row.user_id ? `/admin/users/${row.user_id}` : null,
      referenceLabel: `Invoice ${row.invoice_number}`,
      referenceHref: row.user_id ? `/admin/users/${row.user_id}?tab=blockTime` : `/admin/users`,
      aircraftLabel: booking && booking.aircraft ? firstItem(booking.aircraft)?.registration ?? null : null,
      aircraftHref: booking && booking.aircraft && firstItem(booking.aircraft)?.id ? `/admin/aircraft/${firstItem(booking.aircraft)?.id}` : null,
      receivedAt: row.created_at,
      nextStep: 'Settle overage',
      href: row.user_id ? `/admin/users/${row.user_id}?tab=blockTime` : `/admin/users`,
    } satisfies ActionItem
  })

  const bookingFlightItems = (standardAwaitingFlightRows ?? []).map((row) => {
    const booking = row as BookingRow
    const aircraft = firstItem(booking.aircraft)
    const profile = profileFor(booking.booking_owner_user_id)
    const customerLabel = fullCustomerName(profile, booking.pic_name)
    return {
      key: `flight-record-${booking.id}`,
      groups: ['rental'] as WorkflowFilter[],
      badge: 'Rental' as const,
      badgeTone: 'info' as const,
      title: 'Awaiting flight record',
      description: 'Customer flight record submission is still outstanding.',
      customerLabel,
      customerHref: booking.booking_owner_user_id ? `/admin/users/${booking.booking_owner_user_id}` : null,
      referenceLabel: booking.booking_reference ?? booking.id.slice(0, 8).toUpperCase(),
      referenceHref: `/admin/bookings/requests/${booking.id}`,
      aircraftLabel: aircraft?.registration ?? null,
      aircraftHref: aircraft?.id ? `/admin/aircraft/${aircraft.id}` : null,
      receivedAt: booking.updated_at,
      nextStep: 'Check records',
      href: `/admin/bookings/requests/${booking.id}`,
    } satisfies ActionItem
  })

  const bookingPostFlightItems = (standardPostFlightRows ?? []).map((row) => {
    const booking = row as BookingRow
    const aircraft = firstItem(booking.aircraft)
    const profile = profileFor(booking.booking_owner_user_id)
    const customerLabel = fullCustomerName(profile, booking.pic_name)
    return {
      key: `post-flight-${booking.id}`,
      groups: ['rental'] as WorkflowFilter[],
      badge: 'Rental' as const,
      badgeTone: 'info' as const,
      title: 'Post-flight review required',
      description: 'Admin review is pending for the submitted flight record.',
      customerLabel,
      customerHref: booking.booking_owner_user_id ? `/admin/users/${booking.booking_owner_user_id}` : null,
      referenceLabel: booking.booking_reference ?? booking.id.slice(0, 8).toUpperCase(),
      referenceHref: `/admin/bookings/requests/${booking.id}`,
      aircraftLabel: aircraft?.registration ?? null,
      aircraftHref: aircraft?.id ? `/admin/aircraft/${aircraft.id}` : null,
      receivedAt: booking.updated_at,
      nextStep: 'Review and complete',
      href: `/admin/bookings/requests/${booking.id}`,
    } satisfies ActionItem
  })

  const bookingPaymentItems = (standardPaymentRows ?? []).map((row) => {
    const booking = row as BookingRow
    const aircraft = firstItem(booking.aircraft)
    const profile = profileFor(booking.booking_owner_user_id)
    const customerLabel = fullCustomerName(profile, booking.pic_name)
    const workflow = parentWorkflowFromBookingType(booking.booking_type)
    const paymentState = getRentalPaymentActionState(
      booking,
      bookingInvoicesByBookingId.get(booking.id) ?? null,
      bookingBankTransferSubmissionsByBookingId.get(booking.id) ?? [],
    )
    if (!paymentState) return null
    return {
      key: `booking-payment-${booking.id}`,
      groups: [workflow] as WorkflowFilter[],
      badge: badgeFromWorkflow(workflow),
      badgeTone: 'info' as const,
      title: paymentState.title,
      description: paymentState.description,
      customerLabel,
      customerHref: booking.booking_owner_user_id ? `/admin/users/${booking.booking_owner_user_id}` : null,
      referenceLabel: booking.booking_reference ?? booking.id.slice(0, 8).toUpperCase(),
      referenceHref: `/admin/bookings/requests/${booking.id}`,
      aircraftLabel: aircraft?.registration ?? null,
      aircraftHref: aircraft?.id ? `/admin/aircraft/${aircraft.id}` : null,
      receivedAt: paymentState.receivedAt,
      nextStep: paymentState.nextStep,
      href: paymentState.href,
    } satisfies ActionItem
  }).filter(Boolean) as ActionItem[]

  const bookingCancellationItems = ((bookingCancellationRows ?? []).map((row) => {
    const booking = firstItem((row as CancelRequestRow).bookings)
    if (!booking) return null
    const aircraft = firstItem(booking.aircraft)
    const profile = profileFor(booking.booking_owner_user_id)
    const customerLabel = fullCustomerName(profile, booking.pic_name)
    return {
      key: `booking-cancel-${row.id}`,
      groups: ['rental'] as WorkflowFilter[],
      badge: 'Rental' as const,
      badgeTone: 'info' as const,
      title: 'Rental cancellation requested',
      description: (row as CancelRequestRow).customer_message ? 'Customer submitted a cancellation request.' : 'Pending cancellation request awaiting review.',
      customerLabel,
      customerHref: booking.booking_owner_user_id ? `/admin/users/${booking.booking_owner_user_id}` : null,
      referenceLabel: booking.booking_reference ?? booking.id.slice(0, 8).toUpperCase(),
      referenceHref: `/admin/bookings/requests/${booking.id}`,
      aircraftLabel: aircraft?.registration ?? null,
      aircraftHref: aircraft?.id ? `/admin/aircraft/${aircraft.id}` : null,
      receivedAt: row.created_at,
      nextStep: 'Review cancellation',
      href: `/admin/bookings/requests/${booking.id}`,
    } satisfies ActionItem
  }) as Array<ActionItem | null>).filter(Boolean) as ActionItem[]

  const manualCheckoutReviewItem: ActionItem | null = manualCheckoutPaymentsReview
    ? {
        key: 'checkout-manual-review',
        groups: ['checkout'] as WorkflowFilter[],
        badge: 'Checkout',
        badgeTone: 'primary',
        title: 'Checkout bank transfers under manual review',
        description: 'Submitted checkout payments are waiting on admin review.',
        customerLabel: 'Checkout queue',
        customerHref: null,
        referenceLabel: 'Manual review',
        referenceHref: '/admin/checkouts/payments?tab=manual_review',
        aircraftLabel: null,
        aircraftHref: null,
        receivedAt: null,
        nextStep: 'Open payment review',
        href: '/admin/checkouts/payments?tab=manual_review',
        aggregateOnly: true,
        issueLabel: `${manualCheckoutPaymentsReview} submission${manualCheckoutPaymentsReview === 1 ? '' : 's'}`,
      }
    : null

  const checkoutIssueItem: ActionItem | null = checkoutIssues
    ? {
        key: 'checkout-issues',
        groups: ['checkout'] as WorkflowFilter[],
        badge: 'Checkout',
        badgeTone: 'primary',
        title: 'Checkout follow-up required',
        description: 'Customers with additional checkout attention are waiting in the queue.',
        customerLabel: 'Customer follow-up queue',
        customerHref: '/admin/customers/all',
        referenceLabel: 'Customer readiness',
        referenceHref: '/admin/customers/all',
        aircraftLabel: null,
        aircraftHref: null,
        receivedAt: null,
        nextStep: 'Review customers',
        href: '/admin/customers/all',
        aggregateOnly: true,
        issueLabel: `${checkoutIssues} customer${checkoutIssues === 1 ? '' : 's'}`,
      }
    : null

  const checkoutSummaryRows = [
    ...checkoutRequestItems,
    ...checkoutPaymentItems,
    ...checkoutOutcomeItems,
    ...checkoutRescheduleItems,
    ...checkoutCancelPendingRows,
  ]

  const bookingSummaryRows = [
    ...bookingFlightItems,
    ...bookingPostFlightItems,
    ...bookingPaymentItems,
    ...bookingCancellationItems,
  ]

  const actionRows = dedupeActionItems([
    ...documentReviewItems,
    ...checkoutSummaryRows,
    ...bookingSummaryRows,
    ...overageInvoiceItems,
    ...(manualCheckoutReviewItem ? [manualCheckoutReviewItem] : []),
    ...(checkoutIssueItem ? [checkoutIssueItem] : []),
  ].filter((item): item is ActionItem => Boolean(item)))

  const sortedActionRows = [...actionRows].sort((a, b) => {
    const aIsDocumentReview = a.groups.includes('document_review')
    const bIsDocumentReview = b.groups.includes('document_review')
    if (aIsDocumentReview && bIsDocumentReview) {
      const aReceived = a.receivedAt ? new Date(a.receivedAt).getTime() : Number.NEGATIVE_INFINITY
      const bReceived = b.receivedAt ? new Date(b.receivedAt).getTime() : Number.NEGATIVE_INFINITY
      if (aReceived !== bReceived) return bReceived - aReceived
      return a.key.localeCompare(b.key)
    }

    const aReceived = a.receivedAt ? new Date(a.receivedAt).getTime() : Number.NEGATIVE_INFINITY
    const bReceived = b.receivedAt ? new Date(b.receivedAt).getTime() : Number.NEGATIVE_INFINITY
    if (aReceived !== bReceived) return bReceived - aReceived
    const aHint = a.sortHint ?? Number.POSITIVE_INFINITY
    const bHint = b.sortHint ?? Number.POSITIVE_INFINITY
    if (aHint !== bHint) return aHint - bHint
    return a.key.localeCompare(b.key)
  })
  perf.timeSync('admin_home', 'action_feed_preparation', () => sortedActionRows.length, {
    rowCount: sortedActionRows.length,
  })
  const unreadMessageCount = shellBadges.unreadMessageCount
  markTotal({ rowCount: sortedActionRows.length })

  return (
    <div className="admin-command-pilot min-h-full bg-[var(--admin-canvas)] text-[var(--admin-text)]">
      <div className="mx-auto max-w-[1400px] px-4 py-3 pb-24 sm:px-6 sm:py-4 md:px-8 lg:px-10">
        <ActionQueueSection
          actionRows={sortedActionRows}
          unreadMessageCount={unreadMessageCount}
          emptyMessage={getEmptyStateMessage('all')}
          filteredEmptyMessageByWorkflow={{
            checkout: getEmptyStateMessage('checkout'),
            rental: getEmptyStateMessage('rental'),
            document_review: getEmptyStateMessage('document_review'),
          }}
        />
      </div>
    </div>
  )
}
