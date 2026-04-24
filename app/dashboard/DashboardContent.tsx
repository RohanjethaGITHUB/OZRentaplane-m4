'use client'

import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { Profile, VerificationStatus, UserDocument, VerificationEvent, RequestKind } from '@/lib/supabase/types'
import { fmtTimestamp } from '@/lib/utils/format'

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  user: User
  profile: Profile | null
  documents: UserDocument[]
  events: VerificationEvent[]
}

// ─── Status display config ───────────────────────────────────────────────────

type StatusConfig = {
  badge:         string
  pillColor:     'green' | 'blue' | 'amber' | 'red' | 'slate'
  pulse:         boolean
  glowFrom:      string
  progressLabel: string
}

const STATUS_CONFIG: Record<VerificationStatus, StatusConfig> = {
  not_started: {
    badge:         'Setup Required',
    pillColor:     'slate',
    pulse:         false,
    glowFrom:      'from-white/10',
    progressLabel: '25% Complete',
  },
  pending_review: {
    badge:         'Pending Review',
    pillColor:     'blue',
    pulse:         true,
    glowFrom:      'from-blue-500/20',
    progressLabel: '75% Complete',
  },
  verified: {
    badge:         'Ready to Fly',
    pillColor:     'green',
    pulse:         false,
    glowFrom:      'from-green-500/20',
    progressLabel: 'Approved',
  },
  rejected: {
    badge:         'Action Required',
    pillColor:     'red',
    pulse:         false,
    glowFrom:      'from-red-500/20',
    progressLabel: 'Action Required',
  },
  on_hold: {
    badge:         'On Hold',
    pillColor:     'amber',
    pulse:         true,
    glowFrom:      'from-amber-500/20',
    progressLabel: 'Action Required',
  },
}

// ─── Hero card content by status ────────────────────────────────────────────

type HeroContent = { subtitle: string; title: string; body: string; cta1: string; cta2: string; icon: string }

const HERO: Record<VerificationStatus, HeroContent> = {
  not_started: {
    subtitle: 'Pilot Onboarding',
    title:    'Complete Your Verification',
    body:     "To access Sydney's Cessna 172 fleet, complete a one-time verification process. Upload your pilot licence, medical certificate, and proof of identity to get started.",
    cta1:     'Upload Documents',
    cta2:     'Learn More',
    icon:     'how_to_reg',
  },
  pending_review: {
    subtitle: 'Certification Stage',
    title:    'Verification Under Review',
    body:     "We've received your documents and your account is currently under review. Our safety officers are validating your certifications for the Sydney fleet. You'll be notified via email once approved.",
    cta1:     'View Documents',
    cta2:     'Contact Support',
    icon:     'verified_user',
  },
  verified: {
    subtitle: 'Access Granted',
    title:    "You're Cleared to Fly",
    body:     'Your pilot credentials have been verified and your account is fully approved. Browse available aircraft and submit booking requests for the Sydney Cessna 172 fleet.',
    cta1:     'Book a Flight',
    cta2:     'View My Bookings',
    icon:     'flight_takeoff',
  },
  rejected: {
    subtitle: 'Verification Outcome',
    title:    'Verification Unsuccessful',
    body:     'Your verification could not be completed with the documents provided. Please contact our support team for details, or submit updated documentation for re-review.',
    cta1:     'Contact Support',
    cta2:     'Resubmit Documents',
    icon:     'report_problem',
  },
  on_hold: {
    subtitle: 'Verification On Hold',
    title:    'Additional Information Required',
    body:     'Your verification is currently on hold. Our team has reviewed your application and requires additional information or documentation before we can proceed.',
    cta1:     'Upload Documents',
    cta2:     'View Documents',
    icon:     'pending_actions',
  },
}

// ─── Steps by status ─────────────────────────────────────────────────────────

type StepState = 'done' | 'active' | 'pending' | 'failed'
type Step      = { label: string; state: StepState }

