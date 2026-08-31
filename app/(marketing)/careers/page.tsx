import React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'
import { Briefcase, Plane, Award, HeartHandshake, MapPin, ArrowRight, CheckCircle2 } from 'lucide-react'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Careers — OZRentAPlane',
  description:
    'Join OZRentAPlane to shape the future of flight training, aircraft rental, and aviation software in Australia.',
}

const ROLES = [
  {
    title: 'Senior Check Pilot & Standards Examiner',
    type: 'Full-Time / Contract',
    location: 'Bankstown (YSBK) / Sydney, NSW',
    category: 'Flight Operations',
    description:
      'Lead standardization check flights for newly onboarded private pilots and certified flight instructors across Cessna 172 and Piper Archer fleets.',
    requirements: [
      'CASA Commercial Pilot Licence (CPL) or ATPL',
      'Grade 1 or Grade 2 Flight Instructor Rating with Multi/Single Engine SEA',
      'Minimum 1,200 hours total flight time with 500 hours instructional',
      'Exemplary airmanship and dedication to flight deck standardization',
    ],
  },
  {
    title: 'Full-Stack Software Engineer (Aviation Ops)',
    type: 'Full-Time (Remote / Hybrid)',
    location: 'Sydney / Melbourne, Australia',
    category: 'Engineering & Product',
    description:
      'Design, build, and scale our core booking, real-time dispatch, CASA logbook tracking, and Stripe invoicing infrastructure using Next.js, Supabase, and TypeScript.',
    requirements: [
      '3+ years experience with React, Next.js (App Router), TypeScript, and PostgreSQL',
      'Familiarity with real-time architectures (WebSockets / Socket.io) and RESTful APIs',
      'Passion for general aviation, flight planning, or geospatial data is a strong plus',
    ],
  },
  {
    title: 'Aircraft Maintenance & Fleet Coordinator',
    type: 'Full-Time',
    location: 'Moorabbin (YMMB) / Melbourne, VIC',
    category: 'Fleet & Logistics',
    description:
      'Coordinate scheduled 50-hour and 100-hour periodic maintenance with certified Part 145 AMOs, oversee maintenance releases, and ensure zero unscheduled downtime.',
    requirements: [
      'Experience in general aviation fleet administration or Part 145 workshop coordination',
      'Knowledge of CASA CAR 1988 Part 4A Maintenance Releases and Airworthiness Directives (ADs)',
      'Strong organizational, documentation, and communication skills',
    ],
  },
]

export default function CareersPage() {
  return (
    <main className="bg-[#f8fafc] text-[#0f172a] font-sans overflow-x-hidden antialiased">
      {/* ═══ 1. HERO SECTION ═══════════════════════════════════════════════════ */}
      <section className="relative min-h-[500px] md:min-h-[580px] flex items-center px-6 sm:px-10 lg:px-20 overflow-hidden bg-[#06152b]">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-40 select-none"
          style={{ backgroundImage: 'url("/CessnaHangar.webp")' }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#051326] via-[#051326]/85 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#f8fafc] to-transparent z-10" />

        <div className="relative z-20 max-w-5xl mx-auto w-full py-20">
          <span className="inline-block text-xs font-extrabold uppercase tracking-[0.18em] text-[#d97706] mb-3">
            Careers at OZ Rentaplane
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] mb-6">
            Build the Future of <br className="hidden sm:inline" />
            <span className="text-blue-400">Australian Flight</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed mb-8">
            We are looking for passionate aviators, check pilots, and engineers who care deeply about flight safety, operational excellence, and modern technology.
          </p>
        </div>
      </section>

      {/* ═══ 2. WHY WORK WITH US ══════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 px-6 sm:px-10 lg:px-20 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue-600 mb-2 block">
            OUR CULTURE
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-[#06152b] tracking-tight mb-4">
            Why Join OZ Rentaplane?
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            Work at the intersection of general aviation and modern software engineering with a team that values safety and innovation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#155dfc] flex items-center justify-center mb-5">
              <Plane className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-[#06152b] mb-2">Aviation Access & Flying Privileges</h3>
            <p className="text-xs sm:text-[13.5px] text-slate-600 leading-relaxed">
              Discounted staff dry-hire rates on company aircraft, access to check flights, and endorsement opportunities.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#155dfc] flex items-center justify-center mb-5">
              <Award className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-[#06152b] mb-2">Standards That Matter</h3>
            <p className="text-xs sm:text-[13.5px] text-slate-600 leading-relaxed">
              We never compromise safety for commercial gain. Every team member has a direct voice in our Safety Management System.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#155dfc] flex items-center justify-center mb-5">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-[#06152b] mb-2">Flexible, Supportive Environment</h3>
            <p className="text-xs sm:text-[13.5px] text-slate-600 leading-relaxed">
              Competitive salary packages, flexible hybrid working for tech roles, and transparent performance progression.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ 3. OPEN POSITIONS ═════════════════════════════════════════════════ */}
      <section className="py-20 bg-white border-y border-slate-200/80 px-6 sm:px-10 lg:px-20">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 gap-4">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue-600 mb-2 block">
                CURRENT OPPORTUNITIES
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-[#06152b] tracking-tight">
                Open Positions
              </h2>
            </div>
            <p className="text-slate-500 text-sm">
              3 positions currently open across NSW & VIC
            </p>
          </div>

          <div className="space-y-6">
            {ROLES.map((role) => (
              <div
                key={role.title}
                className="bg-[#f8fafc] rounded-2xl p-7 sm:p-8 border border-slate-200 hover:border-blue-300 transition-all hover:shadow-md"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-md mb-2">
                      {role.category}
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black text-[#06152b]">
                      {role.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs sm:text-[13px] text-slate-500 shrink-0 font-medium">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      {role.location}
                    </span>
                    <span>•</span>
                    <span>{role.type}</span>
                  </div>
                </div>

                <p className="text-slate-600 text-sm leading-relaxed mb-6">
                  {role.description}
                </p>

                <div className="mb-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">Key Requirements:</h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-[13px] text-slate-600">
                    {role.requirements.map((req, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-4 border-t border-slate-200/80 flex justify-end">
                  <Link
                    href="/contact-us"
                    className="inline-flex items-center gap-2 bg-[#155dfc] hover:bg-blue-700 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-xl transition-colors"
                  >
                    Apply for this Role
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 4. PRE-FOOTER CTA ════════════════════════════════════════════════ */}
      <PreFooterCTA
        heading="Don't see the right role?"
        subtext="We are always open to hearing from exceptional check pilots, flight instructors, and operations talent."
        ctaLabel="Send General Application"
        ctaHref="/contact-us"
      />
    </main>
  )
}
