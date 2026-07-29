import type { RealtimeEvent } from '@/lib/realtime/events'
import { REALTIME_ROOMS } from '@/lib/realtime/events'

/**
 * Fire-and-forget emit to the dedicated Socket.io process via HTTP bridge.
 * Never throws — socket downtime must not break mutations.
 */
export async function emitRealtime(event: RealtimeEvent, rooms: string[]): Promise<void> {
  const uniqueRooms = Array.from(new Set(rooms.filter(Boolean)))
  if (uniqueRooms.length === 0) return

  const socketUrl = process.env.SOCKET_URL
  const secret = process.env.SOCKET_EMIT_SECRET

  if (!socketUrl || !secret) {
    // Feature off / misconfigured — silent no-op (not an error in local without realtime)
    return
  }

  try {
    const base = socketUrl.replace(/\/$/, '')
    const res = await fetch(`${base}/internal/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-socket-emit-secret': secret,
      },
      body: JSON.stringify({ event, rooms: uniqueRooms }),
      // Avoid hanging mutations if socket server is slow/down
      signal: AbortSignal.timeout(2500),
    })

    if (!res.ok) {
      console.warn(
        `[realtime] emit failed (${res.status}) for ${event.type} → ${uniqueRooms.join(', ')}`,
      )
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`[realtime] emit ok ${event.type} → ${uniqueRooms.join(', ')}`)
    }
  } catch (err) {
    console.warn(`[realtime] emit error for ${event.type}:`, err instanceof Error ? err.message : err)
  }
}

export async function emitChatMessage(threadUserId: string, eventId?: string): Promise<void> {
  await emitRealtime(
    { type: 'chat:message', threadUserId, eventId },
    [
      REALTIME_ROOMS.thread(threadUserId),
      REALTIME_ROOMS.user(threadUserId),
      REALTIME_ROOMS.adminOps(),
    ],
  )
}

export async function emitChatRead(threadUserId: string): Promise<void> {
  await emitRealtime(
    { type: 'chat:read', threadUserId },
    [
      REALTIME_ROOMS.thread(threadUserId),
      REALTIME_ROOMS.user(threadUserId),
      REALTIME_ROOMS.adminOps(),
    ],
  )
}

export async function emitOpsChanged(): Promise<void> {
  await emitRealtime({ type: 'ops:counts' }, [REALTIME_ROOMS.adminOps()])
  await emitRealtime({ type: 'ops:queue' }, [REALTIME_ROOMS.adminOps()])
}

export async function emitBookingChanged(params: {
  bookingId: string
  userId: string
}): Promise<void> {
  const { bookingId, userId } = params
  await emitRealtime(
    { type: 'booking:status', bookingId, userId },
    [
      REALTIME_ROOMS.booking(bookingId),
      REALTIME_ROOMS.user(userId),
      REALTIME_ROOMS.adminOps(),
    ],
  )
}

export async function emitPaymentUpdated(params: {
  userId: string
  bookingId?: string
  invoiceId?: string
}): Promise<void> {
  const { userId, bookingId, invoiceId } = params
  const rooms: string[] = [REALTIME_ROOMS.user(userId), REALTIME_ROOMS.adminOps()]
  if (bookingId) rooms.push(REALTIME_ROOMS.booking(bookingId))
  await emitRealtime(
    { type: 'payment:updated', userId, bookingId, invoiceId },
    rooms,
  )
}

export async function emitVerificationUpdated(userId: string): Promise<void> {
  await emitRealtime(
    { type: 'verification:updated', userId },
    [REALTIME_ROOMS.user(userId), REALTIME_ROOMS.adminOps()],
  )
}

export async function emitFlightRecordUpdated(params: {
  bookingId: string
  userId: string
}): Promise<void> {
  const { bookingId, userId } = params
  await emitRealtime(
    { type: 'flight_record:updated', bookingId, userId },
    [
      REALTIME_ROOMS.booking(bookingId),
      REALTIME_ROOMS.user(userId),
      REALTIME_ROOMS.adminOps(),
    ],
  )
}

export async function emitBlockTimeUpdated(userId: string): Promise<void> {
  await emitRealtime(
    { type: 'block_time:updated', userId },
    [REALTIME_ROOMS.user(userId), REALTIME_ROOMS.adminOps()],
  )
}

export async function emitLedgerUpdated(userId: string): Promise<void> {
  await emitRealtime(
    { type: 'ledger:updated', userId },
    [REALTIME_ROOMS.user(userId), REALTIME_ROOMS.adminOps()],
  )
}

export async function emitClearanceUpdated(userId: string): Promise<void> {
  await emitRealtime(
    { type: 'clearance:updated', userId },
    [REALTIME_ROOMS.user(userId), REALTIME_ROOMS.adminOps()],
  )
}
