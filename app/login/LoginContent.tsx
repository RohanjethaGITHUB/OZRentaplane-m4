'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

type AuthMode = 'signin' | 'signup'

const EASE_PREMIUM = [0.25, 1, 0.35, 1] as const
const isScreenshotMode = typeof window !== 'undefined' && window.location.search.includes('screenshotMode=1')
const TRANSITION = { duration: isScreenshotMode ? 0 : 1.4, ease: EASE_PREMIUM }

const FIELD_LABEL_CLASS = 'block text-[10px] font-sans uppercase tracking-[0.2em] text-white/[0.72] mb-1.5 group-focus-within:text-oz-blue transition-colors'
const FIELD_INPUT_CLASS = 'w-full bg-white/[0.09] border border-white/30 px-3.5 py-3.5 text-white placeholder:text-white/50 focus:ring-0 focus:border-oz-blue focus:bg-white/[0.13] transition-all outline-none font-sans rounded-xl'

interface LoginContentProps {
  presentation?: 'page' | 'modal'
  onRequestClose?: () => void
  onBusyChange?: (isBusy: boolean) => void
}

export default function LoginContent({ presentation = 'page', onRequestClose, onBusyChange }: LoginContentProps) {
  const COUNTRY_CODE_REGEX = /^\+?\d{1,4}$/
  const PHONE_NUMBER_REGEX = /^\d*$/

  const [mode, setMode] = useState<AuthMode>('signin')
  const router = useRouter()
  const supabase = createClient()

  const [siEmail, setSiEmail] = useState('')
  const [siPassword, setSiPassword] = useState('')
  const [siError, setSiError] = useState('')
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const [forgotSuccess, setForgotSuccess] = useState('')

  const [suFirstName, setSuFirstName] = useState('')
  const [suLastName, setSuLastName] = useState('')
  const [suPhoneCountryCode, setSuPhoneCountryCode] = useState('+61')
  const [suPhoneNumber, setSuPhoneNumber] = useState('')
  const [suEmail, setSuEmail] = useState('')
  const [suPassword, setSuPassword] = useState('')
  const [suConfirm, setSuConfirm] = useState('')
  const [suError, setSuError] = useState('')
  const [suSuccess, setSuSuccess] = useState(false)

  const [loading, setLoading] = useState(false)

  const anyLoading = loading || forgotLoading
  const isModal = presentation === 'modal'

  function clearErrors() {
    setSiError('')
    setSuError('')
  }

  function clearForgotPasswordState() {
    setForgotPasswordOpen(false)
    setForgotEmail('')
    setForgotLoading(false)
    setForgotError('')
    setForgotSuccess('')
  }

  function setModeWithReset(nextMode: AuthMode) {
    clearErrors()
    setSuSuccess(false)
    clearForgotPasswordState()
    setMode(nextMode)
  }

  function openForgotPassword() {
    setForgotPasswordOpen(true)
    setForgotError('')
    setForgotSuccess('')
    setForgotEmail(siEmail.trim())
  }

  async function handleForgotPasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setForgotError('')
    setForgotSuccess('')

    const email = forgotEmail.trim()
    if (!email) {
      setForgotError('Email address is required.')
      return
    }

    setForgotLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    })
    setForgotLoading(false)

    if (error) {
      setForgotError(error.message)
      return
    }

    setForgotSuccess('Check your email for a password reset link. It expires in 24 hours.')
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    clearErrors()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: siEmail, password: siPassword })
    if (error) {
      setLoading(false)
      setSiError(error.message)
    } else {
      // keep loading=true until navigation completes to prevent double-submit
      router.push('/dashboard')
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    clearErrors()

    const firstName = suFirstName.trim()
    const lastName = suLastName.trim()
    const phoneCountryCode = suPhoneCountryCode.trim() || '+61'
    const phoneNumber = suPhoneNumber.trim()

    if (!firstName) {
      setSuError('First name is required.')
      return
    }
    if (!lastName) {
      setSuError('Last name is required.')
      return
    }
    if (suPassword !== suConfirm) {
      setSuError('Passwords do not match.')
      return
    }
    if (!COUNTRY_CODE_REGEX.test(phoneCountryCode)) {
      setSuError('Country code must be + followed by 1-4 digits (or digits only).')
      return
    }
    if (!phoneNumber) {
      setSuError('Phone number is required.')
      return
    }
    if (!PHONE_NUMBER_REGEX.test(phoneNumber)) {
      setSuError('Phone number can only contain digits.')
      return
    }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: suEmail,
      password: suPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: `${firstName} ${lastName}`.trim(),
          first_name: firstName,
          last_name: lastName,
          phone_country_code: phoneCountryCode,
          phone_number: phoneNumber,
        },
      },
    })

    if (error) {
      setLoading(false)
      setSuError(error.message)
    } else if (data.session) {
      // keep loading=true until navigation completes to prevent double-submit
      router.push('/dashboard')
    } else {
      setLoading(false)
      setSuSuccess(true)
    }
  }

  useEffect(() => {
    onBusyChange?.(anyLoading)
  }, [anyLoading, onBusyChange])

  return (
    <div className={`${isModal ? 'w-full' : 'min-h-screen pt-[120px] pb-12 px-6 md:px-12 lg:px-24 bg-gradient-to-br from-[#050B14] via-[#0A111F] to-[#04080F]'} flex flex-col items-center justify-center relative overflow-hidden`}>
      {!isModal && <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-[#1E3A8A]/10 blur-[120px] -z-10 rounded-full pointer-events-none" />}
      {!isModal && <div className="fixed bottom-0 left-0 w-[600px] h-[600px] bg-[#0F172A]/30 blur-[120px] -z-10 rounded-full pointer-events-none" />}
      {!isModal && <div className="fixed inset-0 opacity-[0.03] pointer-events-none z-50 mix-blend-overlay" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/carbon-fibre.png")' }} />}

      <main className={`${isModal ? 'w-full max-w-[1220px] h-[min(calc(100dvh-24px),880px)] min-h-0 rounded-[1.65rem]' : 'w-full max-w-[1300px] h-auto my-auto md:min-h-[700px] md:h-[calc(100vh-160px)] md:max-h-[900px] rounded-2xl md:rounded-[2rem]'} bg-[#0A101C]/80 backdrop-blur-2xl overflow-hidden flex flex-col md:flex-row relative shadow-[0_40px_100px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-white/10`}>
        {isModal && (
          <button
            type="button"
            onClick={onRequestClose}
            disabled={anyLoading}
            aria-label="Close authentication"
            className="absolute top-4 right-4 z-30 h-10 w-10 p-0 rounded-full border border-white/15 bg-[#0a1423]/80 text-white/70 hover:text-white hover:border-white/30 hover:bg-[#12233d]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <span className="material-symbols-outlined block leading-none text-[18px]">close</span>
          </button>
        )}
        <section className={`relative flex-1 ${isModal ? 'min-h-0' : 'min-h-[400px]'} md:min-h-full overflow-hidden border-b md:border-b-0 md:border-r border-white/5${mode === 'signup' && isModal ? ' hidden md:block' : ''}`}>
          <div className="absolute inset-0 z-0">
            <motion.div className="w-full h-full" initial={isScreenshotMode ? false : undefined} animate={{ scale: mode === 'signin' ? 1.06 : 1.09, filter: mode === 'signin' ? 'blur(12px) brightness(0.42) contrast(0.9) saturate(0.72)' : 'blur(15px) brightness(0.34) contrast(0.86) saturate(0.66)' }} transition={TRANSITION}>
              <Image src="/Cockpit-twilight.webp" alt="Cockpit at twilight" fill className="object-cover" priority />
            </motion.div>
            <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-[#040a15]/94 via-[#071225]/90 to-[#0a1730]/84 pointer-events-none" />
            <div className="absolute inset-0 bg-[#081224]/46 pointer-events-none" />
          </div>

          <div className={`relative z-10 w-full h-full flex flex-col ${isModal ? 'px-5 pt-14 pb-6 sm:p-8 md:p-14 lg:p-20' : 'p-8 md:p-14 lg:p-20'}`}>
            <div className="flex-1 flex flex-col justify-center">
              <AnimatePresence mode="popLayout" initial={isScreenshotMode ? false : undefined}>
                {mode === 'signin' ? (
                  <motion.div key="signin-active" initial={isScreenshotMode ? false : { opacity: 0, x: -30, filter: 'blur(10px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: 30, filter: 'blur(10px)' }} transition={TRANSITION} className="max-w-md w-full">
                    <h1 className="text-[1.7rem] sm:text-4xl md:text-5xl lg:text-6xl font-serif text-white mb-3 md:mb-4 leading-tight tracking-tight">Welcome Back, Pilot</h1>
                    <p className="text-white/[0.78] font-sans font-light mb-6 md:mb-10 text-base md:text-lg tracking-wide">Your aircraft is waiting. Please authenticate to access your dashboard.</p>
                    <form className="space-y-7" onSubmit={handleSignIn}>
                      <div className="group relative">
                        <label className={FIELD_LABEL_CLASS}>Email Address</label>
                        <input type="email" placeholder="captain@ozrentaplane.com.au" value={siEmail} onChange={(e) => setSiEmail(e.target.value)} required disabled={loading} className={`${FIELD_INPUT_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`} />
                      </div>
                      <div className="group relative">
                        <label className={FIELD_LABEL_CLASS}>Password</label>
                        <input type="password" placeholder="••••••••" value={siPassword} onChange={(e) => setSiPassword(e.target.value)} required disabled={loading} className={`${FIELD_INPUT_CLASS} font-mono disabled:opacity-60 disabled:cursor-not-allowed`} />
                      </div>
                      {siError && <p className="text-red-400 text-[11px] font-sans font-light tracking-wide -mt-2">{siError}</p>}
                      <div className="pt-8 flex items-center justify-between gap-4">
                        <button type="submit" disabled={anyLoading} className="bg-gradient-to-br from-oz-blue to-oz-blue-dim text-oz-deep px-8 py-3.5 rounded-full font-sans text-xs uppercase tracking-[0.15em] font-bold shadow-[0_4px_16px_rgba(167,200,255,0.15)] hover:shadow-[0_4px_24px_rgba(167,200,255,0.25)] hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">{loading ? 'Signing In…' : 'Sign In'}</button>
                        <button
                          type="button"
                          onClick={() => (forgotPasswordOpen ? clearForgotPasswordState() : openForgotPassword())}
                          className="text-[10px] font-sans uppercase tracking-[0.1em] text-white/[0.66] hover:text-white transition-colors text-right"
                        >
                          {forgotPasswordOpen ? 'Cancel reset' : 'Forgot password?'}
                        </button>
                      </div>

                      {forgotPasswordOpen ? (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 space-y-4">
                          <div>
                            <p className="text-sm font-medium text-white">Reset your password</p>
                            <p className="mt-1 text-xs leading-relaxed text-white/65">
                              We’ll send a password reset link to your email address.
                            </p>
                          </div>

                          <form className="space-y-4" onSubmit={handleForgotPasswordSubmit}>
                            <label className="block">
                              <span className={FIELD_LABEL_CLASS}>Email Address</span>
                              <input
                                type="email"
                                value={forgotEmail}
                                onChange={(e) => setForgotEmail(e.target.value)}
                                placeholder="pilot@example.com"
                                required
                                disabled={forgotLoading}
                                className={`${FIELD_INPUT_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`}
                              />
                            </label>

                            {forgotError ? <p className="text-red-300 text-[11px] font-sans font-light tracking-wide">{forgotError}</p> : null}
                            {forgotSuccess ? <p className="text-emerald-300 text-[11px] font-sans font-light tracking-wide">{forgotSuccess}</p> : null}

                            <div className="flex items-center justify-between gap-3">
                              <button
                                type="submit"
                                disabled={forgotLoading}
                                className="bg-white text-oz-deep px-5 py-3 rounded-full font-sans text-[10px] uppercase tracking-[0.15em] font-bold hover:bg-white/95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {forgotLoading ? 'Sending...' : 'Send reset link'}
                              </button>
                              <button
                                type="button"
                                onClick={clearForgotPasswordState}
                                className="text-[10px] font-sans uppercase tracking-[0.1em] text-white/55 hover:text-white transition-colors"
                              >
                                Back to sign in
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : null}

                      <div className="pt-6 mt-2 border-t border-white/5 flex items-center justify-between">
                        <span className="text-white/[0.72] text-xs font-sans font-light">New pilot?</span>
                        <button type="button" onClick={() => setModeWithReset('signup')} className="text-[10px] font-sans uppercase tracking-[0.15em] text-oz-blue hover:text-white transition-colors">Create account</button>
                      </div>
                    </form>
                  </motion.div>
                ) : (
                  <motion.div key="signin-inactive" initial={isScreenshotMode ? false : { opacity: 0, x: -20, filter: 'blur(12px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: -20, filter: 'blur(12px)' }} transition={TRANSITION} className="max-w-md w-full my-auto relative flex justify-center">
                    <div className="absolute -z-10 left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7ca6e8]/20 blur-[78px]" />
                    <div className="w-full max-w-[430px] rounded-[24px] border border-white/[0.12] bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent px-7 py-8 md:px-9 md:py-10 shadow-[0_12px_48px_rgba(8,16,30,0.45)] flex flex-col items-center text-center">
                      <span className="block text-[10px] font-sans uppercase tracking-[0.2em] text-oz-blue/70 mb-3">Existing Pilots</span>
                      <h2 className="text-[2.35rem] md:text-[2.8rem] leading-tight font-serif text-white/[0.80] mb-4 tracking-tight">Member Access</h2>
                      <p className="text-white/[0.72] font-sans font-light text-base mb-8 max-w-[30ch]">Return to the cockpit. Access your active aircraft bookings and manage fleet availability.</p>
                      <button onClick={() => setModeWithReset('signin')} className="border border-oz-blue/40 bg-oz-blue/[0.10] px-6 py-3 rounded-full text-[10px] uppercase tracking-[0.15em] text-oz-blue hover:bg-oz-blue/[0.16] hover:text-[#d3e4ff] transition-colors duration-300 font-sans shadow-lg">Switch to Sign In</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

        <section className={`relative flex-1 ${isModal ? 'min-h-0' : 'min-h-[420px]'} md:min-h-full overflow-hidden${mode === 'signin' && isModal ? ' hidden md:block' : ''}`}>
          <div className="absolute inset-0 z-0">
            <motion.div className="w-full h-full" initial={isScreenshotMode ? false : undefined} animate={{ scale: mode === 'signup' ? 1.06 : 1.09, filter: mode === 'signup' ? 'blur(12px) brightness(0.42) contrast(0.9) saturate(0.74)' : 'blur(15px) brightness(0.34) contrast(0.86) saturate(0.66)' }} transition={TRANSITION}>
              <Image src="/Pilot&aircraftTwilight.webp" alt="Aircraft on tarmac at twilight" fill className="object-cover" priority />
            </motion.div>
            <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-l from-[#040a15]/94 via-[#071225]/90 to-[#0a1730]/84 pointer-events-none" />
            <div className="absolute inset-0 bg-[#081224]/46 pointer-events-none" />
          </div>

          <div className={`relative z-10 w-full h-full min-h-0 flex flex-col items-center justify-start overflow-y-auto overscroll-contain ${isModal ? 'px-5 pt-14 pb-6 sm:p-8 md:p-14 lg:p-20' : 'p-8 md:p-14 lg:p-20'}`}>
            <AnimatePresence mode="popLayout" initial={isScreenshotMode ? false : undefined}>
              {mode === 'signup' ? (
                <motion.div key="signup-active" initial={isScreenshotMode ? false : { opacity: 0, x: 30, filter: 'blur(10px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: -30, filter: 'blur(10px)' }} transition={TRANSITION} className="w-full max-w-md mx-auto">
                  <div className="mb-10 text-center md:text-left">
                    <span className="block text-[10px] font-sans uppercase tracking-[0.2em] text-oz-blue mb-3">New Aviator Registration</span>
                    <h2 className="text-[1.7rem] sm:text-4xl md:text-6xl font-serif text-white mb-3 md:mb-4 leading-tight tracking-tight">Create account</h2>
                    <p className="text-white/[0.78] font-sans font-light text-base md:text-lg">Join Sydney's premier aircraft rental platform for licensed aviation professionals.</p>
                  </div>

                  {suSuccess ? (
                    <div className="py-10 flex flex-col items-center text-center gap-4">
                      <span className="material-symbols-outlined text-oz-blue text-4xl">mark_email_read</span>
                      <p className="text-white font-serif text-2xl tracking-tight">Check your inbox</p>
                      <p className="text-oz-muted font-sans font-light text-sm leading-relaxed max-w-xs">A confirmation link has been sent to <span className="text-white">{suEmail}</span>. Follow the link to activate your account.</p>
                    </div>
                  ) : (
                    <form className="space-y-7" onSubmit={handleSignUp}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-7">
                        <div className="group relative">
                          <label className={FIELD_LABEL_CLASS}>First Name</label>
                          <input type="text" placeholder="e.g. Julian" value={suFirstName} onChange={(e) => setSuFirstName(e.target.value)} required disabled={loading} className={`${FIELD_INPUT_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`} />
                        </div>
                        <div className="group relative">
                          <label className={FIELD_LABEL_CLASS}>Last Name</label>
                          <input type="text" placeholder="e.g. Vance" value={suLastName} onChange={(e) => setSuLastName(e.target.value)} required disabled={loading} className={`${FIELD_INPUT_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`} />
                        </div>
                      </div>

                      <div className="group relative">
                        <label className={FIELD_LABEL_CLASS}>Email Address</label>
                        <input type="email" placeholder="pilot@example.com" value={suEmail} onChange={(e) => setSuEmail(e.target.value)} required disabled={loading} className={`${FIELD_INPUT_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`} />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-7">
                        <div className="group relative">
                          <label className={FIELD_LABEL_CLASS}>Country Code</label>
                          <input
                            type="text"
                            placeholder="+61"
                            value={suPhoneCountryCode}
                            onChange={(e) => {
                              const value = e.target.value
                              if (/^\+?\d{0,4}$/.test(value)) setSuPhoneCountryCode(value)
                            }}
                            disabled={loading}
                            className={`${FIELD_INPUT_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`}
                          />
                        </div>
                        <div className="group relative">
                          <label className={FIELD_LABEL_CLASS}>Phone Number</label>
                          <input
                            type="tel"
                            placeholder="e.g. 412345678"
                            value={suPhoneNumber}
                            onChange={(e) => {
                              const value = e.target.value
                              if (/^\d*$/.test(value)) setSuPhoneNumber(value)
                            }}
                            required
                            disabled={loading}
                            className={`${FIELD_INPUT_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-7">
                        <div className="group relative">
                          <label className={FIELD_LABEL_CLASS}>Password</label>
                          <input type="password" placeholder="••••••••" value={suPassword} onChange={(e) => setSuPassword(e.target.value)} required disabled={loading} className={`${FIELD_INPUT_CLASS} font-mono disabled:opacity-60 disabled:cursor-not-allowed`} />
                        </div>
                        <div className="group relative">
                          <label className={FIELD_LABEL_CLASS}>Confirm Password</label>
                          <input type="password" placeholder="••••••••" value={suConfirm} onChange={(e) => setSuConfirm(e.target.value)} required disabled={loading} className={`${FIELD_INPUT_CLASS} font-mono disabled:opacity-60 disabled:cursor-not-allowed`} />
                        </div>
                      </div>

                      {suError && <p className="text-red-400 text-[11px] font-sans font-light tracking-wide -mt-2">{suError}</p>}

                      <div className="pt-6">
                        <button type="submit" disabled={anyLoading} className="w-full bg-white text-oz-deep py-4 rounded-full font-sans text-xs uppercase tracking-[0.15em] font-bold shadow-[0_4px_16px_rgba(255,255,255,0.1)] hover:bg-gray-100 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
                          {loading ? 'Processing…' : (<><span>Create Account</span><span className="material-symbols-outlined text-[1rem]">arrow_forward</span></>)}
                        </button>
                      </div>

                      <div className="pt-4 mt-2 border-t border-white/5 flex items-center justify-between px-2">
                        <span className="text-oz-muted text-xs font-sans font-light">Already have access?</span>
                        <button type="button" onClick={() => setModeWithReset('signin')} className="text-[10px] font-sans uppercase tracking-[0.15em] text-oz-blue hover:text-white transition-colors">Sign In</button>
                      </div>
                    </form>
                  )}
                </motion.div>
              ) : (
                <motion.div key="signup-inactive" initial={isScreenshotMode ? false : { opacity: 0, x: 20, filter: 'blur(12px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: 20, filter: 'blur(12px)' }} transition={TRANSITION} className="max-w-md w-full flex justify-center my-auto relative">
                  <div className="absolute -z-10 left-1/2 top-1/2 h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6d8fbf]/18 blur-[80px]" />
                  <div className="w-full max-w-[430px] rounded-[26px] border border-white/[0.12] bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent px-7 py-8 md:px-9 md:py-10 shadow-[0_12px_48px_rgba(8,16,30,0.45)] flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-white/[0.08] border border-white/[0.16] flex items-center justify-center mb-6 shadow-[0_0_35px_rgba(154,187,235,0.18)]"><span className="material-symbols-outlined text-white/[0.70] text-2xl">flight_takeoff</span></div>
                    <h2 className="text-[2.2rem] md:text-[2.5rem] font-serif text-white/[0.80] mb-4 tracking-tight">Join the Fleet</h2>
                    <p className="text-white/[0.72] font-sans font-light text-sm md:text-base mb-8 leading-relaxed max-w-[30ch]">Access premium aircraft exclusively for verified pilots. Step into the cockpit with OZRentAPlane.</p>
                    <button onClick={() => setModeWithReset('signup')} className="border border-oz-blue/40 bg-oz-blue/[0.10] px-8 py-3.5 rounded-full text-[10px] uppercase tracking-[0.15em] text-oz-blue hover:bg-oz-blue/[0.16] hover:text-[#d3e4ff] transition-colors duration-300 font-sans shadow-lg backdrop-blur-sm">Create account</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {!isModal && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 text-center pointer-events-none opacity-40">
          <p className="text-[9px] font-sans uppercase tracking-[0.4em] text-white/60 mb-2">OZRentAPlane Authentication</p>
          <p className="text-[10px] font-serif italic text-white/40">Securing your journey to the horizon.</p>
        </div>
      )}
    </div>
  )
}
