'use client'

/**
 * P3 calendar refresh — AdminRealtimeListener already covers ops/booking events
 * at layout level. This island exists if a page needs an explicit local refresh
 * without relying on layout (e.g. if calendar is ever moved outside admin layout).
 */
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

export function CalendarRealtimeListener() {
  useRealtimeRefresh(['ops:queue', 'ops:counts', 'booking:status'])
  return null
}
