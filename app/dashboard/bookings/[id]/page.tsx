import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import CustomerBookingShell from '../CustomerBookingShell'
import PortalPageHero from '@/components/PortalPageHero'
import ClarificationResponseForm from './ClarificationResponseForm'
import FlightRecordForm from './FlightRecordForm'
import PostFlightHero from './PostFlightHero'
import PostFlightClarificationPanel from './PostFlightClarificationPanel'
import CheckoutPaymentCard from './CheckoutPaymentCard'
import BookingPaymentCard from './BookingPaymentCard'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase/types'
import type { BookingStatus, FlightRecord, FlightRecordAttachment, FlightRecordClarification } from '@/lib/supabase/booking-types'
import { formatDateFromISO, formatDateTime } from '@/lib/formatDateTime'
import { PAYMENT_CONFIG } from '@/lib/payments/config'
import { markFlightReturned } from '@/app/actions/booking'
import { getCheckoutPaymentDisplayState } from '@/lib/checkout-payment-state'
import CustomerBookingActions from './CustomerBookingActions'
import CheckoutChangeActions from '@/app/dashboard/checkout/CheckoutChangeActions'
import { deriveBookingStatusForFlightRecord } from '@/lib/booking/flight-record-status'
import { getStandardBookingPaymentDisplayState } from '@/lib/booking/standard-booking-payment-state'
import { BookingRealtimeListener } from '@/components/realtime/BookingRealtimeListener'

export const metadata = { title: 'Booking Details | Pilot Dashboard' }

// ── Status config ─────────────────────────────────────────────────────────────
// Customer-facing labels. DB status values are never changed.

const STATUS_CFG: Record<string, {
  label:     string
  sublabel:  string
  color:     string
  bg:        string
  border:    string
  icon:      string
}> = {
  // Standard booking statuses
  pending_confirmation:            { label: 'Under Review',           sublabel: 'Slot held',                   color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'pending'         },
  confirmed:                       { label: 'Confirmed',              sublabel: 'Approved — ready to fly',     color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   icon: 'check_circle'    },
  ready_for_dispatch:              { label: 'Ready to Fly',           sublabel: 'Pre-flight checks done',      color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'flight_takeoff'  },
  dispatched:                      { label: 'Airborne',               sublabel: 'Flight in progress',          color: 'text-green-300',  bg: 'bg-green-500/10',  border: 'border-green-400/20',  icon: 'flight'          },
  awaiting_flight_record:          { label: 'Awaiting Record',        sublabel: 'Submit your flight log',      color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'assignment'      },
  flight_record_overdue:           { label: 'Record Overdue',         sublabel: 'Flight log required now',     color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'assignment_late' },
  pending_post_flight_review:      { label: 'Under Review',           sublabel: 'Post-flight review',          color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: 'rate_review'     },
  needs_clarification:             { label: 'Clarification Needed',   sublabel: 'Please respond to query',     color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: 'help'            },
  post_flight_approved:            { label: 'Flight Approved',        sublabel: 'Records accepted',            color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'verified'        },
  payment_pending:                 { label: 'Payment Required',       sublabel: 'Pay to close booking',        color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: 'payments'      },
  completed:                       { label: 'Completed',              sublabel: 'Booking closed',              color: 'text-slate-400',  bg: 'bg-white/5',       border: 'border-white/10',      icon: 'done_all'        },
  cancelled:                       { label: 'Cancelled',              sublabel: 'Will not proceed',            color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'cancel'          },
  no_show:                         { label: 'No Show',                sublabel: 'Marked absent',               color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'person_off'      },
  cancellation_requested:          { label: 'Cancellation Requested', sublabel: 'Awaiting admin review',       color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'pending_actions' },
  // Checkout booking statuses
  checkout_requested:              { label: 'Under Review',           sublabel: 'Awaiting confirmation',       color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'pending'         },
  checkout_confirmed:              { label: 'Confirmed',              sublabel: 'Checkout flight confirmed',   color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   icon: 'event_available' },
  checkout_completed_under_review: { label: 'Awaiting Outcome',       sublabel: 'Checkout under review',       color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: 'rate_review'     },
  checkout_payment_required:       { label: 'Payment Required',       sublabel: 'Pay to unlock bookings',      color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: 'payments'      },
  // Derived display state for bank-transfer-submitted — used as a virtual cfg key
  checkout_awaiting_manual_payment: { label: 'Awaiting Payment Confirmation', sublabel: 'Bank transfer under review', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: 'account_balance' },
}

// Customer-facing pipeline for standard aircraft bookings.
// Admin-driven dispatch steps (ready_for_dispatch, dispatched) are not shown.
// All "confirmed-family" statuses map to step 0 via getStandardPipelineIdx().
const PIPELINE: { key: BookingStatus; label: string }[] = [
  { key: 'confirmed',                  label: 'Booking Confirmed'         },
  { key: 'awaiting_flight_record',     label: 'Flight Returned'           },
  { key: 'pending_post_flight_review', label: 'Post Flight Records Submitted' },
  { key: 'post_flight_approved',       label: 'Completed'                 },
]

// Maps any DB status to the customer-visible pipeline step index.
// Admin-driven statuses (pending_confirmation, ready_for_dispatch, dispatched)
// all map to step 0 ("Booking Confirmed") from the customer's perspective.
function getStandardPipelineIdx(status: string): number {
  if (['pending_confirmation', 'confirmed', 'ready_for_dispatch', 'dispatched'].includes(status)) return 0
  if (status === 'awaiting_flight_record' || status === 'flight_record_overdue')                   return 1
  if (status === 'pending_post_flight_review' || status === 'needs_clarification')                 return 2
  if (status === 'post_flight_approved' || status === 'payment_pending' || status === 'completed') return 3
  return -1
}

const CHECKOUT_PIPELINE: { key: BookingStatus; label: string }[] = [
  { key: 'checkout_requested',              label: 'Request Submitted' },
  { key: 'checkout_confirmed',              label: 'Checkout Confirmed' },
  { key: 'checkout_completed_under_review', label: 'Checkout Completed' },
  { key: 'checkout_payment_required',       label: 'Payment Required' },
  { key: 'completed',                       label: 'Completed' },
]

const CHECKOUT_PIPELINE_ORDER = CHECKOUT_PIPELINE.map(p => p.key)

// Maps DB checkout_outcome values to customer-facing journey step labels.
const CHECKOUT_OUTCOME_STEP_LABELS: Record<string, string> = {
  cleared_to_fly:                'Cleared to Fly',
  additional_checkout_required:  'Additional Checkout Required',
  checkout_reschedule_required:  'Reschedule Required',
  not_currently_eligible:        'Not Currently Eligible',
}

// Maps DB checkout_outcome values to customer-facing note labels for history events.
const CHECKOUT_OUTCOME_NOTE_LABELS: Record<string, string> = {
  cleared_to_fly:                'Cleared for aircraft booking',
  additional_checkout_required:  'Additional checkout session required',
  checkout_reschedule_required:  'Checkout reschedule required',
  not_currently_eligible:        'Not currently eligible to fly',
}

type StatusHistoryRow = {
  new_status: string
  old_status: string | null
  note:       string | null
  created_at: string
}

type ActiveBlockTimePackage = {
  id: string
  hours_remaining: number
  rate_per_hour: number
  expires_at: string
  hours_purchased: number
  package?: { name: string } | { name: string }[] | null
}

type StandardBookingInvoicePreview = {
  id: string
  invoice_number: string
  subtotal_cents: number
  advance_applied_cents: number
  stripe_amount_due_cents: number
  total_paid_cents: number
  paid_at: string | null
  status: string
  payment_method: string | null
}

