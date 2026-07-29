'use client'

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import type { RealtimeEventType } from '@/lib/realtime/events'

const DASHBOARD_EVENTS: RealtimeEventType[] = [
  'chat:message',
  'chat:read',
  'booking:status',
  'payment:updated',
  'verification:updated',
  'flight_record:updated',
  'block_time:updated',
  'ledger:updated',
  'clearance:updated',
]

/** Invisible island — refreshes customer dashboard shell on user-room events. */
export function DashboardRealtimeListener() {
  useRealtimeRefresh(DASHBOARD_EVENTS)
  return null
}
