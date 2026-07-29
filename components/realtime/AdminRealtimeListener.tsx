'use client'

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import type { RealtimeEventType } from '@/lib/realtime/events'

const ADMIN_OPS_EVENTS: RealtimeEventType[] = [
  'ops:counts',
  'ops:queue',
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

/** Invisible island — refreshes admin layout/pages on ops + shared events. */
export function AdminRealtimeListener() {
  useRealtimeRefresh(ADMIN_OPS_EVENTS)
  return null
}