const STEPS: Record<VerificationStatus, Step[]> = {
  not_started: [
    { label: 'Account created',           state: 'done'    },
    { label: 'Upload pilot licence',       state: 'pending' },
    { label: 'Upload medical certificate', state: 'pending' },
    { label: 'Upload proof of identity',   state: 'pending' },
  ],
  pending_review: [
    { label: 'Profile completed',  state: 'done'   },
    { label: 'Licence uploaded',   state: 'done'   },
    { label: 'Medical uploaded',   state: 'done'   },
    { label: 'Awaiting approval',  state: 'active' },
  ],
  verified: [
    { label: 'Profile completed', state: 'done' },
    { label: 'Licence verified',  state: 'done' },
    { label: 'Medical verified',  state: 'done' },
    { label: 'Account approved',  state: 'done' },
  ],
  rejected: [
    { label: 'Account created',            state: 'done'   },
    { label: 'Documents submitted',        state: 'done'   },
    { label: 'Verification declined',      state: 'failed' },
    { label: 'Contact support to proceed', state: 'active' },
  ],
  on_hold: [
    { label: 'Account created',           state: 'done'   },
    { label: 'Documents submitted',       state: 'done'   },
    { label: 'Additional info requested', state: 'failed' },
    { label: 'Resubmit for review',       state: 'active' },
  ],
}

// ─── Step icon ───────────────────────────────────────────────────────────────

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span className="material-symbols-outlined text-blue-400 text-xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
        check_circle
      </span>
    )
  }
  if (state === 'active') {
    return (
      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-blue-400 ring-4 ring-blue-400/20" />
      </div>
    )
  }
  if (state === 'failed') {
    return (
      <span className="material-symbols-outlined text-red-400 text-xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
        cancel
      </span>
    )
  }
  return (
    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
      <div className="w-4 h-4 rounded-full border border-white/15" />
    </div>
  )
}

// ─── Event display config ────────────────────────────────────────────────────

const EVENT_DISPLAY: Record<string, { icon: string; color: string }> = {
  submitted:   { icon: 'upload_file',   color: 'text-blue-400'  },
  resubmitted: { icon: 'upload_file',   color: 'text-blue-400'  },
  approved:    { icon: 'verified_user', color: 'text-green-400' },
  rejected:    { icon: 'person_off',    color: 'text-red-400'   },
  on_hold:     { icon: 'pause_circle',  color: 'text-amber-400' },
  message:     { icon: 'chat',          color: 'text-slate-400' },
}

// ─── Shared card class ────────────────────────────────────────────────────────

const CARD = 'bg-gradient-to-br from-[#0c1525] to-[#080e1c] border border-white/[0.07] rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.35)]'

// ─── Main customer overview component ─────────────────────────────────────────

