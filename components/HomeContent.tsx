'use client'
import React from 'react'
import { FadeUp, StaggerContainer, StaggerItem, HoverEmphasize } from '@/components/MotionPresets'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'
import AtmoClouds from '@/components/AtmoClouds'


// ── Section 1: Aircraft Showcase ──────────────────────────────────────────────
function AircraftShowcase() {
  const aircraftImage = { src: '/Cessna-172.webp', alt: 'Cessna 172N parked on wet runway at dusk' } as const

  const specs = [
    {
      label: 'Rego',
      value: 'VH-KZG',
    },
    {
      label: 'Seating',
      value: '04',
    },
    {
      label: 'Fuel',
      value: '54 gal',
    },
    {
      label: 'Weight',
      value: '690 kg',
    },
    {
      label: 'Useful Load',
      value: '1,088 lb',
    },
    {
      label: 'Cruise Speed',
      value: '124 KTAS',
    },
  ]

  return (
    <section
      className="relative overflow-hidden px-6 py-20 md:px-10 md:py-24 lg:px-14 lg:py-28"
      style={{
        background:
          'linear-gradient(to bottom, #00132f 0%, #051b39 25%, #0a2d5e 55%, #c8dff5 85%, #dce8f8 100%)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'radial-gradient(circle at 28% 38%, rgba(26,79,214,0.24), transparent 48%)' }}
      />
      <AtmoClouds shapes={['E']} topOffset="2%" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-0" style={{ top: '60%', height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(26,79,214,0.18) 15%, rgba(26,79,214,0.18) 85%, transparent 100%)' }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" style={{ background: 'radial-gradient(ellipse 100% 90% at 50% 50%, transparent 45%, rgba(0,8,20,0.5) 100%)' }} />

      <div className="relative z-10 mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
        <FadeUp duration={1.1} delay={0.06} viewportMargin="-100px">
          <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#0a1f3d] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.52)] transition-shadow duration-300 hover:shadow-[0_0_0_1px_rgba(167,200,255,0.20),0_0_36px_8px_rgba(167,200,255,0.10)]">
            <div className="aspect-[4/3] overflow-hidden">
              <img
                src={aircraftImage.src}
                alt={aircraftImage.alt}
                className="h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.02]"
              />
            </div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#00132f]/28 via-transparent to-transparent" />
          </div>
        </FadeUp>

        <StaggerContainer className="pt-1 md:pt-2" staggerDelay={0.16} viewportMargin="-100px">
          <StaggerItem duration={1.1}>
            <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.15em] text-clearsky">Featured Aircraft</p>
          </StaggerItem>
          <StaggerItem duration={1.2}>
            <h2 className="font-serif text-[2.15rem] leading-[1.04] tracking-[0.015em] text-white md:text-[2.8rem] lg:text-[3.2rem]">Cessna 172N</h2>
            <div className="mb-7 mt-5 h-[2px] w-24 bg-runway-amber/90" />
          </StaggerItem>

          <StaggerItem duration={1.1}>
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              {specs.map((spec) => (
                <div
                  key={spec.label}
                  className="rounded-xl border border-white/10 bg-[#0a1f3d]/95 p-4 md:p-5"
                >
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.15em] text-cloud-muted/80">{spec.label}</p>
                  <p className="mt-2 font-serif text-[1.45rem] leading-[1.08] text-white md:text-[1.7rem]">{spec.value}</p>
                </div>
              ))}
            </div>
          </StaggerItem>

          <StaggerItem duration={1.1}>
            <a
              href="/cessna-172"
              className="mt-7 inline-flex items-center rounded-md bg-runway-amber px-7 py-3.5 font-sans text-[10px] font-bold uppercase tracking-[0.15em] text-deep-ink transition-colors hover:bg-runway-amber-hot focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-runway-amber focus-visible:outline-offset-2"
            >
              View Full Specifications &rarr;
            </a>
          </StaggerItem>
        </StaggerContainer>
      </div>
    </section>
  )
}

