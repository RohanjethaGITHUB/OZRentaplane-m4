import Link from 'next/link'
import { formatDateTime } from '@/lib/formatDateTime'
import { PAYF_RATE_PER_HOUR } from '@/lib/pricing-constants'

type BookingSummary = {
  id: string
  status: string
  booking_type: string
  checkout_lifecycle_status?: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  payment_status: string
  aircraft: { id: string; registration: string } | { id: string; registration: string }[] | null
}

type ActiveBlockTimeSummary = {
  hoursRemaining: number
  ratePerHour: number
  expiresAt: string
} | null

type Props = {
  checkoutBookings: BookingSummary[]
  standardBookings: BookingSummary[]
  activeBlockTime: ActiveBlockTimeSummary
}

const BOOKING_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  cancellation_requested:          { label: 'Cancellation Requested', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  checkout_requested:              { label: 'Checkout Requested',    cls: 'bg-blue-500/10 text-[#1a4fd6] border-blue-500/20'      },
  checkout_confirmed:              { label: 'Checkout Confirmed',    cls: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  checkout_completed_under_review: { label: 'Awaiting Outcome',      cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'   },
  checkout_payment_required:       { label: 'Payment Required',      cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20'},
  pending_confirmation:            { label: 'Pending Confirmation',  cls: 'bg-blue-500/10 text-[#1a4fd6] border-blue-500/20'      },
  payment_pending:                 { label: 'Awaiting Payment',      cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20'},
  on_hold_pending_documents:       { label: 'On Hold',               cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'    },
  confirmed:                       { label: 'Confirmed',             cls: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  ready_for_dispatch:              { label: 'Ready for Dispatch',    cls: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  dispatched:                      { label: 'Dispatched',            cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  awaiting_flight_record:          { label: 'Awaiting Flight Record',cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'   },
  flight_record_overdue:           { label: 'Record Overdue',        cls: 'bg-red-500/10 text-red-400 border-red-500/20'         },
  pending_post_flight_review:      { label: 'Post-Flight Review',    cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20'},
  post_flight_approved:            { label: 'Flight Approved',       cls: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  cancelled:                       { label: 'Cancelled',             cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20'      },
  completed:                       { label: 'Completed',             cls: 'bg-white/5 text-[#4b6390] border-[#152d5a]/10'            },
}

const BOOKING_TYPE_LABEL: Record<string, string> = {
  checkout: 'Checkout',
  standard: 'Standard',
}

function prettyStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getAircraftReg(aircraft: BookingSummary['aircraft']): string {
  if (!aircraft) return '—'
  if (Array.isArray(aircraft)) return aircraft[0]?.registration ?? '—'
  return aircraft.registration
}

function getFlightTimingLabel(booking: BookingSummary): string {
  const start = booking.scheduled_start ? new Date(booking.scheduled_start) : null
  const end = booking.scheduled_end ? new Date(booking.scheduled_end) : null
  const now = new Date()

  if (start && end) {
    if (now < start) {
      const daysUntil = Math.max(0, Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      return daysUntil === 0 ? 'Flight is today' : `${daysUntil} day${daysUntil === 1 ? '' : 's'} until flight`
    }
    if (now >= start && now <= end) return 'In progress'
    return 'Completed'
  }

  if (start) return 'Flight date set'
  return 'Schedule pending'
}

function formatDateTimeParts(booking: BookingSummary): { start: string; end: string } {
  return {
    start: booking.scheduled_start ? formatDateTime(booking.scheduled_start) : '—',
    end: booking.scheduled_end ? formatDateTime(booking.scheduled_end) : '—',
  }
}

function getLifecycleLabel(booking: BookingSummary): string {
  if (booking.booking_type === 'checkout' && booking.checkout_lifecycle_status === 'reschedule_requested') {
    return 'Reschedule Requested'
  }
  if (booking.status === 'cancellation_requested') {
    return 'Cancellation Requested'
  }
  return BOOKING_STATUS_BADGE[booking.status]?.label ?? prettyStatus(booking.status)
}

function getPrimaryStatusBadge(booking: BookingSummary): { label: string; cls: string } {
  if (booking.booking_type === 'checkout' && booking.checkout_lifecycle_status === 'reschedule_requested') {
    return { label: 'Reschedule Requested', cls: 'bg-amber-500/10 text-amber-700 border-amber-500/25' }
  }
  if (booking.status === 'cancellation_requested') {
    return { label: 'Cancellation Requested', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20' }
  }
  return BOOKING_STATUS_BADGE[booking.status] ?? { label: booking.status, cls: 'bg-white/5 text-[#4b6390] border-[#152d5a]/10' }
}

function getCheckoutLifecycleLabel(booking: BookingSummary): string | null {
  if (booking.booking_type !== 'checkout') return null
  if (!booking.checkout_lifecycle_status) return null
  if (booking.checkout_lifecycle_status === booking.status) return null
  // Already surfaced as the primary badge
  if (booking.checkout_lifecycle_status === 'reschedule_requested') {
    return 'Approve or reject the requested new time'
  }
  return prettyStatus(booking.checkout_lifecycle_status)
}

function BookingRow({
  booking,
  activeBlockTime,
}: {
  booking: BookingSummary
  activeBlockTime: ActiveBlockTimeSummary
}) {
  const statusCfg = getPrimaryStatusBadge(booking)
  const reg = getAircraftReg(booking.aircraft)
  const windowParts = formatDateTimeParts(booking)
  const timingLabel = getFlightTimingLabel(booking)
  const typeLabel = BOOKING_TYPE_LABEL[booking.booking_type] ?? prettyStatus(booking.booking_type)
  const billingLabel = activeBlockTime
    ? `Block Time — $${activeBlockTime.ratePerHour.toFixed(2)}/hr`
    : `Pay As You Fly — $${PAYF_RATE_PER_HOUR}/hr`
  const billingNote = activeBlockTime
    ? `Current package status; may change before flight finalization. Active package: ${activeBlockTime.hoursRemaining.toFixed(1)}h remaining, expires ${formatDateTime(activeBlockTime.expiresAt)}.`
    : 'Current package status; may change before flight finalization.'
  const checkoutLifecycleLabel = getCheckoutLifecycleLabel(booking)

  return (
    <Link
      href={`/admin/bookings/requests/${booking.id}`}
      className="group block py-4 px-2 -mx-2 rounded-lg border-b border-[#152d5a]/8 last:border-0 hover:bg-[#f0f6ff] transition-colors"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-[#152d5a]/12 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#152d5a]">
              {typeLabel}
            </span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border flex-shrink-0 ${statusCfg.cls}`}>
              {statusCfg.label}
            </span>
            <span className="inline-flex items-center rounded-full border border-[#1a4fd6]/15 bg-[#f0f6ff] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1a4fd6]">
              {timingLabel}
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {reg !== '—' && (
                <span className="text-[15px] font-semibold text-[#152d5a] flex-shrink-0">{reg}</span>
              )}
            </div>

            <div className="rounded-xl border border-[#1a4fd6]/15 bg-[#f7faff] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b6390]">Flight window</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[#1a4fd6]/15 bg-white px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b6390]">Departure</p>
                  <p className="mt-1 text-[14px] font-semibold text-[#152d5a] leading-snug">{windowParts.start}</p>
                </div>
                <div className="rounded-lg border border-[#1a4fd6]/15 bg-white px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b6390]">Return</p>
                  <p className="mt-1 text-[14px] font-semibold text-[#152d5a] leading-snug">{windowParts.end}</p>
                </div>
              </div>
              <p className="mt-2 text-[12px] text-[#4b6390]">Sydney time (AEST).</p>
            </div>

            <div className="space-y-1.5 pt-1">
              <p className="text-[13px] font-medium text-[#152d5a]">{billingLabel}</p>
              <p className="text-[11px] text-[#4b6390] leading-relaxed">{billingNote}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 md:min-w-[164px] md:flex-col md:items-end md:justify-center">
          <div className="min-w-[164px] rounded-xl border border-[#152d5a]/10 bg-white px-3 py-2 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b6390] mb-1">Status</p>
            <p className="text-[13px] font-semibold text-[#152d5a]">
              {getLifecycleLabel(booking)}
            </p>
            {checkoutLifecycleLabel ? (
              <p className="mt-1 text-[11px] text-[#4b6390]">
                Checkout lifecycle: {checkoutLifecycleLabel}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-[#4b6390]">
                Booking lifecycle
              </p>
            )}
          </div>
          <span className="material-symbols-outlined hidden md:block text-[16px] text-[#4b6390]/40 group-hover:text-[#1a4fd6] group-hover:translate-x-0.5 transition-all flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>
            arrow_forward
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function CheckoutActivitySection({ checkoutBookings, standardBookings, activeBlockTime }: Props) {
  const hasCheckout  = checkoutBookings.length > 0
  const hasStandard  = standardBookings.length > 0

  if (!hasCheckout && !hasStandard) {
    return (
      <div className="bg-white border border-[#152d5a]/8 rounded-xl p-10 text-center text-[#4b6390] text-[14px] font-light">
        No booking activity on record for this customer.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Checkout bookings */}
      {hasCheckout && (
        <div>
          <div className="mb-4">
            <p className="text-[10px] text-[#4b6390] uppercase tracking-widest font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px] text-[#1a4fd6]" style={{ fontVariationSettings: "'wght' 300" }}>how_to_reg</span>
              Checkout Flights
            </p>
            <h3 className="mt-1 text-[16px] font-semibold text-[#152d5a]">Checkout bookings</h3>
          </div>
          <div className="bg-white border border-[#152d5a]/8 rounded-xl px-6">
            {checkoutBookings.map(b => (
              <BookingRow key={b.id} booking={b} activeBlockTime={activeBlockTime} />
            ))}
          </div>
        </div>
      )}

      {/* Standard bookings */}
      {hasStandard && (
        <div>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] text-[#4b6390] uppercase tracking-widest font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px] text-[#4b6390]" style={{ fontVariationSettings: "'wght' 300" }}>flight</span>
                Standard Bookings
              </p>
              <h3 className="mt-1 text-[16px] font-semibold text-[#152d5a]">Standard booking rows</h3>
            </div>
            <Link
              href="/admin/bookings/requests"
              className="mt-1 text-[10px] uppercase tracking-widest font-bold text-[#4b6390] hover:text-[#152d5a] transition-colors"
            >
              View All →
            </Link>
          </div>
          <div className="bg-white border border-[#152d5a]/8 rounded-xl px-6">
            {standardBookings.map(b => (
              <BookingRow key={b.id} booking={b} activeBlockTime={activeBlockTime} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
