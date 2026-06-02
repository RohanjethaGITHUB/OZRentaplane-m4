'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const INVALID_LINK_ERROR = 'This link has expired or is invalid. Please contact us for a new one.'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [sessionReady, setSessionReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const establishSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return

      if (data.session) {
        setSessionReady(true)
        setIsCheckingSession(false)
        return
      }

      window.setTimeout(async () => {
        if (!active) return
        const { data: retryData } = await supabase.auth.getSession()
        if (!active) return

        if (retryData.session) {
          setSessionReady(true)
          setIsCheckingSession(false)
          return
        }

        setError(INVALID_LINK_ERROR)
        setIsCheckingSession(false)
      }, 2000)
    }

    establishSession().catch(() => {
      if (!active) return
      setError(INVALID_LINK_ERROR)
      setIsCheckingSession(false)
    })

    return () => {
      active = false
    }
  }, [supabase])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    router.replace('/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-6">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Set up your password</h1>
          <p className="mt-2 text-sm text-slate-300">
            Choose a new password to finish activating your customer account.
          </p>
        </div>

        {isCheckingSession ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-4 text-sm text-slate-300">
            Checking your secure sign-in link...
          </div>
        ) : sessionReady ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">New password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-slate-500"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-slate-500"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            {error ? <p className="text-sm text-red-300">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:opacity-60"
            >
              {loading ? 'Saving...' : 'Save password'}
            </button>
          </form>
        ) : (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm text-red-200">
            {error || INVALID_LINK_ERROR}
          </div>
        )}
      </div>
    </main>
  )
}
