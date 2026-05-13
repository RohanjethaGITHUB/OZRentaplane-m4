import React from 'react'
import AircraftSpotlight from '@/components/AircraftSpotlight'
import FleetGallery from '@/components/FleetGallery'
import { fleetGalleryManifest } from '@/lib/fleetGalleryManifest'
import { FadeUp, StaggerContainer, StaggerItem, HoverEmphasize } from '@/components/MotionPresets'

export default function Cessna172nPage() {
  const images = fleetGalleryManifest
  return (
    <main className="min-h-screen bg-mkt-main text-[#d9e3f6]">
      {/* ─────────────────────────────────────────────────────────────
          2. Aircraft Spotlight Section
      ──────────────────────────────────────────────────────────────*/}
      <AircraftSpotlight showHeading={false} />

      {/* ─────────────────────────────────────────────────────────────
          3. Fleet Gallery Section
      ──────────────────────────────────────────────────────────────*/}
      <FleetGallery images={images} />

      {/* ─────────────────────────────────────────────────────────────
          7. Perfectly Suited For Section (Use Cases)
      ──────────────────────────────────────────────────────────────*/}
      <section className="relative py-32 bg-mkt-main">
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
              <div className="relative rounded-[1.5rem] overflow-hidden aspect-[3/4] md:aspect-[4/5] group shadow-2xl">
                <img
                  src="/100$burger.png"
                  alt="$100 burger"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  style={{ objectPosition: '62% center' }}
                  loading="lazy"
                  decoding="async"
                />
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
        <img
          src="/TwilightFlight.jpg?v=safari-test-1"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 z-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0 z-[1]"
          style={{ background: 'rgba(7, 17, 29, 0.58)' }}
        />

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
