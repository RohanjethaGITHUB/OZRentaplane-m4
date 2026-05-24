'use client'
import React from 'react'
import { FadeUp, StaggerContainer, StaggerItem, HoverEmphasize } from '@/components/MotionPresets'

// ── Palette — matches AeroVista design system exactly ─────────────────────────
const BASE = '#061524'

// Text tokens from AeroVista
const T_SURFACE = '#d9e3f6'  // on-surface  — primary headings (h2)
const T_BLUE100 = '#dbeafe'  // blue-100    — sub-headings, stats, FAQ Qs
const T_MUTED = '#c4c6cf'  // on-surface-variant — body copy
const T_PRIMARY = '#aec7f7'  // primary     — accent, labels

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
    <section className="relative px-6 pt-20 pb-16 md:px-12 md:pt-24 md:pb-[68px] lg:px-20 lg:pt-24 lg:pb-[72px]">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'radial-gradient(circle at 38% 28%, rgba(10,43,87,0.28), transparent 42%)' }}
      />
      <div className="relative z-10 max-w-[1220px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.06fr)_minmax(410px,0.94fr)] gap-8 lg:gap-12 items-start">
        <FadeUp duration={1.1} delay={0.06} viewportMargin="-100px">
          <div className="rounded-xl p-2.5" style={{ backgroundColor: 'rgba(8,27,52,0.4)' }}>
            <div className="relative overflow-hidden rounded-[12px] border aspect-[16/10] max-h-[345px]" style={{ borderColor: 'rgba(151,177,215,0.12)' }}>
              <img src={aircraftImage.src} alt={aircraftImage.alt} className="h-full w-full object-cover object-center" />
            </div>
          </div>
        </FadeUp>

        <StaggerContainer className="pt-0.5 md:pt-1.5 lg:pt-0.5" staggerDelay={0.16} viewportMargin="-100px">
          <StaggerItem duration={1.1}>
            <p className="font-sans uppercase tracking-[0.14em] text-[12px] font-semibold mb-2.5 text-[#E0B13B]">Featured Aircraft</p>
          </StaggerItem>
          <StaggerItem duration={1.2}>
            <h2 className="font-serif text-[2.1rem] md:text-[2.6rem] lg:text-[3rem] leading-[1.04] tracking-tight text-[#F4F6FA]">Cessna 172N</h2>
            <div className="mt-5 mb-6 h-[2px] w-[56px] bg-[#E0B13B]" />
          </StaggerItem>
          <StaggerItem duration={1.1}>
            <p className="text-[15px] md:text-[16px] leading-[1.58] text-[#A6B2C6] max-w-[500px]">
              The world&apos;s most trusted training aircraft. Reliable, efficient, and perfect for building your flight hours.
            </p>
          </StaggerItem>

          <StaggerItem duration={1.1}>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 md:gap-x-9 gap-y-5 md:gap-y-6">
              {specs.map((spec) => (
                <div key={spec.label} className="flex gap-2.5">
                  <span className="mt-0.5 h-[29px] w-[29px] shrink-0 rounded-full border border-[rgba(151,177,215,0.12)] bg-[rgba(8,27,52,0.38)] flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7E8AA0" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {spec.icon}
                    </svg>
                  </span>
                  <div>
                    <p className="text-[13px] text-[#A6B2C6] leading-[1.35]">{spec.label}</p>
                    <p className="font-serif text-[22px] md:text-[24px] leading-[1.15] mt-0.5 text-[#F4F6FA]">{spec.value}</p>
                    {spec.sub ? <p className="text-[12px] md:text-[13px] text-[#7E8AA0] leading-[1.32] mt-0.5">{spec.sub}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </StaggerItem>

          <StaggerItem duration={1.1}>
            <p className="mt-5 text-[12px] md:text-[13px] leading-relaxed text-[#7E8AA0] max-w-[500px]">
              Performance figures are typical. Maximum takeoff weight is approximately 2,400 lb. Full specifications are available before hire.
            </p>
            <a
              href="/cessna-172"
              className="mt-3 inline-flex h-[41px] items-center gap-2.5 rounded-sm border px-4 text-[11px] uppercase tracking-[0.14em] text-[#EAF0F8] transition-colors hover:text-[#F0C24A] hover:border-[#E0B13B] hover:bg-[rgba(224,177,59,0.06)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E0B13B] focus-visible:outline-offset-2"
              style={{ borderColor: 'rgba(151,177,215,0.22)', backgroundColor: 'rgba(6,21,42,0.52)' }}
            >
              View full specifications
              <span className="text-[#E0B13B]" aria-hidden="true">→</span>
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
    <section className="relative py-16 md:py-[68px] lg:py-[72px]">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(2,11,25,0.1) 0%, rgba(2,11,25,0.34) 100%), radial-gradient(circle at 50% 48%, rgba(151,177,215,0.08), transparent 38%)',
        }}
      />
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20">

        {/* Section heading */}
        <StaggerContainer className="text-center mb-16 md:mb-20" staggerDelay={0.2} viewportMargin="-80px">
          <StaggerItem duration={1.05}>
            <p className="font-sans text-[12px] tracking-[0.14em] uppercase mb-5" style={{ color: '#E0B13B' }}>
              Flying with us is as simple as
            </p>
          </StaggerItem>
          <StaggerItem duration={1.3}>
            <h2 className="font-serif text-4xl md:text-5xl mb-4 text-[#d9e3f6]">Three steps to takeoff</h2>
          </StaggerItem>
        </StaggerContainer>

        {/* Steps — numbers lead the reveal rhythm */}
        <StaggerContainer
          className="relative grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-14"
          staggerDelay={0.22}
          viewportMargin="-80px"
        >
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-[32px] hidden md:block border-t border-dashed border-[rgba(151,177,215,0.16)]" />
          {steps.map((step) => (
            <StaggerItem key={step.n} duration={1.15}>
              <div className="relative text-center">
                <div className="mx-auto mb-6 h-16 w-16 rounded-full border border-[rgba(151,177,215,0.2)] bg-[rgba(8,27,52,0.35)] flex items-center justify-center shadow-[0_0_0_10px_rgba(151,177,215,0.05)]">
                  <span className="font-serif text-xl text-[#dbeafe]">{step.n}</span>
                </div>
                <div className="font-sans text-[12px] tracking-[0.14em] uppercase mb-3 text-[#E0B13B]">
                  {step.n}
                </div>
                <h3 className="font-serif text-2xl text-[#dbeafe] mb-2">
                  {step.label}
                </h3>
                <p className="text-sm text-[#c4c6cf] leading-relaxed font-sans max-w-[290px] mx-auto">
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
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#D8DFEA" strokeWidth="1.55" aria-hidden="true">
          <path d="M4.5 12.4 9 16.9l10.5-10.5" stroke="#E0B13B" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 2.8 4.8 5.5v5.7c0 5.1 3.4 9.3 7.2 10.2 3.8-.9 7.2-5.1 7.2-10.2V5.5L12 2.8z" />
          <path d="M9.2 10.1h5.6" stroke="#E0B13B" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Well-Maintained Fleet',
      sub: 'Our aircraft are meticulously maintained for your safety.',
      icon: (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#D8DFEA" strokeWidth="1.55" aria-hidden="true">
          <path d="M12 4.6v6.2l4.2 2.5" />
          <circle cx="12" cy="12" r="7.6" />
          <path d="m12 12 2.8-2.2" stroke="#E0B13B" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M12 8.1v3.9" stroke="#E0B13B" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Wet Hire',
      sub: 'Aircraft hire with fuel built into the hourly rate, giving you simpler and more predictable flying costs.',
      icon: (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#D8DFEA" strokeWidth="1.55" aria-hidden="true">
          <path d="M8.2 20v-7.8a2.6 2.6 0 0 1 2.6-2.6h2.4a2.6 2.6 0 0 1 2.6 2.6V20" />
          <path d="M8.2 12h7.6" />
          <path d="M15.8 13.2h1.8l1.4 2.2V20" />
          <path d="M10.4 6.8h3.2" stroke="#E0B13B" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M12 5.2v3.2" stroke="#E0B13B" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Multi-Day Hire',
      sub: 'Discounts on longer rentals to fit your training schedule.',
      icon: (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#D8DFEA" strokeWidth="1.55" aria-hidden="true">
          <path d="M7 3.6v2.2m10-2.2v2.2M4.7 8.5h14.6M5.4 5.8h13.2a1 1 0 0 1 1 1v11.4a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1V6.8a1 1 0 0 1 1-1z" />
          <path d="M9 13.1h6.2" stroke="#E0B13B" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M9 15.8h4.4" stroke="#E0B13B" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Simple Online Booking',
      sub: 'Book, manage, and fly entirely online.',
      icon: (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#D8DFEA" strokeWidth="1.55" aria-hidden="true">
          <rect x="5.2" y="4.6" width="13.6" height="14.8" rx="2" />
          <path d="M9 8.2h6m-6 3.3h6m-6 3.3h3.2" />
          <path d="m14.8 14.5 2.8 2.8" stroke="#E0B13B" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M17.6 14.5h-2.8v2.8" stroke="#E0B13B" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Insurance-Ready',
      sub: 'Our insurance partners make rental coverage easy.',
      icon: (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#D8DFEA" strokeWidth="1.55" aria-hidden="true">
          <path d="M12 3.2 5.1 6v5.2c0 4.6 3.1 8.4 6.9 9.3 3.8-.9 6.9-4.7 6.9-9.3V6L12 3.2z" />
          <path d="m9.1 12.2 2.1 2.1 3.7-3.7" stroke="#E0B13B" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8.5 8.5h7" stroke="#E0B13B" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ),
    },
  ]

  return (
    <section className="relative overflow-hidden px-6 pt-16 pb-20 md:px-12 md:pt-[72px] md:pb-24 lg:px-20 lg:pt-20 lg:pb-24">
      {/* Soft illuminated field — static, not animated */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(8,27,52,0.42), transparent 48%), radial-gradient(ellipse 90% 60% at 50% 55%, rgba(174,199,247,0.055) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto">

        {/* Heading + subtitle */}
        <StaggerContainer
          className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 mb-14"
          staggerDelay={0.2}
          viewportMargin="-80px"
        >
          <div className="max-w-xl">
            <StaggerItem duration={1.3}>
              <p className="font-sans text-[12px] tracking-[0.14em] uppercase font-semibold mb-5" style={{ color: '#E0B13B' }}>
                Why fly with us
              </p>
              <h2 className="font-serif text-4xl md:text-6xl font-normal leading-[1.05] tracking-tight mb-5" style={{ color: T_SURFACE }}>
                Built for pilots. Backed by experience.
              </h2>
            </StaggerItem>
          </div>
          <div className="max-w-md md:justify-self-end self-end">
            <StaggerItem duration={1.2}>
              <p className="font-sans text-[16px] md:text-[17px] leading-[1.6]" style={{ color: '#A6B2C6' }}>
                We make flight training and aircraft rental simple, transparent, and pilot-focused.
              </p>
              <div className="mt-6 h-[2px] w-12 bg-[#E0B13B]/90" />
            </StaggerItem>
          </div>
        </StaggerContainer>

        {/* Features grid — light separators, not heavy cards */}
        <StaggerContainer
          className="grid grid-cols-1 gap-0 border-y border-[rgba(151,177,215,0.1)] md:grid-cols-2 lg:grid-cols-3"
          staggerDelay={0.22}
          viewportMargin="-80px"
        >
          {cards.map((card, idx) => (
            <StaggerItem key={card.label} duration={1.2}>
              <HoverEmphasize hoverY={-2} hoverScale={1.005} duration={0.3} className="h-full">
                <div
                  className="p-8 md:p-9 relative group overflow-hidden transition-all duration-300 h-full"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.008) 0%, rgba(255,255,255,0.003) 100%)',
                    borderRight: idx % 3 !== 2 ? '1px solid rgba(151,177,215,0.1)' : undefined,
                    borderTop: idx > 2 ? '1px solid rgba(151,177,215,0.1)' : undefined,
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-[rgba(151,177,215,0.025)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="relative z-10">
                    <div className="mb-6 h-[56px] w-[56px] rounded-full border flex items-center justify-center bg-[rgba(8,27,52,0.32)] transition-colors group-hover:bg-[rgba(224,177,59,0.05)] group-hover:border-[#E0B13B]" style={{ borderColor: 'rgba(224,177,59,0.32)' }}>
                      {card.icon}
                    </div>
                    <h3 className="font-serif text-[1.55rem] font-normal mb-2.5" style={{ color: '#F4F6FA' }}>{card.label}</h3>
                    <p className="font-sans text-[14px] md:text-[15px] leading-[1.6]" style={{ color: '#A6B2C6' }}>{card.sub}</p>
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
    <section
      className="relative w-full overflow-hidden px-6 pt-[108px] pb-[92px] md:px-12 md:pt-[122px] md:pb-[112px] lg:px-20 lg:pt-[136px] lg:pb-[132px] min-h-[360px] md:min-h-[420px] lg:min-h-[500px]"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'url("/optimized/home-preFooter-1600.jpg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,11,25,0.84)_0%,rgba(2,11,25,0.68)_40%,rgba(2,11,25,0.88)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[96px] md:h-[104px] lg:h-[110px] bg-[linear-gradient(180deg,rgba(2,11,25,0.72)_0%,rgba(2,11,25,0.34)_58%,rgba(2,11,25,0)_100%)]" />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[720px] flex-col items-center justify-center text-center">
        <FadeUp duration={1.4} delay={0} viewportMargin="-80px">
          <h2 className="font-serif text-[2.2rem] md:text-[3.35rem] lg:text-[3.85rem] font-normal leading-[1.08] tracking-tight mb-4 md:mb-5" style={{ color: '#F4F6FA' }}>
            Schedule Your Checkout Flight Now
          </h2>
        </FadeUp>

        <FadeUp duration={1.25} delay={0.3} viewportMargin="-80px">
          <p className="font-sans text-[16px] md:text-[18px] leading-[1.6] mb-8 md:mb-9 max-w-[620px]" style={{ color: '#D8DFEA' }}>
            Request your checkout flight, complete the review process, and get ready to fly with confidence from Bankstown.
          </p>
        </FadeUp>

        <FadeUp duration={1.1} delay={0.55} viewportMargin="-80px">
          <a
            href="/checkout-process"
            className="inline-flex items-center gap-2.5 h-[48px] px-8 rounded-[4px] font-sans font-bold text-[13px] tracking-[0.08em] uppercase transition-colors duration-300 active:scale-95"
            style={{ background: '#E0B13B', color: '#061120' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F0C24A' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#E0B13B' }}
          >
            Request Checkout
            <span aria-hidden="true">→</span>
          </a>
        </FadeUp>
        </div>
    </section>
  )
}

// ── Default export ─────────────────────────────────────────────────────────────
export default function HomeContent() {
  return (
    <div
      className="relative z-20 w-full overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 50% 8%, rgba(10,43,87,0.32), transparent 36%), radial-gradient(circle at 20% 44%, rgba(8,27,52,0.38), transparent 34%), radial-gradient(circle at 80% 74%, rgba(10,43,87,0.24), transparent 36%), linear-gradient(180deg, #061524 0%, #0B2035 38%, #061524 100%)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[220px]"
        style={{ background: 'linear-gradient(180deg, rgba(2,11,25,0.85) 0%, rgba(2,11,25,0) 100%)' }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[180px]"
        style={{ background: 'linear-gradient(180deg, rgba(2,11,25,0) 0%, rgba(2,11,25,0.45) 55%, rgba(2,11,25,0.72) 100%)' }}
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
