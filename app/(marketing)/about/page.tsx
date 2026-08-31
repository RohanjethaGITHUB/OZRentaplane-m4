import React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'
import { ShieldCheck, Compass, Users, Plane, Award, CheckCircle2, ChevronRight, MapPin } from 'lucide-react'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'About Us — OZRentAPlane',
  description:
    'Australia’s modern aviation platform connecting certified pilots, flight instructors, and premium general aviation aircraft.',
}

export default function AboutPage() {
  return (
    <main className="bg-[#f8fafc] text-[#0f172a] font-sans overflow-x-hidden antialiased">
      {/* ═══ 1. HERO SECTION ═══════════════════════════════════════════════════ */}
      <section className="relative min-h-[520px] md:min-h-[620px] flex items-center px-6 sm:px-10 lg:px-20 overflow-hidden bg-[#06152b]">
        {/* Background Image & Deep Navy Mask */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-45 select-none"
          style={{ backgroundImage: 'url("/CessnaHangar.webp")' }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#051326] via-[#051326]/80 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#f8fafc] to-transparent z-10" />

        <div className="relative z-20 max-w-5xl mx-auto w-full py-20">
          <span className="inline-block text-xs font-extrabold uppercase tracking-[0.18em] text-[#d97706] mb-3">
            About OZ Rentaplane
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] mb-6">
            Modern Aviation, Grounded in <br className="hidden sm:inline" />
            <span className="text-blue-400">Standard & Freedom</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed mb-8">
            We are redefining how pilots, instructors, and flying schools access, manage, and fly aircraft in Australia. Transparent, tech-forward, and uncompromising on flight safety.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/fleet"
              className="inline-flex items-center gap-2 bg-[#155dfc] hover:bg-blue-600 text-white font-bold text-sm px-6 py-3.5 rounded-xl shadow-lg transition-all"
            >
              Explore Our Fleet
              <ChevronRight className="w-4 h-4" />
            </Link>
            <Link
              href="/safety"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-6 py-3.5 rounded-xl border border-white/20 backdrop-blur-sm transition-all"
            >
              Our Safety Standards
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ 2. OUR STORY & VISION ════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24 px-6 sm:px-10 lg:px-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          <div className="lg:col-span-6">
            <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue-600 mb-2 block">
              OUR MISSION
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-[#06152b] tracking-tight leading-tight mb-6">
              Empowering General Aviation Across Australia
            </h2>
            <div className="space-y-4 text-slate-600 text-[15px] leading-relaxed">
              <p>
                General aviation in Australia has long been constrained by fragmented booking systems, manual paperwork, and high barriers to aircraft hire. OZ Rentaplane was founded with a singular purpose: to modernize aircraft hire and flight instruction without compromising CASA regulatory rigor.
              </p>
              <p>
                Whether you are an experienced command pilot planning a coastal cross-country navigation, a qualified flight instructor building an independent student roster, or a flight training organization expanding capacity, OZ Rentaplane provides the seamless infrastructure you need.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6 mt-8 pt-8 border-t border-slate-200">
              <div>
                <div className="text-3xl font-black text-[#06152b] mb-1">100%</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">CASA Compliant</div>
              </div>
              <div>
                <div className="text-3xl font-black text-[#06152b] mb-1">24/7</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Digital Dispatch</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
              <img
                src="/PreFooter.png"
                alt="Aircraft flying over Australia landscape"
                className="w-full h-[420px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#06152b]/80 via-transparent to-transparent flex items-end p-8">
                <div className="text-white">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">Standard Check Flights</div>
                  <div className="text-lg font-bold">Standardized flight deck discipline across all airframes.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 3. PILLARS OF EXCELLENCE ══════════════════════════════════════════ */}
      <section className="py-20 bg-white border-y border-slate-200/80 px-6 sm:px-10 lg:px-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue-600 mb-2 block">
              CORE VALUES
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-[#06152b] tracking-tight mb-4">
              What Drives Everything We Do
            </h2>
            <p className="text-slate-600 text-sm sm:text-base">
              Our principles are built on strict operational standards, transparent communication, and technological precision.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-[#f8fafc] rounded-2xl p-7 border border-slate-200/80 flex flex-col items-start hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-[#155dfc] flex items-center justify-center mb-5">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#06152b] mb-2">Safety Before Schedule</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                Zero pressure on go/no-go weather decisions. We encourage conservative airmanship at every stage.
              </p>
            </div>

            <div className="bg-[#f8fafc] rounded-2xl p-7 border border-slate-200/80 flex flex-col items-start hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-[#155dfc] flex items-center justify-center mb-5">
                <Plane className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#06152b] mb-2">Meticulous Maintenance</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                All airframes are maintained to strict CASA Part 145 standards with continuous technical logging.
              </p>
            </div>

            <div className="bg-[#f8fafc] rounded-2xl p-7 border border-slate-200/80 flex flex-col items-start hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-[#155dfc] flex items-center justify-center mb-5">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#06152b] mb-2">Instructor Autonomy</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                Certified instructors manage their students, schedules, and dual bookings directly on our platform.
              </p>
            </div>

            <div className="bg-[#f8fafc] rounded-2xl p-7 border border-slate-200/80 flex flex-col items-start hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-[#155dfc] flex items-center justify-center mb-5">
                <Compass className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#06152b] mb-2">Clear, Honest Pricing</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                No hidden landing fee markups or administrative surprises. Real-time rates per flight tachometer hour.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 4. FOOTPRINT & AIRPORTS ═══════════════════════════════════════════ */}
      <section className="py-20 px-6 sm:px-10 lg:px-20 max-w-7xl mx-auto">
        <div className="bg-[#0a192f] rounded-3xl p-8 sm:p-12 lg:p-16 text-white relative overflow-hidden">
          <div className="max-w-2xl relative z-10">
            <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-amber-400 mb-2 block">
              OPERATIONAL BASES
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-4">
              Where We Fly
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-8">
              OZ Rentaplane operates across major general aviation hubs in New South Wales and Victoria, with ongoing expansion to Queensland and regional aerodromes.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-blue-400 shrink-0" />
                <span className="text-sm font-semibold">Bankstown Airport (YSBK) — Primary NSW Hub</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-blue-400 shrink-0" />
                <span className="text-sm font-semibold">Moorabbin Airport (YMMB) — Primary VIC Hub</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-blue-400 shrink-0" />
                <span className="text-sm font-semibold">Camden (YSCN) & Regional Cross-Country Clearances</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 5. PRE-FOOTER CTA ════════════════════════════════════════════════ */}
      <PreFooterCTA
        heading="Ready to Take Flight?"
        subtext="Book an aircraft checkout, explore our fleet, or connect with our flight operations team."
        ctaLabel="Explore Fleet"
        ctaHref="/fleet"
      />
    </main>
  )
}
