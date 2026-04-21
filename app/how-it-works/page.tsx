'use client'

import React, { useRef } from 'react'
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/MotionPresets'
import RouteSpine from '@/components/how-it-works/RouteSpine'
import TimelineBackground from '@/components/how-it-works/TimelineBackground'
import JourneyStep, {
  StepImageCard,
  VerificationCard,
  ConfirmationGrid,
  FlyCard,
} from '@/components/how-it-works/JourneyStep'

/* ─── Icon helper ─────────────────────────────────────────────────────────── */

function Icon({
  name,
  style,
}: {
  name: string
  style?: React.CSSProperties
}) {
  return (
    <span className="material-symbols-outlined" style={style}>
      {name}
    </span>
  )
}

/* ─── Step data ───────────────────────────────────────────────────────────── */

const STEPS = [
  {
    index: 1,
    icon: 'person_add',
    title: 'Create your account',
    description:
      'Secure your credentials on our private network. Your portal to precision aviation begins with a single profile registration.',
    side: 'left' as const,
    visual: (
      <StepImageCard
        src="/hiw-step1-account.png"
        alt="Dark aviation onboarding interface — account registration"
      />
    ),
  },
  {
    index: 2,
    icon: 'cloud_upload',
    title: 'Upload pilot documents',
    description:
      'We require high-resolution digital copies of your pilot licence, medical certificate, and insurance for full safety compliance.',
    side: 'right' as const,
    visual: (
      <StepImageCard
        src="/hiw-step2-documents.png"
        alt="Pilot licence and aviation documents — document upload"
      />
    ),
  },
  {
    index: 3,
    icon: 'verified',
    title: 'Approval review',
    description:
      'Our flight safety team reviews your credentials. Verification is typically finalised within 24 hours.',
    side: 'left' as const,
    visual: <VerificationCard />,
  },
  {
    index: 4,
    icon: 'calendar_month',
    title: 'Request your booking',
    description:
      'Select your aircraft and mission date. A $100 advance deposit initiates the dispatch sequence and locks your flight window.',
    side: 'right' as const,
    visual: (
      <StepImageCard
        src="/hiw-step4-booking.png"
        alt="Cockpit instruments looking toward runway — booking request"
      />
    ),
  },
  {
    index: 5,
    icon: 'task_alt',
    title: 'Confirmation checks',
    description:
      'We perform a tripartite check: METAR/TAF weather, airworthiness, and pilot currency — all resolved before your window opens.',
    side: 'left' as const,
    visual: <ConfirmationGrid />,
  },
  {
    index: 6,
    icon: 'description',
    title: 'Receive flight details',
    description:
      'Your digital Dispatch Pack includes weight and balance tools, fuel planning, and tail-specific avionics manuals.',
    side: 'right' as const,
    visual: (
      <StepImageCard
        src="/hiw-step6-flightdetails.png"
        alt="Aviation charts and flight planning documents — dispatch pack"
      />
    ),
  },
  {
    index: 7,
    icon: 'flight',
    title: 'Fly and Finalize',
    description:
      'Execute your flight. Submit readings via app on landing. We calculate the final balance and issue your invoice instantly.',
    side: 'left' as const,
    iconFilled: true,
    isLast: true,
    visual: <FlyCard />,
  },
]

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function HowItWorksPage() {
  const journeyRef = useRef<HTMLDivElement>(null)

  return (
    <main
      className="bg-[#091421] text-[#d9e3f6] font-sans overflow-x-hidden"
      style={{ paddingTop: '62px' }}
    >

      {/* ════════════════════════════════════════════════════════════
          Section 1 — Hero
      ════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[560px] md:min-h-[640px] flex items-center px-6 md:px-12 lg:px-20 pt-20 pb-24 overflow-hidden">
        {/* Background — CessnaTarmac */}
        <img
          src="/CessnaTarmac.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
          style={{ opacity: 0.55 }}
        />
        {/* Gradient veils — dark at bottom so heading stays readable */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#091421]/10 via-[#091421]/30 to-[#091421]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#040f1e]/95 via-[#040f1e]/55 to-[#040f1e]/10" />

        <div className="relative z-10 max-w-[1400px] mx-auto w-full">
          <StaggerContainer staggerDelay={0.18}>
            <StaggerItem>
              <span
                className="block text-[10px] font-bold tracking-[0.28em] uppercase mb-5 font-sans"
                style={{ color: '#aec7f7' }}
              >
                The Operational Journey
              </span>
            </StaggerItem>
            <StaggerItem duration={1.3}>
              <h1 className="font-serif text-[3.8rem] sm:text-[5rem] md:text-[5.8rem] lg:text-[7rem] leading-[0.93] tracking-tight mb-6 text-white">
                How It Works
              </h1>
            </StaggerItem>
            <StaggerItem duration={1.3}>
              <p
                className="max-w-lg text-[1rem] md:text-[1.05rem] leading-relaxed"
                style={{ color: '#c4c6cf' }}
              >
                Experience seamless aviation. From initial verification to the
                final landing, we have refined the flight rental process into a
                sophisticated, guided path for modern aviators.
              </p>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          Section 2 — Timeline section intro
          Centered layout so the heading visually leads into the
          vertical spine that begins directly below.
      ════════════════════════════════════════════════════════════ */}
      <section className="pt-20 pb-0 px-6 md:px-12 lg:px-20">
        <div className="max-w-[1400px] mx-auto">

          <StaggerContainer className="text-center" staggerDelay={0.17}>
            <StaggerItem>
              <span
                className="block text-[10px] font-bold tracking-[0.32em] uppercase mb-5 font-sans"
                style={{ color: '#aec7f7' }}
              >
                The Flight Journey
              </span>
            </StaggerItem>
            <StaggerItem duration={1.25}>
              <h2
                className="font-serif text-[2.4rem] sm:text-[3rem] md:text-[3.6rem] lg:text-[4.2rem] leading-[1.05] tracking-tight mb-6"
                style={{ color: '#d9e3f6' }}
              >
                From registration<br />to departure
              </h2>
            </StaggerItem>
            <StaggerItem duration={1.2}>
              <p
                className="text-[0.91rem] leading-relaxed mx-auto"
                style={{ color: '#94a3b8', maxWidth: '440px' }}
              >
                Each booking follows a structured path — from verification and
                operational checks through access, briefing, readings, and
                final invoicing.
              </p>
            </StaggerItem>
          </StaggerContainer>

          {/* Visual lead-in — gradient line that feeds directly into the RouteSpine */}
          <FadeUp delay={0.35} className="flex flex-col items-center mt-10">
            {/* Thin line */}
            <div
              style={{
                width: '1px',
                height: '80px',
                background:
                  'linear-gradient(to bottom, transparent 0%, rgba(174,199,247,0.5) 100%)',
              }}
            />
            {/* Tiny beacon at the bottom of the lead-in — signals the route start */}
            <div
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: 'rgba(174,199,247,0.55)',
                boxShadow: '0 0 8px rgba(174,199,247,0.4)',
                marginTop: '2px',
              }}
            />
          </FadeUp>

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          Section 3 — The Guided Journey (3-column timeline)
      ════════════════════════════════════════════════════════════ */}
      <section className="pt-20 pb-28 relative overflow-hidden">

        {/* Abstract flight-corridor background — full section width */}
        <TimelineBackground />

        {/* Journey container — RouteSpine overlays as absolute inset */}
        <div
          ref={journeyRef}
          className="relative max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20"
        >
          {/* Spine — scroll-linked plane + route progress line */}
          <RouteSpine containerRef={journeyRef} />

          {/* Step rows — z-index sits above the spine */}
          <div className="relative" style={{ zIndex: 2 }}>
            {STEPS.map((step) => (
              <JourneyStep
                key={step.index}
                index={step.index}
                icon={step.icon}
                title={step.title}
                description={step.description}
                side={step.side}
                iconFilled={step.iconFilled}
                isLast={step.isLast}
                visual={step.visual}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          Section 4 — Built on Absolute Trust
      ════════════════════════════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 px-6 md:px-12 lg:px-20 relative"
        style={{
          background:
            'linear-gradient(to bottom, #091421, rgba(12,24,39,0.5) 50%, #091421)',
        }}
      >
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-col lg:flex-row items-start gap-14 lg:gap-20">

            {/* Left — heading + trust points */}
            <StaggerContainer className="flex-1" staggerDelay={0.16}>
              <StaggerItem>
                <h2
                  className="font-serif text-[2.2rem] md:text-[2.8rem] lg:text-[3.2rem] leading-tight mb-10"
                  style={{ color: '#d9e3f6' }}
                >
                  Built on<br />Absolute Trust
                </h2>
              </StaggerItem>

              <StaggerItem>
                <div className="flex gap-5 mb-8">
                  <div
                    className="mt-0.5 w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(174,199,247,0.08)' }}
                  >
                    <Icon
                      name="verified_user"
                      style={{
                        color: '#aec7f7',
                        fontSize: '18px',
                        fontVariationSettings: "'FILL' 1",
                      }}
                    />
                  </div>
                  <div>
                    <h4
                      className="font-sans font-bold text-[0.95rem] mb-1.5"
                      style={{ color: '#d9e3f6' }}
                    >
                      Secure Advance Payments
                    </h4>
                    <p
                      className="text-[0.88rem] leading-relaxed"
                      style={{ color: '#94a3b8' }}
                    >
                      Your $100 advance payment is a security commitment. If we
                      cannot confirm your flight due to weather or maintenance,
                      it is returned in full within 24 hours.
                    </p>
                  </div>
                </div>
              </StaggerItem>

              <StaggerItem>
                <div className="flex gap-5">
                  <div
                    className="mt-0.5 w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(174,199,247,0.08)' }}
                  >
                    <Icon
                      name="shield"
                      style={{
                        color: '#aec7f7',
                        fontSize: '18px',
                        fontVariationSettings: "'FILL' 1",
                      }}
                    />
                  </div>
                  <div>
                    <h4
                      className="font-sans font-bold text-[0.95rem] mb-1.5"
                      style={{ color: '#d9e3f6' }}
                    >
                      Tier 1 Safety Protocols
                    </h4>
                    <p
                      className="text-[0.88rem] leading-relaxed"
                      style={{ color: '#94a3b8' }}
                    >
                      Our verification process adheres strictly to international
                      aviation standards, ensuring every pilot and aircraft on
                      our platform meets elite operational criteria.
                    </p>
                  </div>
                </div>
              </StaggerItem>
            </StaggerContainer>

            {/* Right — testimonial card */}
            <FadeUp className="flex-1 w-full" delay={0.18}>
              <div
                className="p-9 md:p-11 rounded-xl relative"
                style={{
                  background: '#16202e',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <div
                  className="absolute top-0 right-0 p-6 pointer-events-none"
                  style={{ opacity: 0.04 }}
                >
                  <Icon name="format_quote" style={{ fontSize: '7rem' }} />
                </div>
                <blockquote
                  className="font-serif text-[1.2rem] md:text-[1.3rem] italic leading-relaxed mb-7 relative z-10"
                  style={{ color: '#d9e3f6' }}
                >
                  &ldquo;The transparency of the OZRentAPlane journey is what
                  sets it apart. I knew exactly where my booking stood at every
                  waypoint.&rdquo;
                </blockquote>
                <div className="flex items-center gap-3.5 relative z-10">
                  <div
                    className="w-11 h-11 rounded-full overflow-hidden border-2 shrink-0"
                    style={{ borderColor: 'rgba(174,199,247,0.18)' }}
                  >
                    <img
                      src="/exclusivePilot.webp"
                      alt="Captain Marcus Vance"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div
                      className="font-bold text-[0.88rem]"
                      style={{ color: '#d9e3f6' }}
                    >
                      Captain Marcus Vance
                    </div>
                    <div
                      className="text-[9.5px] font-bold uppercase tracking-[0.2em] mt-0.5"
                      style={{ color: '#608bca' }}
                    >
                      1,200 Flight Hours
                    </div>
                  </div>
                </div>
              </div>
            </FadeUp>

          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          Section 5 — Ready for Departure CTA
      ════════════════════════════════════════════════════════════ */}
      <section className="relative py-36 px-6 text-center overflow-hidden">
        {/* Background — FuturisticSky */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url("/FuturisticSky.webp")' }}
        />
        {/* Light navy tint to pull the image into the page palette */}
        <div className="absolute inset-0" style={{ background: 'rgba(9,20,33,0.35)' }} />

        <div className="relative z-10 max-w-2xl mx-auto">
          <FadeUp>
            <h2
              className="font-serif text-[3rem] sm:text-[3.8rem] md:text-[4.6rem] leading-tight mb-5"
              style={{ color: '#d9e3f6' }}
            >
              Ready for Departure?
            </h2>
            <p
              className="text-[0.95rem] md:text-[1rem] leading-relaxed mb-11"
              style={{ color: '#94a3b8' }}
            >
              Whether you&apos;re joining our pilot network for the first time
              or returning for another mission — we&apos;ve cleared the path
              for you.
            </p>
          </FadeUp>

          <FadeUp delay={0.14}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/pilotRequirements"
                className="inline-flex items-center justify-center font-sans font-bold text-[11px] tracking-[0.22em] uppercase px-9 py-4 rounded-full transition-all duration-300 hover:brightness-110 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #aec7f7, #608bca)',
                  color: '#0c1a2e',
                  boxShadow: '0 8px 28px rgba(174,199,247,0.22)',
                }}
              >
                Start as a New User
              </a>
              <a
                href="#booking"
                className="inline-flex items-center justify-center font-sans font-bold text-[11px] tracking-[0.22em] uppercase px-9 py-4 rounded-full border transition-all duration-300 hover:bg-white/5 active:scale-95"
                style={{
                  borderColor: 'rgba(255,255,255,0.13)',
                  color: '#d9e3f6',
                  background: 'rgba(22,32,46,0.5)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                Book Next Mission
              </a>
            </div>
          </FadeUp>
        </div>
      </section>

    </main>
  )
}
