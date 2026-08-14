import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, Clock, Tag, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/formatDateTime'
import { BookingRealtimeListener } from '@/components/realtime/BookingRealtimeListener'
import AdminBookingActions from './AdminBookingActions'
import AdminCheckoutActions from './AdminCheckoutActions'
import AdminCheckoutReviewPanel from './AdminCheckoutReviewPanel'
import AdminManualCheckoutCompletion from './AdminManualCheckoutCompletion'
import AdminBankTransferPanel from './AdminBankTransferPanel'
import AdminBankTransferReviewPanel from './AdminBankTransferReviewPanel'
import AdminStandardBillingPanel from './AdminStandardBillingPanel'
import {
  AdminFlightReadingsDisclosureProvider,
  AdminFlightReadingsDisclosureSection,
  AdminFlightReadingsDisclosureTrigger,
} from './AdminFlightReadingsDisclosure'
import AdminSubmitFlightRecordPanel from './AdminSubmitFlightRecordPanel'
import AdminStandardBankTransferPanel from './AdminStandardBankTransferPanel'
import AdminCancellationReviewCard from './AdminCancellationReviewCard'
import AdminRescheduleReviewProvider, {
  AdminRescheduleStickyBar,
  RescheduleReviewButton,
} from './AdminRescheduleReviewProvider'
import AdminRejectDocsPanel from './AdminRejectDocsPanel'
import { deriveBookingLifecycleStage } from '@/lib/booking/booking-lifecycle-stage'
import { isStandardBookingInvoicePaid } from '@/lib/booking/standard-booking-payment-state'
import { getCheckoutPaymentDisplayState } from '@/lib/checkout-payment-state'
import { getAircraftFlightLogStartSuggestions } from '@/lib/aircraft-flight-log'
import { deriveBookingStatusForFlightRecord } from '@/lib/booking/flight-record-status'
import { PAYF_RATE_PER_HOUR, CHECKOUT_RATE_PER_HOUR } from '@/lib/pricing-constants'
import { isSameSydneyCalendarDay, formatSydTime } from '@/lib/utils/sydney-time'

export const metadata = { title: 'Booking Details | Admin' }

function paymentMethodToLabel(method: string | null | undefined): string | null {
  if (!method) return null
  if (method === 'bank_transfer') return 'Bank transfer'
  if (method === 'card') return 'Card'
  if (method === 'cash') return 'Cash'
  if (method === 'card_in_person') return 'Card (in person)'
  return method.replace(/_/g, ' ')
}

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

type FlightReadingsBanner =
  | {
      kind: 'note'
      tone: 'slate'
      title: string
      body: string
      buttonLabel: string
      buttonTone: 'primary' | 'secondary'
    }
  | {
      kind: 'callout'
      tone: 'amber'
      title: string
      body: string
      buttonLabel: string
      buttonTone: 'primary' | 'secondary'
    }
  | {
      kind: 'confirmed'
      tone: 'green'
      title: string
      body: string
      linkLabel: string
      buttonLabel: string
      buttonTone: 'primary' | 'secondary'
    }
  | {
      kind: 'exception'
      tone: 'amber' | 'rose' | 'slate'
      title: string
      body: string
      buttonLabel: string
      buttonTone: 'primary' | 'secondary'
    }

