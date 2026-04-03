const STEPS = [
  {
    number: '01',
    title: 'Register',
    description: 'Create your account on OZRentAPlane. Basic details, contact info, and licence number to get started.',
  },
  {
    number: '02',
    title: 'Submit Pilot Credentials',
    description: 'Upload your CASA pilot certificate, medical, and relevant logbook hours. We verify everything before approval.',
  },
  {
    number: '03',
    title: 'Get Approved',
    description: 'Our team reviews your credentials. Most approvals complete within 1–2 business days. You\'ll be notified by email.',
  },
  {
    number: '04',
    title: 'Book the Aircraft',
    description: 'Choose your date, time, and intended route. The booking calendar shows real-time availability.',
  },
  {
    number: '05',
    title: 'Fly',
    description: 'Complete the pre-flight check, sign the release form, and take to the skies. The aircraft is yours for the duration.',
  },
  {
    number: '06',
    title: 'Pay Post-Flight',
    description: 'We bill you after landing, based on actual Hobbs time. No upfront deposits for approved members in good standing.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-oz-deep py-28 lg:py-36 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/3 w-[600px] h-[400px] bg-oz-blue/3 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="mb-20 max-w-2xl">
          <p className="font-sans text-xs font-bold tracking-[0.3em] uppercase text-oz-blue/60 mb-4">
            The Process
          </p>
          <h2 className="font-serif text-4xl lg:text-5xl font-black text-oz-text tracking-tight leading-tight mb-5">
            Straightforward<br />
            <span className="italic text-oz-blue">from the start.</span>
          </h2>
          <div className="h-px w-16 bg-oz-blue/40 mb-6" />
          <p className="font-sans text-lg text-oz-muted font-light leading-relaxed">
            No phone calls required. No hidden steps. A clean, digital process built for pilots who just want to fly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
            <div
              key={step.number}
              className="bg-oz-mid border border-oz-high/50 rounded-lg p-8 relative group hover:border-oz-blue/30 transition-colors duration-300"
            >
              <span className="font-serif text-6xl font-black text-oz-blue/10 absolute top-6 right-6 select-none group-hover:text-oz-blue/15 transition-colors">
                {step.number}
              </span>
              <div className="mb-5">
                <span className="font-sans text-xs font-bold tracking-widest uppercase text-oz-blue/50">
                  Step {step.number}
                </span>
              </div>
              <h3 className="font-serif text-xl font-bold text-oz-text mb-3">{step.title}</h3>
              <p className="font-sans text-sm text-oz-muted font-light leading-relaxed">{step.description}</p>
              {i < STEPS.length - 1 && (
                <div className="mt-6 h-px w-8 bg-oz-blue/20" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
