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
  checkout_requested:              { label: 'Checkout Requested',    cls: 'bg-blue-500/10 text-[#1a4fd6] border-blue-500/20'      },
  checkout_confirmed:              { label: 'Checkout Confirmed',    cls: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  checkout_completed_under_review: { label: 'Awaiting Outcome',      cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'   },
  checkout_payment_required:       { label: 'Payment Required',      cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20'},
  pending_confirmation:            { label: 'Pending Confirmation',  cls: 'bg-blue-500/10 text-[#1a4fd6] border-blue-500/20'      },
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
  const statusCfg = BOOKING_STATUS_BADGE[booking.status] ?? { label: booking.status, cls: 'bg-white/5 text-[#4b6390] border-[#152d5a]/10' }
  const reg = getAircraftReg(booking.aircraft)
  const scheduledStr = formatDateTime(booking.scheduled_start)
  const paymentLabel = PAYMENT_STATUS_LABEL[booking.payment_status] ?? booking.payment_status

  return (
    <Link
      href={`/admin/bookings/requests/${booking.id}`}
      className="group flex items-center justify-between gap-4 py-4 px-2 -mx-2 rounded-lg border-b border-[#152d5a]/8 last:border-0 hover:bg-[#f0f6ff] transition-colors"
    >
      <div className="flex items-center gap-4 min-w-0 flex-wrap">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border flex-shrink-0 ${statusCfg.cls}`}>
            {statusCfg.label}
          </span>
        {reg !== '—' && (
          <span className="text-[13px] font-semibold text-[#152d5a] flex-shrink-0">{reg}</span>
        )}
        <span className="flex items-center gap-1.5 text-[13px] text-[#4b6390]">
          <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 300" }}>calendar_today</span>
          {scheduledStr}
        </span>
        {booking.payment_status && booking.payment_status !== 'not_required' && (
          <span className="flex items-center gap-1.5 text-[13px] text-[#4b6390]">
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 300" }}>payments</span>
            {paymentLabel}
          </span>
        )}
      </div>
      <span className="material-symbols-outlined text-[16px] text-[#4b6390]/40 group-hover:text-[#1a4fd6] group-hover:translate-x-0.5 transition-all flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>
        arrow_forward
      </span>
    </Link>
  )
}

export default function CheckoutActivitySection({ checkoutBookings, standardBookings }: Props) {
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
          <div className="flex items-center gap-2 mb-4">
            <p className="text-[10px] text-[#4b6390] uppercase tracking-widest font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px] text-[#1a4fd6]" style={{ fontVariationSettings: "'wght' 300" }}>how_to_reg</span>
              Checkout Flights
            </p>
          </div>
          <div className="bg-white border border-[#152d5a]/8 rounded-xl px-6">
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
            <p className="text-[10px] text-[#4b6390] uppercase tracking-widest font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px] text-[#4b6390]" style={{ fontVariationSettings: "'wght' 300" }}>flight</span>
              Standard Bookings
            </p>
            <Link
              href="/admin/bookings/requests"
              className="text-[10px] uppercase tracking-widest font-bold text-[#4b6390] hover:text-[#152d5a] transition-colors"
            >
              View All →
            </Link>
          </div>
          <div className="bg-white border border-[#152d5a]/8 rounded-xl px-6">
            {standardBookings.map(b => (
              <BookingRow key={b.id} booking={b} isCheckout={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
