import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/formatDateTime'
import { formatSydTime } from '@/lib/utils/sydney-time'
import AdminBookingActions from './AdminBookingActions'
import AdminCheckoutActions from './AdminCheckoutActions'
import AdminCheckoutReviewPanel from './AdminCheckoutReviewPanel'
import AdminManualCheckoutCompletion from './AdminManualCheckoutCompletion'
import AdminClarificationForm from './AdminClarificationForm'
import AdminOperationalActions from './AdminOperationalActions'
import AdminBankTransferPanel from './AdminBankTransferPanel'
import AdminBankTransferReviewPanel from './AdminBankTransferReviewPanel'
import AdminStandardBillingPanel from './AdminStandardBillingPanel'
import AdminCancellationReviewCard from './AdminCancellationReviewCard'
import AdminHoldBookingActions from './AdminHoldBookingActions'
import { getCheckoutPaymentDisplayState } from '@/lib/checkout-payment-state'
import { getAircraftFlightLogStartSuggestions } from '@/lib/aircraft-flight-log'
import { deriveBookingStatusForFlightRecord } from '@/lib/booking/flight-record-status'

export const metadata = { title: 'Booking Detail | Admin' }

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_CFG: Record<string, {
  label:  string
  color:  string
  bg:     string
  border: string
  icon:   string
}> = {
  // Standard booking lifecycle
  pending_confirmation:            { label: 'Pending Confirmation',      color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: 'pending'        },
  confirmed:                       { label: 'Confirmed',                 color: 'text-[#1a4fd6]',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    icon: 'check_circle'   },
  cancelled:                       { label: 'Cancelled',                 color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    icon: 'cancel'         },
  cancellation_requested:          { label: 'Cancellation Requested',    color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: 'pending_actions'},
  on_hold_pending_documents:       { label: 'On Hold',                  color: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: 'pause_circle'   },
  ready_for_dispatch:              { label: 'Ready for Dispatch',        color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20',   icon: 'flight_takeoff' },
  dispatched:                      { label: 'Dispatched',                color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'flight'         },
  awaiting_flight_record:          { label: 'Awaiting Flight Record',    color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: 'assignment'     },
  flight_record_overdue:           { label: 'Record Overdue',            color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     icon: 'assignment_late'},
  pending_post_flight_review:      { label: 'Post-Flight Review',        color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  icon: 'rate_review'    },
  needs_clarification:             { label: 'Needs Clarification',       color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  icon: 'help'           },
  post_flight_approved:            { label: 'Flight Approved',           color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20',   icon: 'verified'       },
  completed:                       { label: 'Completed',                 color: 'text-[#4b6390]',   bg: 'bg-white',        border: 'border-[#152d5a]/10',       icon: 'done_all'       },
  // Checkout lifecycle
  checkout_requested:              { label: 'Checkout Requested',        color: 'text-[#1a4fd6]',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    icon: 'pending_actions'},
  checkout_confirmed:              { label: 'Checkout Confirmed',        color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20',   icon: 'event_available'},
  checkout_completed_under_review: { label: 'Awaiting Outcome',          color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: 'rate_review'    },
  checkout_payment_required:       { label: 'Payment Required',          color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  icon: 'payments'       },
  no_show:                         { label: 'No Show',                   color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    icon: 'person_off'     },
}

// Pilot clearance status display — replaces the old verification-only label
// shown in the customer card on the booking detail page.
const CLEARANCE_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  checkout_required:                   { label: 'Checkout Required',         color: 'text-[#4b6390]',   bg: 'bg-white',        border: 'border-[#152d5a]/10'        },
  checkout_requested:                  { label: 'Checkout Submitted',        color: 'text-[#1a4fd6]',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20'     },
  checkout_confirmed:                  { label: 'Checkout Confirmed',        color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20'    },
  checkout_completed_under_review:     { label: 'Outcome Under Review',      color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20'    },
  checkout_payment_required:           { label: 'Payment Required',          color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20'   },
  cleared_to_fly:                { label: 'Cleared to Fly',            color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20'  },
  additional_checkout_required:  { label: 'Additional Checkout Reqd',  color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20'    },
  checkout_reschedule_required:  { label: 'Reschedule Required',       color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20'   },
  not_currently_eligible:              { label: 'Not Currently Eligible',    color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20'     },
}

// Human-readable labels for block_type values (admin context).
const BLOCK_TYPE_LABEL: Record<string, string> = {
  customer_booking: 'Flight Block',
  buffer:           'Buffer',
  temporary_hold:   'Temp Hold',
  maintenance:      'Maintenance',
  admin_unavailable:'Admin Block',
  owner_use:        'Owner Use',
}

// ── Page ──────────────────────────────────────────────────────────────────────

type PageProps = { params: { id: string } }

type ScheduleBlockRow = {
  id: string
  block_type: string
  start_time: string
  end_time: string
  status: string
  expires_at?: string | null
  related_booking_id: string | null
  public_label: string | null
  internal_reason: string | null
}

export default async function AdminBookingDetailPage({ params }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Fetch booking — includes booking_type for checkout routing
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_reference,
      booking_type,
      created_at,
      updated_at,
      scheduled_start,
      scheduled_end,
      status,
      pic_name,
      pic_arn,
      estimated_hours,
      estimated_amount,
      customer_notes,
      admin_notes,
      last_flight_date,
      booking_owner_user_id,
      pic_user_id,
      aircraft_id,
      aircraft ( id, registration, aircraft_type, default_hourly_rate, default_preflight_buffer_minutes, default_postflight_buffer_minutes ),
      flight_records ( status, submitted_at )
    `)
    .eq('id', params.id)
    .single()

  if (bookingError) console.error('[AdminBookingDetailPage] booking query error:', bookingError)
  if (!booking) notFound()

  const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft

  // Compute the buffer-expanded window to match the held slot precisely.
  // Buffer values on the aircraft record are used for display; the action
  // derives the window from the actual own-block times (historical buffers).
  // For the detail page approximation, current aircraft buffer values are fine.
  const preBufferMs  = ((aircraft as { default_preflight_buffer_minutes?: number } | null)?.default_preflight_buffer_minutes  ?? 0) * 60_000
  const postBufferMs = ((aircraft as { default_postflight_buffer_minutes?: number } | null)?.default_postflight_buffer_minutes ?? 0) * 60_000
  const expandedWindowStart = new Date(new Date(booking.scheduled_start).getTime() - preBufferMs).toISOString()
  const expandedWindowEnd   = new Date(new Date(booking.scheduled_end).getTime()   + postBufferMs).toISOString()

  // All parallel fetches — customer profile, status history, slot data, and
  // checkout-specific data (documents, messages, linked solo reservation).
  // When the booking is in checkout_completed_under_review (outcome-recording
  // state), also fetch airports list and customer credit balance for the
  // outcome form landing charges and credit display.
  const bookingType       = (booking as { booking_type?: string }).booking_type ?? 'standard'
  const isOutcomePending  = booking.status === 'checkout_completed_under_review'
  const isPaymentRequired = booking.status === 'checkout_payment_required'
  const isCheckoutRequested = bookingType === 'checkout' && booking.status === 'checkout_requested'
  // Standard booking billing panel shown for pending_post_flight_review
  const isStandardBillingPending = bookingType === 'standard' && booking.status === 'pending_post_flight_review'
  // Standard booking payment pending — show bank transfer panel if applicable
  const isStandardPaymentPending = bookingType === 'standard' && booking.status === 'payment_pending'
  // Fetch airports and credit for both checkout outcome form AND standard billing panel
  const needsAirportsAndCredit = isOutcomePending || isStandardBillingPending

  const [
    { data: customer },
    { data: rawHistory },
    { data: ownBlocks },
    { data: overlappingRaw },
    { data: rawDocuments },
    { data: rawMessages },
    { data: airportRows },
    { data: creditRow },
    { data: flightRecordRow },
    { data: aircraftLogsRaw },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, verification_status, pilot_clearance_status, pilot_arn, created_at, account_status, account_lock_reason')
      .eq('id', booking.booking_owner_user_id)
      .single(),
    supabase
      .from('booking_status_history')
      .select('new_status, old_status, note, created_at, changed_by_user_id')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('schedule_blocks')
      .select('id, block_type, start_time, end_time, status, related_booking_id, public_label, internal_reason')
      .eq('related_booking_id', booking.id)
      .order('start_time'),
    supabase
      .from('schedule_blocks')
      .select('id, block_type, start_time, end_time, status, expires_at, related_booking_id, public_label, internal_reason')
      .eq('aircraft_id', booking.aircraft_id)
      .eq('status', 'active')
      .lt('start_time', expandedWindowEnd)
      .gt('end_time', expandedWindowStart)
      .order('start_time'),
    // Customer documents — used in checkout review panel
    supabase
      .from('user_documents')
      .select('document_type, status, expiry_date, issue_date, file_name, licence_type, licence_number, medical_class, id_type, document_number, uploaded_at')
      .eq('user_id', booking.booking_owner_user_id),
    // Customer messages (verification_events) — used in checkout review panel
    supabase
      .from('verification_events')
      .select('id, user_id, actor_user_id, actor_role, event_type, from_status, to_status, title, body, request_kind, is_read, admin_read_at, email_status, email_sent_at, created_at')
      .eq('user_id', booking.booking_owner_user_id)
      .order('created_at', { ascending: false })
      .limit(50),
    // Active airports — fetched for checkout outcome form AND standard billing panel
    needsAirportsAndCredit
      ? supabase.from('airports').select('id, icao_code, name, default_landing_fee_cents').eq('is_active', true).order('name')
      : Promise.resolve({ data: null, error: null }),
    // Customer credit balance — fetched for checkout outcome form AND standard billing panel
    needsAirportsAndCredit
      ? supabase.from('customer_credit_balances').select('balance_cents').eq('customer_id', booking.booking_owner_user_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // Flight record — fetched for standard billing panel
    isStandardBillingPending
      ? supabase.from('flight_records').select('*').eq('booking_id', booking.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isCheckoutRequested
      ? supabase
          .from('aircraft_flight_logs')
          .select('id, flight_date, pic_name, pic_arn, vdo_start, vdo_stop, vdo_total, tacho_start, tacho_stop, tacho_total, air_switch_start, air_switch_stop, air_switch_total, mr_start, mr_stop, mr_total, oil_added, oil_total, fuel_added, fuel_returned, source, review_status')
          .eq('aircraft_id', booking.aircraft_id)
          .order('flight_date', { ascending: false })
          .order('log_number', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: null, error: null }),
  ])

  const documents        = rawDocuments ?? []
  const messages         = rawMessages  ?? []
  const aircraftLogs     = (aircraftLogsRaw ?? []) as Record<string, unknown>[]
  const [checkoutInvoiceResult, suggestionsResult] = await Promise.all([
    supabase
      .from('checkout_invoices')
      .select(`
        id,
        stripe_amount_due_cents,
        checkout_rate_cents_per_hour,
        checkout_duration_hours,
        checkout_final_amount_cents,
        total_paid_cents,
        status
      `)
      .eq('booking_id', booking.id)
      .maybeSingle(),
    booking.aircraft_id
      ? getAircraftFlightLogStartSuggestions(booking.aircraft_id)
      : Promise.resolve({
          latestLog: null,
          nextLogNumber: 1,
          suggestedStarts: { vdo_start: null, tacho_start: null, air_switch_start: null, mr_start: null },
        }),
  ])
  const checkoutInvoice = checkoutInvoiceResult.data
  const flightLogStartSuggestions = suggestionsResult.suggestedStarts
  // Invoice was sent via Stripe if checkoutInvoice exists with a status of 'open' or 'paid'
  const invoiceSentViaStripe = !!(
    checkoutInvoice &&
    checkoutInvoice.stripe_amount_due_cents &&
    checkoutInvoice.stripe_amount_due_cents > 0
  )

  // Sort airports so Sydney Bankstown (YSBK) appears first, then alphabetically.
  const rawAirports = (airportRows ?? []) as { id: string; icao_code: string; name: string; default_landing_fee_cents: number }[]
  const airports = [...rawAirports].sort((a, b) => {
    const isBankstownA = a.icao_code === 'YSBK' || a.name.toLowerCase().includes('bankstown')
    const isBankstownB = b.icao_code === 'YSBK' || b.name.toLowerCase().includes('bankstown')
    if (isBankstownA && !isBankstownB) return -1
    if (!isBankstownA && isBankstownB) return 1
    return a.name.localeCompare(b.name)
  })

  const customerCreditCents = (creditRow as { balance_cents?: number } | null)?.balance_cents ?? 0

  // ── Bank transfer submissions (checkout) ─────────────────────────────────
  type BankTransferSub = {
    id: string
    status: string
    reference: string | null
    receipt_storage_path: string
    admin_note: string | null
    submitted_at: string
    reviewed_at: string | null
    signedReceiptUrl: string | null
  }
  let bankTransferSubmissions: BankTransferSub[] = []
  if (isPaymentRequired) {
    const { data: invoiceRow } = await supabase
      .from('checkout_invoices')
      .select('id')
      .eq('booking_id', booking.id)
      .single()
    if (invoiceRow) {
      const { data: subs } = await supabase
        .from('checkout_bank_transfer_submissions')
        .select('id, status, reference, receipt_storage_path, admin_note, submitted_at, reviewed_at')
        .eq('invoice_id', invoiceRow.id)
        .order('submitted_at', { ascending: false })

      bankTransferSubmissions = await Promise.all(
        (subs ?? []).map(async (sub) => {
          const { data: signedData } = await supabase.storage
            .from('bank_transfer_receipts')
            .createSignedUrl(sub.receipt_storage_path, 3600)
          return { ...sub, signedReceiptUrl: signedData?.signedUrl ?? null }
        })
      )
    }
  }

  // ── Bank transfer submissions (standard booking) ──────────────────────────
  let standardBankTransferSubmissions: BankTransferSub[] = []
  let standardInvoiceAmountDueCents = 0
  if (isStandardPaymentPending) {
    const { data: stdInvoiceRow } = await supabase
      .from('booking_invoices')
      .select('id, stripe_amount_due_cents')
      .eq('booking_id', booking.id)
      .single()
    if (stdInvoiceRow) {
      standardInvoiceAmountDueCents = (stdInvoiceRow as { stripe_amount_due_cents?: number | null }).stripe_amount_due_cents ?? 0
      const { data: stdSubs } = await supabase
        .from('booking_bank_transfer_submissions')
        .select('id, status, reference, receipt_storage_path, admin_note, submitted_at, reviewed_at')
        .eq('invoice_id', stdInvoiceRow.id)
        .order('submitted_at', { ascending: false })

      standardBankTransferSubmissions = await Promise.all(
        (stdSubs ?? []).map(async (sub) => {
          const { data: signedData } = await supabase.storage
            .from('bank_transfer_receipts')
            .createSignedUrl(sub.receipt_storage_path, 3600)
          return { ...sub, signedReceiptUrl: signedData?.signedUrl ?? null }
        })
      )
    }
  }

  // ── Derive manual payment pending state ───────────────────────────────────────
  const latestBankTransferSub = bankTransferSubmissions[0] ?? null
  const checkoutPaymentDisplayState = getCheckoutPaymentDisplayState(
    isPaymentRequired ? { status: 'payment_required' } : null,
    latestBankTransferSub,
  )
  const isAwaitingManualPayment = checkoutPaymentDisplayState === 'awaiting_manual_payment_confirmation'

  // Standard booking: awaiting manual payment confirmation
  const latestStdBankSub = standardBankTransferSubmissions[0] ?? null
  const isStandardAwaitingManualPayment =
    isStandardPaymentPending &&
    latestStdBankSub != null &&
    (latestStdBankSub.status === 'pending_review' || latestStdBankSub.status === 'approved')

  // External conflicts: active blocks in the held window NOT belonging to this booking.
  const nowDate = new Date()
  const externalConflicts = ((overlappingRaw ?? []) as ScheduleBlockRow[]).filter(b => {
    if (b.related_booking_id === booking.id) return false
    if (b.block_type === 'temporary_hold' && b.expires_at != null && new Date(b.expires_at) <= nowDate) return false
    return true
  })

  const status = deriveBookingStatusForFlightRecord(booking)
  // bookingType is already declared above (const bookingType = ...)
  const statusCfgBase = STATUS_CFG[status] ?? {
    label:  status.replace(/_/g, ' '),
    color:  'text-[#4b6390]',
    bg:     'bg-white',
    border: 'border-[#152d5a]/10',
    icon:   'info',
  }
  const statusCfg =
    isAwaitingManualPayment || isStandardAwaitingManualPayment
      ? { label: 'Manual Payment Submitted', color: 'text-[#1a4fd6]', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: 'account_balance' }
      : statusCfgBase
  const clearanceStatus  = (customer as { pilot_clearance_status?: string } | null)?.pilot_clearance_status ?? 'checkout_required'
  const clearanceCfgBase = CLEARANCE_CFG[clearanceStatus] ?? CLEARANCE_CFG.checkout_required
  const clearanceCfg = isAwaitingManualPayment
    ? { label: 'Awaiting Payment Confirmation', color: 'text-[#1a4fd6]', bg: 'bg-blue-500/10', border: 'border-blue-500/20' }
    : clearanceCfgBase
  const bookingRef    = (booking as { booking_reference?: string }).booking_reference
    ?? booking.id.split('-')[0].toUpperCase()
  const statusHistory = rawHistory ?? []
  const checkoutSteps = [
    { key: 'checkout_requested',              label: 'Checkout\nRequested', color: '#90a4ae' },
    { key: 'checkout_confirmed',              label: 'Checkout\nConfirmed', color: '#42a5f5' },
    { key: 'checkout_completed_under_review', label: 'Awaiting\nOutcome',   color: '#ffa726' },
    { key: 'checkout_payment_required',       label: 'Payment\nRequired',   color: '#ef5350' },
    { key: 'completed',                       label: 'Completed',           color: '#2e7d32' },
  ] as const
  const formatStatusLabel = (value: string) =>
    value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  const formatDayMonth = (value: string) =>
    new Date(value).toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
      day: 'numeric',
      month: 'short',
    })
  const heroClearance = clearanceStatus === 'cleared_to_fly'
    ? { label: 'Cleared to fly', className: 'bg-[#1a4fd6]/20 text-[#93b4ff]' }
    : clearanceStatus === 'checkout_payment_required'
      ? { label: 'Payment required', className: 'bg-amber-500/20 text-amber-300' }
      : { label: formatStatusLabel(clearanceStatus), className: 'bg-white/10 text-white/60' }
  const mostRecentNoteItem = [...statusHistory].reverse().find((item) => item.note)
  const { data: termsAcceptanceRow } = await supabase
    .from('booking_terms_acceptances')
    .select('accepted_at, terms_version, terms_document_id, accepted_ip, user_agent')
    .eq('booking_id', booking.id)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  let acceptedTermsPublicUrl: string | null = null
  if (termsAcceptanceRow?.terms_document_id) {
    const { data: termsDocRow } = await supabase
      .from('terms_documents')
      .select('public_url')
      .eq('id', termsAcceptanceRow.terms_document_id)
      .maybeSingle()
    acceptedTermsPublicUrl = (termsDocRow as { public_url?: string | null } | null)?.public_url ?? null
  }

  // ── Standard booking state flags ────────────────────────────────────────────
  const isPending               = status === 'pending_confirmation'
  const isCancellationRequested = status === 'cancellation_requested'
  const isClarificationState    = status === 'needs_clarification'
  // post_flight_approved stays operational until billing is finalised;
  // once payment_pending the standard billing panel replaces operational actions.
  const OPERATIONAL_STATUSES    = ['confirmed', 'ready_for_dispatch', 'dispatched']
  const isOperational           = OPERATIONAL_STATUSES.includes(status)

  // ── Fetch pending cancellation request for review ─────────────────────────
  type CancellationReqAdmin = {
    id:                  string
    customer_message:    string | null
    booking_start_time:  string
  }
  let cancellationReqAdmin: CancellationReqAdmin | null = null
  if (isCancellationRequested) {
    const { data: crData } = await supabase
      .from('booking_cancellation_requests')
      .select('id, customer_message, booking_start_time')
      .eq('booking_id', booking.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    cancellationReqAdmin = (crData as CancellationReqAdmin | null) ?? null
  }
  const canRequestClarification = status === 'pending_confirmation' || status === 'confirmed'
  const clarificationQuestion = [...statusHistory].reverse().find(r => r.new_status === 'needs_clarification')?.note ?? null
  const clarificationResponse = [...statusHistory].reverse().find(r => r.old_status === 'needs_clarification' && r.new_status === 'pending_confirmation')?.note ?? null

  // ── Checkout-specific state flags ────────────────────────────────────────────
  const isCheckout              = bookingType === 'checkout'
  const isCheckoutRequestedStatus = isCheckout && status === 'checkout_requested'
  const isCheckoutConfirmed     = isCheckout && status === 'checkout_confirmed'
  const isCheckoutOutcomePending = isCheckout && status === 'checkout_completed_under_review'
  const isOnHold                = status === 'on_hold_pending_documents'
  // Checkout bookings need their own action panel — not the standard one
  const needsCheckoutActions    = isCheckoutRequestedStatus || isCheckoutConfirmed || isCheckoutOutcomePending

  const activeOwnBlocks = ((ownBlocks ?? []) as ScheduleBlockRow[]).filter(b => b.status === 'active')
  const slotHeld        = activeOwnBlocks.length > 0
  const hasConflict     = externalConflicts.length > 0

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">

      {/* Back links */}
      <div className="mb-8 flex items-center gap-2">
        <Link
          href="/admin/bookings/checkout?status=checkout_requested"
          className="inline-flex items-center gap-1 text-[#4b6390] hover:text-[#152d5a] text-sm transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Checkout Requests
        </Link>
        <span className="text-[#9ca3af]">·</span>
        <Link
          href="/admin/bookings/checkout?status=all"
          className="inline-flex items-center gap-1 text-[#4b6390] hover:text-[#152d5a] text-sm transition-colors"
        >
          All bookings
        </Link>
      </div>

      {isOnHold && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-300 text-[22px] mt-0.5">warning</span>
              <div>
                <h2 className="text-sm font-semibold text-amber-200">
                  This booking is on hold pending document approval.
                </h2>
                <p className="mt-1 text-sm text-amber-100/80">
                  It will automatically restore once all required documents are approved.
                </p>
                <p className="mt-3 text-xs text-amber-100/70">
                  Customer:{' '}
                  <Link
                    href={`/admin/customers/${customer?.id}`}
                    className="font-semibold text-amber-100 underline decoration-amber-100/30 underline-offset-2 hover:text-white"
                  >
                    {customer?.full_name ?? 'Unknown Customer'}
                  </Link>
                </p>
              </div>
            </div>
            <div className="w-full max-w-md">
              <AdminHoldBookingActions bookingId={booking.id} />
            </div>
          </div>
        </div>
      )}

      {/* Header card */}
      <header className="mb-10 bg-[#152d5a]/90 border border-[#152d5a]/10 rounded-2xl pt-12 sm:pt-8 px-8 pb-8 relative overflow-hidden">
        <span
          className="material-symbols-outlined text-[130px] absolute -right-4 -bottom-8 text-white/[0.03] pointer-events-none select-none"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {isCheckout ? 'how_to_reg' : 'flight_takeoff'}
        </span>
        <div className="relative z-10 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-widest font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/60">
                CHECKOUT FLIGHT
              </span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
                {statusCfg.label === 'Completed'
                  ? <span className="text-[11px]">✓</span>
                  : (
                    <span className={`material-symbols-outlined text-[14px] ${statusCfg.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                      {statusCfg.icon}
                    </span>
                  )}
                {statusCfg.label}
              </span>
            </div>
            <div className="text-[20px] md:text-xl font-semibold text-white leading-tight mb-1">
              {customer?.full_name ?? '—'}
            </div>
            <div className="text-xs text-white/45 whitespace-nowrap">
              {(aircraft as { registration?: string } | null)?.registration ?? ''}
              {(aircraft as { registration?: string } | null)?.registration && ' · '}
              {(aircraft as { aircraft_type?: string } | null)?.aircraft_type?.replace(/^Cessna 172$/, 'Cessna 172N') ?? 'Cessna 172N'}
            </div>
          </div>
          <div className="text-left md:text-right shrink-0">
            <div className="mb-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap ${heroClearance.className}`}>
                {heroClearance.label}
              </span>
            </div>
            <div className="text-[11px] text-white/35 mt-1 md:mt-0">
              Submitted {formatDateTime(booking.created_at)}
            </div>
          </div>
        </div>
      </header>

      <div className="hidden md:block bg-white border border-t-0 border-[#152d5a]/10 rounded-b-2xl px-6 py-5 mb-4">
        <div className="text-[13px] font-semibold text-deep-ink mb-3">
          Booking Status
        </div>
        <div className="flex items-start gap-3">
          {checkoutSteps.map((step, i) => {
            const historyItem = statusHistory.find(h => h.new_status === step.key)
            const reached = !!historyItem
            const isCurrent = booking.status === step.key
            const nextStep = checkoutSteps[i + 1]
            const nextHistoryItem = nextStep ? statusHistory.find(h => h.new_status === nextStep.key) : null
            const nextStepReached = !!nextHistoryItem
            const dotStyle = isCurrent
              ? {
                  width: '14px',
                  height: '14px',
                  background: step.color,
                  borderColor: 'transparent',
                  outline: `2px solid ${step.color}4d`,
                  outlineOffset: '2px',
                }
              : reached
                ? {
                    width: '10px',
                    height: '10px',
                    background: `${step.color}70`,
                    borderColor: 'transparent',
                  }
                : {
                    width: '10px',
                    height: '10px',
                    background: 'transparent',
                    borderColor: 'rgba(21,45,90,0.15)',
                    borderWidth: '1.5px',
                  }
            const lineBg = reached && nextStepReached
              ? `${step.color}66`
              : reached
                ? 'rgba(21,45,90,0.1)'
                : 'rgba(21,45,90,0.08)'
            return (
              <div key={step.key} className="flex-1 flex flex-col items-center relative min-w-0 px-1">
                {i < 4 && (
                  <div
                    className="absolute top-[6px] left-[calc(50%+7px)] right-[calc(-50%+7px)] h-[1.5px]"
                    style={{ background: lineBg }}
                  />
                )}
                <div
                  className="rounded-full mb-[6px] z-10 border"
                  style={dotStyle}
                />
                <div
                  className={`uppercase tracking-wide text-center leading-[1.35] px-1 whitespace-pre-line ${isCurrent ? 'text-sm font-semibold text-[#0C2340]' : 'text-xs font-medium text-[#3d5a80]'}`}
                >
                  {step.label}
                </div>
                {reached && historyItem?.created_at && (
                  <div className={`text-[11px] text-center mt-1 ${isCurrent ? 'text-[#0C2340]' : 'text-[#3d5a80]'}`}>
                    {formatDayMonth(historyItem.created_at)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="md:hidden bg-white border border-t-0 border-[#152d5a]/10 rounded-b-2xl px-4 py-3 mb-3">
        {checkoutSteps
          .filter(step =>
            statusHistory.some(h => h.new_status === step.key)
          )
              .map((step, i, arr) => {
            const historyItem = statusHistory.find(h => h.new_status === step.key)
            const isCurrent = booking.status === step.key
            return (
            <div key={step.key}>
                <div className="flex items-center justify-between py-[5px]">
                  <div className="flex items-center gap-2.5">
                  <div
                    className="rounded-full shrink-0"
                    style={{
                      width: isCurrent ? 10 : 8,
                      height: isCurrent ? 10 : 8,
                      background: isCurrent ? step.color : `${step.color}70`
                    }}
                  />
                    <span
                    className={isCurrent ? 'text-[12px] font-semibold text-[#0C2340]' : 'text-[12px] font-medium text-[#3d5a80]'}>
                      {step.label.replace('\n', ' ')}
                    </span>
                  </div>
                <span className={isCurrent ? 'text-[11px] text-[#0C2340]' : 'text-[11px] text-[#3d5a80]'}>
                  {historyItem?.created_at ? formatDayMonth(historyItem.created_at) : '—'}
                </span>
              </div>
              {i < arr.length - 1 && (
                <div className="w-px h-3 ml-[4px]" style={{ background: 'rgba(21,45,90,0.1)' }} />
              )}
            </div>
          )})}
        {mostRecentNoteItem?.note && (
          <p className="text-[11px] text-[#9ca3af] mt-2 pt-2 border-t border-[#152d5a]/[0.08]">
            {mostRecentNoteItem.note}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── Left column: details ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6 order-last lg:order-first">

          {/* ── Checkout bank transfer panel — shown when checkout payment required ── */}
          {isPaymentRequired && !invoiceSentViaStripe && (
            <AdminBankTransferPanel
              bookingId={booking.id}
              bookingType="checkout"
              amountCents={checkoutInvoice?.stripe_amount_due_cents ?? 0}
            />
          )}

          {isPaymentRequired && invoiceSentViaStripe && (
            <div className="bg-[#f0f6ff] border border-[#1a4fd6]/20 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-[#e8f0fe] flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[20px] text-[#1a4fd6]">receipt_long</span>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#152d5a]">Invoice sent to customer</p>
                <p className="text-[12px] text-[#4b6390] mt-1">
                  A payment invoice has been issued. Awaiting customer payment.
                  {checkoutInvoice?.stripe_amount_due_cents
                    ? ` Amount due: $${(checkoutInvoice.stripe_amount_due_cents / 100).toFixed(2)}`
                    : ''}
                </p>
              </div>
            </div>
          )}

          {isPaymentRequired && invoiceSentViaStripe && latestBankTransferSub && isAwaitingManualPayment && (
            <AdminBankTransferReviewPanel bookingId={booking.id} submission={latestBankTransferSub} />
          )}

          {/* ── Standard booking manual payment panel ────────────────────────── */}
          {isStandardPaymentPending && (
            <AdminBankTransferPanel
              bookingId={booking.id}
              bookingType="standard"
              amountCents={standardInvoiceAmountDueCents}
            />
          )}

          {/* ── Checkout request review panel — shown for checkout_requested ─── */}
          {isCheckoutRequestedStatus && (
            <AdminCheckoutReviewPanel
              bookingId={booking.id}
              aircraftId={booking.aircraft_id}
              bookingReference={bookingRef}
              scheduledStart={booking.scheduled_start}
              scheduledEnd={booking.scheduled_end}
              customerNotes={(booking as { customer_notes?: string | null }).customer_notes ?? null}
              lastFlightDate={(booking as { last_flight_date?: string | null }).last_flight_date ?? null}
              customerId={booking.booking_owner_user_id}
              customerName={(customer as { full_name?: string | null } | null)?.full_name ?? null}
              customerEmail={(customer as { email?: string | null } | null)?.email ?? null}
              pilotArn={(customer as { pilot_arn?: string | null } | null)?.pilot_arn ?? null}
              clearanceLabel={clearanceCfg.label}
              clearanceColor={clearanceCfg.color}
              clearanceBg={clearanceCfg.bg}
              clearanceBorder={clearanceCfg.border}
              documents={documents as import('@/app/admin/bookings/requests/[id]/AdminCheckoutReviewPanel').DocSummary[]}
              messages={messages as import('@/lib/supabase/types').VerificationEvent[]}
            />
          )}

          {termsAcceptanceRow && (
            <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-6">
              <h2 className="text-xs uppercase tracking-widest font-semibold text-[#4b6390] mb-5">
                Customer accepted Terms and Conditions
              </h2>
              <div className="space-y-2 text-sm text-[#4b6390]">
                <p>Accepted date/time: {termsAcceptanceRow.accepted_at ? formatDateTime(termsAcceptanceRow.accepted_at) : '—'}</p>
                <p>Version: {termsAcceptanceRow.terms_version ?? '—'}</p>
                <p>IP: {termsAcceptanceRow.accepted_ip ?? '—'}</p>
                <p>Browser: {termsAcceptanceRow.user_agent ?? '—'}</p>
                {acceptedTermsPublicUrl && (
                  <p>
                    <a href={acceptedTermsPublicUrl} target="_blank" rel="noreferrer" className="text-[#1a4fd6] hover:underline">
                      View accepted terms document
                    </a>
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-white border border-[#152d5a]/10 p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#152d5a]/10">
              <h2 className="text-[13px] font-semibold text-deep-ink">
                Customer & flight
              </h2>
              <a href={`/admin/users/${customer?.id}`}
                className="text-[11px] text-[#1a4fd6] flex items-center gap-0.5">
                Full profile →
              </a>
            </div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-[15px] font-semibold text-deep-ink">
                  {customer?.full_name ?? '—'}
                </div>
                <div className="text-xs text-[#4b6390] mt-0.5">
                  {customer?.email}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-[9px] uppercase tracking-widest font-semibold text-[#4b6390] mb-0.5">Pilot ARN</div>
                <div className="text-[13px] text-deep-ink">
                  {customer?.pilot_arn ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-widest font-semibold text-[#4b6390] mb-0.5">Clearance</div>
                <div
                  className="text-[13px]"
                  style={{
                    color: clearanceStatus === 'cleared_to_fly'
                      ? '#1a4fd6'
                      : clearanceStatus === 'checkout_payment_required'
                        ? '#d97706'
                        : '#6b7280',
                  }}
                >
                  {clearanceStatus === 'cleared_to_fly'
                    ? 'Cleared to fly'
                    : clearanceStatus === 'checkout_payment_required'
                      ? 'Payment required'
                      : formatStatusLabel(clearanceStatus)}
                </div>
              </div>
            </div>
            <div className="border-t border-[#152d5a]/10 my-4" />
            <div className="text-[9px] uppercase tracking-widest font-semibold text-[#4b6390] mb-3">Flight details</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <div className="text-[9px] uppercase tracking-widest font-semibold text-[#4b6390] mb-0.5">Scheduled start</div>
                <div className="text-[13px] text-deep-ink">
                  {formatDateTime(booking.scheduled_start)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-widest font-semibold text-[#4b6390] mb-0.5">Scheduled end</div>
                <div className="text-[13px] text-deep-ink">
                  {formatDateTime(booking.scheduled_end)}
                </div>
              </div>
              {['awaiting_outcome', 'payment_required', 'completed'].includes(booking.status) && (
                <>
                  <div>
                    <div className="text-[9px] uppercase tracking-widest font-semibold text-[#4b6390] mb-0.5">VDO duration</div>
                    <div className={`text-[13px] ${checkoutInvoice?.checkout_duration_hours ? 'text-deep-ink' : 'text-orange-600'}`}>
                      {checkoutInvoice?.checkout_duration_hours
                        ? `${checkoutInvoice.checkout_duration_hours} hrs`
                        : 'Not recorded'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-widest font-semibold text-[#4b6390] mb-0.5">Pilot in command</div>
                    <div className="text-[13px] text-deep-ink">
                      {booking.pic_name ?? '—'}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Checkout action panel ─────────────────────────────────────── */}
          {/* checkout_requested uses AdminCheckoutReviewPanel above in the left column */}
          {(isCheckoutConfirmed || isCheckoutOutcomePending) && (
            <div className={`rounded-2xl p-6 border ${
              isCheckoutConfirmed ? 'bg-white border-green-500/15' : 'bg-white border-amber-500/15'
            }`}>
              <h2 className="text-xs uppercase tracking-widest font-semibold text-[#152d5a] mb-4">
                {isCheckoutConfirmed ? 'Checkout Flight Actions' : 'Record Checkout Outcome'}
              </h2>
              <AdminCheckoutActions
                bookingId={booking.id}
                status={status as 'checkout_confirmed' | 'checkout_completed_under_review'}
                airports={airports}
                customerCreditCents={customerCreditCents}
                customerId={booking.booking_owner_user_id}
                scheduledStart={booking.scheduled_start}
                noShowLocked={customer?.account_status === 'blocked' && customer?.account_lock_reason === 'checkout_no_show'}
              />
            </div>
          )}

        </div>

        {/* ── Right column: actions, slot status, summary ───────────────────────── */}
        <div className="order-last lg:order-last">
          <div className="sticky top-24 space-y-4 flex flex-col">

            {/* ── Standard booking: awaiting bank transfer confirmation ─────── */}
            {isStandardPaymentPending && standardBankTransferSubmissions.length === 0 && (
              <div className="bg-orange-500/[0.06] border border-orange-500/20 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-orange-400 text-[16px]">payments</span>
                  <h2 className="text-xs uppercase tracking-widest font-semibold text-orange-400/70">
                    Payment Pending
                  </h2>
                </div>
                <p className="text-[10px] text-[#4b6390] leading-relaxed">
                  Payment request has been sent. Awaiting customer payment via Stripe or bank transfer.
                </p>
              </div>
            )}

            {/* Admin actions — confirm/cancel while pending (standard bookings only) */}
            {isPending && !isCheckout && (
              <div className="bg-[#111316] border border-[#a7c8ff]/10 rounded-2xl p-6">
                <h2 className="text-xs uppercase tracking-widest font-semibold text-[#152d5a]/60 mb-4">
                  Admin Actions
                </h2>
                <AdminBookingActions bookingId={booking.id} />
              </div>
            )}

            {/* Cancellation request review — late cancel awaiting admin decision */}
            {isCancellationRequested && cancellationReqAdmin && (
              <AdminCancellationReviewCard
                cancellationRequestId={cancellationReqAdmin.id}
                bookingReference={(booking as { booking_reference?: string | null }).booking_reference ?? null}
                customerMessage={cancellationReqAdmin.customer_message}
                bookingStartTime={cancellationReqAdmin.booking_start_time}
                estimatedAmount={(booking as { estimated_amount?: number | null }).estimated_amount ?? null}
                estimatedHours={(booking as { estimated_hours?: number | null }).estimated_hours ?? null}
              />
            )}

            {/* Waiting for clarification response */}
            {isClarificationState && (
              <div className="bg-orange-500/[0.06] border border-orange-500/20 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />
                  <h2 className="text-xs uppercase tracking-widest font-semibold text-orange-400/70">
                    Awaiting Customer Response
                  </h2>
                </div>
                {clarificationQuestion && (
                  <div className="mt-2">
                    <p className="text-[10px] uppercase tracking-widest text-[#152d5a] mb-1">Your question</p>
                    <p className="text-xs text-[#4b6390] leading-relaxed italic">
                      &quot;{clarificationQuestion}&quot;
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-[#152d5a] mt-3 leading-relaxed">
                  Customer has been notified. The slot remains held. No further action needed until they respond.
                </p>
              </div>
            )}

            {/* Clarification form — available from pending or confirmed */}
            {canRequestClarification && (
              <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
                <h2 className="text-xs uppercase tracking-widest font-semibold text-[#152d5a] mb-3">
                  Need More Information?
                </h2>
                <AdminClarificationForm bookingId={booking.id} />
              </div>
            )}

            {/* Customer clarification response — shown on admin side after response received */}
            {clarificationResponse && status === 'pending_confirmation' && (
              <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-widest text-[#152d5a] mb-2">Customer Clarification Response</p>
                <p className="text-xs text-[#4b6390] leading-relaxed italic">
                  &quot;{clarificationResponse}&quot;
                </p>
              </div>
            )}

            {/* ── Operational dispatch panel ───────────────────────────────────── */}
            {isOperational && (
              <div className="bg-[#111316] border border-[#152d5a]/10 rounded-2xl p-6">
                <h2 className="text-xs uppercase tracking-widest font-semibold text-[#4b6390] mb-4">
                  Operational Actions
                </h2>
                <AdminOperationalActions bookingId={booking.id} status={status} />
              </div>
            )}

            {['awaiting_outcome', 'payment_required', 'completed'].includes(booking.status) && (
              <>
                {/* CHARGES & PAYMENT CARD */}
                <div className="rounded-2xl bg-white border border-[#152d5a]/10 p-4">
                  <div className="text-[13px] font-semibold text-deep-ink mb-3">
                    Charges & payment
                  </div>
                  {[
                    {
                      label: 'Aircraft',
                      value: `${(aircraft as { aircraft_type?: string } | null)?.aircraft_type?.replace(/^Cessna 172$/, 'Cessna 172N')?.replace(/^Cessna 172N$/, 'Cessna 172N') ?? 'Cessna 172N'} · ${(aircraft as { registration?: string } | null)?.registration ?? '—'}`
                    },
                    {
                      label: 'Hourly rate',
                      value: checkoutInvoice?.checkout_rate_cents_per_hour
                        ? `$${(checkoutInvoice.checkout_rate_cents_per_hour / 100).toFixed(2)}/hr`
                        : '—'
                    },
                    {
                      label: 'VDO duration',
                      value: checkoutInvoice?.checkout_duration_hours
                        ? `${checkoutInvoice.checkout_duration_hours} hrs`
                        : null,
                      missing: !checkoutInvoice?.checkout_duration_hours
                    },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between items-baseline py-1">
                      <span className="text-xs text-[#4b6390]">
                        {r.label}
                      </span>
                      <span className={`text-xs font-medium ${r.missing ? 'text-orange-600' : 'text-deep-ink'}`}>
                        {r.missing ? 'Not recorded' : r.value}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-[#152d5a]/10 my-2.5" />
                  <div className="flex justify-between items-baseline py-1">
                    <span className="text-xs font-semibold text-deep-ink">Total charged</span>
                    <span className="text-[15px] font-semibold text-deep-ink">
                      {checkoutInvoice?.checkout_final_amount_cents
                        ? `$${(checkoutInvoice.checkout_final_amount_cents / 100).toFixed(2)}`
                        : '$—'}
                    </span>
                  </div>
                  {checkoutInvoice?.total_paid_cents && checkoutInvoice.total_paid_cents > 0 ? (
                    <div className="bg-[#e8f5e9] rounded-xl p-3 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-green-700 flex items-center gap-1">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                            <circle cx="7" cy="7" r="6.5" stroke="#2e7d32" fill="#e8f5e9"/>
                            <path d="M4.5 7l2 2 3-3" stroke="#2e7d32" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Paid in full
                        </span>
                        <span className="text-sm font-semibold text-green-700">
                          ${(checkoutInvoice.total_paid_cents / 100).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-[10px] text-green-600 mt-1">
                        Bank transfer · in person · {formatDateTime(booking.updated_at)}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50 rounded-xl p-3 mt-2">
                      <div className="flex items-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                          <circle cx="7" cy="7" r="6.5" stroke="#d97706" fill="#fffbeb"/>
                          <path d="M7 4v3.5l2 1.5" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        <span className="text-xs font-semibold text-amber-700">Awaiting payment</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            {['checkout_requested', 'checkout_confirmed'].includes(booking.status) && (
              <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">payments</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4b6390]">Charges & payment</span>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-[#4b6390]">Aircraft</span>
                    <span className="text-[#152d5a] font-medium">Cessna 172N · VH-KZG</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-[#4b6390]">Hourly rate</span>
                    <span className="text-[#152d5a] font-medium">$250 / hr</span>
                  </div>
                  <div className="border-t border-[#152d5a]/[0.06] pt-3 mt-1">
                    <p className="text-[12px] text-[#4b6390] italic">
                      Final charges will be calculated once the checkout flight is completed and VDO readings are recorded.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* DATES CARD */}
            <div className="rounded-2xl bg-white border border-[#152d5a]/10 px-4 py-3 mt-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-[#4b6390] mb-2">
                Dates
              </div>
              {[
                { label: 'Submitted', val: booking.created_at },
                { label: 'Last updated', val: booking.updated_at },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-baseline py-1">
                  <span className="text-xs text-[#4b6390]">
                    {r.label}
                  </span>
                  <span className="text-xs font-medium text-deep-ink">
                    {formatDateTime(r.val)}
                  </span>
                </div>
              ))}
            </div>

            {/* Quick nav */}
            <div className="hidden lg:flex items-center gap-2 px-1 pt-1 pb-2">
              {isCheckout ? (
                <>
                  <Link
                    href="/admin/bookings/checkout?status=checkout_requested"
                    className="inline-flex items-center gap-1 text-[10px] text-[#152d5a]/60 hover:text-[#152d5a] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[12px]">arrow_back</span>
                    Checkout Requests
                  </Link>
                  <span className="text-slate-700">·</span>
                </>
              ) : isPending ? null : (
                <>
                  <Link
                    href="/admin/bookings/checkout?status=pending_confirmation"
                    className="inline-flex items-center gap-1 text-[10px] text-[#152d5a]/60 hover:text-[#152d5a] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[12px]">arrow_back</span>
                    Pending
                  </Link>
                  <span className="text-slate-700">·</span>
                </>
              )}
              <Link
                href="/admin/bookings/checkout?status=all"
                className="inline-flex items-center gap-1 text-[10px] text-[#152d5a]/60 hover:text-[#152d5a] transition-colors"
              >
                All bookings
              </Link>
            </div>

          </div>
        </div>

      </div>

      {/* ── Full-width Flight Billing (standard post-flight review) ─────────── */}
      {isStandardBillingPending && flightRecordRow && (
        <div className="mt-8">
          <AdminStandardBillingPanel
            bookingId={booking.id}
            airports={airports}
            customerCreditCents={customerCreditCents}
            initialFlightRecord={flightRecordRow}
            startSuggestions={flightLogStartSuggestions}
          />
        </div>
      )}

    </div>
  )
}
