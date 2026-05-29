'use client'
import React from 'react'
import { FadeUp, StaggerContainer, StaggerItem, HoverEmphasize } from '@/components/MotionPresets'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'


// ── Section 1: Aircraft Showcase ──────────────────────────────────────────────
function AircraftShowcase() {
  const aircraftImage = { src: '/Cessna-172.webp', alt: 'Cessna 172N parked on wet runway at dusk' } as const

  const specs = [
    {
      label: 'Aircraft Rego',
      value: 'VH-KZG',
      sub: 'Cessna 172N',
      icon: <path d="M9 7h6M9 12h6M9 17h6M5 7h.01M5 12h.01M5 17h.01" />,
    },
    {
      label: 'Seating',
      value: '04',
      sub: 'Seats',
      icon: <path d="M7 18v-2a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v2M9 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm6 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
    },
    {
      label: 'Fuel Capacity',
      value: '54 gallons',
      sub: '(50 usable)',
      icon: <path d="M8 20h8M9 20V9.8a2.8 2.8 0 0 1 2.8-2.8h.4A2.8 2.8 0 0 1 15 9.8V20m0-9h2l1.5 2.5V20" />,
    },
    {
      label: 'Empty Weight',
      value: '690 kg',
      sub: 'typical empty weight',
      icon: <path d="M12 6v6m-4 4h8M6 10h12l-1.5 9h-9z" />,
    },
    {
      label: 'Useful Load',
      value: '1,088 lb',
      sub: 'approx. 493 kg',
      icon: <path d="M12 8v5l3 2m5-3a8 8 0 1 1-16 0 8 8 0 0 1 16 0z" />,
    },
    {
      label: 'Cruise Speed',
      value: '124 knots TAS',
      sub: '',
      icon: <path d="M4 16c2.5-2 5.5-3 8-3s5.5 1 8 3M12 6l2.5 5H9.5L12 6z" />,
    },
  ]

  return (
    <section className="relative overflow-hidden bg-mkt-alt px-6 pt-20 pb-16 md:px-12 md:pt-24 md:pb-[68px] lg:px-20 lg:pt-24 lg:pb-[72px]">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'radial-gradient(circle at 38% 28%, rgba(26,79,214,0.12), transparent 42%)' }}
      />
      {/* Heading indicator watermark — compass rose ghost */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0"
        width="640" height="640" viewBox="0 0 540 540" fill="none"
        style={{ opacity: 0.12 }}
      >
        <circle cx="270" cy="270" r="258" stroke="#0d1b3e" strokeWidth="1.5" />
        <circle cx="270" cy="270" r="188" stroke="#0d1b3e" strokeWidth="0.75" />
        <circle cx="270" cy="270" r="5" stroke="#0d1b3e" strokeWidth="1.5" />
        <line x1="270" y1="12" x2="270" y2="528" stroke="#0d1b3e" strokeWidth="0.5" />
        <line x1="12" y1="270" x2="528" y2="270" stroke="#0d1b3e" strokeWidth="0.5" />
        <line x1="88" y1="88" x2="452" y2="452" stroke="#0d1b3e" strokeWidth="0.35" />
        <line x1="452" y1="88" x2="88" y2="452" stroke="#0d1b3e" strokeWidth="0.35" />
        {Array.from({ length: 72 }, (_, i) => {
          const angle = (i * 5 - 90) * (Math.PI / 180)
          const isCardinal = i % 18 === 0
          const isMajor = i % 6 === 0
          const outerR = 258
          const innerR = isCardinal ? 225 : isMajor ? 240 : 250
          const x1 = 270 + outerR * Math.cos(angle)
          const y1 = 270 + outerR * Math.sin(angle)
          const x2 = 270 + innerR * Math.cos(angle)
          const y2 = 270 + innerR * Math.sin(angle)
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0d1b3e" strokeWidth={isCardinal ? 2.5 : isMajor ? 1.75 : 1} />
        })}
      </svg>
      {/* Cloud wisps — upper corners */}
      <div aria-hidden="true" className="pointer-events-none absolute z-0" style={{ top: '-50px', left: '-70px', width: '440px', height: '240px', borderRadius: '50%', background: 'rgba(220,235,255,0.9)', filter: 'blur(72px)', opacity: 0.18 }} />
      <div aria-hidden="true" className="pointer-events-none absolute z-0" style={{ top: '-30px', right: '-50px', width: '400px', height: '220px', borderRadius: '50%', background: 'rgba(240,248,255,0.9)', filter: 'blur(60px)', opacity: 0.18 }} />
      {/* Cloud wisps — mid section */}
      <div aria-hidden="true" className="pointer-events-none absolute z-0" style={{ top: '45%', left: '20%', width: '420px', height: '200px', borderRadius: '50%', background: 'rgba(210,230,255,0.85)', filter: 'blur(80px)', opacity: 0.12 }} />
      <div aria-hidden="true" className="pointer-events-none absolute z-0" style={{ top: '45%', left: '65%', width: '400px', height: '190px', borderRadius: '50%', background: 'rgba(230,242,255,0.85)', filter: 'blur(75px)', opacity: 0.12 }} />
      {/* Horizon line — faint altitude suggestion */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-0" style={{ top: '60%', height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(26,79,214,0.18) 15%, rgba(26,79,214,0.18) 85%, transparent 100%)' }} />
      {/* Edge vignette */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" style={{ background: 'radial-gradient(ellipse 100% 90% at 50% 50%, transparent 45%, rgba(15,30,55,0.07) 100%)' }} />
      <div className="relative z-10 max-w-[1220px] mx-auto grid grid-cols-1 lg:grid-cols-[45%_55%] gap-8 lg:gap-12 items-center">
        <FadeUp duration={1.1} delay={0.06} viewportMargin="-100px">
          <div className="h-full max-h-[400px] min-h-[300px] overflow-hidden rounded-2xl">
            <img src={aircraftImage.src} alt={aircraftImage.alt} className="h-full w-full object-cover object-center" />
          </div>
        </FadeUp>

        <StaggerContainer className="pt-0.5 md:pt-1.5 lg:pt-0.5" staggerDelay={0.16} viewportMargin="-100px">
          <StaggerItem duration={1.1}>
            <p className="font-sans uppercase tracking-[0.1em] text-[11px] font-semibold mb-2.5 text-brand-blue">FEATURED AIRCRAFT</p>
          </StaggerItem>
          <StaggerItem duration={1.2}>
            <h2 className="font-serif text-[2.1rem] md:text-[2.6rem] lg:text-[3rem] leading-[1.04] tracking-tight text-deep-ink">Cessna 172N</h2>
            <div className="mt-5 mb-6 h-[2px] w-[56px] bg-brand-blue/30" />
          </StaggerItem>
          <StaggerItem duration={1.1}>
            <p className="text-[15px] md:text-[16px] leading-[1.58] text-muted-ink max-w-[500px]">
              The world&apos;s most trusted training aircraft. Reliable, efficient, and perfect for building your flight hours.
            </p>
          </StaggerItem>

          <StaggerItem duration={1.1}>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 md:gap-x-9 gap-y-5 md:gap-y-6">
              {specs.map((spec) => (
                <div key={spec.label}>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-muted-ink leading-[1.35]">{spec.label}</p>
                    <p className="font-sans font-bold text-[20px] md:text-[22px] leading-[1.2] mt-0.5 text-deep-ink">{spec.value}</p>
                    {spec.sub ? <p className="text-[12px] md:text-[13px] text-muted-ink leading-[1.32] mt-0.5">{spec.sub}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </StaggerItem>

          <StaggerItem duration={1.1}>
            <p className="mt-5 text-[12px] md:text-[13px] leading-relaxed text-muted-ink max-w-[500px]">
              Performance figures are typical. Maximum takeoff weight is approximately 2,400 lb. Full specifications are available before hire.
            </p>
            <a
              href="/cessna-172"
              className="mt-4 inline-flex h-[44px] items-center gap-2.5 rounded-md bg-runway-amber px-5 text-[11px] uppercase tracking-[0.14em] text-deep-ink transition-colors hover:bg-[#d97706] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-runway-amber focus-visible:outline-offset-2"
            >
              View full specifications
              <span aria-hidden="true">→</span>
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
    <section className="relative bg-mkt-main py-16 md:py-[68px] lg:py-[72px]">
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
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20">

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
      {/* Cloud wisps — upper corners */}
      <div aria-hidden="true" className="pointer-events-none absolute z-0" style={{ top: '-60px', right: '-60px', width: '420px', height: '220px', borderRadius: '50%', background: 'rgba(215,232,255,0.9)', filter: 'blur(70px)', opacity: 0.18 }} />
      <div aria-hidden="true" className="pointer-events-none absolute z-0" style={{ top: '-40px', left: '-50px', width: '400px', height: '200px', borderRadius: '50%', background: 'rgba(240,248,255,0.9)', filter: 'blur(65px)', opacity: 0.18 }} />
      {/* Cloud wisps — mid section */}
      <div aria-hidden="true" className="pointer-events-none absolute z-0" style={{ top: '45%', left: '20%', width: '420px', height: '200px', borderRadius: '50%', background: 'rgba(210,230,255,0.85)', filter: 'blur(80px)', opacity: 0.12 }} />
      <div aria-hidden="true" className="pointer-events-none absolute z-0" style={{ top: '45%', left: '65%', width: '380px', height: '190px', borderRadius: '50%', background: 'rgba(225,240,255,0.85)', filter: 'blur(75px)', opacity: 0.12 }} />
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
