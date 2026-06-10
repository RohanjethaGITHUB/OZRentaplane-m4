import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PortalPageHero from '@/components/PortalPageHero'
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
  pending_confirmation:       { label: 'Request Pending',                       sublabel: 'Not yet confirmed',         color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  icon: 'pending'            },
  confirmed:                  { label: 'Confirmed',                             sublabel: 'Booking approved',          color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'check_circle'       },
  ready_for_dispatch:         { label: 'Ready to Fly',                          sublabel: 'Pre-flight checks done',    color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200',  icon: 'flight_takeoff'     },
  dispatched:                 { label: 'Airborne',                              sublabel: 'Flight in progress',        color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200',  icon: 'flight'             },
  awaiting_flight_record:     { label: 'Awaiting Record',                       sublabel: 'Please submit flight log',  color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  icon: 'assignment'         },
  flight_record_overdue:      { label: 'Record Overdue',                        sublabel: 'Flight log required',       color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    icon: 'assignment_late'    },
  pending_post_flight_review: { label: 'Under Review',                          sublabel: 'Post-flight review',        color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', icon: 'rate_review'        },
  needs_clarification:        { label: 'Clarification Needed',                  sublabel: 'Team has a question',       color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: 'help'               },
  post_flight_approved:       { label: 'Flight Approved',                       sublabel: 'Records accepted',          color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200',  icon: 'verified'           },
  completed:                  { label: 'Completed',                             sublabel: 'Booking closed',            color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200',  icon: 'done_all'           },
  cancelled:                  { label: 'Cancelled',                             sublabel: 'Will not proceed',          color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    icon: 'cancel'             },
  no_show:                    { label: 'No Show',                               sublabel: 'Marked absent',             color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    icon: 'person_off'         },
  checkout_requested:         { label: 'Awaiting Review',                       sublabel: 'Awaiting team review',      color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'pending_actions'    },
  checkout_confirmed:         { label: 'Checkout Confirmed',                    sublabel: 'Confirmed by our team',     color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200',  icon: 'event_available'    },
  checkout_completed_under_review: { label: 'Checkout completed, under review', sublabel: 'Awaiting team review',      color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  icon: 'rate_review'        },
  checkout_payment_required:       { label: 'Payment Required',                 sublabel: 'Pay to unlock bookings',    color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: 'payments'           },
}

const ACTIVE_STATUSES = [
  'pending_confirmation', 'confirmed', 'ready_for_dispatch',
  'dispatched', 'awaiting_flight_record', 'flight_record_overdue',
  'pending_post_flight_review', 'needs_clarification', 'post_flight_approved',
  'checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required',
]

const CHECKOUT_OUTCOME_BADGE: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  cleared_to_fly:               { label: 'Cleared to Fly',               color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'verified'    },
  additional_checkout_required: { label: 'Additional Checkout Required', color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  icon: 'schedule'    },
  checkout_reschedule_required: { label: 'Reschedule Required',          color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'event_repeat'},
  not_currently_eligible:       { label: 'Not Currently Eligible',       color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    icon: 'block'       },
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
    color:  'text-slate-600',
    bg:     'bg-slate-50',
    border: 'border-slate-200',
  }
  if (bookingType === 'checkout' && status === 'completed' && checkoutOutcome) {
    cfg = CHECKOUT_OUTCOME_BADGE[checkoutOutcome] ?? { label: 'Checkout Complete', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' }
  }
  if (status === 'checkout_payment_required' && isAwaitingManualPayment) {
    cfg = { label: 'Awaiting Payment Confirmation', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: 'account_balance' }
  }

  // Special confirmed pill style matching reference
  const isConfirmed = cfg.label === 'Confirmed'
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {isConfirmed && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
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
      <div className="border rounded-2xl p-8 text-center bg-white border-[#152d5a]/10 mb-8">
        <span className="material-symbols-outlined text-4xl mb-4 block text-[#1a4fd6]" style={{ fontVariationSettings: "'wght' 200" }}>
          how_to_reg
        </span>
        <h2 className="text-xl font-serif text-[#152d5a] mb-3">Checkout Required</h2>
        <p className="text-[#4b6390] text-sm leading-relaxed mb-6 max-w-md mx-auto">
          Before booking solo flights, you must complete a one-time checkout flight with our team. Documents are uploaded as part of the checkout process.
        </p>
        <Link href="/dashboard/checkout" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1a4fd6] hover:bg-[#1847be] text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors">
          <span className="material-symbols-outlined text-sm">flight_takeoff</span>
          Book Checkout Flight
        </Link>
      </div>
    )
  }
  if (clearanceStatus === 'checkout_requested') {
    return (
      <div className="border rounded-2xl p-8 bg-white border-[#152d5a]/10 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-[#1a4fd6] flex-shrink-0 mt-0.5 animate-pulse" style={{ fontVariationSettings: "'wght' 200" }}>pending_actions</span>
          <div>
            <h2 className="text-lg font-serif text-[#152d5a] mb-2">No action needed right now</h2>
            <p className="text-[#4b6390] text-base leading-relaxed">
              Our team is reviewing your checkout request. We will contact you once it is confirmed or if another time is needed.
            </p>
            {hasPendingReschedule && (
              <p className="text-amber-700 text-sm mt-3">
                Your reschedule request is waiting for admin review. Your current checkout time remains active.
              </p>
            )}
            {latestRescheduleStatus === 'approved' && (
              <p className="text-emerald-700 text-sm mt-3">
                Your checkout flight has been rescheduled.
              </p>
            )}
            {latestRescheduleStatus === 'rejected' && (
              <p className="text-amber-700 text-sm mt-3">
                Your reschedule request was not approved. Your original checkout time remains active.
              </p>
            )}
            {checkoutBooking && (
              <div className="mt-4 bg-[#f0f6ff] border border-[#152d5a]/10 rounded-lg px-4 py-3 inline-flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#4b6390]">
                <span className="font-mono font-medium text-[#152d5a]">{checkoutBooking.booking_reference}</span>
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
      <div className="border rounded-2xl p-8 bg-white border-[#152d5a]/10 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-emerald-600 flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>event_available</span>
          <div>
            <h2 className="text-lg font-serif text-[#152d5a] mb-2">Checkout Flight Confirmed</h2>
            <p className="text-[#4b6390] text-sm leading-relaxed">
              Your checkout flight has been confirmed by our team. Once your checkout flight is approved, you will unlock bookings.
            </p>
            {checkoutBooking && (
              <div className="mt-4 bg-[#f0f6ff] border border-[#152d5a]/10 rounded-lg px-4 py-3 inline-flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#4b6390]">
                <span className="font-mono font-medium text-[#152d5a]">{checkoutBooking.booking_reference}</span>
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
        <div className="border rounded-2xl p-8 bg-white border-[#152d5a]/10 mb-8">
        <div className="flex items-start gap-4">
            <span className="material-symbols-outlined text-2xl text-[#1a4fd6] flex-shrink-0 mt-0.5 animate-pulse" style={{ fontVariationSettings: "'wght' 200" }}>account_balance</span>
            <div>
              <h2 className="text-lg font-serif text-[#152d5a] mb-2">Awaiting Payment Confirmation</h2>
              <p className="text-[#4b6390] text-sm leading-relaxed">
                Your bank transfer details have been submitted. Our team will verify the payment before your checkout result is finalised. No further action is required from you right now.
              </p>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="border rounded-2xl p-8 bg-white border-[#152d5a]/10 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-orange-600 flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 200" }}>payments</span>
          <div>
            <h2 className="text-lg font-serif text-[#152d5a] mb-2">Checkout Payment Required</h2>
            <p className="text-[#4b6390] text-sm leading-relaxed mb-4">
              Your checkout flight has been completed. Please pay your checkout invoice before aircraft bookings become available.
            </p>
            <Link href={`/dashboard/bookings/${checkoutBooking.id}`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all">
              Pay Checkout Invoice
            </Link>
          </div>
        </div>
      </div>
    )
  }
  if (clearanceStatus === 'checkout_completed_under_review') {
    return (
      <div className="border rounded-2xl p-8 bg-white border-[#152d5a]/10 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-amber-600 flex-shrink-0 mt-0.5 animate-pulse" style={{ fontVariationSettings: "'wght' 200" }}>hourglass_top</span>
          <div>
            <h2 className="text-lg font-serif text-[#152d5a] mb-2">Awaiting Checkout Outcome</h2>
            <p className="text-[#4b6390] text-sm leading-relaxed">
              Your checkout flight has been completed and is awaiting review by the flight operations team. Once your checkout flight is approved, you will unlock bookings.
            </p>
          </div>
        </div>
      </div>
    )
  }
  if (clearanceStatus === 'additional_checkout_required') {
    return (
      <div className="border rounded-2xl p-8 bg-white border-[#152d5a]/10 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-amber-600 flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 200" }}>schedule</span>
          <div>
            <h2 className="text-lg font-serif text-[#152d5a] mb-2">Additional Checkout Required</h2>
            <p className="text-[#4b6390] text-sm leading-relaxed mb-4">
              Following your checkout, our team has determined that an additional checkout session is required before you can be cleared to fly.
            </p>
            <Link href="/dashboard/checkout" className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all">
              Book Another Checkout
            </Link>
          </div>
        </div>
      </div>
    )
  }
  if (clearanceStatus === 'checkout_reschedule_required') {
    return (
      <div className="border rounded-2xl p-8 bg-white border-[#152d5a]/10 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-amber-600 flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 200" }}>event_repeat</span>
          <div>
            <h2 className="text-lg font-serif text-[#152d5a] mb-2">Checkout Reschedule Required</h2>
            <p className="text-[#4b6390] text-sm leading-relaxed mb-4">
              Your checkout could not be fully assessed this time. Book another checkout session when you are ready to try again.
            </p>
            <Link href="/dashboard/checkout" className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all">
              Book Another Checkout
            </Link>
          </div>
        </div>
      </div>
    )
  }
  if (clearanceStatus === 'not_currently_eligible') {
    return (
      <div className="border rounded-2xl p-8 bg-white border-[#152d5a]/10 mb-8">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-red-600 flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 200" }}>block</span>
          <div>
            <h2 className="text-lg font-serif text-[#152d5a] mb-2">Not Currently Eligible</h2>
            <p className="text-[#4b6390] text-sm leading-relaxed">
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

      {/* ── Hero — matches all other portal pages ── */}
      <PortalPageHero
        eyebrow="Flight Records"
        title="My Bookings"
        subtitle="Manage your bookings, track flight status, and access everything you need in one place."
        backgroundImage="/customer-my-booking-bg.png"
        backgroundPosition="center"
        {...(isCleared ? { cta: { label: 'Book New Flight', href: '/dashboard/bookings/new', icon: 'flight_takeoff' } } : {})}
      />

      <div className="max-w-[1440px] mx-auto px-3 md:px-4 lg:px-6 py-8 md:py-10">

        {/* ── Stat strip ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {statCards.map(s => (
            <div
              key={s.label}
              className="bg-white border border-[#152d5a]/10 rounded-2xl p-5 flex items-center gap-3.5"
              style={{ boxShadow: '0 2px 20px rgba(2,10,22,0.06)' }}
            >
              <div className="w-11 h-11 rounded-full bg-[#f0f4ff] border border-[#152d5a]/8 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[#1a4fd6] text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>{s.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[28px] font-light text-[#152d5a] leading-none tabular-nums">{s.value}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#4b6390] mt-1 leading-tight">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Action Required banner ──────────────────────────────────── */}
        {!isCleared && (
          <ClearanceGateBanner
            clearanceStatus={clearanceStatus}
            checkoutBooking={checkoutBooking}
            isAwaitingManualPayment={isAwaitingManualPayment}
            hasPendingReschedule={hasPendingReschedule}
            latestRescheduleStatus={latestRescheduleStatus}
          />
        )}

        {/* ── Checkout Requests (pre-cleared only) ───────────────────── */}
        {!isCleared && checkoutRequests.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="material-symbols-outlined text-[#1a4fd6]/60 text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>how_to_reg</span>
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-[#152d5a]">Checkout Requests</h2>
            </div>
            <div className="space-y-3">
              {checkoutRequests.map(b => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                const cfg = STATUS_CFG[b.status]
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className="block bg-white rounded-2xl border border-[#152d5a]/10 p-5 sm:p-6 hover:border-[#152d5a]/20 transition-all group"
                    style={{ boxShadow: '0 4px 24px rgba(2,10,22,0.06)' }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg?.bg ?? 'bg-slate-50'} border ${cfg?.border ?? 'border-slate-200'}`}>
                          <span className={`material-symbols-outlined text-[18px] ${cfg?.color ?? 'text-slate-600'}`} style={{ fontVariationSettings: "'wght' 300" }}>{cfg?.icon ?? 'how_to_reg'}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[15px] font-semibold text-[#152d5a]">Checkout Flight</p>
                            {b.booking_reference && (
                              <span className="text-[10px] font-mono text-[#4b6390] bg-[#f0f4ff] border border-[#152d5a]/10 px-1.5 py-0.5 rounded">{b.booking_reference}</span>
                            )}
                          </div>
                          <p className="text-[12px] text-[#4b6390] mt-1">Cessna 172N · {aircraft?.registration ?? 'VH-KZG'}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[#94a3b8] text-[13px]">calendar_today</span>
                              <span className="text-[12px] text-[#4b6390]">{formatDateFromISO(b.scheduled_start)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[#94a3b8] text-[13px]">schedule</span>
                              <span className="text-[12px] text-[#4b6390] tabular-nums">{formatSydTime(b.scheduled_start)} – {formatSydTime(b.scheduled_end)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-3 flex-shrink-0">
                        <StatusBadge status={b.status} bookingType={b.booking_type} checkoutOutcome={checkoutOutcomeMap[b.id]} isAwaitingManualPayment={b.status === 'checkout_payment_required' ? isAwaitingManualPayment : undefined} />
                        <div className="w-8 h-8 rounded-full border border-[#152d5a]/10 bg-[#f0f4ff] flex items-center justify-center group-hover:border-[#1a4fd6]/30 group-hover:bg-[#1a4fd6]/10 transition-all">
                          <span className="material-symbols-outlined text-[#64748b] text-[14px] group-hover:text-[#1a4fd6] transition-colors">arrow_forward</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Upcoming Flights ────────────────────────────────────────── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[#1a4fd6]/60 text-[20px]" style={{ fontVariationSettings: "'wght' 300" }}>flight_takeoff</span>
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-[#152d5a]">
                {isCleared ? 'Upcoming Flights' : 'Upcoming Aircraft Bookings'}
              </h2>
            </div>
            {isCleared && (
              <Link
                href="/dashboard/bookings/new"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#e8a020] hover:bg-[#d4911a] text-white rounded-xl text-[12px] font-semibold transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                New Booking
              </Link>
            )}
          </div>

          {upcomingAircraft.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#152d5a]/10 p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#f0f4ff] flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl text-[#1a4fd6]/40" style={{ fontVariationSettings: "'wght' 100" }}>flight_land</span>
              </div>
              <h3 className="text-base font-semibold text-[#152d5a] mb-2">No upcoming flights</h3>
              <p className="text-[#6b7ea8] text-[13px] mb-6 max-w-sm mx-auto leading-relaxed">
                {isCleared
                  ? 'Request your first aircraft booking and our team will confirm it for you.'
                  : 'Aircraft bookings become available once your checkout flight is completed and you are cleared to fly.'}
              </p>
              {isCleared && (
                <Link href="/dashboard/bookings/new" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#e8a020] hover:bg-[#d4911a] text-white rounded-xl text-sm font-semibold transition-colors">
                  <span className="material-symbols-outlined text-[16px]">flight_takeoff</span>
                  Book a Flight
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#152d5a]/10 overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(2,10,22,0.06)' }}>
              {upcomingAircraft.map((b, i) => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className={`flex items-center gap-4 px-5 py-4 hover:bg-[#f8fbff] transition-colors group ${i > 0 ? 'border-t border-[#152d5a]/6' : ''}`}
                  >
                    {/* Aircraft thumbnail */}
                    <div className="relative w-16 h-16 md:w-20 md:h-14 rounded-xl overflow-hidden flex-shrink-0 border border-[#152d5a]/8">
                      <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: "url('/Cessna-172.webp')" }}
                      />
                      <div className="absolute inset-0 bg-[#061427]/40" />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-[14px] font-semibold text-[#152d5a]">Cessna 172N</p>
                        <span className="text-[10px] font-mono text-[#4b6390] bg-[#f0f4ff] border border-[#152d5a]/8 px-1.5 py-0.5 rounded">{aircraft?.registration ?? 'VH-KZG'}</span>
                        {b.booking_reference && (
                          <span className="text-[10px] font-mono text-[#64748b]">{b.booking_reference}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[#94a3b8] text-[12px]">calendar_today</span>
                          <span className="text-[12px] text-[#4b6390]">{formatDateFromISO(b.scheduled_start)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[#94a3b8] text-[12px]">schedule</span>
                          <span className="text-[12px] text-[#4b6390] tabular-nums">{formatSydTime(b.scheduled_start)} – {formatSydTime(b.scheduled_end)}</span>
                        </div>
                        {b.estimated_hours && (
                          <span className="text-[12px] text-[#64748b]">{b.estimated_hours}h</span>
                        )}
                      </div>
                    </div>

                    {/* Status + arrow */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusBadge status={b.status} bookingType={b.booking_type} checkoutOutcome={checkoutOutcomeMap[b.id]} isAwaitingManualPayment={b.status === 'checkout_payment_required' ? isAwaitingManualPayment : undefined} />
                      <div className="w-8 h-8 rounded-full border border-[#152d5a]/10 bg-[#f0f4ff] flex items-center justify-center group-hover:border-[#1a4fd6]/30 group-hover:bg-[#1a4fd6]/10 transition-all">
                        <span className="material-symbols-outlined text-[#64748b] text-[13px] group-hover:text-[#1a4fd6] transition-colors">arrow_forward</span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Flight History ──────────────────────────────────────────── */}
        {completedFlights.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="material-symbols-outlined text-[#1a4fd6]/60 text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>history</span>
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-[#152d5a]">Flight History</h2>
            </div>
            <div className="bg-white rounded-2xl border border-[#152d5a]/10 overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(2,10,22,0.06)' }}>
              {/* Table header — desktop only */}
              <div className="hidden md:grid grid-cols-[1fr_160px_100px_80px_80px] gap-4 px-5 py-3 border-b border-[#152d5a]/6 bg-[#f8fbff]">
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#94a3b8]">Aircraft</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#94a3b8]">Date</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#94a3b8]">Time</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#94a3b8]">Hours</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#94a3b8]">Status</span>
              </div>
              {completedFlights.map((b, i) => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className={`flex md:grid md:grid-cols-[1fr_160px_100px_80px_80px] gap-4 items-center px-5 py-4 hover:bg-[#f8fbff] transition-colors group ${i > 0 ? 'border-t border-[#152d5a]/5' : ''}`}
                  >
                    {/* Aircraft col */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-medium text-[#152d5a]">Cessna 172N</p>
                        <span className="text-[10px] font-mono text-[#4b6390] bg-[#f0f4ff] px-1.5 py-0.5 rounded border border-[#152d5a]/8">{aircraft?.registration ?? 'VH-KZG'}</span>
                      </div>
                      {b.booking_reference && (
                        <p className="text-[11px] font-mono text-[#94a3b8] mt-0.5">{b.booking_reference}</p>
                      )}
                      {/* Mobile: show date inline */}
                      <p className="md:hidden text-[11px] text-[#64748b] mt-0.5 tabular-nums">
                        {formatDateFromISO(b.scheduled_start)} · {formatSydTime(b.scheduled_start)} – {formatSydTime(b.scheduled_end)}
                      </p>
                    </div>
                    {/* Date col — desktop */}
                    <span className="hidden md:block text-[12px] text-[#4b6390] tabular-nums">{formatDateFromISO(b.scheduled_start)}</span>
                    {/* Time col — desktop */}
                    <span className="hidden md:block text-[12px] text-[#4b6390] tabular-nums">{formatSydTime(b.scheduled_start)} – {formatSydTime(b.scheduled_end)}</span>
                    {/* Hours col — desktop */}
                    <span className="hidden md:block text-[12px] text-[#4b6390] tabular-nums">{b.estimated_hours?.toFixed(1) ?? '0.0'}</span>
                    {/* Status col */}
                    <div className="flex items-center gap-3 flex-shrink-0 md:justify-self-end">
                      <StatusBadge status={b.status} bookingType={b.booking_type} checkoutOutcome={checkoutOutcomeMap[b.id]} />
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
