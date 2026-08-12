'use client'

import { useEffect } from 'react'
import { markBookingsViewed } from '@/app/actions/auth-tracking'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

// Fires once on mount to advance last_bookings_viewed_at so the My Bookings
// badge in the portal nav resets after the customer opens this page.
// Also refreshes the list when payment / booking realtime events arrive.
export default function BookingsViewedTracker() {
  useEffect(() => {
    markBookingsViewed()
  }, [])

  useRealtimeRefresh(['booking:status', 'payment:updated', 'ops:queue'])

  return null
}
