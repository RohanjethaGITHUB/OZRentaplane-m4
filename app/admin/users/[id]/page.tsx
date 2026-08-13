import { notFound, redirect } from 'next/navigation'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import CustomerProfileTabs from '../CustomerProfileTabs'
import type { UserDocument, VerificationEvent } from '@/lib/supabase/types'
import { formatDateTime } from '@/lib/formatDateTime'
import { getCustomerCreditBalance, getCustomerCreditTransactions } from '@/app/actions/admin'
import { CLEARANCE_BADGE, CLEARANCE_LABEL, ACCOUNT_STATUS_BADGE, ACCOUNT_STATUS_LABEL } from '@/lib/pilot-status'
import type { PilotClearanceStatus, AccountStatus } from '@/lib/supabase/types'
import { getAttentionAssessment } from '@/app/admin/customers/attention-reason'
import { hasActiveCheckoutBooking } from '@/app/admin/customers/customer-status'

const DOC_META: Record<string, { label: string; icon: string }> = {
  pilot_licence:       { label: 'Commercial Pilot Licence',    icon: 'badge' },
  medical_certificate: { label: 'Class 1 Medical Certificate', icon: 'health_and_safety' },
  photo_id:            { label: 'National Identity Card',      icon: 'id_card' },
}

const EVENT_STYLE: Record<string, { icon: string; color: string; bg: string }> = {
  submitted:   { icon: 'upload_file',   color: 'text-blue-300',   bg: 'bg-blue-900/20' },
  resubmitted: { icon: 'upload_file',   color: 'text-blue-300',   bg: 'bg-blue-900/20' },
  approved:    { icon: 'verified_user', color: 'text-green-400',  bg: 'bg-green-900/20' },
  rejected:    { icon: 'person_off',    color: 'text-red-400',    bg: 'bg-red-900/20' },
  on_hold:     { icon: 'pause_circle',  color: 'text-amber-400',  bg: 'bg-amber-900/20' },
  message:     { icon: 'chat',          color: 'text-slate-400',  bg: 'bg-slate-800/40' },
}

const DOCUMENT_EXPIRY_WARNING_DAYS = 30

function documentStatusChip(doc: UserDocument, _clearanceStatus: PilotClearanceStatus): { label: string; className: string } {
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const expiryUtc = doc.expiry_date ? new Date(`${doc.expiry_date}T00:00:00.000Z`).getTime() : null

  if (doc.document_type === 'medical_certificate' && expiryUtc !== null) {
    const days = Math.ceil((expiryUtc - todayUtc) / (1000 * 60 * 60 * 24))
    if (days < 0) return { label: 'Expired', className: 'bg-red-500/10 border-red-400/30 text-red-300' }
    if (days <= DOCUMENT_EXPIRY_WARNING_DAYS) return { label: 'Expiring Soon', className: 'bg-amber-500/10 border-amber-400/30 text-amber-300' }
  }

  if (doc.status === 'rejected') return { label: 'Rejected', className: 'bg-red-500/10 border-red-400/30 text-red-300' }
  // Uploaded is the valid terminal state — admin does not approve documents.
  return { label: 'Uploaded', className: 'bg-slate-500/10 border-slate-400/30 text-slate-300' }
}

function fileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toUpperCase() ?? 'FILE'
}

// States that require immediate admin attention — auto-expand Current Action
const ACTION_REQUIRED: PilotClearanceStatus[] = [
  'checkout_requested',
  'checkout_completed_under_review',
  'checkout_payment_required',
  'not_currently_eligible',
]

const ACTIVE_STANDARD_BOOKING_STATUSES = [
  'pending_confirmation',
  'confirmed',
  'ready_for_dispatch',
  'dispatched',
  'awaiting_flight_record',
  'flight_record_overdue',
  'pending_post_flight_review',
  'needs_clarification',
  'post_flight_approved',
] as const

