'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { scheduleRealtimeRouterRefresh } from '@/hooks/realtimeRefreshCoordinator'
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
  const router = useRouter()

  useRealtimeRefresh(DASHBOARD_EVENTS, {
    isRelevant: isCustomerLayoutRefreshRelevant,
  })

  // Direct Supabase Postgres Changes fallback channel so updates are instant even if socket server is offline
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('dashboard-customer-postgres-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkout_invoices' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_invoices' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_events' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pilot_block_time_purchases' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pilot_block_time_usage' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_payment_ledger' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
