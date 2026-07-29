'use client'

import { useThreadRealtime } from '@/hooks/useThreadRealtime'

/** Client island for chat panels / inbox thread views. */
export function ThreadRealtimeListener({ threadUserId }: { threadUserId: string }) {
  useThreadRealtime(threadUserId)
  return null
}
