'use client'

import { useEffect } from 'react'
import { useRealtime } from '@/components/realtime/RealtimeProvider'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

/**
 * Join thread:{userId} while mounted; optionally refresh on chat events.
 * Set refresh=false when the parent already updates via client fetches
 * (e.g. AdminInbox) so we don't stack a full RSC refresh.
 */
export function useThreadRealtime(
  threadUserId: string | null | undefined,
  options: { refresh?: boolean } = {},
): void {
  const { socket, connected } = useRealtime()
  const refresh = options.refresh !== false

  useEffect(() => {
    if (!socket || !connected || !threadUserId) return
    socket.emit('join:thread', threadUserId)
    return () => {
      socket.emit('leave:thread', threadUserId)
    }
  }, [socket, connected, threadUserId])

  useRealtimeRefresh(refresh && threadUserId ? ['chat:message', 'chat:read'] : [])
}
