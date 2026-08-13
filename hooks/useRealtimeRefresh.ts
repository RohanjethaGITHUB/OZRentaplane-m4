'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useRealtime } from '@/components/realtime/RealtimeProvider'
import type { RealtimeEventType } from '@/lib/realtime/events'
import {
  REALTIME_REFRESH_DEBOUNCE_MS,
  scheduleRealtimeRouterRefresh,
} from '@/hooks/realtimeRefreshCoordinator'

export type RealtimeRefreshOptions = {
  debounceMs?: number
  /** Return false to skip a full RSC refresh for this event on the current path. */
  isRelevant?: (type: RealtimeEventType, pathname: string) => boolean
}

/**
 * Debounced, coalesced router.refresh() when listed realtime events arrive.
 * Multiple hook instances share one refresh timer (layout + page listeners
 * no longer stack into repeated full RSC remounts).
 */
export function useRealtimeRefresh(
  eventTypes: RealtimeEventType[],
  options: RealtimeRefreshOptions = {},
): void {
  const router = useRouter()
  const pathname = usePathname()
  const { socket, connected } = useRealtime()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  const debounceMs = options.debounceMs ?? REALTIME_REFRESH_DEBOUNCE_MS
  const isRelevantRef = useRef(options.isRelevant)
  isRelevantRef.current = options.isRelevant

  const typesKey = eventTypes.slice().sort().join('|')

  const scheduleRefresh = useCallback(
    (type: RealtimeEventType) => {
      const path = pathnameRef.current ?? ''
      if (isRelevantRef.current && !isRelevantRef.current(type, path)) return
      scheduleRealtimeRouterRefresh(router, debounceMs)
    },
    [router, debounceMs],
  )

  useEffect(() => {
    if (!socket || !connected || eventTypes.length === 0) return

    const handlers = eventTypes.map((type) => {
      const listener = () => scheduleRefresh(type)
      socket.on(type, listener as never)
      return { type, listener }
    })

    return () => {
      for (const { type, listener } of handlers) {
        socket.off(type, listener as never)
      }
    }
    // typesKey captures eventTypes content without array identity churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, connected, typesKey, scheduleRefresh])
}
