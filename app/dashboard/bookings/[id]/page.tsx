import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import CustomerBookingShell from '../CustomerBookingShell'
import ClarificationResponseForm from './ClarificationResponseForm'
import FlightRecordForm from './FlightRecordForm'
import PostFlightHero from './PostFlightHero'
import PostFlightClarificationPanel from './PostFlightClarificationPanel'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase/types'
import type { BookingStatus, FlightRecord, FlightRecordAttachment, FlightRecordClarification } from '@/lib/supabase/booking-types'
import { formatDateFromISO } from '@/lib/formatDateTime'
import { formatSydTime } from '@/lib/utils/sydney-time'
import { createCheckoutPaymentSession } from '@/app/actions/payment'

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
  completed:                       { label: 'Completed',              sublabel: 'Booking closed',              color: 'text-slate-400',  bg: 'bg-white/5',       border: 'border-white/10',      icon: 'done_all'        },
  cancelled:                       { label: 'Cancelled',              sublabel: 'Will not proceed',            color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'cancel'          },
  no_show:                         { label: 'No Show',                sublabel: 'Marked absent',               color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'person_off'      },
  // Checkout booking statuses
  checkout_requested:              { label: 'Under Review',           sublabel: 'Awaiting confirmation',       color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'pending'         },
  checkout_confirmed:              { label: 'Confirmed',              sublabel: 'Checkout flight confirmed',   color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   icon: 'event_available' },
  checkout_completed_under_review: { label: 'Awaiting Outcome',       sublabel: 'Checkout under review',       color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: 'rate_review'     },
  checkout_payment_required:       { label: 'Payment Required',       sublabel: 'Pay to unlock bookings',      color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: 'payments'      },
}

// Forward-looking pipeline — the journey from request to completion.
const PIPELINE: { key: BookingStatus; label: string }[] = [
  { key: 'pending_confirmation',       label: 'Request Submitted'    },
  { key: 'confirmed',                  label: 'Confirmed'            },
  { key: 'ready_for_dispatch',         label: 'Ready for Dispatch'   },
  { key: 'dispatched',                 label: 'Departed'             },
  { key: 'awaiting_flight_record',     label: 'Awaiting Record'      },
  { key: 'pending_post_flight_review', label: 'Post-Flight Review'   },
  { key: 'post_flight_approved',       label: 'Review Approved'      },
  { key: 'completed',                  label: 'Completed'            },
]

const CHECKOUT_PIPELINE: { key: BookingStatus; label: string }[] = [
  { key: 'checkout_requested',              label: 'Request Submitted' },
  { key: 'checkout_confirmed',              label: 'Checkout Confirmed' },
  { key: 'checkout_completed_under_review', label: 'Checkout Completed' },
  { key: 'checkout_payment_required',       label: 'Payment Required' },
  { key: 'completed',                       label: 'Completed' },
]

const PIPELINE_ORDER = PIPELINE.map(p => p.key)
const CHECKOUT_PIPELINE_ORDER = CHECKOUT_PIPELINE.map(p => p.key)

type StatusHistoryRow = {
  new_status: string
  old_status: string | null
  note:       string | null
  created_at: string
}

// ── Next action card ──────────────────────────────────────────────────────────

