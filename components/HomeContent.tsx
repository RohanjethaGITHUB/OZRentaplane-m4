'use client'
import React, { useState } from 'react'

// ── Palette — matches AeroVista design system exactly ─────────────────────────
const BASE   = '#091421'   // surface          — matches sticky floor
const LOW    = '#121c29'   // surface-container-low — alternate sections
const DEEP   = '#050f1b'   // surface-container-lowest — FAQ
const BORDER = 'rgba(68,71,78,0.18)'

// Text tokens from AeroVista
const T_SURFACE  = '#d9e3f6'  // on-surface  — primary headings (h2)
const T_BLUE100  = '#dbeafe'  // blue-100    — sub-headings, stats, FAQ Qs
const T_MUTED    = '#c4c6cf'  // on-surface-variant — body copy
const T_PRIMARY  = '#aec7f7'  // primary     — accent, labels

// ── Eyebrow label ─────────────────────────────────────────────────────────────
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="inline-block font-sans font-semibold tracking-[0.4em] uppercase mb-6"
      style={{ fontSize: 10, color: T_PRIMARY }}
    >
      {children}
    </div>
  )
}

// ── Section 1: Aircraft Showcase ──────────────────────────────────────────────
function AircraftShowcase() {
  return (
    <section style={{ background: BASE }} className="pt-10 pb-28 px-6 md:px-12 lg:px-20">
      <div className="max-w-6xl mx-auto flex flex-col gap-5">

        {/* Header row */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-4">
          <div>
            <Eyebrow>Iconic Aviation</Eyebrow>
            <h2
              className="font-serif text-[3rem] md:text-[3.75rem] font-normal leading-[1.05] tracking-tight"
              style={{ color: T_SURFACE }}
            >
              The Skyhawk{' '}
              <span className="italic opacity-80">Spotlight</span>
            </h2>
          </div>
          <p className="font-sans text-sm leading-relaxed max-w-[260px] lg:text-right" style={{ color: T_MUTED }}>
            More than an aircraft, the Cessna 172 is the gold standard for
            precision, stability, and pilot confidence.
          </p>
        </div>

        {/* Image + stat cards */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Aircraft image */}
          <div
            className="lg:col-span-3 relative min-h-[260px] md:min-h-[340px] rounded-xl overflow-hidden flex items-end"
            style={{ background: LOW, border: `1px solid ${BORDER}` }}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="rgba(174,199,247,0.12)" />
              </svg>
              <p className="font-sans uppercase tracking-[0.22em]" style={{ fontSize: 9, color: 'rgba(174,199,247,0.22)' }}>
                Aircraft Image
              </p>
            </div>
            {/* Caption */}
            <div className="relative z-10 w-full px-5 pb-5">
              <div
                className="inline-flex items-center rounded-full px-3 py-1 mb-2"
                style={{ background: 'rgba(9,20,33,0.80)', border: `1px solid ${BORDER}` }}
              >
                <span className="font-sans font-semibold tracking-[0.28em] uppercase" style={{ fontSize: 8, color: 'rgba(174,199,247,0.65)' }}>
                  Primary Fleet
                </span>
              </div>
              <p className="font-serif text-[1.05rem] font-normal italic" style={{ color: T_SURFACE }}>
                Cessna 172S Skyhawk SP
              </p>
            </div>
          </div>

          {/* Stat cards */}
          <div className="lg:col-span-2 flex flex-row lg:flex-col gap-4">

            <div
              className="flex-1 rounded-xl p-6 flex flex-col justify-between"
              style={{ background: LOW, border: `1px solid ${BORDER}` }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(174,199,247,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2" />
              </svg>
              <div className="mt-6">
                <p className="font-serif font-normal leading-none tracking-tight" style={{ fontSize: '2.4rem', color: T_BLUE100 }}>
                  124 <span style={{ fontSize: '1.3rem', color: T_PRIMARY }}>kts</span>
                </p>
                <p className="font-sans font-semibold tracking-[0.28em] uppercase mt-1.5" style={{ fontSize: 9, color: 'rgba(174,199,247,0.45)' }}>
                  Max Cruise Speed
                </p>
              </div>
            </div>

            <div
              className="flex-1 rounded-xl p-6 flex flex-col justify-between"
              style={{ background: 'rgba(174,199,247,0.08)', border: '1px solid rgba(174,199,247,0.22)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(174,199,247,0.80)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2v20M12 2l-3 5m3-5l3 5M12 22l-3-5m3 5l3-5" />
              </svg>
              <div className="mt-6">
                <p className="font-serif font-normal leading-none tracking-tight" style={{ fontSize: '2.4rem', color: T_BLUE100 }}>
                  14,000 <span style={{ fontSize: '1.1rem', color: T_PRIMARY }}>ft</span>
                </p>
                <p className="font-sans font-semibold tracking-[0.28em] uppercase mt-1.5" style={{ fontSize: 9, color: 'rgba(174,199,247,0.55)' }}>
                  Service Ceiling
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Performance metrics + avionics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div className="rounded-xl p-7" style={{ background: LOW, border: `1px solid ${BORDER}` }}>
            <p className="font-sans font-semibold tracking-[0.32em] uppercase mb-5" style={{ fontSize: 9, color: 'rgba(174,199,247,0.45)' }}>
              Performance Metrics
            </p>
            <div className="flex flex-col" style={{ borderTop: `1px solid ${BORDER}` }}>
              {([
                { label: 'Range',       value: '640 nm'  },
                { label: 'Useful Load', value: '830 lbs' },
                { label: 'Fuel Cap',    value: '53 gal'  },
              ] as const).map((row) => (
                <div key={row.label} className="flex items-center justify-between py-3.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <span className="font-sans text-sm" style={{ color: T_MUTED }}>{row.label}</span>
                  <span className="font-serif text-base italic" style={{ color: T_PRIMARY }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative rounded-xl p-7 overflow-hidden" style={{ background: LOW, border: `1px solid ${BORDER}` }}>
            <div className="absolute right-5 bottom-5 opacity-[0.05]">
              <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="rgba(174,199,247,1)" strokeWidth="0.7" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4M12 7l1.5 3.5L17 12l-3.5 1.5L12 17l-1.5-3.5L7 12l3.5-1.5z" />
              </svg>
            </div>
            <div className="relative z-10">
              <p className="font-sans font-semibold tracking-[0.32em] uppercase mb-4" style={{ fontSize: 9, color: 'rgba(174,199,247,0.45)' }}>
                Precision Instrument
              </p>
              <h3 className="font-serif text-[1.6rem] font-normal leading-tight mb-3" style={{ color: T_BLUE100 }}>
                Garmin G1000 NXi
              </h3>
              <p className="font-sans text-sm leading-relaxed" style={{ color: T_MUTED }}>
                The latest in glass cockpit technology, bringing commercial-grade
                situational awareness to your fingertips.
              </p>
            </div>
          </div>

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
    { n: '04', label: 'Pre-Flight', sub: 'Digital walkaround logs and weather briefing provided 2 hours before takeoff.' },
    { n: '05', label: 'Fly',        sub: 'The keys are in the box. Your clearance is active. The sky is yours.' },
  ]

  return (
    <section style={{ background: LOW }} className="py-28 px-6 md:px-12 lg:px-20">
      <div className="max-w-6xl mx-auto">

        <div className="text-center mb-20">
          <h2 className="font-serif text-5xl font-normal leading-tight mb-3" style={{ color: T_SURFACE }}>
            Flight Manifest
          </h2>
          <p className="font-sans font-semibold tracking-widest uppercase" style={{ fontSize: 10, color: 'rgba(174,199,247,0.45)' }}>
            Your path from the gate to the horizon
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-6">
          {steps.map((step) => (
            <div key={step.n}>
              <div
                className="font-serif font-normal mb-3 leading-none select-none"
                style={{ fontSize: '3.75rem', color: 'rgba(174,199,247,0.20)' }}
              >
                {step.n}
              </div>
              <h3 className="font-serif text-xl font-normal mb-2" style={{ color: T_BLUE100 }}>
                {step.label}
              </h3>
              <p className="font-sans text-sm leading-relaxed" style={{ color: T_MUTED, fontSize: '0.78rem' }}>
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
    <section className="relative py-36 px-6 md:px-12 lg:px-20 overflow-hidden" style={{ background: BASE }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(to right, rgba(9,20,33,0.0) 0%, rgba(12,24,38,0.6) 100%)' }}
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
    <section style={{ background: BASE }} className="py-28 px-6 md:px-12 lg:px-20">
      <div className="max-w-6xl mx-auto">

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
            <div className="h-px w-24" style={{ background: BORDER }} />
            <span className="font-sans font-bold tracking-widest uppercase" style={{ fontSize: 10, color: T_PRIMARY }}>
              Safety First
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: '2px' }}>
          {cards.map((card) => (
            <div
              key={card.label}
              className="p-10 transition-colors duration-200"
              style={{ background: LOW }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#1a2a3a' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = LOW }}
            >
              <div className="mb-7">{card.icon}</div>
              <h3 className="font-serif text-2xl font-normal mb-3" style={{ color: T_BLUE100 }}>{card.label}</h3>
              <p className="font-sans text-sm leading-relaxed" style={{ color: T_MUTED }}>{card.sub}</p>
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
    <section style={{ background: DEEP }} className="py-28 px-6 md:px-12 lg:px-20">
      <div className="max-w-3xl mx-auto">

        <h2 className="font-serif text-5xl font-normal italic text-center mb-14 tracking-tight" style={{ color: T_SURFACE }}>
          Aviation Inquiries
        </h2>

        <div className="flex flex-col gap-4">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-lg overflow-hidden transition-colors duration-300"
              style={{ background: open === i ? LOW : 'rgba(9,20,33,0.40)' }}
            >
              <button
                className="w-full flex justify-between items-center text-left px-6 py-5 gap-4"
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
              {open === i && (
                <div className="px-6 pb-6" style={{ borderTop: `1px solid ${BORDER}` }}>
                  <p className="font-sans text-sm leading-relaxed pt-5" style={{ color: T_MUTED }}>
                    {item.a}
                  </p>
                </div>
              )}
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
    <section className="relative py-44 px-6 md:px-12 lg:px-20 text-center overflow-hidden" style={{ background: LOW }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at center, rgba(174,199,247,0.06) 0%, transparent 70%)' }}
      />
      <div className="relative z-10 max-w-3xl mx-auto">
        <h2 className="font-serif text-7xl font-normal leading-[1.02] tracking-tight mb-6" style={{ color: T_SURFACE }}>
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
      <AircraftShowcase />
      <FlightManifest />
      <LicensedPilot />
      <MaintenanceTrust />
      <AviationFAQ />
      <ClearanceAwaits />
    </>
  )
}
