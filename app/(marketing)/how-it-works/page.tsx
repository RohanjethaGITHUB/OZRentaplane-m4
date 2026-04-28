'use client'

import React, { useEffect, useRef, useState } from 'react'
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/MotionPresets'
import RunwaySpine from '@/components/how-it-works/RunwaySpine'
import { createClient } from '@/lib/supabase/client'

/* ─── Icon ────────────────────────────────────────────────────────────────── */
function Icon({ name, className = '', fill = false }: { name: string; className?: string; fill?: boolean }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {name}
    </span>
  )
}

/* ─── Login-aware primary CTA button ─────────────────────────────────────── */
function CheckoutCTAButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [href, setHref] = useState('/login')

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) setHref('/dashboard/checkout')
      })
  }, [])

  return (
    <a href={href} className={className} style={style}>
      Request Checkout Flight
    </a>
  )
}

/* ─── Step node (runway milestone marker) ────────────────────────────────── */
function StepNode({ icon }: { icon: string }) {
  return (
    <div
      className="z-10 shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #aec7f7 0%, #1b365d 100%)',
        boxShadow: '0 0 0 8px #091421, 0 0 0 9.5px rgba(174,199,247,0.18), 0 4px 20px rgba(174,199,247,0.14)',
      }}
    >
      <Icon name={icon} className="!text-[20px] text-[#143057]" fill />
    </div>
  )
}

/* ─── Glass photo card ────────────────────────────────────────────────────── */
function StepPhoto({ src, alt, header }: { src: string; alt: string; header?: React.ReactNode }) {
  return (
    <div
      className="rounded-xl overflow-hidden border shadow-xl"
      style={{ background: 'rgba(22,32,46,0.82)', backdropFilter: 'blur(20px)', borderColor: 'rgba(68,71,78,0.22)' }}
    >
      {header && <div className="px-5 pt-5 pb-3">{header}</div>}
      <img src={src} alt={alt} className="w-full object-cover block" style={{ opacity: 0.84, display: 'block' }} />
    </div>
  )
}

/* ─── Step text block ─────────────────────────────────────────────────────── */
function StepText({ n, title, body, align = 'right' }: { n: string; title: string; body: string; align?: 'left' | 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <span
        className="font-sans font-bold text-[5rem] leading-none select-none block mb-1"
        style={{ color: '#a9cbe4', opacity: 0.07 }}
      >
        {n}
      </span>
      <h3 className="font-serif text-2xl md:text-3xl font-normal mb-3 text-[#d9e3f6]">{title}</h3>
      <p className="font-sans font-light leading-relaxed text-[#c4c6cf] text-[0.94rem]">{body}</p>
    </div>
  )
}

