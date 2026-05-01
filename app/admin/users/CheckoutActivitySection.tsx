import Link from 'next/link'
import { formatDateTime } from '@/lib/formatDateTime'

type BookingSummary = {
  id: string
  status: string
  booking_type: string
  scheduled_start: string | null
  payment_status: string
  aircraft: { id: string; registration: string } | { id: string; registration: string }[] | null
}

type Props = {
  checkoutBookings: BookingSummary[]
  standardBookings: BookingSummary[]
}

const BOOKING_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  checkout_requested:              { label: 'Checkout Requested',    cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20'      },
  checkout_confirmed:              { label: 'Checkout Confirmed',    cls: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  checkout_completed_under_review: { label: 'Awaiting Outcome',      cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'   },
  checkout_payment_required:       { label: 'Payment Required',      cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20'},
  pending_confirmation:            { label: 'Pending Confirmation',  cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20'      },
  confirmed:                       { label: 'Confirmed',             cls: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  ready_for_dispatch:              { label: 'Ready for Dispatch',    cls: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  dispatched:                      { label: 'Dispatched',            cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  awaiting_flight_record:          { label: 'Awaiting Flight Record',cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'   },
  flight_record_overdue:           { label: 'Record Overdue',        cls: 'bg-red-500/10 text-red-400 border-red-500/20'         },
  pending_post_flight_review:      { label: 'Post-Flight Review',    cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20'},
  post_flight_approved:            { label: 'Flight Approved',       cls: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  cancelled:                       { label: 'Cancelled',             cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20'      },
  completed:                       { label: 'Completed',             cls: 'bg-white/5 text-slate-400 border-white/10'            },
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  not_required:    'Not Required',
  not_started:     'Not Started',
  deposit_required:'Deposit Required',
  deposit_paid:    'Deposit Paid',
  hold_placed:     'Hold Placed',
  final_pending:   'Final Pending',
  invoice_generated:'Invoice Generated',
  paid:            'Paid',
}

function getAircraftReg(aircraft: BookingSummary['aircraft']): string {
  if (!aircraft) return '—'
  if (Array.isArray(aircraft)) return aircraft[0]?.registration ?? '—'
  return aircraft.registration
}

function BookingRow({ booking, isCheckout }: { booking: BookingSummary; isCheckout: boolean }) {
  const statusCfg = BOOKING_STATUS_BADGE[booking.status] ?? { label: booking.status, cls: 'bg-white/5 text-slate-400 border-white/10' }
  const reg = getAircraftReg(booking.aircraft)
  const scheduledStr = formatDateTime(booking.scheduled_start)
  const paymentLabel = PAYMENT_STATUS_LABEL[booking.payment_status] ?? booking.payment_status

  const detailHref = isCheckout
    ? `/admin/bookings/requests/${booking.id}`
    : `/admin/bookings/requests/${booking.id}`

  return (
    <div className="flex items-center gap-4 py-4 border-b border-white/5 last:border-0 flex-wrap">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusCfg.cls}`}>
            {statusCfg.label}
          </span>
          <span className="text-[10px] text-slate-600 uppercase tracking-wider">
            {reg !== '—' ? `· ${reg}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'wght' 300" }}>calendar_today</span>
            {scheduledStr}
          </span>
          {booking.payment_status && booking.payment_status !== 'not_required' && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'wght' 300" }}>payments</span>
              {paymentLabel}
            </span>
          )}
        </div>
      </div>
      <Link
        href={detailHref}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-300/15 text-slate-400 hover:text-white hover:border-blue-300/30 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex-shrink-0"
      >
        View
        <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'wght' 300" }}>arrow_forward</span>
      </Link>
    </div>
  )
}

export default function CheckoutActivitySection({ checkoutBookings, standardBookings }: Props) {
  const hasCheckout  = checkoutBookings.length > 0
  const hasStandard  = standardBookings.length > 0

  if (!hasCheckout && !hasStandard) {
    return (
      <div className="bg-[#1e2023]/60 border border-white/5 rounded-xl p-10 text-center text-slate-500 text-sm font-light">
        No booking activity on record for this customer.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Checkout bookings */}
      {hasCheckout && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-blue-400" style={{ fontVariationSettings: "'wght' 300" }}>how_to_reg</span>
              Checkout Flights
            </p>
            <Link
              href="/admin/bookings/checkout"
              className="text-[10px] uppercase tracking-widest font-bold text-slate-500 hover:text-white transition-colors"
            >
              View All →
            </Link>
          </div>
          <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-xl px-6">
            {checkoutBookings.map(b => (
              <BookingRow key={b.id} booking={b} isCheckout />
            ))}
          </div>
        </div>
      )}

      {/* Standard bookings */}
      {hasStandard && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-slate-400" style={{ fontVariationSettings: "'wght' 300" }}>flight</span>
              Standard Bookings
            </p>
            <Link
              href="/admin/bookings/requests"
              className="text-[10px] uppercase tracking-widest font-bold text-slate-500 hover:text-white transition-colors"
            >
              View All →
            </Link>
          </div>
          <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-xl px-6">
            {standardBookings.map(b => (
              <BookingRow key={b.id} booking={b} isCheckout={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
