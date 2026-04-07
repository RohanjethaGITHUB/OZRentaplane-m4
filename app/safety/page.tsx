import React from 'react'

// ─── Tiny helper: Material Symbol icon ───────────────────────────────────────
function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

export default function SafetyPage() {
  return (
    <main className="pt-20 bg-[#091421] text-[#d9e3f6] font-body">

      {/* ═══ Section 1: Hero ═══════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center px-8 md:px-24 overflow-hidden">
        {/* Background image + overlays */}
        <div className="absolute inset-0 z-0">
          <img
            className="w-full h-full object-cover opacity-40 mix-blend-luminosity"
            src="/TwilightFlight.webp"
            alt="Aircraft in flight at twilight"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#091421] via-transparent to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#091421] via-[#091421]/40 to-transparent" />
        </div>

        <div className="relative z-10 max-w-4xl">
          <h1 className="font-headline text-5xl md:text-8xl leading-tight tracking-tight text-[#d9e3f6] mb-8 italic">
            Safety Built Into <br />Every Flight
          </h1>
          <p className="font-body text-xl md:text-2xl text-[#c4c6cf] max-w-2xl mb-12 leading-relaxed">
            Verified access and operational discipline aren&apos;t just protocols—they are the bedrock of our aviation ecosystem. We manage risk so you can manage the mission.
          </p>
          <div className="flex flex-wrap gap-6">
            <a
              href="/pilotRequirements"
              className="bg-gradient-to-br from-[#aec7f7] to-[#a0cafe] text-[#143057] px-8 py-4 rounded-md font-label font-bold uppercase tracking-widest text-sm hover:opacity-90 transition-all"
            >
              View Pilot Requirements
            </a>
            <a
              href="#contact"
              className="border border-[#44474e]/30 text-[#d9e3f6] px-8 py-4 rounded-md font-label font-bold uppercase tracking-widest text-sm hover:bg-[#212b38] transition-all"
            >
              Contact Us
            </a>
          </div>
        </div>
      </section>

      {/* ═══ Section 2: Safety Philosophy ═════════════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-[#091421]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-20">
          <div className="lg:col-span-5">
            <h2 className="font-headline text-4xl md:text-5xl text-[#aec7f7] mb-6">Our Philosophy</h2>
            <p className="text-[#c4c6cf] text-lg font-body leading-relaxed">
              Aviation safety is a quiet, continuous process. It lives in the spaces between takeoff and landing, built upon a foundation of absolute transparency and relentless standardisation.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: 'verified_user',
              title: 'Qualified pilots only',
              body: 'Rigorous vetting ensures only those with proven proficiency handle our aircraft.',
            },
            {
              icon: 'build_circle',
              title: 'Maintained with care',
              body: 'Aircraft are kept in premium condition by certified technicians beyond minimum requirements.',
            },
            {
              icon: 'rule',
              title: 'Clear operating standards',
              body: 'Standardized SOPs remove ambiguity and ensure consistent flight deck outcomes.',
            },
            {
              icon: 'schedule',
              title: 'Safety before schedule',
              body: 'We empower every pilot to make the conservative call, regardless of timing pressures.',
            },
          ].map(({ icon, title, body }) => (
            <div
              key={title}
              className="bg-[#121c29] p-10 flex flex-col justify-between h-80 group hover:bg-[#212b38] transition-all duration-500"
            >
              <Icon name={icon} className="text-[#aec7f7] !text-4xl" />
              <div>
                <h3 className="font-headline text-2xl text-[#d9e3f6] mb-3">{title}</h3>
                <p className="text-sm text-[#c4c6cf] leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Section 3: Pilot Approval Standards ══════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-[#050f1b]">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
          <div>
            <h2 className="font-headline text-4xl md:text-6xl text-[#d9e3f6] mb-4">Pilot Approval Standards</h2>
            <p className="text-[#c4c6cf] max-w-xl font-body">The standard for flying an OZ aircraft is deliberate and uncompromising.</p>
          </div>
          <div className="h-px bg-[#44474e]/20 flex-grow hidden md:block mx-12 mb-6" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1">
          {[
            {
              phase: 'Phase 01',
              title: 'Licence Verification',
              body: 'Validation of current PPL/CPL credentials and medical certifications directly with regulatory databases.',
            },
            {
              phase: 'Phase 02',
              title: 'Document Review',
              body: 'Analysis of logbook history and currency requirements to ensure legal and operational compliance.',
            },
            {
              phase: 'Phase 03',
              title: 'Experience Suitability',
              body: 'Evaluating specific flight hours in type and complex environment operations to match our fleet profile.',
            },
            {
              phase: 'Phase 04',
              title: 'Checkout Induction',
              body: 'A mandatory flight with an OZ authorized instructor to verify handling and system knowledge.',
            },
          ].map(({ phase, title, body }) => (
            <div
              key={phase}
              className="bg-[#121c29] p-8 border-l-2 border-[#aec7f7]/20"
            >
              <span className="text-xs font-label uppercase tracking-[0.2em] text-[#aec7f7]/60 mb-6 block">{phase}</span>
              <h4 className="font-headline text-2xl mb-4 text-[#d9e3f6]">{title}</h4>
              <p className="text-sm text-[#c4c6cf] font-body leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Section 4: Maintenance Standards ════════════════════════════════ */}
      <section className="py-0 grid grid-cols-1 lg:grid-cols-2 bg-[#091421]">
        {/* Left: image */}
        <div className="relative min-h-[500px]">
          <img
            className="absolute inset-0 w-full h-full object-cover"
            src="/Close-upNose.webp"
            alt="Aircraft maintenance close-up"
          />
          <div className="absolute inset-0 bg-[#aec7f7]/10 mix-blend-overlay" />
        </div>

        {/* Right: content */}
        <div className="flex items-center px-8 md:px-24 py-20 bg-[#121c29]">
          <div>
            <h2 className="font-headline text-4xl md:text-5xl text-[#d9e3f6] mb-8">Maintenance Standards</h2>
            <div className="space-y-8">
              {[
                {
                  icon: 'settings_suggest',
                  title: 'Scheduled Inspections',
                  body: 'Our fleet adheres to a proactive maintenance schedule that exceeds manufacturer minimums, including deep-cycle inspections every 50 hours.',
                },
                {
                  icon: 'task_alt',
                  title: 'Return-to-Service Protocols',
                  body: 'No aircraft leaves the hangar without a dual-signature sign-off from both the engineering lead and the quality assurance officer.',
                },
                {
                  icon: 'monitoring',
                  title: 'Digital Health Monitoring',
                  body: 'Real-time data logging on our glass-cockpit fleet allows us to track engine trends and predict maintenance needs before they arise.',
                },
              ].map(({ icon, title, body }) => (
                <div key={title} className="flex gap-6">
                  <Icon name={icon} className="text-[#aec7f7] mt-1 shrink-0" />
                  <div>
                    <h5 className="text-xl font-headline mb-2 text-[#d9e3f6]">{title}</h5>
                    <p className="text-sm text-[#c4c6cf]">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Section 5: Operational Safeguards ════════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-[#091421]">
        <div className="max-w-4xl mx-auto text-center mb-20">
          <h2 className="font-headline text-4xl md:text-6xl mb-6 text-[#d9e3f6]">Operational Safeguards</h2>
          <p className="text-[#c4c6cf] font-body text-lg">We provide the structure; you provide the command.</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 items-center bg-[#121c29] p-8 rounded-lg">
            <div className="md:col-span-1 text-[#aec7f7]">
              <Icon name="shield" className="!text-3xl" />
            </div>
            <div className="md:col-span-3">
              <h4 className="font-headline text-xl text-[#d9e3f6]">Booking Controls</h4>
            </div>
            <div className="md:col-span-8">
              <p className="text-[#c4c6cf] text-sm font-body">
                Automated logic cross-references pilot currency and aircraft status at the moment of booking, preventing illegal or unsafe pairings.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 items-center bg-[#121c29] p-8 rounded-lg">
            <div className="md:col-span-1 text-[#aec7f7]">
              <Icon name="psychology" className="!text-3xl" />
            </div>
            <div className="md:col-span-3">
              <h4 className="font-headline text-xl text-[#d9e3f6]">Decision Support</h4>
            </div>
            <div className="md:col-span-8">
              <p className="text-[#c4c6cf] text-sm font-body">
                Conservative decision-making is reinforced through integrated risk assessment tools provided to every member pilot.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Section 6: Pre-flight / Post-flight ══════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-[#050f1b]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[#44474e]/10">

          {/* Pre-flight */}
          <div className="bg-[#091421] p-12 md:p-20">
            <div className="flex items-center gap-4 mb-10">
              <span className="w-12 h-12 rounded-full bg-[#1b365d]/30 flex items-center justify-center text-[#aec7f7] font-bold font-label">
                01
              </span>
              <h2 className="font-headline text-3xl md:text-4xl text-[#d9e3f6]">Pre-flight</h2>
            </div>
            <ul className="space-y-6">
              {[
                'Comprehensive external walkaround inspection',
                'Fuel quantity and quality verification (Sumped)',
                'Weight and balance calculation for actual load',
                'Weather briefing and alternate selection',
              ].map(item => (
                <li key={item} className="flex gap-4">
                  <Icon name="check_circle" className="text-[#a9cbe4] shrink-0" />
                  <span className="text-[#c4c6cf]">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Post-flight */}
          <div className="bg-[#091421] p-12 md:p-20">
            <div className="flex items-center gap-4 mb-10">
              <span className="w-12 h-12 rounded-full bg-[#15394d]/30 flex items-center justify-center text-[#a9cbe4] font-bold font-label">
                02
              </span>
              <h2 className="font-headline text-3xl md:text-4xl text-[#d9e3f6]">Post-flight</h2>
            </div>
            <ul className="space-y-6">
              {[
                'Detailed flight log entry including Hobbs/Tach',
                "Reporting of any defects or 'squawks' immediately",
                'Ensuring aircraft is secured and refueled for next use',
                'Cabin cleanup and electronics master off check',
              ].map(item => (
                <li key={item} className="flex gap-4">
                  <Icon name="radio_button_checked" className="text-[#a9cbe4] shrink-0" />
                  <span className="text-[#c4c6cf]">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ═══ Section 7: Go / No-Go Culture ═══════════════════════════════════ */}
      <section className="relative py-48 px-8 md:px-24 flex items-center justify-center text-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            className="w-full h-full object-cover opacity-30"
            src="/StunningCoastalView.webp"
            alt="Atmospheric sky at dusk"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#091421] via-transparent to-[#091421]" />
        </div>

        <div className="relative z-10 max-w-3xl">
          <h2 className="font-headline text-5xl md:text-7xl mb-8 text-[#d9e3f6]">The Go/No-Go Culture</h2>
          <p className="font-body text-xl text-[#d9e3f6] mb-10 leading-relaxed italic">
            &ldquo;A superior pilot uses their superior judgment to avoid situations which require the use of their superior skill.&rdquo;
          </p>
          <p className="text-[#c4c6cf] text-lg font-body mb-12">
            OZ Rent A Plane maintains a strict zero-penalty rescheduling policy for weather-related cancellations. If the conditions don&apos;t look right, we support your decision to stay on the ground.
          </p>
          <div className="inline-flex items-center gap-2 text-[#aec7f7] font-label uppercase tracking-widest text-sm border-b border-[#aec7f7] pb-1">
            Read Our Weather Policy
          </div>
        </div>
      </section>

      {/* ═══ Section 8: Type Familiarisation ══════════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-[#091421]">
        <div className="bg-[#16202e] p-12 md:p-24 rounded-lg flex flex-col md:flex-row gap-16 items-center">

          {/* Text */}
          <div className="flex-1">
            <h2 className="font-headline text-4xl mb-8 text-[#d9e3f6]">Type Familiarisation</h2>
            <p className="text-[#c4c6cf] text-lg mb-8 font-body leading-relaxed">
              Even for highly experienced pilots, every cockpit is a unique ecosystem. Our mandatory checkouts aren&apos;t just about &lsquo;flying the plane&rsquo;—they are about mastering the specific avionics, emergency procedures, and operational nuances of the OZ fleet.
            </p>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h6 className="font-bold text-[#aec7f7] mb-2 uppercase text-xs tracking-widest font-label">Typical Duration</h6>
                <p className="font-headline text-2xl text-[#d9e3f6]">1.5 – 3 Hours</p>
              </div>
              <div>
                <h6 className="font-bold text-[#aec7f7] mb-2 uppercase text-xs tracking-widest font-label">Validity</h6>
                <p className="font-headline text-2xl text-[#d9e3f6]">90 Days Recency</p>
              </div>
            </div>
          </div>

          {/* Cockpit image */}
          <div className="flex-1 w-full">
            <div className="aspect-video bg-[#2b3544] rounded overflow-hidden group relative">
              <img
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                src="/CockpitRunwayView.webp"
                alt="Cockpit view"
              />
              <div className="absolute inset-0 bg-[#091421]/40 flex items-center justify-center">
                <Icon name="play_circle" className="!text-6xl text-white opacity-80" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Section 9: Safety FAQ ════════════════════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-[#050f1b]">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-headline text-4xl mb-16 text-center text-[#d9e3f6]">Safety Questions</h2>

          <div className="space-y-1">
            {/* First FAQ — open with answer */}
            <div className="bg-[#091421] p-8">
              <div className="flex justify-between items-center cursor-pointer">
                <h4 className="font-headline text-xl text-[#d9e3f6]">How is aircraft maintenance tracked?</h4>
                <Icon name="expand_more" className="text-[#aec7f7]" />
              </div>
              <div className="mt-4 text-[#c4c6cf] text-sm leading-relaxed max-w-3xl">
                We use a digital maintenance logbook accessible to all pilots during the pre-flight phase. This ensures you have a live view of the aircraft&apos;s airworthiness status and engine hours at all times.
              </div>
            </div>

            {[
              'What happens if I encounter a mechanical issue away from base?',
              'Do you allow flight into instrument meteorological conditions (IMC)?',
              'What is the insurance coverage for member pilots?',
            ].map(q => (
              <div key={q} className="bg-[#091421] p-8">
                <div className="flex justify-between items-center cursor-pointer">
                  <h4 className="font-headline text-xl text-[#d9e3f6]">{q}</h4>
                  <Icon name="expand_more" className="text-[#aec7f7]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Section 10: Final CTA ════════════════════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 text-center bg-[#091421]" id="contact">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-headline text-4xl md:text-6xl mb-8 text-[#d9e3f6]">Ready to Apply for Access?</h2>
          <p className="text-[#c4c6cf] text-lg mb-12 font-body">
            Join a community of disciplined aviators who value safety as much as the freedom of flight.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/pilotRequirements"
              className="bg-gradient-to-br from-[#aec7f7] to-[#a0cafe] text-[#143057] px-8 py-4 rounded-md font-label font-bold uppercase tracking-widest text-sm active:scale-95 transition-all"
            >
              View Pilot Requirements
            </a>
            <a
              href="#contact"
              className="bg-[#212b38] text-[#d9e3f6] px-8 py-4 rounded-md font-label font-bold uppercase tracking-widest text-sm active:scale-95 transition-all"
            >
              Contact Support
            </a>
          </div>
        </div>
      </section>

    </main>
  )
}
