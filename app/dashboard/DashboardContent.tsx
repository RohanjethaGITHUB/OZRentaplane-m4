'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import type { User } from '@supabase/supabase-js'
import type { Profile, VerificationStatus, UserDocument, VerificationEvent, RequestKind } from '@/lib/supabase/types'
import DocumentsPanel from './DocumentsPanel'
import { createClient } from '@/lib/supabase/client'
import { fmtTimestamp } from '@/lib/utils/format'

// ─── Shell types ─────────────────────────────────────────────────────────────

type Tab = 'Dashboard' | 'My Profile' | 'Documents' | 'Bookings' | 'Support'

type Props = {
  user: User
  profile: Profile | null
  documents: UserDocument[]
  events: VerificationEvent[]
}

// ─── Status display config ───────────────────────────────────────────────────

type StatusConfig = {
  badge: string
  accent: string
  dot: string
  pulse: boolean
  glowFrom: string
  progressLabel: string
}

const STATUS_CONFIG: Record<VerificationStatus, StatusConfig> = {
  not_started: {
    badge: 'Setup Required',
    accent: 'text-white/60',
    dot: 'bg-white/40',
    pulse: false,
    glowFrom: 'from-white/10',
    progressLabel: '25% Complete',
  },
  pending_review: {
    badge: 'Pending Review',
    accent: 'text-oz-blue',
    dot: 'bg-oz-blue',
    pulse: true,
    glowFrom: 'from-oz-blue/20',
    progressLabel: '75% Complete',
  },
  verified: {
    badge: 'Verified',
    accent: 'text-green-400',
    dot: 'bg-green-400',
    pulse: false,
    glowFrom: 'from-green-500/20',
    progressLabel: 'Complete',
  },
  rejected: {
    badge: 'Action Required',
    accent: 'text-red-400',
    dot: 'bg-red-400',
    pulse: false,
    glowFrom: 'from-red-500/20',
    progressLabel: 'Action Required',
  },
  on_hold: {
    badge: 'On Hold',
    accent: 'text-amber-400',
    dot: 'bg-amber-400',
    pulse: true,
    glowFrom: 'from-amber-500/20',
    progressLabel: 'Action Required',
  },
}

// ─── Hero card content by status ────────────────────────────────────────────

type HeroContent = { subtitle: string; title: string; body: string; cta1: string; cta2: string; icon: string }

const HERO: Record<VerificationStatus, HeroContent> = {
  not_started: {
    subtitle: 'Pilot Onboarding',
    title: 'Complete Your Verification',
    body: "To access Sydney's Cessna 172 fleet, complete a one-time verification process. Upload your pilot licence, medical certificate, and proof of identity to get started.",
    cta1: 'Begin Verification',
    cta2: 'Learn More',
    icon: 'how_to_reg',
  },
  pending_review: {
    subtitle: 'Certification Stage',
    title: 'Account Status: Pending Review',
    body: "We've received your documents and your account is currently under review. Our safety officers are validating your certifications for the Sydney fleet. You'll be notified via email once approved.",
    cta1: 'View Documents',
    cta2: 'Contact Support',
    icon: 'verified_user',
  },
  verified: {
    subtitle: 'Access Granted',
    title: "You're Cleared to Fly",
    body: 'Your pilot credentials have been verified and your account is fully approved. You can now browse available aircraft and submit booking requests for the Sydney Cessna 172 fleet.',
    cta1: 'Browse Fleet',
    cta2: 'View Pricing',
    icon: 'flight_takeoff',
  },
  rejected: {
    subtitle: 'Verification Outcome',
    title: 'Verification Unsuccessful',
    body: 'Unfortunately, your verification could not be completed with the documents provided. Please contact our support team for details, or submit updated documentation for re-review.',
    cta1: 'Contact Support',
    cta2: 'Resubmit Documents',
    icon: 'report_problem',
  },
  on_hold: {
    subtitle: 'Verification On Hold',
    title: 'Additional Information Required',
    body: 'Your verification is currently on hold. Our team has reviewed your application and requires additional information or documentation before we can proceed.',
    cta1: 'Upload Documents',
    cta2: 'View Documents',
    icon: 'pending_actions',
  },
}

// ─── Steps by status ─────────────────────────────────────────────────────────