// ── Section 2: Flight Manifest ─────────────────────────────────────────────────
function FlightManifest() {
  const steps = [
    { n: '01', label: 'Register', sub: 'Create your account and share your pilot details.' },
    { n: '02', label: 'Checkout', sub: 'Complete your checkout flight with the Oz Rent A Plane team.' },
    { n: '03', label: 'Apply and Enjoy', sub: 'Submit your booking request and enjoy flying from Bankstown.' },
  ]

  return (
    <section className="relative overflow-hidden bg-mkt-main py-16 md:py-[68px] lg:py-[72px]">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(circle at 50% 48%, rgba(26,79,214,0.08), transparent 38%)',
        }}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 200 200"
        className="pointer-events-none absolute right-8 top-1/2 z-0 hidden h-[200px] w-[200px] -translate-y-1/2 opacity-[0.04] md:block"
      >
        <path
          d="M20 110 L96 98 L136 36 L152 40 L126 96 L182 90 L188 106 L126 116 L134 158 L118 166 L96 120 L30 130 Z"
          fill="none"
          stroke="#1a4fd6"
          strokeWidth="3"
        />
      </svg>
      <AtmoClouds shapes={['A', 'C']} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 z-0"
        style={{ top: '65%', height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(26,79,214,0.12) 15%, rgba(26,79,214,0.12) 85%, transparent 100%)' }}
      />
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 lg:px-20">

        {/* Section heading */}
        <StaggerContainer className="text-center mb-16 md:mb-20" staggerDelay={0.2} viewportMargin="-80px">
          <StaggerItem duration={1.05}>
              <p className="font-sans text-[12px] tracking-[0.14em] uppercase mb-5" style={{ color: '#1a4fd6' }}>
              Flying with us is as simple as
            </p>
          </StaggerItem>
          <StaggerItem duration={1.3}>
            <h2 className="font-serif text-4xl md:text-5xl mb-4 text-deep-ink">Three steps to takeoff</h2>
          </StaggerItem>
        </StaggerContainer>

        {/* Steps — numbers lead the reveal rhythm */}
        <StaggerContainer
          className="relative grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-14"
          staggerDelay={0.22}
          viewportMargin="-80px"
        >
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-[32px] hidden md:block border-t-2 border-dashed border-[rgba(26,79,214,0.35)]" />
          {steps.map((step) => (
            <StaggerItem key={step.n} duration={1.15}>
              <div className="relative text-center">
                <div className="mx-auto mb-6 h-16 w-16 rounded-full border border-mkt-subtle bg-horizon-border flex items-center justify-center shadow-[0_0_0_10px_rgba(151,177,215,0.10)]">
                  <span className="font-serif text-xl text-runway-amber">{step.n}</span>
                </div>
                <h3 className="font-serif text-2xl text-deep-ink mb-2">
                  {step.label}
                </h3>
                <p className="text-sm text-muted-ink leading-relaxed font-sans max-w-[290px] mx-auto">
                  {step.sub}
                </p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

      </div>
    </section>
  )
}

// ── Section 3: Why Fly With Us ────────────────────────────────────────────────
function WhyFlyWithUs() {
  const cards = [
    {
      label: 'Transparent Pricing',
      sub: 'Clear rates, no hidden fees, and no surprises.',
      icon: (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#1a4fd6" strokeWidth="1.55" aria-hidden="true">
          <path d="M4.5 12.4 9 16.9l10.5-10.5" stroke="#f59e0b" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 2.8 4.8 5.5v5.7c0 5.1 3.4 9.3 7.2 10.2 3.8-.9 7.2-5.1 7.2-10.2V5.5L12 2.8z" />
          <path d="M9.2 10.1h5.6" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Well-Maintained Fleet',
      sub: 'Our aircraft are meticulously maintained for your safety.',
      icon: (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#1a4fd6" strokeWidth="1.55" aria-hidden="true">
          <path d="M12 4.6v6.2l4.2 2.5" />
          <circle cx="12" cy="12" r="7.6" />
          <path d="m12 12 2.8-2.2" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M12 8.1v3.9" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Wet Hire',
      sub: 'Aircraft hire with fuel built into the hourly rate, giving you simpler and more predictable flying costs.',
      icon: (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#1a4fd6" strokeWidth="1.55" aria-hidden="true">
          <path d="M8.2 20v-7.8a2.6 2.6 0 0 1 2.6-2.6h2.4a2.6 2.6 0 0 1 2.6 2.6V20" />
          <path d="M8.2 12h7.6" />
          <path d="M15.8 13.2h1.8l1.4 2.2V20" />
          <path d="M10.4 6.8h3.2" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M12 5.2v3.2" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Multi-Day Hire',
      sub: 'Discounts on longer rentals to fit your training schedule.',
      icon: (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#1a4fd6" strokeWidth="1.55" aria-hidden="true">
          <path d="M7 3.6v2.2m10-2.2v2.2M4.7 8.5h14.6M5.4 5.8h13.2a1 1 0 0 1 1 1v11.4a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1V6.8a1 1 0 0 1 1-1z" />
          <path d="M9 13.1h6.2" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M9 15.8h4.4" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Simple Online Booking',
      sub: 'Book, manage, and fly entirely online.',
      icon: (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#1a4fd6" strokeWidth="1.55" aria-hidden="true">
          <rect x="5.2" y="4.6" width="13.6" height="14.8" rx="2" />
          <path d="M9 8.2h6m-6 3.3h6m-6 3.3h3.2" />
          <path d="m14.8 14.5 2.8 2.8" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M17.6 14.5h-2.8v2.8" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Insurance-Ready',
      sub: 'Our insurance partners make rental coverage easy.',
      icon: (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#1a4fd6" strokeWidth="1.55" aria-hidden="true">
          <path d="M12 3.2 5.1 6v5.2c0 4.6 3.1 8.4 6.9 9.3 3.8-.9 6.9-4.7 6.9-9.3V6L12 3.2z" />
          <path d="m9.1 12.2 2.1 2.1 3.7-3.7" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8.5 8.5h7" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ),
    },
  ]

  return (
    <section className="relative overflow-hidden bg-mkt-alt px-6 pt-16 pb-20 md:px-12 md:pt-[72px] md:pb-24 lg:px-20 lg:pt-20 lg:pb-24">
      {/* Soft illuminated field — static, not animated */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(ellipse at 80% 50%, rgba(26,79,214,0.08) 0%, transparent 60%), radial-gradient(circle at 50% 30%, rgba(26,79,214,0.12), transparent 48%), radial-gradient(ellipse 90% 60% at 50% 55%, rgba(174,199,247,0.055) 0%, transparent 70%)',
        }}
      />
      <AtmoClouds direction="rtl" shapes={['B', 'D']} />
      {/* Horizon line */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-0" style={{ top: '60%', height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(26,79,214,0.18) 15%, rgba(26,79,214,0.18) 85%, transparent 100%)' }} />
      {/* Edge vignette */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" style={{ background: 'radial-gradient(ellipse 100% 90% at 50% 50%, transparent 45%, rgba(15,30,55,0.06) 100%)' }} />

      <div className="relative z-10 max-w-7xl mx-auto">

        {/* Heading + subtitle */}
        <StaggerContainer
          className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 mb-14"
          staggerDelay={0.2}
          viewportMargin="-80px"
        >
          <div className="max-w-xl">
            <StaggerItem duration={1.3}>
              <p className="font-sans text-[12px] tracking-[0.14em] uppercase font-semibold mb-5" style={{ color: '#1a4fd6' }}>
                Why fly with us
              </p>
              <h2 className="font-serif text-4xl md:text-6xl font-normal leading-[1.05] tracking-tight mb-5 text-deep-ink">
                Built for pilots. Backed by experience.
              </h2>
            </StaggerItem>
          </div>
          <div className="max-w-md md:justify-self-end self-end">
            <StaggerItem duration={1.2}>
              <p className="font-sans text-[16px] md:text-[17px] leading-[1.6]" style={{ color: '#4b6390' }}>
                We make flight training and aircraft rental simple, transparent, and pilot-focused.
              </p>
              <div className="mt-6 h-[2px] w-12 bg-runway-amber/90" />
            </StaggerItem>
          </div>
        </StaggerContainer>

        {/* Features grid — light separators, not heavy cards */}
        <StaggerContainer
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          staggerDelay={0.22}
          viewportMargin="-80px"
        >
          {cards.map((card, idx) => (
            <StaggerItem key={card.label} duration={1.2}>
              <HoverEmphasize hoverY={-2} hoverScale={1.005} duration={0.3} className="h-full">
                <div
                  className="p-5 relative group overflow-hidden transition-all duration-300 h-full rounded-2xl bg-pale-lift shadow-[0_2px_12px_rgba(21,45,90,0.07)] border-l-[3px] border-l-runway-amber"
                >
                  <div className="relative z-10">
                    <div className="mb-4 h-10 w-10 rounded-[10px] flex items-center justify-center bg-horizon-border">
                      {card.icon}
                    </div>
                    <h3 className="font-sans text-[15px] font-medium mb-2.5 text-deep-ink">{card.label}</h3>
                    <p className="font-sans text-[13px] leading-[1.6]" style={{ color: '#4b6390' }}>{card.sub}</p>
                  </div>
                </div>
              </HoverEmphasize>
            </StaggerItem>
          ))}
        </StaggerContainer>

      </div>
    </section>
  )
}

// ── Section 4: Your Clearance Awaits ──────────────────────────────────────────
function ClearanceAwaits() {
  return (
    <PreFooterCTA
      heading="Ready to Fly Your Way?"
      subtext="Create your account and start booking from Bankstown today."
      ctaLabel="Create Your Account"
      ctaHref="/login"
    />
  )
}

// ── Default export ─────────────────────────────────────────────────────────────
export default function HomeContent() {
  return (
    <div
      className="relative z-20 w-full overflow-hidden bg-mkt-main"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[220px]"
        style={{ background: 'linear-gradient(180deg, rgba(26,79,214,0.18) 0%, rgba(26,79,214,0) 100%)' }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[180px]"
        style={{ background: 'linear-gradient(180deg, rgba(26,79,214,0) 0%, rgba(26,79,214,0.10) 55%, rgba(26,79,214,0.18) 100%)' }}
      />
      <AircraftShowcase />
      <div className="relative z-10 w-full" style={{ backgroundColor: 'transparent' }}>
        <FlightManifest />
        <WhyFlyWithUs />
        <ClearanceAwaits />
      </div>
    </div>
  )
}
