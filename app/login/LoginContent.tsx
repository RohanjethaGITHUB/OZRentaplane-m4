'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

type AuthMode = 'signin' | 'signup'

// ─── Animation config ─────────────────────────────────────────────────────────────
const EASE_PREMIUM = [0.25, 1, 0.35, 1] as const
const TRANSITION = { duration: 1.4, ease: EASE_PREMIUM }

export default function LoginContent() {
  const [mode, setMode] = useState<AuthMode>('signin')
  const router = useRouter()
  const supabase = createClient()

  // ─── Sign In state ───────────────────────────────────────────────────────────
  const [siEmail, setSiEmail] = useState('')
  const [siPassword, setSiPassword] = useState('')
  const [siError, setSiError] = useState('')

  // ─── Sign Up state ───────────────────────────────────────────────────────────
  const [suName, setSuName] = useState('')
  const [suEmail, setSuEmail] = useState('')
  const [suPassword, setSuPassword] = useState('')
  const [suConfirm, setSuConfirm] = useState('')
  const [suError, setSuError] = useState('')
  const [suSuccess, setSuSuccess] = useState(false)

  const [loading, setLoading] = useState(false)

  // ─── Handlers ────────────────────────────────────────────────────────────────
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setSiError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: siEmail, password: siPassword })
    setLoading(false)
    if (error) {
      setSiError(error.message)
    } else {
      router.push('/dashboard')
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setSuError('')
    if (suPassword !== suConfirm) {
      setSuError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: suEmail,
      password: suPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: suName },
      },
    })
    setLoading(false)
    if (error) {
      setSuError(error.message)
    } else if (data.session) {
      router.push('/dashboard')
    } else {
      setSuSuccess(true)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#050B14] via-[#0A111F] to-[#04080F] flex flex-col items-center justify-center pt-[120px] pb-12 px-6 md:px-12 lg:px-24 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-[#1E3A8A]/10 blur-[120px] -z-10 rounded-full pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[600px] h-[600px] bg-[#0F172A]/30 blur-[120px] -z-10 rounded-full pointer-events-none" />

      {/* Subtle grain overlay */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none z-50 mix-blend-overlay"
        style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/carbon-fibre.png")' }}
      />

      {/* Main split card container */}
      <main className="w-full max-w-[1300px] h-auto my-auto md:min-h-[700px] md:h-[calc(100vh-160px)] md:max-h-[850px] bg-[#0A101C]/80 backdrop-blur-2xl rounded-2xl md:rounded-[2rem] overflow-hidden flex flex-col md:flex-row relative shadow-[0_40px_100px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-white/10">

        {/* ════════════════════════════════════════════════════════════════════════
            LEFT SIDE: SIGN IN
            ════════════════════════════════════════════════════════════════════════ */}
        <section className="relative flex-1 min-h-[400px] md:min-h-full overflow-hidden border-b md:border-b-0 md:border-r border-white/5">
          {/* Background Layer */}
          <div className="absolute inset-0 z-0">
            <motion.div
              className="w-full h-full"
              initial={false}
              animate={{
                scale: mode === 'signin' ? 1.0 : 1.15,
                filter: mode === 'signin' ? 'blur(0px) brightness(1)' : 'blur(20px) brightness(0.15)',
              }}
              transition={TRANSITION}
            >
              <Image
                src="/Cockpit-twilight.webp"
                alt="Cockpit at twilight"
                fill
                className="object-cover"
                priority
              />
            </motion.div>
            {/* Gradient mask */}
            <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-[#0c121e] via-[#0c121e]/85 to-[#0c121e]/20 pointer-events-none" />
          </div>

          {/* Foreground Layer */}
          <div className="relative z-10 w-full h-full p-8 md:p-14 lg:p-20 flex flex-col">
            <div className="flex-1 flex flex-col justify-center">
              <AnimatePresence mode="popLayout" initial={false}>
                {mode === 'signin' ? (
                  /* --- Active Sign In Form --- */
                  <motion.div
                    key="signin-active"
                    initial={{ opacity: 0, x: -30, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, x: 30, filter: 'blur(10px)' }}
                    transition={TRANSITION}
                    className="max-w-md w-full"
                  >
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-white mb-4 leading-tight tracking-tight">
                      Welcome Back, Pilot
                    </h1>
                    <p className="text-oz-muted font-sans font-light mb-10 text-lg tracking-wide">
                      Your aircraft is waiting. Please authenticate to access your dashboard.
                    </p>

                    <form className="space-y-6" onSubmit={handleSignIn}>
                      <div className="group relative">
                        <label className="block text-[10px] font-sans uppercase tracking-[0.2em] text-oz-subtle mb-1 group-focus-within:text-oz-blue transition-colors">
                          Email Address
                        </label>
                        <input
                          type="email"
                          placeholder="captain@ozrentaplane.com.au"
                          value={siEmail}
                          onChange={(e) => setSiEmail(e.target.value)}
                          required
                          className="w-full bg-white/[0.02] border-0 border-b border-white/10 px-3 py-3 text-white placeholder:text-white/20 focus:ring-0 focus:border-oz-blue focus:bg-white/[0.04] transition-all outline-none font-sans rounded-t-md"
                        />
                      </div>
                      <div className="group relative">
                        <label className="block text-[10px] font-sans uppercase tracking-[0.2em] text-oz-subtle mb-1 group-focus-within:text-oz-blue transition-colors">
                          Authentication Code
                        </label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={siPassword}
                          onChange={(e) => setSiPassword(e.target.value)}
                          required
                          className="w-full bg-white/[0.02] border-0 border-b border-white/10 px-3 py-3 text-white placeholder:text-white/20 focus:ring-0 focus:border-oz-blue focus:bg-white/[0.04] transition-all outline-none font-sans font-mono rounded-t-md"
                        />
                      </div>

                      {siError && (
                        <p className="text-red-400 text-[11px] font-sans font-light tracking-wide -mt-2">
                          {siError}
                        </p>
                      )}

                      <div className="pt-8 flex items-center justify-between">
                        <button
                          type="submit"
                          disabled={loading}
                          className="bg-gradient-to-br from-oz-blue to-oz-blue-dim text-oz-deep px-8 py-3.5 rounded-full font-sans text-xs uppercase tracking-[0.15em] font-bold shadow-[0_4px_16px_rgba(167,200,255,0.15)] hover:shadow-[0_4px_24px_rgba(167,200,255,0.25)] hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                        >
                          {loading ? 'Signing In…' : 'Sign In'}
                        </button>
                        <a href="#" className="text-[10px] font-sans uppercase tracking-[0.1em] text-oz-subtle hover:text-white transition-colors">
                          Forgot Access?
                        </a>
                      </div>

                      <div className="pt-6 mt-6 border-t border-white/5 flex items-center justify-between">
                        <span className="text-oz-muted text-xs font-sans font-light">New pilot?</span>
                        <button
                          type="button"
                          onClick={() => setMode('signup')}
                          className="text-[10px] font-sans uppercase tracking-[0.15em] text-oz-blue hover:text-white transition-colors"
                        >
                          Create Profile
                        </button>
                      </div>
                    </form>
                  </motion.div>
                ) : (
                  /* --- Inactive Sign In Mode View --- */
                  <motion.div
                    key="signin-inactive"
                    initial={{ opacity: 0, x: -20, filter: 'blur(12px)' }}
                    animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, x: -20, filter: 'blur(12px)' }}
                    transition={TRANSITION}
                    className="max-w-md w-full my-auto"
                  >
                    <span className="block text-[10px] font-sans uppercase tracking-[0.2em] text-oz-blue/60 mb-3">
                      Existing Pilots
                    </span>
                    <h2 className="text-3xl md:text-5xl font-serif text-white/50 mb-4 tracking-tight">
                      Member Access
                    </h2>
                    <p className="text-oz-muted/50 font-sans font-light text-base mb-8">
                      Return to the cockpit. Access your active aircraft bookings and manage fleet availability.
                    </p>
                    <button
                      onClick={() => setMode('signin')}
                      className="border border-white/10 px-6 py-3 rounded-full text-[10px] uppercase tracking-[0.15em] text-white/70 hover:bg-white/5 hover:text-white transition-colors duration-300 font-sans shadow-lg"
                    >
                      Switch to Sign In
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Organic aerodynamic center seam */}
          <div className="hidden md:block absolute right-0 top-0 bottom-0 text-white z-20 pointer-events-none opacity-50 mix-blend-overlay w-[60px] translate-x-1/2 overflow-visible">
            <svg viewBox="0 0 60 800" preserveAspectRatio="none" className="w-full h-full">
              <path
                d="M 30 0 C 45 250, 15 550, 30 800"
                fill="none"
                stroke="url(#subtle-glow)"
                strokeWidth="1.5"
              />
              <defs>
                <linearGradient id="subtle-glow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="transparent" />
                  <stop offset="20%" stopColor="rgba(255,255,255,0.4)" />
                  <stop offset="50%" stopColor="rgba(255,255,255,1)" />
                  <stop offset="80%" stopColor="rgba(255,255,255,0.4)" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════════
            RIGHT SIDE: SIGN UP
            ════════════════════════════════════════════════════════════════════════ */}
        <section className="relative flex-1 min-h-[400px] md:min-h-full overflow-hidden">
          {/* Background Layer */}
          <div className="absolute inset-0 z-0">
            <motion.div
              className="w-full h-full"
              initial={false}
              animate={{
                scale: mode === 'signup' ? 1.0 : 1.15,
                filter: mode === 'signup' ? 'blur(0px) brightness(1)' : 'blur(20px) brightness(0.15)',
              }}
              transition={TRANSITION}
            >
              <Image
                src="/Pilot&aircraftTwilight.webp"
                alt="Aircraft on tarmac at twilight"
                fill
                className="object-cover"
                priority
              />
            </motion.div>
            {/* Gradient mask */}
            <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-l from-[#0c121e] via-[#0c121e]/85 to-[#0c121e]/20 pointer-events-none" />
          </div>

          {/* Foreground Layer */}
          <div className="relative z-10 w-full h-full p-8 md:p-14 lg:p-20 flex flex-col items-center justify-center">

            <AnimatePresence mode="popLayout" initial={false}>
              {mode === 'signup' ? (
                /* --- Active Sign Up Form --- */
                <motion.div
                  key="signup-active"
                  initial={{ opacity: 0, x: 30, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: -30, filter: 'blur(10px)' }}
                  transition={TRANSITION}
                  className="w-full max-w-md mx-auto"
                >
                  <div className="mb-10 text-center md:text-left">
                    <span className="block text-[10px] font-sans uppercase tracking-[0.2em] text-oz-blue mb-3">
                      New Aviator Application
                    </span>
                    <h2 className="text-4xl md:text-6xl font-serif text-white mb-4 leading-tight tracking-tight">
                      Create Profile
                    </h2>
                    <p className="text-oz-muted font-sans font-light text-lg">
                      Join Sydney's premier aircraft rental platform for licensed aviation professionals.
                    </p>
                  </div>

                  {suSuccess ? (
                    <div className="py-10 flex flex-col items-center text-center gap-4">
                      <span className="material-symbols-outlined text-oz-blue text-4xl">mark_email_read</span>
                      <p className="text-white font-serif text-2xl tracking-tight">Check your inbox</p>
                      <p className="text-oz-muted font-sans font-light text-sm leading-relaxed max-w-xs">
                        A confirmation link has been sent to <span className="text-white">{suEmail}</span>. Follow the link to activate your account.
                      </p>
                    </div>
                  ) : (
                    <form className="space-y-6" onSubmit={handleSignUp}>
                      <div className="group relative">
                        <label className="block text-[10px] font-sans uppercase tracking-[0.2em] text-oz-subtle mb-1 group-focus-within:text-oz-blue transition-colors">
                          Full Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Capt. Julian Vance"
                          value={suName}
                          onChange={(e) => setSuName(e.target.value)}
                          required
                          className="w-full bg-white/[0.02] border-0 border-b border-white/10 px-3 py-3 text-white placeholder:text-white/20 focus:ring-0 focus:border-oz-blue focus:bg-white/[0.04] transition-all outline-none font-sans rounded-t-md"
                        />
                      </div>
                      <div className="group relative">
                        <label className="block text-[10px] font-sans uppercase tracking-[0.2em] text-oz-subtle mb-1 group-focus-within:text-oz-blue transition-colors">
                          Email Address
                        </label>
                        <input
                          type="email"
                          placeholder="pilot@example.com"
                          value={suEmail}
                          onChange={(e) => setSuEmail(e.target.value)}
                          required
                          className="w-full bg-white/[0.02] border-0 border-b border-white/10 px-3 py-3 text-white placeholder:text-white/20 focus:ring-0 focus:border-oz-blue focus:bg-white/[0.04] transition-all outline-none font-sans rounded-t-md"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="group relative">
                          <label className="block text-[10px] font-sans uppercase tracking-[0.2em] text-oz-subtle mb-1 group-focus-within:text-oz-blue transition-colors">
                            Password
                          </label>
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={suPassword}
                            onChange={(e) => setSuPassword(e.target.value)}
                            required
                            className="w-full bg-white/[0.02] border-0 border-b border-white/10 px-3 py-3 text-white placeholder:text-white/20 focus:ring-0 focus:border-oz-blue focus:bg-white/[0.04] transition-all outline-none font-sans font-mono rounded-t-md"
                          />
                        </div>
                        <div className="group relative">
                          <label className="block text-[10px] font-sans uppercase tracking-[0.2em] text-oz-subtle mb-1 group-focus-within:text-oz-blue transition-colors">
                            Confirm Code
                          </label>
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={suConfirm}
                            onChange={(e) => setSuConfirm(e.target.value)}
                            required
                            className="w-full bg-white/[0.02] border-0 border-b border-white/10 px-3 py-3 text-white placeholder:text-white/20 focus:ring-0 focus:border-oz-blue focus:bg-white/[0.04] transition-all outline-none font-sans font-mono rounded-t-md"
                          />
                        </div>
                      </div>

                      {suError && (
                        <p className="text-red-400 text-[11px] font-sans font-light tracking-wide -mt-2">
                          {suError}
                        </p>
                      )}

                      <div className="pt-6">
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full bg-white text-oz-deep py-4 rounded-full font-sans text-xs uppercase tracking-[0.15em] font-bold shadow-[0_4px_16px_rgba(255,255,255,0.1)] hover:bg-gray-100 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loading ? 'Processing…' : (
                            <>
                              Start Application
                              <span className="material-symbols-outlined text-[1rem]">arrow_forward</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="pt-6 mt-2 flex items-center justify-between px-2">
                         <span className="text-oz-muted text-xs font-sans font-light">Already have access?</span>
                         <button
                           type="button"
                           onClick={() => setMode('signin')}
                           className="text-[10px] font-sans uppercase tracking-[0.15em] text-oz-blue hover:text-white transition-colors"
                         >
                           Sign In
                         </button>
                      </div>

                      {/* Verification Context Card */}
                      <div className="mt-8 p-5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-sm flex gap-4 items-start">
                        <span className="material-symbols-outlined text-oz-blue mt-0.5 text-xl">verified_user</span>
                        <div className="text-xs text-oz-muted font-sans font-light leading-relaxed">
                          <span className="text-white block mb-1 uppercase tracking-widest text-[10px] font-semibold">Pilot Verification Required</span>
                          Registrations are manually reviewed. You will be requested to provide valid licensing and ASIC information in the next stage.
                        </div>
                      </div>
                    </form>
                  )}
                </motion.div>
              ) : (
                /* --- Inactive Sign Up Mode View --- */
                <motion.div
                  key="signup-inactive"
                  initial={{ opacity: 0, x: 20, filter: 'blur(12px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: 20, filter: 'blur(12px)' }}
                  transition={TRANSITION}
                  className="max-w-xs w-full flex flex-col items-center text-center my-auto"
                >
                  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-white/50 text-2xl">flight_takeoff</span>
                  </div>
                  <h2 className="text-3xl font-serif text-white/50 mb-4 tracking-tight">
                    Join the Fleet
                  </h2>
                  <p className="text-oz-muted/50 font-sans font-light text-sm mb-8 leading-relaxed">
                    Access premium aircraft exclusively for verified pilots. Step into the cockpit with OZRentAPlane.
                  </p>
                  <button
                    onClick={() => setMode('signup')}
                    className="border border-white/10 px-8 py-3.5 rounded-full text-[10px] uppercase tracking-[0.15em] text-white/70 hover:bg-white/5 hover:text-white transition-colors duration-300 font-sans shadow-lg backdrop-blur-sm"
                  >
                    Create Profile
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </section>

      </main>

      {/* Brand Watermark / Footer */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 text-center pointer-events-none opacity-40">
        <p className="text-[9px] font-sans uppercase tracking-[0.4em] text-white/60 mb-2">OZRentAPlane Authentication</p>
        <p className="text-[10px] font-serif italic text-white/40">Securing your journey to the horizon.</p>
      </div>
    </div>
  )
}