type StepState = 'done' | 'active' | 'pending' | 'failed'
type Step = { label: string; state: StepState }

const STEPS: Record<VerificationStatus, Step[]> = {
  not_started: [
    { label: 'Account created',          state: 'done' },
    { label: 'Upload pilot licence',      state: 'pending' },
    { label: 'Upload medical certificate',state: 'pending' },
    { label: 'Upload proof of identity',  state: 'pending' },
  ],
  pending_review: [
    { label: 'Profile completed',  state: 'done' },
    { label: 'Licence uploaded',   state: 'done' },
    { label: 'Medical uploaded',   state: 'done' },
    { label: 'Awaiting approval',  state: 'active' },
  ],
  verified: [
    { label: 'Profile completed',  state: 'done' },
    { label: 'Licence verified',   state: 'done' },
    { label: 'Medical verified',   state: 'done' },
    { label: 'Account approved',   state: 'done' },
  ],
  rejected: [
    { label: 'Account created',           state: 'done' },
    { label: 'Documents submitted',       state: 'done' },
    { label: 'Verification declined',     state: 'failed' },
    { label: 'Contact support to proceed',state: 'active' },
  ],
  on_hold: [
    { label: 'Account created',           state: 'done' },
    { label: 'Documents submitted',       state: 'done' },
    { label: 'Additional info requested', state: 'failed' },
    { label: 'Resubmit for review',       state: 'active' },
  ],
}

