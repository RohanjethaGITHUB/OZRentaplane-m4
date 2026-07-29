'use client'

import { useBookingRealtime } from '@/hooks/useBookingRealtime'

/** Client island for RSC booking detail pages. */
export function BookingRealtimeListener({ bookingId }: { bookingId: string }) {
  useBookingRealtime(bookingId)
  return null
}
