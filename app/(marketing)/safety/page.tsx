import React from 'react'
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/MotionPresets'

// ─── Tiny helper: Material Symbol icon ───────────────────────────────────────
function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

export default function SafetyPage() {
  return (
    <main className="bg-[#091421] text-[#d9e3f6] font-sans overflow-x-hidden">

      {/* ═══ Section 1: Hero ═══════════════════════════════════════════════════ */}
      <section className="relative px-6 md:px-12 lg:px-20 overflow-hidden min-h-[500px] md:min-h-[750px] flex items-center">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-75"
          style={{ backgroundImage: 'url("/CessnaHangar.webp")' }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#040f1e]/95 via-[#040f1e]/55 to-[#040f1e]/10" />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#091421]/25 via-transparent to-[#091421]/35" />

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-16">
          <StaggerContainer className="max-w-xl" staggerDelay={0.25}>
            <StaggerItem duration={1.4}>
              <h1 className="font-serif text-5xl md:text-7xl font-normal leading-[1.05] tracking-tight mb-6 text-white">
                Safety Built Into <br />
                Every Flight
              </h1>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[1rem] leading-relaxed text-[#c4c6cf] mb-10 max-w-md">
                Verified access and operational discipline aren&apos;t just protocols—they are the bedrock of our aviation ecosystem. We manage risk so you can manage the mission.
              </p>
            </StaggerItem>
          </StaggerContainer>
          
          <div className="flex flex-wrap items-center gap-4 mt-6">
            <FadeUp delay={1.2} duration={1.4}>
              <a
                href="/pilotRequirements"
                className="inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] rounded-md font-sans font-bold tracking-widest uppercase text-[0.8rem] px-8 py-4 shadow-2xl shadow-[#aec7f7]/20 transition-all active:scale-95 hover:brightness-110"
              >
                View Requirements
              </a>
            </FadeUp>
            <FadeUp delay={1.5} duration={1.4}>
              <a
                href="#contact"
                className="font-sans font-bold text-[0.8rem] tracking-widest uppercase px-8 py-4 rounded border border-white/20 text-[#c4c6cf] hover:bg-white/5 transition-colors"
              >
                Contact Us
              </a>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ═══ Section 2: Safety Philosophy ═════════════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-[#091421]">
        <StaggerContainer className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-20" viewportMargin="-20%">
          <div className="lg:col-span-5">
            <StaggerItem duration={1.4}>
              <h2 className="font-serif font-normal text-4xl md:text-5xl text-[#aec7f7] mb-6">Our Philosophy</h2>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="text-[#c4c6cf] text-lg font-sans leading-relaxed">
                Aviation safety is a quiet, continuous process. It lives in the spaces between takeoff and landing, built upon a foundation of absolute transparency and relentless standardisation.
              </p>
            </StaggerItem>
          </div>
        </StaggerContainer>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" staggerDelay={0.3} viewportMargin="-25%">
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
            <StaggerItem key={title} duration={1.4}>
              <div
                className="bg-[#121c29] p-10 flex flex-col justify-between h-80 group hover:bg-[#212b38] transition-all duration-500"
              >
                <Icon name={icon} className="text-[#aec7f7] !text-4xl group-hover:scale-110 transition-transform duration-500" />
                <div>
                  <h3 className="font-serif font-normal text-2xl text-[#d9e3f6] mb-3">{title}</h3>
                  <p className="text-sm text-[#c4c6cf] leading-relaxed">{body}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* ═══ Section 3: Pilot Approval Standards ══════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-[#050f1b]">
        <StaggerContainer className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8" viewportMargin="-20%">
          <div>
            <StaggerItem duration={1.4}>
              <h2 className="font-serif font-normal text-4xl md:text-6xl text-[#d9e3f6] mb-4">Pilot Approval Standards</h2>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="text-[#c4c6cf] max-w-xl font-sans">The standard for flying an OZ aircraft is deliberate and uncompromising.</p>
            </StaggerItem>
          </div>
          <div className="h-px bg-[#44474e]/20 flex-grow hidden md:block mx-12 mb-6" />
        </StaggerContainer>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1" staggerDelay={0.5} viewportMargin="-25%">
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
            <StaggerItem key={phase} duration={1.6}>
              <div
                className="bg-[#121c29] p-8 border-l-2 border-[#aec7f7]/20 h-full"
              >
                <span className="text-xs font-sans uppercase tracking-[0.2em] text-[#aec7f7]/60 mb-6 block">{phase}</span>
                <h4 className="font-serif font-normal text-2xl mb-4 text-[#d9e3f6]">{title}</h4>
                <p className="text-sm text-[#c4c6cf] font-sans leading-relaxed">{body}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* ═══ Section 4: Maintenance Standards ════════════════════════════════ */}
      <section className="py-0 grid grid-cols-1 lg:grid-cols-2 bg-[#091421]">
        {/* Left: image */}
        <FadeUp duration={2.4} viewportMargin="-20%" delay={0.1} className="relative min-h-[500px]">
          <img
            className="absolute inset-0 w-full h-full object-cover"
            src="/Close-upNose.webp"
            alt="Aircraft maintenance close-up"
          />
          <div className="absolute inset-0 bg-[#aec7f7]/10 mix-blend-overlay" />
        </FadeUp>

        {/* Right: content */}
        <div className="flex items-center px-8 md:px-24 py-20 bg-[#121c29]">
          <StaggerContainer staggerDelay={0.4} viewportMargin="-30%">
            <StaggerItem duration={1.4}>
              <h2 className="font-serif font-normal text-4xl md:text-5xl text-[#d9e3f6] mb-8">Maintenance Standards</h2>
            </StaggerItem>
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
                <StaggerItem key={title} duration={1.4}>
                  <div className="flex gap-6">
                    <Icon name={icon} className="text-[#aec7f7] mt-1 shrink-0" />
                    <div>
                      <h5 className="text-xl font-serif font-normal mb-2 text-[#d9e3f6]">{title}</h5>
                      <p className="text-sm text-[#c4c6cf]">{body}</p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </div>
          </StaggerContainer>
        </div>
      </section>

      {/* ═══ Section 5: Operational Safeguards ════════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-[#091421]">
        <StaggerContainer className="max-w-4xl mx-auto text-center mb-20" viewportMargin="-20%">
          <StaggerItem duration={1.4}>
            <h2 className="font-serif font-normal text-4xl md:text-6xl mb-6 text-[#d9e3f6]">Operational Safeguards</h2>
          </StaggerItem>
          <StaggerItem duration={1.4}>
            <p className="text-[#c4c6cf] font-sans text-lg">We provide the structure; you provide the command.</p>
          </StaggerItem>
        </StaggerContainer>

        <StaggerContainer className="space-y-4" staggerDelay={0.4} viewportMargin="-20%">
          <StaggerItem duration={1.4}>
            <div className="grid grid-cols-1 md:grid-cols-12 items-center bg-[#121c29] p-8 rounded-lg">
              <div className="md:col-span-1 text-[#aec7f7]">
                <Icon name="shield" className="!text-3xl" />
              </div>
              <div className="md:col-span-3">
                <h4 className="font-serif font-normal text-xl text-[#d9e3f6]">Booking Controls</h4>
              </div>
              <div className="md:col-span-8">
                <p className="text-[#c4c6cf] text-sm font-sans">
                  Automated logic cross-references pilot currency and aircraft status at the moment of booking, preventing illegal or unsafe pairings.
                </p>
              </div>
            </div>
          </StaggerItem>

          <StaggerItem duration={1.4}>
            <div className="grid grid-cols-1 md:grid-cols-12 items-center bg-[#121c29] p-8 rounded-lg">
              <div className="md:col-span-1 text-[#aec7f7]">
                <Icon name="psychology" className="!text-3xl" />
              </div>
              <div className="md:col-span-3">
                <h4 className="font-serif font-normal text-xl text-[#d9e3f6]">Decision Support</h4>
              </div>
              <div className="md:col-span-8">
                <p className="text-[#c4c6cf] text-sm font-sans">
                  Conservative decision-making is reinforced through integrated risk assessment tools provided to every member pilot.
                </p>
              </div>
            </div>
          </StaggerItem>
        </StaggerContainer>
      </section>

      {/* ═══ Section 6: Pre-flight / Post-flight ══════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-[#050f1b]">
        <StaggerContainer className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[#44474e]/10" staggerDelay={0.4} viewportMargin="-20%">

          {/* Pre-flight */}
          <StaggerItem duration={1.4}>
            <div className="bg-[#091421] p-12 md:p-20 h-full">
              <div className="flex items-center gap-4 mb-10">
                <span className="w-12 h-12 rounded-full bg-[#1b365d]/30 flex items-center justify-center text-[#aec7f7] font-bold font-sans">
                  01
                </span>
                <h2 className="font-serif font-normal text-3xl md:text-4xl text-[#d9e3f6]">Pre-flight</h2>
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
          </StaggerItem>

          {/* Post-flight */}
          <StaggerItem duration={1.4}>
            <div className="bg-[#091421] p-12 md:p-20 h-full">
              <div className="flex items-center gap-4 mb-10">
                <span className="w-12 h-12 rounded-full bg-[#15394d]/30 flex items-center justify-center text-[#a9cbe4] font-bold font-sans">
                  02
                </span>
                <h2 className="font-serif font-normal text-3xl md:text-4xl text-[#d9e3f6]">Post-flight</h2>
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
          </StaggerItem>
        </StaggerContainer>
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

        <StaggerContainer className="relative z-10 max-w-3xl" staggerDelay={0.5} viewportMargin="-25%">
          <StaggerItem duration={1.6}>
            <h2 className="font-serif font-normal text-5xl md:text-7xl mb-8 text-[#d9e3f6]">The Go/No-Go Culture</h2>
          </StaggerItem>
          <StaggerItem duration={1.6}>
            <p className="font-sans text-xl text-[#d9e3f6] mb-10 leading-relaxed italic">
              &ldquo;A superior pilot uses their superior judgment to avoid situations which require the use of their superior skill.&rdquo;
            </p>
          </StaggerItem>
          <StaggerItem duration={1.6}>
            <p className="text-[#c4c6cf] text-lg font-sans mb-12">
              OZ Rent A Plane maintains a strict zero-penalty rescheduling policy for weather-related cancellations. If the conditions don&apos;t look right, we support your decision to stay on the ground.
            </p>
          </StaggerItem>
          <StaggerItem duration={1.6}>
            <div className="inline-flex items-center gap-2 text-[#aec7f7] font-sans uppercase tracking-widest text-sm border-b border-[#aec7f7] pb-1 cursor-pointer hover:text-white transition-colors">
              Read Our Weather Policy
            </div>
          </StaggerItem>
        </StaggerContainer>
      </section>

      {/* ═══ Section 8: Type Familiarisation ══════════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-[#091421]">
        <StaggerContainer className="bg-[#16202e] p-12 md:p-24 rounded-lg flex flex-col md:flex-row gap-16 items-center" viewportMargin="-25%">

          {/* Text */}
          <StaggerItem duration={1.6} className="flex-1 w-full">
            <h2 className="font-serif font-normal text-4xl mb-8 text-[#d9e3f6]">Type Familiarisation</h2>
            <p className="text-[#c4c6cf] text-lg mb-8 font-sans leading-relaxed">
              Even for highly experienced pilots, every cockpit is a unique ecosystem. Our mandatory checkouts aren&apos;t just about &lsquo;flying the plane&rsquo;—they are about mastering the specific avionics, emergency procedures, and operational nuances of the OZ fleet.
            </p>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h6 className="font-bold text-[#aec7f7] mb-2 uppercase text-xs tracking-widest font-sans">Typical Duration</h6>
                <p className="font-serif font-normal text-2xl text-[#d9e3f6]">1.5 – 3 Hours</p>
              </div>
              <div>
                <h6 className="font-bold text-[#aec7f7] mb-2 uppercase text-xs tracking-widest font-sans">Validity</h6>
                <p className="font-serif font-normal text-2xl text-[#d9e3f6]">90 Days Recency</p>
              </div>
            </div>
          </StaggerItem>

          {/* Cockpit image */}
          <StaggerItem duration={1.6} className="flex-1 w-full relative z-10">
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
          </StaggerItem>
        </StaggerContainer>
      </section>

      {/* ═══ Section 9: Safety FAQ ════════════════════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-[#050f1b]">
        <div className="max-w-4xl mx-auto">
          <StaggerContainer className="mb-16 text-center" viewportMargin="-20%">
            <StaggerItem duration={1.4}>
              <h2 className="font-serif font-normal text-4xl text-[#d9e3f6]">Safety Questions</h2>
            </StaggerItem>
          </StaggerContainer>

          <StaggerContainer className="space-y-1" staggerDelay={0.3} viewportMargin="-20%">
            {/* First FAQ — open with answer */}
            <StaggerItem duration={1.2}>
              <div className="bg-[#091421] p-8">
                <div className="flex justify-between items-center cursor-pointer">
                  <h4 className="font-serif font-normal text-xl text-[#d9e3f6]">How is aircraft maintenance tracked?</h4>
                  <Icon name="expand_more" className="text-[#aec7f7]" />
                </div>
                <div className="mt-4 text-[#c4c6cf] text-sm leading-relaxed max-w-3xl">
                  We use a digital maintenance logbook accessible to all pilots during the pre-flight phase. This ensures you have a live view of the aircraft&apos;s airworthiness status and engine hours at all times.
                </div>
              </div>
            </StaggerItem>

            {[
              'What happens if I encounter a mechanical issue away from base?',
              'Do you allow flight into instrument meteorological conditions (IMC)?',
              'What is the insurance coverage for member pilots?',
            ].map(q => (
              <StaggerItem key={q} duration={1.2}>
                <div className="bg-[#091421] p-8">
                  <div className="flex justify-between items-center cursor-pointer">
                    <h4 className="font-serif font-normal text-xl text-[#d9e3f6]">{q}</h4>
                    <Icon name="expand_more" className="text-[#aec7f7]" />
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ═══ Section 10: Final CTA ════════════════════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 text-center bg-[#091421]" id="contact">
        <div className="max-w-2xl mx-auto">
          <StaggerContainer staggerDelay={0.3} viewportMargin="-25%">
            <StaggerItem duration={1.4}>
              <h2 className="font-serif font-normal text-4xl md:text-6xl mb-8 text-[#d9e3f6]">Ready to Apply for Access?</h2>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="text-[#c4c6cf] text-lg mb-12 font-sans">
                Join a community of disciplined aviators who value safety as much as the freedom of flight.
              </p>
            </StaggerItem>
          </StaggerContainer>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-4">
            <FadeUp delay={0.8} duration={1.4}>
              <a
                href="/pilotRequirements"
                className="inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] px-8 py-4 rounded-md font-sans font-bold uppercase tracking-widest text-sm shadow-2xl shadow-[#aec7f7]/20 transition-all active:scale-95 hover:brightness-110"
              >
                View Pilot Requirements
              </a>
            </FadeUp>
            <FadeUp delay={1.1} duration={1.4}>
              <a
                href="#contact"
                className="inline-block bg-[#212b38] text-[#d9e3f6] px-8 py-4 rounded-md font-sans font-bold uppercase tracking-widest text-sm active:scale-95 transition-all"
              >
                Contact Support
              </a>
            </FadeUp>
          </div>
        </div>
      </section>

    </main>
  )
}
