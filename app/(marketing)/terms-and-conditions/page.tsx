import type { Metadata } from 'next'
import Link from 'next/link'
import {
  TERMS_END_TEXT,
  TERMS_LAST_UPDATED,
  TERMS_MODAL_SUBTITLE,
  TERMS_MODAL_TITLE,
  TERMS_NOTICE,
  TERMS_SECTIONS,
} from '@/lib/checkout-terms-content'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Terms & Conditions — OZRentAPlane',
  description:
    'Read the Aircraft Rental and Services Agreement governing use of the OZRentAPlane fleet and services.',
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function TermsPage() {
  return (
    <main className="bg-white text-[#0f172a] font-sans antialiased min-h-screen">
      {/* ═══ Header Section ═══════════════════════════════════════════════════ */}
      <section className="bg-[#06152b] text-white pt-24 pb-16 px-6 sm:px-10 lg:px-20 border-b border-slate-800">
        <div className="max-w-4xl mx-auto">
          <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#d97706] mb-3 block">
            Legal & Compliance
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-4 text-white">
            {TERMS_MODAL_TITLE}
          </h1>
          <p className="text-amber-400 font-semibold text-sm sm:text-base mb-3">
            {TERMS_MODAL_SUBTITLE}
          </p>
          <p className="text-slate-300 text-sm sm:text-[15px] leading-relaxed max-w-3xl">
            {TERMS_NOTICE}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center px-2.5 py-1 rounded bg-slate-800/90 text-slate-200 border border-slate-700/60 font-mono text-[11px]">
              Version: {TERMS_LAST_UPDATED}
            </span>
            <span>•</span>
            <span>CASA & NSW Compliant</span>
            <span>•</span>
            <span>Bankstown Airport (YSBK) Base</span>
          </div>
        </div>
      </section>

      {/* ═══ Document Body ═════════════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 px-6 sm:px-10 lg:px-20 max-w-4xl mx-auto">
        <div className="space-y-12">
          {TERMS_SECTIONS.map((s) => (
            <div
              key={`${s.number}-${s.title}`}
              className="border-b border-slate-200 pb-10 last:border-none"
            >
              <div className="flex items-start gap-4">
                <span className="text-sm font-black text-blue-600 font-mono mt-0.5 shrink-0 w-8">
                  {String(s.number).padStart(2, '0')}
                </span>
                <div className="flex-1">
                  <h2 className="text-xl sm:text-2xl font-black text-[#06152b] mb-4 tracking-tight">
                    {s.title}
                  </h2>
                  <div className="space-y-3">
                    {s.blocks.map((block, idx) =>
                      block.type === 'paragraph' ? (
                        <p
                          key={idx}
                          className="text-slate-700 text-sm sm:text-[15px] leading-relaxed"
                        >
                          {block.text}
                        </p>
                      ) : (
                        <ul key={idx} className="space-y-2 mt-2 pl-1">
                          {block.items.map((item, itemIdx) => (
                            <li
                              key={itemIdx}
                              className="flex items-start gap-2.5 text-xs sm:text-[13.5px] text-slate-700 leading-relaxed"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-2" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ═══ End note ═══════════════════════════════════════════════════════ */}
        <div className="mt-12 p-6 rounded-xl bg-slate-50 border border-slate-200 text-center">
          <p className="text-sm font-bold text-slate-900 tracking-wide uppercase">
            {TERMS_END_TEXT}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Operated by JAM Aviation Pty Ltd (ACN: 695 639 555) trading as OZ Rent A Plane
          </p>
        </div>

        {/* ═══ Legal Links Footnote ═════════════════════════════════════════════ */}
        <div className="mt-12 pt-8 border-t border-slate-200 flex flex-wrap gap-6 text-xs text-slate-600 font-medium">
          <Link href="/privacy-policy" className="hover:text-blue-600 underline">
            Privacy Policy
          </Link>
          <Link href="/safety-disclaimer" className="hover:text-blue-600 underline">
            Safety Disclaimer
          </Link>
          <Link href="/cookie-policy" className="hover:text-blue-600 underline">
            Cookie Policy
          </Link>
          <Link href="/contact-us" className="hover:text-blue-600 underline">
            Contact Support
          </Link>
        </div>
      </section>
    </main>
  )
}
