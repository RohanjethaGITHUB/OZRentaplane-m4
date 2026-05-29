const MEMBER_TYPES = [
  {
    icon: '✈',
    title: 'PPL Holders',
    description: 'Private pilot certificate? You\'re our primary member. Whether you\'re building hours or exploring new routes, the platform is built around you.',
  },
  {
    icon: '📋',
    title: 'Hour Builders',
    description: 'Working toward a CPL or instrument rating? Affordable access to a well-maintained aircraft helps you build time without the overheads of ownership.',
  },
  {
    icon: '🛩',
    title: 'Currency Flyers',
    description: 'Licensed but not flying often enough? Stay current with occasional rental access — no club membership fees, no pressure.',
  },
]

export default function WhoItsFor() {
  return (
    <section id="who-its-for" className="bg-mkt-main py-28 lg:py-36 relative overflow-hidden">
      {/* Cloud wisps — upper corners */}
      <div aria-hidden="true" className="pointer-events-none absolute z-0" style={{ top: '-50px', left: '-60px', width: '260px', height: '170px', borderRadius: '50%', background: 'rgba(220,235,255,0.9)', filter: 'blur(68px)', opacity: 0.07 }} />
      <div aria-hidden="true" className="pointer-events-none absolute z-0" style={{ top: '-35px', right: '-45px', width: '220px', height: '150px', borderRadius: '50%', background: 'rgba(240,248,255,0.9)', filter: 'blur(60px)', opacity: 0.07 }} />
      {/* Horizon line */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-0" style={{ top: '60%', height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(26,79,214,0.07) 15%, rgba(26,79,214,0.07) 85%, transparent 100%)' }} />
      {/* Edge vignette */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" style={{ background: 'radial-gradient(ellipse 100% 90% at 50% 50%, transparent 45%, rgba(15,30,55,0.07) 100%)' }} />
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
          {/* Left column */}
          <div className="lg:col-span-5 lg:sticky lg:top-24">
            <p className="font-sans text-xs font-bold tracking-[0.3em] uppercase text-oz-blue/60 mb-4">
              Membership
            </p>
            <h2 className="font-serif text-4xl lg:text-5xl font-black text-oz-text tracking-tight leading-tight mb-5">
              Built for pilots.<br />
              <span className="italic text-oz-blue">Full stop.</span>
            </h2>
            <div className="h-px w-16 bg-oz-blue/40 mb-6" />
            <p className="font-sans text-lg text-oz-muted font-light leading-relaxed mb-8">
              OZRentAPlane is not a flight school. It&apos;s not a joy ride service. It&apos;s a platform for licensed, current pilots who want straightforward access to a maintained aircraft.
            </p>
            <p className="font-sans text-base text-oz-muted font-light leading-relaxed mb-10">
              You bring the licence and the skills. We handle maintenance, scheduling, and the administration.
            </p>
            <a
              href="#booking"
              className="inline-block bg-oz-blue text-oz-deep px-8 py-3.5 rounded font-bold font-sans tracking-wide hover:bg-oz-text transition-colors"
            >
              Apply for Membership
            </a>
          </div>

          {/* Right column */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {MEMBER_TYPES.map((type) => (
              <div
                key={type.title}
                className="bg-mkt-lift border border-mkt-subtle rounded-lg p-8 flex gap-6 group hover:border-oz-blue/20 transition-colors duration-300 shadow-[0_4px_20px_rgba(15,40,90,0.09),inset_0_2px_0_rgba(100,149,237,0.26)]"
              >
                <span className="text-3xl shrink-0 mt-0.5">{type.icon}</span>
                <div>
                  <h3 className="font-serif text-xl font-bold text-oz-text mb-2">{type.title}</h3>
                  <p className="font-sans text-sm text-oz-muted font-light leading-relaxed">{type.description}</p>
                </div>
              </div>
            ))}

            {/* Requirements box */}
            <div className="bg-oz-blue/5 border border-oz-blue/15 rounded-lg p-8 mt-2">
              <h4 className="font-serif text-lg font-bold text-oz-text mb-4">Minimum Requirements</h4>
              <ul className="space-y-2.5">
                {[
                  'Valid CASA pilot certificate (PPL or higher)',
                  'Current Class 2 medical or NVFR-appropriate medical',
                  'C172 endorsement or equivalent type experience',
                  'Minimum 10 hours total time in type (negotiable)',
                  'Australian resident or visitor with valid visa',
                ].map((req) => (
                  <li key={req} className="flex items-start gap-3 font-sans text-sm text-oz-muted font-light">
                    <span className="text-oz-blue mt-0.5 shrink-0">&mdash;</span>
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
