'use client'

import Link from 'next/link'
import CheckoutChangeActions from '@/app/dashboard/checkout/CheckoutChangeActions'
import CustomerBookingActions from './[id]/CustomerBookingActions'

const CANCELLABLE_STATUSES = ['confirmed', 'pending_confirmation', 'ready_for_dispatch', 'dispatched']

type RescheduleRequestLite = {
  id: string
  status: string
  requested_scheduled_start: string | null
  requested_scheduled_end: string | null
}

type Props = {
  booking: {
    id: string
    booking_type: string
    status: string
    scheduled_start: string
    checkout_lifecycle_status?: string | null
    aircraft_id?: string | null
  }
  pendingRescheduleRequest: RescheduleRequestLite | null
  latestRescheduleRequest: RescheduleRequestLite | null
}

export default function UpcomingBookingActions({
  booking,
  pendingRescheduleRequest,
  latestRescheduleRequest,
}: Props) {
  const isCheckout = booking.booking_type === 'checkout'
  const msUntilDeparture = new Date(booking.scheduled_start).getTime() - Date.now()
  const isWithin24Hours = msUntilDeparture <= 24 * 60 * 60 * 1000
  const departureSydney = new Date(booking.scheduled_start).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const showCancelButton =
    !isCheckout && CANCELLABLE_STATUSES.includes(booking.status)

  return (
    <div className="flex flex-col gap-2 p-4 justify-center border-l border-[#152d5a]/[0.07] w-[180px] flex-shrink-0">
      <Link
        href={`/dashboard/bookings/${booking.id}`}
        className="flex items-center justify-between whitespace-nowrap bg-[#152d5a] hover:bg-[#1a3a6e] text-white text-[13px] font-bold px-4 py-2.5 rounded-xl transition-colors"
      >
        VIEW DETAILS
        <span className="material-symbols-outlined text-[16px] ml-2">chevron_right</span>
      </Link>

      {isCheckout && booking.aircraft_id ? (
        <CheckoutChangeActions
          variant="listCard"
          checkout={{
            id: booking.id,
            booking_type: booking.booking_type,
            status: booking.status,
            scheduled_start: booking.scheduled_start,
            checkout_lifecycle_status: booking.checkout_lifecycle_status ?? null,
          }}
          aircraftId={booking.aircraft_id}
          pendingRescheduleRequest={pendingRescheduleRequest}
          latestRescheduleRequest={latestRescheduleRequest}
        />
      ) : (
        <>
          <Link
            href={`/dashboard/bookings/${booking.id}`}
            className="flex items-center justify-center whitespace-nowrap border border-[#152d5a]/20 text-[#152d5a] hover:bg-[#f0f6ff] text-[11px] font-bold tracking-[0.08em] uppercase px-4 py-2 rounded-xl transition-colors"
          >
            Modify Booking
          </Link>
          {showCancelButton && (
            <CustomerBookingActions
              variant="listCard"
              bookingId={booking.id}
              showCancelButton
              showFlightRecordButton={false}
              isWithin24Hours={isWithin24Hours}
              departureSydney={departureSydney}
            />
          )}
        </>
      )}
    </div>
  )
}
