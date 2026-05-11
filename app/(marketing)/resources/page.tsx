const PASSENGER_BRIEFING_PDF_URL: string | null = null

export default function ResourcesPage() {
  return (
    <main className="min-h-screen bg-[#091421] text-[#d9e3f6]">
      <section className="px-6 md:px-12 lg:px-20 py-20 md:py-24">
        <div className="max-w-5xl mx-auto">
          <p className="font-sans text-xs font-semibold tracking-[0.28em] uppercase text-[#aec7f7]/70 mb-4">
            Resources
          </p>
          <h1 className="font-serif text-5xl md:text-6xl font-normal tracking-tight mb-10">
            Pilot Resources
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <article className="rounded-2xl border border-white/10 bg-[#0f1c2c] p-7 md:p-8">
              <h2 className="font-serif text-2xl text-[#dbeafe] mb-3">Passenger Briefing Card</h2>
              <p className="font-sans text-sm leading-relaxed text-[#c4c6cf] mb-6">
                Download or view the passenger safety briefing before your flight.
              </p>

              {PASSENGER_BRIEFING_PDF_URL ? (
                <a
                  href={PASSENGER_BRIEFING_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-md bg-[#aec7f7] text-[#001b3d] px-6 py-3 font-sans font-bold text-xs tracking-[0.14em] uppercase"
                >
                  View PDF
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-block rounded-md border border-white/20 text-[#94a3b8] px-6 py-3 font-sans font-bold text-xs tracking-[0.14em] uppercase cursor-not-allowed"
                >
                  PDF coming soon
                </button>
              )}
            </article>

            <article className="rounded-2xl border border-white/10 bg-[#0f1c2c] p-7 md:p-8">
              <h2 className="font-serif text-2xl text-[#dbeafe] mb-3">More resources coming soon</h2>
              <p className="font-sans text-sm leading-relaxed text-[#c4c6cf]">
                Additional flying resources and documents will be added here soon.
              </p>
            </article>
          </div>
        </div>
      </section>
    </main>
  )
}
