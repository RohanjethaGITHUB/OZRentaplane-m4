'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { LoadingButtonContent } from '@/components/ui/Spinner'
import { notifyNewRegistration } from '@/app/actions/auth'

type AuthMode = 'signin' | 'signup'

const EASE_PREMIUM = [0.25, 1, 0.35, 1] as const
const isScreenshotMode = typeof window !== 'undefined' && window.location.search.includes('screenshotMode=1')
const TRANSITION = { duration: isScreenshotMode ? 0 : 1.4, ease: EASE_PREMIUM }

const FIELD_LABEL_CLASS = 'block text-[12px] font-medium text-[#152d5a] mb-1.5'
const FIELD_INPUT_CLASS = 'w-full bg-white border border-[#152d5a]/20 px-4 py-3.5 text-[#152d5a] placeholder:text-[#94a3b8] focus:ring-0 focus:border-[#1a4fd6]/50 focus:outline-none transition-all rounded-xl text-sm'

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
  const [siShowPassword, setSiShowPassword] = useState(false)
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
  const [suShowPassword, setSuShowPassword] = useState(false)
  const [suShowConfirm, setSuShowConfirm] = useState(false)
  const [suError, setSuError] = useState('')
  const [suSuccess, setSuSuccess] = useState(false)

  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const nextPath = normalizeNextPath(searchParams?.get('next') ?? null)

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

  function normalizeNextPath(input: string | null): string {
    if (!input) return '/dashboard'
    if (!input.startsWith('/')) return '/dashboard'
    if (input.startsWith('//')) return '/dashboard'
    return input
  }

  function openForgotPassword() {
    setForgotPasswordOpen(true)
    setForgotError('')
    setForgotSuccess('')
    setForgotEmail(siEmail.trim())
  }

  async function handleForgotPasswordSubmit(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault()
    const email = forgotEmail.trim()
    console.log('forgot password handler called', email)

    setForgotError('')
    setForgotSuccess('')

    if (!email) {
      setForgotError('Email address is required.')
      return
    }

    setForgotLoading(true)
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    })
    setForgotLoading(false)
    console.log('resetPasswordForEmail result', { data, error })

    if (error) {
      setForgotError(error.message || 'Unable to send the password reset email.')
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
      router.push(nextPath)
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
    } else {
      if (data.user) {
        void notifyNewRegistration({
          userId: data.user.id,
          email: suEmail,
          fullName: `${firstName} ${lastName}`.trim(),
          firstName,
          phone: `${phoneCountryCode} ${phoneNumber}`.trim(),
        }).catch((err) => console.error('[signup] notifyNewRegistration failed:', err))
      }

      if (data.session) {
        // keep loading=true until navigation completes to prevent double-submit
        router.push(nextPath)
      } else {
        setLoading(false)
        setSuSuccess(true)
      }
    }
  }

  useEffect(() => {
    onBusyChange?.(anyLoading)
  }, [anyLoading, onBusyChange])

  return (
    <div className={`${isModal ? 'w-full' : 'min-h-screen flex items-center justify-center p-4 bg-[#f0f4ff]'}`}>
      <main className={`${isModal
        ? 'w-full max-w-[1100px] h-[min(calc(100dvh-24px),820px)] min-h-0 rounded-[1.5rem]'
        : 'w-full max-w-[1100px] min-h-[600px] rounded-[1.5rem]'
        } overflow-hidden flex flex-col md:flex-row relative shadow-2xl`}>

        {/* ── Close button ── */}
        {isModal && (
          <button
            type="button"
            onClick={onRequestClose}
            disabled={anyLoading}
            aria-label="Close"
            className="absolute top-4 right-4 z-30 h-9 w-9 rounded-full border border-[#152d5a]/15 bg-white text-[#152d5a]/50 hover:text-[#152d5a] hover:border-[#152d5a]/30 transition-colors disabled:opacity-40 flex items-center justify-center shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">close</span>
          </button>
        )}

        {/* ══ LEFT PANEL — photo + brand ══════════════════════════════════ */}
        <section className="relative hidden md:flex md:w-[42%] flex-shrink-0 flex-col overflow-hidden">
          {/* Background image */}
          <div className="absolute inset-0 z-0">
            <motion.div
              className="w-full h-full"
              initial={isScreenshotMode ? false : undefined}
              animate={{
                scale: 1.04,
                filter: 'blur(0px) brightness(0.82) saturate(1.0)',
              }}
              transition={TRANSITION}
            >
              <Image
                src="/Login-wing.png"
                alt="Aircraft wing at sunset"
                fill
                className="object-cover object-center"
                priority
              />
            </motion.div>
            {/* Gradient overlay — left-heavy for text legibility */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#040d1e]/75 via-[#071528]/55 to-[#0a1a35]/40" />
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-col h-full p-10 lg:p-14">
            {/* Logo */}
            <div className="mb-auto">
              <div className="flex items-center gap-2 mb-12">
                <Image src="/Logo/ozrentaplane-transparent-bg.png" alt="OZ Rent A Plane" width={120} height={32} className="h-8 w-auto" />
              </div>

              {/* Headline */}
              <h2 className="text-white font-serif text-4xl lg:text-5xl leading-tight mb-4 tracking-tight">
                Your journey<br />starts here
              </h2>
              {/* Amber accent line */}
              <div className="w-10 h-[3px] bg-[#e8a020] rounded-full mb-6" />
              <p className="text-white/70 text-[15px] leading-relaxed max-w-[28ch]">
                Access premium aircraft, manage your bookings, and join Australia's most trusted aviation network.
              </p>
            </div>

            {/* Feature list */}
            <div className="space-y-5 my-10">
              {[
                { icon: 'verified_user', title: 'Verified & Trusted', desc: 'Verified pilots. Trusted aircraft. Total peace of mind.' },
                { icon: 'flight_takeoff', title: 'Premium Fleet Access', desc: 'Fly a curated range of aircraft across Australia.' },
                { icon: 'headset_mic', title: 'Dedicated Support', desc: 'Real people. Real support. When you need it.' },
              ].map(f => (
                <div key={f.title} className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-full border border-white/20 bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-white/70 text-[16px]" style={{ fontVariationSettings: "'wght' 300" }}>{f.icon}</span>
                  </div>
                  <div>
                    <p className="text-white text-[13px] font-semibold leading-tight">{f.title}</p>
                    <p className="text-white/55 text-[12px] leading-relaxed mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Quote */}
            <div className="border-t border-white/10 pt-6">
              <p className="text-white/50 text-[13px] italic font-serif leading-relaxed">
                &ldquo;The best way to predict the future is to create it.&rdquo;
              </p>
              <p className="text-white/35 text-[11px] mt-2">— Peter Drucker</p>
            </div>
          </div>
        </section>

        {/* ══ RIGHT PANEL — auth form ══════════════════════════════════════ */}
        <section className="flex-1 bg-white flex flex-col overflow-y-auto">
          <div className="flex-1 flex flex-col justify-center px-8 py-8 sm:px-10 md:px-12 lg:px-14 max-w-[480px] mx-auto w-full">

            {/* Mobile logo */}
            <div className="md:hidden mb-8">
              <Image src="/Logo/ozrentaplane-transparent-bg.png" alt="OZ Rent A Plane" width={100} height={28} className="h-7 w-auto" />
            </div>

            {/* Heading */}
            <div className="mb-8">
              <h1 className="text-[#152d5a] font-serif text-3xl sm:text-4xl leading-tight mb-2">
                {mode === 'signin' ? 'Welcome back, Pilot' : 'Create your account'}
              </h1>
              <p className="text-[#6b7ea8] text-[14px] leading-relaxed">
                {mode === 'signin'
                  ? 'Sign in to access your bookings, saved aircraft and manage your account.'
                  : 'Join Sydney\'s premier aircraft rental platform for licensed pilots.'}
              </p>
            </div>

            {/* Tab switcher */}
            <div className="flex border-b border-[#152d5a]/10 mb-8">
              <button
                type="button"
                onClick={() => setModeWithReset('signin')}
                className={`pb-3 px-1 mr-6 text-[14px] font-medium border-b-2 transition-colors ${mode === 'signin'
                    ? 'border-[#1a4fd6] text-[#1a4fd6]'
                    : 'border-transparent text-[#6b7ea8] hover:text-[#152d5a]'
                  }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setModeWithReset('signup')}
                className={`pb-3 px-1 text-[14px] font-medium border-b-2 transition-colors ${mode === 'signup'
                    ? 'border-[#1a4fd6] text-[#1a4fd6]'
                    : 'border-transparent text-[#6b7ea8] hover:text-[#152d5a]'
                  }`}
              >
                Create account
              </button>
            </div>

            {/* ── SIGN IN FORM ── */}
            {mode === 'signin' && (
              <AnimatePresence mode="wait" initial={false}>
                {!forgotPasswordOpen ? (
                  <motion.form
                    key="signin-form"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-5"
                    onSubmit={handleSignIn}
                  >
                    <div>
                      <label className={FIELD_LABEL_CLASS}>Email address</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#94a3b8] text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>mail</span>
                        <input
                          type="email"
                          placeholder="pilot@example.com"
                          value={siEmail}
                          onChange={e => setSiEmail(e.target.value)}
                          required
                          disabled={loading}
                          className={`${FIELD_INPUT_CLASS} pl-10 disabled:opacity-60`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={FIELD_LABEL_CLASS}>Password</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#94a3b8] text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>lock</span>
                        <input
                          type={siShowPassword ? 'text' : 'password'}
                          placeholder="Enter your password"
                          value={siPassword}
                          onChange={e => setSiPassword(e.target.value)}
                          required
                          disabled={loading}
                          className={`${FIELD_INPUT_CLASS} pl-10 pr-11 font-mono disabled:opacity-60`}
                        />
                        <button
                          type="button"
                          onClick={() => setSiShowPassword(v => !v)}
                          aria-label={siShowPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#94a3b8] hover:text-[#4b6390] transition-colors leading-none"
                        >
                          <span className="material-symbols-outlined text-[18px] leading-none block" style={{ fontVariationSettings: "'wght' 300" }}>
                            {siShowPassword ? 'visibility_off' : 'visibility'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {siError && (
                      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-red-500 text-[16px] flex-shrink-0">error</span>
                        <p className="text-[13px] text-red-600">{siError}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div className="w-4 h-4 rounded border-2 border-[#1a4fd6] bg-[#1a4fd6] flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-white text-[12px]">check</span>
                        </div>
                        <span className="text-[13px] text-[#4b6390]">Remember me</span>
                      </label>
                      <button
                        type="button"
                        onClick={openForgotPassword}
                        className="text-[13px] text-[#e8a020] hover:text-[#d4911a] font-medium transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={anyLoading}
                      aria-busy={loading || undefined}
                      className="w-full bg-[#e8a020] hover:bg-[#d4911a] text-white font-semibold text-sm py-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                      <LoadingButtonContent loading={loading} loadingLabel="Signing in…">
                        SIGN IN
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </LoadingButtonContent>
                    </button>

                    <div className="flex items-center justify-between pt-3 border-t border-[#152d5a]/8">
                      <span className="text-[13px] text-[#6b7ea8]">New to OZ Rent A Plane?</span>
                      <button type="button" onClick={() => setModeWithReset('signup')} className="text-[13px] text-[#e8a020] hover:text-[#d4911a] font-medium transition-colors flex items-center gap-1">
                        Create account
                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </button>
                    </div>
                  </motion.form>
                ) : (
                  <motion.div
                    key="forgot-form"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-5"
                  >
                    <div>
                      <h2 className="text-[#152d5a] font-serif text-2xl leading-tight mb-2">Reset your password</h2>
                      <p className="text-[#6b7ea8] text-[14px] leading-relaxed">
                        We&apos;ll send a password reset link to your email address.
                      </p>
                    </div>

                    <div>
                      <label className={FIELD_LABEL_CLASS}>Email address</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#94a3b8] text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>mail</span>
                        <input
                          type="email"
                          placeholder="pilot@example.com"
                          value={forgotEmail}
                          onChange={e => setForgotEmail(e.target.value)}
                          required
                          disabled={forgotLoading}
                          className={`${FIELD_INPUT_CLASS} pl-10 disabled:opacity-60`}
                        />
                      </div>
                    </div>

                    {forgotError && (
                      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-red-500 text-[16px] flex-shrink-0">error</span>
                        <p className="text-[13px] text-red-600">{forgotError}</p>
                      </div>
                    )}

                    {forgotSuccess && (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-600 text-[16px] flex-shrink-0">check_circle</span>
                        <p className="text-[13px] text-emerald-700">{forgotSuccess}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleForgotPasswordSubmit()
                        }}
                        disabled={forgotLoading}
                        aria-busy={forgotLoading || undefined}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1a4fd6] px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#1847be] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <LoadingButtonContent loading={forgotLoading} loadingLabel="Sending...">
                          Send reset link
                        </LoadingButtonContent>
                      </button>
                      <button
                        type="button"
                        onClick={clearForgotPasswordState}
                        className="text-sm font-medium text-[#6b7ea8] hover:text-[#152d5a] transition-colors"
                      >
                        Back to sign in
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {/* ── SIGN UP FORM ── */}
            {mode === 'signup' && (
              <AnimatePresence mode="wait" initial={false}>
                {!suSuccess ? (
                  <motion.form
                    key="signup-form"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-5"
                    onSubmit={handleSignUp}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className={FIELD_LABEL_CLASS}>First name</label>
                        <input
                          type="text"
                          placeholder="e.g. Julian"
                          value={suFirstName}
                          onChange={e => setSuFirstName(e.target.value)}
                          required
                          disabled={loading}
                          className={`${FIELD_INPUT_CLASS} disabled:opacity-60`}
                        />
                      </div>
                      <div>
                        <label className={FIELD_LABEL_CLASS}>Last name</label>
                        <input
                          type="text"
                          placeholder="e.g. Vance"
                          value={suLastName}
                          onChange={e => setSuLastName(e.target.value)}
                          required
                          disabled={loading}
                          className={`${FIELD_INPUT_CLASS} disabled:opacity-60`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={FIELD_LABEL_CLASS}>Email address</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#94a3b8] text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>mail</span>
                        <input
                          type="email"
                          placeholder="pilot@example.com"
                          value={suEmail}
                          onChange={e => setSuEmail(e.target.value)}
                          required
                          disabled={loading}
                          className={`${FIELD_INPUT_CLASS} pl-10 disabled:opacity-60`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-5">
                      <div>
                        <label className={FIELD_LABEL_CLASS}>Country code</label>
                        <input
                          type="text"
                          placeholder="+61"
                          value={suPhoneCountryCode}
                          onChange={(e) => {
                            const value = e.target.value
                            if (/^\+?\d{0,4}$/.test(value)) setSuPhoneCountryCode(value)
                          }}
                          disabled={loading}
                          className={`${FIELD_INPUT_CLASS} disabled:opacity-60`}
                        />
                      </div>
                      <div>
                        <label className={FIELD_LABEL_CLASS}>Phone number</label>
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
                          className={`${FIELD_INPUT_CLASS} disabled:opacity-60`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className={FIELD_LABEL_CLASS}>Password</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#94a3b8] text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>lock</span>
                          <input
                            type={suShowPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={suPassword}
                            onChange={e => setSuPassword(e.target.value)}
                            required
                            disabled={loading}
                            className={`${FIELD_INPUT_CLASS} pl-10 pr-11 font-mono disabled:opacity-60`}
                          />
                          <button
                            type="button"
                            onClick={() => setSuShowPassword(v => !v)}
                            aria-label={suShowPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#94a3b8] hover:text-[#4b6390] transition-colors leading-none"
                          >
                            <span className="material-symbols-outlined text-[18px] leading-none block" style={{ fontVariationSettings: "'wght' 300" }}>
                              {suShowPassword ? 'visibility_off' : 'visibility'}
                            </span>
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className={FIELD_LABEL_CLASS}>Confirm password</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#94a3b8] text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>lock</span>
                          <input
                            type={suShowConfirm ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={suConfirm}
                            onChange={e => setSuConfirm(e.target.value)}
                            required
                            disabled={loading}
                            className={`${FIELD_INPUT_CLASS} pl-10 pr-11 font-mono disabled:opacity-60`}
                          />
                          <button
                            type="button"
                            onClick={() => setSuShowConfirm(v => !v)}
                            aria-label={suShowConfirm ? 'Hide confirm password' : 'Show confirm password'}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#94a3b8] hover:text-[#4b6390] transition-colors leading-none"
                          >
                            <span className="material-symbols-outlined text-[18px] leading-none block" style={{ fontVariationSettings: "'wght' 300" }}>
                              {suShowConfirm ? 'visibility_off' : 'visibility'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {suError && (
                      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-red-500 text-[16px] flex-shrink-0">error</span>
                        <p className="text-[13px] text-red-600">{suError}</p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={anyLoading}
                      aria-busy={loading || undefined}
                      className="w-full bg-[#e8a020] hover:bg-[#d4911a] text-white font-semibold text-sm py-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                    >
                      <LoadingButtonContent loading={loading} loadingLabel="Processing…">
                        Create account
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </LoadingButtonContent>
                    </button>

                    <div className="flex items-center justify-between pt-3 border-t border-[#152d5a]/8">
                      <span className="text-[13px] text-[#6b7ea8]">Already have an account?</span>
                      <button type="button" onClick={() => setModeWithReset('signin')} className="text-[13px] text-[#e8a020] hover:text-[#d4911a] font-medium transition-colors flex items-center gap-1">
                        Sign in
                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </button>
                    </div>
                  </motion.form>
                ) : (
                  <motion.div
                    key="signup-success"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-5 text-center"
                  >
                    <div className="py-8">
                      <span className="material-symbols-outlined text-[#1a4fd6] text-5xl mb-3">mark_email_read</span>
                      <h2 className="text-[#152d5a] font-serif text-3xl leading-tight mb-2">Check your inbox</h2>
                      <p className="text-[#6b7ea8] text-[14px] leading-relaxed">
                        A confirmation link has been sent to <span className="text-[#152d5a]">{suEmail}</span>. Follow the link to activate your account.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
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
