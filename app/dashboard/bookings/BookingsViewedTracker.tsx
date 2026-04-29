'use client'

import { useEffect } from 'react'
import { markBookingsViewed } from '@/app/actions/auth-tracking'

// Fires once on mount to advance last_bookings_viewed_at so the My Bookings
// badge in the portal nav resets after the customer opens this page.
export default function BookingsViewedTracker() {
  useEffect(() => {
    markBookingsViewed()
  }, [])
  return null
}
