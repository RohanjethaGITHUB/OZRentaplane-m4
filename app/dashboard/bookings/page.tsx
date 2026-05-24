import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import BookingsViewedTracker from './BookingsViewedTracker'
import type { Profile, PilotClearanceStatus } from '@/lib/supabase/types'
import { formatDateFromISO } from '@/lib/formatDateTime'
import { formatSydTime } from '@/lib/utils/sydney-time'
import { getCheckoutPaymentDisplayState } from '@/lib/checkout-payment-state'
import { deriveBookingStatusForFlightRecord } from '@/lib/booking/flight-record-status'

export const metadata = { title: 'My Bookings | OZRentAPlane' }

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, {
  label:     string
  sublabel?: string
  color:     string
  bg:        string
  border:    string
  icon:      string
}> = {
  pending_confirmation:       { label: 'Request Pending',                       sublabel: 'Not yet confirmed',         color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'pending'            },
  confirmed:                  { label: 'Confirmed',                             sublabel: 'Booking approved',          color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   icon: 'check_circle'       },
  ready_for_dispatch:         { label: 'Ready to Fly',                          sublabel: 'Pre-flight checks done',    color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'flight_takeoff'     },
  dispatched:                 { label: 'Airborne',                              sublabel: 'Flight in progress',        color: 'text-green-300',  bg: 'bg-green-500/10',  border: 'border-green-400/20',  icon: 'flight'             },
  awaiting_flight_record:     { label: 'Awaiting Record',                       sublabel: 'Please submit flight log',  color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'assignment'         },
  flight_record_overdue:      { label: 'Record Overdue',                        sublabel: 'Flight log required',       color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'assignment_late'    },
  pending_post_flight_review: { label: 'Under Review',                          sublabel: 'Post-flight review',        color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: 'rate_review'        },
  needs_clarification:        { label: 'Clarification Needed',                  sublabel: 'Team has a question',       color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: 'help'               },
  post_flight_approved:       { label: 'Flight Approved',                       sublabel: 'Records accepted',          color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'verified'           },
  completed:                  { label: 'Completed',                             sublabel: 'Booking closed',            color: 'text-slate-400',  bg: 'bg-white/5',       border: 'border-white/10',      icon: 'done_all'           },
  cancelled:                  { label: 'Cancelled',                             sublabel: 'Will not proceed',          color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'cancel'             },
  no_show:                    { label: 'No Show',                               sublabel: 'Marked absent',             color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'person_off'         },
  checkout_requested:         { label: 'Awaiting Review',                       sublabel: 'Awaiting team review',      color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   icon: 'pending_actions'    },
  checkout_confirmed:         { label: 'Checkout Confirmed',                    sublabel: 'Confirmed by our team',     color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'event_available'    },
  checkout_completed_under_review: { label: 'Checkout completed, under review', sublabel: 'Awaiting team review',      color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'rate_review'        },
  checkout_payment_required:       { label: 'Payment Required',                 sublabel: 'Pay to unlock bookings',    color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: 'payments'           },
}

const ACTIVE_STATUSES = [
  'pending_confirmation', 'confirmed', 'ready_for_dispatch',
  'dispatched', 'awaiting_flight_record', 'flight_record_overdue',
  'pending_post_flight_review', 'needs_clarification', 'post_flight_approved',
  'checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required',
]

const CHECKOUT_OUTCOME_BADGE: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  cleared_to_fly:               { label: 'Cleared to Fly',               color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'verified'    },
  additional_checkout_required: { label: 'Additional Checkout Required', color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'schedule'    },
  checkout_reschedule_required: { label: 'Reschedule Required',          color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   icon: 'event_repeat'},
  not_currently_eligible:       { label: 'Not Currently Eligible',       color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'block'       },
}

// ── Stat icon map ─────────────────────────────────────────────────────────────

const STAT_ICONS: Record<string, string> = {
  'Upcoming Bookings':          'calendar_month',
  'Awaiting Confirmation':      'hourglass_top',
  'Completed Flights':          'check_circle',
  'Total Flight Hours':         'schedule',
  'Checkout Request':           'how_to_reg',
  'Awaiting Review':            'hourglass_top',
  'Upcoming Aircraft Bookings': 'calendar_month',
}