function getFlightReadingsBanner(input: {
  lifecycleKey: string
  submittedAtLabel: string | null
  billingStatusLabel: string | null
}): FlightReadingsBanner | null {
  const billingStatus = input.billingStatusLabel ? input.billingStatusLabel.toLowerCase() : 'not available'

  switch (input.lifecycleKey) {
    case 'booked':
    case 'upcoming':
      return {
        kind: 'note',
        tone: 'slate',
        title: 'No post-flight action yet',
        body:
          "This flight hasn't happened yet. Post-flight readings can be submitted once the booking reaches its scheduled time.",
        buttonLabel: 'Submit Flight Readings',
        buttonTone: 'secondary',
      }
    case 'in_progress':
      return {
        kind: 'callout',
        tone: 'amber',
        title: 'Flight in progress',
        body:
          'This flight is currently in progress. Once it has landed, use the button below to mark it complete and submit the post-flight readings.',
        buttonLabel: 'Submit Flight Readings',
        buttonTone: 'secondary',
      }
    case 'awaiting_flight_readings':
      return {
        kind: 'callout',
        tone: 'amber',
        title: 'Awaiting post-flight readings',
        body: 'This flight has been flown and is awaiting post-flight readings. Use the form below to submit them.',
        buttonLabel: 'Submit Flight Readings',
        buttonTone: 'primary',
      }
    case 'readings_submitted':
      return {
        kind: 'confirmed',
        tone: 'green',
        title: 'Flight readings submitted',
        body: `Flight readings were submitted ${input.submittedAtLabel ? `on ${input.submittedAtLabel} ` : ''}and billing is ${billingStatus}.`,
        linkLabel: 'View submitted record',
        buttonLabel: 'Submit Flight Readings',
        buttonTone: 'secondary',
      }
    case 'paid_closed':
      return {
        kind: 'confirmed',
        tone: 'green',
        title: 'Booking closed',
        body: `Flight readings were submitted ${input.submittedAtLabel ? `on ${input.submittedAtLabel} ` : ''}and billing is ${billingStatus}.`,
        linkLabel: 'View submitted record',
        buttonLabel: 'Submit Flight Readings',
        buttonTone: 'secondary',
      }
    case 'waived_closed':
      return {
        kind: 'confirmed',
        tone: 'green',
        title: 'Booking closed',
        body: `Flight readings were submitted ${input.submittedAtLabel ? `on ${input.submittedAtLabel} ` : ''}and billing was waived.`,
        linkLabel: 'View submitted record',
        buttonLabel: 'Submit Flight Readings',
        buttonTone: 'secondary',
      }
    case 'payment_review_pending':
      return {
        kind: 'exception',
        tone: 'amber',
        title: 'Booking closed',
        body: 'Flight readings were approved. Bank-transfer payment is awaiting review.',
        buttonLabel: 'Submit Flight Readings',
        buttonTone: 'secondary',
      }
    case 'payment_required':
    case 'payment_still_due':
      return {
        kind: 'exception',
        tone: 'amber',
        title: 'Booking closed',
        body:
          input.lifecycleKey === 'payment_still_due'
            ? 'Flight readings were approved. A partial payment is recorded, but the booking still has an outstanding balance.'
            : 'Flight readings were approved. Payment is still required to settle the booking.',
        buttonLabel: 'Submit Flight Readings',
        buttonTone: 'secondary',
      }
    case 'cancelled':
      return {
        kind: 'exception',
        tone: 'rose',
        title: 'Booking cancelled',
        body: 'This booking was cancelled, so there is no post-flight action to take.',
        buttonLabel: 'Submit Flight Readings',
        buttonTone: 'secondary',
      }
    case 'no_show':
      return {
        kind: 'exception',
        tone: 'rose',
        title: 'No-show recorded',
        body: 'This booking was marked no show, so post-flight readings are not expected.',
        buttonLabel: 'Submit Flight Readings',
        buttonTone: 'secondary',
      }
    case 'admin_hold':
      return {
        kind: 'exception',
        tone: 'amber',
        title: 'On hold',
        body: 'This booking is on hold with operations, so post-flight actions are paused.',
        buttonLabel: 'Submit Flight Readings',
        buttonTone: 'secondary',
      }
    case 'needs_clarification':
      return {
        kind: 'exception',
        tone: 'amber',
        title: 'Needs clarification',
        body: 'This booking is waiting on clarification before billing can continue.',
        buttonLabel: 'Submit Flight Readings',
        buttonTone: 'secondary',
      }
    default:
      return null
  }
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
      payment_status,
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
  const pageTitle = bookingType === 'checkout'
    ? 'Review Checkout Request'
    : 'Booking Details'
  const isOutcomePending  = booking.status === 'checkout_completed_under_review'
  const isPaymentRequired = booking.status === 'checkout_payment_required'
  const isCheckoutRequested = bookingType === 'checkout' && booking.status === 'checkout_requested'
  // Standard booking billing panel shown for pending_post_flight_review
  const isStandardBillingPending = bookingType === 'standard' && booking.status === 'pending_post_flight_review'
  // Standard booking payment pending — show bank transfer panel if applicable
  const isStandardPaymentPending = bookingType === 'standard' && booking.status === 'payment_pending'
  const isStandardFlightRecordOpen = bookingType === 'standard' && booking.status !== 'completed'
  // Fetch airports and credit for checkout outcome form, standard billing panel,
  // and the admin post-flight submission panel
  const needsAirportsAndCredit = isOutcomePending || isStandardBillingPending || isStandardFlightRecordOpen
  const needsBillingPreview = bookingType === 'standard'

  const [
    { data: customer },
    { data: rawHistory },
    { data: ownBlocks },
    { data: overlappingRaw },
    { data: rawDocuments },
    { data: rawMessages },
    { data: airportRows },
    { data: creditRow },
    { data: activeBlockTimeRow },
    { data: standardBookingInvoiceRow },
    { data: blockTimeInvoiceRows },
    { data: flightRecordRow },
    { data: aircraftLogsRaw },
    { data: clearanceOverrideAuditRows },
    { data: settlementLedgerRow },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone_country_code, phone_number, verification_status, pilot_clearance_status, pilot_arn, created_at, account_status, account_lock_reason, has_night_vfr_rating')
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
    // Customer documents — used in checkout review + on-hold reject docs panel
    supabase
      .from('user_documents')
      .select('id, document_type, status, expiry_date, issue_date, file_name, licence_type, licence_number, medical_class, id_type, document_number, uploaded_at, review_notes, reviewed_at, created_at, user_document_files(id, file_name, storage_path)')
      .eq('user_id', booking.booking_owner_user_id)
      .order('created_at', { ascending: false }),
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
    needsBillingPreview
      ? supabase
          .from('pilot_block_time_purchases')
          .select('hours_remaining, rate_per_hour, expires_at')
          .eq('user_id', booking.booking_owner_user_id)
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString())
          .order('queue_position', { ascending: true, nullsFirst: false })
          .order('activated_at', { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    bookingType === 'standard'
      ? supabase
          .from('booking_invoices')
          .select('status, rate_cents_per_hour, vdo_reading, base_amount_cents, landing_subtotal_cents, subtotal_cents, stripe_amount_due_cents, total_paid_cents, payment_method, paid_at, pdf_url')
          .eq('booking_id', booking.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    bookingType === 'standard'
      ? supabase
          .from('invoices')
          .select('id, invoice_number, status, total, is_block_time_overage, pdf_url, paid_at, invoice_line_items ( type, description, quantity, unit_price, amount )')
          .eq('booking_id', booking.id)
          .eq('billing_mode', 'block_time')
          .eq('type', 'flight')
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: null, error: null }),
    // Flight record — fetched for standard billing panel (include per-airport landings)
    isStandardBillingPending
      ? supabase
          .from('flight_records')
          .select('*, flight_record_landings(airport_id, landing_count)')
          .eq('booking_id', booking.id)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle()
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
    bookingType === 'checkout'
      ? supabase
          .from('booking_audit_events')
          .select('id, event_type, event_summary, new_value, created_at, actor_user_id')
          .eq('booking_id', booking.id)
          .in('event_type', [
            'checkout_manual_completion_submitted',
            'checkout_outcome_recorded',
            'checkout_cancelled',
          ])
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null, error: null }),
    // Latest manual settlement ledger row — surfaces the admin note after Mark as Paid
    supabase
      .from('customer_payment_ledger')
      .select('note, payment_method, created_at')
      .eq('booking_id', booking.id)
      .not('note', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  type RawCheckoutDocument = {
    id: string
    document_type: string
    status: string
    expiry_date: string | null
    issue_date?: string | null
    file_name?: string | null
    licence_type?: string | null
    licence_number?: string | null
    medical_class?: string | null
    id_type?: string | null
    document_number?: string | null
    uploaded_at?: string | null
    review_notes?: string | null
    reviewed_at?: string | null
    created_at?: string | null
    user_document_files?: { id: string; file_name: string; storage_path: string }[] | null
  }

  const clearanceOverrideAudit = ((clearanceOverrideAuditRows ?? []) as Array<{
    id: string
    event_type: string
    event_summary: string | null
    new_value: unknown
    created_at: string
    actor_user_id: string | null
  }>).find((row) => {
    const value = row.new_value
    if (value && typeof value === 'object' && (value as { source?: string }).source === 'clearance_override') {
      return true
    }
    return (row.event_summary ?? '').toLowerCase().includes('clearance override')
  }) ?? null

  let clearanceOverrideNotice: {
    outcomeLabel: string
    recordedAt: string
    recordedByName: string | null
    actionLabel: string
  } | null = null

  if (clearanceOverrideAudit) {
    const value = (clearanceOverrideAudit.new_value ?? {}) as {
      outcome?: string
      booking_status?: string
    }
    const outcome = value.outcome ?? 'updated'
    const outcomeLabel = outcome.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const actionLabel =
      clearanceOverrideAudit.event_type === 'checkout_cancelled'
        ? 'cancelled via Update Checkout Result'
        : 'completed via Update Checkout Result'

    let recordedByName: string | null = null
    if (clearanceOverrideAudit.actor_user_id) {
      const { data: actorProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', clearanceOverrideAudit.actor_user_id)
        .maybeSingle()
      recordedByName = actorProfile?.full_name || actorProfile?.email || null
    }

    clearanceOverrideNotice = {
      outcomeLabel,
      recordedAt: clearanceOverrideAudit.created_at,
      recordedByName,
      actionLabel,
    }
  } else if (
    bookingType === 'checkout' &&
    typeof booking.admin_notes === 'string' &&
    booking.admin_notes.toLowerCase().includes('clearance override')
  ) {
    clearanceOverrideNotice = {
      outcomeLabel: 'Cleared To Fly',
      recordedAt: booking.updated_at,
      recordedByName: null,
      actionLabel: 'completed via Update Checkout Result',
    }
  }

  const allDocuments = ((rawDocuments ?? []) as RawCheckoutDocument[]).map((doc) => ({
    ...doc,
    files: (doc.user_document_files ?? []).map((file) => ({
      id: file.id,
      file_name: file.file_name,
      storage_path: file.storage_path,
    })),
  }))

  // Latest document per type (query is newest-first).
  const latestByType = new Map<string, (typeof allDocuments)[number]>()
  for (const doc of allDocuments) {
    if (!latestByType.has(doc.document_type)) {
      latestByType.set(doc.document_type, doc)
    }
  }
  const documents = Array.from(latestByType.values())
  const rejectedDocuments = documents
    .filter((doc) => doc.status === 'rejected')
    .map((doc) => ({
      id: doc.id,
      document_type: doc.document_type,
      review_notes: doc.review_notes ?? null,
      reviewed_at: doc.reviewed_at ?? null,
    }))
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
        status,
        paid_at
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
  const activeBlockTime = (activeBlockTimeRow as { hours_remaining: number; rate_per_hour: number; expires_at: string } | null)
    ? {
        hoursRemaining: Number((activeBlockTimeRow as { hours_remaining: number }).hours_remaining),
        ratePerHour: Number((activeBlockTimeRow as { rate_per_hour: number }).rate_per_hour),
        expiresAt: (activeBlockTimeRow as { expires_at: string }).expires_at,
      }
    : null
  const flightRecordLandingRows = (
    (flightRecordRow as {
      flight_record_landings?: { airport_id: string; landing_count: number }[] | null
    } | null)?.flight_record_landings ?? []
  )
  const initialLandingCharges = flightRecordLandingRows
    .filter((row) => row.airport_id && Number(row.landing_count) > 0)
    .map((row) => ({
      airportId: row.airport_id,
      landingCount: Number(row.landing_count),
    }))
  const bookingInvoiceStatus = (standardBookingInvoiceRow as { status?: string | null } | null)?.status ?? null
  const billingStatusLabel = bookingInvoiceStatus ?? (booking as { payment_status?: string | null }).payment_status ?? null
  const standardInvoice = (standardBookingInvoiceRow as {
    status?: string | null
    rate_cents_per_hour?: number | null
    vdo_reading?: number | null
    base_amount_cents?: number | null
    landing_subtotal_cents?: number | null
    subtotal_cents?: number | null
    stripe_amount_due_cents?: number | null
    total_paid_cents?: number | null
    payment_method?: string | null
    paid_at?: string | null
    pdf_url?: string | null
  } | null)
  const settlementLedger = settlementLedgerRow as {
    note?: string | null
    payment_method?: string | null
    created_at?: string | null
  } | null
  const rawSettlementNote = settlementLedger?.note?.trim() || null
  // Prefer the admin-written settlement note; skip the auto-generated fallback copy.
  const settlementAdminNote =
    rawSettlementNote && !/^Manual payment recorded by admin/i.test(rawSettlementNote)
      ? rawSettlementNote
      : null
  const ledgerPaymentMethodLabel = paymentMethodToLabel(settlementLedger?.payment_method)
  const rawPhoneCountry = (customer as { phone_country_code?: string | null } | null)?.phone_country_code ?? null
  const rawPhoneNumber  = (customer as { phone_number?: string | null } | null)?.phone_number ?? null
  const customerPhone   = rawPhoneNumber
    ? rawPhoneCountry
      ? `+${rawPhoneCountry} ${rawPhoneNumber}`
      : rawPhoneNumber
    : null

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
      .maybeSingle()

    let invoiceId = stdInvoiceRow?.id
    if (stdInvoiceRow) {
      standardInvoiceAmountDueCents = (stdInvoiceRow as { stripe_amount_due_cents?: number | null }).stripe_amount_due_cents ?? 0
    } else {
      const { data: btInvoiceRow } = await supabase
        .from('invoices')
        .select('id, total')
        .eq('booking_id', booking.id)
        .eq('billing_mode', 'block_time')
        .in('status', ['awaiting', 'bank_transfer_pending_review'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (btInvoiceRow) {
        invoiceId = btInvoiceRow.id
        standardInvoiceAmountDueCents = Math.round(Number(btInvoiceRow.total) * 100)
      }
    }

    if (invoiceId) {
      const { data: stdSubs } = await supabase
        .from('booking_bank_transfer_submissions')
        .select('id, status, reference, receipt_storage_path, admin_note, submitted_at, reviewed_at')
        .or(`invoice_id.eq.${invoiceId},booking_id.eq.${booking.id}`)
        .order('submitted_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })

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
  const standardPendingReviewSubmissions = standardBankTransferSubmissions.filter((sub) => sub.status === 'pending_review')

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
  const bookingSlotHours = Math.max(
    0,
    (new Date(booking.scheduled_end).getTime() - new Date(booking.scheduled_start).getTime()) / (1000 * 60 * 60),
  )
  const bookingSchedule = formatBookingSchedule(booking.scheduled_start, booking.scheduled_end)
  const lifecycleStage = deriveBookingLifecycleStage({
    bookingStatus: booking.status,
    flightRecordStatus: booking.flight_records?.[0]?.status ?? null,
    bookingInvoiceStatus,
    bookingInvoicePaidAt: standardInvoice?.paid_at ?? null,
    bookingInvoiceAmountDueCents: standardInvoice?.stripe_amount_due_cents ?? null,
    bookingInvoiceTotalPaidCents: standardInvoice?.total_paid_cents ?? null,
    latestBankTransferSubmissionStatus: latestStdBankSub?.status ?? null,
    paymentStatus: (booking as { payment_status?: string | null }).payment_status ?? null,
  })
  const chargesAndPayment = bookingType === 'standard'
    ? standardInvoice
      ? {
          hourlyRateLabel: standardInvoice.rate_cents_per_hour
            ? `$${(standardInvoice.rate_cents_per_hour / 100).toFixed(2)}/hr`
            : '—',
          vdoDurationLabel:
            standardInvoice.base_amount_cents != null && standardInvoice.rate_cents_per_hour
              ? `${(standardInvoice.base_amount_cents / standardInvoice.rate_cents_per_hour).toFixed(1)} hrs`
              : standardInvoice.vdo_reading != null
                ? `${standardInvoice.vdo_reading.toFixed(1)} hrs`
                : 'Not recorded',
          totalChargedLabel: standardInvoice.subtotal_cents != null
            ? `$${(standardInvoice.subtotal_cents / 100).toFixed(2)}`
            : '$—',
          isWaived: standardInvoice.status === 'waived',
          isPaid: isStandardBookingInvoicePaid({
            invoiceStatus: standardInvoice.status,
            invoicePaidAt: standardInvoice.paid_at,
            invoiceAmountDueCents: standardInvoice.stripe_amount_due_cents,
            invoiceTotalPaidCents: standardInvoice.total_paid_cents,
          }),
          paidAmountLabel: standardInvoice.total_paid_cents != null
            ? `$${(standardInvoice.total_paid_cents / 100).toFixed(2)}`
            : null,
          paymentDetailLabel: (() => {
            const paidAtLabel = standardInvoice.paid_at
              ? formatDateTime(standardInvoice.paid_at)
              : formatDateTime(booking.updated_at)
            const methodLabel = ledgerPaymentMethodLabel ?? paymentMethodToLabel(standardInvoice.payment_method)
            if (methodLabel) return `${methodLabel} · ${paidAtLabel}`
            return standardInvoice.paid_at ? paidAtLabel : null
          })(),
          settlementNote: settlementAdminNote,
          detailLines: null as { label: string; value: string }[] | null,
        }
      : (() => {
          type BlockTimeInvoiceRow = {
            id: string
            invoice_number: string
            status: string
            total: number
            is_block_time_overage: boolean
            pdf_url: string | null
            paid_at: string | null
            invoice_line_items?: { type: string; description: string; quantity: number; unit_price: number; amount: number }[] | null
          }
          const blockTimeInvoices = ((blockTimeInvoiceRows ?? []) as BlockTimeInvoiceRow[])
          if (blockTimeInvoices.length === 0) return null

          const usageInvoice = blockTimeInvoices.find((invoice) =>
            (invoice.invoice_line_items ?? []).some((line) => line.type === 'flight_hours'),
          ) ?? blockTimeInvoices.find((invoice) => !invoice.is_block_time_overage && invoice.status === 'paid')
          const landingInvoice = blockTimeInvoices.find((invoice) =>
            (invoice.invoice_line_items ?? []).some((line) => line.type === 'landing_fee'),
          )
          const overageInvoice = blockTimeInvoices.find((invoice) => invoice.is_block_time_overage)
          const usageLine = (usageInvoice?.invoice_line_items ?? []).find((line) => line.type === 'flight_hours')
          const landingAwaiting = landingInvoice?.status === 'awaiting'
          const overageAwaiting = overageInvoice?.status === 'awaiting'
          const landingWaived = landingInvoice?.status === 'waived'
          const allSettled = !landingAwaiting && !overageAwaiting

          const detailLines: { label: string; value: string }[] = []
          if (usageInvoice) {
            detailLines.push({
              label: `Block time usage (${usageInvoice.invoice_number})`,
              value: `$${Number(usageInvoice.total).toFixed(2)} · ${usageInvoice.status === 'paid' ? 'Paid via package' : usageInvoice.status}`,
            })
          }
          if (overageInvoice) {
            detailLines.push({
              label: `Overage (${overageInvoice.invoice_number})`,
              value: `$${Number(overageInvoice.total).toFixed(2)} · ${overageInvoice.status}`,
            })
          }
          if (landingInvoice) {
            detailLines.push({
              label: `Landing fees (${landingInvoice.invoice_number})`,
              value: `$${Number(landingInvoice.total).toFixed(2)} · ${landingInvoice.status}`,
            })
          }

          return {
            hourlyRateLabel: usageLine
              ? `$${Number(usageLine.unit_price).toFixed(2)}/hr`
              : '—',
            vdoDurationLabel: usageLine
              ? `${Number(usageLine.quantity).toFixed(1)} hrs`
              : 'Not recorded',
            totalChargedLabel: `$${blockTimeInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0).toFixed(2)}`,
            isWaived: false,
            isPaid: allSettled,
            paidAmountLabel: allSettled
              ? `$${blockTimeInvoices
                  .filter((invoice) => invoice.status === 'paid')
                  .reduce((sum, invoice) => sum + Number(invoice.total || 0), 0)
                  .toFixed(2)}`
              : null,
            paymentDetailLabel: landingAwaiting
              ? `Landing fee invoice ${landingInvoice?.invoice_number} awaiting payment`
              : overageAwaiting
                ? `Overage invoice ${overageInvoice?.invoice_number} awaiting payment`
                : landingWaived
                  ? 'Hours settled via block time · landing fees waived'
                  : 'Hours settled via block time',
            settlementNote: settlementAdminNote,
            detailLines,
            isLandingAwaiting: landingAwaiting || overageAwaiting,
          }
        })()
    : checkoutInvoice
      ? {
          hourlyRateLabel: checkoutInvoice.checkout_rate_cents_per_hour
            ? `$${(checkoutInvoice.checkout_rate_cents_per_hour / 100).toFixed(2)}/hr`
            : '—',
          vdoDurationLabel: checkoutInvoice.checkout_duration_hours
            ? `${checkoutInvoice.checkout_duration_hours} hrs`
            : 'Not recorded',
          totalChargedLabel: checkoutInvoice.checkout_final_amount_cents
            ? `$${(checkoutInvoice.checkout_final_amount_cents / 100).toFixed(2)}`
            : ((checkoutInvoice.total_paid_cents ?? 0) > 0
                ? `$${(checkoutInvoice.total_paid_cents / 100).toFixed(2)}`
                : '$0.00'),
          isPaid:
            (checkoutInvoice.total_paid_cents ?? 0) > 0 ||
            checkoutInvoice.status === 'paid' ||
            checkoutInvoice.status === 'waived' ||
            (booking.status === 'completed' && checkoutInvoice.status === 'void'),
          paidAmountLabel:
            (checkoutInvoice.total_paid_cents ?? 0) > 0
              ? `$${(checkoutInvoice.total_paid_cents / 100).toFixed(2)}`
              : checkoutInvoice.status === 'paid' ||
                  checkoutInvoice.status === 'waived' ||
                  (booking.status === 'completed' && checkoutInvoice.status === 'void')
                ? '$0.00'
                : null,
          paymentDetailLabel:
            (checkoutInvoice.total_paid_cents ?? 0) > 0 ||
            checkoutInvoice.status === 'paid' ||
            checkoutInvoice.status === 'waived' ||
            (booking.status === 'completed' && checkoutInvoice.status === 'void')
              ? `${ledgerPaymentMethodLabel ?? 'Bank transfer'} · ${formatDateTime(
                  (checkoutInvoice as { paid_at?: string | null }).paid_at ?? booking.updated_at,
                )}`
              : null,
          settlementNote: settlementAdminNote,
        }
      : bookingType === 'checkout' && booking.status === 'completed'
        // Legacy clearance-override completes before settled invoices existed.
        ? {
            hourlyRateLabel: `$${CHECKOUT_RATE_PER_HOUR}.00/hr`,
            vdoDurationLabel: 'Not recorded',
            totalChargedLabel: '$0.00',
            isPaid: true,
            paidAmountLabel: '$0.00',
            paymentDetailLabel: `${ledgerPaymentMethodLabel ?? 'Bank transfer'} · ${formatDateTime(booking.updated_at)}`,
            settlementNote: settlementAdminNote,
          }
        : null
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
  const lifecycleToneCfg: Record<string, { text: string; bg: string; border: string }> = {
    slate:  { text: 'text-slate-700',  bg: 'bg-slate-100',  border: 'border-slate-200' },
    gray:   { text: 'text-slate-600',  bg: 'bg-slate-100',  border: 'border-slate-200' },
    blue:   { text: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200' },
    amber:  { text: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200' },
    orange: { text: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-200' },
    purple: { text: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200' },
    green:  { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    rose:   { text: 'text-rose-700',   bg: 'bg-rose-50',    border: 'border-rose-200' },
  }
  const lifecycleTone = lifecycleToneCfg[lifecycleStage.tone] ?? lifecycleToneCfg.slate
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
  const flightReadingsBanner = bookingType === 'standard'
    ? getFlightReadingsBanner({
        lifecycleKey: lifecycleStage.key,
        submittedAtLabel: flightRecordRow?.submitted_at ? formatDateTime(flightRecordRow.submitted_at) : null,
        billingStatusLabel: billingStatusLabel ? formatStatusLabel(billingStatusLabel) : null,
      })
    : null
  const formatDayMonth = (value: string) =>
    new Date(value).toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
      day: 'numeric',
      month: 'short',
    })
  function formatSydneyDateParts(value: string) {
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).formatToParts(new Date(value))
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
    return {
      day: get('day'),
      month: get('month'),
      year: get('year'),
    }
  }
  function formatBookingDuration(hours: number) {
    if (!Number.isFinite(hours) || hours <= 0) return null
    const totalMinutes = Math.round(hours * 60)
    const wholeHours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (wholeHours > 0) return `${wholeHours}h ${String(minutes).padStart(2, '0')}m`
    return `${minutes}m`
  }
  function getSydneyTimezoneAbbr(value: string) {
    const match = formatDateTime(value).match(/\((AEST|AEDT)\)$/)
    return match?.[1] ?? 'Sydney time'
  }
  function formatBookingSchedule(startIso: string, endIso: string) {
    const startParts = formatSydneyDateParts(startIso)
    const endParts = formatSydneyDateParts(endIso)
    const dateRange = isSameSydneyCalendarDay(startIso, endIso)
      ? `${startParts.day} ${startParts.month} ${startParts.year}`
      : startParts.year === endParts.year
        ? `${startParts.day} ${startParts.month} – ${endParts.day} ${endParts.month} ${endParts.year}`
        : `${startParts.day} ${startParts.month} ${startParts.year} – ${endParts.day} ${endParts.month} ${endParts.year}`
    const timeRange = `${formatSydTime(startIso)} – ${formatSydTime(endIso)}`
    const duration = formatBookingDuration((new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60 * 60))
    const timezone = `Sydney time (${getSydneyTimezoneAbbr(startIso)})`
    return { dateRange, timeRange, duration, timezone }
  }
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

  type PendingRescheduleAdmin = {
    id: string
    requested_scheduled_start: string
    requested_scheduled_end: string
    customer_note: string | null
  }
  let pendingRescheduleAdmin: PendingRescheduleAdmin | null = null
  if (bookingType === 'checkout' && ['checkout_requested', 'checkout_confirmed'].includes(status)) {
    const { data: rescheduleData } = await supabase
      .from('checkout_change_requests')
      .select('id, requested_scheduled_start, requested_scheduled_end, customer_note, status')
      .eq('checkout_request_id', booking.id)
      .eq('request_type', 'reschedule')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (
      rescheduleData?.requested_scheduled_start &&
      rescheduleData?.requested_scheduled_end
    ) {
      pendingRescheduleAdmin = {
        id: rescheduleData.id,
        requested_scheduled_start: rescheduleData.requested_scheduled_start,
        requested_scheduled_end: rescheduleData.requested_scheduled_end,
        customer_note: (rescheduleData as { customer_note?: string | null }).customer_note ?? null,
      }
    }
  }
  const hasPendingReschedule = !!pendingRescheduleAdmin
  const canRequestClarification = status === 'pending_confirmation' || status === 'confirmed'
  const clarificationQuestion = [...statusHistory].reverse().find(r => r.new_status === 'needs_clarification')?.note ?? null
  const clarificationResponse = [...statusHistory].reverse().find(r => r.old_status === 'needs_clarification' && r.new_status === 'pending_confirmation')?.note ?? null

  // ── Checkout-specific state flags ────────────────────────────────────────────
  const isCheckout              = bookingType === 'checkout'
  const isCheckoutRequestedStatus = isCheckout && status === 'checkout_requested'
  const isCheckoutConfirmed     = isCheckout && status === 'checkout_confirmed'
  const isCheckoutOutcomePending = isCheckout && status === 'checkout_completed_under_review'
  const isOnHold                = status === 'on_hold_pending_documents'
  // When a reschedule is pending, show the reschedule review card instead of Confirm Checkout
  const needsCheckoutActions    =
    (isCheckoutRequestedStatus || isCheckoutConfirmed || isCheckoutOutcomePending) &&
    !hasPendingReschedule

  const activeOwnBlocks = ((ownBlocks ?? []) as ScheduleBlockRow[]).filter(b => b.status === 'active')
  const slotHeld        = activeOwnBlocks.length > 0
  const hasConflict     = externalConflicts.length > 0

  let displayBookingTypeLabel = 'Rental - PAYF'
  let displayBookingRate = `$${PAYF_RATE_PER_HOUR}/h`
  if (bookingType === 'checkout') {
    displayBookingTypeLabel = 'Checkout'
    displayBookingRate = `$${CHECKOUT_RATE_PER_HOUR}/h`
  } else if (bookingType === 'standard' && activeBlockTime) {
    displayBookingTypeLabel = 'Rental - Block time'
    displayBookingRate = `$${activeBlockTime.ratePerHour}/h`
  }

  const requestedSchedule = pendingRescheduleAdmin
    ? formatBookingSchedule(
        pendingRescheduleAdmin.requested_scheduled_start,
        pendingRescheduleAdmin.requested_scheduled_end,
      )
    : null
  const displayPageTitle = hasPendingReschedule
    ? 'Review Reschedule Request'
    : isCancellationRequested
      ? 'Review Cancellation Request'
      : pageTitle
  const displayLifecycleLabel = hasPendingReschedule
    ? 'Reschedule Requested'
    : isCancellationRequested
      ? 'Cancellation Requested'
      : isAwaitingManualPayment
        ? 'Payment Verification Pending'
        : lifecycleStage.label
  const displayLifecycleSublabel = hasPendingReschedule
    ? 'Awaiting approval of the requested new time'
    : isCancellationRequested
      ? 'Awaiting admin decision on cancellation'
      : isAwaitingManualPayment
        ? 'Bank transfer proof submitted — verify receipt and confirm payment'
        : (lifecycleStage.sublabel ?? (bookingType === 'checkout' ? 'Current checkout state' : 'Current booking state'))
  const lifecyclePaymentModeLabel =
    lifecycleStage.key === 'paid_closed'
      ? (ledgerPaymentMethodLabel ?? paymentMethodToLabel(standardInvoice?.payment_method ?? null))
      : null
  const displayLifecycleTone =
    hasPendingReschedule || isCancellationRequested
      ? lifecycleToneCfg.amber
      : isAwaitingManualPayment
        ? lifecycleToneCfg.blue
        : lifecycleTone

  const pageContent = (
      <>
      <div className="min-h-screen bg-gray-100">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-8 pb-24">

        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
            <Link
              href="/admin/bookings/requests"
              className="hover:text-[#152d5a] transition-colors"
            >
              Checkout Requests
            </Link>
            <span>/</span>
            <Link
              href="/admin/bookings"
              className="hover:text-[#152d5a] transition-colors"
            >
              All bookings
            </Link>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-[#152d5a]">{displayPageTitle}</h1>
              <p className="text-sm text-gray-400 mt-1">
                {hasPendingReschedule
                  ? 'Compare the current and requested times, then approve or reject.'
                  : isCancellationRequested
                    ? 'Review the cancellation request and decide waive or charge.'
                    : 'View and manage this booking.'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wide ${displayLifecycleTone.bg} ${displayLifecycleTone.text} ${displayLifecycleTone.border}`}>
                {displayLifecycleLabel}
              </span>
              <span className="text-xs text-gray-400">
                Submitted {formatDateTime(booking.created_at)}
              </span>
            </div>
          </div>
        </div>

      {clearanceOverrideNotice && (
        <div className="mb-6 rounded-2xl border border-[#1a4fd6]/20 bg-[#f0f6ff] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[#1a4fd6] text-[22px] mt-0.5">info</span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[#152d5a]">
                Completed by admin clearance override
              </h2>
              <p className="mt-1 text-sm text-[#4b6390] leading-relaxed">
                This checkout was {clearanceOverrideNotice.actionLabel}
                {clearanceOverrideNotice.recordedByName
                  ? ` by ${clearanceOverrideNotice.recordedByName}`
                  : ''}
                {' '}on {formatDateTime(clearanceOverrideNotice.recordedAt)}.
                Outcome set to <span className="font-semibold text-[#152d5a]">{clearanceOverrideNotice.outcomeLabel}</span>.
                Document approval, booking completion, and payment settlement were applied automatically — the normal confirm → mark completed → finalise charges steps were bypassed.
              </p>
            </div>
          </div>
        </div>
      )}

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
                    href={`/admin/users/${customer?.id}`}
                    className="font-semibold text-amber-100 underline decoration-amber-100/30 underline-offset-2 hover:text-white"
                  >
                    {customer?.full_name ?? 'Unknown Customer'}
                  </Link>
                </p>
              </div>
            </div>
            <div className="w-full max-w-md">
              <AdminRejectDocsPanel
                bookingId={booking.id}
                bookingReference={bookingRef}
                customerId={booking.booking_owner_user_id}
                customerName={(customer as { full_name?: string | null } | null)?.full_name ?? null}
                customerEmail={(customer as { email?: string | null } | null)?.email ?? null}
                aircraftLabel={[
                  (aircraft as { aircraft_type?: string } | null)?.aircraft_type?.replace(/^Cessna 172$/, 'Cessna 172N'),
                  (aircraft as { registration?: string } | null)?.registration,
                ].filter(Boolean).join(' · ') || null}
                scheduleLabel={[
                  bookingSchedule.dateRange,
                  bookingSchedule.timeRange,
                ].filter(Boolean).join(' · ') || null}
                rejectedDocuments={rejectedDocuments}
              />
            </div>
          </div>
        </div>
      )}

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="h-full rounded-[20px] border border-[rgba(12,35,64,0.10)] bg-white p-4 shadow-[0_8px_20px_rgba(15,30,52,0.04)]">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.9)]">
                <User className="w-4 h-4 text-[var(--admin-text-muted)]" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-text-muted)]">Customer</span>
            </div>
            <div className="mt-3 min-w-0">
              {customer?.id ? (
                <Link
                  href={`/admin/users/${customer.id}`}
                  className="block truncate text-[15px] font-semibold text-[var(--admin-text)] transition-colors hover:text-[var(--admin-accent-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,79,214,0.20)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  {customer?.full_name ?? '—'}
                </Link>
              ) : (
                <p className="truncate text-[15px] font-semibold text-[var(--admin-text)]">{customer?.full_name ?? '—'}</p>
              )}
              <p className="mt-1 truncate text-[12.5px] text-[var(--admin-text-muted)]">{customer?.email ?? '—'}</p>
            </div>
          </div>

          <div className="h-full rounded-[20px] border border-[rgba(12,35,64,0.10)] bg-white p-4 shadow-[0_8px_20px_rgba(15,30,52,0.04)]">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.9)]">
                <Tag className="w-4 h-4 text-[var(--admin-text-muted)]" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-text-muted)]">Booking Type</span>
            </div>
            <div className="mt-3">
              <p className="truncate text-[15px] font-semibold text-[var(--admin-text)]">
                {displayBookingTypeLabel}
              </p>
              <p className="mt-1 text-[12.5px] text-[var(--admin-text-muted)]">
                {displayBookingRate}
              </p>
            </div>
          </div>

          <div className={`h-full rounded-[20px] border p-4 shadow-[0_8px_20px_rgba(15,30,52,0.04)] ${
            hasPendingReschedule
              ? 'border-amber-200 bg-amber-50/70'
              : 'border-[rgba(12,35,64,0.10)] bg-white'
          }`}>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.9)]">
                <CalendarDays className="w-4 h-4 text-[var(--admin-text-muted)]" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-text-muted)]">
                {hasPendingReschedule ? 'Schedule Change' : 'Schedule'}
              </span>
            </div>
            <div className="mt-3 space-y-1.5">
              {hasPendingReschedule && requestedSchedule ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b6390]">Current (held)</p>
                  <p className="text-[14px] font-semibold text-[var(--admin-text)]">{bookingSchedule.dateRange}</p>
                  <p className="text-[12px] text-[var(--admin-text-muted)]">{bookingSchedule.timeRange}</p>
                  <div className="pt-2 mt-2 border-t border-amber-200/80 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700">Requested new time</p>
                      <p className="text-[14px] font-semibold text-amber-900 mt-1">{requestedSchedule.dateRange}</p>
                      <p className="text-[12px] text-amber-800/80">{requestedSchedule.timeRange}</p>
                    </div>
                    <RescheduleReviewButton className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 shadow-sm transition-colors hover:bg-amber-50" />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[15px] font-semibold text-[var(--admin-text)]">{bookingSchedule.dateRange}</p>
                  <p className="text-[12.5px] text-[var(--admin-text-muted)]">{bookingSchedule.timeRange}</p>
                  <p className="text-[12px] text-[var(--admin-text-muted)]">
                    {bookingSchedule.duration ? `${bookingSchedule.duration} · ${bookingSchedule.timezone}` : bookingSchedule.timezone}
                  </p>
                </>
              )}
              <p className="text-[12px] text-[var(--admin-text-muted)]">
                {(aircraft as { aircraft_type?: string } | null)?.aircraft_type?.replace(/^Cessna 172$/, 'Cessna 172N') ?? 'Cessna 172N'} · {(aircraft as { registration?: string } | null)?.registration ?? 'VH-KZG'}
              </p>
            </div>
          </div>

          <div className="h-full rounded-[20px] border border-[rgba(12,35,64,0.10)] bg-white p-4 shadow-[0_8px_20px_rgba(15,30,52,0.04)]">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(12,35,64,0.08)] bg-[rgba(247,251,255,0.9)]">
                <Clock className="w-4 h-4 text-[var(--admin-text-muted)]" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-text-muted)]">Lifecycle</span>
            </div>
            <div className="mt-3 space-y-2">
              <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] font-semibold ${displayLifecycleTone.bg} ${displayLifecycleTone.border} ${displayLifecycleTone.text}`}>
                {displayLifecycleLabel}
              </span>
              <p className="text-[12.5px] leading-[1.45] text-[var(--admin-text-muted)]">
                {displayLifecycleSublabel}
              </p>
              {lifecyclePaymentModeLabel && (
                <p className="text-[12px] leading-[1.45] text-[var(--admin-text-muted)]">
                  Payment mode: {lifecyclePaymentModeLabel}
                </p>
              )}
            </div>
          </div>
        </div>

        {bookingType === 'standard' && flightReadingsBanner && (
          <div
            className={`mb-4 rounded-2xl border p-4 shadow-sm ${
              flightReadingsBanner.kind === 'callout'
                ? 'border-amber-200 bg-amber-50/90'
                : flightReadingsBanner.kind === 'confirmed'
                  ? 'border-emerald-200 bg-emerald-50/80'
                  : flightReadingsBanner.tone === 'rose'
                    ? 'border-rose-200 bg-rose-50/80'
                    : 'border-slate-200 bg-slate-50/90'
            }`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className={`text-[10px] font-semibold uppercase tracking-widest ${
                  flightReadingsBanner.kind === 'callout'
                    ? 'text-amber-700'
                    : flightReadingsBanner.kind === 'confirmed'
                      ? 'text-emerald-700'
                      : flightReadingsBanner.tone === 'rose'
                        ? 'text-rose-700'
                        : 'text-slate-600'
                }`}>
                  {flightReadingsBanner.kind === 'callout'
                    ? 'Post-flight Action'
                    : flightReadingsBanner.kind === 'confirmed'
                      ? 'Post-flight Summary'
                      : 'Booking State'}
                </p>
                <h2 className="mt-1 text-[15px] font-semibold text-[#152d5a]">
                  {flightReadingsBanner.title}
                </h2>
                <p className="mt-1 text-sm text-[#4b6390] leading-relaxed">
                  {flightReadingsBanner.body}
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 md:ml-4 md:flex-shrink-0">
                {!flightRecordRow && !(['paid_closed', 'waived_closed', 'payment_review_pending', 'payment_required', 'payment_still_due', 'payment_void', 'payment_failed'] as string[]).includes(lifecycleStage.key) && (
                  <AdminFlightReadingsDisclosureTrigger
                    label={flightReadingsBanner.buttonLabel}
                    variant={flightReadingsBanner.buttonTone}
                    className="w-full sm:w-auto"
                  />
                )}
                {flightReadingsBanner.kind === 'confirmed' && flightRecordRow && isStandardBillingPending ? (
                  <AdminFlightReadingsDisclosureTrigger
                    label={flightReadingsBanner.linkLabel ?? 'View submitted record'}
                    variant="secondary"
                    className="w-full sm:w-auto"
                  />
                ) : null}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 pb-8">

        {/* ── Left column: details ─────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* ── Checkout bank transfer panel — shown when checkout payment required ── */}
          {isPaymentRequired && !invoiceSentViaStripe && !isAwaitingManualPayment && (
            <ManualPaymentDisclosure label="Need to record a direct payment settlement?">
              <AdminBankTransferPanel
                bookingId={booking.id}
                bookingType="checkout"
                amountCents={checkoutInvoice?.stripe_amount_due_cents ?? 0}
                variant="admin_override"
                invoiceIssued={Boolean(checkoutInvoice)}
              />
            </ManualPaymentDisclosure>
          )}

          {isPaymentRequired && !invoiceSentViaStripe && latestBankTransferSub && isAwaitingManualPayment && (
            <AdminBankTransferReviewPanel bookingId={booking.id} submission={latestBankTransferSub} />
          )}

          {isPaymentRequired && invoiceSentViaStripe && (
            <div className="bg-[#f0f6ff] border border-[#1a4fd6]/20 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-[#e8f0fe] flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[20px] text-[#1a4fd6]">receipt_long</span>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#152d5a]">Invoice sent to customer</p>
                <p className="text-[12px] text-[#4b6390] mt-1">
                  {isAwaitingManualPayment
                    ? 'Customer submitted bank transfer proof. Review the receipt and confirm payment.'
                    : 'A payment invoice has been issued. Awaiting customer payment.'}
                  {checkoutInvoice?.stripe_amount_due_cents
                    ? ` Amount due: $${(checkoutInvoice.stripe_amount_due_cents / 100).toFixed(2)}`
                    : ''}
                </p>
              </div>
            </div>
          )}

          {isPaymentRequired && invoiceSentViaStripe && !isAwaitingManualPayment && (
            <ManualPaymentDisclosure label="Need to record a direct payment settlement?">
              <AdminBankTransferPanel
                bookingId={booking.id}
                bookingType="checkout"
                amountCents={checkoutInvoice?.stripe_amount_due_cents ?? 0}
                variant="admin_override"
                invoiceIssued
              />
            </ManualPaymentDisclosure>
          )}

          {isPaymentRequired && invoiceSentViaStripe && latestBankTransferSub && isAwaitingManualPayment && (
            <AdminBankTransferReviewPanel bookingId={booking.id} submission={latestBankTransferSub} />
          )}

          {/* ── Standard booking manual payment panel ────────────────────────── */}
          {isStandardPaymentPending && standardPendingReviewSubmissions.length > 0 ? (
            <AdminStandardBankTransferPanel
              bookingId={booking.id}
              submissions={standardPendingReviewSubmissions}
            />
          ) : isStandardPaymentPending ? (
            <ManualPaymentDisclosure label="Need to record a direct payment settlement?">
              <AdminBankTransferPanel
                bookingId={booking.id}
                bookingType="standard"
                amountCents={standardInvoiceAmountDueCents}
                variant="admin_override"
                invoiceIssued
              />
            </ManualPaymentDisclosure>
          ) : null}

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
              customerPhone={customerPhone}
              pilotArn={(customer as { pilot_arn?: string | null } | null)?.pilot_arn ?? null}
              hasNightVfrRating={(customer as { has_night_vfr_rating?: boolean | null } | null)?.has_night_vfr_rating ?? false}
              clearanceLabel={clearanceCfg.label}
              clearanceColor={clearanceCfg.color}
              clearanceBg={clearanceCfg.bg}
              clearanceBorder={clearanceCfg.border}
              documents={documents as import('@/app/admin/bookings/requests/[id]/AdminCheckoutReviewPanel').DocSummary[]}
              messages={messages as import('@/lib/supabase/types').VerificationEvent[]}
              pendingRescheduleReview={hasPendingReschedule}
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

          {/* ── Checkout action panel ─────────────────────────────────────── */}
          {/* checkout_requested uses AdminCheckoutReviewPanel above in the left column */}
          {(isCheckoutConfirmed || isCheckoutOutcomePending) && !hasPendingReschedule && (
            <div className={`rounded-2xl border p-6 shadow-sm ${
              isCheckoutConfirmed ? 'border-green-500/15 bg-white' : 'border-amber-500/15 bg-white'
            }`}>
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
        <div className="space-y-4">
          <div className="sticky top-24 space-y-4 flex flex-col">

            {/* ── Standard booking: awaiting bank transfer confirmation ─────── */}
            {isStandardPaymentPending && standardBankTransferSubmissions.length === 0 && (
              <div className="bg-orange-500/[0.06] border border-orange-500/20 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-orange-500 text-[18px]">payments</span>
                  <h2 className="text-sm uppercase tracking-widest font-semibold text-orange-600">
                    Payment Pending
                  </h2>
                </div>
                <p className="text-sm text-[#334155] leading-relaxed">
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
                bookingType={bookingType}
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
            {/* Customer clarification response — shown on admin side after response received */}
            {clarificationResponse && status === 'pending_confirmation' && (
              <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-widest text-[#152d5a] mb-2">Customer Clarification Response</p>
                <p className="text-xs text-[#4b6390] leading-relaxed italic">
                  &quot;{clarificationResponse}&quot;
                </p>
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
                      value: chargesAndPayment?.hourlyRateLabel ?? '—'
                    },
                    {
                      label: 'VDO duration',
                      value: chargesAndPayment?.vdoDurationLabel ?? null,
                      missing: !chargesAndPayment?.vdoDurationLabel || chargesAndPayment.vdoDurationLabel === 'Not recorded'
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
                      {chargesAndPayment?.totalChargedLabel ?? '$—'}
                    </span>
                  </div>
                  {'detailLines' in (chargesAndPayment ?? {}) &&
                    Array.isArray((chargesAndPayment as { detailLines?: { label: string; value: string }[] | null })?.detailLines) &&
                    ((chargesAndPayment as { detailLines: { label: string; value: string }[] }).detailLines).map((line) => (
                      <div key={line.label} className="flex justify-between items-baseline py-1">
                        <span className="text-[11px] text-[#4b6390]">{line.label}</span>
                        <span className="text-[11px] font-medium text-deep-ink text-right ml-3">{line.value}</span>
                      </div>
                    ))}
                  {bookingType === 'standard' && standardInvoice && standardInvoice.status !== 'waived' && (
                    <div className="pt-3">
                      <a
                        href={standardInvoice.pdf_url ?? `/dashboard/bookings/${booking.id}/invoice`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#1a4fd6] hover:underline"
                      >
                        <span className="material-symbols-outlined text-[15px]">download</span>
                        {standardInvoice.status === 'paid' ? 'Download Receipt' : 'Download Invoice'}
                      </a>
                    </div>
                  )}
                  {chargesAndPayment?.isWaived ? (
                    <div className="bg-[#e8f5e9] rounded-xl p-3 mt-2">
                      <div className="flex items-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                          <circle cx="7" cy="7" r="6.5" stroke="#2e7d32" fill="#e8f5e9"/>
                          <path d="M4.5 7l2 2 3-3" stroke="#2e7d32" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-xs font-semibold text-green-700">Payment waived</span>
                      </div>
                      <div className="text-[10px] text-green-600 mt-1">No payment required</div>
                    </div>
                  ) : chargesAndPayment?.isPaid ? (
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
                          {chargesAndPayment?.paidAmountLabel ?? '$0.00'}
                        </span>
                      </div>
                      <div className="text-[10px] text-green-600 mt-1">
                        {chargesAndPayment?.paymentDetailLabel ?? 'Paid'}
                      </div>
                      {clearanceOverrideNotice && (
                        <p className="text-[10px] text-green-700/80 mt-1.5 leading-relaxed">
                          Settled via admin clearance override (Mark as Already Paid bypass).
                        </p>
                      )}
                      {chargesAndPayment.settlementNote && (
                        <div className="mt-3 pt-3 border-t border-green-200/90">
                          <div className="flex items-start gap-2.5 rounded-lg bg-white/80 border border-green-200/70 px-3 py-2.5">
                            <span
                              className="material-symbols-outlined text-[18px] text-green-700/75 mt-0.5 shrink-0"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              sticky_note_2
                            </span>
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-green-700/70 mb-1">
                                Admin settlement note
                              </p>
                              <p className="text-sm text-[#152d5a] leading-relaxed">
                                {chargesAndPayment.settlementNote}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
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
                      {chargesAndPayment?.paymentDetailLabel && (
                        <div className="text-[10px] text-amber-700/80 mt-1">
                          {chargesAndPayment.paymentDetailLabel}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        </div>

        {isStandardFlightRecordOpen && !flightRecordRow && flightReadingsBanner && booking.status !== 'payment_pending' && (
          <AdminFlightReadingsDisclosureSection>
            <div className="mt-4">
              <AdminSubmitFlightRecordPanel
                bookingId={booking.id}
                airports={airports}
                scheduledStart={booking.scheduled_start}
                startSuggestions={flightLogStartSuggestions}
                activeBlockTime={activeBlockTime}
                bookingSlotHours={bookingSlotHours}
              />
            </div>
          </AdminFlightReadingsDisclosureSection>
        )}

        {/* ── Full-width Flight Billing (standard post-flight review) ─────────── */}
        {isStandardBillingPending && flightRecordRow && (
          <AdminFlightReadingsDisclosureSection>
          <div id="submitted-flight-record" className="mt-4">
            <AdminStandardBillingPanel
              bookingId={booking.id}
              airports={airports}
              customerCreditCents={customerCreditCents}
              initialFlightRecord={flightRecordRow}
              initialLandingCharges={initialLandingCharges}
              startSuggestions={flightLogStartSuggestions}
              bookingSlotHours={bookingSlotHours}
              activeBlockTime={activeBlockTime}
              defaultHourlyRate={PAYF_RATE_PER_HOUR}
            />
          </div>
          </AdminFlightReadingsDisclosureSection>
        )}

        </div>

      </div>
      {hasPendingReschedule && !isCheckoutRequestedStatus ? <AdminRescheduleStickyBar /> : null}
      </>
  )

  return (
    <AdminFlightReadingsDisclosureProvider>
      <BookingRealtimeListener bookingId={params.id} />
      {hasPendingReschedule && pendingRescheduleAdmin ? (
        <AdminRescheduleReviewProvider
          changeRequestId={pendingRescheduleAdmin.id}
          currentStart={booking.scheduled_start}
          currentEnd={booking.scheduled_end}
          requestedStart={pendingRescheduleAdmin.requested_scheduled_start}
          requestedEnd={pendingRescheduleAdmin.requested_scheduled_end}
          customerNote={pendingRescheduleAdmin.customer_note}
          customerName={(customer as { full_name?: string | null } | null)?.full_name ?? booking.pic_name ?? null}
        >
          {pageContent}
        </AdminRescheduleReviewProvider>
      ) : (
        pageContent
      )}
    </AdminFlightReadingsDisclosureProvider>
  )
}

function ManualPaymentDisclosure({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer text-[11px] font-semibold text-amber-600 uppercase tracking-wider select-none list-none flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px] group-open:rotate-90 transition-transform">chevron_right</span>
        {label}
      </summary>
      <div className="mt-3">
        {children}
      </div>
    </details>
  )
}
