'use client'

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import type { RealtimeEventType } from '@/lib/realtime/events'
import { isCustomerLayoutRefreshRelevant } from '@/lib/realtime/refreshRelevance'

/** Domain events that may need a full page RSC refresh (not chat — soft badge). */
const DASHBOARD_EVENTS: RealtimeEventType[] = [
  'booking:status',
  'payment:updated',
  'verification:updated',
  'flight_record:updated',
  'block_time:updated',
  'ledger:updated',
  'clearance:updated',
  'ops:queue',
]

/** Invisible island — path-aware refresh; chat badges soft-sync in the nav. */
export function DashboardRealtimeListener() {
  useRealtimeRefresh(DASHBOARD_EVENTS, {
    isRelevant: isCustomerLayoutRefreshRelevant,
  })
  return null
}
