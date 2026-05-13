'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

type AuthMode = 'signin' | 'signup'
type OAuthProvider = 'google'

const EASE_PREMIUM = [0.25, 1, 0.35, 1] as const
const TRANSITION = { duration: 1.4, ease: EASE_PREMIUM }

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function SpinIcon() {
  return (
    <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="30" />
    </svg>
  )
}

const PROVIDERS: { id: OAuthProvider; label: string; Icon: () => JSX.Element }[] = [
  { id: 'google', label: 'Google', Icon: GoogleIcon },
]

const FIELD_LABEL_CLASS = 'block text-[10px] font-sans uppercase tracking-[0.2em] text-white/[0.72] mb-1.5 group-focus-within:text-oz-blue transition-colors'
const FIELD_INPUT_CLASS = 'w-full bg-white/[0.09] border border-white/30 px-3.5 py-3.5 text-white placeholder:text-white/50 focus:ring-0 focus:border-oz-blue focus:bg-white/[0.13] transition-all outline-none font-sans rounded-xl'

interface SocialButtonsProps {
  context: 'signin' | 'signup'
  oauthLoading: OAuthProvider | null
  oauthError: string
  disabled: boolean
  unavailableProviders: Set<OAuthProvider>
  onSignIn: (provider: OAuthProvider) => void
}

function SocialButtons({ context, oauthLoading, oauthError, disabled, unavailableProviders, onSignIn }: SocialButtonsProps) {
  const availableProviders = PROVIDERS.filter(({ id }) => !unavailableProviders.has(id))
  if (!availableProviders.length) return null

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {availableProviders.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSignIn(id)}
            disabled={disabled}
            aria-label={context === 'signin' ? `Continue with ${label}` : `Sign up with ${label}`}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/[0.12] border border-white/[0.34] hover:bg-white/[0.17] hover:border-oz-blue/50 transition-all duration-300 text-white/95 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {oauthLoading === id ? <SpinIcon /> : <Icon />}
            <span className="text-[10px] font-sans uppercase tracking-[0.12em]">{context === 'signin' ? 'Continue with Google' : 'Sign up with Google'}</span>
          </button>
        ))}
      </div>

      {oauthError && <p className="text-red-400 text-[11px] font-sans font-light tracking-wide">{oauthError}</p>}
    </div>
  )
}

