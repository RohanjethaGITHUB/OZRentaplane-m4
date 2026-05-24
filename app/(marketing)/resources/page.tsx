export default function ResourcesPage() {
  return (
    <main className="min-h-screen bg-[#091421] text-[#d9e3f6]">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 md:px-12 lg:px-20 min-h-[500px] md:min-h-[750px] flex items-center">
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/resources-hero.png")', opacity: 0.72 }}
        />
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-[#040f1e]/70 via-[#040f1e]/30 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] z-0 bg-gradient-to-t from-[#061524] via-[#2a130a]/30 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-16">
          <div className="max-w-xl">
            <p className="font-sans text-xs font-semibold tracking-[0.28em] uppercase text-[#E0B13B] mb-5">
            Pilot Resources
            </p>
            <h1 className="font-serif text-5xl md:text-7xl font-normal leading-[1.05] tracking-tight mb-6 text-white">
              Helpful Documents Before You Fly
            </h1>
            <p className="font-sans text-[1rem] leading-relaxed text-[#c4c6cf] mb-10 max-w-lg">
              Access key aircraft and pilot reference materials before your flight. These resources are provided to help you prepare, review requirements, and fly with confidence.
            </p>
          </div>
        </div>
      </section>

      {/* Documents */}
      <section className="px-6 md:px-12 lg:px-20 py-10 md:py-12">
        <div className="max-w-5xl mx-auto">
          <p className="font-sans text-xs font-semibold tracking-[0.22em] uppercase text-[#aec7f7]/65 mb-3">
            Resources
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight mb-8">
            Pilot Resources
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cessna 172N POH */}
            <article className="rounded-2xl border border-white/10 bg-[#0f1c2c] p-7 md:p-8 flex flex-col">
              <p className="font-sans text-[10px] font-semibold tracking-[0.22em] uppercase text-[#aec7f7]/50 mb-3">
                PDF Document
              </p>
              <h2 className="font-serif text-2xl text-[#dbeafe] mb-3">
                Cessna 172N Pilot's Operating Handbook
              </h2>
              <p className="font-sans text-sm leading-relaxed text-[#c4c6cf] mb-6 grow">
                Download the Pilot's Operating Handbook for the Cessna 172N Skyhawk.
              </p>
              <a
                href="/resources/POH-Cessna172N-1980.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 self-start rounded-md bg-[#aec7f7] text-[#001b3d] px-6 py-3 font-sans font-bold text-xs tracking-[0.14em] uppercase hover:bg-white transition-colors duration-200"
              >
                View / Download PDF
              </a>
            </article>

            {/* Coming soon */}
            <article className="rounded-2xl border border-white/10 bg-[#0f1c2c] p-7 md:p-8 flex flex-col">
              <h2 className="font-serif text-2xl text-[#dbeafe] mb-3">
                More Resources Coming Soon
              </h2>
              <p className="font-sans text-sm leading-relaxed text-[#c4c6cf] mb-6 grow">
                Additional pilot and aircraft documents will be added here.
              </p>
              <button
                type="button"
                disabled
                className="inline-block self-start rounded-md border border-white/20 text-[#94a3b8] px-6 py-3 font-sans font-bold text-xs tracking-[0.14em] uppercase cursor-not-allowed"
              >
                Coming soon
              </button>
            </article>
          </div>
          <div className="mt-8 rounded-xl border border-[#aec7f7]/20 bg-[#0d1d31]/70 p-4 md:p-5">
            <div className="flex items-start gap-3">
              <span className="mt-[2px] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#aec7f7]/35 bg-[#0f2744]">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#aec7f7" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 10v6" strokeLinecap="round" />
                  <circle cx="12" cy="7.2" r="1" fill="#aec7f7" stroke="none" />
                </svg>
              </span>
              <p className="font-sans text-[0.82rem] leading-relaxed text-[#b7c7dd]">
                These documents are provided for general reference only. Pilots should always verify information against the current official aircraft documents, approved operating material, CASA requirements, and any instructions provided by OZ Rent A Plane before flying.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
