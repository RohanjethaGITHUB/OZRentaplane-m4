/**
 * Typed Socket.io realtime contract.
 * Payloads stay thin (ids + type).
 * Clients soft-update badges where possible; otherwise path-aware RSC refresh.
 */

export type RealtimeEvent =
  | { type: 'chat:message'; threadUserId: string; eventId?: string }
  | { type: 'chat:read'; threadUserId: string }
  | { type: 'ops:counts' }
  | { type: 'ops:queue' }
  | { type: 'booking:status'; bookingId: string; userId: string }
  | { type: 'payment:updated'; bookingId?: string; userId: string; invoiceId?: string }
  | { type: 'verification:updated'; userId: string }
  | { type: 'flight_record:updated'; bookingId: string; userId: string }
  | { type: 'block_time:updated'; userId: string }
  | { type: 'ledger:updated'; userId: string }
  | { type: 'clearance:updated'; userId: string }

export type RealtimeEventType = RealtimeEvent['type']

export const REALTIME_ROOMS = {
  adminOps: () => 'admin:ops' as const,
  user: (userId: string) => `user:${userId}` as const,
  booking: (bookingId: string) => `booking:${bookingId}` as const,
  thread: (userId: string) => `thread:${userId}` as const,
} as const

export type ClientToServerEvents = {
  'join:booking': (bookingId: string) => void
  'leave:booking': (bookingId: string) => void
  'join:thread': (threadUserId: string) => void
  'leave:thread': (threadUserId: string) => void
}

export type ServerToClientEvents = {
  [K in RealtimeEventType]: (event: Extract<RealtimeEvent, { type: K }>) => void
}

export type EmitBridgeBody = {
  event: RealtimeEvent
  rooms: string[]
}
