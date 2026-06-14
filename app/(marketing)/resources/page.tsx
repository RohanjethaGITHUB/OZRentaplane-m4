import PreFooterCTA from '@/components/marketing/PreFooterCTA'
import AtmoClouds from '@/components/AtmoClouds'

export const dynamic = 'force-static'

export default function ResourcesPage() {
  return (
    <main className="bg-mkt-main text-deep-ink">
      {/* Hero */}
      <section className="hero-fade-to-main relative overflow-hidden px-6 md:px-12 lg:px-20 min-h-[500px] md:min-h-[750px] flex items-center">
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/resources-hero.png")', opacity: 0.72 }}
        />
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-[#040f1e]/70 via-[#040f1e]/30 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] z-0 bg-gradient-to-t from-[#061524] via-[#2a130a]/30 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-16">
          <div className="max-w-xl">
            <p className="font-sans text-xs font-semibold tracking-[0.28em] uppercase text-runway-amber mb-5">
            Pilot Resources
            </p>
            <h1 className="font-serif text-5xl md:text-7xl font-normal leading-[1.05] tracking-tight mb-6 text-white">
              Helpful Documents Before You Fly
            </h1>
            <p className="font-sans text-[1rem] leading-relaxed text-cloud-muted mb-10 max-w-lg">
              Access key aircraft and pilot reference materials before your flight. These resources are provided to help you prepare, review requirements, and fly with confidence.
            </p>
          </div>
        </div>
      </section>

      {/* Documents */}
      <section className="relative overflow-hidden bg-mkt-main px-6 py-10 md:px-12 md:py-12 lg:px-20">
        <AtmoClouds shapes={['B']} />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2"
          width="600"
          height="600"
          viewBox="0 0 540 540"
          fill="none"
          style={{ opacity: 0.05 }}
        >
          <circle cx="270" cy="270" r="258" stroke="#0d1b3e" strokeWidth="1.5" />
          <circle cx="270" cy="270" r="188" stroke="#0d1b3e" strokeWidth="0.75" />
          <line x1="270" y1="12" x2="270" y2="528" stroke="#0d1b3e" strokeWidth="0.5" />
          <line x1="12" y1="270" x2="528" y2="270" stroke="#0d1b3e" strokeWidth="0.5" />
          <line x1="88" y1="88" x2="452" y2="452" stroke="#0d1b3e" strokeWidth="0.35" />
          <line x1="452" y1="88" x2="88" y2="452" stroke="#0d1b3e" strokeWidth="0.35" />
        </svg>
        <div className="relative z-10 max-w-5xl mx-auto">
          <p className="font-sans text-xs font-semibold tracking-[0.22em] uppercase text-brand-blue/65 mb-3">
            Resources
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight mb-8">
            Pilot Resources
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cessna 172N POH */}
            <article className="rounded-2xl border border-mkt-subtle bg-mkt-lift p-7 md:p-8 flex flex-col shadow-[0_4px_20px_rgba(15,40,90,0.09)]">
              <p className="font-sans text-[10px] font-semibold tracking-[0.22em] uppercase text-brand-blue/50 mb-3">
                PDF Document
              </p>
              <h2 className="font-serif text-2xl text-deep-ink mb-3">
                Cessna 172N Pilot's Operating Handbook
              </h2>
              <p className="font-sans text-sm leading-relaxed text-muted-ink mb-6 grow">
                Download the Pilot's Operating Handbook for the Cessna 172N Skyhawk.
              </p>
              <a
                href="/resources/POH-Cessna172N-1980.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 self-start rounded-md bg-brand-blue text-white px-6 py-3 font-sans font-bold text-xs tracking-[0.14em] uppercase hover:bg-[#1541b1] transition-colors duration-200"
              >
                View / Download PDF
              </a>
            </article>

            {/* Coming soon */}
            <article className="rounded-2xl border border-mkt-subtle bg-mkt-lift p-7 md:p-8 flex flex-col shadow-[0_4px_20px_rgba(15,40,90,0.09)]">
              <h2 className="font-serif text-2xl text-deep-ink mb-3">
                More Resources Coming Soon
              </h2>
              <p className="font-sans text-sm leading-relaxed text-muted-ink mb-6 grow">
                Additional pilot and aircraft documents will be added here.
              </p>
              <button
                type="button"
                disabled
                className="inline-block self-start rounded-md border border-deep-ink text-deep-ink px-6 py-3 font-sans font-bold text-xs tracking-[0.14em] uppercase cursor-not-allowed"
              >
                Coming soon
              </button>
            </article>
          </div>
          <div className="mt-8 rounded-xl border border-mkt-subtle bg-mkt-lift p-4 md:p-5">
            <div className="flex items-start gap-3">
              <span className="mt-[2px] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-mkt-subtle bg-horizon-border">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a4fd6" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 10v6" strokeLinecap="round" />
                  <circle cx="12" cy="7.2" r="1" fill="#1a4fd6" stroke="none" />
                </svg>
              </span>
              <p className="font-sans text-[0.82rem] leading-relaxed text-muted-ink">
                These documents are provided for general reference only. Pilots should always verify information against the current official aircraft documents, approved operating material, CASA requirements, and any instructions provided by OZ Rent A Plane before flying.
              </p>
            </div>
          </div>
        </div>
      </section>

      <PreFooterCTA
        heading="Ready to Take to the Skies?"
        subtext="Create your account and access your full pilot portal after checkout."
        ctaLabel="Get Started"
        ctaHref="/login"
      />
    </main>
  )
}