function EmailDivider({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="flex-1 h-px bg-white/[0.26]" />
      <span className="text-[10px] font-sans uppercase tracking-[0.2em] text-white/60 whitespace-nowrap">{text}</span>
      <div className="flex-1 h-px bg-white/[0.26]" />
    </div>
  )
}

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
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null)
  const [oauthError, setOauthError] = useState('')
  const [unavailableProviders, setUnavailableProviders] = useState<Set<OAuthProvider>>(() => {
    const rawProviders = process.env.NEXT_PUBLIC_AUTH_ENABLED_PROVIDERS
    if (!rawProviders) return new Set()
    const allowed = rawProviders.split(',').map((value) => value.trim().toLowerCase()) as OAuthProvider[]
    return new Set(PROVIDERS.map((provider) => provider.id).filter((id) => !allowed.includes(id)))
  })

  const anyLoading = loading || !!oauthLoading
  const isModal = presentation === 'modal'

  function clearErrors() {
    setSiError('')
    setSuError('')
    setOauthError('')
  }

  function setModeWithReset(nextMode: AuthMode) {
    clearErrors()
    setSuSuccess(false)
    setMode(nextMode)
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    clearErrors()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: siEmail, password: siPassword })
    setLoading(false)
    if (error) setSiError(error.message)
    else router.push('/dashboard')
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
          phone_number: phoneNumber || null,
        },
      },
    })
    setLoading(false)

    if (error) setSuError(error.message)
    else if (data.session) router.push('/dashboard')
    else setSuSuccess(true)
  }

  async function handleOAuthSignIn(provider: OAuthProvider) {
    if (unavailableProviders.has(provider)) return
    clearErrors()
    setOauthLoading(provider)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      const message = error.message.toLowerCase()
      if (
        message.includes('unsupported provider') ||
        message.includes('provider is not enabled') ||
        message.includes('not enabled')
      ) {
        setUnavailableProviders((prev) => new Set(prev).add(provider))
      }
      setOauthError(error.message)
      setOauthLoading(null)
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

      <main className={`${isModal ? 'w-full max-w-[1220px] h-[min(calc(100vh-48px),880px)] min-h-0 rounded-[1.65rem]' : 'w-full max-w-[1300px] h-auto my-auto md:min-h-[700px] md:h-[calc(100vh-160px)] md:max-h-[900px] rounded-2xl md:rounded-[2rem]'} bg-[#0A101C]/80 backdrop-blur-2xl overflow-hidden flex flex-col md:flex-row relative shadow-[0_40px_100px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-white/10`}>
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
        <section className="relative flex-1 min-h-[400px] md:min-h-full overflow-hidden border-b md:border-b-0 md:border-r border-white/5">
          <div className="absolute inset-0 z-0">
            <motion.div className="w-full h-full" initial={false} animate={{ scale: mode === 'signin' ? 1.06 : 1.09, filter: mode === 'signin' ? 'blur(12px) brightness(0.42) contrast(0.9) saturate(0.72)' : 'blur(15px) brightness(0.34) contrast(0.86) saturate(0.66)' }} transition={TRANSITION}>
              <Image src="/Cockpit-twilight.webp" alt="Cockpit at twilight" fill className="object-cover" priority />
            </motion.div>
            <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-[#040a15]/94 via-[#071225]/90 to-[#0a1730]/84 pointer-events-none" />
            <div className="absolute inset-0 bg-[#081224]/46 pointer-events-none" />
          </div>

          <div className="relative z-10 w-full h-full p-8 md:p-14 lg:p-20 flex flex-col">
            <div className="flex-1 flex flex-col justify-center">
              <AnimatePresence mode="popLayout" initial={false}>
                {mode === 'signin' ? (
                  <motion.div key="signin-active" initial={{ opacity: 0, x: -30, filter: 'blur(10px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: 30, filter: 'blur(10px)' }} transition={TRANSITION} className="max-w-md w-full">
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-white mb-4 leading-tight tracking-tight">Welcome Back, Pilot</h1>
                    <p className="text-white/[0.78] font-sans font-light mb-10 text-lg tracking-wide">Your aircraft is waiting. Please authenticate to access your dashboard.</p>
                    <form className="space-y-7" onSubmit={handleSignIn}>
                      <SocialButtons context="signin" oauthLoading={oauthLoading} oauthError={oauthError} unavailableProviders={unavailableProviders} disabled={anyLoading} onSignIn={handleOAuthSignIn} />
                      <EmailDivider text="or sign in with email" />
                      <div className="group relative">
                        <label className={FIELD_LABEL_CLASS}>Email Address</label>
                        <input type="email" placeholder="captain@ozrentaplane.com.au" value={siEmail} onChange={(e) => setSiEmail(e.target.value)} required className={FIELD_INPUT_CLASS} />
                      </div>
                      <div className="group relative">
                        <label className={FIELD_LABEL_CLASS}>Password</label>
                        <input type="password" placeholder="••••••••" value={siPassword} onChange={(e) => setSiPassword(e.target.value)} required className={`${FIELD_INPUT_CLASS} font-mono`} />
                      </div>
                      {siError && <p className="text-red-400 text-[11px] font-sans font-light tracking-wide -mt-2">{siError}</p>}
                      <div className="pt-8 flex items-center justify-between">
                        <button type="submit" disabled={anyLoading} className="bg-gradient-to-br from-oz-blue to-oz-blue-dim text-oz-deep px-8 py-3.5 rounded-full font-sans text-xs uppercase tracking-[0.15em] font-bold shadow-[0_4px_16px_rgba(167,200,255,0.15)] hover:shadow-[0_4px_24px_rgba(167,200,255,0.25)] hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">{loading ? 'Signing In…' : 'Sign In'}</button>
                        <a href="#" className="text-[10px] font-sans uppercase tracking-[0.1em] text-white/[0.66] hover:text-white transition-colors">Forgot password?</a>
                      </div>

                      <div className="pt-6 mt-2 border-t border-white/5 flex items-center justify-between">
                        <span className="text-white/[0.72] text-xs font-sans font-light">New pilot?</span>
                        <button type="button" onClick={() => setModeWithReset('signup')} className="text-[10px] font-sans uppercase tracking-[0.15em] text-oz-blue hover:text-white transition-colors">Create account</button>
                      </div>
                    </form>
                  </motion.div>
                ) : (
                  <motion.div key="signin-inactive" initial={{ opacity: 0, x: -20, filter: 'blur(12px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: -20, filter: 'blur(12px)' }} transition={TRANSITION} className="max-w-md w-full my-auto relative flex justify-center">
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

        <section className="relative flex-1 min-h-[420px] md:min-h-full overflow-hidden">
          <div className="absolute inset-0 z-0">
            <motion.div className="w-full h-full" initial={false} animate={{ scale: mode === 'signup' ? 1.06 : 1.09, filter: mode === 'signup' ? 'blur(12px) brightness(0.42) contrast(0.9) saturate(0.74)' : 'blur(15px) brightness(0.34) contrast(0.86) saturate(0.66)' }} transition={TRANSITION}>
              <Image src="/Pilot&aircraftTwilight.webp" alt="Aircraft on tarmac at twilight" fill className="object-cover" priority />
            </motion.div>
            <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-l from-[#040a15]/94 via-[#071225]/90 to-[#0a1730]/84 pointer-events-none" />
            <div className="absolute inset-0 bg-[#081224]/46 pointer-events-none" />
          </div>

          <div className="relative z-10 w-full h-full min-h-0 p-8 md:p-14 lg:p-20 flex flex-col items-center justify-start overflow-y-auto">
            <AnimatePresence mode="popLayout" initial={false}>
              {mode === 'signup' ? (
                <motion.div key="signup-active" initial={{ opacity: 0, x: 30, filter: 'blur(10px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: -30, filter: 'blur(10px)' }} transition={TRANSITION} className="w-full max-w-md mx-auto">
                  <div className="mb-10 text-center md:text-left">
                    <span className="block text-[10px] font-sans uppercase tracking-[0.2em] text-oz-blue mb-3">New Aviator Registration</span>
                    <h2 className="text-4xl md:text-6xl font-serif text-white mb-4 leading-tight tracking-tight">Create account</h2>
                    <p className="text-white/[0.78] font-sans font-light text-lg">Join Sydney's premier aircraft rental platform for licensed aviation professionals.</p>
                  </div>

                  {suSuccess ? (
                    <div className="py-10 flex flex-col items-center text-center gap-4">
                      <span className="material-symbols-outlined text-oz-blue text-4xl">mark_email_read</span>
                      <p className="text-white font-serif text-2xl tracking-tight">Check your inbox</p>
                      <p className="text-oz-muted font-sans font-light text-sm leading-relaxed max-w-xs">A confirmation link has been sent to <span className="text-white">{suEmail}</span>. Follow the link to activate your account.</p>
                    </div>
                  ) : (
                    <form className="space-y-7" onSubmit={handleSignUp}>
                      <SocialButtons context="signup" oauthLoading={oauthLoading} oauthError={oauthError} unavailableProviders={unavailableProviders} disabled={anyLoading} onSignIn={handleOAuthSignIn} />
                      <EmailDivider text="or create account with email" />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-7">
                        <div className="group relative">
                          <label className={FIELD_LABEL_CLASS}>First Name</label>
                          <input type="text" placeholder="e.g. Julian" value={suFirstName} onChange={(e) => setSuFirstName(e.target.value)} required className={FIELD_INPUT_CLASS} />
                        </div>
                        <div className="group relative">
                          <label className={FIELD_LABEL_CLASS}>Last Name</label>
                          <input type="text" placeholder="e.g. Vance" value={suLastName} onChange={(e) => setSuLastName(e.target.value)} required className={FIELD_INPUT_CLASS} />
                        </div>
                      </div>

                      <div className="group relative">
                        <label className={FIELD_LABEL_CLASS}>Email Address</label>
                        <input type="email" placeholder="pilot@example.com" value={suEmail} onChange={(e) => setSuEmail(e.target.value)} required className={FIELD_INPUT_CLASS} />
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
                            className={FIELD_INPUT_CLASS}
                          />
                        </div>
                        <div className="group relative">
                          <label className={FIELD_LABEL_CLASS}>Phone Number (Optional)</label>
                          <input
                            type="tel"
                            placeholder="e.g. 412345678"
                            value={suPhoneNumber}
                            onChange={(e) => {
                              const value = e.target.value
                              if (/^\d*$/.test(value)) setSuPhoneNumber(value)
                            }}
                            className={FIELD_INPUT_CLASS}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-7">
                        <div className="group relative">
                          <label className={FIELD_LABEL_CLASS}>Password</label>
                          <input type="password" placeholder="••••••••" value={suPassword} onChange={(e) => setSuPassword(e.target.value)} required className={`${FIELD_INPUT_CLASS} font-mono`} />
                        </div>
                        <div className="group relative">
                          <label className={FIELD_LABEL_CLASS}>Confirm Password</label>
                          <input type="password" placeholder="••••••••" value={suConfirm} onChange={(e) => setSuConfirm(e.target.value)} required className={`${FIELD_INPUT_CLASS} font-mono`} />
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
                <motion.div key="signup-inactive" initial={{ opacity: 0, x: 20, filter: 'blur(12px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: 20, filter: 'blur(12px)' }} transition={TRANSITION} className="max-w-md w-full flex justify-center my-auto relative">
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
