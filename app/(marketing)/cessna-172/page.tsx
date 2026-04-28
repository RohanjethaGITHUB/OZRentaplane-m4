import React from 'react'
import AircraftSpotlight from '@/components/AircraftSpotlight'
import FleetGallery from '@/components/FleetGallery'
import { getFleetImages } from '@/lib/getFleetImages'
import { FadeUp, StaggerContainer, StaggerItem, HoverEmphasize } from '@/components/MotionPresets'

export default function Cessna172nPage() {
  const images = getFleetImages()
  return (
    <main className="min-h-screen bg-[#091421] text-[#d9e3f6]">

      {/* ─────────────────────────────────────────────────────────────
          1. Hero Section
      ──────────────────────────────────────────────────────────────*/}
      <section className="relative px-6 md:px-12 lg:px-20 overflow-hidden min-h-[500px] md:min-h-[750px] flex items-center">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/Cessna-fleet.webp")' }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#040f1e]/70 via-[#040f1e]/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[30%] z-0 bg-gradient-to-t from-[#091421] via-[#051122]/30 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-16">
          <StaggerContainer className="max-w-xl">
            <StaggerItem>
              <h1 className="font-serif text-5xl md:text-7xl font-normal leading-[1.05] tracking-tight mb-6 text-white">
                The Skyhawk <br />
                Legacy
              </h1>
            </StaggerItem>
            <StaggerItem>
              <p className="font-sans text-[1rem] leading-relaxed text-[#c4c6cf] mb-10 max-w-md">
                The legacy of reliability meets precise handling. The Cessna 172N is the backbone of the OZRentAPlane fleet, maintained to the highest standards for the rigorous demands of open flight.
              </p>
            </StaggerItem>
          </StaggerContainer>
          <FadeUp delay={1.4} duration={1.6} className="mt-10">
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="/pilotRequirements"
                className="inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] rounded-md font-sans font-bold tracking-widest uppercase text-[0.8rem] px-8 py-4 shadow-2xl shadow-[#aec7f7]/20 transition-all active:scale-95 hover:brightness-110"
              >
                Apply to Fly
              </a>
              <a
                href="#"
                className="font-sans font-bold text-[0.8rem] tracking-widest uppercase px-8 py-4 rounded border border-white/20 text-[#c4c6cf] hover:bg-white/5 transition-colors"
              >
                Pilot Requirements
              </a>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          2. Aircraft Spotlight Section
      ──────────────────────────────────────────────────────────────*/}
      <AircraftSpotlight />

      {/* ─────────────────────────────────────────────────────────────
          3. Fleet Gallery Section
      ──────────────────────────────────────────────────────────────*/}
      <FleetGallery images={images} />

      {/* ─────────────────────────────────────────────────────────────
          4. Cockpit Experience Section
      ──────────────────────────────────────────────────────────────*/}
      <section className="relative py-24 bg-[#091421] border-t border-white/5">
        <div className="px-6 md:px-12 lg:px-20 max-w-6xl mx-auto">

          <StaggerContainer className="text-center mb-16" viewportMargin="-25%" staggerDelay={0.4}>
            <StaggerItem duration={2.0}>
              <p className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4">
                Cockpit Experience
              </p>
            </StaggerItem>
            <StaggerItem duration={2.0}>
              <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6]">
                Cockpit Experience
              </h2>
            </StaggerItem>
          </StaggerContainer>

          <FadeUp className="relative mb-6 md:mb-8" delay={0.4} duration={2.2} viewportMargin="-25%">
            <div className="w-full rounded-2xl overflow-hidden shadow-2xl relative border border-white/5 aspect-[4/3] md:aspect-[2.35/1]">
              <img
                src="/Cockpit-twilight.webp"
                alt="Cessna 172N Cockpit at Twilight"
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
              <div className="hidden md:block absolute top-[40%] left-[20%] bg-[#2a3647]/80 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 text-xs font-sans tracking-wide text-[#d9e3f6]">
                Dual G5 Flight Instruments
              </div>
              <div className="hidden md:block absolute bottom-[25%] right-[20%] bg-[#2a3647]/80 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 text-xs font-sans tracking-wide text-[#d9e3f6]">
                Reliable Analog Backup
              </div>
            </div>
          </FadeUp>

          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-6" staggerDelay={0.6} viewportMargin="-25%">
            <StaggerItem duration={1.8}>
              <HoverEmphasize className="bg-[#0c1827] border border-white/5 p-8 rounded-xl hover:bg-[#111e30] transition-colors shadow-lg h-full">
                <div className="mb-6 text-[#64748b]">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
                  </svg>
                </div>
                <h4 className="font-serif text-xl text-[#d9e3f6] mb-3">Cross-Country Proficiency</h4>
                <p className="font-sans text-[0.85rem] leading-relaxed text-[#64748b]">
                  Clear and intuitive instrumentation perfectly suited to extended flight routes and open navigation.
                </p>
              </HoverEmphasize>
            </StaggerItem>

            <StaggerItem duration={1.8}>
              <HoverEmphasize className="bg-[#0c1827] border border-white/5 p-8 rounded-xl hover:bg-[#111e30] transition-colors shadow-lg h-full">
                <div className="mb-6 text-[#64748b]">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M2 16c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
                    <path d="M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
                    <path d="M16 8v-2a4 4 0 0 0-8 0v2" />
                  </svg>
                </div>
                <h4 className="font-serif text-xl text-[#d9e3f6] mb-3">Scenic Coastal Tours</h4>
                <p className="font-sans text-[0.85rem] leading-relaxed text-[#64748b]">
                  Stable handling combined with exceptional visibility enables comfortable visual navigation.
                </p>
              </HoverEmphasize>
            </StaggerItem>

            <StaggerItem duration={1.8}>
              <HoverEmphasize className="bg-[#0c1827] border border-white/5 p-8 rounded-xl hover:bg-[#111e30] transition-colors shadow-lg h-full">
                <div className="mb-6 text-[#64748b]">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <h4 className="font-serif text-xl text-[#d9e3f6] mb-3">Precision Hour Building</h4>
                <p className="font-sans text-[0.85rem] leading-relaxed text-[#64748b]">
                  Predictable performance and a reliable avionics suite to maximize your logbook value.
                </p>
              </HoverEmphasize>
            </StaggerItem>
          </StaggerContainer>

        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5. Mission Profiles Section
      ──────────────────────────────────────────────────────────────*/}
      <section className="relative py-24 bg-[#091421] border-t border-white/5">
        <div className="px-6 md:px-12 lg:px-20 max-w-6xl mx-auto">
          <StaggerContainer className="text-center mb-16" viewportMargin="-25%">
            <StaggerItem>
              <p className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4">
                Mission Profiles
              </p>
            </StaggerItem>
            <StaggerItem>
              <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6]">
                Designed for the Journey
              </h2>
            </StaggerItem>
          </StaggerContainer>

          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-6" staggerDelay={0.5} viewportMargin="-25%">
            <StaggerItem>
              <HoverEmphasize className="bg-[#0c1827] border border-white/5 p-8 rounded-xl hover:bg-[#111e30] transition-colors shadow-lg h-full">
                <div className="mb-6 text-[#64748b]">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
                  </svg>
                </div>
                <h4 className="font-serif text-xl text-[#d9e3f6] mb-3">Cross-Country Proficiency</h4>
                <p className="font-sans text-[0.85rem] leading-relaxed text-[#64748b]">
                  Expand your operational radius. The stable platform combined with precise trim ensures comfortable, low-workload navigation across diverse terrain.
                </p>
              </HoverEmphasize>
            </StaggerItem>

            <StaggerItem>
              <HoverEmphasize className="bg-[#0c1827] border border-white/5 p-8 rounded-xl hover:bg-[#111e30] transition-colors shadow-lg h-full">
                <div className="mb-6 text-[#64748b]">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M2 16c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
                    <path d="M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
                    <path d="M16 8v-2a4 4 0 0 0-8 0v2" />
                  </svg>
                </div>
                <h4 className="font-serif text-xl text-[#d9e3f6] mb-3">Scenic Coastal Tours</h4>
                <p className="font-sans text-[0.85rem] leading-relaxed text-[#64748b]">
                  Exceptional outbound visibility. The renowned high-wing design offers an unparalleled vantage point for sightseeing and aerial photography.
                </p>
              </HoverEmphasize>
            </StaggerItem>

            <StaggerItem>
              <HoverEmphasize className="bg-[#0c1827] border border-white/5 p-8 rounded-xl hover:bg-[#111e30] transition-colors shadow-lg h-full">
                <div className="mb-6 text-[#64748b]">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <h4 className="font-serif text-xl text-[#d9e3f6] mb-3">Precision Hour Building</h4>
                <p className="font-sans text-[0.85rem] leading-relaxed text-[#64748b]">
                  Reliable performance mapped to demanding minimums. Perfect for tracking the precise metrics required for your next commercial rating.
                </p>
              </HoverEmphasize>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          6. Maintenance & Safety Section
      ──────────────────────────────────────────────────────────────*/}
      <section className="relative py-32 bg-[#091421] border-t border-white/5 overflow-hidden flex items-center justify-center min-h-[500px]">
        <div
          className="absolute inset-0 z-0 opacity-[0.15] pointer-events-none"
          style={{
            backgroundImage: `
              repeating-radial-gradient(circle at 30% 60%, transparent 0, transparent 40px, rgba(255,255,255,0.15) 41px, transparent 42px),
              repeating-radial-gradient(circle at 70% 30%, transparent 0, transparent 50px, rgba(255,255,255,0.15) 51px, transparent 52px)
            `,
            backgroundBlendMode: 'screen',
            maskImage: 'radial-gradient(ellipse at center, black 10%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 10%, transparent 70%)'
          }}
        />

        <StaggerContainer className="relative z-10 px-6 md:px-12 lg:px-20 max-w-4xl mx-auto text-center">
          <StaggerItem>
            <p className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4">
              Maintenance & Safety
            </p>
          </StaggerItem>
          <StaggerItem>
            <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6] mb-8">
              Integrity in Every Bolt
            </h2>
          </StaggerItem>

          <div className="space-y-6 text-[#94a3b8] font-sans text-[1rem] leading-relaxed max-w-2xl mx-auto">
            <StaggerItem>
              <p>
                The 100-hour inspection cycle and rigorous preventative maintenance protocol guarantee that our Cessna 172N exceeds regulatory, civil, and environmental safety standards. We believe that true pilot confidence begins long before the engine run-up.
              </p>
            </StaggerItem>
            <StaggerItem>
              <p>
                Our safety principles are uncompromising. Every component is rigorously tracked, and every maintenance action is comprehensively logged to provide you with absolute transparency and supreme peace of mind on every departure.
              </p>
            </StaggerItem>
          </div>
        </StaggerContainer>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          7. Perfectly Suited For Section (Use Cases)
      ──────────────────────────────────────────────────────────────*/}
      <section className="relative py-32 bg-[#091421]">
        <div className="px-6 md:px-12 lg:px-20 max-w-7xl mx-auto">

          <FadeUp className="max-w-2xl mb-24 relative">
            <h2 className="font-serif text-5xl md:text-6xl italic font-normal tracking-tight text-[#d9e3f6] mb-6">
              Perfectly Suited For...
            </h2>
            <p className="font-sans text-[1rem] leading-relaxed text-[#94a3b8] max-w-md">
              Define your flight path. The Cessna 172N excels in these primary operational profiles.
            </p>
            <div className="hidden md:block absolute top-[50%] right-[-100px] w-[200px] h-[1px] bg-white/5" />
          </FadeUp>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 items-start">

            <FadeUp delay={0.1} duration={2.6} viewportMargin="-20%">
              <div className="relative rounded-[1.5rem] overflow-hidden aspect-[3/4] md:aspect-[4/5] group shadow-2xl">
                <img
                  src="/StunningCoastalView.webp"
                  alt="Scenic Coastal Tours"
                  className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#040810] via-[#040810]/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-8">
                  <h3 className="font-serif text-2xl md:text-3xl text-white mb-3 tracking-wide text-shadow-sm">
                    Scenic Coastal Tours
                  </h3>
                  <p className="font-sans text-[0.85rem] leading-relaxed text-[#cbd5e1] opacity-90">
                    Exceptional visibility makes it the premier choice for sightseeing and aerial photography.
                  </p>
                </div>
              </div>
            </FadeUp>

            <FadeUp delay={0.4} duration={2.6} viewportMargin="-20%" className="sm:mt-16 lg:mt-24">
              <div className="relative rounded-[1.5rem] overflow-hidden aspect-[3/4] md:aspect-[4/5] group shadow-2xl">
                <img
                  src="/CockpitRunwayView.webp"
                  alt="Proficiency Flying"
                  className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#040810] via-[#040810]/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-8">
                  <h3 className="font-serif text-2xl md:text-3xl text-white mb-3 tracking-wide text-shadow-sm">
                    Proficiency Flying
                  </h3>
                  <p className="font-sans text-[0.85rem] leading-relaxed text-[#cbd5e1] opacity-90">
                    Stay sharp. Maintain your VFR/IFR currency with an aircraft that responds exactly as it should.
                  </p>
                </div>
              </div>
            </FadeUp>

            <FadeUp delay={0.7} duration={2.6} viewportMargin="-20%">
              <div className="relative rounded-[1.5rem] overflow-hidden aspect-[3/4] md:aspect-[4/5] group shadow-2xl">
                <img
                  src="/CessnaGoldenSunset.webp"
                  alt="Hour Building"
                  className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#040810] via-[#040810]/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-8">
                  <h3 className="font-serif text-2xl md:text-3xl text-white mb-3 tracking-wide text-shadow-sm">
                    Hour Building
                  </h3>
                  <p className="font-sans text-[0.85rem] leading-relaxed text-[#cbd5e1] opacity-90">
                    Efficient fuel burns and high availability make this the economical choice for commercial path pilots.
                  </p>
                </div>
              </div>
            </FadeUp>

            <FadeUp delay={1.0} duration={2.6} viewportMargin="-20%" className="sm:mt-16 lg:mt-24">
              <div className="relative rounded-[1.5rem] overflow-hidden aspect-[3/4] md:aspect-[4/5] group shadow-2xl bg-[#0c1827]">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="material-symbols-outlined text-[#64748b] text-5xl opacity-50">fastfood</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#040810] via-[#040810]/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-8">
                  <h3 className="font-serif text-2xl md:text-3xl text-white mb-3 tracking-wide text-shadow-sm">
                    $100 burger
                  </h3>
                  <p className="font-sans text-[0.85rem] leading-relaxed text-[#cbd5e1] opacity-90">
                    The ideal platform for quick weekend getaways, short cross-country hops, and flying out for lunch.
                  </p>
                </div>
              </div>
            </FadeUp>

          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          8. Final CTA Section
      ──────────────────────────────────────────────────────────────*/}
      <section className="relative pt-24 pb-32 border-t border-white/5 text-center flex items-center justify-center min-h-[500px]">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/TwilightFlight.webp")' }}
        />
        <div className="absolute inset-0 z-0 bg-[#0c1827]/80 backdrop-blur-[2px]" />

        <FadeUp delay={0.2} duration={2.0} viewportMargin="-25%" className="relative z-10 px-6 md:px-12 lg:px-20 max-w-2xl mx-auto w-full">
          <p className="font-sans font-semibold uppercase tracking-[0.25em] text-[0.65rem] text-[#64748b] mb-4 text-shadow-sm">
            Start your journey
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6] mb-12 drop-shadow-md">
            Request a checkout flight
          </h2>
          <a
            href="/login"
            className="inline-block font-sans font-bold text-[0.8rem] tracking-widest uppercase px-10 py-5 rounded bg-[#aec7f7] text-[#001b3d] hover:bg-[#dbeafe] transition-colors shadow-2xl"
          >
            Request checkout flight
          </a>
        </FadeUp>
      </section>

    </main>
  )
}
