'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { markPasswordChanged } from './actions'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  const [checkingAuth, setCheckingAuth] = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const loadProfile = async () => {
      const { data: sessionData } = await supabase.auth.getUser()
      if (!active) return

      if (!sessionData.user) {
        router.replace('/login')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('must_change_password')
        .eq('id', sessionData.user.id)
        .maybeSingle()

      if (!active) return

      if (profileError || !profile) {
        router.replace('/login')
        return
      }

      setMustChangePassword(Boolean(profile.must_change_password))
      setCheckingAuth(false)
    }

    loadProfile().catch(() => {
      if (!active) return
      router.replace('/login')
    })

    return () => {
      active = false
    }
  }, [router])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setLoading(false)
      setError(updateError.message)
      return
    }

    try {
      await markPasswordChanged()
      router.replace('/dashboard?passwordUpdated=1')
    } catch (actionError) {
      setLoading(false)
      setError(actionError instanceof Error ? actionError.message : 'Unable to save password state.')
    }
  }

  async function handleSkipForNow() {
    setError('')
    setLoading(true)

    try {
      await markPasswordChanged()
      router.replace('/dashboard')
    } catch (actionError) {
      setLoading(false)
      setError(actionError instanceof Error ? actionError.message : 'Unable to skip setup right now.')
    }
  }

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#10233f_0%,_#07101d_42%,_#04070d_100%)] px-6 py-10 text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center">
          <div className="w-full rounded-[28px] border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
            <p className="text-sm uppercase tracking-[0.28em] text-white/45">Loading</p>
            <p className="mt-3 text-lg text-white/80">Checking your secure account access...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(56,121,255,0.24)_0%,_rgba(7,16,29,0.92)_38%,_#03060a_100%)] px-6 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[32px] border border-white/10 bg-white/6 p-8 shadow-[0_40px_120px_rgba(0,0,0,0.42)] backdrop-blur-2xl md:p-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.34em] text-blue-200/60">Account setup</p>
            {mustChangePassword ? (
              <>
                <h1 className="mt-4 font-serif text-4xl leading-tight text-white md:text-5xl">
                  Welcome to OZ Rent A Plane 👋
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-white/72 md:text-lg">
                  Your account was created by our team. We recommend setting your own password now.
                </p>
              </>
            ) : (
              <>
                <h1 className="mt-4 font-serif text-4xl leading-tight text-white md:text-5xl">
                  Change your password
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-white/72 md:text-lg">
                  Choose a new password for your account.
                </p>
              </>
            )}

            <div className="mt-8 rounded-[24px] border border-white/10 bg-slate-950/40 p-5 md:p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-white/55">
                    New password
                  </span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    required
                    className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3.5 text-base text-white outline-none transition focus:border-blue-400/60 focus:bg-white/10"
                    placeholder="At least 8 characters"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-white/55">
                    Confirm password
                  </span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    required
                    className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3.5 text-base text-white outline-none transition focus:border-blue-400/60 focus:bg-white/10"
                    placeholder="Repeat your new password"
                  />
                </label>

                {error ? (
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {error}
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-full bg-blue-500 px-6 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? 'Updating...' : 'Update password'}
                  </button>
                  {mustChangePassword ? (
                    <button
                      type="button"
                      onClick={handleSkipForNow}
                      disabled={loading}
                      className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white/80 transition hover:border-white/25 hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Skip for now
                    </button>
                  ) : null}
                </div>
              </form>
            </div>
          </section>

          <aside className="rounded-[32px] border border-white/10 bg-[#07101b]/70 p-8 shadow-[0_40px_120px_rgba(0,0,0,0.32)] backdrop-blur-2xl md:p-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.34em] text-white/45">Why this matters</p>
            <div className="mt-5 space-y-4 text-sm leading-7 text-white/70">
              <p>
                For admin-created accounts, we start with a temporary password so you can sign in immediately without waiting for a recovery link.
              </p>
              <p>
                After you update your password, we clear the first-login flag and send you straight back to your dashboard.
              </p>
              <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/65">
                Tip: choose something long and unique so it is easier to keep your pilot account secure.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
