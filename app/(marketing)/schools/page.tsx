import React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'
import { GraduationCap, ShieldCheck, CalendarCheck, Clock, FileCheck, Layers, ChevronRight, CheckCircle2 } from 'lucide-react'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'For Flight Schools & Aeroclubs — OZRentAPlane',
  description:
    'Scale your flying school capacity, eliminate aircraft maintenance downtime, and manage instructional bookings effortlessly.',
}

export default function SchoolsPage() {
  return (
    <main className="bg-[#f8fafc] text-[#0f172a] font-sans overflow-x-hidden antialiased">
      {/* ═══ 1. HERO SECTION ═══════════════════════════════════════════════════ */}
      <section className="relative min-h-[520px] md:min-h-[600px] flex items-center px-6 sm:px-10 lg:px-20 overflow-hidden bg-[#06152b]">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-40 select-none"
          style={{ backgroundImage: 'url("/CessnaHangar.webp")' }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#051326] via-[#051326]/85 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#f8fafc] to-transparent z-10" />

        <div className="relative z-20 max-w-5xl mx-auto w-full py-20">
          <span className="inline-block text-xs font-extrabold uppercase tracking-[0.18em] text-[#d97706] mb-3">
            Institutional Flight Operations
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] mb-6">
            Flight School Fleet & <br className="hidden sm:inline" />
            <span className="text-blue-400">Instructor Capacity</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed mb-8">
            Overcome maintenance downtime, surge training demands, and aircraft availability bottlenecks. OZ Rentaplane provides ready-to-fly, CASA-compliant aircraft and digital booking tools for Australian flight schools.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/contact-us"
              className="inline-flex items-center gap-2 bg-[#155dfc] hover:bg-blue-600 text-white font-bold text-sm px-6 py-3.5 rounded-xl shadow-lg transition-all"
            >
              Partner with OZ
              <ChevronRight className="w-4 h-4" />
            </Link>
            <Link
              href="/become-an-instructor"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-6 py-3.5 rounded-xl border border-white/20 backdrop-blur-sm transition-all"
            >
              Instructor Portal
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ 2. KEY BENEFITS FOR SCHOOLS ═══════════════════════════════════════ */}
      <section className="py-20 lg:py-24 px-6 sm:px-10 lg:px-20 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue-600 mb-2 block">
            HOW WE HELP
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-[#06152b] tracking-tight mb-4">
            Seamlessly Expand Your Flight Line
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            Integrate certified general aviation aircraft into your existing curriculum without capital expenditure on hull acquisitions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#155dfc] flex items-center justify-center mb-6">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-[#06152b] mb-3">Zero Maintenance Headaches</h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                Scheduled 50-hour and 100-hour inspections, 100-hourly maintenance releases, and AD compliance are managed by our Part 145 engineering partners.
              </p>
            </div>
            <ul className="space-y-2.5 pt-4 border-t border-slate-100 text-xs text-slate-600 font-medium">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                No unexpected overhaul bills
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Guaranteed airworthiness releases
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#155dfc] flex items-center justify-center mb-6">
                <CalendarCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-[#06152b] mb-3">Digital Booking & Dispatch</h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                Direct integration with your instructors' schedules for dual instruction, solo student dispatches, and automatic Hobbs/Tach logging.
              </p>
            </div>
            <ul className="space-y-2.5 pt-4 border-t border-slate-100 text-xs text-slate-600 font-medium">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Real-time aircraft availability
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Automated invoice generation
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#155dfc] flex items-center justify-center mb-6">
                <FileCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-[#06152b] mb-3">Verified Student Oversight</h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                Digital storage and tracking of student licenses, medical certificates, English language proficiency, and dual/solo endorsements.
              </p>
            </div>
            <ul className="space-y-2.5 pt-4 border-t border-slate-100 text-xs text-slate-600 font-medium">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                CASA Part 61 compliance ready
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Multi-aircraft instructor checkouts
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ═══ 3. STEP-BY-STEP ONBOARDING ════════════════════════════════════════ */}
      <section className="py-20 bg-white border-y border-slate-200/80 px-6 sm:px-10 lg:px-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue-600 mb-2 block">
              PARTNERSHIP WORKFLOW
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-[#06152b] tracking-tight mb-4">
              How Schools Get Started
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="bg-[#f8fafc] rounded-2xl p-7 border border-slate-200 text-center flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-[#155dfc] text-white text-sm font-bold flex items-center justify-center mb-4">
                1
              </div>
              <h3 className="text-lg font-bold text-[#06152b] mb-2">Capacity Assessment</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                We review your aerodrome location, hourly requirements, and aircraft types (C172 / PA28).
              </p>
            </div>

            <div className="bg-[#f8fafc] rounded-2xl p-7 border border-slate-200 text-center flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-[#155dfc] text-white text-sm font-bold flex items-center justify-center mb-4">
                2
              </div>
              <h3 className="text-lg font-bold text-[#06152b] mb-2">Instructor Standardization</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                Your instructors complete a standardized checkout flight with an OZ-authorized check pilot.
              </p>
            </div>

            <div className="bg-[#f8fafc] rounded-2xl p-7 border border-slate-200 text-center flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-[#155dfc] text-white text-sm font-bold flex items-center justify-center mb-4">
                3
              </div>
              <h3 className="text-lg font-bold text-[#06152b] mb-2">Immediate Dispatch</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                Book and fly with real-time tach metering, online payments, and instant dispatch records.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 4. PRE-FOOTER CTA ════════════════════════════════════════════════ */}
      <PreFooterCTA
        heading="Partner Your Flight School with OZ"
        subtext="Contact our institutional flight operations team to discuss fleet allocations for your aeroclub or flight school."
        ctaLabel="Enquire Now"
        ctaHref="/contact-us"
      />
    </main>
  )
}
