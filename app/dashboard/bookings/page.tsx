import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PortalPageHero from '@/components/PortalPageHero'
import BookingsViewedTracker from './BookingsViewedTracker'
import type { Profile, PilotClearanceStatus } from '@/lib/supabase/types'
import { formatDateFromISO } from '@/lib/formatDateTime'
import { formatSydTime } from '@/lib/utils/sydney-time'

export const metadata = { title: 'My Bookings | OZRentAPlane' }

// ── Status config ─────────────────────────────────────────────────────────────
// Customer-facing labels for every booking status including checkout statuses.

const STATUS_CFG: Record<string, {
  label:     string
  sublabel?: string
  color:     string
  bg:        string
  border:    string
  icon:      string
}> = {
  // Standard booking lifecycle
  pending_confirmation:       { label: 'Request Pending',         sublabel: 'Not yet confirmed',         color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'pending'            },
  confirmed:                  { label: 'Confirmed',               sublabel: 'Booking approved',          color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   icon: 'check_circle'       },
  ready_for_dispatch:         { label: 'Ready to Fly',            sublabel: 'Pre-flight checks done',    color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'flight_takeoff'     },
  dispatched:                 { label: 'Airborne',                sublabel: 'Flight in progress',        color: 'text-green-300',  bg: 'bg-green-500/10',  border: 'border-green-400/20',  icon: 'flight'             },
  awaiting_flight_record:     { label: 'Awaiting Record',         sublabel: 'Please submit flight log',  color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'assignment'         },
  flight_record_overdue:      { label: 'Record Overdue',          sublabel: 'Flight log required',       color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'assignment_late'    },
  pending_post_flight_review: { label: 'Under Review',            sublabel: 'Post-flight review',        color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: 'rate_review'        },
  needs_clarification:        { label: 'Clarification Needed',    sublabel: 'Admin has a question',      color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: 'help'               },
  post_flight_approved:       { label: 'Flight Approved',         sublabel: 'Records accepted',          color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'verified'           },
  completed:                  { label: 'Completed',               sublabel: 'Booking closed',            color: 'text-slate-400',  bg: 'bg-white/5',       border: 'border-white/10',      icon: 'done_all'           },
  cancelled:                  { label: 'Cancelled',               sublabel: 'Will not proceed',          color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'cancel'             },
  no_show:                    { label: 'No Show',                 sublabel: 'Marked absent',             color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'person_off'         },
  // Checkout booking statuses
  checkout_requested:         { label: 'Awaiting Review',         sublabel: 'Awaiting instructor confirmation', color: 'text-blue-400',  bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   icon: 'pending_actions'    },
  checkout_confirmed:         { label: 'Checkout Confirmed',      sublabel: 'Instructor confirmed',      color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'event_available'    },
  checkout_completed_under_review: { label: 'Checkout Completed - Under Review', sublabel: 'Checkout complete',       color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'rate_review'        },
  checkout_payment_required:       { label: 'Payment Required',                sublabel: 'Pay to unlock bookings',  color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: 'payments'           },
}

const ACTIVE_STATUSES = [
  // Standard
  'pending_confirmation', 'confirmed', 'ready_for_dispatch',
  'dispatched', 'awaiting_flight_record', 'flight_record_overdue',
  'pending_post_flight_review', 'needs_clarification', 'post_flight_approved',
  // Checkout
  'checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required',
]

const CHECKOUT_OUTCOME_BADGE: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  cleared_to_fly:               { label: 'Cleared to Fly',                  color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'verified'    },
  additional_checkout_required: { label: 'Additional Checkout Required',    color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'schedule'    },
  checkout_reschedule_required: { label: 'Reschedule Required',             color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   icon: 'event_repeat'},
  not_currently_eligible:       { label: 'Not Currently Eligible',          color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'block'       },
}

