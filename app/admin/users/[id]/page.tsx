import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerProfileTabs from '../CustomerProfileTabs'
import type { UserDocument, VerificationEvent } from '@/lib/supabase/types'
import { formatDateTime } from '@/lib/formatDateTime'
import { getCustomerCreditBalance, getCustomerCreditTransactions } from '@/app/actions/admin'
import { CLEARANCE_BADGE, CLEARANCE_LABEL, ACCOUNT_STATUS_BADGE, ACCOUNT_STATUS_LABEL } from '@/lib/pilot-status'
import type { PilotClearanceStatus, AccountStatus } from '@/lib/supabase/types'
import { getAttentionAssessment } from '@/app/admin/customers/attention-reason'

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

export default async function AdminUserPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch customer profile
  const { data: customerProfile } = await supabase
    .from('profiles')
    .select('id, full_name, email, account_status, verification_status, pilot_clearance_status, terms_accepted_at, created_at, updated_at, reviewed_at, admin_review_note, pilot_arn, has_night_vfr_rating, has_instrument_rating')
    .eq('id', params.id)
    .eq('role', 'customer')
    .single()

  if (!customerProfile) notFound()

  // Fetch documents, events, credits, and bookings in parallel
  const [
    { data: documents },
    { data: events },
    balanceCents,
    transactions,
    { data: checkoutBookingsRaw },
    { data: standardBookingsRaw },
    { data: pendingRescheduleRows },
    { data: pendingCancellationRows },
    { count: onHoldBookingCount },
    { data: historicalCheckoutRow },
    { data: aircraftRows },
    { data: aircraftLogRows },
  ] = await Promise.all([
    supabase
      .from('user_documents')
      .select('*')
      .eq('user_id', params.id)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('verification_events')
      .select('*')
      .eq('user_id', params.id)
      .order('created_at', { ascending: false }),
    getCustomerCreditBalance(params.id),
    getCustomerCreditTransactions(params.id),
    supabase
      .from('bookings')
      .select('id, status, booking_type, checkout_lifecycle_status, scheduled_start, payment_status, aircraft ( id, registration )')
      .eq('booking_owner_user_id', params.id)
      .eq('booking_type', 'checkout')
      .order('scheduled_start', { ascending: false })
      .limit(3),
    supabase
      .from('bookings')
      .select('id, status, booking_type, scheduled_start, payment_status, aircraft ( id, registration )')
      .eq('booking_owner_user_id', params.id)
      .eq('booking_type', 'standard')
      .order('scheduled_start', { ascending: false })
      .limit(3),
    supabase
      .from('checkout_change_requests')
      .select('created_at, original_scheduled_start, checkout_request_id, status, bookings!inner(booking_owner_user_id)')
      .eq('status', 'pending')
      .eq('request_type', 'reschedule')
      .eq('bookings.booking_owner_user_id', params.id),
    supabase
      .from('booking_cancellation_requests')
      .select('created_at, booking_start_time, status, bookings!inner(booking_owner_user_id)')
      .eq('status', 'pending')
      .eq('bookings.booking_owner_user_id', params.id),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_owner_user_id', params.id).eq('status', 'on_hold_pending_documents'),
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
  ])

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
  const latestCheckoutBookingId = checkoutBookings[0]?.id ?? null
  const ACTIVE_CHECKOUT_STATUSES = ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required']
  const hasActiveCheckoutRequest = checkoutBookings.some(
    (b: any) =>
      ACTIVE_CHECKOUT_STATUSES.includes(b.status) &&
      !['cancelled_by_customer', 'cancelled_by_admin', 'customer_cancelled', 'admin_cancelled', 'completed', 'expired', 'rejected'].includes((b.checkout_lifecycle_status ?? '') as string),
  )
  const hasCheckoutRequest = hasActiveCheckoutRequest
  const latestPilotLicenceArn =
    (documents as UserDocument[] | null)?.find((d) => d.document_type === 'pilot_licence' && d.licence_number)?.licence_number ?? null
  const defaultPicArn = customerProfile.pilot_arn ?? latestPilotLicenceArn ?? null

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

  // Unread count: customer messages that admin hasn't read yet
  const adminUnreadCount = (events ?? []).filter(
    (ev: VerificationEvent) => ev.actor_role === 'customer' && ev.admin_read_at === null
  ).length

  // Chat events (messages + on_hold events with body), newest last for rendering
  const chatEvents = (events as VerificationEvent[] ?? []).filter(
    ev => ev.event_type === 'message' || (ev.event_type === 'on_hold' && ev.body)
  )

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
      className="pt-8 pr-10 pb-20 pl-10"
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
        balanceCents={balanceCents ?? 0}
        transactions={transactions ?? []}
        recordedByAdminProfile={
          recordedByAdminProfile ?? null
        }
        onHoldBookingCount={0}
      />
    </div>
  )
}