function StatusBadge({ status, bookingType, checkoutOutcome, isAwaitingManualPayment }: {
  status: string; bookingType?: string; checkoutOutcome?: string | null; isAwaitingManualPayment?: boolean
}) {
  let cfg: { label: string; color: string; bg: string; border: string; icon?: string } = STATUS_CFG[status] ?? {
    label:  status.replace(/_/g, ' '),
    color:  'text-slate-400',
    bg:     'bg-white/5',
    border: 'border-white/10',
  }
  if (bookingType === 'checkout' && status === 'completed' && checkoutOutcome) {
    cfg = CHECKOUT_OUTCOME_BADGE[checkoutOutcome] ?? { label: 'Checkout Complete', color: 'text-slate-400', bg: 'bg-white/5', border: 'border-white/10' }
  }
  if (status === 'checkout_payment_required' && isAwaitingManualPayment) {
    cfg = { label: 'Awaiting Payment Confirmation', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: 'account_balance' }
  }

  // Special confirmed pill style matching reference
  const isConfirmed = cfg.label === 'Confirmed'
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {isConfirmed && <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />}
      {bookingType === 'checkout' && !isConfirmed && (
        <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'wght' 400" }}>how_to_reg</span>
      )}
      {cfg.label}
    </span>
  )
}

type BookingRow = {
  id:                string
  booking_reference: string | null
  status:            string
  booking_type:      string
  checkout_lifecycle_status?: string | null
  scheduled_start:   string
  scheduled_end:     string
  estimated_hours:   number | null
  estimated_amount:  number | null
  pic_name:          string | null
  created_at:        string
  aircraft:          { registration: string } | null
  flight_records?:   { status: string | null; submitted_at: string | null }[] | null
}

// ── Clearance gate banners ────────────────────────────────────────────────────

type GateBannerProps = {
  clearanceStatus:        PilotClearanceStatus
  checkoutBooking:        BookingRow | null
  isAwaitingManualPayment?: boolean
  hasPendingReschedule?: boolean
  latestRescheduleStatus?: string | null
}

