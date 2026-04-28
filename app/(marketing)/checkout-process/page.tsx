'use client'

import React, { useEffect, useRef, useState } from 'react'
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/MotionPresets'
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
      className="rounded-xl overflow-hidden border shadow-xl relative"
      style={{ background: 'rgba(22,32,46,0.82)', backdropFilter: 'blur(20px)', borderColor: 'rgba(68,71,78,0.22)' }}
    >
      {header && <div className="px-5 pt-5 pb-3 relative z-10">{header}</div>}
      <div className="relative">
        <img src={src} alt={alt} className="w-full object-cover block" style={{ opacity: 0.72, display: 'block', filter: 'contrast(0.9) brightness(0.85)' }} />
        <div className="absolute inset-0 bg-[#091421]/25 pointer-events-none" />
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
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#040f1e]/70 via-[#040f1e]/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[30%] z-0 bg-gradient-to-t from-[#091421] via-[#091421]/30 to-transparent" />

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
          4. Timeline
      ══════════════════════════════════════════════════════════════ */}
      <section className="-mt-12 pt-12 pb-32 bg-[#091421] relative z-20">
        <div className="max-w-6xl mx-auto px-6 md:px-12">
          {/* Compact Timeline Header */}
          <StaggerContainer className="mb-16 text-center" staggerDelay={0.2} viewportMargin="-15%">
            <StaggerItem duration={1.4}>
              <span className="text-xs font-sans uppercase tracking-[0.28em] text-[#aec7f7] mb-3 block" style={{ opacity: 0.8 }}>
                Step by step
              </span>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <h2 className="font-serif text-3xl md:text-5xl font-normal tracking-tight text-[#d9e3f6] mb-3">
                From checkout to request solo hire clearance
              </h2>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[0.95rem] text-[#c4c6cf] max-w-xl mx-auto">
                A clear step-by-step path from account setup to your first approved solo hire.
              </p>
            </StaggerItem>
          </StaggerContainer>

          <div className="relative" ref={journeyRef}>
            <RunwaySpine containerRef={journeyRef as React.RefObject<HTMLDivElement>} />

            <div className="relative space-y-32" style={{ zIndex: 2 }}>

              {/* 01 */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-12 group">
                  <div className="md:w-1/2 text-right order-2 md:order-1">
                    <span className="text-[#a9cbe4] font-sans font-bold text-6xl opacity-5 absolute -top-8 right-0 md:relative md:top-0">01</span>
                    <h3 className="font-serif text-3xl font-normal mb-4 text-[#d9e3f6]">Create your pilot account</h3>
                    <p className="text-[#c4c6cf] font-sans font-light">Set up your account so your pilot profile, documents, bookings, and flight records can be managed in one place.</p>
                  </div>
                  <div className="order-1 md:order-2 shrink-0"><StepNode icon="person_add" /></div>
                  <div className="md:w-1/2 order-3">
                    <StepPhoto src="/hiw-step1-account.png" alt="Pilot portal account setup" />
                  </div>
                </div>
              </FadeUp>

              {/* 02 */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-12 group">
                  <div className="md:w-1/2 order-3 md:order-1">
                    <div
                      className="rounded-xl overflow-hidden border shadow-xl"
                      style={{ background: 'rgba(22,32,46,0.82)', backdropFilter: 'blur(20px)', borderColor: 'rgba(68,71,78,0.22)' }}
                    >
                      <div className="flex justify-between items-center px-6 pt-6 pb-4">
                        <div className="rounded px-4 py-2" style={{ background: '#2b3544' }}>
                          <p className="font-sans text-[10px] uppercase tracking-widest text-[#c4c6cf]">Rate</p>
                          <p className="font-sans text-xl font-bold text-[#aec7f7]">$290/hour</p>
                        </div>
                        <div className="text-right rounded px-4 py-2" style={{ background: '#2b3544' }}>
                          <p className="font-sans text-[10px] uppercase tracking-widest text-[#c4c6cf]">Duration</p>
                          <p className="font-sans text-xl font-bold text-[#aec7f7]">1 hour</p>
                        </div>
                      </div>
                      <div className="relative">
                        <img
                          src="/hiw-step4-booking.png"
                          alt="Checkout booking calendar"
                          className="w-full object-cover block"
                          style={{ opacity: 0.72, filter: 'contrast(0.9) brightness(0.85)' }}
                        />
                        <div className="absolute inset-0 bg-[#091421]/25 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="order-1 shrink-0"><StepNode icon="event_available" /></div>
                  <div className="md:w-1/2 text-left order-2">
                    <span className="text-[#a9cbe4] font-sans font-bold text-6xl opacity-5 absolute -top-8 left-0 md:relative md:top-0">02</span>
                    <h3 className="font-serif text-3xl font-normal mb-4 text-[#d9e3f6]">Request your checkout flight</h3>
                    <p className="text-[#c4c6cf] font-sans font-light">Choose your preferred one-hour checkout flight time. This first flight is reviewed and confirmed by the operations team.</p>
                  </div>
                </div>
              </FadeUp>

              {/* 03 */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-12 group">
                  <div className="md:w-1/2 text-right order-2 md:order-1">
                    <span className="text-[#a9cbe4] font-sans font-bold text-6xl opacity-5 absolute -top-8 right-0 md:relative md:top-0">03</span>
                    <h3 className="font-serif text-3xl font-normal mb-4 text-[#d9e3f6]">Upload pilot documents</h3>
                    <p className="text-[#c4c6cf] font-sans font-light">Upload your pilot licence, medical certificate, photo ID, and recent flying details for our operations team to verify.</p>
                  </div>
                  <div className="order-1 md:order-2 shrink-0"><StepNode icon="cloud_upload" /></div>
                  <div className="md:w-1/2 order-3">
                    <StepPhoto src="/pilot-licence.png" alt="Uploading pilot documents" />
                  </div>
                </div>
              </FadeUp>

              {/* Waypoint */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col items-center py-10 opacity-60">
                  <Icon name="expand_more" className="text-[#aec7f7] !text-3xl animate-bounce block" />
                  <p className="font-sans text-xs tracking-widest mt-4 text-[#c4c6cf]">CONTINUING TO CLEARANCE</p>
                </div>
              </FadeUp>

              {/* 05 & 06 */}
              <FadeUp viewportMargin="-60px">
                <div className="relative p-12 rounded-2xl border shadow-2xl overflow-hidden" style={{ background: 'rgba(22,32,46,0.8)', backdropFilter: 'blur(20px)', borderColor: 'rgba(174,199,247,0.2)' }}>
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Icon name="flight_takeoff" className="!text-9xl text-[#aec7f7]" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-12 items-center relative z-10">
                    <div>
                      <span className="text-[#aec7f7] font-sans text-xs tracking-[0.2em] uppercase">Step 05 &amp; 06</span>
                      <h3 className="font-serif text-4xl font-normal my-4 text-[#d9e3f6]">Checkout &amp; Clearance</h3>
                      <p className="text-[#c4c6cf] font-sans mb-6 leading-relaxed">Complete your flight with an approved instructor. Post-flight, your status will be updated to 'Cleared for solo hire'.</p>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-[#a9cbe4]">
                          <Icon name="check_circle" className="!text-lg" />
                          <span className="text-sm font-semibold font-sans">Cleared for solo hire</span>
                        </div>
                        <div className="flex items-center gap-3 text-[#c4c6cf] opacity-50">
                          <Icon name="info" className="!text-lg" />
                          <span className="text-sm font-sans">Additional time required</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl overflow-hidden shadow-2xl aspect-[4/3] relative">
                      <img className="w-full h-full object-cover" style={{ opacity: 0.72, filter: 'contrast(0.9) brightness(0.85)' }} alt="Pilot and approved instructor during checkout flight" src="/Checkout&Clearance.png" />
                      <div className="absolute inset-0 bg-[#091421]/25 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </FadeUp>

              {/* 08 */}
              <FadeUp viewportMargin="-60px">
                <div className="flex flex-col md:flex-row items-center gap-12 group">
                  <div className="md:w-1/2 text-right order-2 md:order-1">
                    <span className="text-[#a9cbe4] font-sans font-bold text-6xl opacity-5 absolute -top-8 right-0 md:relative md:top-0">08</span>
                    <h3 className="font-serif text-3xl font-normal mb-4 text-[#d9e3f6]">Log &amp; Finalize</h3>
                    <p className="text-[#c4c6cf] font-sans font-light">After each flight, complete the required flight record so usage and billing can be finalized accurately.</p>
                  </div>
                  <div className="order-1 md:order-2 shrink-0"><StepNode icon="assignment_turned_in" /></div>
                  <div className="md:w-1/2 order-3">
                    <StepPhoto src="/record-finalize.png" alt="Logbook record" />
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
      <section className="py-32 px-6 md:px-12 lg:px-20 bg-[#091421]">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-serif text-4xl md:text-5xl font-normal text-center mb-20 text-[#d9e3f6]">After you&apos;re cleared</h2>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-4 gap-8" staggerDelay={0.2} viewportMargin="-20%">
            {[
              { icon: 'calendar_month', title: 'Book slots directly', body: 'Instant access to the fleet calendar for all approved aircraft types.' },
              { icon: 'dashboard', title: 'Manage bookings', body: 'Modify or cancel upcoming flights through your centralized pilot portal.' },
              { icon: 'history_edu', title: 'Post-flight records', body: 'Seamlessly submit flight times and maintenance notes via mobile.' },
              { icon: 'verified', title: 'Stay current', body: 'Receive automated alerts for upcoming medical and licence renewals.' },
            ].map(({ icon, title, body }) => (
              <StaggerItem key={title} duration={1.4}>
                <div className="bg-[#121c29] p-10 rounded-xl hover:bg-[#212b38] transition-colors group h-full border border-transparent hover:border-[#44474e]/20">
                  <Icon name={icon} className="text-[#aec7f7] !text-4xl mb-6 block group-hover:scale-110 transition-transform duration-500" />
                  <h4 className="font-serif text-xl mb-4 text-[#d9e3f6]">{title}</h4>
                  <p className="text-sm text-[#c4c6cf] font-light font-sans leading-relaxed">{body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          6. Built on Absolute Trust
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-24 bg-[#050f1b]">
        <div className="max-w-4xl mx-auto px-12 text-center border-y border-[#44474e]/10 py-20">
          <FadeUp duration={1.4}>
            <h2 className="font-serif text-4xl font-normal mb-16 text-[#d9e3f6]">Built on Absolute Trust</h2>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-8" staggerDelay={0.2}>
            {[
              { num: '01', label: 'One-time checkout' },
              { num: '02', label: 'Document-backed' },
              { num: '03', label: 'Instructor-led' },
              { num: '04', label: 'Clear records' },
            ].map(({ num, label }) => (
              <StaggerItem key={num} duration={1.4} className="space-y-2">
                <p className="text-[#aec7f7] font-sans font-bold text-lg">{num}</p>
                <p className="text-xs uppercase tracking-widest text-[#c4c6cf] font-sans">{label}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          7. Final CTA
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-40 px-6 md:px-12 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            className="w-full h-full object-cover"
            src="/CessnaHangar.webp"
            alt="Hangar"
            style={{ opacity: 0.2 }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#091421] via-transparent to-[#091421]" />
        </div>
        
        <StaggerContainer className="relative z-10 max-w-4xl mx-auto text-center" staggerDelay={0.3} viewportMargin="-25%">
          <StaggerItem duration={1.6}>
            <h2 className="font-serif text-5xl md:text-6xl font-normal mb-8 text-[#d9e3f6]">
              Ready to request your checkout flight?
            </h2>
          </StaggerItem>
          <StaggerItem duration={1.4}>
            <p className="font-sans text-xl text-[#c4c6cf] mb-12 max-w-2xl mx-auto font-light">
              Create your pilot account, choose a checkout time, and upload your required documents in one guided flow.
            </p>
          </StaggerItem>
          <div className="flex flex-col md:flex-row justify-center gap-6">
            <FadeUp delay={0.8} duration={1.4}>
              <CheckoutCTAButton
                className="inline-block rounded-md font-sans font-bold text-lg px-10 py-5 shadow-2xl transition-transform hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #aec7f7 0%, #1b365d 100%)',
                  color: '#143057',
                  boxShadow: '0 0 28px rgba(174,199,247,0.2)',
                }}
              />
            </FadeUp>
            <FadeUp delay={1.1} duration={1.4}>
              <a
                href="/fleet"
                className="inline-block bg-[#2b3544] text-[#d9e3f6] px-10 py-5 rounded-md font-sans font-bold text-lg border border-[#44474e]/30 transition-colors hover:bg-[#303a48]"
              >
                View the fleet
              </a>
            </FadeUp>
          </div>
        </StaggerContainer>
      </section>

    </main>
  )
}
