'use client'

import { useEffect, useRef } from 'react'
import { useRealtime } from '@/components/realtime/RealtimeProvider'
import type { RealtimeEvent, RealtimeEventType } from '@/lib/realtime/events'

/**
 * Subscribe to a typed realtime event. Cleans up on unmount / socket change.
 */
export function useRealtimeEvent<T extends RealtimeEventType>(
  eventType: T,
  handler: (event: Extract<RealtimeEvent, { type: T }>) => void,
  deps: unknown[] = [],
): void {
  const { socket } = useRealtime()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!socket) return

    const listener = (event: Extract<RealtimeEvent, { type: T }>) => {
      handlerRef.current(event)
    }

    socket.on(eventType, listener as never)
    return () => {
      socket.off(eventType, listener as never)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, eventType, ...deps])
}
