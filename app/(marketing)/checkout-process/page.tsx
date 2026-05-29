'use client'

import React, { useEffect, useRef, useState } from 'react'
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/MotionPresets'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'
import { CloudBackground } from '@/components/marketing/CloudBackground'
import RunwaySpine from '@/components/checkout-process/RunwaySpine'
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
      className="relative z-10 shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
      style={{
        background: '#061524',
        border: '1px solid rgba(224,177,59,0.7)',
        boxShadow: '0 0 0 8px #061524, 0 0 0 9.5px rgba(224,177,59,0.22), 0 4px 20px rgba(224,177,59,0.18)',
      }}
    >
      <div className="w-2 h-2 rounded-full absolute bg-runway-amber" />
      <Icon name={icon} className="!text-[20px] text-deep-ink relative z-10" fill />
    </div>
  )
}

/* ─── Glass photo card ────────────────────────────────────────────────────── */
function StepPhoto({ src, alt, header }: { src: string; alt: string; header?: React.ReactNode }) {
  return (
    <div
      className="rounded-xl overflow-hidden border shadow-xl relative"
      style={{ background: 'rgba(22,32,46,0.82)', backdropFilter: 'blur(10px)', borderColor: 'rgba(68,71,78,0.22)' }}
    >
      {header && <div className="px-5 pt-5 pb-3 relative z-10">{header}</div>}
      <div className="relative">
        <img src={src} alt={alt} className="w-full object-cover block" style={{ opacity: 0.92, display: 'block', filter: 'contrast(0.98) brightness(0.95)' }} />
        <div className="absolute inset-0 bg-mkt-main/10 pointer-events-none" />
      </div>
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
      <h3 className="font-serif text-2xl md:text-3xl font-normal mb-3 text-deep-ink">{title}</h3>
      <p className="font-sans font-light leading-relaxed text-muted-ink text-[0.94rem]">{body}</p>
    </div>
  )
}

