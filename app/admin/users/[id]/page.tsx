import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import OpenFileButton from '../OpenFileButton'
import CollapsibleSection from '../CollapsibleSection'
import AdminChatPanel from '../AdminChatPanel'
import PilotMetadataEditor from '../PilotMetadataEditor'
import DocumentExpiryEditor from '../DocumentExpiryEditor'
import NextActionCard from '../NextActionCard'
import CurrentActionSection from '../CurrentActionSection'
import CheckoutActivitySection from '../CheckoutActivitySection'
import HistoricalCheckoutEditor from '../HistoricalCheckoutEditor'
import AttentionBadge from '@/app/admin/customers/AttentionBadge'
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
    .select('id, full_name, email, account_status, verification_status, pilot_clearance_status, created_at, updated_at, reviewed_at, admin_review_note, pilot_arn, has_night_vfr_rating, has_instrument_rating')
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
      {/* Back navigation */}
      <div className="mb-10">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-blue-100 transition-colors"
        >
          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'wght' 300" }}>arrow_back</span>
          <span className="text-xs uppercase tracking-widest font-medium">Back to Queue</span>
        </Link>
      </div>

      <div className="max-w-6xl mx-auto space-y-12">

        {/* ── A: Customer Overview ──────────────────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          <div className="md:col-span-2 space-y-6">
            {/* Account + Clearance badges */}
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${ACCOUNT_STATUS_BADGE[accountStatus]}`}>
                {accountStatus === 'blocked' && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                {ACCOUNT_STATUS_LABEL[accountStatus]}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${CLEARANCE_BADGE[clearanceStatus]}`}>
                {CLEARANCE_LABEL[clearanceStatus]}
              </span>
            </div>

            <h1 className="font-serif text-5xl font-bold tracking-tight text-[#e2e2e6]">
              {displayName}
            </h1>
            {attention.hasIssue ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100 flex items-center gap-2">
                <AttentionBadge reason={attention.reason} />
                <span>{attention.reason}</span>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-10">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Account</p>
                <p className="text-blue-200 text-sm">{customerProfile.email || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Pilot ARN</p>
                <PilotMetadataEditor customerId={params.id} initialArn={customerProfile.pilot_arn} />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Night VFR</p>
                <p className={`text-sm ${customerProfile.has_night_vfr_rating === true ? 'text-green-400' : customerProfile.has_night_vfr_rating === false ? 'text-blue-200' : 'text-slate-500 italic'}`}>
                  {customerProfile.has_night_vfr_rating === true ? 'Yes' : customerProfile.has_night_vfr_rating === false ? 'No' : 'Not provided'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Instrument Rating</p>
                <p className={`text-sm ${customerProfile.has_instrument_rating === true ? 'text-green-400' : customerProfile.has_instrument_rating === false ? 'text-blue-200' : 'text-slate-500 italic'}`}>
                  {customerProfile.has_instrument_rating === true ? 'Yes' : customerProfile.has_instrument_rating === false ? 'No' : 'Not provided'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Member Since</p>
                <p className="text-blue-200 text-sm">{submittedAt}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Documents</p>
                <p className="text-blue-200 text-sm">{(documents ?? []).length} / 3</p>
              </div>
            </div>
          </div>

          {/* Next Required Action card — replaces old clearance status card */}
          <NextActionCard
            clearanceStatus={clearanceStatus}
            accountStatus={accountStatus}
            latestCheckoutBookingId={latestCheckoutBookingId}
            historicalCheckoutAction={
              <HistoricalCheckoutEditor
                renderMode="button_only"
                customerId={params.id}
                customerName={displayName}
                clearanceStatus={clearanceStatus}
                hasActiveCheckoutRequest={hasActiveCheckoutRequest}
                defaultPicArn={defaultPicArn}
                aircraftOptions={(aircraftRows ?? []).map((a) => ({
                  id: a.id,
                  registration: a.registration,
                  displayName: a.display_name,
                }))}
                existingLogs={(aircraftLogRows ?? []).map((log: any) => ({
                  id: log.id,
                  aircraftId: log.aircraft_id,
                  aircraftRegistration: Array.isArray(log.aircraft) ? (log.aircraft[0]?.registration ?? 'Unknown') : (log.aircraft?.registration ?? 'Unknown'),
                  aircraftDisplayName: Array.isArray(log.aircraft) ? (log.aircraft[0]?.display_name ?? null) : (log.aircraft?.display_name ?? null),
                  flightDate: log.flight_date,
                  picName: log.pic_name,
                  picArn: log.pic_arn ?? null,
                  vdoStart: log.vdo_start ?? null,
                  vdoStop: log.vdo_stop ?? null,
                  vdoTotal: log.vdo_total ?? null,
                  tachoStart: log.tacho_start ?? null,
                  tachoStop: log.tacho_stop ?? null,
                  tachoTotal: log.tacho_total ?? null,
                  airSwitchStart: log.air_switch_start ?? null,
                  airSwitchStop: log.air_switch_stop ?? null,
                  airSwitchTotal: log.air_switch_total ?? null,
                  mrStart: log.mr_start ?? null,
                  mrStop: log.mr_stop ?? null,
                  mrTotal: log.mr_total ?? null,
                  oilAdded: log.oil_added ?? null,
                  oilTotal: log.oil_total ?? null,
                  fuelAdded: log.fuel_added ?? null,
                  fuelReturned: log.fuel_returned ?? null,
                  landings: log.landings ?? null,
                  source: log.source ?? null,
                  reviewStatus: log.review_status ?? null,
                }))}
                historicalRecord={historicalSummary}
              />
            }
          />
        </section>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        <section className="space-y-4">
          <div>
            <h2 className="text-3xl font-serif text-[#e2e2e6]">Customer Timeline</h2>
            <p className="text-sm text-slate-400 mt-1">A chronological view of this customer’s account, checkout, document, and booking activity.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#13161b] p-6 overflow-x-auto">
            <div className="flex min-w-max items-start gap-5">
              {timelineEvents.map((event, idx) => (
                <div key={`${event.at}-${idx}`} className="w-[320px] flex-shrink-0">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${event.tone === 'green' ? 'bg-green-400' : event.tone === 'red' ? 'bg-red-400' : event.tone === 'amber' ? 'bg-amber-400' : event.tone === 'blue' ? 'bg-blue-400' : 'bg-slate-500'}`} />
                    {idx < timelineEvents.length - 1 ? <span className="h-px flex-1 bg-white/10" /> : null}
                  </div>
                  <div className={`rounded-xl border p-4 ${
                    event.tone === 'green'
                      ? 'border-green-500/20 bg-green-900/10'
                      : event.tone === 'amber'
                      ? 'border-amber-500/20 bg-amber-900/10'
                      : event.tone === 'red'
                      ? 'border-red-500/20 bg-red-900/10'
                      : event.tone === 'blue'
                      ? 'border-blue-500/20 bg-blue-900/10'
                      : 'border-white/10 bg-[#1a1d23]'
                  }`}>
                    <p className="text-base font-semibold text-[#e2e2e6]">{event.title}</p>
                    <p className="text-sm text-slate-300 mt-1">{event.detail}</p>
                    <p className="text-xs text-slate-500 mt-2">{formatDateTime(event.at)}</p>
                    {(event as any).actor?.full_name || (event as any).actor?.email ? (
                      <p className="text-xs text-slate-500 mt-1">
                        Actor: {(event as any).actor?.full_name ?? (event as any).actor?.email}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── B: Current Action ─────────────────────────────────────────── */}
        <CollapsibleSection
          title="Current Action"
          description="Primary clearance decision and immediate operational follow-up."
          defaultOpen={currentActionDefaultOpen}
          summary={CLEARANCE_LABEL[clearanceStatus]}
        >
          <HistoricalCheckoutEditor
            renderMode="summary_only"
            customerId={params.id}
            customerName={displayName}
            clearanceStatus={clearanceStatus}
            hasActiveCheckoutRequest={hasActiveCheckoutRequest}
            defaultPicArn={defaultPicArn}
            aircraftOptions={(aircraftRows ?? []).map((a) => ({
              id: a.id,
              registration: a.registration,
              displayName: a.display_name,
            }))}
            existingLogs={(aircraftLogRows ?? []).map((log: any) => ({
              id: log.id,
              aircraftId: log.aircraft_id,
              aircraftRegistration: Array.isArray(log.aircraft) ? (log.aircraft[0]?.registration ?? 'Unknown') : (log.aircraft?.registration ?? 'Unknown'),
              aircraftDisplayName: Array.isArray(log.aircraft) ? (log.aircraft[0]?.display_name ?? null) : (log.aircraft?.display_name ?? null),
              flightDate: log.flight_date,
              picName: log.pic_name,
              picArn: log.pic_arn ?? null,
              vdoStart: log.vdo_start ?? null,
              vdoStop: log.vdo_stop ?? null,
              vdoTotal: log.vdo_total ?? null,
              tachoStart: log.tacho_start ?? null,
              tachoStop: log.tacho_stop ?? null,
              tachoTotal: log.tacho_total ?? null,
              airSwitchStart: log.air_switch_start ?? null,
              airSwitchStop: log.air_switch_stop ?? null,
              airSwitchTotal: log.air_switch_total ?? null,
              mrStart: log.mr_start ?? null,
              mrStop: log.mr_stop ?? null,
              mrTotal: log.mr_total ?? null,
              oilAdded: log.oil_added ?? null,
              oilTotal: log.oil_total ?? null,
              fuelAdded: log.fuel_added ?? null,
              fuelReturned: log.fuel_returned ?? null,
              landings: log.landings ?? null,
              source: log.source ?? null,
              reviewStatus: log.review_status ?? null,
            }))}
            historicalRecord={historicalSummary}
          />
          <CurrentActionSection
            clearanceStatus={clearanceStatus}
            accountStatus={accountStatus}
            latestCheckoutBookingId={latestCheckoutBookingId}
            adminReviewNote={customerProfile.admin_review_note ?? null}
            reviewedAt={customerProfile.reviewed_at ?? null}
            customerId={params.id}
          />
        </CollapsibleSection>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── C: Documents ───────────────────────────────────────────────── */}
        <CollapsibleSection
          title="Documents"
          description="Pilot licence, medical, identity, and flight documents."
          defaultOpen={false}
          summary={docSummary}
        >
          {(documents ?? []).length === 0 ? (
            <div className="bg-[#1e2023]/60 border border-white/5 rounded-xl p-12 text-center text-slate-500 text-sm font-light">
              No documents have been uploaded by this customer yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(documents as UserDocument[]).map(doc => {
                const meta = DOC_META[doc.document_type] ?? { label: doc.document_type, icon: 'description' }
                const ext = fileExtension(doc.file_name)
                const statusChip = documentStatusChip(doc, clearanceStatus)
                const uploadedAt = new Date(doc.uploaded_at).toLocaleString('en-AU', {
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })

                return (
                  <div
                    key={doc.id}
                    className="relative bg-[#1e2023]/60 backdrop-blur-xl border border-blue-300/5 p-6 rounded-xl group hover:bg-[#282a2d] hover:border-blue-300/15 transition-all duration-300 cursor-pointer"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <span
                        className="material-symbols-outlined text-blue-300 text-3xl group-hover:text-blue-200 transition-colors"
                        style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
                      >
                        {meta.icon}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 bg-[#0c0e11] px-2 py-1 rounded">
                        {ext}
                      </span>
                    </div>

                    <p className="font-sans font-bold text-[#e2e2e6] group-hover:text-blue-300 transition-colors">
                      {meta.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 truncate">{doc.file_name}</p>
                    <div className="mt-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusChip.className}`}>
                        {statusChip.label}
                      </span>
                    </div>

                    {doc.document_type === 'pilot_licence' && (
                      <div className="mt-3 space-y-1">
                        {doc.licence_type && (
                          <p className="text-[10px] text-slate-400">Licence: {doc.licence_type}</p>
                        )}
                        {doc.licence_number && (
                          <p className="text-[10px] text-slate-400">ARN: {doc.licence_number}</p>
                        )}
                        <p className="text-[10px] text-slate-400">
                          Night VFR:{' '}
                          <span className={customerProfile.has_night_vfr_rating === true ? 'text-green-400' : customerProfile.has_night_vfr_rating === false ? 'text-slate-300' : 'text-slate-600 italic'}>
                            {customerProfile.has_night_vfr_rating === true ? 'Yes' : customerProfile.has_night_vfr_rating === false ? 'No' : 'Not provided'}
                          </span>
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Instrument Rating:{' '}
                          <span className={customerProfile.has_instrument_rating === true ? 'text-green-400' : customerProfile.has_instrument_rating === false ? 'text-slate-300' : 'text-slate-600 italic'}>
                            {customerProfile.has_instrument_rating === true ? 'Yes' : customerProfile.has_instrument_rating === false ? 'No' : 'Not provided'}
                          </span>
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Red Card Expiry:{' '}
                          <span className={doc.red_card_expiry_month && doc.red_card_expiry_year ? 'text-green-400' : 'text-slate-600 italic'}>
                            {doc.red_card_expiry_month && doc.red_card_expiry_year
                              ? `${String(doc.red_card_expiry_month).padStart(2, '0')}/${doc.red_card_expiry_year}`
                              : 'Not provided'}
                          </span>
                        </p>
                      </div>
                    )}

                    <div className="mt-6 flex justify-between items-end">
                      <div className="text-[10px] text-slate-500">
                        <p className="uppercase tracking-tighter">Uploaded</p>
                        <p className="font-bold mt-0.5">{uploadedAt}</p>
                      </div>
                      <OpenFileButton storagePath={doc.storage_path} fileName={doc.file_name} />
                    </div>

                    <DocumentExpiryEditor
                      documentId={doc.id}
                      customerId={params.id}
                      initialExpiry={doc.expiry_date}
                      documentType={doc.document_type}
                    />

                    <OpenFileButton
                      storagePath={doc.storage_path}
                      fileName={doc.file_name}
                      asCardOverlay
                    />
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── D: Checkout / Booking Activity ────────────────────────────── */}
        <CollapsibleSection
          title="Checkout / Booking Activity"
          description="Recent checkout and standard booking states for this customer."
          defaultOpen={activityDefaultOpen}
          summary={activitySummary}
        >
          <CheckoutActivitySection
            checkoutBookings={checkoutBookings}
            standardBookings={standardBookings}
          />
        </CollapsibleSection>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── E: Billing & Credits ──────────────────────────────────────── */}
        <CollapsibleSection title="Billing & Credits" description="Credits, refunds, and recent payment ledger activity." defaultOpen={false} summary={creditSummary}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-gradient-to-br from-blue-900/40 to-[#0c1326]/80 border border-blue-500/20 rounded-2xl p-8 backdrop-blur-xl flex flex-col justify-between h-full">
              <div>
                <div className="text-sm font-medium text-blue-200/70 mb-1 uppercase tracking-widest">Available Credit</div>
                <div className="text-5xl font-serif tracking-tight text-white">${(balanceCents / 100).toFixed(2)}</div>
              </div>
              <div className="mt-8 flex gap-4">
                <Link
                  href={`/admin/customers/ledger?customerId=${params.id}`}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors inline-block"
                >
                  Manage Credits & Refunds
                </Link>
              </div>
            </div>

            <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-white font-medium text-sm">Recent Activity</h3>
                <Link
                  href={`/admin/customers/ledger?customerId=${params.id}`}
                  className="text-[10px] uppercase tracking-widest font-bold text-slate-400 hover:text-white transition-colors"
                >
                  View Full History
                </Link>
              </div>
              {transactions.length === 0 ? (
                <div className="text-sm text-slate-500 italic py-4">No credit history.</div>
              ) : (
                <div className="space-y-4">
                  {transactions.slice(0, 5).map(tx => {
                    const isPositive = tx.amount_cents > 0
                    return (
                      <div key={tx.id} className="flex justify-between items-center border-b border-white/5 pb-4 last:border-0 last:pb-0">
                        <div>
                          <div className="text-sm text-slate-300 font-medium capitalize">{tx.entry_type.replace(/_/g, ' ')}</div>
                          <div className="text-xs text-slate-500">{new Date(tx.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className={`text-sm font-medium tabular-nums ${isPositive ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {isPositive ? '+' : ''}${(Math.abs(tx.amount_cents) / 100).toFixed(2)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── F: Chat Details ───────────────────────────────────────────── */}
        <CollapsibleSection
          title="Chat Details"
          description="Conversation history with unread indicators and response context."
          defaultOpen={adminUnreadCount > 0}
          badge={adminUnreadCount}
          summary={chatSummary}
        >
          <AdminChatPanel
            customerId={customerProfile.id}
            events={chatEvents}
            customerName={displayName}
          />
        </CollapsibleSection>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── G: Internal Review History ────────────────────────────────── */}
        <CollapsibleSection
          title="Internal Review History"
          description="Chronological admin decisions, notes, and notification outcomes."
          defaultOpen={false}
          summary={historySummary}
        >
          {(events ?? []).length === 0 ? (
            <div className="bg-[#1e2023]/60 border border-white/5 rounded-xl p-10 text-center text-slate-500 text-sm font-light">
              No review history on record.
            </div>
          ) : (
            <div className="space-y-3">
              {(events as VerificationEvent[]).map(ev => {
                const style = EVENT_STYLE[ev.event_type] ?? EVENT_STYLE.message
                const when  = formatDateTime(ev.created_at)
                return (
                  <div
                    key={ev.id}
                    className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-xl p-5 flex gap-4"
                  >
                    <div className={`w-9 h-9 rounded-full ${style.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <span
                        className={`material-symbols-outlined text-base ${style.color}`}
                        style={{ fontVariationSettings: "'wght' 300" }}
                      >
                        {style.icon}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-[#e2e2e6]">{ev.title}</p>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap font-mono">{when}</span>
                      </div>
                      {ev.body && ev.event_type !== 'message' && (
                        <p className="text-sm text-slate-400 leading-relaxed">{ev.body}</p>
                      )}
                      <div className="flex items-center gap-3 pt-1">
                        {ev.from_status && ev.to_status && (
                          <span className="text-[10px] text-slate-600 font-mono">
                            {ev.from_status.replace(/_/g, ' ')} → {ev.to_status.replace(/_/g, ' ')}
                          </span>
                        )}
                        <span className={`text-[10px] uppercase tracking-wider font-bold ${
                          ev.email_status === 'sent'    ? 'text-green-500/50' :
                          ev.email_status === 'failed'  ? 'text-red-500/50'   :
                          'text-slate-600'
                        }`}>
                          email: {ev.email_status}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleSection>

      </div>
    </div>
  )
}
