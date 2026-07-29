'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtime } from '@/components/realtime/RealtimeProvider'
import type { RealtimeEventType } from '@/lib/realtime/events'

const DEFAULT_DEBOUNCE_MS = 400

/**
 * Debounced router.refresh() when any of the listed realtime events arrive.
 */
export function useRealtimeRefresh(
  eventTypes: RealtimeEventType[],
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): void {
  const router = useRouter()
  const { socket, connected } = useRealtime()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typesKey = eventTypes.slice().sort().join('|')

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      router.refresh()
    }, debounceMs)
  }, [router, debounceMs])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!socket || !connected || eventTypes.length === 0) return

    const listener = () => scheduleRefresh()
    for (const type of eventTypes) {
      socket.on(type, listener as never)
    }

    return () => {
      for (const type of eventTypes) {
        socket.off(type, listener as never)
      }
    }
    // typesKey captures eventTypes content without array identity churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, connected, typesKey, scheduleRefresh])
}