function StatusBadge({ status, bookingType, checkoutOutcome }: { status: string; bookingType?: string; checkoutOutcome?: string | null }) {
  let cfg: { label: string; color: string; bg: string; border: string; icon?: string } = STATUS_CFG[status] ?? {
    label:  status.replace(/_/g, ' '),
    color:  'text-slate-400',
    bg:     'bg-white/5',
    border: 'border-white/10',
  }
  // For completed checkout bookings, show the actual outcome rather than generic "Completed".
  if (bookingType === 'checkout' && status === 'completed' && checkoutOutcome) {
    cfg = CHECKOUT_OUTCOME_BADGE[checkoutOutcome] ?? { label: 'Checkout Complete', color: 'text-slate-400', bg: 'bg-white/5', border: 'border-white/10' }
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {bookingType === 'checkout' && (
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
  scheduled_start:   string
  scheduled_end:     string
  estimated_hours:   number | null
  estimated_amount:  number | null
  pic_name:          string | null
  created_at:        string
  aircraft:          { registration: string } | null
}

const CARD = 'bg-gradient-to-br from-[#0c1525] to-[#080e1c] border border-white/[0.07] rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.35)]'

// ── Clearance gate banners ────────────────────────────────────────────────────
// Shown at the top of the bookings page when the user is not yet cleared.

type GateBannerProps = {
  clearanceStatus: PilotClearanceStatus
  checkoutBooking: BookingRow | null
}

function ClearanceGateBanner({ clearanceStatus, checkoutBooking }: GateBannerProps) {
  if (clearanceStatus === 'checkout_required') {
    return (
      <div className={`border rounded-xl p-8 text-center bg-blue-500/[0.06] border-blue-500/20 mb-8`}>
        <span
          className="material-symbols-outlined text-4xl mb-4 block text-blue-400"
          style={{ fontVariationSettings: "'wght' 200" }}
        >
          how_to_reg
        </span>
        <h2 className="text-xl font-serif text-white mb-3">Checkout Required</h2>
        <p className="text-slate-500 text-sm leading-relaxed mb-6 max-w-md mx-auto">
          Before booking solo flights, you must complete a one-time checkout flight with an approved instructor. Documents are uploaded as part of the checkout process.
        </p>
        <Link
          href="/dashboard/checkout"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors"
        >
          <span className="material-symbols-outlined text-sm">flight_takeoff</span>
          Book Checkout Flight
        </Link>
      </div>
    )
  }

  if (clearanceStatus === 'checkout_requested') {
    return (
      <div className={`border rounded-xl p-8 bg-blue-500/[0.06] border-blue-500/20 mb-8`}>
        <div className="flex items-start gap-4">
          <span
            className="material-symbols-outlined text-2xl text-blue-400 flex-shrink-0 mt-0.5 animate-pulse"
            style={{ fontVariationSettings: "'wght' 200" }}
          >
            pending_actions
          </span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Checkout Request Under Review</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Your checkout flight request has been submitted and is awaiting review by the admin team or an approved instructor. Aircraft bookings will become available after your checkout flight is completed, approved, and the checkout invoice is paid.
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

  if (clearanceStatus === 'checkout_confirmed') {
    return (
      <div className={`border rounded-xl p-8 bg-green-500/[0.05] border-green-500/20 mb-8`}>
        <div className="flex items-start gap-4">
          <span
            className="material-symbols-outlined text-2xl text-green-400 flex-shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            event_available
          </span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Checkout Flight Confirmed</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Your checkout flight has been confirmed by an approved instructor. Standard solo bookings are locked until your checkout is completed and reviewed.
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
    return (
      <div className={`border rounded-xl p-8 bg-orange-500/[0.05] border-orange-500/20 mb-8`}>
        <div className="flex items-start gap-4">
          <span
            className="material-symbols-outlined text-2xl text-orange-400 flex-shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'wght' 200" }}
          >
            payments
          </span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Checkout Payment Required</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-4">
              Your checkout flight has been approved. Please pay your checkout invoice before aircraft bookings become available.
            </p>
            <Link
              href={`/dashboard/bookings/${checkoutBooking.id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500/15 border border-orange-400/30 text-orange-300 hover:bg-orange-500/25 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
            >
              Pay Checkout Invoice
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (clearanceStatus === 'checkout_completed_under_review') {
    return (
      <div className={`border rounded-xl p-8 bg-amber-500/[0.05] border-amber-500/20 mb-8`}>
        <div className="flex items-start gap-4">
          <span
            className="material-symbols-outlined text-2xl text-amber-400 flex-shrink-0 mt-0.5 animate-pulse"
            style={{ fontVariationSettings: "'wght' 200" }}
          >
            hourglass_top
          </span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Awaiting Checkout Outcome</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Your checkout flight has been completed and is awaiting review by the flight operations team. Standard solo bookings are locked until your clearance status is updated.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (clearanceStatus === 'additional_checkout_required') {
    return (
      <div className={`border rounded-xl p-8 bg-amber-500/[0.05] border-amber-500/20 mb-8`}>
        <div className="flex items-start gap-4">
          <span
            className="material-symbols-outlined text-2xl text-amber-400 flex-shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'wght' 200" }}
          >
            schedule
          </span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Additional Checkout Required</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-4">
              Following your checkout, the admin team has determined that an additional checkout session is required before you can be cleared to fly. Book another checkout flight to continue.
            </p>
            <Link
              href="/dashboard/checkout"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500/15 border border-amber-400/30 text-amber-300 hover:bg-amber-500/25 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
            >
              Book Another Checkout
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (clearanceStatus === 'checkout_reschedule_required') {
    return (
      <div className={`border rounded-xl p-8 bg-amber-500/[0.05] border-amber-500/20 mb-8`}>
        <div className="flex items-start gap-4">
          <span
            className="material-symbols-outlined text-2xl text-amber-400 flex-shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'wght' 200" }}
          >
            event_repeat
          </span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Checkout Reschedule Required</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-4">
              Your checkout could not be fully assessed this time. Book another checkout session when you are ready to try again.
            </p>
            <Link
              href="/dashboard/checkout"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500/15 border border-amber-400/30 text-amber-300 hover:bg-amber-500/25 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
            >
              Book Another Checkout
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (clearanceStatus === 'not_currently_eligible') {
    return (
      <div className={`border rounded-xl p-8 bg-red-500/[0.05] border-red-500/20 mb-8`}>
        <div className="flex items-start gap-4">
          <span
            className="material-symbols-outlined text-2xl text-red-400 flex-shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'wght' 200" }}
          >
            block
          </span>
          <div>
            <h2 className="text-lg font-serif text-white mb-2">Not Currently Eligible</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Based on your checkout assessment, further training with a qualified instructor is required before you can continue with aircraft hire. Please contact us when you are ready to try again.
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

  // pilot_clearance_status drives the entire bookings page — not verification_status
  const clearanceStatus = ((profile as Profile | null)?.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus
  
  // TODO: Future invoice-paid eligibility
  // Once payment fields exist, this stage switch should require both checkout clearance
  // and the checkout invoice to be paid before allowing full standard booking access.
  const isCleared = clearanceStatus === 'cleared_to_fly'

  // Fetch all bookings regardless of clearance — checkout bookings must always be visible
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, booking_reference, status, booking_type,
      scheduled_start, scheduled_end,
      estimated_hours, estimated_amount, pic_name, created_at,
      aircraft ( registration )
    `)
    .eq('booking_owner_user_id', user.id)
    .order('scheduled_start', { ascending: false })

  const rows             = (bookings ?? []) as unknown as BookingRow[]
  const checkoutRequests = rows.filter(b => b.booking_type === 'checkout')
  const upcomingAircraft = rows.filter(b => b.booking_type !== 'checkout' && ACTIVE_STATUSES.includes(b.status))
  const completedFlights = rows.filter(b => b.booking_type !== 'checkout' && !ACTIVE_STATUSES.includes(b.status))

  // Fetch checkout outcomes for completed checkout bookings so the badge shows the
  // actual outcome instead of a generic "Completed" label.
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

  // For the gate banner detail block — most recent active checkout booking
  const checkoutBooking = rows.find(b =>
    b.booking_type === 'checkout' &&
    ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required'].includes(b.status)
  ) ?? null

  return (
    <>
      {/* Advances last_bookings_viewed_at so the nav badge clears */}
      <BookingsViewedTracker />
      <PortalPageHero
        eyebrow="Flight Records"
        title="My Bookings"
        subtitle="Review your checkout requests, aircraft bookings, and flight history."
      />

      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10">

        {/* Clearance gate banner — shown for all non-cleared states */}
        {!isCleared && (
          <ClearanceGateBanner
            clearanceStatus={clearanceStatus}
            checkoutBooking={checkoutBooking}
          />
        )}

        {/* Summary stats — dynamic based on clearance stage */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {(!isCleared ? [
            { label: 'Checkout Request',           value: checkoutRequests.length },
            { label: 'Awaiting Review',            value: rows.filter(b => ['checkout_requested', 'pending_confirmation', 'checkout_completed_under_review'].includes(b.status)).length },
            { label: 'Upcoming Aircraft Bookings', value: upcomingAircraft.length },
            { label: 'Completed Flights',          value: rows.filter(b => b.booking_type !== 'checkout' && b.status === 'completed').length },
          ] : [
            { label: 'Upcoming Bookings',          value: upcomingAircraft.length },
            { label: 'Awaiting Confirmation',      value: rows.filter(b => b.booking_type !== 'checkout' && ['pending_confirmation', 'needs_clarification'].includes(b.status)).length },
            { label: 'Completed Flights',          value: rows.filter(b => b.booking_type !== 'checkout' && b.status === 'completed').length },
            { label: 'Total Flight Hours',         value: rows.filter(b => b.booking_type !== 'checkout' && b.status === 'completed').reduce((sum, b) => sum + (b.estimated_hours ?? 0), 0).toFixed(1) },
          ]).map(s => (
            <div key={s.label} className={`${CARD} p-5 text-center`}>
              <div className="text-2xl font-serif font-light text-white mb-1">{s.value}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Checkout Requests ─────────────────────────────────────────────── */}
        {!isCleared && checkoutRequests.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                Checkout Requests
              </h3>
            </div>
            <div className="space-y-3">
              {checkoutRequests.map(b => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                const cfg      = STATUS_CFG[b.status]
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className={`block ${CARD} p-5 hover:border-blue-500/30 transition-all group`}
                  >
                    <div className="flex items-start justify-between gap-4">

                      {/* Left: icon + aircraft + reference + date/time */}
                      <div className="flex items-start gap-4 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg?.bg ?? 'bg-blue-500/10'} border ${cfg?.border ?? 'border-blue-500/20'}`}>
                          <span
                            className={`material-symbols-outlined text-[18px] ${cfg?.color ?? 'text-blue-400'}`}
                            style={{ fontVariationSettings: "'wght' 300" }}
                          >
                            {cfg?.icon ?? 'how_to_reg'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                              Checkout Flight
                            </p>
                            {b.booking_reference && (
                              <span className="text-[10px] font-mono text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded">
                                {b.booking_reference}
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] font-medium text-slate-300 mt-1.5">
                            Cessna 172N · Registration {aircraft?.registration ?? 'VH-KZG'}
                          </p>
                          <p className="text-[12px] font-medium text-slate-300 mt-1">
                            {formatDateFromISO(b.scheduled_start)}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                            {formatSydTime(b.scheduled_start)} – {formatSydTime(b.scheduled_end)} Sydney time (AEST)
                          </p>
                          <p className="text-[10px] text-slate-700 mt-2">
                            Submitted {formatDateFromISO(b.created_at)}
                          </p>
                        </div>
                      </div>

                      {/* Right: amount + hours + badge + arrow */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <StatusBadge status={b.status} bookingType={b.booking_type} checkoutOutcome={checkoutOutcomeMap[b.id]} />
                        {b.estimated_amount != null && (
                          <div className="flex flex-col items-end gap-1 mt-1">
                            <span className="text-sm font-semibold text-white/80 tabular-nums">
                              Checkout fee: ${b.estimated_amount.toFixed(0)}
                            </span>
                            <span className="text-[10px] text-slate-500 max-w-[150px] text-right leading-tight">
                              Invoiced after checkout completion and approval
                            </span>
                          </div>
                        )}
                        <span className="material-symbols-outlined text-slate-600 group-hover:text-blue-400 text-base transition-colors mt-1">
                          arrow_forward
                        </span>
                      </div>

                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Upcoming Aircraft Bookings ────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {isCleared ? 'Upcoming Bookings' : 'Upcoming Aircraft Bookings'}
            </h3>
            {/* Only show New Booking CTA when cleared for solo hire */}
            {isCleared && (
              <Link
                href="/dashboard/bookings/new"
                className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors shadow-[0_0_16px_rgba(37,99,235,0.25)]"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                New Booking
              </Link>
            )}
          </div>

          {upcomingAircraft.length === 0 ? (
            <div className={`${CARD} p-12 text-center`}>
              <span className="material-symbols-outlined text-3xl text-slate-700 mb-3 block" style={{ fontVariationSettings: "'wght' 200" }}>
                flight_land
              </span>
              <h3 className="text-lg font-serif text-white/60 mb-2">
                {isCleared ? 'No upcoming aircraft bookings' : 'No upcoming bookings yet'}
              </h3>
              <p className="text-slate-600 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
                {isCleared
                  ? 'Request your first aircraft booking and the operations team will confirm it.'
                  : 'Your bookings will appear here once you have been cleared for aircraft booking.'}
              </p>
              {isCleared && (
                <Link
                  href="/dashboard/bookings/new"
                  className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">flight_takeoff</span>
                  Book a Flight
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingAircraft.map(b => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                const cfg      = STATUS_CFG[b.status]
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className={`block ${CARD} p-5 hover:border-blue-500/30 transition-all group`}
                  >
                    <div className="flex items-start justify-between gap-4">

                      {/* Left: icon + aircraft + reference + date/time */}
                      <div className="flex items-start gap-4 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg?.bg ?? 'bg-blue-500/10'} border ${cfg?.border ?? 'border-blue-500/20'}`}>
                          <span
                            className={`material-symbols-outlined text-[18px] ${cfg?.color ?? 'text-blue-400'}`}
                            style={{ fontVariationSettings: "'wght' 300" }}
                          >
                            {cfg?.icon ?? 'flight_takeoff'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                              Cessna 172N
                            </p>
                            {b.booking_reference && (
                              <span className="text-[10px] font-mono text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded">
                                {b.booking_reference}
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] font-medium text-slate-300 mt-1.5">
                            Registration {aircraft?.registration ?? 'VH-KZG'}
                          </p>
                          <p className="text-[12px] font-medium text-slate-300 mt-1">
                            {formatDateFromISO(b.scheduled_start)}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                            {formatSydTime(b.scheduled_start)} – {formatSydTime(b.scheduled_end)} Sydney time (AEST)
                          </p>
                          <p className="text-[10px] text-slate-700 mt-2">
                            Submitted {formatDateFromISO(b.created_at)}
                          </p>
                        </div>
                      </div>

                      {/* Right: badge + arrow (estimated price/hours hidden from customer) */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <StatusBadge status={b.status} bookingType={b.booking_type} checkoutOutcome={checkoutOutcomeMap[b.id]} />
                        <span className="material-symbols-outlined text-slate-600 group-hover:text-blue-400 text-base transition-colors mt-1">
                          arrow_forward
                        </span>
                      </div>

                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* Completed Flights ─────────────────────────────────────────────────────────── */}
        {completedFlights.length > 0 && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-4">
              Completed Flights
            </h3>
            <div className={`${CARD} overflow-hidden divide-y divide-white/[0.05]`}>
              {completedFlights.map(b => {
                const aircraft    = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-white/60 group-hover:text-white/80 transition-colors">
                          Cessna 172N
                        </p>
                        <span className="text-[10px] font-mono text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded">
                          {aircraft?.registration ?? 'VH-KZG'}
                        </span>
                        {b.booking_reference && (
                          <span className="text-[10px] font-mono text-slate-700">
                            {b.booking_reference}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                        {formatDateFromISO(b.scheduled_start)}{' · '}
                        {formatSydTime(b.scheduled_start)} – {formatSydTime(b.scheduled_end)} Sydney time (AEST)
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusBadge status={b.status} bookingType={b.booking_type} />
                      <span className="material-symbols-outlined text-slate-600 group-hover:text-slate-400 text-sm transition-colors">
                        arrow_forward
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Checkout History ──────────────────────────────────────────────────────────── */}
        {isCleared && checkoutRequests.length > 0 && (
          <section className="mt-10">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-4">
              Checkout History
            </h3>
            <div className={`${CARD} overflow-hidden divide-y divide-white/[0.05]`}>
              {checkoutRequests.map(b => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-white/60 group-hover:text-white/80 transition-colors">
                          Checkout Flight
                        </p>
                        {b.booking_reference && (
                          <span className="text-[10px] font-mono text-slate-700">
                            {b.booking_reference}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Cessna 172N · Registration {aircraft?.registration ?? 'VH-KZG'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Status: Completed and Approved
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="material-symbols-outlined text-[18px] text-slate-600" style={{ fontVariationSettings: "'wght' 300" }}>
                        history
                      </span>
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
