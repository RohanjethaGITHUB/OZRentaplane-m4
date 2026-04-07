'use client'
import React, { useState } from 'react'

// ── Palette — matches AeroVista design system exactly ─────────────────────────
const BASE   = '#091421'   // surface — matches sticky floor & shared canvas

// Text tokens from AeroVista
const T_SURFACE  = '#d9e3f6'  // on-surface  — primary headings (h2)
const T_BLUE100  = '#dbeafe'  // blue-100    — sub-headings, stats, FAQ Qs
const T_MUTED    = '#c4c6cf'  // on-surface-variant — body copy
const T_PRIMARY  = '#aec7f7'  // primary     — accent, labels

// ── Section 1: Aircraft Showcase ──────────────────────────────────────────────
function AircraftShowcase() {
  return (
    <section className="relative pt-28 pb-28 px-6 md:px-12 lg:px-20">
      {/* Soft gradient wipe effect to smoothly blend the hero frame into the solid navy section */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(to bottom, transparent 0%, ${BASE} 180px, ${BASE} 100%)` }}
        aria-hidden="true"
      />
      <div className="relative z-10 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-20 items-center">
        
        {/* Left Side: Aircraft Visual */}
        <div className="relative rounded-xl bg-[#091421] border border-white/5 w-full aspect-square md:aspect-[4/3] lg:aspect-square overflow-hidden shadow-2xl">
          {/* Main Aircraft Image - To swap this image, change the 'src' path below */}
          <img 
            src="/Cessna-172.webp" 
            alt="Featured Aircraft: Cessna 172 Skyhawk" 
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
        </div>

        {/* Right Side: Editorial Block */}
        <div className="flex flex-col">
          <p className="font-sans font-semibold tracking-[0.14em] uppercase mb-4" style={{ fontSize: '0.65rem', color: T_PRIMARY, opacity: 0.9 }}>
            Featured Aircraft
          </p>
          <h2 className="font-serif text-[2.75rem] md:text-5xl lg:text-[4rem] font-normal leading-[1.05] tracking-tight mb-12" style={{ color: T_SURFACE }}>
            Cessna 172 <br />
            Skyhawk
          </h2>
          
          {/* Specs Grid */}
          <div 
            className="grid grid-cols-2 rounded-xl mb-12"
            style={{ 
              background: '#121c29',
              border: '1px solid rgba(255,255,255,0.03)'
            }}
          >
            {/* Range */}
            <div className="p-7 md:p-9 border-b border-r border-white/5">
               <p className="font-sans text-[0.62em] uppercase tracking-[0.15em] mb-2.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Range</p>
               <p className="font-serif text-[1.4rem]" style={{ color: T_BLUE100 }}>640 nm</p>
            </div>
            {/* Cruise Speed */}
            <div className="p-7 md:p-9 border-b border-white/5">
               <p className="font-sans text-[0.62em] uppercase tracking-[0.15em] mb-2.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Cruise Speed</p>
               <p className="font-serif text-[1.4rem]" style={{ color: T_BLUE100 }}>124 ktas</p>
            </div>
            {/* Occupancy */}
            <div className="p-7 md:p-9 border-r border-white/5">
               <p className="font-sans text-[0.62em] uppercase tracking-[0.15em] mb-2.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Occupancy</p>
               <p className="font-serif text-[1.4rem]" style={{ color: T_BLUE100 }}>4 Adults</p>
            </div>
            {/* Avionics */}
            <div className="p-7 md:p-9">
               <p className="font-sans text-[0.62em] uppercase tracking-[0.15em] mb-2.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Avionics</p>
               <p className="font-serif text-[1.4rem]" style={{ color: T_BLUE100 }}>G1000 NXi</p>
            </div>
          </div>

          <p className="font-sans text-[0.95rem] leading-[1.8] max-w-[480px]" style={{ color: T_MUTED, opacity: 0.85 }}>
            The world's most trusted flight training and personal aircraft.
            Refined for the modern era with integrated flight decks and
            unmatched reliability.
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Section 2: Flight Manifest ─────────────────────────────────────────────────
function FlightManifest() {
  const steps = [
    { n: '01', label: 'Register',   sub: 'Create your digital profile and upload your pilot credentials for initial review.' },
    { n: '02', label: 'Verify',     sub: 'Swift validation of certificates and ratings by our chief flight instructor.' },
    { n: '03', label: 'Book',       sub: 'Select your aircraft and window using our real-time availability engine.' },
    { n: '04', label: 'Pre-flight', sub: 'Digital walkaround logs and weather briefing provided 2 hours before takeoff.' },
    { n: '05', label: 'Fly',        sub: 'The keys are in the box. Your clearance is active. The sky is yours.' },
  ]

  return (
    <section className="py-32 bg-[#121c29]">
      <div className="max-w-7xl mx-auto px-12">
        <div className="text-center mb-24">
          <h2 className="font-serif text-5xl mb-4 text-[#d9e3f6]">Flight Manifest</h2>
          <p className="text-[#c4c6cf] font-sans tracking-widest text-xs uppercase">Your path from the gate to the horizon</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12">
          {steps.map((step) => (
            <div key={step.n} className="relative">
              <div className="text-[#aec7f7] font-serif text-6xl opacity-20 mb-4">
                {step.n}
              </div>
              <h3 className="font-serif text-xl text-[#dbeafe] mb-2">
                {step.label}
              </h3>
              <p className="text-sm text-[#c4c6cf] leading-relaxed font-sans">
                {step.sub}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Section 3: The Licensed Pilot ─────────────────────────────────────────────
function LicensedPilot() {
  return (
    <section className="relative py-32 px-6 md:px-12 lg:px-20 overflow-hidden">
      {/* 1. Background Image */}
      <div 
        className="absolute inset-0 pointer-events-none z-0 bg-cover bg-[center_right_10%]"
        style={{ backgroundImage: 'url("/exclusivePilot.webp")' }}
      />
      
      {/* 2. Base Dark/Navy Overlay (overall mood) */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ backgroundColor: 'rgba(4, 11, 22, 0.35)' }}
      />

      {/* 3. Directional Gradient: Darker on the left for text readability, fading to right */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'linear-gradient(to right, #091421 0%, rgba(9,20,33, 0.85) 45%, rgba(9,20,33, 0.1) 100%)' }}
      />
      
      {/* 4. Cinematic Soft Blue Glow */}
      <div
        className="absolute inset-0 pointer-events-none z-0 mix-blend-screen"
        style={{ background: 'radial-gradient(ellipse 70% 80% at 75% 50%, rgba(30, 64, 120, 0.35) 0%, transparent 70%)' }}
      />

      {/* 5. Top and Bottom soft fade to blend seamlessly with adjacent BASE block */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'linear-gradient(to bottom, #091421 0%, transparent 12%, transparent 88%, #091421 100%)' }}
      />

      <div className="relative z-10 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16">
        <div>
          <div
            className="inline-block font-sans font-semibold tracking-[0.4em] uppercase mb-8 px-4 py-1 rounded"
            style={{ fontSize: 10, color: T_PRIMARY, background: 'rgba(174,199,247,0.08)' }}
          >
            Exclusive for Captains
          </div>
          <h2 className="font-serif text-5xl md:text-6xl font-normal leading-[1.05] tracking-tight mb-8" style={{ color: T_SURFACE }}>
            The Licensed Pilot
          </h2>
          <p className="font-serif text-xl italic mb-10 leading-relaxed" style={{ color: 'rgba(219,234,254,0.70)' }}>
            &ldquo;These are not mere vehicles; they are precision machines for serious aviators.&rdquo;
          </p>
          <p className="font-sans text-sm leading-relaxed mb-12" style={{ color: T_MUTED }}>
            OZRentAPlane is built by pilots, for pilots. We maintain a high standard of
            entry to ensure our fleet remains in peak condition and our community remains
            elite. All members must hold a valid CASA licence with a minimum of 200 hours
            total flight time.
          </p>

          <div className="flex gap-12">
            {([
              { value: '200h', label: 'Min. Experience'     },
              { value: 'IVR',  label: 'Preferred Rating'    },
              { value: 'CASA', label: 'Standard Compliance' },
            ] as const).map((s) => (
              <div key={s.value}>
                <div className="font-serif text-3xl font-normal mb-1" style={{ color: T_BLUE100 }}>{s.value}</div>
                <div className="font-sans font-semibold tracking-widest uppercase" style={{ fontSize: 9, color: T_PRIMARY }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Section 4: Precision in Maintenance ───────────────────────────────────────
function MaintenanceTrust() {
  const cards = [
    {
      label: 'Certified Technicians',
      sub:   'Full-time A&P mechanics dedicated solely to the OZRentAPlane fleet.',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(174,199,247,1)" stroke="none" aria-hidden="true">
          <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      label: 'Transparent Logs',
      sub:   'Access full maintenance history and engine metrics directly through our app.',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(174,199,247,1)" stroke="none" aria-hidden="true">
          <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Redundant Systems',
      sub:   'Standard dual battery systems and emergency beacons in every aircraft.',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(174,199,247,1)" stroke="none" aria-hidden="true">
          <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
  ]

  return (
    <section className="relative pt-24 pb-36 px-6 md:px-12 lg:px-20 overflow-hidden">
      {/* Soft illuminated field — cards feel embedded and supported */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse 90% 60% at 50% 55%, rgba(174,199,247,0.055) 0%, transparent 70%)' }}
      />

      <div className="relative z-10 max-w-6xl mx-auto">

        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-8 mb-16">
          <div className="max-w-xl">
            <h2 className="font-serif text-5xl font-normal leading-[1.05] tracking-tight mb-5" style={{ color: T_SURFACE }}>
              Precision in Maintenance
            </h2>
            <p className="font-sans text-sm leading-relaxed" style={{ color: T_MUTED }}>
              Our maintenance protocols exceed CASA Part 91 requirements. Every Cessna 172
              undergoes a thorough 50-hour inspection and daily flight-line check.
            </p>
          </div>
          <div className="shrink-0 hidden md:flex items-center gap-4">
            <div className="h-px w-24" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <span className="font-sans font-bold tracking-widest uppercase" style={{ fontSize: 10, color: T_PRIMARY }}>
              Safety First
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card) => (
            <div
              key={card.label}
              className="p-10 rounded-2xl relative group overflow-hidden transition-all duration-300"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-[rgba(174,199,247,0.04)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="relative z-10">
                <div className="mb-7">{card.icon}</div>
                <h3 className="font-serif text-2xl font-normal mb-3" style={{ color: T_BLUE100 }}>{card.label}</h3>
                <p className="font-sans text-sm leading-relaxed" style={{ color: T_MUTED }}>{card.sub}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}

// ── Section 5: Aviation Inquiries (FAQ) ───────────────────────────────────────
function AviationFAQ() {
  const [open, setOpen] = useState<number | null>(null)

  const items = [
    {
      q: 'What is the minimum checkout time required?',
      a: 'Every new member must complete a 2-hour orientation flight with one of our instructors to familiarise themselves with local airport procedures and our specific Garmin setups.',
    },
    {
      q: 'Do you offer multi-day cross-country rentals?',
      a: 'Yes. For flights exceeding 48 hours, we apply a daily minimum of 3 flight hours. Approval is required for destinations requiring NOTAM coordination.',
    },
    {
      q: 'Are fuel costs included in the rental rate?',
      a: 'Rentals are billed wet (fuel included). We provide fuel cards for major FBO networks. If you pay out of pocket, we reimburse at our current base rate.',
    },
  ]

  return (
    <section className="relative py-32 px-6 md:px-12 lg:px-20 overflow-hidden">
      {/* Slight darkening wash — intentionally subdued, calmer than surrounding sections */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'linear-gradient(to bottom, rgba(3,7,15,0.35) 0%, rgba(3,7,15,0.35) 100%)' }}
      />
      {/* Very faint centred glow so it doesn't disappear into flat navy */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(174,199,247,0.025) 0%, transparent 65%)' }}
      />

      {/* Grid overlaps slightly upwards to interlock the sections */}
      <div className="relative z-20 max-w-3xl mx-auto -mt-6">

        <h2 className="font-serif text-5xl font-normal italic text-center mb-16 tracking-tight" style={{ color: T_SURFACE }}>
          Aviation Inquiries
        </h2>

        <div className="flex flex-col gap-5">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden transition-all duration-300 backdrop-blur-sm"
              style={{ 
                background: open === i ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                border: open === i ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.03)'
              }}
            >
              <button
                className="w-full flex justify-between items-center text-left px-7 py-6 gap-4 outline-none"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="font-serif text-xl font-normal leading-snug" style={{ color: T_BLUE100 }}>{item.q}</span>
                <svg
                  width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(174,199,247,0.60)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0 transition-transform duration-300"
                  style={{ transform: open === i ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div 
                className={`px-7 overflow-hidden transition-all duration-300 ${open === i ? 'max-h-48 pb-7 opacity-100' : 'max-h-0 pb-0 opacity-0'}`}
              >
                <div className="pt-5 border-t border-white/5">
                  <p className="font-sans text-sm leading-relaxed" style={{ color: T_MUTED }}>
                    {item.a}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}

// ── Section 6: Your Clearance Awaits ──────────────────────────────────────────
function ClearanceAwaits() {
  return (
    <section className="relative pt-36 pb-48 px-6 md:px-12 lg:px-20 text-center overflow-hidden">
      {/* Bright centred glow — the emotional close of the page, feathered dark edges */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(circle at center, rgba(174,199,247,0.16) 0%, rgba(174,199,247,0.05) 40%, transparent 70%)' }}
      />
      {/* Dark vignette at edges to frame and contain the glow */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse 120% 100% at 50% 50%, transparent 40%, rgba(3,7,15,0.55) 100%)' }}
      />
      <div className="relative z-10 max-w-3xl mx-auto">
        <h2 className="font-serif text-7xl font-normal leading-[1.02] tracking-tight mb-8" style={{ color: T_SURFACE }}>
          Your clearance awaits.
        </h2>
        <p className="font-sans text-xl mb-12" style={{ color: T_MUTED }}>
          Join the next generation of general aviation rentals.
        </p>
        <button
          className="font-sans font-bold text-base tracking-tight px-12 py-5 rounded-md transition-all duration-300 active:scale-95"
          style={{
            background:  'linear-gradient(135deg, #aec7f7 0%, #a0cafe 100%)',
            color:       '#001b3d',
            boxShadow:   '0 20px 40px -12px rgba(174,199,247,0.18)',
          }}
        >
          Become a Member
        </button>
      </div>
    </section>
  )
}

// ── Default export ─────────────────────────────────────────────────────────────
export default function HomeContent() {
  return (
    <>
      {/* The Image World */}
      <AircraftShowcase />
      
      {/* 
        The Navy World Shared Canvas
        This opaque wrapper starts strictly after AircraftShowcase, acting as a solid floor 
        which permanently ends the hero photographic image bleed. 
        Because AircraftShowcase already fades fully into BASE at its bottom, this transition 
        is organically seamless.
      */}
      <div className="relative z-20 w-full" style={{ backgroundColor: BASE }}>
        <FlightManifest />
        <LicensedPilot />
        <MaintenanceTrust />
        <AviationFAQ />
        <ClearanceAwaits />
      </div>
    </>
  )
}