function NextActionCard({
  status,
  bookingType,
  adminNotes,
  clarificationQuestion,
  bookingId,
  picName,
  picArn,
  flightDate,
  postFlightClarification,
  flightRecord,
  postFlightAttachments,
  checkoutInvoice,
}: {
  status:                   string
  bookingType:              string
  adminNotes?:              string | null
  clarificationQuestion?:   string | null
  bookingId:                string
  picName?:                 string | null
  picArn?:                  string | null
  flightDate:               string
  postFlightClarification?: FlightRecordClarification | null
  flightRecord?:            FlightRecord | null
  postFlightAttachments?:   (FlightRecordAttachment & { signedUrl: string | null })[]
  checkoutInvoice?:         { subtotal_cents: number; advance_applied_cents: number; stripe_amount_due_cents: number } | null
}) {
  const isCancelled = status === 'cancelled' || status === 'no_show'

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
        <p className="text-sm text-oz-muted leading-relaxed">
          Your checkout booking is currently in progress. Aircraft bookings will become available after your checkout is completed, approved, and paid.
        </p>
      </div>
    )
  }

  if (status === 'checkout_payment_required') {
    const amountDue = checkoutInvoice ? (checkoutInvoice.stripe_amount_due_cents / 100).toFixed(2) : '290.00'
    const advanceApplied = checkoutInvoice ? (checkoutInvoice.advance_applied_cents / 100).toFixed(2) : '0.00'
    const subtotal = checkoutInvoice ? (checkoutInvoice.subtotal_cents / 100).toFixed(2) : '290.00'

    return (
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-orange-400 text-lg">payments</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-orange-400">Payment Required</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed mb-6">
          Your checkout flight has been approved! To finalize your clearance and unlock aircraft bookings, please pay the checkout fee.
        </p>

        {checkoutInvoice && (
          <div className="mb-6 space-y-2 p-4 rounded-xl bg-orange-500/[0.05] border border-orange-500/15 text-sm">
            <div className="flex justify-between text-slate-300">
              <span>Checkout Fee</span>
              <span>${subtotal}</span>
            </div>
            {checkoutInvoice.advance_applied_cents > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Advance Credit Applied</span>
                <span>-${advanceApplied}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-orange-400 pt-2 border-t border-orange-500/20">
              <span>Total Due</span>
              <span>${amountDue}</span>
            </div>
          </div>
        )}

        <form action={createCheckoutPaymentSession.bind(null, bookingId)}>
          <button type="submit" className="w-full bg-orange-500 hover:bg-orange-400 text-white rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[18px]">credit_card</span>
            Pay ${amountDue}
          </button>
        </form>
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
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400">Under Review</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          Your booking request is being reviewed by our operations team. Your requested time slot is{' '}
          <strong className="text-amber-300/80">currently being held</strong> while we complete the review. You will be notified by email once a decision is made.
        </p>
        <div className="mt-4 pt-3 border-t border-amber-500/15 flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-400/60 text-sm">lock_clock</span>
          <p className="text-[10px] text-amber-400/60 uppercase tracking-widest">Slot held · Typical review: within 24 hours</p>
        </div>
      </div>
    )
  }

  if (status === 'confirmed' || status === 'ready_for_dispatch') {
    return (
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-blue-400 text-lg">check_circle</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400">Booking Confirmed</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          Your booking is confirmed. Please arrive at the aircraft at least 30 minutes before your scheduled departure for pre-flight checks.
        </p>
        {status === 'ready_for_dispatch' && (
          <div className="mt-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-green-400 text-sm">task_alt</span>
            <p className="text-xs text-green-400/80">Pre-flight checks completed. Ready for departure.</p>
          </div>
        )}
      </div>
    )
  }

  if (status === 'dispatched') {
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-green-400 text-lg">flight</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-green-400">Flight in Progress</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          Your flight is currently active. Safe flying!
        </p>
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
            {isOverdue ? 'Record Overdue' : 'Submit Flight Record'}
          </h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          {isOverdue
            ? 'Your flight record is overdue. Please submit your meter readings and flight details immediately.'
            : 'Your flight is complete. Please submit your flight record including meter readings and any notes.'}
        </p>
        <FlightRecordForm
          bookingId={bookingId}
          picName={picName}
          picArn={picArn}
          flightDate={flightDate}
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
      <div className={`rounded-[1.25rem] p-6 space-y-4 ${isResubmitted ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-purple-500/10 border border-purple-500/20'}`}>
        <div className="flex items-center gap-3">
          <span className={`material-symbols-outlined text-lg ${isResubmitted ? 'text-emerald-400' : 'text-purple-400'}`}>
            {isResubmitted ? 'refresh' : 'rate_review'}
          </span>
          <h3 className={`text-xs font-bold uppercase tracking-widest ${isResubmitted ? 'text-emerald-400' : 'text-purple-400'}`}>
            {isResubmitted ? 'Resubmitted — Under Review' : 'Under Review'}
          </h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          {isResubmitted
            ? 'Your updated flight record has been submitted and is back with the operations team for review.'
            : 'Your flight record has been submitted and is currently being reviewed by the operations team.'}
        </p>
        {attCount > 0 && (
          <div className="pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
              Submitted Evidence
              <span className="ml-2 font-normal text-slate-600">({attCount} photo{attCount !== 1 ? 's' : ''})</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {(postFlightAttachments ?? []).map(att => (
                <div key={att.id} className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 bg-[#050c17] flex-shrink-0">
                  {att.signedUrl
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={att.signedUrl} alt={att.file_name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-slate-700 text-lg">image</span></div>
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
      return (
        <div className="bg-green-500/10 border border-green-500/20 rounded-[1.25rem] p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="material-symbols-outlined text-green-400 text-lg">verified</span>
            <h3 className="text-xs font-bold uppercase tracking-widest text-green-400">
              Checkout Complete
            </h3>
          </div>
          <p className="text-sm text-oz-muted">
            Your checkout flight has been completed and you have been cleared for aircraft booking.
          </p>
        </div>
      )
    }

    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-green-400 text-lg">verified</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-green-400">
            {status === 'completed' ? 'Booking Complete' : 'Flight Approved'}
          </h3>
        </div>
        <p className="text-sm text-oz-muted">
          {status === 'completed'
            ? 'This booking is fully closed. Thank you for flying with OZRentAPlane.'
            : 'Your post-flight records have been reviewed and approved.'}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white/5 border border-white/5 rounded-[1.25rem] p-6">
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
  isFirst,
  isLast,
  bookingType,
}: {
  row:     StatusHistoryRow
  isFirst: boolean
  isLast:  boolean
  bookingType: string
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
    if (row.new_status === 'checkout_payment_required') cfg.label = 'Payment Required'
    
    if (row.new_status === 'completed' || row.new_status === 'cleared_for_solo_hire') {
      cfg.label = 'Completed'
      cfg.color = 'text-green-400'
      cfg.bg = 'bg-green-500/10'
      cfg.border = 'border-green-500/20'
      cfg.icon = 'check_circle'
    }
  }

  let noteText = row.note
  if (noteText) {
    if (noteText.startsWith('Admin ')) noteText = noteText.slice(6)
    if (bookingType === 'checkout') {
      noteText = noteText.replace(/cleared_for_solo_hire/g, 'Cleared for aircraft booking')
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
      id, aircraft_id, status, booking_type, scheduled_start, scheduled_end,
      estimated_hours, estimated_amount,
      pic_name, pic_arn, customer_notes, admin_notes,
      booking_reference,
      created_at, updated_at,
      aircraft ( registration, aircraft_type )
    `)
    .eq('id', params.id)
    .eq('booking_owner_user_id', user.id)
    .single()

  if (!booking) notFound()

  // ── Status history ─────────────────────────────────────────────────────────
  // Safe to use booking.id here because the ownership check above already ran.
  const { data: rawHistory } = await supabase
    .from('booking_status_history')
    .select('new_status, old_status, note, created_at')
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: true })

  const statusHistory = (rawHistory ?? []) as StatusHistoryRow[]

  const aircraft    = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
  const status      = booking.status as string
  const bookingType = (booking as { booking_type?: string }).booking_type ?? 'standard'
  
  const cfg = { ... (STATUS_CFG[status] ?? { label: status.replace(/_/g, ' '), sublabel: '', color: 'text-slate-400', bg: 'bg-white/5', border: 'border-white/10', icon: 'info' }) }
  if (bookingType === 'checkout' && status === 'completed') {
    cfg.label = 'Completed'
    cfg.color = 'text-green-400'
    cfg.bg = 'bg-green-500/10'
    cfg.border = 'border-green-500/20'
    cfg.sublabel = ''
    cfg.icon = 'check_circle'
  }

  const isCancelled = status === 'cancelled' || status === 'no_show'
  const isStandardPipeline = bookingType === 'standard'
  const isCheckoutPipeline = bookingType === 'checkout'
  const activePipeline = isStandardPipeline ? PIPELINE : CHECKOUT_PIPELINE
  const activePipelineOrder = isStandardPipeline ? PIPELINE_ORDER : CHECKOUT_PIPELINE_ORDER
  const currentIdx  = activePipelineOrder.indexOf(status as BookingStatus)
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

  let checkoutInvoice = null
  if (status === 'checkout_payment_required') {
    const { data: inv } = await supabase
      .from('checkout_invoices')
      .select('subtotal_cents, advance_applied_cents, stripe_amount_due_cents')
      .eq('booking_id', booking.id)
      .single()
    checkoutInvoice = inv
  }

  // ── Awaiting flight record — dedicated full-width layout ─────────────────────
  if (status === 'awaiting_flight_record') {
    // Fetch last approved meter stops to pre-populate START column
    const meterStarts: { tacho?: number | null; vdo?: number | null; air_switch?: number | null } = {}
    const aircraftId = (booking as { aircraft_id?: string }).aircraft_id
    if (aircraftId) {
      const { data: lastStopRows } = await supabase
        .rpc('get_aircraft_last_meter_stops', { p_aircraft_id: aircraftId })
      for (const row of (lastStopRows ?? []) as Array<{ meter_type: string; stop_reading: number }>) {
        if (row.meter_type === 'tacho')      meterStarts.tacho      = Number(row.stop_reading)
        if (row.meter_type === 'vdo')        meterStarts.vdo        = Number(row.stop_reading)
        if (row.meter_type === 'air_switch') meterStarts.air_switch = Number(row.stop_reading)
      }
    }

    const flightDate = new Date(booking.scheduled_start).toLocaleDateString('en-CA', {
      timeZone: 'Australia/Sydney',
    })

    const aircraftTypeShort = (aircraft as { aircraft_type?: string } | null)?.aircraft_type
      ?.toUpperCase().replace(/_/g, ' ')

    // Simplified journey for awaiting_flight_record
    const JOURNEY = [
      { label: 'Request Submitted', state: 'done'    as const },
      { label: 'Approved',          state: 'done'    as const },
      { label: 'Dispatched',        state: 'done'    as const },
      { label: 'Awaiting Record',   state: 'active'  as const },
      { label: 'Completed',         state: 'pending' as const },
    ]

    return (
      <CustomerBookingShell user={user as User} profile={profile as Profile | null}>
        <div className="w-full">

          {/* Hero — full bleed, starts immediately after the Pilot Portal subnav */}
          <PostFlightHero
            bookingRef={bookingRef ?? undefined}
            aircraftReg={aircraft?.registration ?? undefined}
          />

          {/* Content grid — same container as dashboard content section */}
          <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 pt-8 pb-16">
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">

              {/* ── Left column ─────────────────────────────────────────── */}
              <div className="space-y-4">

                {/* Flight Details */}
                <div className="bg-[#0c121e] border border-white/[0.07] rounded-[1.25rem] p-6">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-oz-blue mb-5">
                    Flight Details
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-xs text-slate-500 uppercase tracking-wide flex-shrink-0">Aircraft</span>
                      <span className="text-sm text-white font-medium text-right">
                        {aircraft?.registration ?? '—'}
                        {aircraftTypeShort ? ` (${aircraftTypeShort})` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-xs text-slate-500 uppercase tracking-wide flex-shrink-0">Pilot In Command</span>
                      <span className="text-sm text-white text-right">{booking.pic_name ?? '—'}</span>
                    </div>
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-xs text-slate-500 uppercase tracking-wide flex-shrink-0">ARN</span>
                      <span className="text-sm text-white font-mono text-right">{booking.pic_arn ?? '—'}</span>
                    </div>
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-xs text-slate-500 uppercase tracking-wide flex-shrink-0">Date</span>
                      <span className="text-sm text-white text-right">
                        {formatDateFromISO(booking.scheduled_start)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Journey */}
                <div className="bg-[#0c121e] border border-white/[0.07] rounded-[1.25rem] p-6">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-oz-blue mb-5">
                    Status Journey
                  </h3>
                  <ol className="space-y-0">
                    {JOURNEY.map((step, idx) => (
                      <li key={step.label} className="flex gap-3 pb-5 last:pb-0 relative">
                        {idx < JOURNEY.length - 1 && (
                          <div
                            className={`absolute left-[11px] top-6 bottom-0 w-[2px] ${
                              step.state === 'done' ? 'bg-oz-blue/40' : 'bg-white/10'
                            }`}
                          />
                        )}
                        <div
                          className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border-2 mt-0.5 z-10 ${
                            step.state === 'done'
                              ? 'bg-oz-blue border-oz-blue'
                              : step.state === 'active'
                              ? 'border-amber-400 bg-transparent'
                              : 'border-white/20 bg-transparent'
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
                          <p className={`text-sm ${
                            step.state === 'done'
                              ? 'text-oz-blue'
                              : step.state === 'active'
                              ? 'text-amber-300'
                              : 'text-slate-600'
                          }`}>
                            {step.label}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Next Steps */}
                <div className="bg-[#0c121e] border border-white/[0.07] rounded-[1.25rem] p-6">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-oz-blue mb-4">
                    Next Steps
                  </h3>
                  <ul className="space-y-3">
                    {[
                      'Operations will review the submitted meter readings and evidence.',
                      'Discrepancies may delay the finalization of the flight record.',
                      'Final billing will be processed upon approval.',
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="material-symbols-outlined text-oz-blue/50 text-sm mt-0.5 flex-shrink-0">
                          chevron_right
                        </span>
                        <span className="text-sm text-oz-muted leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>

              {/* ── Right column — form ──────────────────────────────────── */}
              <div>
                <FlightRecordForm
                  bookingId={booking.id}
                  picName={booking.pic_name}
                  picArn={booking.pic_arn}
                  flightDate={flightDate}
                  meterStarts={meterStarts}
                />
              </div>

            </div>
          </div>

        </div>
      </CustomerBookingShell>
    )
  }

  return (
    <CustomerBookingShell user={user as User} profile={profile as Profile | null}>
      <div className="px-6 md:px-10 py-10 w-full max-w-4xl mx-auto">

        {/* Back */}
        <Link href="/dashboard/bookings" className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-6 transition-colors">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          My Bookings
        </Link>

        {/* ── Header card ───────────────────────────────────────────────────── */}
        <header className="mb-8 bg-[#0c121e]/60 border border-white/5 rounded-[1.5rem] p-8 relative overflow-hidden">
          <span
            className="material-symbols-outlined text-[120px] absolute -right-6 -bottom-6 text-white/5 pointer-events-none"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            flight_takeoff
          </span>

          <div className="relative z-10">
            {/* Reference + status row */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-oz-blue/60 mb-1">Booking Reference</p>
                <p className="text-base font-mono font-bold text-white tracking-wider">
                  {bookingRef ?? booking.id.split('-')[0].toUpperCase()}
                </p>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-1.5">
                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                  {cfg.label}
                </span>
                {cfg.sublabel && (
                  <p className={`text-[10px] ${cfg.color} opacity-60`}>{cfg.sublabel}</p>
                )}
                {status === 'pending_confirmation' && (
                  <p className="text-[10px] text-amber-400/50 uppercase tracking-wider font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>lock_clock</span>
                    Slot held · Pending review
                  </p>
                )}
                {status === 'needs_clarification' && (
                  <p className="text-[10px] text-orange-400/60 uppercase tracking-wider font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[11px]">help</span>
                    Response required · Slot held
                  </p>
                )}
              </div>
            </div>

            {/* Aircraft or Checkout Title */}
            {bookingType === 'checkout' ? (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest bg-blue-500/15 border border-blue-500/25 text-blue-400 mb-3">
                  <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'wght' 400" }}>school</span>
                  Checkout Flight
                </span>
                <h2 className="text-3xl font-serif text-white mb-1">
                  Checkout Flight
                </h2>
                <p className="text-oz-muted text-sm capitalize">
                  {(aircraft as { aircraft_type?: string } | null)?.aircraft_type?.replace(/_/g, ' ') ?? 'Cessna 172N'} · Registration {aircraft?.registration ?? 'VH-KZG'}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-serif italic text-white mb-1">
                  {aircraft?.registration ?? 'VH-KZG'}
                </h2>
                <p className="text-oz-muted text-sm capitalize">
                  {(aircraft as { aircraft_type?: string } | null)?.aircraft_type?.replace(/_/g, ' ') ?? '—'}
                </p>
              </>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* ── Left column ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-6">

            {/* Flight Details */}
            <div className="bg-[#0c121e]/60 border border-white/5 rounded-[1.25rem] p-6 space-y-5">
              <h3 className="text-[10px] uppercase tracking-widest font-bold text-oz-muted">Flight Details</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1">Date</p>
                  <p className="text-sm text-white">{formatDateFromISO(booking.scheduled_start)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1">Times (Sydney)</p>
                  <p className="text-sm text-white tabular-nums">
                    {new Date(booking.scheduled_start).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' })} – {new Date(booking.scheduled_end).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' })} Sydney time (AEST)
                  </p>
                </div>
                {booking.estimated_hours != null && (
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1">Estimated Duration</p>
                    <p className="text-sm text-white">{booking.estimated_hours.toFixed(1)} h</p>
                  </div>
                )}
                {bookingType === 'checkout' && booking.estimated_amount != null && (
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1">Checkout Fee</p>
                    <p className="text-sm text-white">${booking.estimated_amount.toFixed(0)}</p>
                    <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">Invoiced after checkout completion and approval</p>
                  </div>
                )}
                {booking.pic_name && (
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1">Pilot in Command</p>
                    <p className="text-sm text-white">{booking.pic_name}</p>
                  </div>
                )}
                {booking.pic_arn && (
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1">ARN</p>
                    <p className="text-sm text-white font-mono">{booking.pic_arn}</p>
                  </div>
                )}
              </div>

              {booking.customer_notes && (
                <div className="pt-4 border-t border-white/5">
                  <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-2">Your Notes</p>
                  <p className="text-sm text-oz-muted leading-relaxed">{booking.customer_notes}</p>
                </div>
              )}
            </div>

            {/* Forward-looking pipeline — show for standard bookings and checkout bookings */}
            {!isCancelled && (isStandardPipeline || isCheckoutPipeline) && (
              <div className="bg-[#0c121e]/60 border border-white/5 rounded-[1.25rem] p-6">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-oz-muted mb-6">Booking Journey</h3>
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

                    return (
                      <li key={step.key} className="flex gap-4 pb-6 last:pb-0 relative">
                        {idx < activePipeline.length - 1 && (
                          <div className={`absolute left-[11px] top-6 bottom-0 w-[2px] ${stepState === 'done' ? 'bg-oz-blue/60' : 'bg-white/10'}`} />
                        )}
                        <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border-2 mt-0.5 z-10 ${
                          stepState === 'done'   ? 'bg-oz-blue border-oz-blue'     :
                          stepState === 'active' ? 'bg-transparent border-oz-blue' :
                                                   'bg-transparent border-white/20'
                        }`}>
                          {stepState === 'done' && (
                            <span className="material-symbols-outlined text-white text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                          )}
                          {stepState === 'active' && (
                            <div className="w-2 h-2 rounded-full bg-oz-blue" />
                          )}
                        </div>
                        <div className="pt-0.5">
                          <p className={`text-sm font-medium ${
                            stepState === 'active' ? 'text-white'       :
                            stepState === 'done'   ? 'text-oz-blue'     :
                                                     'text-oz-muted/50'
                          }`}>
                            {step.label}
                          </p>
                          {stepState === 'pending' && step.key === 'completed' && isCheckoutPipeline && currentIdx === 3 && (
                            <p className="text-[10px] text-oz-muted/40 mt-0.5 font-medium tracking-wide">
                              Pending payment completion
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}

            {/* Status history — real events from booking_status_history */}
            {statusHistory.length > 0 && (
              <div className="bg-[#0c121e]/60 border border-white/5 rounded-[1.25rem] p-6">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-oz-muted mb-6">Status Updates</h3>
                <ol className="space-y-0">
                  {statusHistory.map((row, idx) => (
                    <HistoryEvent
                      key={idx}
                      row={row}
                      isFirst={idx === 0}
                      isLast={idx === statusHistory.length - 1}
                      bookingType={bookingType}
                    />
                  ))}
                </ol>
              </div>
            )}

          </div>

          {/* ── Right column ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">

            <NextActionCard
              status={status}
              bookingType={bookingType}
              adminNotes={adminNotes}
              clarificationQuestion={clarificationQuestion}
              bookingId={booking.id}
              picName={booking.pic_name}
              picArn={booking.pic_arn}
              flightDate={new Date(booking.scheduled_start).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })}
              postFlightClarification={postFlightClarification}
              flightRecord={postFlightRecord}
              postFlightAttachments={postFlightAttachments}
              checkoutInvoice={checkoutInvoice}
            />

            {/* Request a change */}
            {!(bookingType === 'checkout' && ['completed', 'cancelled', 'no_show', 'post_flight_approved'].includes(status)) && (
              <div className="bg-white/5 border border-white/5 rounded-[1.25rem] p-5 opacity-60">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Request a Change</h3>
                <p className="text-xs text-oz-muted leading-relaxed">
                  Need to cancel or modify this booking?{' '}
                  <span className="text-oz-blue">Contact the operations team.</span>
                </p>
                <p className="text-[9px] text-slate-600 mt-3 uppercase tracking-widest">Self-service cancellation — coming soon</p>
              </div>
            )}

            {/* Quick booking info */}
            <div className="bg-white/5 border border-white/5 rounded-[1.25rem] p-5">
              <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-3">Booking Info</p>
              <div className="space-y-2.5">
                <div className="flex justify-between items-start gap-3">
                  <span className="text-[10px] text-slate-500">Reference</span>
                  <span className="text-[10px] text-white/60 font-mono font-bold text-right">
                    {bookingRef ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-500">Submitted</span>
                  <span className="text-[10px] text-oz-muted font-mono">
                    {new Date(booking.created_at).toLocaleDateString('en-AU', {
                      timeZone: 'Australia/Sydney',
                      month:    'short',
                      day:      'numeric',
                      year:     'numeric',
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-500">Last updated</span>
                  <span className="text-[10px] text-oz-muted font-mono">
                    {new Date(booking.updated_at).toLocaleDateString('en-AU', {
                      timeZone: 'Australia/Sydney',
                      month:    'short',
                      day:      'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </CustomerBookingShell>
  )
}