function ClearanceGateBanner({
  clearanceStatus,
  checkoutBooking,
  isAwaitingManualPayment,
  hasPendingReschedule,
  latestRescheduleStatus,
}: GateBannerProps) {
  if (clearanceStatus === 'checkout_required') {
    return (
      <div className="border rounded-2xl p-8 text-center bg-blue-500/[0.06] border-blue-500/20 mb-8">
        <span className="material-symbols-outlined text-4xl mb-4 block text-blue-400" style={{ fontVariationSettings: "'wght' 200" }}>
          how_to_reg
        </span>
        <h2 className="text-xl font-serif text-white mb-3">Checkout Required</h2>
        <p className="text-slate-500 text-sm leading-relaxed mb-6 max-w-md mx-auto">
          Before booking solo flights, you must complete a one-time checkout flight with our team. Documents are uploaded as part of the checkout process.
        </p>
        <Link href="/dashboard/checkout" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors">
          <span className="material-symbols-outlined text-sm">flight_takeoff</span>
          Book Checkout Flight
        </Link>
      </div>
    )
  }
  if (clearanceStatus === 'checkout_requested') {
    return (
      <div className="border rounded-2xl p-8 bg-blue-500/[0.06] border-blue-500/20 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-blue-400 flex-shrink-0 mt-0.5 animate-pulse" style={{ fontVariationSettings: "'wght' 200" }}>pending_actions</span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">No action needed right now</h2>
            <p className="text-slate-400 text-base leading-relaxed">
              Our team is reviewing your checkout request. We will contact you once it is confirmed or if another time is needed.
            </p>
            {hasPendingReschedule && (
              <p className="text-amber-300 text-sm mt-3">
                Your reschedule request is waiting for admin review. Your current checkout time remains active.
              </p>
            )}
            {latestRescheduleStatus === 'approved' && (
              <p className="text-emerald-300 text-sm mt-3">
                Your checkout flight has been rescheduled.
              </p>
            )}
            {latestRescheduleStatus === 'rejected' && (
              <p className="text-amber-300 text-sm mt-3">
                Your reschedule request was not approved. Your original checkout time remains active.
              </p>
            )}
            {checkoutBooking && (
              <div className="mt-4 bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-3 inline-flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="font-mono font-medium text-slate-400">{checkoutBooking.booking_reference}</span>
                <span>{formatDateFromISO(checkoutBooking.scheduled_start)}</span>
                <span className="tabular-nums">{formatSydTime(checkoutBooking.scheduled_start)} – {formatSydTime(checkoutBooking.scheduled_end)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
  if (clearanceStatus === 'checkout_confirmed') {
    return (
      <div className="border rounded-2xl p-8 bg-green-500/[0.05] border-green-500/20 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-green-400 flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>event_available</span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Checkout Flight Confirmed</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Your checkout flight has been confirmed by our team. Once your checkout flight is approved, you will unlock bookings.
            </p>
            {checkoutBooking && (
              <div className="mt-4 bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-3 inline-flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="font-mono font-medium text-slate-400">{checkoutBooking.booking_reference}</span>
                <span>{formatDateFromISO(checkoutBooking.scheduled_start)}</span>
                <span className="tabular-nums">{formatSydTime(checkoutBooking.scheduled_start)} – {formatSydTime(checkoutBooking.scheduled_end)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
  if (checkoutBooking?.status === 'checkout_payment_required') {
    if (isAwaitingManualPayment) {
      return (
        <div className="border rounded-2xl p-8 bg-blue-500/[0.05] border-blue-500/20 mb-8">
          <div className="flex items-start gap-4">
            <span className="material-symbols-outlined text-2xl text-blue-400 flex-shrink-0 mt-0.5 animate-pulse" style={{ fontVariationSettings: "'wght' 200" }}>account_balance</span>
            <div>
              <h2 className="text-lg font-serif text-white mb-2">Awaiting Payment Confirmation</h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                Your bank transfer details have been submitted. Our team will verify the payment before your checkout result is finalised. No further action is required from you right now.
              </p>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="border rounded-2xl p-8 bg-orange-500/[0.05] border-orange-500/20 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-orange-400 flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 200" }}>payments</span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Checkout Payment Required</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-4">
              Your checkout flight has been completed. Please pay your checkout invoice before aircraft bookings become available.
            </p>
            <Link href={`/dashboard/bookings/${checkoutBooking.id}`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500/15 border border-orange-400/30 text-orange-300 hover:bg-orange-500/25 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all">
              Pay Checkout Invoice
            </Link>
          </div>
        </div>
      </div>
    )
  }
  if (clearanceStatus === 'checkout_completed_under_review') {
    return (
      <div className="border rounded-2xl p-8 bg-amber-500/[0.05] border-amber-500/20 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-amber-400 flex-shrink-0 mt-0.5 animate-pulse" style={{ fontVariationSettings: "'wght' 200" }}>hourglass_top</span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Awaiting Checkout Outcome</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Your checkout flight has been completed and is awaiting review by the flight operations team. Once your checkout flight is approved, you will unlock bookings.
            </p>
          </div>
        </div>
      </div>
    )
  }
  if (clearanceStatus === 'additional_checkout_required') {
    return (
      <div className="border rounded-2xl p-8 bg-amber-500/[0.05] border-amber-500/20 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-amber-400 flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 200" }}>schedule</span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Additional Checkout Required</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-4">
              Following your checkout, our team has determined that an additional checkout session is required before you can be cleared to fly.
            </p>
            <Link href="/dashboard/checkout" className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500/15 border border-amber-400/30 text-amber-300 hover:bg-amber-500/25 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all">
              Book Another Checkout
            </Link>
          </div>
        </div>
      </div>
    )
  }
  if (clearanceStatus === 'checkout_reschedule_required') {
    return (
      <div className="border rounded-2xl p-8 bg-amber-500/[0.05] border-amber-500/20 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-amber-400 flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 200" }}>event_repeat</span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Checkout Reschedule Required</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-4">
              Your checkout could not be fully assessed this time. Book another checkout session when you are ready to try again.
            </p>
            <Link href="/dashboard/checkout" className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500/15 border border-amber-400/30 text-amber-300 hover:bg-amber-500/25 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all">
              Book Another Checkout
            </Link>
          </div>
        </div>
      </div>
    )
  }
  if (clearanceStatus === 'not_currently_eligible') {
    return (
      <div className="border rounded-2xl p-8 bg-red-500/[0.05] border-red-500/20 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-red-400 flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 200" }}>block</span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Not Currently Eligible</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Based on your checkout assessment, further training is required before you can continue with aircraft hire. Please contact us when you are ready to try again.
            </p>
          </div>
        </div>
      </div>
    )
  }
  return null
}

export default async function CustomerBookingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'admin') redirect('/admin')

  const clearanceStatus = ((profile as Profile | null)?.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus
  const isCleared = clearanceStatus === 'cleared_to_fly'

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, booking_reference, status, booking_type,
      checkout_lifecycle_status,
      scheduled_start, scheduled_end,
      estimated_hours, estimated_amount, pic_name, created_at,
      aircraft ( registration ),
      flight_records ( status, submitted_at )
    `)
    .eq('booking_owner_user_id', user.id)
    .order('scheduled_start', { ascending: false })

  const rows             = ((bookings ?? []) as unknown as BookingRow[]).map((booking) => ({
    ...booking,
    status: deriveBookingStatusForFlightRecord(booking),
  }))
  const checkoutRequests = rows.filter(b => b.booking_type === 'checkout')
  const upcomingAircraft = rows.filter(b => b.booking_type !== 'checkout' && ACTIVE_STATUSES.includes(b.status))
  const completedFlights = rows.filter(b => b.booking_type !== 'checkout' && !ACTIVE_STATUSES.includes(b.status))

  const completedCheckoutIds = checkoutRequests.filter(b => b.status === 'completed').map(b => b.id)
  const checkoutOutcomeMap: Record<string, string> = {}
  if (completedCheckoutIds.length > 0) {
    const { data: outcomeRows } = await supabase
      .from('checkout_invoices')
      .select('booking_id, checkout_outcome')
      .in('booking_id', completedCheckoutIds)
    for (const row of (outcomeRows ?? []) as { booking_id: string; checkout_outcome: string | null }[]) {
      if (row.booking_id && row.checkout_outcome) {
        checkoutOutcomeMap[row.booking_id] = row.checkout_outcome
      }
    }
  }

  const checkoutBooking = rows.find(b =>
    b.booking_type === 'checkout' &&
    ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required'].includes(b.status)
  ) ?? null

  let hasPendingReschedule = false
  let latestRescheduleStatus: string | null = null
  if (checkoutBooking) {
    const { data: rescheduleRows } = await supabase
      .from('checkout_change_requests')
      .select('status, request_type, created_at')
      .eq('checkout_request_id', checkoutBooking.id)
      .eq('request_type', 'reschedule')
      .order('created_at', { ascending: false })
      .limit(1)
    const latest = (rescheduleRows?.[0] as { status?: string } | undefined) ?? null
    latestRescheduleStatus = latest?.status ?? null
    hasPendingReschedule = latestRescheduleStatus === 'pending'
  }

  let isAwaitingManualPayment = false
  if (clearanceStatus === 'checkout_payment_required' && checkoutBooking) {
    const { data: inv } = await supabase
      .from('checkout_invoices')
      .select('id, status')
      .eq('booking_id', checkoutBooking.id)
      .maybeSingle()
    if (inv) {
      const { data: sub } = await supabase
        .from('checkout_bank_transfer_submissions')
        .select('id, status')
        .eq('invoice_id', (inv as { id: string; status: string }).id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const displayState = getCheckoutPaymentDisplayState(
        { status: (inv as { id: string; status: string }).status ?? 'payment_required' },
        sub ?? null,
      )
      isAwaitingManualPayment = displayState === 'awaiting_manual_payment_confirmation'
    }
  }

  // ── Derived stat values ───────────────────────────────────────────────────
  const statCards = !isCleared ? [
    { label: 'Checkout Request',           value: String(checkoutRequests.length),                      icon: 'how_to_reg'    },
    { label: 'Awaiting Review',            value: String(rows.filter(b => ['checkout_requested', 'pending_confirmation', 'checkout_completed_under_review'].includes(b.status)).length), icon: 'hourglass_top' },
    { label: 'Upcoming Aircraft Bookings', value: String(upcomingAircraft.length),                      icon: 'calendar_month'},
    { label: 'Completed Flights',          value: String(rows.filter(b => b.booking_type !== 'checkout' && b.status === 'completed').length), icon: 'check_circle'  },
  ] : [
    { label: 'Upcoming Bookings',     value: String(upcomingAircraft.length),                                                                                                    icon: 'calendar_month' },
    { label: 'Awaiting Confirmation', value: String(rows.filter(b => b.booking_type !== 'checkout' && ['pending_confirmation', 'needs_clarification'].includes(b.status)).length), icon: 'hourglass_top'  },
    { label: 'Completed Flights',     value: String(rows.filter(b => b.booking_type !== 'checkout' && b.status === 'completed').length),                                          icon: 'check_circle'   },
    { label: 'Total Flight Hours',    value: rows.filter(b => b.booking_type !== 'checkout' && b.status === 'completed').reduce((sum, b) => sum + (b.estimated_hours ?? 0), 0).toFixed(1), icon: 'schedule' },
  ]

  return (
    <>
      <BookingsViewedTracker />

      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 md:px-10 xl:px-12 py-8 pb-16">

        {/* ─── Hero ──────────────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-2xl border border-[rgba(59,130,246,0.20)] mb-7"
          style={{
            background: 'linear-gradient(90deg, rgba(3,10,24,0.97) 0%, rgba(4,14,32,0.88) 40%, rgba(5,18,42,0.55) 72%, rgba(3,10,24,0.75) 100%), url("/customer-my-booking-bg.png") center right / cover no-repeat',
            boxShadow: '0 0 0 1px rgba(59,130,246,0.06), 0 8px 40px rgba(0,0,0,0.50), 0 0 80px -10px rgba(37,99,235,0.10)',
            minHeight: '220px',
          }}
        >
          {/* Bottom blue glow edge */}
          <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-[rgba(37,99,235,0.07)] to-transparent pointer-events-none" />

          <div className="relative z-10 px-8 py-10 sm:px-12 sm:py-12 flex flex-col justify-center" style={{ minHeight: '220px' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-blue-400/80 mb-3">
              Flight Records
            </p>
            <h1 className="font-serif text-[36px] sm:text-[44px] leading-none text-white mb-3 tracking-tight">
              My Bookings
            </h1>
            {/* Blue accent line */}
            <div className="w-10 h-[2px] bg-blue-500 rounded-full mb-4" />
            <p className="text-[14px] text-white/55 max-w-md leading-relaxed">
              Review your checkout requests, aircraft bookings, and flight history.
            </p>
          </div>
        </div>

        {/* ─── Stat cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {statCards.map(s => (
            <div
              key={s.label}
              className="relative overflow-hidden rounded-xl border border-[rgba(59,130,246,0.14)] bg-gradient-to-br from-[#080f1e] to-[#050c18] p-5"
              style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.35), 0 0 0 1px rgba(59,130,246,0.04)' }}
            >
              {/* Soft bottom glow */}
              <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-[rgba(37,99,235,0.08)] to-transparent pointer-events-none" />
              <div className="flex items-center gap-3.5 relative z-10">
                <div className="w-11 h-11 rounded-full bg-[rgba(59,130,246,0.10)] border border-[rgba(59,130,246,0.18)] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-blue-400 text-[18px]" style={{ fontVariationSettings: "'wght' 300" }} aria-hidden="true">
                    {s.icon}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[26px] font-light text-white leading-none tabular-nums">{s.value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1 leading-tight">{s.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Clearance gate banner ──────────────────────────────────────── */}
        {!isCleared && (
          <ClearanceGateBanner
            clearanceStatus={clearanceStatus}
            checkoutBooking={checkoutBooking}
            isAwaitingManualPayment={isAwaitingManualPayment}
            hasPendingReschedule={hasPendingReschedule}
            latestRescheduleStatus={latestRescheduleStatus}
          />
        )}

        {/* ─── Checkout Requests (pre-cleared) ───────────────────────────── */}
        {!isCleared && checkoutRequests.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="material-symbols-outlined text-blue-400/60 text-[18px]" style={{ fontVariationSettings: "'wght' 300" }} aria-hidden="true">how_to_reg</span>
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-white/60">Checkout Requests</h2>
            </div>
            <div className="space-y-3">
              {checkoutRequests.map(b => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                const cfg      = STATUS_CFG[b.status]
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className="block rounded-2xl border border-[rgba(59,130,246,0.12)] bg-gradient-to-br from-[#080f1e] to-[#050c18] p-5 sm:p-6 hover:border-[rgba(59,130,246,0.28)] transition-all group"
                    style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.30)' }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg?.bg ?? 'bg-blue-500/10'} border ${cfg?.border ?? 'border-blue-500/20'}`}>
                          <span className={`material-symbols-outlined text-[18px] ${cfg?.color ?? 'text-blue-400'}`} style={{ fontVariationSettings: "'wght' 300" }} aria-hidden="true">
                            {cfg?.icon ?? 'how_to_reg'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[14px] font-semibold text-white group-hover:text-blue-300 transition-colors">Checkout Flight</p>
                            {b.booking_reference && (
                              <span className="text-[10px] font-mono text-slate-500 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded">{b.booking_reference}</span>
                            )}
                          </div>
                          <p className="text-[12px] text-slate-400 mt-1">Cessna 172N · Registration {aircraft?.registration ?? 'VH-KZG'}</p>
                          <div className="flex items-center gap-1.5 mt-2">
                            <span className="material-symbols-outlined text-slate-600 text-[13px]" aria-hidden="true">calendar_today</span>
                            <span className="text-[12px] text-slate-400">{formatDateFromISO(b.scheduled_start)}</span>
                            <span className="mx-1 text-slate-700">·</span>
                            <span className="material-symbols-outlined text-slate-600 text-[13px]" aria-hidden="true">schedule</span>
                            <span className="text-[12px] text-slate-400 tabular-nums">{formatSydTime(b.scheduled_start)} – {formatSydTime(b.scheduled_end)}</span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1.5">Submitted {formatDateFromISO(b.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-3 flex-shrink-0">
                        <StatusBadge status={b.status} bookingType={b.booking_type} checkoutOutcome={checkoutOutcomeMap[b.id]} isAwaitingManualPayment={b.status === 'checkout_payment_required' ? isAwaitingManualPayment : undefined} />
                        {b.estimated_amount != null && (
                          <span className="text-[12px] text-white/60 tabular-nums">Checkout fee: ${b.estimated_amount.toFixed(0)}</span>
                        )}
                        <div className="w-8 h-8 rounded-full border border-[rgba(59,130,246,0.20)] bg-[rgba(59,130,246,0.06)] flex items-center justify-center group-hover:border-blue-400/40 group-hover:bg-blue-500/10 transition-all">
                          <span className="material-symbols-outlined text-slate-500 text-[14px] group-hover:text-blue-400 transition-colors" aria-hidden="true">arrow_forward</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ─── Upcoming Bookings ──────────────────────────────────────────── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-blue-400/60 text-[20px]" style={{ fontVariationSettings: "'wght' 300" }} aria-hidden="true">flight_takeoff</span>
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-white/60">
                {isCleared ? 'Upcoming Bookings' : 'Upcoming Aircraft Bookings'}
              </h2>
            </div>
            {isCleared && (
              <Link
                href="/dashboard/bookings/new"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-[11px] font-bold uppercase tracking-widest transition-colors"
                style={{ boxShadow: '0 0 20px rgba(37,99,235,0.30)' }}
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">add</span>
                New Booking
              </Link>
            )}
          </div>

          {upcomingAircraft.length === 0 ? (
            <div
              className="rounded-2xl border border-[rgba(59,130,246,0.12)] bg-gradient-to-br from-[#080f1e] to-[#050c18] p-12 text-center"
              style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.30)' }}
            >
              <span className="material-symbols-outlined text-4xl text-slate-700 mb-4 block" style={{ fontVariationSettings: "'wght' 200" }} aria-hidden="true">flight_land</span>
              <h3 className="text-lg font-serif text-white/60 mb-2">No aircraft bookings yet</h3>
              <p className="text-slate-500 text-[13px] mb-7 max-w-sm mx-auto leading-relaxed">
                {isCleared
                  ? 'Request your first aircraft booking and our team will confirm it for you.'
                  : 'Aircraft bookings become available once your checkout flight is completed and you are cleared to fly.'}
              </p>
              {isCleared && (
                <Link href="/dashboard/bookings/new" className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors">
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">flight_takeoff</span>
                  Book a Flight
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingAircraft.map(b => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                const cfg      = STATUS_CFG[b.status]
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className="block rounded-2xl border border-[rgba(59,130,246,0.14)] bg-gradient-to-br from-[#080f1e] to-[#050c18] hover:border-[rgba(59,130,246,0.30)] transition-all group"
                    style={{ boxShadow: '0 4px 28px rgba(0,0,0,0.35)' }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-0">

                      {/* Thumbnail area */}
                      <div className="relative sm:w-[180px] sm:flex-shrink-0 h-[120px] sm:h-auto sm:self-stretch rounded-t-2xl sm:rounded-l-2xl sm:rounded-tr-none overflow-hidden border-r border-white/[0.06]">
                        <div
                          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                          style={{ backgroundImage: "url('/Cessna-172.webp')", backgroundPosition: 'center center' }}
                          aria-hidden="true"
                        />
                        <div className="absolute inset-0 bg-gradient-to-br from-[#061427]/56 via-[#071a31]/34 to-[#04101f]/62" aria-hidden="true" />
                        {/* Aircraft badge overlay */}
                        <div className="absolute bottom-2.5 left-2.5 w-8 h-8 rounded-full bg-blue-600 border-2 border-[#080f1e] flex items-center justify-center shadow-lg">
                          <span className="material-symbols-outlined text-white text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">flight_takeoff</span>
                        </div>
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0 p-5 sm:p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            {/* Aircraft name + reference pill */}
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className="text-[15px] font-semibold text-white group-hover:text-blue-300 transition-colors">
                                Cessna 172N
                              </p>
                              {b.booking_reference && (
                                <span className="text-[10px] font-mono text-slate-500 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded">{b.booking_reference}</span>
                              )}
                            </div>
                            <p className="text-[12px] text-slate-400 mb-3">
                              Registration {aircraft?.registration ?? 'VH-KZG'}
                            </p>
                            {/* Date + time row */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-slate-600 text-[14px]" aria-hidden="true">calendar_today</span>
                                <span className="text-[12px] text-slate-300">{formatDateFromISO(b.scheduled_start)}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-slate-600 text-[14px]" aria-hidden="true">schedule</span>
                                <span className="text-[12px] text-slate-300 tabular-nums">{formatSydTime(b.scheduled_start)} – {formatSydTime(b.scheduled_end)}</span>
                                <span className="text-[11px] text-slate-600">Sydney time (AEST)</span>
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-2">Submitted {formatDateFromISO(b.created_at)}</p>
                          </div>

                          {/* Status + arrow */}
                          <div className="flex flex-col items-end gap-3 flex-shrink-0">
                            <StatusBadge status={b.status} bookingType={b.booking_type} checkoutOutcome={checkoutOutcomeMap[b.id]} isAwaitingManualPayment={b.status === 'checkout_payment_required' ? isAwaitingManualPayment : undefined} />
                            <div className="w-9 h-9 rounded-full border border-[rgba(59,130,246,0.20)] bg-[rgba(59,130,246,0.06)] flex items-center justify-center group-hover:border-blue-400/40 group-hover:bg-blue-500/10 transition-all">
                              <span className="material-symbols-outlined text-slate-500 text-[15px] group-hover:text-blue-400 transition-colors" aria-hidden="true">arrow_forward</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* ─── Completed Flights ──────────────────────────────────────────── */}
        {completedFlights.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="material-symbols-outlined text-blue-400/60 text-[18px]" style={{ fontVariationSettings: "'wght' 300" }} aria-hidden="true">check_circle</span>
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-white/60">Completed Flights</h2>
            </div>
            <div className="rounded-2xl border border-[rgba(59,130,246,0.12)] bg-gradient-to-br from-[#080f1e] to-[#050c18] overflow-hidden divide-y divide-white/[0.05]" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.30)' }}>
              {completedFlights.map(b => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.025] transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-medium text-white/60 group-hover:text-white/80 transition-colors">Cessna 172N</p>
                        <span className="text-[10px] font-mono text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded">{aircraft?.registration ?? 'VH-KZG'}</span>
                        {b.booking_reference && (
                          <span className="text-[10px] font-mono text-slate-700">{b.booking_reference}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                        {formatDateFromISO(b.scheduled_start)} · {formatSydTime(b.scheduled_start)} – {formatSydTime(b.scheduled_end)} Sydney time (AEST)
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusBadge status={b.status} bookingType={b.booking_type} />
                      <div className="w-7 h-7 rounded-full border border-white/[0.08] flex items-center justify-center group-hover:border-white/[0.18] transition-colors">
                        <span className="material-symbols-outlined text-slate-600 group-hover:text-slate-400 text-[13px] transition-colors" aria-hidden="true">arrow_forward</span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ─── Checkout History ───────────────────────────────────────────── */}
        {isCleared && checkoutRequests.length > 0 && (
          <section>
            <div className="flex items-center gap-2.5 mb-5">
              <span className="material-symbols-outlined text-blue-400/60 text-[18px]" style={{ fontVariationSettings: "'wght' 300" }} aria-hidden="true">history</span>
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-white/60">Checkout History</h2>
            </div>
            <div className="space-y-3">
              {checkoutRequests.map(b => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                const outcomeKey = checkoutOutcomeMap[b.id]
                const outcomeCfg = outcomeKey ? CHECKOUT_OUTCOME_BADGE[outcomeKey] : null
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-[rgba(59,130,246,0.12)] bg-gradient-to-br from-[#080f1e] to-[#050c18] px-5 py-4 sm:px-6 hover:border-[rgba(59,130,246,0.25)] transition-all group"
                    style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.30)' }}
                  >
                    {/* Icon */}
                    <div className="w-11 h-11 rounded-full bg-[rgba(59,130,246,0.08)] border border-[rgba(59,130,246,0.16)] flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-blue-400/70 text-[18px]" style={{ fontVariationSettings: "'wght' 300" }} aria-hidden="true">receipt_long</span>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-[13px] font-semibold text-white/80 group-hover:text-white transition-colors">Checkout Flight</p>
                        {b.booking_reference && (
                          <span className="text-[10px] font-mono text-slate-600 bg-white/[0.03] border border-white/[0.05] px-1.5 py-0.5 rounded">{b.booking_reference}</span>
                        )}
                      </div>
                      <p className="text-[12px] text-slate-500">Cessna 172N · Registration {aircraft?.registration ?? 'VH-KZG'}</p>
                      {outcomeCfg ? (
                        <p className={`text-[11px] mt-0.5 font-medium ${outcomeCfg.color}`}>
                          Status: {outcomeCfg.label}
                        </p>
                      ) : (
                        <p className="text-[11px] text-green-400 mt-0.5 font-medium">
                          Status: Completed and Approved
                        </p>
                      )}
                    </div>

                    {/* Date + arrow */}
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[12px] text-slate-400 tabular-nums">{formatDateFromISO(b.scheduled_start)}</p>
                      <p className="text-[11px] text-slate-600 tabular-nums mt-0.5">{formatSydTime(b.scheduled_start)} Sydney time (AEST)</p>
                      <div className="mt-2 flex justify-end">
                        <div className="w-7 h-7 rounded-full border border-white/[0.08] flex items-center justify-center group-hover:border-blue-400/30 transition-colors">
                          <span className="material-symbols-outlined text-slate-600 group-hover:text-blue-400 text-[13px] transition-colors" aria-hidden="true">arrow_forward</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

      </div>
    </>
  )
}