export default async function AdminUserPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { tab?: string | string[] }
}) {
  const supabase = await createClient()

  const { data: { user } } = await getCachedUser()
  if (!user) redirect('/login')

  // Admin guard + customer profile in parallel
  const [adminCheckResult, customerProfileResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single(),
    supabase
      .from('profiles')
      .select('id, full_name, email, account_status, verification_status, pilot_clearance_status, terms_accepted_at, created_at, updated_at, reviewed_at, admin_review_note, pilot_arn, has_night_vfr_rating, has_instrument_rating')
      .eq('id', params.id)
      .eq('role', 'customer')
      .single(),
  ])

  // Keep existing admin role check logic
  if (adminCheckResult.data?.role !== 'admin') {
    redirect('/login')
  }

  const customerProfile = customerProfileResult.data
  if (!customerProfile) notFound()

  // Fetch documents, events, credits, and bookings in parallel
  const [
    { data: documents },
    { data: events },
    balanceCents,
    { data: revenueRows },
    transactions,
    { count: totalBookingCount },
    { count: checkoutBookingCount },
    { count: standardBookingCount },
    { data: checkoutBookingsRaw },
    { data: standardBookingsRaw },
    { data: pendingRescheduleRows },
    { data: pendingCancellationRows },
    { count: onHoldBookingCount },
    { data: historicalCheckoutRow },
    { data: aircraftRows },
    { data: aircraftLogRows },
    { data: activeBlockTimeRow },
    { data: blockTimePurchaseRows },
    { data: blockTimeTopupRows },
    { data: blockTimeFlightInvoiceRows },
  ] = await Promise.all([
    supabase
      .from('user_documents')
      .select('*, user_document_files(id, file_name, storage_path, uploaded_at)')
      .eq('user_id', params.id)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('verification_events')
      .select('*')
      .eq('user_id', params.id)
      .order('created_at', { ascending: false })
      .limit(200),
    getCustomerCreditBalance(params.id),
    supabase
      .from('customer_payment_ledger')
      .select('amount_cents, entry_type')
      .eq('customer_id', params.id)
      .gt('amount_cents', 0),
    getCustomerCreditTransactions(params.id),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_owner_user_id', params.id),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_owner_user_id', params.id).eq('booking_type', 'checkout'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_owner_user_id', params.id).eq('booking_type', 'standard'),
    supabase
      .from('bookings')
      .select('id, status, booking_type, checkout_lifecycle_status, scheduled_start, scheduled_end, payment_status, aircraft ( id, registration )')
      .eq('booking_owner_user_id', params.id)
      .eq('booking_type', 'checkout')
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('bookings')
      .select('id, status, booking_type, scheduled_start, scheduled_end, payment_status, aircraft ( id, registration )')
      .eq('booking_owner_user_id', params.id)
      .eq('booking_type', 'standard')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('checkout_change_requests')
      .select('created_at, original_scheduled_start, checkout_request_id, status, bookings!inner(booking_owner_user_id)')
      .eq('status', 'pending')
      .eq('request_type', 'reschedule')
      .eq('bookings.booking_owner_user_id', params.id),
    supabase
      .from('booking_cancellation_requests')
      .select('created_at, booking_start_time, status, booking_id, bookings!inner(booking_owner_user_id)')
      .eq('status', 'pending')
      .eq('bookings.booking_owner_user_id', params.id),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_owner_user_id', params.id).eq('status', 'on_hold_pending_documents'),
    supabase
      .from('historical_checkout_completions')
      .select('id, checkout_date, checkout_outcome, admin_notes, recorded_by_admin_id, recorded_at, linked_aircraft_flight_log_id')
      .eq('customer_id', params.id)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('aircraft')
      .select('id, registration, display_name')
      .order('registration', { ascending: true }),
    supabase
      .from('aircraft_flight_logs')
      .select('id, aircraft_id, flight_date, pic_name, pic_arn, vdo_start, vdo_stop, vdo_total, tacho_start, tacho_stop, tacho_total, air_switch_start, air_switch_stop, air_switch_total, mr_start, mr_stop, mr_total, oil_added, oil_total, fuel_added, fuel_returned, landings, source, review_status, aircraft:aircraft_id (registration, display_name)')
      .order('flight_date', { ascending: false })
      .limit(200),
    supabase
      .from('pilot_block_time_purchases')
      .select('hours_remaining, rate_per_hour, expires_at')
      .eq('user_id', params.id)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('queue_position', { ascending: true, nullsFirst: false })
      .order('activated_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('pilot_block_time_purchases')
      .select('id, status, hours_purchased, hours_remaining, rate_per_hour, amount_paid, purchased_at, expires_at, refund_amount, refunded_at, refund_stripe_id, stripe_payment_intent_id, package:block_time_packages ( name )')
      .eq('user_id', params.id)
      .order('purchased_at', { ascending: false }),
    supabase
      .from('block_time_topups')
      .select('id, purchase_id, hours_added, rate_per_hour, amount_paid, validity_extension_days, hours_remaining_before, hours_remaining_after, expires_at_after, created_at, purchase:pilot_block_time_purchases ( package:block_time_packages ( name ) )')
      .eq('user_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, invoice_number, booking_id, total, status, is_block_time_overage, created_at, paid_at, pdf_url, invoice_line_items ( type )')
      .eq('user_id', params.id)
      .eq('type', 'flight')
      .eq('billing_mode', 'block_time')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const blockTimePurchases = (blockTimePurchaseRows ?? []).map((row: any) => {
    const pkg = Array.isArray(row.package) ? row.package[0] : row.package
    return {
      id: row.id,
      status: row.status,
      hours_purchased: Number(row.hours_purchased),
      hours_remaining: Number(row.hours_remaining),
      rate_per_hour: Number(row.rate_per_hour),
      amount_paid: Number(row.amount_paid),
      purchased_at: row.purchased_at,
      expires_at: row.expires_at,
      refund_amount: row.refund_amount === null ? null : Number(row.refund_amount),
      refunded_at: row.refunded_at,
      refund_stripe_id: row.refund_stripe_id,
      stripe_payment_intent_id: row.stripe_payment_intent_id,
      package_name: pkg?.name ?? 'Block Time',
    }
  })

  const blockTimeTopups = (blockTimeTopupRows ?? []).map((row: any) => {
    const purchase = Array.isArray(row.purchase) ? row.purchase[0] : row.purchase
    const pkg = Array.isArray(purchase?.package) ? purchase?.package[0] : purchase?.package
    return {
      id: row.id,
      purchase_id: row.purchase_id,
      hours_added: Number(row.hours_added),
      rate_per_hour: Number(row.rate_per_hour),
      amount_paid: Number(row.amount_paid),
      validity_extension_days: Number(row.validity_extension_days),
      hours_remaining_before: Number(row.hours_remaining_before),
      hours_remaining_after: Number(row.hours_remaining_after),
      expires_at_after: row.expires_at_after,
      created_at: row.created_at,
      package_name: pkg?.name ?? 'Block Time',
    }
  })

  const activeBlockTime = (activeBlockTimeRow as { hours_remaining: number; rate_per_hour: number; expires_at: string } | null)
    ? {
        hoursRemaining: Number((activeBlockTimeRow as { hours_remaining: number }).hours_remaining),
        ratePerHour: Number((activeBlockTimeRow as { rate_per_hour: number }).rate_per_hour),
        expiresAt: (activeBlockTimeRow as { expires_at: string }).expires_at,
      }
    : null

  const blockTimeFlightInvoices = (blockTimeFlightInvoiceRows ?? []).map((row: any) => {
    const lineTypes: string[] = (row.invoice_line_items ?? []).map((item: any) => item.type)
    const kind = row.is_block_time_overage
      ? 'overage'
      : lineTypes.length > 0 && lineTypes.every((t) => t === 'landing_fee')
        ? 'landing_fee'
        : 'usage'
    return {
      id: row.id as string,
      invoice_number: row.invoice_number as string,
      booking_id: (row.booking_id as string | null) ?? null,
      total: Number(row.total),
      status: row.status as string,
      kind: kind as 'usage' | 'overage' | 'landing_fee',
      created_at: row.created_at as string,
      paid_at: (row.paid_at as string | null) ?? null,
      pdf_url: (row.pdf_url as string | null) ?? null,
    }
  })

  const { data: checkoutStatusHistoryRows } = checkoutBookingsRaw && checkoutBookingsRaw.length > 0
    ? await supabase
        .from('booking_status_history')
        .select('booking_id, old_status, new_status, changed_by_user_id, note, created_at')
        .in('booking_id', checkoutBookingsRaw.map((b: any) => b.id))
        .order('created_at', { ascending: true })
    : { data: [] as Array<any> }

  const displayName = customerProfile.full_name ?? 'Unknown Customer'
  const submittedAt = customerProfile.updated_at
    ? formatDateTime(customerProfile.updated_at)
    : '—'

  const accountStatus   = (customerProfile.account_status ?? 'active') as AccountStatus
  const clearanceStatus = (customerProfile.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus

  const checkoutBookings  = checkoutBookingsRaw ?? []
  const standardBookings  = standardBookingsRaw ?? []
  const activeBookingRows = [
    ...checkoutBookings.filter((booking: any) => hasActiveCheckoutBooking(booking)),
    ...standardBookings.filter((booking: any) => ACTIVE_STANDARD_BOOKING_STATUSES.includes(booking.status)),
  ]
  const activeBookingsSummary = activeBookingRows.length > 0
    ? {
        count: activeBookingRows.length,
        primaryBookingId: activeBookingRows[0]?.id ?? null,
        primaryBookingStart: activeBookingRows[0]?.scheduled_start ?? null,
      }
    : null
  const totalRevenueCents = (revenueRows ?? []).reduce(
    (sum, row: { amount_cents: number | null; entry_type?: string | null }) => sum + (row.amount_cents ?? 0),
    0,
  )
  const latestCheckoutBookingId = checkoutBookings[0]?.id ?? null
  const ACTIVE_CHECKOUT_STATUSES = ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required']
  const hasActiveCheckoutRequest = checkoutBookings.some(
    (b: any) =>
      ACTIVE_CHECKOUT_STATUSES.includes(b.status) &&
      !['cancelled_by_customer', 'cancelled_by_admin', 'customer_cancelled', 'admin_cancelled', 'completed', 'expired', 'rejected'].includes((b.checkout_lifecycle_status ?? '') as string),
  )
  const hasCheckoutRequest = hasActiveCheckoutRequest

  const docsByUser = new Map<string, Array<{ user_id: string; document_type: string; status: string; expiry_date: string | null; medical_class?: string | null }>>()
  for (const doc of (documents as UserDocument[] ?? [])) {
    const list = docsByUser.get(params.id) ?? []
    list.push({
      user_id: params.id,
      document_type: doc.document_type,
      status: doc.status,
      expiry_date: doc.expiry_date,
      medical_class: doc.medical_class,
    })
    docsByUser.set(params.id, list)
  }
  const pendingCheckoutRescheduleByUser = new Map<string, { createdAt: string; originalStart: string | null }>()
  for (const row of pendingRescheduleRows ?? []) {
    const booking = Array.isArray((row as any).bookings) ? (row as any).bookings[0] : (row as any).bookings
    const ownerId = booking?.booking_owner_user_id ?? params.id
    pendingCheckoutRescheduleByUser.set(ownerId, { createdAt: row.created_at, originalStart: row.original_scheduled_start })
  }
  const pendingCancellationByUser = new Map<string, { createdAt: string; bookingStart: string | null }>()
  for (const row of pendingCancellationRows ?? []) {
    const booking = Array.isArray((row as any).bookings) ? (row as any).bookings[0] : (row as any).bookings
    const ownerId = booking?.booking_owner_user_id ?? params.id
    pendingCancellationByUser.set(ownerId, { createdAt: row.created_at, bookingStart: row.booking_start_time })
  }
  const attention = getAttentionAssessment({
    profileId: params.id,
    accountStatus,
    pilotClearanceStatus: clearanceStatus,
    hasCheckoutRequest,
    documentsByUser: docsByUser,
    pendingCheckoutRescheduleByUser,
    pendingCancellationByUser,
  })

  // Chat events (messages + on_hold events with body), newest last for rendering
  const chatEvents = (events as VerificationEvent[] ?? []).filter(
    ev => ev.event_type === 'message' || (ev.event_type === 'on_hold' && ev.body)
  )

  // Unread count: must match inbox / getAdminUnreadCount (chat events only)
  const adminUnreadCount = chatEvents.filter(
    (ev: VerificationEvent) => ev.actor_role === 'customer' && ev.admin_read_at === null
  ).length

  // Section visibility logic
  const currentActionDefaultOpen = ACTION_REQUIRED.includes(clearanceStatus)
  const hasBookingActivity = checkoutBookings.length > 0 || standardBookings.length > 0
  const activityDefaultOpen = hasBookingActivity && (
    clearanceStatus === 'checkout_requested' ||
    clearanceStatus === 'checkout_confirmed' ||
    clearanceStatus === 'checkout_completed_under_review'
  )

  // Collapsed summaries
  const docSummary      = `${(documents ?? []).length} / 3 documents`
  const creditSummary   = `$${(balanceCents / 100).toFixed(2)} credit`
  const chatSummary     = adminUnreadCount > 0 ? `${adminUnreadCount} unread` : `${chatEvents.length} messages`
  const historySummary  = `${(events ?? []).length} events`
  const activitySummary = hasBookingActivity
    ? `${checkoutBookings.length} checkout · ${standardBookings.length} standard`
    : 'No bookings'

  const historicalCheckout = historicalCheckoutRow
    ? {
        id: historicalCheckoutRow.id,
        checkoutDate: historicalCheckoutRow.checkout_date,
        checkoutOutcome: historicalCheckoutRow.checkout_outcome as 'cleared_to_fly' | 'additional_checkout_required' | 'not_currently_eligible',
        adminNotes: historicalCheckoutRow.admin_notes ?? null,
        recordedAt: historicalCheckoutRow.recorded_at,
        recordedByAdminId: historicalCheckoutRow.recorded_by_admin_id,
        linkedFlightLogId: historicalCheckoutRow.linked_aircraft_flight_log_id ?? null,
      }
    : null

  const recordedByAdminProfile = historicalCheckout?.recordedByAdminId
    ? await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', historicalCheckout.recordedByAdminId)
        .maybeSingle()
    : { data: null }

  const linkedLogForSummary = historicalCheckout?.linkedFlightLogId
    ? (aircraftLogRows ?? []).find((log: any) => log.id === historicalCheckout.linkedFlightLogId) ?? null
    : null

  const historicalSummary = historicalCheckout
    ? {
        id: historicalCheckout.id,
        checkoutDate: historicalCheckout.checkoutDate,
        checkoutOutcome: historicalCheckout.checkoutOutcome,
        adminNotes: historicalCheckout.adminNotes,
        recordedAt: historicalCheckout.recordedAt,
        recordedByName: recordedByAdminProfile.data?.full_name ?? null,
        recordedByEmail: recordedByAdminProfile.data?.email ?? null,
        linkedFlightLogId: historicalCheckout.linkedFlightLogId,
        linkedFlightLogAircraftId: linkedLogForSummary?.aircraft_id ?? null,
        linkedFlightLogAircraftRegistration: (() => {
          const aircraftValue = (linkedLogForSummary as any)?.aircraft
          if (Array.isArray(aircraftValue)) return aircraftValue[0]?.registration ?? null
          return aircraftValue?.registration ?? null
        })(),
        linkedFlightLogDate: linkedLogForSummary?.flight_date ?? null,
      }
    : null

  const timelineActors = new Map<string, { full_name: string | null; email: string | null }>()
  const actorIds = new Set<string>()
  for (const row of checkoutStatusHistoryRows ?? []) {
    if (row.changed_by_user_id) actorIds.add(row.changed_by_user_id)
  }
  for (const ev of (events as VerificationEvent[] ?? [])) {
    if (ev.actor_user_id) actorIds.add(ev.actor_user_id)
  }
  if (actorIds.size > 0) {
    const { data: actorProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', Array.from(actorIds))
    for (const actor of actorProfiles ?? []) {
      timelineActors.set(actor.id, { full_name: actor.full_name ?? null, email: actor.email ?? null })
    }
  }

  const cancelledCheckoutBookingIds = new Set(
    (checkoutStatusHistoryRows ?? [])
      .filter((row) => row.new_status === 'cancelled' && (row.note ?? '').toLowerCase().includes('checkout booking cancelled'))
      .map((row) => row.booking_id),
  )

  const timelineEvents = [
    { at: customerProfile.created_at, title: 'Customer registered', detail: 'Customer account was created.', tone: 'slate' as const },
    ...checkoutBookings
      .filter((b: any) => !cancelledCheckoutBookingIds.has(b.id))
      .map((b: any) => ({
      at: b.scheduled_start,
      title: 'Checkout activity',
      detail: `${String(b.status).replace(/_/g, ' ')} (${b.aircraft?.registration ?? 'Aircraft'})`,
      tone: b.status === 'checkout_payment_required' ? 'amber' as const : 'blue' as const,
    })),
    ...standardBookings.map((b: any) => ({
      at: b.scheduled_start,
      title: 'Booking activity',
      detail: `${String(b.status).replace(/_/g, ' ')} (${b.aircraft?.registration ?? 'Aircraft'})`,
      tone: b.status === 'cancelled' ? 'red' as const : 'blue' as const,
    })),
    ...((documents as UserDocument[] ?? []).map((doc) => ({
      at: doc.uploaded_at,
      title: 'Document uploaded',
      detail: DOC_META[doc.document_type]?.label ?? doc.document_type,
      tone: doc.status === 'rejected' ? 'red' as const : 'slate' as const,
    }))),
    ...((events as VerificationEvent[] ?? []).map((ev) => ({
      at: ev.created_at,
      title: ev.title,
      detail: ev.body ?? ev.event_type.replace(/_/g, ' '),
      tone: ev.event_type === 'rejected' || ev.event_type === 'on_hold' ? 'amber' as const : 'slate' as const,
      actor: ev.actor_user_id ? timelineActors.get(ev.actor_user_id) : null,
    }))),
    ...((checkoutStatusHistoryRows ?? [])
      .filter((row) => row.new_status === 'cancelled' && (row.note ?? '').toLowerCase().includes('checkout booking cancelled'))
      .map((row) => ({
        at: row.created_at,
        title: 'Checkout cancelled by admin',
        detail: row.note ?? 'Checkout booking cancelled by admin.',
        tone: 'amber' as const,
        actor: row.changed_by_user_id ? timelineActors.get(row.changed_by_user_id) : null,
      }))),
    ...(historicalSummary ? [{
      at: historicalSummary.recordedAt,
      title: 'Checkout completed / historical record',
      detail: `${historicalSummary.checkoutDate} · ${historicalSummary.checkoutOutcome.replace(/_/g, ' ')}`,
      tone: historicalSummary.checkoutOutcome === 'cleared_to_fly' ? 'green' as const : historicalSummary.checkoutOutcome === 'additional_checkout_required' ? 'amber' as const : 'red' as const,
      actor: null,
    }] : []),
    ...(historicalSummary?.checkoutOutcome === 'cleared_to_fly' ? [{
      at: historicalSummary.recordedAt,
      title: 'Cleared to fly',
      detail: `Marked cleared after historical checkout completion (${historicalSummary.checkoutDate}).`,
      tone: 'green' as const,
      actor: historicalSummary.recordedByName || historicalSummary.recordedByEmail
        ? { full_name: historicalSummary.recordedByName ?? null, email: historicalSummary.recordedByEmail ?? null }
        : null,
    }] : []),
  ]
    .filter((e) => Boolean(e.at))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return (
    <div
      className="pt-8 px-4 pb-20 sm:px-10"
      style={{
        backgroundImage: 'radial-gradient(at 0% 0%, rgba(183,200,222,0.04) 0, transparent 50%), radial-gradient(at 100% 0%, rgba(180,201,219,0.04) 0, transparent 50%)',
      }}
    >
      <CustomerProfileTabs
        customerId={params.id}
        customerProfile={customerProfile}
        accountStatus={accountStatus}
        clearanceStatus={clearanceStatus}
        documents={documents ?? []}
        timelineEvents={timelineEvents}
        events={events ?? []}
        checkoutBookings={checkoutBookings}
        standardBookings={standardBookings}
        activeBookingsSummary={activeBookingsSummary}
        historicalCheckoutRow={
          historicalCheckoutRow ?? null
        }
        pendingRescheduleRows={
          pendingRescheduleRows ?? []
        }
        pendingCancellationRows={
          pendingCancellationRows ?? []
        }
        checkoutStatusHistoryRows={
          checkoutStatusHistoryRows ?? []
        }
        aircraftRows={aircraftRows ?? []}
        aircraftLogRows={aircraftLogRows ?? []}
        blockTimePurchases={blockTimePurchases}
        blockTimeTopups={blockTimeTopups}
        blockTimeFlightInvoices={blockTimeFlightInvoices}
        activeBlockTime={activeBlockTime}
        balanceCents={balanceCents ?? 0}
        totalRevenueCents={totalRevenueCents}
        transactions={transactions ?? []}
        totalBookingCount={totalBookingCount ?? 0}
        checkoutBookingCount={checkoutBookingCount ?? 0}
        standardBookingCount={standardBookingCount ?? 0}
        recordedByAdminProfile={
          recordedByAdminProfile ?? null
        }
        onHoldBookingCount={0}
      />
    </div>
  )
}
