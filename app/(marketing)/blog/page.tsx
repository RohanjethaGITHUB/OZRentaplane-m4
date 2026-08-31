import React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'
import { BookOpen, Calendar, Clock, ArrowRight, Compass, Shield, Wind } from 'lucide-react'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Aviation Blog & Flight Insights — OZRentAPlane',
  description:
    'Flight planning guides, Australian airspace insights, cross-country navigation, and instructor tips from OZRentAPlane.',
}

const POSTS = [
  {
    title: 'Mastering the Bankstown-Moorabbin Cross Country: Route & Fuel Planning',
    category: 'Flight Planning',
    date: 'August 14, 2024',
    readTime: '6 min read',
    excerpt:
      'A practical pilot guide to flying between Sydney and Melbourne through the inland and coastal routes, managing CTA steps, mountain waves, and alternate aerodromes.',
    icon: Compass,
  },
  {
    title: 'Stabilized Approaches in General Aviation: What Check Pilots Look For',
    category: 'Flight Safety',
    date: 'July 29, 2024',
    readTime: '5 min read',
    excerpt:
      'Why the final 500 feet defines your landing safety. We break down airspeed control, power settings, and the conservative go-around decision matrix.',
    icon: Shield,
  },
  {
    title: 'Understanding Australian Density Altitude in Summer Operations',
    category: 'Weather & Performance',
    date: 'July 10, 2024',
    readTime: '4 min read',
    excerpt:
      'High ambient temperatures drastically alter takeoff roll and climb gradients on naturally aspirated Lycoming engines. Here is how to calculate your margins accurately.',
    icon: Wind,
  },
  {
    title: 'Transitioning from Steam Gauges to Garmin Glass Cockpits',
    category: 'Avionics',
    date: 'June 22, 2024',
    readTime: '5 min read',
    excerpt:
      'Moving from classic six-pack instruments to dual Garmin G5 or G500 displays requires a new instrument scan habit. Key takeaways for private pilots.',
    icon: BookOpen,
  },
]

export default function BlogPage() {
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
            Aviation Insights
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] mb-6">
            The OZ <span className="text-blue-400">Flight Journal</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
            Practical knowledge, flight planning resources, and airmanship tips curated by our check pilots and instructors.
          </p>
        </div>
      </section>

      {/* ═══ 2. POSTS GRID ═════════════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 px-6 sm:px-10 lg:px-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {POSTS.map((post) => {
            const IconComponent = post.icon
            return (
              <article
                key={post.title}
                className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-4">
                    <span className="text-blue-700 bg-blue-50 px-3 py-1 rounded-md font-bold">
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {post.readTime}
                    </span>
                  </div>

                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#155dfc] flex items-center justify-center shrink-0 mt-1">
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-[#06152b] leading-snug">
                      {post.title}
                    </h2>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed mb-6 pl-14">
                    {post.excerpt}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 pl-14">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {post.date}
                  </span>
                  <Link
                    href="/resources"
                    className="font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
                  >
                    Read Article
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* ═══ 3. PRE-FOOTER CTA ════════════════════════════════════════════════ */}
      <PreFooterCTA
        heading="Ready to Apply Your Knowledge in Flight?"
        subtext="Book an instructor check flight or hire a Cessna 172 at Bankstown or Moorabbin."
        ctaLabel="Explore Aircraft"
        ctaHref="/fleet"
      />
    </main>
  )
}