export default function DashboardContent({ user, profile, documents, events }: Props) {
  const router = useRouter()

  const displayName  = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const firstName    = displayName.split(' ')[0] ?? displayName
  const initials     = displayName.split(' ').filter(Boolean).map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  const status       = (profile?.verification_status ?? 'not_started') as VerificationStatus
  const statusCfg    = STATUS_CONFIG[status]
  const hero         = HERO[status]

  const isVerified   = status === 'verified'
  const isNotStarted = status === 'not_started'
  const isOnHold     = status === 'on_hold'

  // Dynamic steps: reflect uploaded docs
  const baseSteps = STEPS[status]
  const steps = baseSteps.map(step => {
    if (status === 'not_started' || status === 'rejected' || status === 'on_hold') {
      if (step.label === 'Upload pilot licence' && documents.some(d => d.document_type === 'pilot_licence'))
        return { ...step, state: 'done' as StepState }
      if (step.label === 'Upload medical certificate' && documents.some(d => d.document_type === 'medical_certificate'))
        return { ...step, state: 'done' as StepState }
      if (step.label === 'Upload proof of identity' && documents.some(d => d.document_type === 'photo_id'))
        return { ...step, state: 'done' as StepState }
    }
    return step
  })

  const latestHoldEvent   = events.find(e => e.event_type === 'on_hold')
  const holdRequestKind: RequestKind = latestHoldEvent?.request_kind ?? 'document_request'
  const isDocRequest      = holdRequestKind === 'document_request'
  const unreadCount       = events.filter(e => !e.is_read).length

  // Pill color mapping
  const PILL_BG: Record<typeof statusCfg.pillColor, string> = {
    green: 'bg-green-500/15 border-green-500/30 text-green-400',
    blue:  'bg-blue-500/15 border-blue-500/30 text-blue-400',
    amber: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    red:   'bg-red-500/15 border-red-500/30 text-red-400',
    slate: 'bg-white/[0.06] border-white/10 text-slate-400',
  }
  const DOT_BG: Record<typeof statusCfg.pillColor, string> = {
    green: 'bg-green-400',
    blue:  'bg-blue-400',
    amber: 'bg-amber-400',
    red:   'bg-red-400',
    slate: 'bg-slate-500',
  }

  // Derive licence type label from documents for profile card
  const pilotLicenceDoc = documents.find(d => d.document_type === 'pilot_licence')
  const licenceTypeLabel = pilotLicenceDoc?.licence_type
    ? `${pilotLicenceDoc.licence_type} Licence`
    : null

  return (
    <div>

      {/* ══ HERO — image-backed welcome ══════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/customer/customer-overview-hero.png')" }}
        />
        {/* Primary dark overlay — keeps text readable */}
        <div className="absolute inset-0 bg-[#071428]/65" />
        {/* Cinematic vignette: darken edges, lighten centre-top */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#060d18]/40 via-transparent to-[#060d18]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#060d18]/50 via-transparent to-[#060d18]/50" />
        {/* Extra deep bottom fade — blends into two-panel section */}
        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-[#060d18] to-transparent" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-6 py-24 md:py-28 max-w-2xl mx-auto">
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-blue-300/70 mb-4">
            Member Overview
          </p>
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-white mb-4 leading-tight drop-shadow-lg">
            Welcome back, {firstName}
          </h1>
          <p className="text-white/65 text-[15px] leading-relaxed mb-6 max-w-lg">
            Manage your aircraft access, documents, bookings, and messages from your private pilot portal.
          </p>
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${PILL_BG[statusCfg.pillColor]}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_BG[statusCfg.pillColor]} ${statusCfg.pulse ? 'animate-pulse' : ''}`} />
            {statusCfg.badge}
          </div>
        </div>
      </section>

      {/* ══ TWO-PANEL STATUS SECTION ════════════════════════════════════════ */}
      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 -mt-2 pb-0 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_285px] xl:grid-cols-[1fr_305px] gap-5 items-stretch">

          {/* ─ Left: status card with background image ─────────────────────── */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_8px_48px_rgba(0,0,0,0.55)] min-h-[240px]">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: "url('/customer/customer-access.png')" }}
            />
            {/* Left-heavy gradient overlay keeps text always readable */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#080f20]/95 via-[#080f20]/82 to-[#080f20]/35" />
            <div className={`absolute inset-0 bg-gradient-to-tr ${statusCfg.glowFrom} to-transparent opacity-20`} />

            <div className="relative z-10 p-8 md:p-10 flex flex-col justify-end h-full min-h-[240px]">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-400/80 mb-2 block">
                {hero.subtitle}
              </span>
              <h2 className="text-2xl md:text-[28px] font-serif text-white leading-tight tracking-tight mb-3">
                {hero.title}
              </h2>
              <p className="text-white/55 text-sm leading-relaxed max-w-md mb-6">
                {hero.body}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => router.push(isVerified ? '/dashboard/bookings/new' : '/dashboard/documents')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                >
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 400, 'FILL' 0" }}>
                    {hero.icon}
                  </span>
                  {hero.cta1}
                </button>
                <button
                  onClick={() => router.push(isVerified ? '/dashboard/bookings' : '/')}
                  className="px-5 py-2.5 border border-white/20 hover:border-white/35 hover:bg-white/[0.05] text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
                >
                  {hero.cta2}
                </button>
              </div>
            </div>
          </div>

          {/* ─ Right: Pilot Profile card ─────────────────────────────────── */}
          <div className={`${CARD} p-6 flex flex-col`}>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-5">
              Pilot Profile
            </h3>

            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-full bg-[#a7c8ff]/10 border border-[#a7c8ff]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[14px] font-bold text-[#a7c8ff]">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                {licenceTypeLabel && (
                  <p className="text-[11px] text-slate-500 mt-0.5">{licenceTypeLabel}</p>
                )}
                {profile?.pilot_arn && (
                  <p className="text-[10px] text-slate-600 font-mono mt-0.5">{profile.pilot_arn}</p>
                )}
              </div>
            </div>

            <div className="h-px bg-white/[0.06] mb-4" />

            <div className="space-y-2 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Account Status</p>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${PILL_BG[statusCfg.pillColor]}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_BG[statusCfg.pillColor]} ${statusCfg.pulse ? 'animate-pulse' : ''}`} />
                {statusCfg.badge}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {isVerified
                  ? 'All documents up to date'
                  : status === 'pending_review'
                  ? 'Documents under review'
                  : 'Complete verification to fly'}
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <button
                onClick={() => router.push('/dashboard/settings')}
                className="text-[10px] text-slate-500 hover:text-blue-300 font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5"
              >
                View Account
                <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ══ MAIN CONTENT ════════════════════════════════════════════════════ */}
      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10 space-y-8">

        {/* On-Hold Alert Banner */}
        {isOnHold && (
          <section className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-400 text-xl" style={{ fontVariationSettings: "'wght' 300" }}>
                pending_actions
              </span>
              <h4 className="text-xs font-bold uppercase tracking-widest text-amber-400">
                {isDocRequest ? 'Action Required — Upload Documents' : 'Action Required — Response Needed'}
              </h4>
            </div>
            {latestHoldEvent?.body ? (
              <p className="text-sm text-white/80 leading-relaxed pl-8">{latestHoldEvent.body}</p>
            ) : (
              <p className="text-sm text-amber-200/60 leading-relaxed pl-8">
                Our team requires additional information before your verification can proceed.
              </p>
            )}
            <div className="pl-8">
              <button
                onClick={() => router.push('/dashboard/documents')}
                className="flex items-center gap-2 px-6 py-3 bg-amber-500/15 border border-amber-400/30 text-amber-300 hover:bg-amber-500/25 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>
                  {isDocRequest ? 'upload_file' : 'chat'}
                </span>
                {isDocRequest ? 'Upload & Resubmit' : 'Reply to Request'}
              </button>
            </div>
          </section>
        )}

        {/* 2×2 Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Verification Steps */}
          <div className={`${CARD} p-7 space-y-5`}>
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80">Verification Steps</h3>
              <span className="text-[10px] font-medium tracking-wide text-slate-500">{statusCfg.progressLabel}</span>
            </div>
            <ul className="space-y-4">
              {steps.map(step => (
                <li key={step.label} className={`flex items-center gap-4 ${
                  step.state === 'active'  ? 'text-white' :
                  step.state === 'failed'  ? 'text-red-400/80' :
                  step.state === 'pending' ? 'text-white/25' :
                  'text-white/45'
                }`}>
                  <StepIcon state={step.state} />
                  <span className={`text-sm ${step.state === 'active' ? 'font-medium' : 'font-light'}`}>
                    {step.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Documents summary */}
          <div className={`${CARD} p-7 flex flex-col justify-between`}>
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80">My Documents</h3>
                <span className="material-symbols-outlined text-slate-600 text-sm">description</span>
              </div>
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 gap-3 text-center">
                  <span className="material-symbols-outlined text-white/10 text-4xl" style={{ fontVariationSettings: "'wght' 100, 'FILL' 0" }}>upload_file</span>
                  <p className="text-sm text-slate-500 font-light leading-relaxed">
                    No documents uploaded yet. Start with your pilot licence.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {[
                    { key: 'pilot_licence',       label: 'Pilot Licence' },
                    { key: 'medical_certificate',  label: 'Medical Certificate' },
                    { key: 'photo_id',             label: 'Photo ID' },
                  ].map(({ key, label }) => {
                    const uploaded = documents.some(d => d.document_type === key)
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-slate-400 font-light">{label}</span>
                        {uploaded
                          ? <span className="text-[9px] font-bold text-blue-400 uppercase px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded tracking-widest">Uploaded</span>
                          : <span className="text-[9px] font-bold text-slate-500 uppercase px-2 py-1 border border-white/8 rounded tracking-widest">Missing</span>
                        }
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <button
              onClick={() => router.push('/dashboard/documents')}
              className="mt-6 w-full py-3 border-t border-white/[0.06] hover:bg-white/[0.04] text-slate-500 hover:text-white transition-all text-[10px] font-bold uppercase tracking-[0.15em] flex items-center justify-center gap-2 rounded-lg"
            >
              {documents.length === 0 ? 'Upload Documents' : 'Manage Documents'}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Bookings card */}
          <div className={`${CARD} p-7 flex flex-col items-center justify-center text-center space-y-4 min-h-[200px]`}>
            <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
              <span className={`material-symbols-outlined text-2xl ${isVerified ? 'text-blue-400/60' : 'text-blue-400/25'}`}>
                flight_takeoff
              </span>
            </div>
            {isVerified ? (
              <>
                <h3 className="text-lg font-serif text-white">Ready to book</h3>
                <p className="text-sm text-slate-500 max-w-xs leading-relaxed font-light">
                  Browse available windows and request the Sydney Cessna 172.
                </p>
                <button
                  onClick={() => router.push('/dashboard/bookings/new')}
                  className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400 border-b border-blue-400/30 pb-0.5 hover:border-blue-400 transition-all"
                >
                  Book a Flight
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-serif text-white">Booking locked</h3>
                <p className="text-sm text-slate-500 max-w-xs leading-relaxed font-light">
                  {isNotStarted
                    ? 'Complete your verification to unlock aircraft booking.'
                    : isOnHold
                    ? 'Resolve the hold request to unlock booking access.'
                    : "Once your account is approved, you'll be able to request bookings here."}
                </p>
              </>
            )}
          </div>

          {/* Support / Messages */}
          <div className={`${CARD} p-7 flex flex-col justify-between relative overflow-hidden group hover:border-white/[0.1] transition-colors min-h-[200px]`}>
            <div className="absolute -right-6 -bottom-6 opacity-[0.04] group-hover:opacity-[0.06] transition-opacity select-none">
              <span className="material-symbols-outlined text-[120px] text-white">contact_support</span>
            </div>
            <div className="space-y-3 relative z-10">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80">Need Help?</h3>
              <p className="text-sm text-slate-500 leading-relaxed font-light">
                {status === 'rejected' || isOnHold
                  ? "Our team can review your case and guide you through the re-submission process."
                  : 'Questions about onboarding, documents, or an upcoming trip? Our team is here.'}
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/messages')}
              className="relative z-10 w-fit mt-6 px-5 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] rounded-full text-[10px] text-white font-bold uppercase tracking-[0.15em] transition-all"
            >
              View Messages
            </button>
          </div>

        </section>

        {/* Verification History */}
        {events.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Verification Updates</h3>
              {unreadCount > 0 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="space-y-3">
              {events.map(ev => {
                const disp         = EVENT_DISPLAY[ev.event_type] ?? EVENT_DISPLAY.message
                const isCustomerMsg = ev.actor_role === 'customer'
                const when         = fmtTimestamp(ev.created_at)
                return (
                  <div
                    key={ev.id}
                    className={`${CARD} p-5 flex gap-4 transition-colors ${!ev.is_read ? 'border-white/10' : ''}`}
                  >
                    <div className="flex flex-col items-center flex-shrink-0 pt-1">
                      {!ev.is_read && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`material-symbols-outlined text-base ${isCustomerMsg ? 'text-blue-300/50' : disp.color}`}
                            style={{ fontVariationSettings: "'wght' 300" }}
                          >
                            {isCustomerMsg ? 'person' : disp.icon}
                          </span>
                          <p className="text-sm font-semibold text-white">{ev.title}</p>
                          {isCustomerMsg && (
                            <span className="text-[9px] uppercase tracking-widest font-bold text-white/25 border border-white/10 px-1.5 py-0.5 rounded">You</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-600 whitespace-nowrap font-mono flex-shrink-0">{when}</span>
                      </div>
                      {ev.body && (
                        <p className="text-sm text-slate-400 leading-relaxed">{ev.body}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
