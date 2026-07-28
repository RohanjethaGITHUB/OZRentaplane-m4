import { createClient } from '@/lib/supabase/server'
import AdminSidebar from '../AdminSidebar'
import { countAwaitingFlightRecords } from '@/lib/booking/flight-record-status'
import { createPerfLogger } from '@/lib/perf/timing'

type BookingInvoiceRow = {
  id: string
  booking_id: string
  status: string
  payment_method: string | null
  total_paid_cents: number | null
  updated_at: string
}

type BookingBankTransferSubmissionRow = {
  invoice_id: string
  booking_id: string
  status: string
}

export default async function AdminOperationalCounts({ displayName, unreadMessageCount = 0 }: { displayName: string, unreadMessageCount?: number }) {
  const perf = createPerfLogger({ route: '/admin/layout/counts', role: 'admin' })
  const markTotal = perf.start('admin_layout', 'admin_operational_counts_total')
  
  try {
    const supabase = await createClient()
    
    const [
      { count: checkoutNewRequests },
      { count: checkoutAwaitingOutcome },
      { count: checkoutPaymentRequired },
      { data: awaitingFlightRecordRows },
      { count: postFlightReview },
      { data: bookingPaymentRows },
      { count: checkoutManualReview },
      { count: checkoutReschedulePending },
      { data: checkoutCancelRequestRows },
      { data: checkoutLifecycleCancelledRows },
      { count: cancellationPending },
      { count: checkoutIssues },
      { count: overageInvoiceCount },
      { data: customerDocumentRows },
    ] = await perf.time('admin_layout', 'admin_operational_counts_query_group', () => Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_requested'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_completed_under_review'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_payment_required'),
      supabase
        .from('bookings')
        .select('id, status, scheduled_end, flight_records(status, submitted_at)')
        .eq('booking_type', 'standard')
        .in('status', ['confirmed', 'ready_for_dispatch', 'dispatched', 'awaiting_flight_record', 'flight_record_overdue'])
        .lte('scheduled_end', new Date().toISOString()),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'pending_post_flight_review'),
      supabase.from('bookings').select('id').eq('booking_type', 'standard').eq('status', 'payment_pending'),
      supabase.from('checkout_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('checkout_change_requests').select('*', { count: 'exact', head: true }).eq('request_type', 'reschedule').eq('status', 'pending'),
      supabase.from('checkout_change_requests').select('checkout_request_id').eq('request_type', 'cancel'),
      supabase.from('bookings').select('id').eq('booking_type', 'checkout').in('checkout_lifecycle_status', ['cancelled_by_customer', 'cancelled_by_admin']),
      supabase.from('booking_cancellation_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').in('pilot_clearance_status', ['additional_checkout_required', 'checkout_reschedule_required', 'not_currently_eligible']),
      supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('is_block_time_overage', true).eq('status', 'awaiting'),
      supabase
        .from('user_documents')
        .select('user_id, document_type, status, uploaded_at, created_at')
        .in('document_type', ['pilot_licence', 'medical_certificate', 'photo_id'])
        .in('status', ['uploaded', 'approved', 'rejected'])
        .order('uploaded_at', { ascending: false }),
    ]))
  
    const checkoutNewQueue = (checkoutNewRequests ?? 0)
    const checkoutAwaitingOutcomeQueue = (checkoutAwaitingOutcome ?? 0)
    const checkoutPaymentsQueue = (checkoutPaymentRequired ?? 0) + (checkoutManualReview ?? 0)
    const checkoutRescheduleQueue = checkoutReschedulePending ?? 0
    const checkoutIssuesQueue = (checkoutIssues ?? 0) > 0 ? 1 : 0
    const cancelledCheckoutIds = new Set<string>([
      ...(checkoutCancelRequestRows ?? []).map((r) => r.checkout_request_id),
      ...(checkoutLifecycleCancelledRows ?? []).map((r) => r.id),
    ])
    const checkoutCancelledQueue = cancelledCheckoutIds.size
    const checkoutActions = checkoutNewQueue + checkoutAwaitingOutcomeQueue + checkoutPaymentsQueue + checkoutRescheduleQueue + checkoutCancelledQueue + checkoutIssuesQueue
  
    const bookingAwaitingFlightQueue = countAwaitingFlightRecords(awaitingFlightRecordRows)
    const bookingPostFlightQueue = postFlightReview ?? 0
    const bookingPaymentIds = Array.from(new Set((bookingPaymentRows ?? []).map((row) => row.id)))
    const [{ data: bookingInvoices }, { data: bookingBankTransferSubmissions }] = await perf.time('admin_layout', 'dependent_second_query_group', () => Promise.all([
      bookingPaymentIds.length
        ? supabase
            .from('booking_invoices')
            .select('id, booking_id, status, payment_method, total_paid_cents, updated_at')
            .in('booking_id', bookingPaymentIds)
        : Promise.resolve({ data: [] as BookingInvoiceRow[] }),
      bookingPaymentIds.length
        ? supabase
            .from('booking_bank_transfer_submissions')
            .select('invoice_id, booking_id, status')
            .in('booking_id', bookingPaymentIds)
            .order('submitted_at', { ascending: false })
        : Promise.resolve({ data: [] as BookingBankTransferSubmissionRow[] }),
    ]), (result) => ({
      rowCount: (result[0].data?.length ?? 0) + (result[1].data?.length ?? 0),
    }))
    
    const invoiceByBookingId = new Map<string, BookingInvoiceRow>()
    for (const row of bookingInvoices ?? []) {
      const current = invoiceByBookingId.get(row.booking_id)
      if (!current || new Date(row.updated_at).getTime() > new Date(current.updated_at).getTime()) {
        invoiceByBookingId.set(row.booking_id, row)
      }
    }
    
    const latestSubmissionByBookingId = new Map<string, BookingBankTransferSubmissionRow>()
    for (const row of bookingBankTransferSubmissions ?? []) {
      if (!latestSubmissionByBookingId.has(row.booking_id)) latestSubmissionByBookingId.set(row.booking_id, row)
    }
    
    const bookingPaymentsQueue = bookingPaymentIds.filter((bookingId) => {
      const invoice = invoiceByBookingId.get(bookingId)
      const latestSubmission = latestSubmissionByBookingId.get(bookingId)
      if (!invoice) return true
      if (invoice.status === 'paid' || (invoice.total_paid_cents ?? 0) > 0) return false
      if (latestSubmission?.status === 'rejected') return false
      return true
    }).length
    
    const bookingCancellationsQueue = cancellationPending ?? 0
    const overageQueue = overageInvoiceCount ?? 0
    const bookingActions = bookingAwaitingFlightQueue + bookingPostFlightQueue + bookingPaymentsQueue + bookingCancellationsQueue + overageQueue
  
    const latestDocumentByUserType = new Map<string, { status: string }>()
    for (const row of customerDocumentRows ?? []) {
      const key = `${row.user_id}:${row.document_type}`
      if (!latestDocumentByUserType.has(key)) {
        latestDocumentByUserType.set(key, { status: row.status })
      }
    }
    const documentReviewUsers = new Set<string>()
    for (const [key, doc] of Array.from(latestDocumentByUserType.entries())) {
      if (doc.status !== 'uploaded') continue
      documentReviewUsers.add(key.split(':')[0])
    }
    const documentReviewQueue = documentReviewUsers.size
    const totalActions = checkoutActions + bookingActions + documentReviewQueue
    
    markTotal()
    
    return (
      <AdminSidebar
        displayName={displayName}
        unreadMessageCount={unreadMessageCount}
        actionCounts={{
          actions: totalActions,
          checkouts: checkoutActions,
          checkoutNewRequests: checkoutNewQueue,
          checkoutAwaitingOutcome: checkoutAwaitingOutcomeQueue,
          checkoutPayments: checkoutPaymentsQueue,
          checkoutReschedule: checkoutRescheduleQueue,
          checkoutCancelled: checkoutCancelledQueue,
          bookings: bookingActions,
          awaitingFlightRecord: bookingAwaitingFlightQueue,
          bookingOnHold: 0,
          postFlightReview: bookingPostFlightQueue,
          bookingPayments: bookingPaymentsQueue,
          bookingCancellations: bookingCancellationsQueue,
        }}
      />
    )
  } catch (error) {
    console.error('Failed to fetch admin operational counts:', error)
    markTotal()
    // Fallback on error: render Sidebar without counts to prevent layout crash
    return <AdminSidebar displayName={displayName} unreadMessageCount={unreadMessageCount} />
  }
}
