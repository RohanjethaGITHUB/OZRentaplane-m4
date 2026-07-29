/**
 * Dedicated Socket.io process (no Redis).
 * Next.js emits via POST /internal/emit with SOCKET_EMIT_SECRET.
 *
 * Run: npm run realtime
 * Or with Next: npm run dev:all
 */

import http from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { Server } from 'socket.io'
import type {
  ClientToServerEvents,
  EmitBridgeBody,
  RealtimeEvent,
  ServerToClientEvents,
} from '../lib/realtime/events'
import { REALTIME_ROOMS } from '../lib/realtime/events'

const PORT = Number(process.env.SOCKET_PORT || 3001)
const EMIT_SECRET = process.env.SOCKET_EMIT_SECRET
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[realtime] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

if (!EMIT_SECRET) {
  console.warn('[realtime] SOCKET_EMIT_SECRET is not set — /internal/emit will reject all requests')
}

type SocketData = {
  userId: string
  isAdmin: boolean
  accessToken: string
}

function createAuthedSupabase(accessToken: string) {
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function createServiceSupabase() {
  if (!SUPABASE_SERVICE_KEY) return null
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function resolveIsAdmin(userId: string, accessToken: string): Promise<boolean> {
  // Prefer service role for role lookup (matches server patterns); fall back to user JWT.
  const service = createServiceSupabase()
  if (service) {
    const { data } = await service
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle()
    if (data?.role === 'admin') return true

    // Also check profiles.role (admin layout uses this)
    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    return profile?.role === 'admin'
  }

  const supabase = createAuthedSupabase(accessToken)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  return profile?.role === 'admin'
}

async function canAccessBooking(
  userId: string,
  isAdmin: boolean,
  bookingId: string,
  accessToken?: string,
): Promise<boolean> {
  if (isAdmin) return true

  const service = createServiceSupabase()
  const client = service
    ?? (accessToken ? createAuthedSupabase(accessToken) : null)
  if (!client) return false

  // Only select columns that exist across environments — `customer_id` is not reliable here.
  const { data, error } = await client
    .from('bookings')
    .select('id, booking_owner_user_id')
    .eq('id', bookingId)
    .maybeSingle()

  if (error) {
    console.warn(`[realtime] booking access lookup failed: ${error.message}`)
    return false
  }
  if (!data) return false
  return data.booking_owner_user_id === userId
}

function readEmitSecret(req: http.IncomingMessage): string | null {
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim()
  }
  const header = req.headers['x-socket-emit-secret']
  if (typeof header === 'string') return header.trim()
  if (Array.isArray(header) && header[0]) return header[0].trim()
  return null
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

const httpServer = http.createServer(async (req, res) => {
  // CORS for browser socket handshake is handled by Socket.io;
  // this HTTP handler is only the internal emit bridge + health.
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'ozrentaplane-realtime' }))
    return
  }

  if (req.method === 'POST' && req.url === '/internal/emit') {
    if (!EMIT_SECRET || readEmitSecret(req) !== EMIT_SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    try {
      const body = (await readJsonBody(req)) as EmitBridgeBody
      const event = body?.event as RealtimeEvent | undefined
      const rooms = Array.isArray(body?.rooms) ? body.rooms.filter((r) => typeof r === 'string') : []

      if (!event?.type || rooms.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid body' }))
        return
      }

      for (const room of Array.from(new Set(rooms))) {
        io.to(room).emit(event.type, event as never)
      }

      console.log(`[realtime] emit ${event.type} → ${rooms.join(', ')} (${io.engine.clientsCount} clients)`)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, rooms: rooms.length }))
    } catch (err) {
      console.warn('[realtime] /internal/emit error:', err instanceof Error ? err.message : err)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Bad request' }))
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  },
)

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token
    if (typeof token !== 'string' || !token) {
      return next(new Error('Unauthorized'))
    }

    const supabase = createAuthedSupabase(token)
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      return next(new Error('Unauthorized'))
    }

    const userId = data.user.id
    const isAdmin = await resolveIsAdmin(userId, token)
    socket.data.userId = userId
    socket.data.isAdmin = isAdmin
    socket.data.accessToken = token
    next()
  } catch (err) {
    console.warn('[realtime] auth failed:', err instanceof Error ? err.message : err)
    next(new Error('Unauthorized'))
  }
})

io.on('connection', (socket) => {
  const { userId, isAdmin, accessToken } = socket.data
  socket.join(REALTIME_ROOMS.user(userId))
  if (isAdmin) {
    socket.join(REALTIME_ROOMS.adminOps())
  }
  console.log(`[realtime] connected user=${userId} admin=${isAdmin}`)

  socket.on('join:booking', async (bookingId) => {
    if (typeof bookingId !== 'string' || !bookingId) return
    const allowed = await canAccessBooking(userId, isAdmin, bookingId, accessToken)
    if (!allowed) {
      console.warn(`[realtime] deny join:booking ${bookingId} for ${userId}`)
      return
    }
    socket.join(REALTIME_ROOMS.booking(bookingId))
  })

  socket.on('leave:booking', (bookingId) => {
    if (typeof bookingId !== 'string' || !bookingId) return
    socket.leave(REALTIME_ROOMS.booking(bookingId))
  })

  socket.on('join:thread', (threadUserId) => {
    if (typeof threadUserId !== 'string' || !threadUserId) return
    // Customer may only join own thread; admins may join any
    if (!isAdmin && threadUserId !== userId) {
      console.warn(`[realtime] deny join:thread ${threadUserId} for ${userId}`)
      return
    }
    socket.join(REALTIME_ROOMS.thread(threadUserId))
  })

  socket.on('leave:thread', (threadUserId) => {
    if (typeof threadUserId !== 'string' || !threadUserId) return
    socket.leave(REALTIME_ROOMS.thread(threadUserId))
  })
})

httpServer.listen(PORT, () => {
  console.log(`[realtime] Socket.io listening on http://localhost:${PORT}`)
})
