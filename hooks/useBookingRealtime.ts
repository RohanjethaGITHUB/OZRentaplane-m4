'use client'

import { useEffect } from 'react'
import { useRealtime } from '@/components/realtime/RealtimeProvider'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

/**
 * Join booking:{id} while mounted; refresh on booking/payment/flight-record events.
 */
export function useBookingRealtime(bookingId: string | null | undefined): void {
  const { socket, connected } = useRealtime()

  useEffect(() => {
    if (!socket || !connected || !bookingId) return
    socket.emit('join:booking', bookingId)
    return () => {
      socket.emit('leave:booking', bookingId)
    }
  }, [socket, connected, bookingId])

  useRealtimeRefresh(
    bookingId
      ? ['booking:status', 'payment:updated', 'flight_record:updated']
      : [],
  )
}
