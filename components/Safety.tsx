const SAFETY_PILLARS = [
  {
    title: 'Airworthiness First',
    body: 'The aircraft undergoes scheduled 100-hourly and annual inspections through a CASA-approved LAME. We do not release aircraft with outstanding defects.',
  },
  {
    title: 'Credential Verification',
    body: 'Every pilot is verified before their first booking. Licences, medicals, and currency are checked — not assumed. Expired documentation grounds you until it\'s renewed.',
  },
  {
    title: 'Pre-Flight Protocol',
    body: 'You complete a formal pre-flight check before every departure. A standardised release form is signed for each flight, creating a clear record.',
  },
  {
    title: 'Incident Transparency',
    body: 'Any aircraft defect or incident is reported immediately. We maintain an open defect log accessible to members. If something\'s wrong, we ground it — not rationalise it.',
  },
]

export default function Safety() {
  return (
    <section id="safety" className="bg-oz-deep py-28 lg:py-36 relative overflow-hidden">
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[300px] bg-oz-blue/3 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          {/* Header */}
          <div className="lg:col-span-4">
            <p className="font-sans text-xs font-bold tracking-[0.3em] uppercase text-oz-blue/60 mb-4">
              Safety &amp; Standards
            </p>
            <h2 className="font-serif text-4xl lg:text-5xl font-black text-oz-text tracking-tight leading-tight mb-5">
              Nothing flies<br />
              <span className="italic text-oz-blue">unless it&apos;s right.</span>
            </h2>
            <div className="h-px w-16 bg-oz-blue/40 mb-6" />
            <p className="font-sans text-base text-oz-muted font-light leading-relaxed">
              Aviation safety is non-negotiable. Our standards aren&apos;t a marketing line — they&apos;re the operational baseline we hold ourselves to every day.
            </p>
          </div>

          {/* Pillars */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {SAFETY_PILLARS.map((pillar) => (
              <div
                key={pillar.title}
                className="border border-oz-high/60 rounded-lg p-8 hover:border-oz-blue/25 transition-colors duration-300"
              >
                <div className="w-8 h-px bg-oz-blue mb-6" />
                <h3 className="font-serif text-xl font-bold text-oz-text mb-3">{pillar.title}</h3>
                <p className="font-sans text-sm text-oz-muted font-light leading-relaxed">{pillar.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Regulatory note */}
        <div className="mt-16 pt-10 border-t border-oz-high/40 flex flex-col md:flex-row gap-6 md:items-center justify-between">
          <p className="font-sans text-sm text-oz-subtle font-light max-w-xl">
            OZRentAPlane operates in compliance with CASA regulations. Aircraft are registered under CASR Part 47. Rental operations follow CASR Part 61 pilot licensing requirements.
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <span className="w-2 h-2 rounded-full bg-oz-blue animate-pulse-slow" />
            <span className="font-sans text-xs font-bold tracking-widest uppercase text-oz-blue/70">CASA Compliant</span>
          </div>
        </div>
      </div>
    </section>
  )
}
