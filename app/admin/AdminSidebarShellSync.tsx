'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import AdminSidebar from '@/app/admin/AdminSidebar'
import { getAdminShellBadges, getAdminUnreadCount } from '@/app/actions/admin'
import { useRealtime } from '@/components/realtime/RealtimeProvider'
import type { RealtimeEventType } from '@/lib/realtime/events'

type Props = {
  displayName: string
  unreadMessageCount?: number
  actionCounts?: Record<string, number>
}

/** Stable empty object — default `= {}` would create a new ref every render and loop. */
const EMPTY_COUNTS: Record<string, number> = {}

/** Events that can change sidebar action/booking/checkout queue badges. */
const BADGE_REFRESH_EVENTS: RealtimeEventType[] = [
  'ops:counts',
  'ops:queue',
  'booking:status',
  'payment:updated',
  'verification:updated',
  'flight_record:updated',
  'clearance:updated',
  'block_time:updated',
  'ledger:updated',
]

function countsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false
  }
  return true
}

/**
 * Keeps sidebar badges live via lightweight server actions instead of
 * router.refresh() on every ops event.
 */
export default function AdminSidebarShellSync({
  displayName,
  unreadMessageCount = 0,
  actionCounts,
}: Props) {
  const { socket, connected } = useRealtime()
  const incomingCounts = actionCounts ?? EMPTY_COUNTS
  const [unread, setUnread] = useState(unreadMessageCount)
  const [counts, setCounts] = useState(incomingCounts)
  const badgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unreadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)

  const applyBadges = useCallback((next: {
    unreadMessageCount: number
    actionCounts: Record<string, number>
  }) => {
    setUnread((prev) => (prev === next.unreadMessageCount ? prev : next.unreadMessageCount))
    setCounts((prev) => (countsEqual(prev, next.actionCounts) ? prev : next.actionCounts))
  }, [])

  const refreshBadges = useCallback((delayMs = 400) => {
    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current)
    badgeTimerRef.current = setTimeout(() => {
      if (inFlightRef.current) return
      inFlightRef.current = true
      void getAdminShellBadges()
        .then(applyBadges)
        .catch(() => {
          /* non-critical — keep last known badges */
        })
        .finally(() => {
          inFlightRef.current = false
        })
    }, delayMs)
  }, [applyBadges])

  const refreshUnread = useCallback((delayMs = 350) => {
    if (unreadTimerRef.current) clearTimeout(unreadTimerRef.current)
    unreadTimerRef.current = setTimeout(() => {
      void getAdminUnreadCount()
        .then((next) => setUnread((prev) => (prev === next ? prev : next)))
        .catch(() => {
          /* non-critical */
        })
    }, delayMs)
  }, [])

  // Sync from server props when layout re-fetches (without clobbering equal values).
  useEffect(() => {
    setUnread((prev) => (prev === unreadMessageCount ? prev : unreadMessageCount))
  }, [unreadMessageCount])

  useEffect(() => {
    setCounts((prev) => (countsEqual(prev, incomingCounts) ? prev : incomingCounts))
  }, [incomingCounts])

  // Re-fetch when tab becomes visible again (covers missed realtime while hidden).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') refreshBadges(200)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refreshBadges])

  useEffect(() => {
    return () => {
      if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current)
      if (unreadTimerRef.current) clearTimeout(unreadTimerRef.current)
    }
  }, [])

  // Soft-update badges on any ops-related realtime event (not only ops:counts).
  useEffect(() => {
    if (!socket || !connected) return

    const onBadgeEvent = () => refreshBadges(450)
    const onChatEvent = () => refreshUnread(300)

    for (const type of BADGE_REFRESH_EVENTS) {
      socket.on(type, onBadgeEvent as never)
    }
    socket.on('chat:message', onChatEvent as never)
    socket.on('chat:read', onChatEvent as never)

    return () => {
      for (const type of BADGE_REFRESH_EVENTS) {
        socket.off(type, onBadgeEvent as never)
      }
      socket.off('chat:message', onChatEvent as never)
      socket.off('chat:read', onChatEvent as never)
    }
  }, [socket, connected, refreshBadges, refreshUnread])

  return (
    <AdminSidebar
      displayName={displayName}
      unreadMessageCount={unread}
      actionCounts={counts}
    />
  )
}
