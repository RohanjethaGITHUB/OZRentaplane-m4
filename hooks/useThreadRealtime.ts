'use client'

import { useEffect } from 'react'
import { useRealtime } from '@/components/realtime/RealtimeProvider'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

/**
 * Join thread:{userId} while mounted; refresh on chat events for that thread.
 */
export function useThreadRealtime(threadUserId: string | null | undefined): void {
  const { socket, connected } = useRealtime()

  useEffect(() => {
    if (!socket || !connected || !threadUserId) return
    socket.emit('join:thread', threadUserId)
    return () => {
      socket.emit('leave:thread', threadUserId)
    }
  }, [socket, connected, threadUserId])

  useRealtimeRefresh(threadUserId ? ['chat:message', 'chat:read'] : [])
}
