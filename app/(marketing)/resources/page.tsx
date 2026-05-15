export default function ResourcesPage() {
  return (
    <main className="min-h-screen bg-[#091421] text-[#d9e3f6]">
      {/* Hero */}
      <section className="px-6 md:px-12 lg:px-20 pt-32 pb-10 md:pt-36 md:pb-12">
        <div className="max-w-5xl mx-auto">
          <p className="font-sans text-xs font-semibold tracking-[0.28em] uppercase text-[#aec7f7]/70 mb-4">
            Resources
          </p>
          <h1 className="font-serif text-5xl md:text-6xl font-normal tracking-tight mb-4">
            Pilot Resources
          </h1>
          <p className="font-sans text-base text-[#94a3b8] max-w-xl">
            Useful aircraft and pilot documents in one place.
          </p>
        </div>
      </section>

      {/* Documents */}
      <section className="px-6 md:px-12 lg:px-20 py-10 md:py-12">
        <div className="max-w-5xl mx-auto">
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
                href="https://wayman.edu/files/Cessna-172N-POH.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 self-start rounded-md bg-[#aec7f7] text-[#001b3d] px-6 py-3 font-sans font-bold text-xs tracking-[0.14em] uppercase hover:bg-white transition-colors duration-200"
              >
                Download PDF
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
        </div>
      </section>
    </main>
  )
}
