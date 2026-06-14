import React from 'react'
import AircraftSpotlight from '@/components/AircraftSpotlight'
import FleetGallery from '@/components/FleetGallery'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'
import { fleetGalleryManifest } from '@/lib/fleetGalleryManifest'
import { FadeUp, StaggerContainer, StaggerItem, HoverEmphasize } from '@/components/MotionPresets'
import AtmoClouds from '@/components/AtmoClouds'

export const dynamic = 'force-static'

function OrganicFlightOverlay() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {/* Plane 1 contrail */}
      <div
        className="cessna-contrail cessna-contrail-1 absolute left-0 top-0 h-[2px] w-[80px] origin-right"
        style={{
          background: 'linear-gradient(to left, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%)',
          animation: 'cessnaPlaneOrbitCW 45s linear infinite',
          animationDelay: '-0.3s',
        }}
      />
      {/* Plane 1 */}
      <div
        className="cessna-plane cessna-plane-1 absolute left-0 top-0"
        style={{ opacity: 0.14, animation: 'cessnaPlaneOrbitCW 45s linear infinite' }}
      >
        <svg viewBox="0 0 200 200" width="96" height="96">
          <path
            d="M20 110 L96 98 L136 36 L152 40 L126 96 L182 90 L188 106 L126 116 L134 158 L118 166 L96 120 L30 130 Z"
            fill="rgba(13,27,62,0.32)"
            stroke="rgba(13,27,62,0.2)"
            strokeWidth="1.2"
          />
        </svg>
      </div>

      {/* Plane 2 contrail */}
      <div
        className="cessna-contrail cessna-contrail-2 absolute left-0 top-0 h-[2px] w-[80px] origin-right"
        style={{
          background: 'linear-gradient(to left, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%)',
          animation: 'cessnaPlaneOrbitCCW 62s linear infinite',
          animationDelay: '-0.3s',
        }}
      />
      {/* Plane 2 */}
      <div
        className="cessna-plane cessna-plane-2 absolute left-0 top-0"
        style={{ opacity: 0.09, animation: 'cessnaPlaneOrbitCCW 62s linear infinite' }}
      >
        <div style={{ transform: 'scale(0.6)', transformOrigin: 'center' }}>
          <svg viewBox="0 0 200 200" width="96" height="96">
            <path
              d="M20 110 L96 98 L136 36 L152 40 L126 96 L182 90 L188 106 L126 116 L134 158 L118 166 L96 120 L30 130 Z"
              fill="rgba(13,27,62,0.28)"
              stroke="rgba(13,27,62,0.18)"
              strokeWidth="1.1"
            />
          </svg>
        </div>
      </div>

    </div>
  )
}

export default function Cessna172nPage() {
  const images = fleetGalleryManifest
  return (
    <main className="min-h-screen bg-mkt-main text-deep-ink">
      {/* ─────────────────────────────────────────────────────────────
          2. Aircraft Spotlight Section
      ──────────────────────────────────────────────────────────────*/}
      <AircraftSpotlight
        showHeading={false}
        baseColor="#0d2040"
        headerBlock={(
          <div className="border-b border-white/[0.08] px-2 pb-6 pt-2 md:px-4 md:pt-4">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-runway-amber">CESSNA 172N — PRIMARY FLEET</p>
            <h1 className="mt-3 font-serif text-4xl font-normal text-white md:text-5xl">Cessna 172 Skyhawk</h1>
            <p className="mt-2 font-sans text-sm text-white/60">VH-KZG · Bankstown Aerodrome</p>
          </div>
        )}
      />

      {/* ─────────────────────────────────────────────────────────────
          3. Fleet Gallery Section
      ──────────────────────────────────────────────────────────────*/}
      <FleetGallery images={images} />

      {/* ─────────────────────────────────────────────────────────────
          7. Perfectly Suited For Section (Use Cases)
      ──────────────────────────────────────────────────────────────*/}
      <section className="relative overflow-hidden py-32 bg-mkt-main">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_20%_30%,#8ca8d6_1px,transparent_1px),radial-gradient(circle_at_80%_60%,#8ca8d6_1px,transparent_1px)] [background-size:34px_34px,46px_46px]"
        />
        <AtmoClouds shapes={['C']} />
        <OrganicFlightOverlay />
        <div className="relative z-10 px-6 md:px-12 lg:px-20 max-w-7xl mx-auto">

          <FadeUp className="max-w-2xl mb-24 relative">
            <p className="mb-4 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-blue">FLEET PROFILES</p>
            <h2 className="font-serif text-5xl md:text-6xl italic font-normal tracking-tight text-deep-ink mb-6">
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
                <picture>
                  <source srcSet="/StunningCoastalView.webp" type="image/webp" />
                  <img
                    src="/StunningCoastalView.jpg"
                    alt="Scenic Coastal Tours"
                    className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
                <div className="absolute inset-0 bg-black/35" />
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
                <picture>
                  <source srcSet="/CockpitRunwayView.webp" type="image/webp" />
                  <img
                    src="/CockpitRunwayView.jpg"
                    alt="Proficiency Flying"
                    className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
                <div className="absolute inset-0 bg-black/35" />
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
                <picture>
                  <source srcSet="/CessnaGoldenSunset.webp" type="image/webp" />
                  <img
                    src="/CessnaGoldenSunset.jpg"
                    alt="Hour Building"
                    className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
                <div className="absolute inset-0 bg-black/35" />
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
              <div className="relative rounded-[1.5rem] overflow-hidden aspect-[3/4] md:aspect-[4/5] group shadow-2xl">
                <img
                  src="/100$burger.png"
                  alt="$100 burger"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  style={{ objectPosition: '62% center' }}
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-black/35" />
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

      <PreFooterCTA
        heading="Request a Checkout Flight"
        subtext="Get approved to fly VH-KZG from Bankstown Aerodrome."
        ctaLabel="Request Checkout Flight"
        ctaHref="/login"
      />

    </main>
  )
}