// ─── Step icon ───────────────────────────────────────────────────────────────

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span className="material-symbols-outlined text-oz-blue text-xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
        check_circle
      </span>
    )
  }
  if (state === 'active') {
    return (
      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-oz-blue ring-4 ring-oz-blue/20" />
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

// ─── Event type display config ────────────────────────────────────────────────

const EVENT_DISPLAY: Record<string, { icon: string; color: string; label: string }> = {
  submitted:   { icon: 'upload_file',   color: 'text-blue-300',  label: 'Submitted' },
  resubmitted: { icon: 'upload_file',   color: 'text-blue-300',  label: 'Resubmitted' },
  approved:    { icon: 'verified_user', color: 'text-green-400', label: 'Approved' },
  rejected:    { icon: 'person_off',    color: 'text-red-400',   label: 'Rejected' },
  on_hold:     { icon: 'pause_circle',  color: 'text-amber-400', label: 'On Hold' },
  message:     { icon: 'chat',          color: 'text-slate-400', label: 'Message' },
}

// ─── Admin placeholder panel ─────────────────────────────────────────────────

function AdminPanel({ displayName }: { displayName: string }) {
  return (
    <div className="space-y-10 animate-fade-in flex-1">
      <section className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight text-white mb-2">
            Admin Console, {displayName}
          </h2>
          <p className="text-oz-muted font-sans font-light">Operational management view.</p>
        </div>
        <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-white/5 backdrop-blur-md rounded-full border border-white/5">
          <span className="w-2 h-2 rounded-full bg-white/40" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Administrator</span>
        </div>
      </section>
      <section className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-tr from-white/10 to-transparent rounded-[1.5rem] opacity-20 blur group-hover:opacity-40 transition duration-1000 pointer-events-none" />
        <div className="bg-[#0c121e]/60 backdrop-blur-2xl border border-white/5 rounded-[1.5rem] p-8 md:p-12 relative overflow-hidden flex items-center justify-between shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="space-y-6 max-w-2xl relative z-10">
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-[0.3em] text-oz-blue/70 font-semibold">System Access</span>
              <h3 className="text-2xl md:text-3xl font-serif text-white leading-tight">Admin Dashboard Coming Soon</h3>
            </div>
            <p className="text-base text-oz-muted leading-relaxed font-light">
              The full admin console is under development.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── Customer panel ───────────────────────────────────────────────────────────

function CustomerPanel({
  status,
  statusCfg,
  displayName,
  documents,
  events,
  onNavigate,
}: {
  status: VerificationStatus
  statusCfg: StatusConfig
  displayName: string
  documents: UserDocument[]
  events: VerificationEvent[]
  onNavigate: (tab: Tab) => void
}) {
  const hero = HERO[status]

  // Dynamic steps: reflect uploaded docs for actionable statuses
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

  const isVerified  = status === 'verified'
  const isNotStarted = status === 'not_started'
  const isOnHold    = status === 'on_hold'

  // Latest on_hold event for the banner — richer context if request_kind is set
  const latestHoldEvent = events.find(e => e.event_type === 'on_hold')
  const holdRequestKind: RequestKind = latestHoldEvent?.request_kind ?? 'document_request'
  const isDocRequest = holdRequestKind === 'document_request'

  // Unread count for the events section dot
  const unreadCount = events.filter(e => !e.is_read).length

  return (
    <div className="space-y-10 animate-fade-in flex-1">

      {/* Header */}
      <section className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight text-white mb-2">
            Welcome back, {displayName}
          </h2>
          <p className="text-oz-muted font-sans font-light">
            {isNotStarted
              ? 'Start your verification to unlock fleet access.'
              : isVerified
              ? "Your account is fully approved. You're ready to fly."
              : isOnHold
              ? 'Your verification is on hold — action is required from you.'
              : 'Your application for the Sydney Cessna 172 fleet is in progress.'}
          </p>
        </div>
        <div className={`hidden md:flex items-center gap-3 px-4 py-2 backdrop-blur-md rounded-full border ${
          isOnHold ? 'bg-amber-500/10 border-amber-500/20' : 'bg-[#c8dcff]/10 border-white/5'
        }`}>
          <span className={`w-2 h-2 rounded-full ${statusCfg.dot} ${statusCfg.pulse ? 'animate-pulse' : ''}`} />
          <span className={`text-[10px] font-bold uppercase tracking-widest ${statusCfg.accent}`}>
            {statusCfg.badge}
          </span>
        </div>
      </section>

      {/* ── On-Hold Alert Banner ── */}
      {isOnHold && (
        <section className="bg-amber-500/5 border border-amber-500/20 rounded-[1.25rem] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span
              className="material-symbols-outlined text-amber-400 text-xl"
              style={{ fontVariationSettings: "'wght' 300" }}
            >
              pending_actions
            </span>
            <h4 className="text-xs font-bold uppercase tracking-widest text-amber-400">
              {isDocRequest ? 'Action Required — Upload Documents' : 'Action Required — Response Needed'}
            </h4>
          </div>

          {latestHoldEvent?.body ? (
            <p className="text-sm text-[#e2e2e6] leading-relaxed pl-8">
              {latestHoldEvent.body}
            </p>
          ) : (
            <p className="text-sm text-amber-200/60 leading-relaxed pl-8">
              Our team requires additional information before your verification can proceed.
            </p>
          )}

          <div className="pl-8 flex flex-wrap gap-3">
            {isDocRequest ? (
              <button
                onClick={() => onNavigate('Documents')}
                className="flex items-center gap-2 px-6 py-3 bg-amber-500/15 border border-amber-400/30 text-amber-300 hover:bg-amber-500/25 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all hover:scale-[1.02]"
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>upload_file</span>
                Upload &amp; Resubmit
              </button>
            ) : (
              <button
                onClick={() => onNavigate('Documents')}
                className="flex items-center gap-2 px-6 py-3 bg-amber-500/15 border border-amber-400/30 text-amber-300 hover:bg-amber-500/25 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all hover:scale-[1.02]"
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>chat</span>
                Reply to Request
              </button>
            )}
          </div>
        </section>
      )}

      {/* Hero Status Card */}
      <section className="relative group">
        <div className={`absolute -inset-0.5 bg-gradient-to-tr ${statusCfg.glowFrom} to-transparent rounded-[1.5rem] opacity-20 blur group-hover:opacity-40 transition duration-1000 pointer-events-none`} />
        <div className="bg-[#0c121e]/60 backdrop-blur-2xl border border-white/5 rounded-[1.5rem] p-8 md:p-12 relative overflow-hidden flex items-center justify-between shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="space-y-6 max-w-2xl relative z-10">
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-[0.3em] text-oz-blue/70 font-semibold">{hero.subtitle}</span>
              <h3 className="text-2xl md:text-3xl font-serif text-white leading-tight">{hero.title}</h3>
            </div>
            <p className="text-base text-oz-muted leading-relaxed font-light">{hero.body}</p>
            <div className="flex flex-wrap gap-4 pt-4">
              <button
                onClick={() => onNavigate('Documents')}
                className="bg-oz-blue text-oz-deep hover:bg-white px-8 py-3.5 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all shadow-lg hover:shadow-xl hover:scale-[1.02]"
              >
                {hero.cta1}
              </button>
              <button className="border border-white/10 hover:border-white/30 hover:bg-white/5 text-white px-8 py-3.5 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all">
                {hero.cta2}
              </button>
            </div>
          </div>
          <div className="hidden lg:block opacity-20 relative z-0 mix-blend-plus-lighter">
            <span
              className="material-symbols-outlined text-[160px] text-oz-blue"
              style={{ fontVariationSettings: "'wght' 100, 'FILL' 0" }}
            >
              {hero.icon}
            </span>
          </div>
        </div>
      </section>

      {/* 2×2 Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Next Steps */}
        <div className="bg-[#0c121e]/60 backdrop-blur-2xl border border-white/5 rounded-[1.25rem] p-8 space-y-6 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-oz-blue">Next Steps</h4>
            <span className={`text-[10px] font-medium tracking-wide ${statusCfg.accent}`}>
              {statusCfg.progressLabel}
            </span>
          </div>
          <ul className="space-y-5">
            {steps.map(step => (
              <li
                key={step.label}
                className={`flex items-center gap-4 ${
                  step.state === 'active'  ? 'text-white' :
                  step.state === 'failed'  ? 'text-red-400/80' :
                  step.state === 'pending' ? 'text-white/30' :
                  'text-white/50'
                }`}
              >
                <StepIcon state={step.state} />
                <span className={`text-sm ${step.state === 'active' ? 'font-medium tracking-wide' : 'font-light'}`}>
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Documents summary */}
        <div className="bg-[#0c121e]/60 backdrop-blur-2xl border border-white/5 rounded-[1.25rem] p-8 flex flex-col justify-between shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-oz-blue">My Documents</h4>
              <span className="material-symbols-outlined text-oz-subtle text-sm">description</span>
            </div>
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                <span className="material-symbols-outlined text-white/15 text-4xl" style={{ fontVariationSettings: "'wght' 100, 'FILL' 0" }}>upload_file</span>
                <p className="text-sm text-oz-muted font-light leading-relaxed max-w-xs">
                  No documents uploaded yet. Start by uploading your pilot licence.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { key: 'pilot_licence',       label: 'Commercial Pilot Licence' },
                  { key: 'medical_certificate',  label: 'Class 1 Medical Certificate' },
                  { key: 'photo_id',             label: 'Photo ID' },
                ].map(({ key, label }) => {
                  const uploaded = documents.some(d => d.document_type === key)
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-oz-muted font-light">{label}</span>
                      {uploaded
                        ? <span className="text-[9px] font-bold text-oz-blue uppercase px-2 py-1 bg-oz-blue/10 rounded tracking-widest">Uploaded</span>
                        : <span className="text-[9px] font-bold text-oz-subtle uppercase px-2 py-1 border border-white/10 rounded tracking-widest">Missing</span>
                      }
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <button
            onClick={() => onNavigate('Documents')}
            className="mt-8 w-full py-4 border-t border-white/5 hover:bg-white/5 text-oz-subtle hover:text-white transition-all text-[10px] font-bold uppercase tracking-[0.15em] flex items-center justify-center gap-3 rounded-lg"
          >
            {documents.length === 0 ? 'Upload Documents' : 'Manage Documents'}
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>

        {/* Bookings */}
        <div className="bg-[#0c121e]/60 backdrop-blur-2xl border border-white/5 rounded-[1.25rem] p-8 flex flex-col items-center justify-center text-center space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
            <span className={`material-symbols-outlined text-3xl ${isVerified ? 'text-oz-blue/70' : 'text-oz-blue/40'}`}>
              flight_takeoff
            </span>
          </div>
          {isVerified ? (
            <>
              <h4 className="text-xl font-serif italic text-white">Ready to book</h4>
              <p className="text-sm text-oz-muted max-w-xs leading-relaxed font-light">
                Browse available aircraft and submit a booking request for the Sydney Cessna 172 fleet.
              </p>
              <button className="mt-4 text-[10px] font-bold uppercase tracking-[0.15em] text-oz-blue border-b border-oz-blue/30 pb-1 hover:border-oz-blue transition-all">
                Browse Fleet
              </button>
            </>
          ) : (
            <>
              <h4 className="text-xl font-serif italic text-white">No bookings yet</h4>
              <p className="text-sm text-oz-muted max-w-xs leading-relaxed font-light">
                {isNotStarted
                  ? 'Complete your verification to unlock aircraft booking.'
                  : isOnHold
                  ? 'Resolve the on-hold request and complete verification to book aircraft.'
                  : "Once your account is approved, you'll be able to request aircraft bookings here."}
              </p>
            </>
          )}
        </div>

        {/* Support */}
        <div className="bg-[#0c121e]/60 backdrop-blur-2xl border border-white/5 rounded-[1.25rem] p-8 relative overflow-hidden flex flex-col justify-between shadow-[0_8px_24px_rgba(0,0,0,0.3)] group hover:bg-[#0c121e]/80 transition-colors">
          <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <span className="material-symbols-outlined text-[140px] text-white">contact_support</span>
          </div>
          <div className="space-y-4 relative z-10">
            <h4 className="text-xs font-bold uppercase tracking-widest text-oz-blue">Need help?</h4>
            <p className="text-sm text-oz-muted leading-relaxed font-light">
              {status === 'rejected' || isOnHold
                ? "Our team can review your case and guide you through the re-submission process. Reach out and we'll get you sorted."
                : 'Questions about the onboarding process or urgent approval requirements for an upcoming trip? Our member concierges are standing by.'}
            </p>
          </div>
          <button className="relative z-10 w-fit mt-8 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full text-[10px] text-white font-bold uppercase tracking-[0.15em] transition-all">
            Message Concierge
          </button>
        </div>
      </section>

      {/* ── Verification History ── */}
      {events.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-oz-blue">Verification Updates</h4>
            {unreadCount > 0 && (
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-oz-blue text-[9px] font-bold text-oz-deep">
                {unreadCount}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {events.map(ev => {
              const disp = EVENT_DISPLAY[ev.event_type] ?? EVENT_DISPLAY.message
              const isCustomerMsg = ev.actor_role === 'customer'
              const when = fmtTimestamp(ev.created_at)
              return (
                <div
                  key={ev.id}
                  className={`bg-[#0c121e]/60 backdrop-blur-2xl border rounded-[1.25rem] p-5 flex gap-4 transition-colors ${
                    !ev.is_read ? 'border-white/10' : 'border-white/5'
                  }`}
                >
                  {/* Unread dot */}
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    {!ev.is_read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-oz-blue mt-1" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`material-symbols-outlined text-base ${
                            isCustomerMsg ? 'text-blue-300/60' : disp.color
                          }`}
                          style={{ fontVariationSettings: "'wght' 300" }}
                        >
                          {isCustomerMsg ? 'person' : disp.icon}
                        </span>
                        <p className="text-sm font-semibold text-white">{ev.title}</p>
                        {isCustomerMsg && (
                          <span className="text-[9px] uppercase tracking-widest font-bold text-white/25 border border-white/10 px-1.5 py-0.5 rounded">You</span>
                        )}
                      </div>
                      <span className="text-[10px] text-oz-subtle whitespace-nowrap font-mono flex-shrink-0">{when}</span>
                    </div>
                    {ev.body && (
                      <p className="text-sm text-oz-muted leading-relaxed">{ev.body}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

    </div>
  )
}

// ─── Dashboard shell ─────────────────────────────────────────────────────────

const TABS: { label: Tab; icon: string }[] = [
  { label: 'Dashboard',  icon: 'dashboard' },
  { label: 'My Profile', icon: 'account_circle' },
  { label: 'Documents',  icon: 'description' },
  { label: 'Bookings',   icon: 'calendar_month' },
  { label: 'Support',    icon: 'contact_support' },
]

export default function DashboardContent({ user, profile, documents, events }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Dashboard')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const role        = profile?.role ?? 'customer'
  const status      = (profile?.verification_status ?? 'not_started') as VerificationStatus
  const statusCfg   = STATUS_CONFIG[status]
  const sidebarRole = role === 'admin' ? 'Administrator' : 'Aviator Member'

  return (
    <div className="min-h-screen flex overflow-hidden bg-[#050B14] text-oz-text font-sans relative">
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none z-50 mix-blend-overlay"
        style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }}
      />
      <div className="fixed top-0 left-0 w-[600px] h-[600px] bg-oz-blue/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-oz-blue/5 blur-[120px] rounded-full pointer-events-none -z-10" />

      <div className="fixed top-0 right-0 w-1/3 h-full -z-10 pointer-events-none opacity-[0.15]">
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#050B14] z-10" />
        <Image src="/Pilot&aircraftTwilight.webp" alt="Cessna 172 at twilight" fill className="object-cover" />
      </div>

      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-64 border-r border-white/5 bg-[#091421]/90 backdrop-blur-xl flex flex-col py-8 px-6 z-50">
        <div className="mb-12">
          <h1 className="text-xl font-serif italic text-white tracking-tight">The Blue Hour</h1>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-oz-blue/60 mt-1">{sidebarRole}</p>
        </div>

        <nav className="flex-1 space-y-2">
          {TABS.map(tab => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(tab.label)}
              className={`w-full flex items-center gap-4 py-3 px-4 rounded-xl transition-all duration-300 ease-in-out font-sans ${
                activeTab === tab.label
                  ? 'text-oz-blue font-bold border-r-2 border-oz-blue pr-4 bg-white/5'
                  : 'text-oz-subtle hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>
                {tab.icon}
              </span>
              <span className="text-xs font-semibold uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-white/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-white/30 text-xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>account_circle</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{displayName}</p>
            <p className="text-[10px] text-oz-subtle uppercase tracking-widest">{sidebarRole}</p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-64 flex-1 flex flex-col relative w-[calc(100%-16rem)]">
        <header className="fixed top-0 right-0 w-[calc(100%-16rem)] h-20 flex justify-end items-center px-12 gap-6 z-40">
          <div className="flex items-center gap-6">
            <button className="flex items-center justify-center text-oz-subtle hover:text-white transition-colors">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 300" }}>notifications</span>
            </button>
            <button className="flex items-center justify-center text-oz-subtle hover:text-white transition-colors">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 300" }}>settings</span>
            </button>
            <div className="h-8 w-[1px] bg-white/5" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-oz-subtle hover:text-white transition-colors group"
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'wght' 300" }}>logout</span>
              <span className="text-[10px] font-bold uppercase tracking-widest group-hover:text-white transition-colors">Sign Out</span>
            </button>
          </div>
        </header>

        <div className="pt-28 px-8 md:px-12 xl:px-16 pb-12 w-full max-w-[1200px] mx-auto min-h-screen flex flex-col">
          {activeTab === 'Dashboard' ? (
            role === 'admin' ? (
              <AdminPanel displayName={displayName} />
            ) : (
              <CustomerPanel
                status={status}
                statusCfg={statusCfg}
                displayName={displayName}
                documents={documents}
                events={events}
                onNavigate={setActiveTab}
              />
            )
          ) : activeTab === 'Documents' ? (
            <DocumentsPanel user={user} documents={documents} status={status} events={events} />
          ) : (
            <div className="flex-1 flex items-center justify-center animate-fade-in opacity-50">
              <div className="text-center space-y-4">
                <span className="material-symbols-outlined text-4xl text-oz-subtle">construction</span>
                <h3 className="text-lg font-serif italic text-white">{activeTab} section available soon</h3>
                <p className="text-sm font-sans font-light text-oz-muted">This module is part of the next release phase.</p>
              </div>
            </div>
          )}

          <footer className="mt-auto pt-10 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center opacity-40 grayscale gap-4">
            <p className="text-[9px] uppercase tracking-[0.4em] font-medium text-white">OZRentAPlane Operational Portal</p>
            <div className="flex flex-wrap items-center justify-center gap-6">
              <span className="text-[9px] uppercase tracking-widest text-oz-muted">Fleet Status</span>
              <span className="text-[9px] uppercase tracking-widest text-oz-muted">Weather Systems</span>
              <span className="text-[9px] uppercase tracking-widest text-oz-muted">Safety Compliance</span>
            </div>
          </footer>
        </div>
      </main>
    </div>
  )
}
