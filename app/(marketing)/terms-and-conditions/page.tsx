import type { Metadata } from 'next'
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
    'Read the Terms & Conditions governing use of the OZRentAPlane website and services.',
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function TermsPage() {
  return (
    <main
      className="bg-mkt-main text-pale-sky font-sans min-h-screen"
      style={{ paddingTop: '62px' }}
    >
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div
        className="px-6 md:px-12 lg:px-20 py-20 md:py-28 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#ffffff' }}
      >
        <div className="max-w-3xl mx-auto">
          <span
            className="block font-sans font-bold text-[10px] tracking-[0.32em] uppercase mb-5 text-clearsky"
          >
            Legal
          </span>
          <h1
            className="font-serif text-[2.1rem] sm:text-[2.8rem] md:text-[3.4rem] font-normal leading-tight mb-3"
            style={{ color: '#d9e3f6' }}
          >
            {TERMS_MODAL_TITLE}
          </h1>
          <p className="font-sans text-[0.95rem] md:text-[1rem] leading-relaxed mb-6" style={{ color: '#94a3b8' }}>
            {TERMS_MODAL_SUBTITLE}
          </p>
          <p
            className="font-sans text-[0.95rem] md:text-[1rem] leading-relaxed max-w-2xl"
            style={{ color: '#94a3b8' }}
          >
            {TERMS_NOTICE}
          </p>
          <p
            className="font-sans text-[0.78rem] mt-6"
            style={{ color: 'rgba(148,163,184,0.55)' }}
          >
            Last updated: {TERMS_LAST_UPDATED}
          </p>
        </div>
      </div>

      {/* ── Body content ─────────────────────────────────────────────────── */}
      <div className="px-6 md:px-12 lg:px-20 py-20 md:py-28">
        <div className="max-w-3xl mx-auto space-y-14">
          {TERMS_SECTIONS.map((s) => (
            <section key={`${s.number}-${s.title}`}>
              <div className="flex items-baseline gap-4 mb-4">
                <span
                  className="font-sans font-bold text-[10px] tracking-[0.18em] shrink-0"
                  style={{ color: 'rgba(174,199,247,0.45)' }}
                >
                  {s.number}
                </span>
                <h2
                  className="font-serif text-[1.35rem] md:text-[1.55rem] font-normal leading-snug"
                  style={{ color: '#d9e3f6' }}
                >
                  {s.title}
                </h2>
              </div>
              <div className="space-y-2" style={{ paddingLeft: '1.85rem' }}>
                {s.blocks.map((block, idx) => (
                  block.type === 'paragraph' ? (
                    <p
                      key={idx}
                      className="font-sans text-[0.9rem] md:text-[0.95rem] leading-[1.85]"
                      style={{ color: '#94a3b8' }}
                    >
                      {block.text}
                    </p>
                  ) : (
                    <ul
                      key={idx}
                      className="list-disc list-outside ml-5 space-y-1 font-sans text-[0.9rem] md:text-[0.95rem] leading-[1.85]"
                      style={{ color: '#94a3b8' }}
                    >
                      {block.items.map((item, itemIdx) => (
                        <li key={itemIdx}>{item}</li>
                      ))}
                    </ul>
                  )
                ))}
              </div>
            </section>
          ))}
          <section>
            <p className="font-sans text-[0.95rem] font-semibold" style={{ color: '#d9e3f6' }}>
              {TERMS_END_TEXT}
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
