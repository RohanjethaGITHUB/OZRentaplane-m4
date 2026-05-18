'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type ConfirmState = 'working' | 'failed'

function parseHashFragment(hash: string): Record<string, string> {
  const clean = hash.startsWith('#') ? hash.slice(1) : hash
  const out: Record<string, string> = {}
  for (const pair of clean.split('&')) {
    if (!pair) continue
    const i = pair.indexOf('=')
    if (i < 0) continue
    const key = decodeURIComponent(pair.slice(0, i))
    const value = decodeURIComponent(pair.slice(i + 1))
    out[key] = value
  }
  return out
}

export default function AuthConfirmPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<ConfirmState>('working')
  const [message, setMessage] = useState('Establishing secure session...')

  useEffect(() => {
    let cancelled = false

    async function run() {
      const params = parseHashFragment(window.location.hash || '')
      const accessToken = params.access_token
      const refreshToken = params.refresh_token

      if (!accessToken || !refreshToken) {
        if (!cancelled) {
          setState('failed')
          setMessage('Invalid or expired sign-in link. Please request a new one.')
        }
        return
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (error) {
        if (!cancelled) {
          setState('failed')
          setMessage('Could not establish session from sign-in link.')
        }
        return
      }

      // Remove auth tokens from the visible URL and navigate into app flow.
      window.history.replaceState({}, document.title, '/auth/confirm')
      router.replace('/dashboard/checkout')
    }

    run()
    return () => {
      cancelled = true
    }
  }, [router, supabase])

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-6">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h1 className="text-lg font-semibold">Support Sign-In</h1>
        <p className="mt-2 text-sm text-slate-300">{message}</p>
        {state === 'failed' ? (
          <button
            type="button"
            onClick={() => router.replace('/login')}
            className="mt-5 rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-white"
          >
            Go to login
          </button>
        ) : null}
      </div>
    </main>
  )
}
