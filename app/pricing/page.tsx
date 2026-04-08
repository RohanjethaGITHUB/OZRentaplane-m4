'use client'

import { useState } from 'react'
import { FadeUp, StaggerContainer, StaggerItem, HoverEmphasize } from '@/components/MotionPresets'

// ─── Icon helper (Material Symbols Outlined) ──────────────────────────────────
function Icon({ name, className = '', style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return <span className={`material-symbols-outlined ${className}`} style={style}>{name}</span>
}

// ─── FAQ accordion item ───────────────────────────────────────────────────────
function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-[#0c1827] rounded-lg overflow-hidden border border-white/5">
      <button
        className="w-full px-8 py-6 text-left flex justify-between items-center hover:bg-[#111e30] transition-colors"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="font-sans font-semibold text-[#d9e3f6]">{question}</span>
        <Icon
          name={open ? 'expand_less' : 'expand_more'}
          className="text-[#aec7f7] transition-transform duration-200"
        />
      </button>
      {open && (
        <div className="px-8 pb-6 text-[0.85rem] text-[#94a3b8] leading-relaxed font-sans">
          {answer}
        </div>
      )}
    </div>
  )
}

const FAQ_ITEMS = [
  {
    question: 'How is fuel billing handled exactly?',
    answer:
      'We operate on a "Wet-Rate" equivalent. The base price is provided, and fuel is billed at the pump price minus our membership discount. This ensures you only pay for what you burn.',
  },
  {
    question: 'What happens if my package expires?',
    answer:
      'Unused hours in a pre-paid package are non-refundable after 12 months, but can be extended for a small administrative fee if requested at least 30 days before expiry.',
  },
  {
    question: 'Is insurance included in these rates?',
    answer:
      'Hull and liability insurance is included in all rental rates. Pilots are covered under our policy subject to meeting the minimum hours and currency requirements.',
  },
  {
    question: 'Can I use hours for multi-day trips?',
    answer:
      'Yes. Package hours can be used for extended cross-country flights. A 2-hour daily minimum applies when the aircraft is kept away from home base overnight.',
  },
  {
    question: 'What is the weather refund policy?',
    answer:
      'If a flight is cancelled due to weather and we deem conditions unsuitable, no hours are deducted from your package. For personal weather decisions, our standard cancellation policy applies.',
  },
  {
    question: 'Do you offer aircraft for commercial training?',
    answer:
      'Our fleet is available for PPL and CPL training with an approved instructor. Commercial training bookings require prior coordination with our operations team.',
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  return (
    <main className="bg-[#091421] text-[#d9e3f6] overflow-x-hidden">

      {/* ── 1. Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative px-6 md:px-12 lg:px-20 overflow-hidden min-h-[500px] md:min-h-[750px] flex items-center">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/pricing-hero.webp")' }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#091421]/60 via-[#091421]/30 to-transparent" />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#091421]/25 via-transparent to-[#091421]/35" />

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-16">
          <StaggerContainer className="max-w-xl" staggerDelay={0.25}>
            <StaggerItem duration={1.4}>
              <h1 className="font-serif text-5xl md:text-7xl font-normal leading-[1.05] tracking-tight mb-6 text-white">
                Transparent <br />
                Pricing
              </h1>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[1rem] leading-relaxed text-[#c4c6cf] mb-10 max-w-md">
                Elevate your journey with predictable costs. Our premium fleet is accessible to
                approved pilots with a clear structure designed for both casual sorties and regular
                navigation.
              </p>
            </StaggerItem>
          </StaggerContainer>
          <div className="flex flex-wrap items-center gap-4 mt-6">
            <FadeUp delay={1.2} duration={1.4}>
              <a
                href="/pilotRequirements"
                className="inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] rounded-md font-sans font-bold tracking-widest uppercase text-[0.8rem] px-8 py-4 shadow-2xl shadow-[#aec7f7]/20 transition-all active:scale-95 hover:brightness-110"
              >
                Get Approved to Fly
              </a>
            </FadeUp>
            <FadeUp delay={1.5} duration={1.4}>
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

      {/* ── 2. Pricing Cards ─────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20 -mt-16 relative z-20 pb-32">
        <StaggerContainer className="mb-16 pt-16 border-t border-white/5" staggerDelay={0.2} viewportMargin="-20%">
          <StaggerItem duration={1.4}>
            <p className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4">
              Rental Rates
            </p>
          </StaggerItem>
          <StaggerItem duration={1.4}>
            <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6]">
              Choose Your Plan
            </h2>
          </StaggerItem>
        </StaggerContainer>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-8" staggerDelay={0.3} viewportMargin="-20%">
          {/* Casual Hourly */}
          <StaggerItem duration={1.6}>
            <HoverEmphasize hoverY={-12} hoverScale={1.02} duration={0.6} className="bg-gradient-to-br from-[#0a121e] to-[#08101a] p-10 rounded-xl flex flex-col h-full border border-white/5 shadow-lg relative group hover:from-[#0d1726] hover:to-[#0a121e] hover:border-[#aec7f7]/30 hover:shadow-2xl hover:shadow-[#aec7f7]/5 transition-all duration-500">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#121f33] text-[#94a3b8] px-6 py-1.5 rounded-full text-[10px] font-sans font-bold uppercase tracking-widest whitespace-nowrap shadow-md border border-white/5 group-hover:border-[#aec7f7]/20 group-hover:text-[#c4c6cf] transition-all duration-500">
                Hourly Rate
              </div>
              <span className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4 group-hover:text-[#aec7f7] transition-colors duration-500 mt-2">On-Demand</span>
              <h3 className="font-serif text-3xl font-normal text-[#d9e3f6] mb-6 group-hover:text-white transition-colors duration-500">Casual Hourly Rate</h3>
              <div className="mb-8 group-hover:scale-105 transform origin-left transition-transform duration-500">
                <span className="text-5xl font-light text-[#aec7f7]">$320</span>
                <span className="text-[#94a3b8] font-sans"> / hour</span>
              </div>
              <p className="text-[#94a3b8] font-sans mb-8 text-[0.85rem] leading-relaxed">
                Perfect for the occasional pilot seeking spontaneous access to the skies without
                long-term commitment.
              </p>
              <div className="mt-auto">
                <button className="w-full font-sans font-bold text-[0.8rem] tracking-widest uppercase py-4 rounded border border-white/20 text-[#c4c6cf] group-hover:border-white/50 group-hover:text-white transition-all duration-300">
                  Select Plan
                </button>
              </div>
            </HoverEmphasize>
          </StaggerItem>

          {/* 10 Hour Package */}
          <StaggerItem duration={1.6}>
            <HoverEmphasize hoverY={-12} hoverScale={1.02} duration={0.6} className="bg-gradient-to-br from-[#0f1d2e] to-[#0a121e] p-10 rounded-xl flex flex-col h-full border border-[#aec7f7]/20 shadow-[0_20px_40px_rgba(0,0,0,0.3)] relative group hover:from-[#13253b] hover:to-[#0c1827] hover:border-[#aec7f7]/40 hover:shadow-2xl hover:shadow-[#aec7f7]/10 transition-all duration-500">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1b314d] text-[#c4c6cf] px-6 py-1.5 rounded-full text-[10px] font-sans font-bold uppercase tracking-widest whitespace-nowrap shadow-lg border border-[#aec7f7]/20 group-hover:border-[#aec7f7]/40 group-hover:text-white transition-all duration-500">
                Standard Combo
              </div>
              <span className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4 group-hover:text-[#aec7f7] transition-colors duration-500 mt-2">The Weekend Flyer</span>
              <h3 className="font-serif text-3xl font-normal text-[#d9e3f6] mb-6 group-hover:text-white transition-colors duration-500">10 Hour Package</h3>
              <div className="mb-8 group-hover:scale-105 transform origin-left transition-transform duration-500">
                <span className="text-5xl font-light text-[#aec7f7]">$3,000</span>
              </div>
              <div className="flex items-center gap-2 mb-8 text-[#94a3b8]">
                <Icon name="check_circle" className="text-[#aec7f7] text-sm" />
                <span className="font-sans text-[0.85rem] group-hover:text-[#c4c6cf] transition-colors duration-500">$300 effective hourly rate</span>
              </div>
              <p className="text-[#94a3b8] font-sans mb-8 text-[0.85rem] leading-relaxed">
                Balanced flexibility for those who aim to fly regularly while maintaining a budget.
              </p>
              <div className="mt-auto">
                <button className="w-full font-sans font-bold text-[0.8rem] tracking-widest uppercase py-4 rounded border border-[#aec7f7]/30 text-[#aec7f7] group-hover:bg-[#aec7f7]/20 transition-all duration-300">
                  Select Plan
                </button>
              </div>
            </HoverEmphasize>
          </StaggerItem>

          {/* 30 Hour Package */}
          <StaggerItem duration={1.6}>
            <HoverEmphasize hoverY={-16} hoverScale={1.03} duration={0.6} className="bg-gradient-to-br from-[#162740] to-[#0c1827] p-10 rounded-xl flex flex-col h-full border border-[#aec7f7]/30 relative shadow-2xl group hover:from-[#1b3152] hover:to-[#0f1d2e] hover:border-[#aec7f7]/60 hover:shadow-[0_30px_60px_rgba(174,199,247,0.15)] transition-all duration-500">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#aec7f7] text-[#143057] px-6 py-1.5 rounded-full text-[10px] font-sans font-bold uppercase tracking-widest whitespace-nowrap shadow-lg group-hover:shadow-[0_0_20px_rgba(174,199,247,0.4)] group-hover:brightness-110 transition-all duration-500">
                Value Combo
              </div>
              <span className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#aec7f7] mb-4 group-hover:brightness-125 transition-all duration-500 mt-2">Atmospheric Navigator</span>
              <h3 className="font-serif text-3xl font-normal text-[#d9e3f6] mb-6 group-hover:text-white transition-colors duration-500">30 Hour Package</h3>
              <div className="mb-8 group-hover:scale-105 transform origin-left transition-transform duration-500">
                <span className="text-5xl font-light text-[#aec7f7]">$8,400</span>
              </div>
              <div className="flex flex-col gap-3 mb-8">
                <div className="flex items-center gap-2 text-[#aec7f7]">
                  <Icon name="stars" className="text-sm" />
                  <span className="font-sans font-semibold text-[0.85rem] group-hover:brightness-110 transition-colors duration-500">$280 effective hourly rate</span>
                </div>
                <div className="flex items-center gap-2 text-[#94a3b8]">
                  <Icon name="savings" className="text-sm" />
                  <span className="font-sans text-[0.85rem] group-hover:text-[#c4c6cf] transition-colors duration-500">Save $1,200 over casual rates</span>
                </div>
              </div>
              <p className="text-[#94a3b8] font-sans mb-8 text-[0.85rem] leading-relaxed">
                Our most prestigious tier for dedicated pilots who call the stratosphere their second
                home.
              </p>
              <div className="mt-auto">
                <button className="w-full inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] rounded-md font-sans font-bold tracking-widest uppercase text-[0.8rem] py-4 shadow-lg transition-all active:scale-95 group-hover:brightness-110">
                  Select Best Value
                </button>
              </div>
            </HoverEmphasize>
          </StaggerItem>
        </StaggerContainer>
      </section>

      {/* ── 3. Comparison Strip ──────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20">
        <FadeUp delay={0.6} duration={1.6} viewportMargin="-20%">
          <div className="bg-[#0c1827] border-y border-white/5 py-8 px-8 md:px-12 rounded-lg hover:bg-[#111e30] transition-colors duration-500">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-center text-center">
              <div className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b]">Comparative Overview</div>
              <div>
                <p className="text-[0.65rem] uppercase tracking-widest text-[#64748b] font-sans font-semibold mb-1">Total Investment</p>
                <p className="text-2xl font-light text-[#d9e3f6]">
                  $320 <span className="text-xs text-[#64748b]">vs</span> $8,400
                </p>
              </div>
              <div>
                <p className="text-[0.65rem] uppercase tracking-widest text-[#64748b] font-sans font-semibold mb-1">Hourly Efficiency</p>
                <p className="text-2xl font-light text-[#d9e3f6]">
                  $320 <span className="text-xs text-[#64748b]">→</span> $280
                </p>
              </div>
              <div>
                <p className="text-[0.65rem] uppercase tracking-widest text-[#64748b] font-sans font-semibold mb-1">Total Savings</p>
                <p className="text-2xl font-medium text-[#aec7f7]">12.5% Optimized</p>
              </div>
            </div>
          </div>
        </FadeUp>
      </section>

      {/* ── 4. Inclusion / Exclusion Bento ───────────────────────────────────── */}
      <section className="py-32 max-w-7xl mx-auto px-6 md:px-12 lg:px-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">

          {/* Left Column (Heading + 4 smaller cards) */}
          <div className="lg:col-span-7 flex flex-col justify-between">
            <StaggerContainer className="mb-12 lg:mb-16" viewportMargin="-20%">
              <StaggerItem duration={1.4}>
                <p className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4">
                  What&apos;s Covered
                </p>
              </StaggerItem>
              <StaggerItem duration={1.4}>
                <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6]">
                  The Integrated Experience
                </h2>
              </StaggerItem>
            </StaggerContainer>

            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-8" staggerDelay={0.2} viewportMargin="-20%">
              {[
                { icon: 'flight', title: 'Aircraft Access', body: 'Unrestricted access to our meticulously maintained fleet of Cessna and Piper models.' },
                { icon: 'schedule', title: 'Booking Platform', body: '24/7 digital reservation system with real-time fleet availability and weather integration.' },
                { icon: 'support_agent', title: 'Concierge Support', body: 'Direct line to our operations team for maintenance logs, fuel logistics, and trip planning.' },
                { icon: 'cleaning_services', title: 'Post-Flight Valet', body: 'Basic aircraft cleaning and hangar service included after every successful journey.' },
              ].map(({ icon, title, body }) => (
                <StaggerItem key={title} duration={1.4} className="h-full">
                  <div className="bg-[#0c1827] p-8 rounded-xl border border-white/5 hover:bg-[#111e30] transition-colors h-full">
                    <Icon name={icon} className="text-[#aec7f7] mb-4" style={{ fontSize: '32px' }} />
                    <h4 className="font-serif text-xl text-[#d9e3f6] mb-3">{title}</h4>
                    <p className="text-[0.85rem] text-[#94a3b8] font-sans leading-relaxed">{body}</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>

          {/* Premium Inclusions Panel */}
          <div className="lg:col-span-5 relative">
            <FadeUp delay={0.4} duration={1.6} viewportMargin="-20%" className="h-full">
              <div className="bg-gradient-to-b from-[#111e30] to-[#0c1827] p-10 md:p-12 rounded-xl border border-white/5 h-full flex flex-col shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-32 bg-[#aec7f7]/5 rounded-full blur-[100px] pointer-events-none group-hover:bg-[#aec7f7]/10 transition-colors duration-1000"></div>

                <div className="relative z-10">
                  <p className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#aec7f7] mb-4">
                    Premium Inclusions
                  </p>
                  <h2 className="font-serif text-3xl font-normal text-[#d9e3f6] mb-6">Fully Included</h2>
                  <p className="text-[#94a3b8] mb-10 text-[0.85rem] font-sans leading-relaxed">
                    We believe in an elegant standard. Your package encompasses a complete aviation experience without hidden operational fees:
                  </p>

                  <ul className="space-y-6">
                    {[
                      { title: 'Regulated Fuel', body: 'All arrangements operate on a wet-rate basis, insulating you from market price fluctuations.' },
                      { title: 'Headsets Provided', body: 'Premium noise-canceling headsets available in every aircraft for clear communications.' },
                      { title: 'Flight Preparation', body: 'Direct operational support for detailed dispatch, weather routing, and weight & balance.' },
                      { title: 'Post-Flight Care', body: 'Aircraft are professionally cleaned and detailed post-flight. You fly, we handle the wash.' },
                      { title: 'Fleet Presentation', body: 'Guaranteed aircraft readiness. Step into a cockpit prepped to an absolute showroom standard.' },
                    ].map(({ title, body }) => (
                      <li key={title} className="flex items-start gap-4 group/item">
                        <Icon name="check_circle" className="text-[#aec7f7] mt-0.5 shrink-0 group-hover/item:scale-110 transition-transform duration-300" />
                        <div>
                          <p className="font-sans font-semibold text-[#d9e3f6] text-[0.85rem]">{title}</p>
                          <p className="text-[0.8rem] text-[#94a3b8] font-sans mt-1 leading-relaxed">{body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ── 5. Audience Profiles ─────────────────────────────────────────────── */}
      <section className="border-t border-white/5 py-32">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20">
          <StaggerContainer className="text-center mb-16" viewportMargin="-25%">
            <StaggerItem duration={1.4}>
              <p className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4">
                Pilot Profiles
              </p>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6]">
                Tailored for Every Pilot
              </h2>
            </StaggerItem>
          </StaggerContainer>

          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-12" viewportMargin="-25%" staggerDelay={0.25}>
            {[
              {
                icon: 'cloud_queue',
                title: 'Casual Flyer',
                quote: '"I fly three or four times a year for the pure joy of it. The Hourly Rate gives me total freedom without overhead."',
              },
              {
                icon: 'weekend',
                title: 'Regular Weekend Flyer',
                quote: '"I aim for one solid flight a month. The 10 Hour Package locks in a better rate while fitting my predictable schedule."',
              },
              {
                icon: 'flight_takeoff',
                title: 'Frequent Pilot',
                quote: '"I\'m building hours or commuting by air. The 30 Hour Package is the only logical choice for high-frequency utility."',
              },
            ].map(({ icon, title, quote }) => (
              <StaggerItem key={title} duration={1.4} className="text-center group">
                <div className="w-20 h-20 bg-[#0c1827] mx-auto rounded-full flex items-center justify-center mb-8 border border-white/5 group-hover:border-[#aec7f7]/40 transition-colors duration-500 shadow-md">
                  <Icon name={icon} className="text-[#aec7f7] group-hover:scale-110 transition-transform duration-500 ease-out" style={{ fontSize: '32px' }} />
                </div>
                <h4 className="font-serif text-2xl font-normal text-[#d9e3f6] mb-4">{title}</h4>
                <p className="text-[0.85rem] text-[#94a3b8] font-sans leading-relaxed">{quote}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ── 6. Operational Standards & Eligibility ───────────────────────────── */}
      <section className="border-t border-white/5 max-w-7xl mx-auto px-6 md:px-12 lg:px-20 py-32 grid grid-cols-1 lg:grid-cols-2 gap-20">

        {/* Operational Standards */}
        <StaggerContainer viewportMargin="-30%">
          <StaggerItem duration={1.4}>
            <p className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4">
              Policy
            </p>
          </StaggerItem>
          <StaggerItem duration={1.4}>
            <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6] mb-10">
              Operational Standards
            </h2>
          </StaggerItem>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-12 gap-x-8">
            {[
              { label: 'Minimum Booking', body: '1.5 hours per daily reservation to ensure fleet rotation efficiency.' },
              { label: 'Block Validity', body: 'Pre-paid packages are valid for 12 months from the date of activation.' },
              { label: 'Cancellation', body: '24-hour notice required for standard flights; no charge for weather-related grounded flights.' },
              { label: 'Overnight', body: '2-hour daily minimum applies for aircraft kept away from home base overnight.' },
            ].map(({ label, body }) => (
              <StaggerItem key={label} duration={1.4}>
                <h5 className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#aec7f7] mb-3">{label}</h5>
                <p className="text-[0.85rem] text-[#94a3b8] font-sans leading-relaxed">{body}</p>
              </StaggerItem>
            ))}
          </div>
        </StaggerContainer>

        {/* Eligibility card */}
        <div className="relative">
          <FadeUp delay={0.6} duration={1.8} viewportMargin="-30%" className="h-full">
            <div className="p-12 h-full rounded-xl flex flex-col justify-center border border-white/5 relative overflow-hidden group hover:border-[#aec7f7]/20 transition-colors duration-700">
              <div
                className="absolute inset-0 bg-cover bg-center pointer-events-none group-hover:opacity-70 transition-opacity duration-1000"
                style={{ backgroundImage: 'url("/CessnaWireframe.webp")' }}
              />
              {/* grey + dark overlay to keep text readable */}
              <div className="absolute inset-0 bg-[#091421]/75 pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-br from-[#0c1827]/60 to-transparent pointer-events-none" />
              <div className="relative z-10">
                <p className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4">
                  Eligibility
                </p>
                <h3 className="font-serif text-3xl font-normal text-[#d9e3f6] mb-6">Are you eligible to fly?</h3>
                <p className="text-[#94a3b8] font-sans mb-8 text-[0.85rem] leading-relaxed">
                  Before booking, all pilots must complete a localised check-out and meet our insurance
                  minimums (100 hours total time, 10 hours in type).
                </p>
                <div className="pt-2 overflow-hidden">
                  <FadeUp delay={1.4} duration={1.4}>
                    <a
                      href="/pilotRequirements"
                      className="inline-block font-sans font-bold text-[0.8rem] tracking-widest uppercase px-8 py-4 rounded border border-white/20 text-[#c4c6cf] hover:bg-white/5 hover:border-white/40 transition-all duration-300"
                    >
                      Review Full Requirements
                    </a>
                  </FadeUp>
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── 7. FAQ ───────────────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 max-w-4xl mx-auto px-6 md:px-12 lg:px-20 py-32">
        <StaggerContainer className="text-center mb-16" viewportMargin="-25%">
          <StaggerItem duration={1.4}>
            <p className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4">
              FAQ
            </p>
          </StaggerItem>
          <StaggerItem duration={1.4}>
            <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6]">
              Common Enquiries
            </h2>
          </StaggerItem>
        </StaggerContainer>
        <StaggerContainer className="space-y-4" viewportMargin="-25%" staggerDelay={0.15}>
          {FAQ_ITEMS.map((item) => (
            <StaggerItem key={item.question} duration={1.2}>
              <FaqItem question={item.question} answer={item.answer} />
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* ── 8. Final CTA ─────────────────────────────────────────────────────── */}
      <section className="relative py-32 border-t border-white/5 text-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/SleekPropeller.webp")' }}
        />
        <div className="absolute inset-0 bg-[#091421]/80" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#091421]/60 via-transparent to-[#091421]/60" />
        <div className="relative z-10 max-w-2xl mx-auto px-6 md:px-12 lg:px-20">
          <StaggerContainer viewportMargin="-30%" staggerDelay={0.4}>
            <StaggerItem duration={1.6}>
              <p className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4">
                Get Started
              </p>
            </StaggerItem>
            <StaggerItem duration={1.6}>
              <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6] mb-12">
                Your Flight Starts Here
              </h2>
            </StaggerItem>
            <div className="flex flex-wrap justify-center gap-4">
              <StaggerItem duration={1.6} className="shrink-0">
                <a
                  href="/pilotRequirements"
                  className="inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] rounded-md font-sans font-bold tracking-widest uppercase text-[0.8rem] px-10 py-5 shadow-2xl shadow-[#aec7f7]/20 transition-all active:scale-95 hover:brightness-110"
                >
                  Get Approved
                </a>
              </StaggerItem>
              <StaggerItem duration={1.6} className="shrink-0">
                <a
                  href="/pilotRequirements"
                  className="font-sans font-bold text-[0.8rem] tracking-widest uppercase px-10 py-5 rounded border border-white/20 text-[#c4c6cf] hover:bg-white/5 transition-colors"
                >
                  Requirements
                </a>
              </StaggerItem>
            </div>
          </StaggerContainer>
        </div>
      </section>

    </main>
  )
}
