'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { io, type Socket } from 'socket.io-client'
import { createClient } from '@/lib/supabase/client'
import type { ClientToServerEvents, ServerToClientEvents } from '@/lib/realtime/events'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

type RealtimeContextValue = {
  socket: AppSocket | null
  connected: boolean
}

const RealtimeContext = createContext<RealtimeContextValue>({
  socket: null,
  connected: false,
})

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext)
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL
  const [socket, setSocket] = useState<AppSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<AppSocket | null>(null)

  const connectWithToken = useCallback((token: string) => {
    if (!url) return

    // Tear down previous connection if any
    if (socketRef.current) {
      socketRef.current.removeAllListeners()
      socketRef.current.disconnect()
      socketRef.current = null
    }

    const next = io(url, {
      auth: { token },
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    }) as AppSocket

    next.on('connect', () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[realtime] connected')
      }
      setConnected(true)
    })
    next.on('disconnect', (reason) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[realtime] disconnected:', reason)
      }
      setConnected(false)
    })
    next.on('connect_error', (err) => {
      // Transient "WebSocket is closed before the connection is established"
      // happens during HMR / tab switches; polling fallback + reconnect handle it.
      if (process.env.NODE_ENV === 'development') {
        console.warn('[realtime] connect_error:', err.message)
      }
      setConnected(false)
    })

    socketRef.current = next
    setSocket(next)
  }, [url])

  useEffect(() => {
    if (!url) return

    const supabase = createClient()
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) connectWithToken(token)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      if (session?.access_token) {
        connectWithToken(session.access_token)
      } else if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setSocket(null)
        setConnected(false)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
      if (socketRef.current) {
        socketRef.current.removeAllListeners()
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [url, connectWithToken])

  const value = useMemo(() => ({ socket, connected }), [socket, connected])

  // Graceful degrade when env missing
  if (!url) {
    return <>{children}</>
  }

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  )
}