/* ─── Page ────────────────────────────────────────────────────────────────── */
export default function CheckoutProcessPage() {
  const journeyRef = useRef<HTMLDivElement>(null)

  return (
    <main className="bg-mkt-main text-deep-ink font-sans overflow-x-hidden">

      {/* ══════════════════════════════════════════════════════════════
          1. Hero
      ══════════════════════════════════════════════════════════════ */}
      <section className="hero-fade-to-main relative px-6 md:px-12 lg:px-20 overflow-hidden min-h-[500px] md:min-h-[750px] flex items-center">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/CessnaTarmac.webp")', opacity: 0.72 }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#040f1e]/70 via-[#040f1e]/30 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-px z-[20] h-[45%] bg-gradient-to-b from-transparent via-[#061524]/75 to-[#061524]" />

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-16">
          <StaggerContainer className="max-w-2xl" staggerDelay={0.22}>
            <StaggerItem duration={1.4}>
              <span className="text-xs font-sans uppercase tracking-[0.28em] text-white/50 mb-5 block">
                Before Solo Hire
              </span>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <h1 className="font-serif text-5xl md:text-7xl font-normal leading-[1.05] tracking-tight mb-6 text-white">
                Checkout Process
              </h1>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[1rem] leading-relaxed text-white/85 mb-10 max-w-lg">
                Before your first solo hire, you&apos;ll complete a structured checkout process so
                we can confirm your documents, aircraft familiarity, local procedures, and
                readiness to fly VH-KZG safely.
              </p>
            </StaggerItem>
          </StaggerContainer>

          <div className="flex flex-wrap items-center gap-4 mt-2">
            <FadeUp delay={1.1} duration={1.4}>
              <CheckoutCTAButton
                className="inline-block rounded-md font-sans font-bold tracking-widest uppercase text-[0.8rem] px-8 py-4 shadow-2xl transition-all active:scale-95 bg-runway-amber hover:bg-runway-amber-hot"
                style={{
                  color: '#061120',
                  border: '1px solid #B8871E',
                  boxShadow: '0 0 22px rgba(224,177,59,0.16)',
                }}
              />
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          4. Timeline
      ══════════════════════════════════════════════════════════════ */}
      <section className="-mt-12 pt-12 pb-32 bg-mkt-main relative z-20">
        <CloudBackground />
        <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-12">
          {/* Compact Timeline Header */}
          <StaggerContainer className="mb-16 text-center" staggerDelay={0.2} viewportMargin="-15%">
            <StaggerItem duration={1.4}>
              <h2 className="font-serif text-3xl md:text-5xl font-normal tracking-tight text-deep-ink mb-3">
                Step-by-Step Process
              </h2>
            </StaggerItem>
            <StaggerItem duration={1.2}>
              <div className="mx-auto h-[2px] w-12 rounded-full bg-runway-amber" />
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[0.95rem] text-muted-ink max-w-xl mx-auto">
                A clear path from account setup to your first approved solo hire.
              </p>
            </StaggerItem>
          </StaggerContainer>

          <div className="relative" ref={journeyRef}>
            <RunwaySpine containerRef={journeyRef as React.RefObject<HTMLDivElement>} />

            <div className="relative space-y-32" style={{ zIndex: 2 }}>

              {/* 01 */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-12 group">
                  <div className="md:w-1/2 text-left md:text-right order-2 md:order-1">
                    <span className="text-[#a9cbe4] font-sans font-bold text-6xl opacity-5 absolute -top-8 right-0 md:relative md:top-0">01</span>
                    <h3 className="font-serif text-3xl font-normal mb-4 text-deep-ink">Create your pilot account</h3>
                    <p className="text-muted-ink font-sans font-light">Set up your account so your pilot profile, documents, bookings, and flight records can be managed in one place.</p>
                  </div>
                  <div className="order-1 md:order-2 shrink-0"><StepNode icon="person_add" /></div>
                  <div className="md:w-1/2 order-3">
                    <StepPhoto src="/optimized/hiw-step1-account-900.jpg" alt="Pilot portal account setup" />
                  </div>
                </div>
              </FadeUp>

              {/* 02 */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-12 group">
                  <div className="md:w-1/2 order-3 md:order-1">
                    <div
                      className="rounded-xl overflow-hidden border shadow-xl"
                      style={{ background: 'rgba(22,32,46,0.82)', backdropFilter: 'blur(10px)', borderColor: 'rgba(68,71,78,0.22)' }}
                    >
                      <div className="flex justify-between items-center px-6 pt-6 pb-4">
                        <div className="rounded px-4 py-2" style={{ background: '#2b3544' }}>
                          <p className="mb-2.5 font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d3d6df]">Rate</p>
                          <div className="font-sans leading-relaxed">
                            <p className="text-brand-blue font-bold text-lg md:text-xl">$290 per hour VDO + landing</p>
                            <p className="mt-1 text-[13px] font-medium text-[#d7dbe5]">
                              <span className="line-through decoration-[1.6px]">$330 per hour</span>
                            </p>
                            <p className="mt-1 text-[11px] text-muted-ink">special checkout flight rate</p>
                          </div>
                        </div>
                      </div>
                      <div className="relative">
                        <img
                          src="/optimized/hiw-step4-booking-900.jpg"
                          alt="Checkout booking calendar"
                          className="w-full object-cover block"
                          style={{ opacity: 0.92, filter: 'contrast(0.98) brightness(0.95)' }}
                        />
                        <div className="absolute inset-0 bg-mkt-main/10 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="order-1 shrink-0"><StepNode icon="event_available" /></div>
                  <div className="md:w-1/2 text-left order-2">
                    <span className="text-[#a9cbe4] font-sans font-bold text-6xl opacity-5 absolute -top-8 left-0 md:relative md:top-0">02</span>
                    <h3 className="font-serif text-3xl font-normal mb-4 text-deep-ink">Request your checkout flight</h3>
                    <p className="text-muted-ink font-sans font-light">Choose your preferred checkout flight time. This first flight is reviewed and confirmed by the operations team.</p>
                  </div>
                </div>
              </FadeUp>

              {/* 03 */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-12 group">
                  <div className="md:w-1/2 text-left md:text-right order-2 md:order-1">
                    <span className="text-[#a9cbe4] font-sans font-bold text-6xl opacity-5 absolute -top-8 right-0 md:relative md:top-0">03</span>
                    <h3 className="font-serif text-3xl font-normal mb-4 text-deep-ink">Upload pilot documents</h3>
                    <p className="text-muted-ink font-sans font-light">Upload your pilot licence, medical certificate, photo ID, and recent flying details for our operations team to verify.</p>
                  </div>
                  <div className="order-1 md:order-2 shrink-0"><StepNode icon="cloud_upload" /></div>
                  <div className="md:w-1/2 order-3">
                    <StepPhoto src="/optimized/pilot-licence-1100.jpg" alt="Uploading pilot documents" />
                  </div>
                </div>
              </FadeUp>

              {/* Waypoint */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col items-center py-10 opacity-60">
                  <Icon name="expand_more" className="text-brand-blue !text-3xl animate-bounce block" />
                  <p className="font-sans text-xs tracking-widest mt-4 text-muted-ink">CONTINUING TO CLEARANCE</p>
                </div>
              </FadeUp>

              {/* 05 & 06 */}
              <FadeUp viewportMargin="-60px">
                <div className="relative p-12 rounded-2xl border shadow-2xl overflow-hidden" style={{ background: '#1e3a5f', backdropFilter: 'blur(10px)', borderColor: 'rgba(224,177,59,0.35)' }}>
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Icon name="flight_takeoff" className="!text-9xl text-runway-amber" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-12 items-center relative z-10">
                    <div>
                      <span className="text-runway-amber font-sans text-xs tracking-[0.2em] uppercase">Step 05 &amp; 06</span>
                      <h3 className="font-serif text-4xl font-normal my-4 text-white">Checkout &amp; Clearance</h3>
                      <p className="text-white/80 font-sans mb-6 leading-relaxed">Complete your checkout flight. Post-flight, your status will be updated to 'Cleared for solo hire'.</p>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-[#a9cbe4]">
                          <Icon name="check_circle" className="!text-lg" />
                          <span className="text-sm font-semibold font-sans text-white">Cleared for solo hire</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl overflow-hidden shadow-2xl aspect-[4/3] relative">
                      <img className="w-full h-full object-cover" style={{ opacity: 0.92, filter: 'contrast(0.98) brightness(0.95)' }} alt="Pilot during checkout flight" src="/optimized/checkout-clearance-900.jpg" />
                      <div className="absolute inset-0 bg-mkt-main/10 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </FadeUp>

              {/* 08 */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-12 group">
                  <div className="md:w-1/2 text-left md:text-right order-2 md:order-1">
                    <span className="text-[#a9cbe4] font-sans font-bold text-6xl opacity-5 absolute -top-8 right-0 md:relative md:top-0">08</span>
                    <h3 className="font-serif text-3xl font-normal mb-4 text-deep-ink">Log &amp; Finalize</h3>
                    <p className="text-muted-ink font-sans font-light">After each flight, complete the required flight record so usage and billing can be finalized accurately.</p>
                  </div>
                  <div className="order-1 md:order-2 shrink-0"><StepNode icon="assignment_turned_in" /></div>
                  <div className="md:w-1/2 order-3">
                    <StepPhoto src="/optimized/record-finalize-900.jpg" alt="Logbook record" />
                  </div>
                </div>
              </FadeUp>

            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          5. After you're cleared
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-32 px-6 md:px-12 lg:px-20 bg-mkt-alt">
        <CloudBackground />
        <div className="relative z-10 max-w-7xl mx-auto">
          <h2 className="font-serif text-4xl md:text-5xl font-normal text-center text-deep-ink">After you&apos;re checked out</h2>
          <div className="mx-auto mt-3 mb-20 h-[3px] w-[40px] bg-runway-amber" />
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-4 gap-8" staggerDelay={0.2} viewportMargin="-20%">
              {[
                { n: '01', title: 'Book slots directly', body: 'Instant access to the fleet calendar for all approved aircraft types.' },
                { n: '02', title: 'Manage bookings', body: 'Modify or cancel upcoming flights through your centralized pilot portal.' },
                { n: '03', title: 'Post-flight records', body: 'Seamlessly submit flight times and maintenance notes via mobile.' },
                { n: '04', title: 'Stay current', body: 'Receive automated alerts for upcoming medical and licence renewals.' },
              ].map(({ n, title, body }, idx) => (
                <StaggerItem key={title} duration={1.4}>
                <div
                  className={`bg-pale-lift p-6 h-full border border-[0.5px] border-open-ceiling shadow-[0_2px_12px_rgba(21,45,90,0.07)] transition-transform duration-300 hover:rotate-[-0.5deg] border-b-[3px] ${idx % 2 === 0 ? 'border-b-runway-amber' : 'border-b-brand-blue'}`}
                  style={{
                    borderRadius: idx % 2 === 0 ? '20px 8px 20px 8px' : '8px 20px 8px 20px',
                  }}
                >
                  <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-runway-amber text-deep-ink text-[20px] font-bold">
                    {n}
                  </div>
                  <h4 className="font-sans text-[15px] font-medium mb-3 text-deep-ink">{title}</h4>
                  <p className="text-[13px] text-muted-ink font-sans leading-relaxed">{body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      <PreFooterCTA
        heading="Ready to Request Your Checkout Flight?"
        subtext="Submit your details and our team will confirm your first flight time."
        ctaLabel="Request Checkout Flight"
        ctaHref="/pilotRequirements"
      />

    </main>
  )
}
