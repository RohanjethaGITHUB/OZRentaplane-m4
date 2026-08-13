'use client'

import { useThreadRealtime } from '@/hooks/useThreadRealtime'

/** Client island for chat panels / inbox thread views. */
export function ThreadRealtimeListener({
  threadUserId,
  refresh = true,
}: {
  threadUserId: string
  /** When false, only joins the thread room (no router.refresh). */
  refresh?: boolean
}) {
  useThreadRealtime(threadUserId, { refresh })
  return null
}
