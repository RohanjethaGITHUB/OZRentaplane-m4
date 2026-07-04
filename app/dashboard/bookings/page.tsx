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
  aircraft_name?:    string | null
  aircraft_registration?: string | null
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

  const [profileResult, bookingsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single(),
    supabase
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
      .order('scheduled_start', { ascending: false }),
  ])

  const profile = profileResult.data
  if (profile?.role === 'admin') redirect('/admin')

  const clearanceStatus = ((profile as Profile | null)?.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus
  const isCleared = clearanceStatus === 'cleared_to_fly'

  const rows             = ((bookingsResult.data ?? []) as unknown as BookingRow[]).map((booking) => ({
    ...booking,
    status: deriveBookingStatusForFlightRecord(booking),
  }))
  const checkoutRequests = rows.filter(b => b.booking_type === 'checkout')
  const upcomingAircraft = rows.filter(b => b.booking_type !== 'checkout' && ACTIVE_STATUSES.includes(b.status))
  const completedFlights = rows.filter(b => {
    if (b.booking_type === 'checkout') {
      // Include checkout flights that are fully done (not active/in-progress)
      const checkoutDoneStatuses = ['completed', 'checkout_payment_required', 'awaiting_outcome', 'checkout_completed_under_review', 'additional_checkout_required', 'not_currently_eligible', 'checkout_reschedule_required']
      return checkoutDoneStatuses.includes(b.status)
    }
    return !ACTIVE_STATUSES.includes(b.status)
  })

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
  const paymentSubmittedAwaitingConfirmation = isAwaitingManualPayment

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

  const allUpcoming = [
    ...(checkoutRequests?.filter((r) => ['checkout_requested', 'checkout_confirmed'].includes(r.status)) ?? []),
    ...(upcomingAircraft ?? []),
  ].sort((a, b) => {
    const dateA = a.scheduled_start ?? ''
    const dateB = b.scheduled_start ?? ''
    return dateA.localeCompare(dateB)
  })

  return (
    <>
      <BookingsViewedTracker />

      <PortalPageHero
        eyebrow="Flight Records"
        title="My Bookings"
        subtitle="Manage your bookings, track flight status, and access everything you need in one place."
        backgroundImage="/CustomerDashboard/CustomerDashboard-bookingHero.png"
        backgroundPosition="center"
        {...(isCleared
          ? { cta: { label: 'Book New Flight', href: '/dashboard/bookings/new', icon: 'flight_takeoff' } }
          : { cta: { label: 'Book a Checkout', href: '/dashboard/checkout', icon: 'flight_takeoff' } })}
      />

      <div className="max-w-[1320px] mx-auto pt-0 pb-16">
        <div className="relative z-10 -mt-16 mb-8 px-0">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { icon: 'person_check', value: checkoutRequests.length, label: 'Checkout Requests' },
                {
                  icon: 'hourglass_empty',
                  value: rows.filter((r) => ['checkout_requested', 'pending_confirmation', 'checkout_completed_under_review'].includes(r.status)).length,
                  label: 'Pending Review',
                },
                { icon: 'calendar_month', value: upcomingAircraft.length, label: 'Upcoming Flights' },
                {
                  icon: 'check_circle',
                  value: rows.filter((r) => r.booking_type !== 'checkout' && r.status === 'completed').length,
                  label: 'Completed Flights',
                },
                {
                  icon: 'schedule',
                  value: `${rows.filter((r) => r.booking_type !== 'checkout' && r.status === 'completed').reduce((acc, r) => acc + (r.estimated_hours ?? 0), 0).toFixed(1)}h`,
                  label: 'Total Flight Hours',
                },
              ].map((stat) => (
                <div key={stat.label} className="bg-[#152d5a] rounded-2xl px-6 py-6 flex items-center gap-4 min-h-[96px]">
                  <div className="w-12 h-12 rounded-full border-2 border-white/20 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[22px] text-white/70">{stat.icon}</span>
                  </div>
                  <div>
                    <p className="text-[36px] font-bold text-white leading-none tracking-tight">{stat.value}</p>
                    <p className="text-[10px] text-white/50 uppercase tracking-[0.12em] mt-2">{stat.label}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Action Required — always visible */}
        {(() => {
          let icon = 'warning'
          let iconBg = 'bg-amber-100'
          let iconColor = 'text-amber-600'
          let label = 'ACTION REQUIRED'
          let labelColor = 'text-amber-600'
          let heading = ''
          let body = ''
          let ctaLabel = ''
          let ctaHref = ''
          let ctaStyle = 'bg-[#f59e0b] hover:bg-[#d97706] text-[#0d1b3e]'
          let cardStyle = 'bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 rounded-2xl p-5 mb-6'

          const status = clearanceStatus
          const hasUpcoming = allUpcoming.length > 0

          if (status === 'cleared_to_fly' && hasUpcoming) {
            icon = 'check_circle'
            iconBg = 'bg-green-100'
            iconColor = 'text-green-600'
            label = 'ALL CLEAR'
            labelColor = 'text-green-600'
            heading = "You're ready to fly"
            body = 'Your upcoming flight is confirmed. Check your booking details and we\'ll see you on the day.'
            ctaLabel = 'View Booking'
            ctaHref = `/dashboard/bookings/${allUpcoming[0]?.id}`
            ctaStyle = 'bg-[#152d5a] hover:bg-[#1a3a6e] text-white'
            cardStyle = 'bg-white border border-green-200 border-l-4 border-l-green-500 rounded-2xl p-5 mb-6'
          } else if (status === 'cleared_to_fly' && !hasUpcoming) {
            icon = 'flight_takeoff'
            iconBg = 'bg-blue-100'
            iconColor = 'text-[#1a4fd6]'
            label = 'NEXT STEP'
            labelColor = 'text-[#1a4fd6]'
            heading = 'Ready to book your next flight?'
            body = 'Your pilot clearance is active. Browse available times and book your next rental flight.'
            ctaLabel = 'Book a Flight'
            ctaHref = '/dashboard/bookings/new'
            ctaStyle = 'bg-[#f59e0b] hover:bg-[#d97706] text-[#0d1b3e]'
            cardStyle = 'bg-white border border-blue-200 border-l-4 border-l-[#1a4fd6] rounded-2xl p-5 mb-6'
          } else if (status === 'checkout_confirmed') {
            icon = 'event_available'
            iconBg = 'bg-blue-100'
            iconColor = 'text-[#1a4fd6]'
            label = 'UPCOMING'
            labelColor = 'text-[#1a4fd6]'
            heading = 'Checkout Flight Confirmed'
            body = 'Your checkout flight has been confirmed. Once our team approves it, your aircraft bookings will unlock.'
            ctaLabel = 'View Checkout'
            ctaHref = '/dashboard/checkout'
            ctaStyle = 'bg-[#152d5a] hover:bg-[#1a3a6e] text-white'
            cardStyle = 'bg-white border border-blue-200 border-l-4 border-l-[#1a4fd6] rounded-2xl p-5 mb-6'
          } else if (status === 'checkout_requested') {
            icon = 'hourglass_empty'
            iconBg = 'bg-blue-100'
            iconColor = 'text-[#1a4fd6]'
            label = 'IN REVIEW'
            labelColor = 'text-[#1a4fd6]'
            heading = 'Checkout Request Under Review'
            body = 'Our team is reviewing your checkout request. We\'ll be in touch to confirm your time or suggest an alternative.'
            ctaLabel = 'View Status'
            ctaHref = '/dashboard/checkout'
            ctaStyle = 'bg-[#152d5a] hover:bg-[#1a3a6e] text-white'
            cardStyle = 'bg-white border border-blue-200 border-l-4 border-l-[#1a4fd6] rounded-2xl p-5 mb-6'
          } else if (status === 'checkout_payment_required') {
            if (paymentSubmittedAwaitingConfirmation) {
              icon = 'hourglass_empty'
              iconBg = 'bg-blue-100'
              iconColor = 'text-blue-600'
              label = 'AWAITING CONFIRMATION'
              labelColor = 'text-blue-600'
              heading = 'Payment Proof Submitted'
              body = 'Your payment proof has been submitted. Our team will review it and update your status once confirmed.'
              ctaLabel = 'View Details'
              ctaHref = allUpcoming[0]?.id ? `/dashboard/bookings/${allUpcoming[0].id}` : '/dashboard/bookings'
              ctaStyle = 'bg-[#152d5a] hover:bg-[#1a3a6e] text-white'
            } else {
              icon = 'payments'
              iconBg = 'bg-amber-100'
              iconColor = 'text-amber-600'
              label = 'ACTION REQUIRED'
              labelColor = 'text-amber-600'
              heading = 'Checkout Payment Required'
              body = 'Your checkout flight is complete. Please pay your invoice to unlock aircraft bookings.'
              ctaLabel = 'Pay Invoice'
              ctaHref = '/dashboard/checkout'
              ctaStyle = 'bg-[#f59e0b] hover:bg-[#d97706] text-[#0d1b3e]'
            }
          } else if (status === 'checkout_completed_under_review') {
            icon = 'manage_search'
            iconBg = 'bg-blue-100'
            iconColor = 'text-[#1a4fd6]'
            label = 'AWAITING OUTCOME'
            labelColor = 'text-[#1a4fd6]'
            heading = 'Checkout Outcome Under Review'
            body = 'Your checkout flight has been completed and is under review by our flight operations team.'
            ctaLabel = 'View Details'
            ctaHref = '/dashboard/checkout'
            ctaStyle = 'bg-[#152d5a] hover:bg-[#1a3a6e] text-white'
            cardStyle = 'bg-white border border-blue-200 border-l-4 border-l-[#1a4fd6] rounded-2xl p-5 flex items-start gap-4 mb-6'
          } else {
            heading = 'Complete Your Checkout to Start Flying'
            body = 'A one-time checkout flight is required before you can hire an aircraft solo. Upload your documents and book your checkout to get started.'
            ctaLabel = 'Book a Checkout'
            ctaHref = '/dashboard/checkout'
          }

          return (
            <div className={cardStyle}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}>
                    <span className={`material-symbols-outlined text-[20px] ${iconColor}`}>{icon}</span>
                  </div>
                  <p className={`text-[10px] font-bold tracking-[0.15em] uppercase ${labelColor}`}>{label}</p>
                </div>
                {ctaLabel && (
                  <Link
                    href={ctaHref}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 ${ctaStyle} font-semibold text-[13px] px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap`}
                  >
                    {ctaLabel}
                    <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                  </Link>
                )}
              </div>
              <div className="pl-0">
                <p className="text-[17px] font-bold text-[#152d5a] leading-snug mb-1">{heading}</p>
                <p className="text-[13px] text-[#4b6390] leading-relaxed">{body}</p>
              </div>
            </div>
          )
        })()}

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          <div className="flex-1 min-w-0 flex flex-col gap-6">
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[#1a4fd6] text-[18px]">flight_takeoff</span>
                  <h2 className="text-[13px] font-semibold text-[#152d5a] tracking-[0.05em] uppercase">
                    Upcoming Flights
                  </h2>
                </div>
                <Link
                  href="/dashboard/bookings"
                  className="text-[12px] font-semibold text-[#1a4fd6] hover:underline flex items-center gap-1"
                >
                  View all <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                </Link>
              </div>

              {(() => {
                return allUpcoming.length === 0 ? (
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
                  <div className="space-y-4">
                    {allUpcoming.map((booking) => {
                      const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
                      return (
                        <div key={booking.id} className="bg-white border border-[#152d5a]/10 rounded-2xl overflow-hidden flex">
                          <div
                            className="w-[220px] min-h-[160px] flex-shrink-0 bg-cover bg-center hidden sm:block"
                            style={{ backgroundImage: `url('/Cessna-172.webp')` }}
                          />
                          <div className="flex-1 min-w-0 p-5 flex flex-col justify-between gap-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                                booking.booking_type === 'checkout'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}>
                                {booking.booking_type === 'checkout' ? 'Checkout Flight' : 'Rental Booking'}
                              </span>
                              <StatusBadge status={booking.status} />
                            </div>
                            <div>
                              <p className="text-[18px] font-semibold text-[#152d5a] leading-snug">
                                {(booking.aircraft_name ?? 'Cessna 172N').replace(/Cessna 172(?!N)/g, 'Cessna 172N')}
                              </p>
                              <p className="text-[12px] text-[#4b6390] mt-0.5">{booking.aircraft_registration ?? aircraft?.registration ?? 'VH-KZG'}</p>
                            </div>
                            <div className="flex items-center gap-3 text-[12px] text-[#4b6390] flex-wrap">
                              {booking.scheduled_start && (
                                <span className="flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                                  {formatDateFromISO(booking.scheduled_start)}
                                </span>
                              )}
                              {booking.scheduled_start && (
                                <>
                                  <span className="text-[#152d5a]/20">·</span>
                                  <span className="flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[13px]">schedule</span>
                                    {formatSydTime(booking.scheduled_start)} – {formatSydTime(booking.scheduled_end)}
                                  </span>
                                </>
                              )}
                              {booking.estimated_hours && (
                                <>
                                  <span className="text-[#152d5a]/20">·</span>
                                  <span className="flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[13px]">timer</span>
                                    {booking.estimated_hours} hrs
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 p-4 justify-center border-l border-[#152d5a]/[0.07] w-[180px] flex-shrink-0">
                            <Link
                              href={`/dashboard/bookings/${booking.id}`}
                              className="flex items-center justify-between whitespace-nowrap bg-[#152d5a] hover:bg-[#1a3a6e] text-white text-[13px] font-bold px-4 py-2.5 rounded-xl transition-colors"
                            >
                              VIEW DETAILS
                              <span className="material-symbols-outlined text-[16px] ml-2">chevron_right</span>
                            </Link>
                            <Link
                              href={`/dashboard/bookings/${booking.id}`}
                              className="flex items-center justify-center whitespace-nowrap border border-[#152d5a]/20 text-[#152d5a] hover:bg-[#f0f6ff] text-[11px] font-bold tracking-[0.08em] uppercase px-4 py-2 rounded-xl transition-colors"
                            >
                              MODIFY BOOKING
                            </Link>
                            <button className="flex items-center justify-center whitespace-nowrap border border-red-200 text-red-500 hover:bg-red-50 text-[11px] font-bold tracking-[0.08em] uppercase px-4 py-2 rounded-xl transition-colors">
                              CANCEL REQUEST
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </section>

            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[#1a4fd6]">flight_land</span>
                  <span className="text-[13px] font-semibold text-[#152d5a] tracking-[0.05em] uppercase">Flight History</span>
                </div>
              </div>

              {completedFlights.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {completedFlights.map((booking) => {
                    const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
                    const checkoutOutcome = booking.booking_type === 'checkout' ? checkoutOutcomeMap[booking.id] ?? null : null
                    return (
                      <div key={booking.id} className="bg-white border border-[#152d5a]/10 rounded-2xl overflow-hidden flex">
                        <div
                          className="w-[220px] min-h-[160px] flex-shrink-0 bg-cover bg-center hidden sm:block"
                          style={{ backgroundImage: `url('/Cessna-172.webp')` }}
                        />
                        <div className="flex-1 min-w-0 p-5 flex flex-col justify-between gap-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                              booking.booking_type === 'checkout'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-[#f0f6ff] text-[#4b6390] border border-[#152d5a]/10'
                            }`}>
                              {booking.booking_type === 'checkout' ? 'Checkout Flight' : 'Rental Booking'}
                            </span>
                            <StatusBadge status={booking.status} />
                          </div>
                          <div>
                            <p className="text-[18px] font-semibold text-[#152d5a] leading-snug">
                              {(booking.aircraft_name ?? 'Cessna 172N').replace(/Cessna 172(?!N)/g, 'Cessna 172N')}
                            </p>
                            <p className="text-[12px] text-[#4b6390] mt-0.5">{booking.aircraft_registration ?? aircraft?.registration ?? 'VH-KZG'}</p>
                            {booking.booking_type === 'checkout' && checkoutOutcome && (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="material-symbols-outlined text-[13px] text-[#4b6390]">assignment_turned_in</span>
                                <span className={`text-[12px] font-semibold ${
                                  checkoutOutcome === 'cleared_to_fly'
                                    ? 'text-green-600'
                                    : checkoutOutcome === 'additional_checkout_required' || checkoutOutcome === 'not_currently_eligible'
                                    ? 'text-red-500'
                                    : 'text-amber-600'
                                }`}>
                                  {checkoutOutcome === 'cleared_to_fly' ? 'Outcome: Cleared to fly' :
                                   checkoutOutcome === 'additional_checkout_required' ? 'Outcome: Additional checkout required' :
                                   checkoutOutcome === 'not_currently_eligible' ? 'Outcome: Not currently eligible' :
                                   checkoutOutcome === 'checkout_reschedule_required' ? 'Outcome: Reschedule required' :
                                   `Outcome: ${checkoutOutcome.replace(/_/g, ' ')}`}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[12px] text-[#4b6390] flex-wrap">
                            {booking.scheduled_start && (
                              <span className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                                {formatDateFromISO(booking.scheduled_start)}
                              </span>
                            )}
                            {booking.scheduled_start && booking.scheduled_end && (
                              <>
                                <span className="text-[#152d5a]/20">•</span>
                                <span className="flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[13px]">schedule</span>
                                  {new Date(booking.scheduled_start).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                  {' – '}
                                  {new Date(booking.scheduled_end).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                              </>
                            )}
                            {booking.estimated_hours && (
                              <>
                                <span className="text-[#152d5a]/20">•</span>
                                <span className="flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[13px]">timer</span>
                                  {booking.estimated_hours} hrs
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 p-4 justify-center border-l border-[#152d5a]/[0.07] w-[180px] flex-shrink-0">
                          <Link
                            href={`/dashboard/bookings/${booking.id}`}
                            className="flex items-center justify-between whitespace-nowrap bg-[#152d5a] hover:bg-[#1a3a6e] text-white text-[13px] font-bold px-4 py-2.5 rounded-xl transition-colors"
                          >
                            VIEW DETAILS
                            <span className="material-symbols-outlined text-[16px] ml-2">chevron_right</span>
                          </Link>
                          {booking.booking_type !== 'checkout' && (
                            <>
                              <Link
                                href={`/dashboard/bookings/${booking.id}`}
                                className="flex items-center justify-center whitespace-nowrap border border-[#152d5a]/20 text-[#152d5a] hover:bg-[#f0f6ff] text-[11px] font-bold tracking-[0.08em] uppercase px-4 py-2 rounded-xl transition-colors"
                              >
                                DOWNLOAD INVOICE
                              </Link>
                              <Link
                                href={`/dashboard/bookings/${booking.id}`}
                                className="flex items-center justify-center whitespace-nowrap border border-[#152d5a]/20 text-[#152d5a] hover:bg-[#f0f6ff] text-[11px] font-bold tracking-[0.08em] uppercase px-4 py-2 rounded-xl transition-colors"
                              >
                                DOWNLOAD RECEIPT
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
                  <div className="w-14 h-14 rounded-full bg-[#f0f6ff] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[28px] text-[#1a4fd6]">flight_land</span>
                  </div>
                  <div>
                    <p className="text-[16px] font-semibold text-[#152d5a]">No flight history yet</p>
                    <p className="text-[13px] text-[#4b6390] mt-1 max-w-[320px]">
                      {clearanceStatus === 'cleared_to_fly'
                        ? 'Your completed flights will appear here after each booking.'
                        : 'Complete your checkout flight to start building your flight history.'}
                    </p>
                  </div>
                  {clearanceStatus !== 'cleared_to_fly' && (
                    <Link
                      href="/dashboard/bookings/new"
                      className="inline-flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-[#0d1b3e] font-semibold text-[13px] px-5 py-2.5 rounded-xl transition-colors"
                    >
                      <span className="material-symbols-outlined text-[15px]">flight_takeoff</span>
                      Get Started
                    </Link>
                  )}
                </div>
              )}
            </section>
          </div>

          <div className="w-full lg:w-[300px] flex-shrink-0 flex flex-col gap-4">
            {clearanceStatus === 'checkout_payment_required' ? (
              paymentSubmittedAwaitingConfirmation ? (
                <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-[16px] text-blue-500">hourglass_empty</span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4b6390]">Payment Status</span>
                  </div>
                  <p className="text-[15px] font-semibold text-[#1a4fd6]">Payment proof submitted</p>
                  <p className="text-[12px] text-[#4b6390] mt-1">Our team is reviewing your payment. We'll confirm within 2–24 hours.</p>
                </div>
              ) : (
                <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-[16px] text-amber-500">payments</span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4b6390]">Payment Status</span>
                  </div>
                  <p className="text-[15px] font-semibold text-amber-600">Checkout payment required</p>
                  <p className="text-[12px] text-[#4b6390] mt-1 mb-3">Your checkout invoice is ready. Pay now to unlock aircraft bookings.</p>
                  <Link
                    href={allUpcoming[0]?.id ? `/dashboard/bookings/${allUpcoming[0].id}` : '/dashboard/bookings'}
                    className="inline-flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-[#0d1b3e] font-semibold text-[13px] px-4 py-2.5 rounded-xl transition-colors w-full justify-center"
                  >
                    <span className="material-symbols-outlined text-[15px]">credit_card</span>
                    Pay Invoice
                  </Link>
                </div>
              )
            ) : (
              <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">payments</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4b6390]">Payment Status</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[15px] font-semibold text-green-700">No outstanding payments</p>
                    <p className="text-[12px] text-[#4b6390] mt-0.5">All booked flights are paid in full.</p>
                  </div>
                  <span className="material-symbols-outlined text-[28px] text-green-500">check_circle</span>
                </div>
              </div>
            )}

            <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">headset_mic</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4b6390]">OPS Contact</span>
              </div>
              <p className="text-[14px] font-semibold text-[#152d5a]">Need assistance?</p>
              <p className="text-[12px] text-[#4b6390] mt-1 mb-3">Our operations team is here to help.</p>
              <a href="tel:+61395800555" className="block text-[13px] font-semibold text-[#1a4fd6] hover:underline">+61 3 9580 0555</a>
              <a href="mailto:ops@ozrentaplane.com.au" className="block text-[13px] text-[#1a4fd6] hover:underline mt-0.5">ops@ozrentaplane.com.au</a>
            </div>

            <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">history</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4b6390]">Recent Activity</span>
                </div>
                <Link href="/dashboard/bookings" className="text-[12px] text-[#1a4fd6] hover:underline font-medium">View all</Link>
              </div>
              {rows.slice(0, 4).map((row) => (
                <div key={row.id} className="py-3 border-b border-[#152d5a]/[0.06] last:border-0">
                  <div className="mb-1.5">
                    <StatusBadge
                      status={row.status}
                      isAwaitingManualPayment={row.status === 'checkout_payment_required' ? paymentSubmittedAwaitingConfirmation : false}
                    />
                  </div>
                  <p className="text-[12px] font-semibold text-[#152d5a] leading-snug mb-1">
                    {row.booking_type === 'checkout' ? 'Checkout request submitted' : 'Rental booking confirmed'}
                  </p>
                  <p className="text-[11px] text-[#4b6390]">
                    {(row.aircraft_name ?? 'Cessna 172N').replace(/Cessna 172(?!N)/g, 'Cessna 172N')} · {row.aircraft_registration ?? 'VH-KZG'}
                  </p>
                  {row.scheduled_start && (
                    <p className="text-[11px] text-[#4b6390]">
                      {formatDateFromISO(row.scheduled_start)}
                      {row.scheduled_start ? ` · ${formatSydTime(row.scheduled_start)}` : ''}
                    </p>
                  )}
                  {(row.status === 'checkout_payment_required' || row.status === 'payment_pending') && (
                    paymentSubmittedAwaitingConfirmation ? (
                      <span className="text-[11px] text-[#1a4fd6] mt-1 block">Awaiting confirmation</span>
                    ) : (
                      <Link
                        href={`/dashboard/bookings/${row.id}`}
                        className="text-[11px] font-semibold text-[#f59e0b] hover:underline mt-1 block"
                      >
                        Pay invoice →
                      </Link>
                    )
                  )}
                </div>
              ))}
              <Link href="/dashboard/bookings" className="block text-center text-[12px] font-semibold text-[#1a4fd6] hover:underline mt-3 pt-3 border-t border-[#152d5a]/[0.06]">
                View all activity
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