function BlockTimeInfoBanner({
  activePackage,
  bookingSlotHours,
  is24HourBooking,
  daysUntilExpiry,
}: {
  activePackage: ActiveBlockTimePackage | null
  bookingSlotHours: number
  is24HourBooking: boolean
  daysUntilExpiry: number | null
}) {
  if (!activePackage) return null

  const formattedExpiry = formatDateFromISO(activePackage.expires_at)
  const balanceText = `${activePackage.hours_remaining.toFixed(1)}h`
  const rateText = `$${activePackage.rate_per_hour.toFixed(2)}/hr`

  return (
    <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6 sm:p-8 shadow-[0_4px_30px_rgba(2,10,22,0.08)]">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-[#1a4fd6] text-lg">info</span>
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#4b6390]">Block Time Balance</h3>
      </div>
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-xl bg-[#f8fbff] border border-[#dbe7f4] p-3.5">
          <span className="material-symbols-outlined text-[#1a4fd6] text-[14px] mt-0.5 flex-shrink-0">info</span>
          <p className="text-[13px] text-[#4b6390] leading-relaxed">
            Your actual VDO hours will be deducted from your Block Time balance after you submit your post-flight reading.
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-[#f8fbff] border border-[#dbe7f4] p-3.5">
          <span className="material-symbols-outlined text-[#1a4fd6] text-[14px] mt-0.5 flex-shrink-0">info</span>
          <p className="text-[13px] text-[#4b6390] leading-relaxed">
            Current balance: {balanceText} remaining (expires {formattedExpiry}).
          </p>
        </div>
        {is24HourBooking && (
          <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5">
            <span className="material-symbols-outlined text-amber-400 text-[14px] mt-0.5 flex-shrink-0">warning</span>
            <p className="text-[13px] text-amber-600/80 leading-relaxed">
              A minimum of 4 VDO hours is charged for each 24-hour period booked.
            </p>
          </div>
        )}
        {activePackage.hours_remaining < bookingSlotHours && (
          <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5">
            <span className="material-symbols-outlined text-amber-400 text-[14px] mt-0.5 flex-shrink-0">warning</span>
            <p className="text-[13px] text-amber-600/80 leading-relaxed">
              Your current balance of {activePackage.hours_remaining.toFixed(1)}h is less than this booking slot of {bookingSlotHours.toFixed(1)}h. Any overflow will be charged at your block rate of {rateText}.
            </p>
          </div>
        )}
        {activePackage.hours_remaining < 4 && is24HourBooking && (
          <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5">
            <span className="material-symbols-outlined text-amber-400 text-[14px] mt-0.5 flex-shrink-0">warning</span>
            <p className="text-[13px] text-amber-600/80 leading-relaxed">
              Warning: Your balance of {activePackage.hours_remaining.toFixed(1)}h may not cover the 4h minimum VDO charge for this 24-hour booking.
            </p>
          </div>
        )}
        {daysUntilExpiry !== null && daysUntilExpiry <= 7 && (
          <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5">
            <span className="material-symbols-outlined text-amber-400 text-[14px] mt-0.5 flex-shrink-0">warning</span>
            <p className="text-[13px] text-amber-600/80 leading-relaxed">
              Your Block Time package expires in {daysUntilExpiry} days on {formattedExpiry}. Unused hours will be forfeited.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Next action card ──────────────────────────────────────────────────────────

function NextActionCard({
  status,
  bookingType,
  adminNotes,
  clarificationQuestion,
  bookingId,
  bookingInvoice,
  bookingSlotHours,
  standardBankTransferSub,
  standardBankDetails,
  picName,
  picArn,
  flightDate,
  scheduledEnd,
  postFlightClarification,
  flightRecord,
  postFlightAttachments,
  checkoutInvoice,
  bankTransferSubmission,
  bankDetails,
  checkoutOutcome,
  standardBilling,
  cancellationRequest,
  showFlightRecordButton,
  isWithin24Hours,
  departureSydney,
  activePackage,
  is24HourBooking,
}: {
  status:                   string
  bookingType:              string
  adminNotes?:              string | null
  clarificationQuestion?:   string | null
  bookingId:                string
  picName?:                 string | null
  picArn?:                  string | null
  flightDate:               string
  scheduledEnd?:            string
  postFlightClarification?: FlightRecordClarification | null
  flightRecord?:            FlightRecord | null
  postFlightAttachments?:   (FlightRecordAttachment & { signedUrl: string | null })[]
  checkoutInvoice?:         { id: string; invoice_number: string; subtotal_cents: number; advance_applied_cents: number; stripe_amount_due_cents: number } | null
  bankTransferSubmission?:  { id: string; status: string } | null
  bankDetails?:             { accountName: string; bsb: string; accountNumber: string } | null
  checkoutOutcome?:         string | null
  standardBilling?:         { subtotal_cents: number; advance_applied_cents: number; amount_due_cents: number } | null
  bookingInvoice?:          StandardBookingInvoicePreview | null
  bookingSlotHours:         number
  standardBankTransferSub?: { id: string; status: string } | null
  standardBankDetails?:     { accountName: string; bsb: string; accountNumber: string } | null
  cancellationRequest?:     { status: string; charge_amount_cents: number | null; customer_message: string | null } | null
  showFlightRecordButton?:  boolean
  isWithin24Hours?:         boolean
  departureSydney?:         string
  activePackage?:           ActiveBlockTimePackage | null
  is24HourBooking?:         boolean
}) {
  const isCancelled             = status === 'cancelled' || status === 'no_show'
  const isCancellationRequested = status === 'cancellation_requested'

  // ── Cancellation requested ────────────────────────────────────────────────
  if (isCancellationRequested) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-amber-400 text-lg animate-pulse">pending_actions</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400">Cancellation Under Review</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          Your cancellation request has been submitted and is awaiting review by the operations team. The booking slot is held until a decision is made.
        </p>
        {cancellationRequest?.customer_message && (
          <div className="mt-3 pt-3 border-t border-amber-500/15">
            <p className="text-[9px] font-bold uppercase tracking-widest text-amber-400/60 mb-1">Your Message</p>
            <p className="text-xs text-amber-300/70 leading-relaxed">{cancellationRequest.customer_message}</p>
          </div>
        )}
      </div>
    )
  }

  // ── Cancelled with charge ─────────────────────────────────────────────────
  if (
    isCancelled &&
    cancellationRequest?.status === 'approved_charged' &&
    (cancellationRequest.charge_amount_cents ?? 0) > 0
  ) {
    const chargeDisplay = `$${((cancellationRequest.charge_amount_cents ?? 0) / 100).toFixed(2)}`
    return (
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-[1.25rem] p-6 space-y-3">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-orange-400 text-lg">payments</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-orange-400">Cancellation Charge Applies</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          This booking was cancelled inside the 24-hour window. A cancellation charge of{' '}
          <span className="text-orange-300 font-medium">{chargeDisplay}</span> applies.
        </p>
        <div className="bg-orange-500/10 p-3 rounded-lg border border-orange-500/20 text-xs text-orange-400/80">
          Please contact the operations team to arrange payment.
        </div>
      </div>
    )
  }

  // ── Cancelled with waiver ─────────────────────────────────────────────────
  if (isCancelled && cancellationRequest?.status === 'approved_waived') {
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-green-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-green-400">Cancellation Approved — No Charge</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          Your cancellation has been approved and the cancellation charge has been waived. No further action is required.
        </p>
      </div>
    )
  }

  // ── Checkout booking statuses ─────────────────────────────────────────────
  const CHECKOUT_STATUSES = [
    'checkout_requested',
    'checkout_confirmed',
    'checkout_completed_under_review',
  ]

  if (CHECKOUT_STATUSES.includes(status)) {
    const isConfirmed = status === 'checkout_confirmed'
    const isUnderReview = status === 'checkout_completed_under_review'
    return (
      <div className={`rounded-[1.25rem] p-6 ${
        isConfirmed  ? 'bg-blue-500/10 border border-blue-500/20' :
        isUnderReview ? 'bg-purple-500/10 border border-purple-500/20' :
                        'bg-amber-500/10 border border-amber-500/20'
      }`}>
        <div className="flex items-center gap-3 mb-3">
          <span className={`material-symbols-outlined text-lg ${
            isConfirmed  ? 'text-blue-400' :
            isUnderReview ? 'text-purple-400' :
                            'text-amber-400'
          }`}>
            {isConfirmed ? 'event_available' : isUnderReview ? 'rate_review' : 'pending_actions'}
          </span>
          <h3 className={`text-xs font-bold uppercase tracking-widest ${
            isConfirmed  ? 'text-blue-400' :
            isUnderReview ? 'text-purple-400' :
                            'text-amber-400'
          }`}>
            {isConfirmed ? 'Checkout Confirmed' : isUnderReview ? 'Awaiting Outcome' : 'Under Review'}
          </h3>
        </div>
        <p className="text-sm text-[#4b6390] leading-relaxed">
          Your checkout booking is currently in progress. Aircraft bookings will become available after your checkout is completed and paid.
        </p>
      </div>
    )
  }

  if (status === 'checkout_payment_required') {
    return (
      <CheckoutPaymentCard
        bookingId={bookingId}
        checkoutInvoice={checkoutInvoice}
        bankTransferSubmission={bankTransferSubmission}
        bankDetails={bankDetails ?? undefined}
      />
    )
  }

  if (status === 'payment_pending') {
    if (bookingInvoice) {
      return (
        <BookingPaymentCard
          bookingId={bookingId}
          invoice={bookingInvoice}
          bankTransferSubmission={standardBankTransferSub}
          bankDetails={standardBankDetails}
        />
      )
    }
    // Fallback if invoice not yet fetched (race condition guard)
    return (
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-orange-400 text-lg">payments</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-orange-400">Payment Required</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          Your flight invoice is being prepared. Please refresh the page or contact the operations team.</p>
        <div className="bg-orange-500/10 p-3 rounded-lg border border-orange-500/20 text-xs text-orange-400/80 mt-4">
          Contact operations to arrange payment.
        </div>
      </div>
    )
  }

  if (isCancelled) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-red-400 text-lg">cancel</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-red-400">
            {status === 'no_show' ? 'Marked No Show' : 'Booking Cancelled'}
          </h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          {status === 'no_show'
            ? 'This booking was marked as no show by the operations team.'
            : 'This booking has been cancelled and will not proceed.'}
        </p>
        {adminNotes && (
          <div className="mt-3 pt-3 border-t border-red-500/15">
            <p className="text-[9px] font-bold uppercase tracking-widest text-red-400/60 mb-1">Reason</p>
            <p className="text-xs text-red-300/80 leading-relaxed">{adminNotes}</p>
          </div>
        )}
      </div>
    )
  }

  if (status === 'pending_confirmation') {
    return (
      <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6 sm:p-8 shadow-[0_4px_30px_rgba(2,10,22,0.08)]">
        <div className="flex items-center gap-2 mb-6">
          <span className="material-symbols-outlined text-amber-400/60 text-sm">bolt</span>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-amber-400/70">Next Action</h3>
        </div>
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="flex-shrink-0 w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.18)]">
            <span className="material-symbols-outlined text-amber-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>flight</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <p className="text-[18px] font-semibold text-[#152d5a]">Booking Confirmed</p>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-blue-400 bg-blue-500/10 border border-blue-500/20">
                <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                Confirmed
              </span>
            </div>
            <p className="text-[13px] text-[#4b6390] leading-relaxed">
              Your booking is confirmed. Please arrive at the aircraft at least 30 minutes before your scheduled departure for pre-flight checks.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (
    bookingType === 'standard' &&
    (status === 'confirmed' || status === 'ready_for_dispatch' || status === 'dispatched')
  ) {
    return (
      <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6 sm:p-8 shadow-[0_4px_30px_rgba(2,10,22,0.08)]">
        <div className="flex items-center gap-2 mb-6">
          <span className="material-symbols-outlined text-amber-400/60 text-sm">bolt</span>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-amber-400/70">Next Action</h3>
        </div>
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="flex-shrink-0 w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shadow-[0_0_24px_rgba(245,158,11,0.22)]">
            <span className="material-symbols-outlined text-amber-400 text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>flight</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <p className="text-[20px] font-semibold text-[#152d5a]">Enjoy your flight!</p>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-blue-400 bg-blue-500/10 border border-blue-500/20">
                <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                Confirmed
              </span>
            </div>
            <p className="text-[13px] text-[#4b6390] leading-relaxed mb-5 max-w-2xl">
              Once you have completed your flight, submit the post flight records. Our team will verify these records and generate the final invoice for payment.
            </p>
            {showFlightRecordButton && (
              <CustomerBookingActions
                bookingId={bookingId}
                showCancelButton={false}
                showFlightRecordButton
                isWithin24Hours={isWithin24Hours ?? false}
                departureSydney={departureSydney ?? ''}
                heroLayout
              />
            )}
          </div>
          <span className="material-symbols-outlined text-[#4b6390]/30 text-2xl flex-shrink-0 self-center hidden sm:block">chevron_right</span>
        </div>
      </div>
    )
  }

  if (status === 'awaiting_flight_record' || status === 'flight_record_overdue') {
    const isOverdue = status === 'flight_record_overdue'
    return (
      <div className={`rounded-[1.25rem] p-6 ${isOverdue ? 'bg-red-500/10 border border-red-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
        <div className="flex items-center gap-3 mb-3">
          <span className={`material-symbols-outlined text-lg ${isOverdue ? 'text-red-400' : 'text-amber-400'}`}>
            assignment
          </span>
          <h3 className={`text-xs font-bold uppercase tracking-widest ${isOverdue ? 'text-red-400' : 'text-amber-400'}`}>
            {isOverdue ? 'Record Overdue' : 'Submit Post Flight Records'}
          </h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          {isOverdue
            ? 'Your post flight records are overdue. Please submit your meter readings and flight details immediately.'
            : 'Your flight is complete. Please submit your post flight records including meter readings and any notes.'}
        </p>
        <FlightRecordForm
          bookingId={bookingId}
          picName={picName}
          picArn={picArn}
          flightDate={flightDate}
          activePackage={activePackage ?? null}
          bookingSlotHours={bookingSlotHours}
          is24HourBooking={is24HourBooking ?? false}
        />
      </div>
    )
  }

  if (status === 'pending_post_flight_review') {
    // If the flight record needs clarification, show the full clarification panel
    if (postFlightClarification && flightRecord) {
      return (
        <PostFlightClarificationPanel
          clarification={postFlightClarification}
          flightRecord={flightRecord}
          bookingId={bookingId}
          existingAttachments={postFlightAttachments ?? []}
        />
      )
    }

    // Under review (pending_review or resubmitted) — show status + evidence summary
    const isResubmitted = flightRecord?.status === 'resubmitted'
    const attCount = postFlightAttachments?.length ?? 0
    return (
      <div className={`rounded-[1.25rem] p-6 space-y-4 bg-white border border-[#152d5a]/10`}>
        <div className="flex items-center gap-3">
          <span className={`material-symbols-outlined text-lg ${isResubmitted ? 'text-emerald-500' : 'text-purple-500'}`}>
            {isResubmitted ? 'refresh' : 'rate_review'}
          </span>
          <h3 className={`text-xs font-bold uppercase tracking-widest ${isResubmitted ? 'text-emerald-600' : 'text-purple-600'}`}>
            {isResubmitted ? 'Resubmitted — Under Review' : 'Under Review'}
          </h3>
        </div>
        <p className="text-sm text-[#4b6390] leading-relaxed">
          {isResubmitted
            ? 'Your updated flight record has been submitted and is back with the operations team for review.'
            : 'Your flight record has been submitted and is currently being reviewed by the operations team.'}
        </p>
        {attCount > 0 && (
          <div className="pt-3 border-t border-[#152d5a]/10">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#4b6390] mb-3">
              Submitted Evidence
              <span className="ml-2 font-normal text-[#4b6390]/70">({attCount} photo{attCount !== 1 ? 's' : ''})</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {(postFlightAttachments ?? []).map(att => (
                <div key={att.id} className="w-16 h-16 rounded-lg overflow-hidden border border-[#152d5a]/10 bg-[#f0f6ff] flex-shrink-0">
                  {att.signedUrl
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={att.signedUrl} alt={att.file_name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-[#4b6390] text-lg">image</span></div>
                  }
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (status === 'needs_clarification') {
    return (
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-orange-400 text-lg">help</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-orange-400">Response Required</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          Our operations team has a question before they can proceed with your booking.{' '}
          <strong className="text-orange-300/80">Your time slot remains held</strong> — please respond as soon as possible.
        </p>
        {clarificationQuestion && (
          <div className="mt-4 p-4 rounded-xl bg-orange-500/[0.06] border border-orange-500/15">
            <p className="text-[9px] font-bold uppercase tracking-widest text-orange-400/60 mb-2">Question from operations</p>
            <p className="text-sm text-slate-200 leading-relaxed">{clarificationQuestion}</p>
          </div>
        )}
        <ClarificationResponseForm bookingId={bookingId} />
      </div>
    )
  }

  if (status === 'post_flight_approved' || status === 'completed') {
    if (bookingType === 'checkout') {
      if (checkoutOutcome === 'cleared_to_fly') {
        return (
          <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="material-symbols-outlined text-emerald-500 text-lg">verified</span>
              <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-600">Checkout Complete</h3>
            </div>
            <p className="text-sm text-[#4b6390]">
              Your checkout flight has been completed and you have been cleared for aircraft booking.
            </p>
          </div>
        )
      }
      if (checkoutOutcome === 'additional_checkout_required') {
        return (
          <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="material-symbols-outlined text-amber-500 text-lg">schedule</span>
              <h3 className="text-xs font-bold uppercase tracking-widest text-amber-600">Additional Checkout Required</h3>
            </div>
            <p className="text-sm text-[#4b6390] mb-4">
              Your checkout flight has been completed, but an additional checkout session is required before you can book aircraft independently.
            </p>
            <Link href="/dashboard/checkout" className="inline-flex items-center gap-2 px-4 py-2 bg-[#f0f6ff] border border-[#152d5a]/10 text-[#1a4fd6] hover:bg-[#e8f0fe] rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all">
              <span className="material-symbols-outlined text-sm">flight_takeoff</span>
              Book Another Checkout
            </Link>
          </div>
        )
      }
      if (checkoutOutcome === 'checkout_reschedule_required') {
        return (
          <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="material-symbols-outlined text-blue-500 text-lg">event_repeat</span>
              <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600">Checkout Reschedule Required</h3>
            </div>
            <p className="text-sm text-[#4b6390] mb-4">
              Your checkout could not be completed as planned. Please book another checkout time or contact support.
            </p>
            <Link href="/dashboard/checkout" className="inline-flex items-center gap-2 px-4 py-2 bg-[#f0f6ff] border border-[#152d5a]/10 text-[#1a4fd6] hover:bg-[#e8f0fe] rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all">
              <span className="material-symbols-outlined text-sm">flight_takeoff</span>
              Book Another Checkout
            </Link>
          </div>
        )
      }
      if (checkoutOutcome === 'not_currently_eligible') {
        return (
          <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="material-symbols-outlined text-red-500 text-lg">block</span>
              <h3 className="text-xs font-bold uppercase tracking-widest text-red-600">Not Currently Eligible</h3>
            </div>
            <p className="text-sm text-[#4b6390]">
              Your checkout flight has been reviewed, and you are not currently eligible for solo aircraft booking. Please contact the team if you would like to discuss next steps.
            </p>
          </div>
        )
      }
      // Awaiting outcome or outcome not yet recorded
      return (
        <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="material-symbols-outlined text-[#1a4fd6] text-lg">how_to_reg</span>
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#4b6390]">Checkout Status</h3>
          </div>
          <p className="text-sm text-[#4b6390]">
            Your checkout flight has been completed. Contact the operations team if you have any questions.
          </p>
        </div>
      )
    }

    return (
      <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-emerald-500 text-lg">verified</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-600">
            {status === 'completed' ? 'Booking Complete' : 'Flight Approved'}
          </h3>
        </div>
        <p className="text-sm text-[#4b6390]">
          {status === 'completed'
            ? 'This booking is fully closed. Thank you for flying with OZRentAPlane.'
            : 'Your post-flight records have been reviewed and approved.'}
        </p>

        {status === 'completed' && bookingType === 'standard' && standardBilling != null && (
          <div className="mt-6 space-y-2 p-4 rounded-xl bg-[#f0f6ff] border border-[#152d5a]/10 text-sm">
            <div className="flex justify-between text-[#152d5a]">
              <span>Flight Total</span>
              <span>${(standardBilling.subtotal_cents / 100).toFixed(2)}</span>
            </div>
            {standardBilling.advance_applied_cents > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Advance Credit Applied</span>
                <span>-${(standardBilling.advance_applied_cents / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-emerald-600 pt-2 border-t border-[#152d5a]/10">
              <span>Total Due</span>
              <span>${(standardBilling.amount_due_cents / 100).toFixed(2)}</span>
            </div>
            {standardBilling.amount_due_cents === 0 && (
              <div className="text-[10px] text-emerald-600/70 uppercase tracking-widest mt-2 flex items-center justify-end gap-1">
                <span className="material-symbols-outlined text-[12px]">check</span> Settled by customer credit
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6">
      <p className="text-sm text-oz-muted">
        Need to make a change?{' '}
        <span className="text-oz-blue">Contact the operations team.</span>
      </p>
    </div>
  )
}

// ── Status history event ──────────────────────────────────────────────────────

function HistoryEvent({
  row,
  isLast,
  bookingType,
  isAwaitingManualPayment,
}: {
  row:                    StatusHistoryRow
  isLast:                 boolean
  bookingType:            string
  isAwaitingManualPayment?: boolean
}) {
  const cfg = { ... (STATUS_CFG[row.new_status] ?? {
    label:  row.new_status.replace(/_/g, ' '),
    color:  'text-slate-400',
    bg:     'bg-white/5',
    border: 'border-white/10',
    icon:   'info',
  }) }

  if (bookingType === 'checkout') {
    if (row.new_status === 'checkout_requested') cfg.label = 'Request Submitted'
    if (row.new_status === 'checkout_confirmed') cfg.label = 'Checkout Confirmed'
    if (row.new_status === 'checkout_completed_under_review') cfg.label = 'Awaiting Outcome'

    // For payment_required and completed events, extract the checkout_outcome from
    // the note (format: "Checkout outcome: <value>. ...") and show a customer-friendly
    // label and colour instead of the raw DB status name.
    if (row.new_status === 'checkout_payment_required' || row.new_status === 'completed') {
      const outcomeMatch = row.note?.match(/Checkout outcome:\s*([^\s.]+)/)
      const eventOutcome = outcomeMatch?.[1] ?? null

      // When bank transfer is submitted but not yet confirmed, suppress the cleared_to_fly
      // outcome — the customer hasn't actually been unlocked yet. Show a neutral
      // "Payment submitted" event instead to reflect the current state.
      if (row.new_status === 'checkout_payment_required' && isAwaitingManualPayment) {
        cfg.label  = 'Payment Submitted'
        cfg.color  = 'text-blue-400'; cfg.bg = 'bg-blue-500/10'; cfg.border = 'border-blue-500/20'; cfg.icon = 'account_balance'
        return (
          <li className="flex gap-4 relative pb-5 last:pb-0">
            {!isLast && <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-white/[0.07]" />}
            <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center z-10 mt-0.5 ${cfg.bg} border ${cfg.border}`}>
              <span className={`material-symbols-outlined text-[13px] ${cfg.color}`} style={{ fontVariationSettings: "'FILL' 1, 'wght' 400" }}>{cfg.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <p className={`text-sm font-medium leading-snug ${cfg.color}`}>{cfg.label}</p>
                <p className="text-[10px] text-slate-600 font-mono flex-shrink-0 mt-0.5 tabular-nums">
                  {formatDateFromISO(row.created_at)}
                </p>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Your bank transfer details have been submitted. Our team will verify the payment before your checkout result is finalised.
              </p>
            </div>
          </li>
        )
      }

      if (eventOutcome === 'cleared_to_fly') {
        cfg.label = 'Checkout Outcome: Cleared to Fly'
        cfg.color = 'text-green-400'; cfg.bg = 'bg-green-500/10'; cfg.border = 'border-green-500/20'; cfg.icon = 'verified'
      } else if (eventOutcome === 'additional_checkout_required') {
        cfg.label = 'Checkout Outcome: Additional Checkout Required'
        cfg.color = 'text-amber-400'; cfg.bg = 'bg-amber-500/10'; cfg.border = 'border-amber-500/20'; cfg.icon = 'schedule'
      } else if (eventOutcome === 'checkout_reschedule_required') {
        cfg.label = 'Checkout Outcome: Reschedule Required'
        cfg.color = 'text-blue-400'; cfg.bg = 'bg-blue-500/10'; cfg.border = 'border-blue-500/20'; cfg.icon = 'event_repeat'
      } else if (eventOutcome === 'not_currently_eligible') {
        cfg.label = 'Checkout Outcome: Not Currently Eligible'
        cfg.color = 'text-red-400'; cfg.bg = 'bg-red-500/10'; cfg.border = 'border-red-500/20'; cfg.icon = 'block'
      } else if (row.new_status === 'checkout_payment_required') {
        cfg.label = 'Payment Required'
      } else {
        cfg.label = 'Checkout Complete'
        cfg.color = 'text-slate-400'; cfg.bg = 'bg-white/5'; cfg.border = 'border-white/10'; cfg.icon = 'done_all'
      }
    }
  }

  let noteText = row.note
  if (noteText) {
    if (noteText.startsWith('Admin ')) noteText = noteText.slice(6)
    if (bookingType === 'checkout') {
      // Replace raw DB outcome tokens with human-readable equivalents
      Object.entries(CHECKOUT_OUTCOME_NOTE_LABELS).forEach(([token, label]) => {
        noteText = noteText!.replace(new RegExp(token, 'g'), label)
      })
    }
  }

  return (
    <li className="flex gap-4 relative pb-5 last:pb-0">
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-white/[0.07]" />
      )}

      {/* Icon dot */}
      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center z-10 mt-0.5 ${cfg.bg} border ${cfg.border}`}>
        <span
          className={`material-symbols-outlined text-[13px] ${cfg.color}`}
          style={{ fontVariationSettings: "'FILL' 1, 'wght' 400" }}
        >
          {cfg.icon}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className={`text-sm font-medium leading-snug ${cfg.color}`}>{cfg.label}</p>
          <p className="text-[10px] text-slate-600 font-mono flex-shrink-0 mt-0.5 tabular-nums">
            {new Date(row.created_at).toLocaleDateString('en-AU', {
              timeZone: 'Australia/Sydney',
              day:      'numeric',
              month:    'short',
              year:     'numeric',
            })}
          </p>
        </div>
        {noteText && (
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
            {noteText}
          </p>
        )}
      </div>
    </li>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type PageProps = { params: { id: string } }

export default async function BookingDetailPage({ params }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'admin') redirect('/admin')

  // ── SECURITY: ownership filter ─────────────────────────────────────────────
  // .eq('booking_owner_user_id', user.id) ensures customers can only read
  // their own bookings. The query returns null for any other user's ID,
  // and notFound() below converts that to a 404.
  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id, aircraft_id, status, booking_type, scheduled_start, scheduled_end, checkout_lifecycle_status,
      estimated_hours, estimated_amount,
      pic_name, pic_arn, customer_notes, admin_notes,
      booking_reference,
      subtotal_cents, advance_applied_cents, amount_due_cents, payment_status,
      created_at, updated_at,
      aircraft ( registration, aircraft_type ),
      flight_records ( status, submitted_at )
    `)
    .eq('id', params.id)
    .eq('booking_owner_user_id', user.id)
    .single()

  if (!booking) notFound()

  const { data: activePackage } = await supabase
    .from('pilot_block_time_purchases')
    .select(`
      id,
      hours_remaining,
      rate_per_hour,
      expires_at,
      hours_purchased,
      package:block_time_packages(name)
    `)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('activated_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: latestRescheduleRequest } = await supabase
    .from('checkout_change_requests')
    .select('id, status, requested_scheduled_start, requested_scheduled_end, created_at')
    .eq('checkout_request_id', booking.id)
    .eq('request_type', 'reschedule')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const pendingRescheduleRequest =
    latestRescheduleRequest?.status === 'pending'
      ? latestRescheduleRequest
      : null
  const bookingSlotHours = Math.max(
    0,
    (new Date(booking.scheduled_end).getTime() - new Date(booking.scheduled_start).getTime()) / (1000 * 60 * 60),
  )

  // ── Status history ─────────────────────────────────────────────────────────
  // Safe to use booking.id here because the ownership check above already ran.
  const { data: rawHistory } = await supabase
    .from('booking_status_history')
    .select('new_status, old_status, note, created_at')
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: true })

  const statusHistory = (rawHistory ?? []) as StatusHistoryRow[]

  const aircraft    = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
  const status      = deriveBookingStatusForFlightRecord(booking)
  const bookingType = (booking as { booking_type?: string }).booking_type ?? 'standard'
  const isCheckout  = bookingType === 'checkout'
  const isMultiDayBooking =
    new Date(booking.scheduled_start).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }) !==
    new Date(booking.scheduled_end).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const is24HourBooking = bookingSlotHours >= 24
  const daysUntilExpiry = activePackage
    ? Math.ceil((new Date(activePackage.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null
  const { data: termsAcceptanceRow } = await supabase
    .from('booking_terms_acceptances')
    .select('accepted_at, terms_version, terms_document_id')
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

  // Fetch the checkout outcome for completed checkout bookings.
  // checkout_invoices.checkout_outcome is the authoritative source set by
  // complete_checkout_outcome_atomic when the admin records the outcome.
  let checkoutOutcome: string | null = null
  if (bookingType === 'checkout' && (status === 'completed' || status === 'post_flight_approved')) {
    const { data: outcomeRow } = await supabase
      .from('checkout_invoices')
      .select('checkout_outcome')
      .eq('booking_id', booking.id)
      .maybeSingle()
    checkoutOutcome = (outcomeRow as { checkout_outcome?: string | null } | null)?.checkout_outcome ?? null
  }

  const cfg = { ...(STATUS_CFG[status] ?? { label: status.replace(/_/g, ' '), sublabel: '', color: 'text-slate-400', bg: 'bg-white/5', border: 'border-white/10', icon: 'info' }) }
  if (bookingType === 'checkout' && status === 'completed') {
    if (checkoutOutcome === 'cleared_to_fly') {
      cfg.label = 'Cleared to Fly'; cfg.color = 'text-green-400'; cfg.bg = 'bg-green-500/10'; cfg.border = 'border-green-500/20'; cfg.icon = 'verified'
    } else if (checkoutOutcome === 'additional_checkout_required') {
      cfg.label = 'Additional Checkout Required'; cfg.color = 'text-amber-400'; cfg.bg = 'bg-amber-500/10'; cfg.border = 'border-amber-500/20'; cfg.icon = 'schedule'
    } else if (checkoutOutcome === 'checkout_reschedule_required') {
      cfg.label = 'Reschedule Required'; cfg.color = 'text-blue-400'; cfg.bg = 'bg-blue-500/10'; cfg.border = 'border-blue-500/20'; cfg.icon = 'event_repeat'
    } else if (checkoutOutcome === 'not_currently_eligible') {
      cfg.label = 'Not Currently Eligible'; cfg.color = 'text-red-400'; cfg.bg = 'bg-red-500/10'; cfg.border = 'border-red-500/20'; cfg.icon = 'block'
    } else {
      cfg.label = 'Checkout Complete'; cfg.color = 'text-slate-400'; cfg.bg = 'bg-white/5'; cfg.border = 'border-white/10'; cfg.icon = 'done_all'
    }
    cfg.sublabel = ''
  }

  // ── Checkout invoice + bank transfer fetch ────────────────────────────────────
  // Must run before activePipeline so isAwaitingManualPayment is available.
  let checkoutInvoice = null
  let bankTransferSubmission = null
  let bankDetails = null
  if (status === 'checkout_payment_required') {
    const { data: inv } = await supabase
      .from('checkout_invoices')
      .select('id, invoice_number, subtotal_cents, advance_applied_cents, stripe_amount_due_cents, status')
      .eq('booking_id', booking.id)
      .single()
    checkoutInvoice = inv

    if (inv) {
      const { data: sub } = await supabase
        .from('checkout_bank_transfer_submissions')
        .select('id, status')
        .eq('invoice_id', inv.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      bankTransferSubmission = sub
    }

    const name = PAYMENT_CONFIG.BANK_ACCOUNT_NAME
    const bsb  = PAYMENT_CONFIG.BANK_BSB
    const acct = PAYMENT_CONFIG.BANK_ACCOUNT_NUMBER
    if (name && bsb && acct) {
      bankDetails = { accountName: name, bsb, accountNumber: acct }
    } else {
      console.warn('[checkout] Bank transfer env vars not configured — bank transfer option hidden')
    }
  }

  // ── Standard booking invoice + bank transfer fetch ────────────────────────────
  let bookingInvoice: StandardBookingInvoicePreview | null = null
  let standardBankTransferSub: { id: string; status: string } | null = null
  let standardBankDetails: { accountName: string; bsb: string; accountNumber: string } | null = null

  if (status === 'payment_pending') {
    const { data: bInv } = await supabase
      .from('booking_invoices')
      .select('id, invoice_number, subtotal_cents, advance_applied_cents, stripe_amount_due_cents, total_paid_cents, paid_at, status, payment_method')
      .eq('booking_id', booking.id)
      .maybeSingle()
    bookingInvoice = bInv as StandardBookingInvoicePreview | null

    if (bInv) {
      const { data: bSub } = await supabase
        .from('booking_bank_transfer_submissions')
        .select('id, status')
        .eq('invoice_id', bInv.id)
        .order('submitted_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()
      standardBankTransferSub = bSub
    }

    const name = PAYMENT_CONFIG.BANK_ACCOUNT_NAME
    const bsb  = PAYMENT_CONFIG.BANK_BSB
    const acct = PAYMENT_CONFIG.BANK_ACCOUNT_NUMBER
    if (name && bsb && acct) {
      standardBankDetails = { accountName: name, bsb, accountNumber: acct }
    }
  }

  // Derive standard booking awaiting manual payment state
  let standardPaymentDisplayState: ReturnType<typeof getStandardBookingPaymentDisplayState> = 'unknown'
  if (status === 'payment_pending' && bookingInvoice) {
    const standardInvoice = bookingInvoice
    standardPaymentDisplayState = getStandardBookingPaymentDisplayState({
      bookingStatus: status,
      invoiceStatus: standardInvoice.status,
      invoicePaidAt: standardInvoice.paid_at,
      invoiceAmountDueCents: standardInvoice.stripe_amount_due_cents,
      invoiceTotalPaidCents: standardInvoice.total_paid_cents,
      latestSubmissionStatus: standardBankTransferSub?.status ?? null,
    })
  }

  // ── Derive checkout payment display state ─────────────────────────────────────
  const checkoutPaymentDisplayState = status === 'checkout_payment_required'
    ? getCheckoutPaymentDisplayState(
        checkoutInvoice ? { status: (checkoutInvoice as any).status ?? 'payment_required' } : null,
        bankTransferSubmission,
      )
    : null

  const isAwaitingManualPayment = checkoutPaymentDisplayState === 'awaiting_manual_payment_confirmation'

  // Override cfg for checkout awaiting manual payment confirmation
  if (isAwaitingManualPayment) {
    const manualCfg = STATUS_CFG['checkout_awaiting_manual_payment']
    if (manualCfg) {
      cfg.label    = manualCfg.label
      cfg.sublabel = manualCfg.sublabel
      cfg.color    = manualCfg.color
      cfg.bg       = manualCfg.bg
      cfg.border   = manualCfg.border
      cfg.icon     = manualCfg.icon
    }
  }

  // Override cfg for standard booking awaiting bank transfer confirmation
  if (standardPaymentDisplayState === 'payment_review_pending') {
    cfg.label    = 'Payment Submitted'
    cfg.sublabel = 'Awaiting review'
    cfg.color    = 'text-blue-400'
    cfg.bg       = 'bg-blue-500/10'
    cfg.border   = 'border-blue-500/20'
    cfg.icon     = 'account_balance'
  } else if (standardPaymentDisplayState === 'payment_proof_rejected') {
    cfg.label    = 'Proof Rejected'
    cfg.sublabel = 'Submit a new bank-transfer proof'
    cfg.color    = 'text-red-400'
    cfg.bg       = 'bg-red-500/10'
    cfg.border   = 'border-red-500/20'
    cfg.icon     = 'error'
  } else if (standardPaymentDisplayState === 'payment_still_due') {
    cfg.label    = 'Payment Still Due'
    cfg.sublabel = 'Outstanding balance remains'
    cfg.color    = 'text-orange-400'
    cfg.bg       = 'bg-orange-500/10'
    cfg.border   = 'border-orange-500/20'
    cfg.icon     = 'payments'
  }

  const isCancelled = status === 'cancelled' || status === 'no_show'
  const isStandardPipeline = bookingType === 'standard'
  const isCheckoutPipeline = bookingType === 'checkout'

  // ── Cancellation request (if any) ─────────────────────────────────────────
  // Fetch for display whenever booking is cancelled or cancellation_requested.
  type CancellationRequestDisplay = {
    status:             string
    charge_amount_cents: number | null
    customer_message:   string | null
  }
  let cancellationRequest: CancellationRequestDisplay | null = null

  if (status === 'cancellation_requested' || isCancelled) {
    const { data: crData } = await supabase
      .from('booking_cancellation_requests')
      .select('status, charge_amount_cents, customer_message')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    cancellationRequest = (crData as CancellationRequestDisplay | null) ?? null
  }

  // ── Customer action button eligibility (standard bookings only) ───────────
  const CANCELLABLE_STATUSES = ['confirmed', 'pending_confirmation', 'ready_for_dispatch', 'dispatched']
  const FLIGHT_RECORD_STATUSES = ['confirmed', 'ready_for_dispatch', 'dispatched', 'awaiting_flight_record']

  const showCancelButton =
    bookingType === 'standard' &&
    CANCELLABLE_STATUSES.includes(status)

  const showFlightRecordButton =
    bookingType === 'standard' &&
    FLIGHT_RECORD_STATUSES.includes(status) &&
    status !== 'awaiting_flight_record' // full-width layout handles that case

  // 24h check for late-cancel modal — server-side computation passed to client
  const msUntilDeparture = new Date(booking.scheduled_start).getTime() - Date.now()
  const isWithin24Hours  = msUntilDeparture <= 24 * 60 * 60 * 1000

  const departureSydney = new Date(booking.scheduled_start).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday:  'short',
    month:    'short',
    day:      'numeric',
    hour:     'numeric',
    minute:   '2-digit',
  })

  // For checkout bookings, replace the final "Completed" journey step label with
  // the actual outcome so the journey reflects what happened rather than just "Completed".
  const activePipeline = isStandardPipeline
    ? PIPELINE
    : CHECKOUT_PIPELINE.map(step => {
        if (step.key === 'completed' && checkoutOutcome) {
          return { ...step, label: CHECKOUT_OUTCOME_STEP_LABELS[checkoutOutcome] ?? 'Completed' }
        }
        if (step.key === 'checkout_payment_required' && isAwaitingManualPayment) {
          return { ...step, label: 'Awaiting Payment Confirmation' }
        }
        return step
      })
  const currentIdx = isStandardPipeline
    ? getStandardPipelineIdx(status)
    : CHECKOUT_PIPELINE_ORDER.indexOf(status as BookingStatus)
  const bookingRef  = (booking as { booking_reference?: string }).booking_reference

  // Surface admin_notes as the cancellation reason when booking is cancelled.
  const adminNotes = (booking as { admin_notes?: string | null }).admin_notes ?? null

  // Extract the most recent clarification question from the status history.
  // Stored in booking_status_history.note when new_status = 'needs_clarification'.
  const clarificationQuestion = [...statusHistory]
    .reverse()
    .find(r => r.new_status === 'needs_clarification')?.note ?? null

  // ── Post-flight clarification — fetch flight record + clarification + attachments
  // Only executed when booking is in pending_post_flight_review.
  let postFlightRecord: FlightRecord | null = null
  let postFlightClarification: FlightRecordClarification | null = null
  type AttachmentWithUrl = FlightRecordAttachment & { signedUrl: string | null }
  let postFlightAttachments: AttachmentWithUrl[] = []

  if (status === 'pending_post_flight_review') {
    const { data: frData } = await supabase
      .from('flight_records')
      .select('*')
      .eq('booking_id', booking.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single()

    postFlightRecord = (frData ?? null) as FlightRecord | null

    if (postFlightRecord) {
      // Fetch persisted attachments and generate signed URLs for display
      const { data: rawAtts } = await supabase
        .from('flight_record_attachments')
        .select('*')
        .eq('flight_record_id', postFlightRecord.id)
        .order('created_at', { ascending: true })

      postFlightAttachments = await Promise.all(
        (rawAtts ?? []).map(async (att: FlightRecordAttachment) => {
          const { data } = await supabase.storage
            .from('flight_record_evidence')
            .createSignedUrl(att.storage_path, 3600)
          return { ...att, signedUrl: data?.signedUrl ?? null }
        }),
      )

      if (postFlightRecord.status === 'needs_clarification') {
        const { data: clarData } = await supabase
          .from('flight_record_clarifications')
          .select('*')
          .eq('flight_record_id', postFlightRecord.id)
          .eq('is_resolved', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        postFlightClarification = (clarData ?? null) as FlightRecordClarification | null
      }
    }
  }

  let standardBilling = null
  if (isStandardPipeline && booking.subtotal_cents != null) {
    standardBilling = {
      subtotal_cents: booking.subtotal_cents,
      advance_applied_cents: booking.advance_applied_cents ?? 0,
      amount_due_cents: booking.amount_due_cents ?? 0,
    }
  }

  // ── Awaiting flight record — dedicated full-width layout ─────────────────────
  if (status === 'awaiting_flight_record') {
    const flightDate = new Date(booking.scheduled_start).toLocaleDateString('en-CA', {
      timeZone: 'Australia/Sydney',
    })

    const aircraftTypeShort = (aircraft as { aircraft_type?: string } | null)?.aircraft_type
      ?.toUpperCase().replace(/_/g, ' ')

    // Fetch active airports for the landing details section of the flight record form
    const { data: airportRows } = await supabase
      .from('airports')
      .select('id, icao_code, name')
      .eq('is_active', true)
      .order('icao_code', { ascending: true })
    const airports = (airportRows ?? []) as { id: string; icao_code: string; name: string }[]

    // Simplified journey for awaiting_flight_record
    const JOURNEY = [
      { label: 'Booking Confirmed',       state: 'done'    as const },
      { label: 'Flight Returned',         state: 'active'  as const },
      { label: 'Post Flight Records Submitted', state: 'pending' as const },
      { label: 'Completed',               state: 'pending' as const },
    ]

    return (
      <CustomerBookingShell user={user as User} profile={profile as Profile | null}>
        <BookingRealtimeListener bookingId={booking.id} />
        <div className="w-full">

          {/* Hero — full bleed, starts immediately after the Pilot Portal subnav */}
          <PostFlightHero
            bookingRef={bookingRef ?? undefined}
            aircraftReg={aircraft?.registration ?? undefined}
          />

          {activePackage && (
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 xl:px-12 mt-6">
              <BlockTimeInfoBanner
                activePackage={activePackage as ActiveBlockTimePackage | null}
                bookingSlotHours={bookingSlotHours}
                is24HourBooking={is24HourBooking}
                daysUntilExpiry={daysUntilExpiry}
              />
            </div>
          )}

          {/* Content grid — same container as dashboard content section */}
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 xl:px-12 pt-8 pb-16">
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">

              {/* ── Left column ─────────────────────────────────────────── */}
              <div className="space-y-4 lg:sticky lg:top-6">

                {/* Flight Details */}
                <div className="bg-white border border-[#dbe7f4] rounded-[1.5rem] p-6 shadow-[0_8px_24px_rgba(21,45,90,0.06)]">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6] mb-5">
                    Flight Details
                  </h3>
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-[#f8fbff] border border-[#dbe7f4] p-3.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4b6390] block mb-1">Aircraft</span>
                      <span className="text-sm text-[#152d5a] font-medium">
                        {aircraft?.registration ?? '—'}
                        {aircraftTypeShort ? ` (${aircraftTypeShort})` : ''}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-[#f8fbff] border border-[#dbe7f4] p-3.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4b6390] block mb-1">Pilot In Command</span>
                      <span className="text-sm text-[#152d5a]">{booking.pic_name ?? '—'}</span>
                    </div>
                    <div className="rounded-2xl bg-[#f8fbff] border border-[#dbe7f4] p-3.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4b6390] block mb-1">ARN</span>
                      <span className="text-sm text-[#152d5a] font-mono">{booking.pic_arn ?? '—'}</span>
                    </div>
                    <div className="rounded-2xl bg-[#f8fbff] border border-[#dbe7f4] p-3.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4b6390] block mb-1">Date</span>
                      <span className="text-sm text-[#152d5a]">
                        {formatDateFromISO(booking.scheduled_start)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Journey */}
                <div className="bg-white border border-[#dbe7f4] rounded-[1.5rem] p-6 shadow-[0_8px_24px_rgba(21,45,90,0.06)]">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6] mb-5">
                    Status Journey
                  </h3>
                  <ol className="space-y-0">
                    {JOURNEY.map((step, idx) => (
                      <li key={step.label} className="flex gap-4 pb-5 last:pb-0 relative">
                        {idx < JOURNEY.length - 1 && (
                          <div
                            className={`absolute left-[11px] top-6 bottom-0 w-[2px] ${
                              step.state === 'done' ? 'bg-gradient-to-b from-blue-400/60 to-blue-200/20' : 'bg-[#dbe7f4]'
                            }`}
                          />
                        )}
                        <div
                          className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border-2 mt-0.5 z-10 ${
                            step.state === 'done'
                              ? 'bg-[#1a4fd6] border-[#1a4fd6]'
                              : step.state === 'active'
                              ? 'border-amber-400 bg-amber-50'
                              : 'border-[#cbdcf0] bg-white'
                          }`}
                        >
                          {step.state === 'done' && (
                            <span
                              className="material-symbols-outlined text-white text-[11px]"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              check
                            </span>
                          )}
                          {step.state === 'active' && (
                            <span className="w-2 h-2 rounded-full bg-amber-400 block" />
                          )}
                        </div>
                        <div className="pt-0.5">
                          <p className={`text-sm font-medium ${
                            step.state === 'done'
                              ? 'text-[#1a4fd6]'
                              : step.state === 'active'
                              ? 'text-amber-700'
                              : 'text-[#4b6390]'
                          }`}>
                            {step.label}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Next Steps */}
                <div className="bg-white border border-[#dbe7f4] rounded-[1.5rem] p-6 shadow-[0_8px_24px_rgba(21,45,90,0.06)]">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6] mb-4">
                    Next Steps
                  </h3>
                  <ul className="space-y-3">
                    {[
                      'Operations will review the submitted meter readings and evidence.',
                      'Discrepancies may delay the finalization of the flight record.',
                      'Final billing will be processed upon approval.',
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5 rounded-2xl bg-[#f8fbff] border border-[#dbe7f4] px-3 py-2.5">
                        <span className="material-symbols-outlined text-[#1a4fd6]/50 text-sm mt-0.5 flex-shrink-0">
                          chevron_right
                        </span>
                        <span className="text-sm text-[#4b6390] leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>

              {/* ── Right column — form ──────────────────────────────────── */}
              <div className="lg:pt-0">
                <FlightRecordForm
                  bookingId={booking.id}
                  picName={booking.pic_name}
                  picArn={booking.pic_arn}
                  flightDate={flightDate}
                  airports={airports}
                  activePackage={activePackage as ActiveBlockTimePackage | null}
                  bookingSlotHours={bookingSlotHours}
                  is24HourBooking={is24HourBooking}
                />
              </div>

            </div>
          </div>

        </div>
      </CustomerBookingShell>
    )
  }

  // Derived: whether the hero helper text should be shown
  const heroScheduledEndMs = booking.scheduled_end ? new Date(booking.scheduled_end).getTime() : 0
  const heroShowReturnButton = heroScheduledEndMs > 0 && Date.now() >= heroScheduledEndMs - 30 * 60 * 1000
  const showHeroHelperText =
    bookingType === 'standard' &&
    (status === 'confirmed' || status === 'ready_for_dispatch' || status === 'dispatched') &&
    heroScheduledEndMs > 0 &&
    !heroShowReturnButton

  // Step descriptions for the Booking Journey timeline
  const STEP_DESCRIPTIONS: Record<string, string> = {
    confirmed:                  'Booking auto-confirmed for cleared pilot.',
    awaiting_flight_record:     'Arrive at the aircraft and complete your flight.',
    pending_post_flight_review: 'Submit your post flight records and any required documents.',
    post_flight_approved:       'Your booking will be marked as completed.',
  }

  return (
    <CustomerBookingShell user={user as User} profile={profile as Profile | null}>
      <BookingRealtimeListener bookingId={booking.id} />
      <div className="w-full pb-16 pt-0">

        <PortalPageHero
          eyebrow="BOOKING DETAIL"
          title={isCheckout ? 'Checkout Flight' : 'Flight Booking'}
          subtitle={`${((aircraft as { aircraft_type?: string } | null)?.aircraft_type ?? 'Cessna 172N').replace(/Cessna 172(?!N)/g, 'Cessna 172N')} · ${aircraft?.registration ?? 'VH-KZG'}`}
          backgroundImage="/CustomerDashboard/CustomerDashboard-CheckoutHero.png"
          backgroundPosition="center"
          backHref="/dashboard/bookings"
          backLabel="My Bookings"
          statusPill={{
            label: bookingRef ?? 'Booking',
            color: 'blue',
          }}
          cta={showFlightRecordButton || showCancelButton
            ? {
                label: isCheckout ? 'View Booking' : 'My Bookings',
                href: '/dashboard/bookings',
                icon: 'chevron_right',
              }
            : undefined}
        />

        {activePackage && (
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 xl:px-12 mt-6">
            <BlockTimeInfoBanner
              activePackage={activePackage as ActiveBlockTimePackage | null}
              bookingSlotHours={bookingSlotHours}
              is24HourBooking={is24HourBooking}
              daysUntilExpiry={daysUntilExpiry}
            />
          </div>
        )}

        {/* ─── Middle row: Journey · Flight Details · Booking Status ──────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[2.1fr_1.75fr_1.55fr] gap-4 items-stretch mb-6 mt-6">

          {/* ── Booking Journey ─────────────────────────────────────────── */}
          {!isCancelled && (isStandardPipeline || isCheckoutPipeline) ? (
            <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-7">
              <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#4b6390] mb-3">
                Booking Journey
              </h3>
              <ol className="relative space-y-0">
                {activePipeline.map((step, idx) => {
                  let stepState: 'done' | 'active' | 'pending'
                  if (currentIdx === -1) {
                    stepState = 'pending'
                  } else if (idx < currentIdx) {
                    stepState = 'done'
                  } else if (idx === currentIdx) {
                    stepState = 'active'
                  } else {
                    stepState = 'pending'
                  }

                  const histRow = stepState === 'done' ? statusHistory.find(r => {
                    if (step.key === 'confirmed') return ['confirmed', 'pending_confirmation'].includes(r.new_status)
                    return r.new_status === step.key
                  }) : null

                  return (
                    <li key={step.key} className="flex gap-4 pb-7 last:pb-0 relative">
                      {idx < activePipeline.length - 1 && (
                        <div className={`absolute left-[15px] top-8 bottom-0 w-[2px] ${
                          stepState === 'done'
                            ? 'bg-gradient-to-b from-[rgba(74,139,232,0.45)] to-[rgba(74,139,232,0.12)]'
                            : 'bg-[#152d5a]/10'
                        }`} />
                      )}
                      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center z-10 mt-0.5 ${
                        stepState === 'done'
                          ? 'bg-[rgba(59,130,246,0.15)] border border-[rgba(59,130,246,0.40)]'
                          : stepState === 'active'
                          ? 'bg-[rgba(245,158,11,0.12)] border border-[rgba(245,158,11,0.58)] shadow-[0_0_16px_rgba(245,158,11,0.22)]'
                          : 'bg-transparent border border-[#152d5a]/10'
                      }`}>
                        {stepState === 'done' && (
                          <span className="material-symbols-outlined text-blue-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                        )}
                        {stepState === 'active' && (
                          <span className="material-symbols-outlined text-amber-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>flight</span>
                        )}
                      </div>

                      <div className="flex-1 pt-1 min-w-0">
                        <p className={`text-[13px] font-semibold leading-snug ${
                          stepState === 'active' ? 'text-[#152d5a]' :
                          stepState === 'done'   ? 'text-[#1a4fd6]' :
                                                   'text-[#4b6390]/60'
                        }`}>
                          {step.label}
                        </p>
                        {histRow && (
                          <p className="text-[10px] text-[#4b6390] mt-0.5 font-mono tabular-nums">
                            {formatDateFromISO(histRow.created_at)}
                            {isStandardPipeline && STEP_DESCRIPTIONS[step.key] && ` · ${STEP_DESCRIPTIONS[step.key]}`}
                          </p>
                        )}
                        {stepState === 'active' && isStandardPipeline && STEP_DESCRIPTIONS[step.key] && (
                          <p className="text-[11px] mt-0.5 text-amber-600/70 leading-relaxed">
                            {STEP_DESCRIPTIONS[step.key]}
                          </p>
                        )}
                        {stepState === 'pending' && isStandardPipeline && STEP_DESCRIPTIONS[step.key] && (
                          <p className="text-[11px] mt-0.5 text-[#4b6390]/40 leading-relaxed">
                            {STEP_DESCRIPTIONS[step.key]}
                          </p>
                        )}
                        {stepState === 'active' && step.key === 'checkout_payment_required' && isAwaitingManualPayment && (
                          <p className="text-[10px] text-blue-600/70 mt-0.5">
                            Bank transfer submitted. Awaiting admin verification.
                          </p>
                        )}
                        {stepState === 'pending' && step.key === 'completed' && isCheckoutPipeline && currentIdx === 3 && (
                          <p className="text-[10px] text-[#4b6390]/40 mt-0.5">Pending payment completion</p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          ) : (
            <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-7 flex items-center justify-center">
              <p className="text-sm text-[#4b6390] text-center">Journey not available for this booking.</p>
            </div>
          )}

          {/* ── Flight Details ──────────────────────────────────────────── */}
            <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6">
              <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#4b6390] mb-3">
              Flight Details
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-[#f0f6ff] border border-[#152d5a]/10 rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="material-symbols-outlined text-[#1a4fd6]/45 text-[12px]">flight_takeoff</span>
                  <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#4b6390] mb-1">Starts (Sydney)</p>
                </div>
                <p className="text-[15px] font-semibold text-[#152d5a]">{formatDateFromISO(booking.scheduled_start)}</p>
                <p className="text-[13px] font-semibold text-[#152d5a] tabular-nums">{new Date(booking.scheduled_start).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' })}</p>
                <p className="text-[9px] text-[#4b6390] mt-0.5">(AEST)</p>
              </div>
              <div className="bg-[#f0f6ff] border border-[#152d5a]/10 rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="material-symbols-outlined text-[#1a4fd6]/45 text-[12px]">flight_land</span>
                  <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#4b6390] mb-1">Ends (Sydney)</p>
                </div>
                <p className="text-[15px] font-semibold text-[#152d5a]">{formatDateFromISO(booking.scheduled_end)}</p>
                <p className="text-[13px] font-semibold text-[#152d5a] tabular-nums">{new Date(booking.scheduled_end).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' })}</p>
                <p className="text-[9px] text-[#4b6390] mt-0.5">(AEST)</p>
              </div>
              <div className="bg-[#f0f6ff] border border-[#152d5a]/10 rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="material-symbols-outlined text-[#1a4fd6]/45 text-[12px]">flight</span>
                  <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#4b6390] mb-1">Aircraft</p>
                </div>
                <p className="text-[15px] font-semibold text-[#152d5a]">{aircraft?.registration ?? '—'}</p>
                <p className="text-[9px] text-[#4b6390] mt-0.5 capitalize">
                  {(aircraft as { aircraft_type?: string } | null)?.aircraft_type?.replace(/_/g, ' ') ?? ''}
                </p>
              </div>
              {booking.estimated_hours != null && (
                <div className="bg-[#f0f6ff] border border-[#152d5a]/10 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="material-symbols-outlined text-[#1a4fd6]/45 text-[12px]">timer</span>
                    <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#4b6390] mb-1">
                      {isMultiDayBooking ? 'Booking Window' : 'Est. Duration'}
                    </p>
                  </div>
                  <p className="text-[15px] font-semibold text-[#152d5a]">{booking.estimated_hours.toFixed(1)} h</p>
                </div>
              )}
              {booking.pic_name && (
                <div className="bg-[#f0f6ff] border border-[#152d5a]/10 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="material-symbols-outlined text-[#1a4fd6]/45 text-[12px]">person</span>
                    <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#4b6390] mb-1">Pilot in Command</p>
                  </div>
                  <p className="text-[15px] font-semibold text-[#152d5a]">{booking.pic_name}</p>
                </div>
              )}
              {booking.pic_arn && (
                <div className="bg-[#f0f6ff] border border-[#152d5a]/10 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="material-symbols-outlined text-[#1a4fd6]/45 text-[12px]">badge</span>
                    <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#4b6390] mb-1">ARN</p>
                  </div>
                  <p className="text-[15px] font-semibold text-[#152d5a] font-mono">{booking.pic_arn}</p>
                </div>
              )}
              {bookingType === 'checkout' && booking.estimated_amount != null && (
                <div className="bg-[#f0f6ff] border border-[#152d5a]/10 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="material-symbols-outlined text-[#1a4fd6]/45 text-[12px]">payments</span>
                    <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#4b6390] mb-1">Checkout Fee</p>
                  </div>
                  <p className="text-[15px] font-semibold text-[#152d5a]">${booking.estimated_amount.toFixed(0)}</p>
                  <p className="text-[9px] text-[#4b6390] mt-0.5">Invoiced after checkout</p>
                </div>
              )}
            </div>
            {booking.customer_notes && (
              <div className="mt-3 bg-[#f0f6ff] border border-[#152d5a]/10 rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="material-symbols-outlined text-[#1a4fd6]/45 text-[12px]">notes</span>
                  <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#4b6390] mb-1">Your Notes</p>
                </div>
                <p className="text-[15px] font-semibold text-[#152d5a] leading-relaxed">{booking.customer_notes}</p>
              </div>
            )}
          </div>

          {/* ── Booking Status ──────────────────────────────────────────── */}
          <div className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <span className={`material-symbols-outlined text-[13px] ${cfg.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#4b6390]">Booking Status</h3>
            </div>
            <p className="text-[18px] font-semibold text-[#152d5a] mb-3">{cfg.label}</p>
            <p className="text-[13px] text-[#4b6390] leading-relaxed relative z-10">
              {(status === 'confirmed' || status === 'ready_for_dispatch' || status === 'dispatched')
                ? 'Your booking is confirmed. Please arrive at the aircraft at least 30 minutes before your scheduled departure for pre-flight checks.'
                : status === 'awaiting_flight_record'
                ? 'Your flight is complete. Please submit your post flight records.'
                : status === 'pending_post_flight_review'
                ? 'Your post flight records have been submitted and are under review by the operations team.'
                : status === 'post_flight_approved'
                ? 'Your post flight records have been reviewed and approved.'
                : status === 'completed'
                ? 'This booking is fully closed. Thank you for flying with OZ Rent a Plane.'
                : status === 'pending_confirmation'
                ? 'Your booking request is under review. The slot is held pending confirmation.'
                : cfg.sublabel || '—'}
            </p>
          </div>
        </div>

        {/* ─── Bottom row: full-width Next Action ─────────────────────────── */}
        <NextActionCard
          status={status}
          bookingType={bookingType}
          adminNotes={adminNotes}
          clarificationQuestion={clarificationQuestion}
          bookingId={booking.id}
          picName={booking.pic_name}
          picArn={booking.pic_arn}
          flightDate={new Date(booking.scheduled_start).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })}
          scheduledEnd={booking.scheduled_end}
          postFlightClarification={postFlightClarification}
          flightRecord={postFlightRecord}
          postFlightAttachments={postFlightAttachments}
          checkoutInvoice={checkoutInvoice}
          bankTransferSubmission={bankTransferSubmission}
          bankDetails={bankDetails}
          checkoutOutcome={checkoutOutcome}
          standardBilling={standardBilling}
          bookingInvoice={bookingInvoice}
          bookingSlotHours={bookingSlotHours}
          standardBankTransferSub={standardBankTransferSub}
          standardBankDetails={standardBankDetails}
          cancellationRequest={cancellationRequest}
          showFlightRecordButton={showFlightRecordButton}
          isWithin24Hours={isWithin24Hours}
          departureSydney={departureSydney}
          activePackage={activePackage as ActiveBlockTimePackage | null}
          is24HourBooking={is24HourBooking}
        />

        {/* Terms accepted — shown at the bottom if present */}
        {termsAcceptanceRow && (
      <div className="mt-5 bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6 space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#4b6390]">Terms Accepted</h3>
        <p className="text-sm text-[#4b6390]">
          Accepted: {termsAcceptanceRow.accepted_at ? formatDateTime(termsAcceptanceRow.accepted_at) : '—'}
        </p>
        <p className="text-sm text-[#4b6390]">Version: {termsAcceptanceRow.terms_version ?? '—'}</p>
        {acceptedTermsPublicUrl && (
          <a href={acceptedTermsPublicUrl} target="_blank" rel="noreferrer" className="text-sm text-[#1a4fd6] hover:underline">
            View terms
          </a>
        )}
          </div>
        )}

      </div>
    </CustomerBookingShell>
  )
}
