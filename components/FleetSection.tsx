export default function FleetSection() {
  return (
    <section id="fleet" className="bg-oz-navy py-28 lg:py-36">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        {/* Header */}
        <div className="mb-20 max-w-2xl">
          <p className="font-sans text-xs font-bold tracking-[0.3em] uppercase text-oz-blue/60 mb-4">
            Our Fleet
          </p>
          <h2 className="font-serif text-4xl lg:text-5xl font-black text-oz-text tracking-tight leading-tight mb-5">
            One aircraft.<br />
            <span className="italic text-oz-blue">Precisely maintained.</span>
          </h2>
          <div className="h-px w-16 bg-oz-blue/40 mb-6" />
          <p className="font-sans text-lg text-oz-muted font-light leading-relaxed">
            We're starting focused — one well-kept aircraft, available to qualified pilots. More aircraft will join the fleet as the platform grows.
          </p>
        </div>

        {/* Aircraft card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main card */}
          <div className="lg:col-span-8 bg-oz-mid rounded-lg overflow-hidden border border-oz-high/50 group">
            {/* Placeholder image area */}
            <div className="h-72 bg-oz-panel flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-oz-high/30 to-oz-deep/80" />
              <div className="relative text-center">
                <p className="font-serif text-6xl font-black text-oz-blue/20">C172</p>
                <p className="font-sans text-xs tracking-widest uppercase text-oz-muted/50 mt-2">Aircraft photo coming soon</p>
              </div>
            </div>
            <div className="p-10">
              <div className="flex items-start justify-between mb-6 gap-4">
                <div>
                  <span className="font-sans text-xs font-bold tracking-widest uppercase text-oz-blue/60">Now Available</span>
                  <h3 className="font-serif text-3xl font-black text-oz-text mt-1">Cessna 172N</h3>
                </div>
                <span className="bg-oz-blue/10 border border-oz-blue/20 text-oz-blue px-3 py-1 rounded text-xs font-bold tracking-wide uppercase shrink-0">
                  Active
                </span>
              </div>
              <p className="font-sans text-oz-muted font-light leading-relaxed mb-8">
                The Cessna 172 is the most-produced aircraft in history — renowned for its forgiving handling, reliability, and versatility. Whether you're building hours, doing a cross-country trip, or just enjoying a local flight, it delivers.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-oz-high/40">
                {[
                  { label: 'Seats', value: '3 + Pilot' },
                  { label: 'Cruise Speed', value: '122 kts' },
                  { label: 'Range', value: '~640 nm' },
                  { label: 'Engine', value: 'Lycoming 160hp' },
                ].map((spec) => (
                  <div key={spec.label}>
                    <p className="font-sans text-xs font-bold tracking-widest uppercase text-oz-subtle mb-1">{spec.label}</p>
                    <p className="font-serif text-lg font-bold text-oz-text">{spec.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Side cards */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            {/* Rate card */}
            <div className="bg-oz-panel border border-oz-high/50 rounded-lg p-8 flex flex-col gap-4">
              <p className="font-sans text-xs font-bold tracking-widest uppercase text-oz-blue/60">Hourly Rate</p>
              <div>
                <span className="font-serif text-4xl font-black text-oz-blue">$TBD</span>
                <span className="font-sans text-oz-muted text-sm ml-2">/ wet hour</span>
              </div>
              <p className="font-sans text-sm text-oz-muted font-light leading-relaxed">
                Pricing finalised before launch. Post-flight billing, no deposits for approved members.
              </p>
              <a href="#booking" className="mt-2 bg-oz-blue text-oz-deep px-6 py-3 rounded font-bold font-sans text-sm text-center hover:bg-oz-text transition-colors">
                Join Waitlist
              </a>
            </div>

            {/* Expanding fleet card */}
            <div className="bg-oz-high/30 border border-oz-high/50 rounded-lg p-8 flex flex-col gap-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-oz-blue/5 rounded-full blur-3xl" />
              <p className="font-sans text-xs font-bold tracking-widest uppercase text-oz-blue/60">Coming Soon</p>
              <h4 className="font-serif text-xl font-bold text-oz-text">Fleet Expansion</h4>
              <p className="font-sans text-sm text-oz-muted font-light leading-relaxed">
                More aircraft types will be added as the platform grows. Express your interest in specific types.
              </p>
              <a href="#booking" className="text-oz-blue font-sans text-sm font-bold hover:underline mt-1">
                Request an aircraft type &rarr;
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
