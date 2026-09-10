'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { scheduleRealtimeRouterRefresh } from '@/hooks/realtimeRefreshCoordinator'
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
  const router = useRouter()

  useRealtimeRefresh(ADMIN_OPS_EVENTS, {
    isRelevant: isAdminLayoutRefreshRelevant,
  })

  // Direct Supabase Postgres Changes fallback channel for admin
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('admin-ops-postgres-sync')
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_documents' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flight_records' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aircraft_flight_logs' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkout_change_requests' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_cancellation_requests' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_bank_transfer_submissions' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkout_bank_transfer_submissions' }, () => {
        scheduleRealtimeRouterRefresh(router, 300)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
