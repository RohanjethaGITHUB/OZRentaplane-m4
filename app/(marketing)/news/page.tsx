import React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'
import { Calendar, Tag, ArrowRight, Newspaper, BellRing } from 'lucide-react'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'News & Announcements — OZRentAPlane',
  description:
    'Stay up to date with the latest fleet additions, aerodrome expansions, and operational updates from OZRentAPlane.',
}

const ARTICLES = [
  {
    title: 'OZ Rentaplane Expands Fleet with IFR-Equipped Piper Archer III',
    date: 'August 24, 2024',
    category: 'Fleet Updates',
    summary:
      'We are excited to introduce VH-OZS to our Bankstown (YSBK) fleet. Equipped with dual Garmin G5 electronic flight instruments and autopilot, the Archer III brings advanced capability for instrument rating training and cross-country navigation.',
    readTime: '3 min read',
  },
  {
    title: 'Enhanced Standards Check Flight Syllabus Released for 2024/25',
    date: 'July 18, 2024',
    category: 'Safety & SOPs',
    summary:
      'Our Flight Operations team has published the revised Instructor & Pilot Standards manual, streamlining checkout procedures while reinforcing conservative engine management and stabilized approach criteria.',
    readTime: '4 min read',
  },
  {
    title: 'Digital Student Document Management Launched for Independent Instructors',
    date: 'June 05, 2024',
    category: 'Platform Features',
    summary:
      'Certified flight instructors can now upload, track, and manage student medical certificates, flight authorizations, and endorsement records securely within their OZ portal account.',
    readTime: '2 min read',
  },
  {
    title: 'Partnership Program Announced for Regional Flight Training Clubs',
    date: 'May 12, 2024',
    category: 'Partnerships',
    summary:
      'Regional flying clubs in New South Wales can now access OZ Rentaplane aircraft during peak training periods, eliminating maintenance downtime and expanding student lesson throughput.',
    readTime: '3 min read',
  },
]

export default function NewsPage() {
  return (
    <main className="bg-[#f8fafc] text-[#0f172a] font-sans overflow-x-hidden antialiased">
      {/* ═══ 1. HERO SECTION ═══════════════════════════════════════════════════ */}
      <section className="relative min-h-[460px] md:min-h-[520px] flex items-center px-6 sm:px-10 lg:px-20 overflow-hidden bg-[#06152b]">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-35 select-none"
          style={{ backgroundImage: 'url("/PreFooter.png")' }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#051326] via-[#051326]/85 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#f8fafc] to-transparent z-10" />

        <div className="relative z-20 max-w-5xl mx-auto w-full py-16">
          <span className="inline-block text-xs font-extrabold uppercase tracking-[0.18em] text-[#d97706] mb-3">
            Company Dispatch
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] mb-6">
            News & <span className="text-blue-400">Announcements</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
            The latest updates on aircraft fleet additions, safety protocols, aerodrome operations, and software releases.
          </p>
        </div>
      </section>

      {/* ═══ 2. FEATURED STORY & ARTICLES ══════════════════════════════════════ */}
      <section className="py-16 lg:py-20 px-6 sm:px-10 lg:px-20 max-w-7xl mx-auto">
        {/* Featured Story */}
        <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200 shadow-sm mb-16 relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7">
              <div className="flex items-center gap-3 text-xs font-bold text-blue-600 mb-3">
                <span className="bg-blue-50 px-3 py-1 rounded-md">FEATURED DISPATCH</span>
                <span>•</span>
                <span className="text-slate-400">August 24, 2024</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-[#06152b] tracking-tight leading-tight mb-4">
                OZ Rentaplane Expands Fleet with IFR-Equipped Piper Archer III
              </h2>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-6">
                VH-OZS joins our Sydney Bankstown operations with advanced avionics, dual Garmin displays, and optimized dry/wet hire options for hour building and instrument renewal.
              </p>
              <Link
                href="/cessna-172"
                className="inline-flex items-center gap-2 text-sm font-bold text-[#155dfc] hover:text-blue-800 transition-colors"
              >
                View Aircraft Specifications
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="lg:col-span-5">
              <img
                src="/instructor/piper-aircraft-clean.png"
                alt="Piper Aircraft in flight"
                className="w-full h-auto rounded-2xl object-cover"
              />
            </div>
          </div>
        </div>

        {/* Article Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {ARTICLES.slice(1).map((article) => (
            <div
              key={article.title}
              className="bg-white rounded-2xl p-7 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-blue-300 transition-all"
            >
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-3">
                  <span className="text-blue-700 bg-blue-50 px-2.5 py-1 rounded">
                    {article.category}
                  </span>
                  <span>{article.readTime}</span>
                </div>
                <h3 className="text-lg font-bold text-[#06152b] leading-snug mb-3">
                  {article.title}
                </h3>
                <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed mb-6">
                  {article.summary}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {article.date}
                </span>
                <span className="font-semibold text-blue-600">Read More →</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 3. PRE-FOOTER CTA ════════════════════════════════════════════════ */}
      <PreFooterCTA
        heading="Never Miss a Flight Dispatch"
        subtext="Subscribe to our weekly pilot briefing for fleet updates, regulatory notices, and cross-country guides."
        ctaLabel="Contact Operations"
        ctaHref="/contact-us"
      />
    </main>
  )
}