/* ─── Page ────────────────────────────────────────────────────────────────── */
export default function CheckoutProcessPage() {
  const journeyRef = useRef<HTMLDivElement>(null)

  return (
    <main className="bg-[#091421] text-[#d9e3f6] font-sans overflow-x-hidden">

      {/* ══════════════════════════════════════════════════════════════
          1. Hero
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative px-6 md:px-12 lg:px-20 overflow-hidden min-h-[500px] md:min-h-[750px] flex items-center">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/CessnaTarmac.webp")', opacity: 0.72 }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#040f1e]/95 via-[#040f1e]/55 to-[#040f1e]/10" />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#091421]/20 via-transparent to-[#091421]/45" />

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-16">
          <StaggerContainer className="max-w-2xl" staggerDelay={0.22}>
            <StaggerItem duration={1.4}>
              <span className="text-xs font-sans uppercase tracking-[0.28em] text-[#aec7f7] mb-5 block" style={{ opacity: 0.82 }}>
                Before Solo Hire
              </span>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <h1 className="font-serif text-5xl md:text-7xl font-normal leading-[1.05] tracking-tight mb-6 text-white">
                Checkout Process
              </h1>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[1rem] leading-relaxed text-[#c4c6cf] mb-10 max-w-lg">
                Before your first solo hire, you&apos;ll complete a structured checkout process so
                we can confirm your documents, aircraft familiarity, local procedures, and
                readiness to fly VH-KZG safely.
              </p>
            </StaggerItem>
          </StaggerContainer>

          <div className="flex flex-wrap items-center gap-4 mt-2">
            <FadeUp delay={1.1} duration={1.4}>
              <CheckoutCTAButton
                className="inline-block rounded-md font-sans font-bold tracking-widest uppercase text-[0.8rem] px-8 py-4 shadow-2xl transition-all active:scale-95 hover:brightness-110"
                style={{
                  background: 'linear-gradient(135deg, #aec7f7 0%, #1b365d 100%)',
                  color: '#143057',
                  boxShadow: '0 0 28px rgba(174,199,247,0.18)',
                }}
              />
            </FadeUp>
            <FadeUp delay={1.4} duration={1.4}>
              <a
                href="/pilotRequirements"
                className="font-sans font-bold text-[0.8rem] tracking-widest uppercase px-8 py-4 rounded border border-white/20 text-[#c4c6cf] hover:bg-white/5 transition-colors"
              >
                View Requirements
              </a>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          2. Intro — "From checkout to confident solo hire"
          Split: text panel left | howitworks-plane.png right (full-bleed)
      ══════════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-2">
        <div className="flex items-center px-8 md:px-16 lg:px-24 py-24 md:py-32 bg-[#121c29]">
          <StaggerContainer staggerDelay={0.25} viewportMargin="-20%">
            <StaggerItem duration={1.4}>
              <span className="text-xs font-sans uppercase tracking-[0.28em] text-[#a9cbe4] mb-4 block">
                The Checkout Process
              </span>
              <h2 className="font-serif text-4xl md:text-5xl font-normal leading-[1.1] tracking-tight mb-6 text-[#d9e3f6]">
                From checkout to<br />confident solo hire
              </h2>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[1rem] leading-relaxed text-[#c4c6cf] mb-8 max-w-md">
                Your checkout flight is not just an admin step. It helps confirm that your
                documents are in order, you understand the aircraft and local procedures, and
                you are ready to progress toward solo hire safely.
              </p>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <div className="flex flex-col gap-3">
                {[
                  { n: '01', label: 'Documents verified before your flight' },
                  { n: '02', label: 'Aircraft familiarity confirmed in person' },
                  { n: '03', label: 'Clearance unlocks solo hire access' },
                ].map(({ n, label }) => (
                  <div key={n} className="flex items-center gap-4">
                    <span className="font-sans font-bold text-xs text-[#aec7f7] w-6 shrink-0">{n}</span>
                    <span className="text-sm text-[#c4c6cf]">{label}</span>
                  </div>
                ))}
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>

        <FadeUp duration={2.2} viewportMargin="-15%" delay={0.08} className="relative min-h-[400px] lg:min-h-[560px]">
          <img
            src="/howitworks-plane.png"
            alt="Cessna aircraft on tarmac at dusk"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0.9 }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to right, rgba(18,28,41,0.55) 0%, transparent 45%), linear-gradient(to top, rgba(9,20,33,0.45) 0%, transparent 55%)',
            }}
          />
        </FadeUp>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          3. Before you request checkout — checklist section
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-24 md:py-32 px-8 md:px-24 bg-[#050f1b]">
        <StaggerContainer className="mb-14 max-w-2xl" staggerDelay={0.2} viewportMargin="-20%">
          <StaggerItem duration={1.4}>
            <span className="text-xs font-sans uppercase tracking-[0.28em] text-[#aec7f7] mb-4 block" style={{ opacity: 0.78 }}>
              What you&apos;ll need
            </span>
          </StaggerItem>
          <StaggerItem duration={1.4}>
            <h2 className="font-serif font-normal text-3xl md:text-4xl text-[#d9e3f6] mb-4">
              Before you request checkout
            </h2>
          </StaggerItem>
          <StaggerItem duration={1.4}>
            <p className="font-sans text-[0.95rem] text-[#c4c6cf] leading-relaxed">
              Make sure you have the following ready before submitting your checkout request. These
              are reviewed by the admin team alongside your request.
            </p>
          </StaggerItem>
        </StaggerContainer>

        <StaggerContainer
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1"
          staggerDelay={0.18}
          viewportMargin="-20%"
        >
          {[
            {
              icon: 'badge',
              title: 'Current pilot licence',
              body: 'PPL or CPL as applicable. Your licence number and ARN are required when uploading documents.',
            },
            {
              icon: 'medical_services',
              title: 'Valid medical certificate',
              body: 'Issue and expiry dates are required. Your medical must be current for the checkout date.',
            },
            {
              icon: 'credit_card',
              title: 'Photo identification',
              body: 'A government-issued photo ID number is required as part of the document upload.',
            },
            {
              icon: 'menu_book',
              title: 'Logbook or recent experience',
              body: 'Your last flight date and recent flying hours help the team assess currency and readiness.',
            },
            {
              icon: 'headset',
              title: 'Headset and planning tools',
              body: 'Bring your own headset. Flight planning tools such as AvPlan or OzRunways are recommended.',
            },
            {
              icon: 'flight',
              title: 'Readiness to complete checkout',
              body: 'The checkout covers aircraft systems, local procedures, circuits, and handling. Plan for approximately one hour.',
            },
          ].map(({ icon, title, body }) => (
            <StaggerItem key={title} duration={1.4}>
              <div className="bg-[#121c29] p-8 border-l-2 border-[#aec7f7]/20 h-full">
                <Icon name={icon} className="text-[#aec7f7] !text-3xl mb-5 block" />
                <h4 className="font-serif font-normal text-xl mb-3 text-[#d9e3f6]">{title}</h4>
                <p className="text-sm text-[#c4c6cf] font-sans leading-relaxed">{body}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          4. Timeline — 8 steps with runway spine animation
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-24 md:py-32 bg-[#091421] relative">
        <div className="max-w-6xl mx-auto px-6 md:px-12">

          <StaggerContainer className="mb-20 md:mb-24 text-center" staggerDelay={0.2} viewportMargin="-15%">
            <StaggerItem duration={1.4}>
              <span className="text-xs font-sans uppercase tracking-[0.28em] text-[#aec7f7] mb-4 block" style={{ opacity: 0.8 }}>
                Step by step
              </span>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <h2 className="font-serif text-4xl md:text-6xl font-normal tracking-tight text-[#d9e3f6] mb-4">
                From checkout request<br className="hidden md:block" /> to solo hire clearance
              </h2>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[0.95rem] text-[#c4c6cf] max-w-xl mx-auto">
                A clear step-by-step path from account setup to your first approved solo hire.
              </p>
            </StaggerItem>
          </StaggerContainer>

          {/* Journey container — RunwaySpine overlays as absolute */}
          <div className="relative" ref={journeyRef}>
            <RunwaySpine containerRef={journeyRef as React.RefObject<HTMLDivElement>} />

            <div className="relative space-y-24 md:space-y-32" style={{ zIndex: 2 }}>

              {/* ── 01: Create your pilot account ────────────────────────── */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-10 md:gap-12">
                  <div className="md:w-1/2 order-2 md:order-1">
                    <StepText
                      n="01"
                      title="Create your pilot account"
                      body="Set up your account so your pilot profile, documents, bookings, and flight records can be managed in one place."
                      align="right"
                    />
                  </div>
                  <div className="order-1 md:order-2 shrink-0"><StepNode icon="person_add" /></div>
                  <div className="md:w-1/2 order-3">
                    <StepPhoto src="/hiw-step1-account.png" alt="Pilot portal account setup" />
                  </div>
                </div>
              </FadeUp>

              {/* ── 02: Request your checkout flight ─────────────────────── */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-10 md:gap-12">
                  <div className="md:w-1/2 order-3 md:order-1">
                    <div
                      className="rounded-xl overflow-hidden border shadow-xl"
                      style={{ background: 'rgba(22,32,46,0.82)', backdropFilter: 'blur(20px)', borderColor: 'rgba(68,71,78,0.22)' }}
                    >
                      <div className="flex justify-between items-center px-5 pt-5 pb-3">
                        <div className="rounded px-4 py-2" style={{ background: '#2b3544' }}>
                          <p className="font-sans text-[10px] uppercase tracking-widest text-[#c4c6cf]">Rate</p>
                          <p className="font-sans text-xl font-bold text-[#aec7f7]">$290/hour</p>
                        </div>
                        <div className="text-right rounded px-4 py-2" style={{ background: '#2b3544' }}>
                          <p className="font-sans text-[10px] uppercase tracking-widest text-[#c4c6cf]">Duration</p>
                          <p className="font-sans text-xl font-bold text-[#aec7f7]">1 hour</p>
                        </div>
                      </div>
                      <img
                        src="/hiw-step4-booking.png"
                        alt="Checkout booking calendar"
                        className="w-full object-cover block"
                        style={{ opacity: 0.82 }}
                      />
                    </div>
                  </div>
                  <div className="order-1 shrink-0"><StepNode icon="event_available" /></div>
                  <div className="md:w-1/2 order-2">
                    <StepText
                      n="02"
                      title="Request your checkout flight"
                      body="Choose a checkout flight time. The checkout is a fixed first step before solo hire access can be granted."
                      align="left"
                    />
                  </div>
                </div>
              </FadeUp>

              {/* ── 03: Upload required documents ────────────────────────── */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-10 md:gap-12">
                  <div className="md:w-1/2 order-2 md:order-1">
                    <StepText
                      n="03"
                      title="Upload required documents"
                      body="Upload your licence, medical, photo ID, and any other required documents so they can be checked before your flight."
                      align="right"
                    />
                  </div>
                  <div className="order-1 md:order-2 shrink-0"><StepNode icon="cloud_upload" /></div>
                  <div className="md:w-1/2 order-3">
                    <StepPhoto src="/hiw-step2-documents.png" alt="Uploading pilot documents" />
                  </div>
                </div>
              </FadeUp>

              {/* ── 04: Admin reviews your request ───────────────────────── */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-10 md:gap-12">
                  <div className="md:w-1/2 order-3 md:order-1">
                    <StepPhoto src="/CockpitRunwayView.webp" alt="Admin reviewing checkout request" />
                  </div>
                  <div className="order-1 shrink-0"><StepNode icon="fact_check" /></div>
                  <div className="md:w-1/2 order-2">
                    <StepText
                      n="04"
                      title="Admin reviews your request"
                      body="The team reviews your checkout request, documents, and timing before confirming the next step. They may suggest an alternative time if needed."
                      align="left"
                    />
                  </div>
                </div>
              </FadeUp>

              {/* ── 05: Attend your checkout flight ──────────────────────── */}
              {/* ★ TAKEOFF ZONE ★ — plane begins banking near here (~60% scroll) */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-10 md:gap-12">
                  <div className="md:w-1/2 order-2 md:order-1">
                    <StepText
                      n="05"
                      title="Attend your checkout flight"
                      body="Complete your checkout with an approved instructor. This covers aircraft familiarity, local procedures, handling, circuits, and safety checks."
                      align="right"
                    />
                  </div>
                  <div className="order-1 md:order-2 shrink-0"><StepNode icon="flight" /></div>
                  <div className="md:w-1/2 order-3">
                    <StepPhoto src="/Pilot&aircraftTwilight.webp" alt="Pilot and approved instructor during checkout flight" />
                  </div>
                </div>
              </FadeUp>

              {/* ── 06: Receive your clearance outcome ───────────────────── */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-10 md:gap-12">
                  {/* Clearance status card acts as the "visual" on the left */}
                  <div className="md:w-1/2 order-3 md:order-1">
                    <div
                      className="rounded-xl overflow-hidden border shadow-xl"
                      style={{ background: 'rgba(22,32,46,0.82)', backdropFilter: 'blur(20px)', borderColor: 'rgba(174,199,247,0.14)' }}
                    >
                      <div
                        className="px-5 pt-5 pb-4 border-b"
                        style={{ borderColor: 'rgba(174,199,247,0.08)' }}
                      >
                        <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-[#608bca] mb-0.5">
                          Clearance status
                        </p>
                        <p className="font-sans text-xs text-[#c4c6cf]">Updated post-checkout by your approved instructor</p>
                      </div>
                      <div className="p-5 space-y-3">
                        {[
                          { icon: 'check_circle', label: 'Cleared for solo hire', active: true },
                          { icon: 'schedule', label: 'Additional supervised time recommended', active: false },
                          { icon: 'event_repeat', label: 'Reschedule required', active: false },
                          { icon: 'block', label: 'Not currently eligible', active: false },
                        ].map(({ icon, label, active }) => (
                          <div
                            key={label}
                            className="flex items-center gap-3"
                            style={{ opacity: active ? 1 : 0.42 }}
                          >
                            <Icon
                              name={icon}
                              className={`!text-[17px] shrink-0 ${active ? 'text-[#aec7f7]' : 'text-[#c4c6cf]'}`}
                              fill={active}
                            />
                            <span
                              className={`font-sans text-sm ${active ? 'font-semibold text-[#aec7f7]' : 'text-[#c4c6cf]'}`}
                            >
                              {label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="order-1 shrink-0"><StepNode icon="verified" /></div>
                  <div className="md:w-1/2 order-2">
                    <StepText
                      n="06"
                      title="Receive your clearance outcome"
                      body="After the checkout, your profile is updated with the appropriate clearance outcome. Clearance unlocks solo hire access in your dashboard."
                      align="left"
                    />
                  </div>
                </div>
              </FadeUp>

              {/* ── 07: Book your first solo hire ────────────────────────── */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-10 md:gap-12">
                  <div className="md:w-1/2 order-2 md:order-1">
                    <StepText
                      n="07"
                      title="Book your first solo hire"
                      body="Once cleared, you can request standard solo aircraft hire through your customer dashboard. Future bookings do not require another checkout."
                      align="right"
                    />
                  </div>
                  <div className="order-1 md:order-2 shrink-0"><StepNode icon="flight_takeoff" /></div>
                  <div className="md:w-1/2 order-3">
                    <StepPhoto src="/hiw-step6-flightdetails.png" alt="Solo booking interface in pilot portal" />
                  </div>
                </div>
              </FadeUp>

              {/* ── 08: Fly, record, and finalize ────────────────────────── */}
              {/* ★ PLANE FLIES AWAY ★ — fully banked and fading (~88–100% scroll) */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-10 md:gap-12">
                  <div className="md:w-1/2 order-3 md:order-1">
                    <StepPhoto src="/CessnaGoldenSunset.webp" alt="Cessna at golden hour after successful flight" />
                  </div>
                  <div className="order-1 shrink-0"><StepNode icon="assignment_turned_in" /></div>
                  <div className="md:w-1/2 order-2">
                    <StepText
                      n="08"
                      title="Fly, record, and finalize"
                      body="After each flight, submit the required readings and records so the flight can be reviewed and finalized. This applies to every future hire."
                      align="left"
                    />
                  </div>
                </div>
              </FadeUp>

            </div>{/* /space-y-32 */}
          </div>{/* /journeyRef */}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          5. Possible checkout outcomes
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-24 md:py-32 px-8 md:px-24 bg-[#050f1b]">
        <StaggerContainer className="mb-14 md:mb-16 max-w-3xl" staggerDelay={0.2} viewportMargin="-20%">
          <StaggerItem duration={1.4}>
            <h2 className="font-serif font-normal text-3xl md:text-4xl text-[#d9e3f6] mb-4">
              Possible checkout outcomes
            </h2>
          </StaggerItem>
          <StaggerItem duration={1.4}>
            <p className="font-sans text-[0.95rem] text-[#c4c6cf] leading-relaxed max-w-xl">
              Checkout is designed to be safety-based and practical. After review, your profile may
              be updated with one of the following outcomes.
            </p>
          </StaggerItem>
        </StaggerContainer>

        <StaggerContainer
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          staggerDelay={0.22}
          viewportMargin="-20%"
        >
          {[
            {
              icon: 'check_circle',
              title: 'Cleared for solo hire',
              body: 'Your documents, aircraft handling, and local procedure knowledge have been confirmed. Solo hire access is unlocked in your dashboard.',
              highlight: true,
            },
            {
              icon: 'schedule',
              title: 'Additional supervised time recommended',
              body: 'The instructor has recommended additional supervised flying before solo hire can be granted. A follow-up session can be arranged.',
              highlight: false,
            },
            {
              icon: 'event_repeat',
              title: 'Reschedule required',
              body: 'The checkout could not be completed as planned. You can arrange a new checkout time through your dashboard.',
              highlight: false,
            },
            {
              icon: 'info',
              title: 'Not currently eligible',
              body: 'Based on documents or experience, solo hire access cannot be granted at this stage. The admin team will advise on next steps.',
              highlight: false,
            },
          ].map(({ icon, title, body, highlight }) => (
            <StaggerItem key={title} duration={1.4}>
              <div
                className="bg-[#121c29] p-8 h-full border-l-2 transition-colors duration-500 hover:bg-[#1a2535]"
                style={{ borderLeftColor: highlight ? 'rgba(174,199,247,0.5)' : 'rgba(174,199,247,0.12)' }}
              >
                <Icon
                  name={icon}
                  className={`!text-3xl mb-5 block ${highlight ? 'text-[#aec7f7]' : 'text-[#c4c6cf]'}`}
                  fill={highlight}
                />
                <h4 className="font-serif font-normal text-lg mb-3 text-[#d9e3f6]">{title}</h4>
                <p className="text-sm text-[#c4c6cf] font-sans leading-relaxed">{body}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          6. After you're cleared
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-24 md:py-32 px-8 md:px-24 bg-[#091421]">
        <StaggerContainer className="mb-14 md:mb-16" viewportMargin="-20%">
          <StaggerItem duration={1.4}>
            <h2 className="font-serif font-normal text-4xl md:text-5xl text-[#d9e3f6] mb-4">
              After you&apos;re cleared
            </h2>
          </StaggerItem>
          <StaggerItem duration={1.4}>
            <p className="text-[#c4c6cf] font-sans max-w-lg">
              Your dashboard becomes the place to manage aircraft hire, records, and ongoing
              requirements. You do not need to repeat the checkout process.
            </p>
          </StaggerItem>
        </StaggerContainer>

        <StaggerContainer
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          staggerDelay={0.3}
          viewportMargin="-25%"
        >
          {[
            {
              icon: 'calendar_month',
              title: 'Book solo hire',
              body: 'Request any available aircraft through your dashboard. Solo hire is available once clearance is confirmed.',
            },
            {
              icon: 'dashboard',
              title: 'Manage bookings',
              body: 'View, modify, or cancel upcoming bookings directly from your pilot dashboard.',
            },
            {
              icon: 'history_edu',
              title: 'Submit flight records',
              body: 'After each flight, submit your required readings and records so the session can be reviewed and finalized.',
            },
            {
              icon: 'badge',
              title: 'Keep documents current',
              body: 'Keep your licence, medical certificate, and photo ID up to date in your profile so your access stays active.',
            },
          ].map(({ icon, title, body }) => (
            <StaggerItem key={title} duration={1.4}>
              <div className="bg-[#121c29] p-10 flex flex-col justify-between h-72 group hover:bg-[#212b38] transition-all duration-500">
                <Icon name={icon} className="text-[#aec7f7] !text-4xl group-hover:scale-110 transition-transform duration-500" />
                <div>
                  <h3 className="font-serif font-normal text-xl text-[#d9e3f6] mb-3">{title}</h3>
                  <p className="text-sm text-[#c4c6cf] leading-relaxed">{body}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          7. Built for safe solo hire (renamed from "Built on Absolute Trust")
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-24 md:py-32 px-8 md:px-24 bg-[#050f1b]">
        <StaggerContainer
          className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8"
          viewportMargin="-20%"
        >
          <div>
            <StaggerItem duration={1.4}>
              <h2 className="font-serif font-normal text-4xl md:text-5xl text-[#d9e3f6] mb-4">
                Built for safe solo hire
              </h2>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="text-[#c4c6cf] max-w-xl font-sans">
                The checkout process reflects how solo hire actually works — not just what looks
                good on a form.
              </p>
            </StaggerItem>
          </div>
          <div className="h-px bg-[#44474e]/20 flex-grow hidden md:block mx-12 mb-6" />
        </StaggerContainer>

        <StaggerContainer
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1"
          staggerDelay={0.4}
          viewportMargin="-25%"
        >
          {[
            {
              phase: 'Documents verified before hire',
              title: 'Checked before you fly.',
              body: 'Your licence, medical, and photo ID are reviewed as part of your checkout request — not as a separate approval queue.',
            },
            {
              phase: 'Checkout required before solo access',
              title: 'No checkout, no solo hire.',
              body: 'Solo aircraft hire is not available until checkout clearance has been confirmed by an approved instructor or reviewer.',
            },
            {
              phase: 'Bookings reviewed and tracked',
              title: 'Every hire has a record.',
              body: 'All bookings go through the customer dashboard. They can be confirmed, modified, or cancelled, and every change is tracked.',
            },
            {
              phase: 'Flight records after every flight',
              title: 'Submit readings after landing.',
              body: 'Required flight readings and records are submitted through the dashboard after every hire so the flight can be reviewed and billed accurately.',
            },
          ].map(({ phase, title, body }) => (
            <StaggerItem key={phase} duration={1.6}>
              <div className="bg-[#121c29] p-8 border-l-2 border-[#aec7f7]/20 h-full">
                <span className="text-xs font-sans uppercase tracking-[0.2em] text-[#aec7f7]/60 mb-6 block">
                  {phase}
                </span>
                <h4 className="font-serif font-normal text-xl mb-4 text-[#d9e3f6]">{title}</h4>
                <p className="text-sm text-[#c4c6cf] font-sans leading-relaxed">{body}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          8. Final CTA
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative py-40 md:py-48 px-8 md:px-24 flex items-center justify-center text-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            className="w-full h-full object-cover"
            src="/CessnaHangar.webp"
            alt=""
            aria-hidden="true"
            style={{ opacity: 0.28 }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#091421] via-transparent to-[#091421]" />
        </div>

        <StaggerContainer className="relative z-10 max-w-2xl" staggerDelay={0.3} viewportMargin="-25%">
          <StaggerItem duration={1.4}>
            <span className="text-xs font-sans uppercase tracking-[0.28em] text-[#aec7f7] mb-6 block" style={{ opacity: 0.8 }}>
              Start Your Journey
            </span>
          </StaggerItem>
          <StaggerItem duration={1.6}>
            <h2 className="font-serif font-normal text-4xl md:text-6xl mb-8 text-[#d9e3f6]">
              Ready to request your<br />checkout flight?
            </h2>
          </StaggerItem>
          <StaggerItem duration={1.4}>
            <p className="text-[#c4c6cf] text-lg mb-12 font-sans max-w-xl mx-auto">
              Create your pilot account, upload your documents, and request your checkout flight
              before progressing to solo aircraft hire.
            </p>
          </StaggerItem>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-4">
            <FadeUp delay={0.8} duration={1.4}>
              <CheckoutCTAButton
                className="inline-block rounded-md font-sans font-bold uppercase tracking-widest text-[0.8rem] px-8 py-4 shadow-2xl transition-all active:scale-95 hover:brightness-110"
                style={{
                  background: 'linear-gradient(135deg, #aec7f7 0%, #1b365d 100%)',
                  color: '#143057',
                  boxShadow: '0 0 28px rgba(174,199,247,0.18)',
                }}
              />
            </FadeUp>
            <FadeUp delay={1.1} duration={1.4}>
              <a
                href="/pilotRequirements"
                className="inline-block bg-[#212b38] text-[#d9e3f6] px-8 py-4 rounded-md font-sans font-bold uppercase tracking-widest text-[0.8rem] active:scale-95 transition-all hover:bg-[#2b3544]"
              >
                View Requirements
              </a>
            </FadeUp>
          </div>
        </StaggerContainer>
      </section>

    </main>
  )
}
