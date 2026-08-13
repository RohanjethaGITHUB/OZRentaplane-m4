'use client'

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import type { RealtimeEventType } from '@/lib/realtime/events'
import { isAdminLayoutRefreshRelevant } from '@/lib/realtime/refreshRelevance'

/**
 * Domain/queue events that need page content refresh on relevant routes.
 * ops:counts + chat are soft-synced into the sidebar (see AdminSidebarShellSync).
 */
const ADMIN_OPS_EVENTS: RealtimeEventType[] = [
  'ops:queue',
  'booking:status',
  'payment:updated',
  'verification:updated',
  'flight_record:updated',
  'block_time:updated',
  'ledger:updated',
  'clearance:updated',
]

/** Invisible island — path-aware refresh; badge-only events soft-sync. */
export function AdminRealtimeListener() {
  useRealtimeRefresh(ADMIN_OPS_EVENTS, {
    isRelevant: isAdminLayoutRefreshRelevant,
  })
  return null
}
