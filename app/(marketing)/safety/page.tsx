import React from 'react'
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/MotionPresets'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'
import AtmoClouds from '@/components/AtmoClouds'

// ─── Tiny helper: Material Symbol icon ───────────────────────────────────────
function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

export default function SafetyPage() {
  return (
    <main className="bg-mkt-main text-deep-ink font-sans overflow-x-hidden">

      {/* ═══ Section 1: Hero ═══════════════════════════════════════════════════ */}
      <section className="hero-fade-to-main relative px-6 md:px-12 lg:px-20 overflow-hidden min-h-[500px] md:min-h-[750px] flex items-center">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-75"
          style={{ backgroundImage: 'url("/CessnaHangar.webp")' }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#040f1e]/70 via-[#040f1e]/30 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-px z-[20] h-[45%] bg-gradient-to-b from-transparent via-[#061524]/75 to-[#061524]" />

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-16">
          <StaggerContainer className="max-w-xl" staggerDelay={0.25}>
            <StaggerItem duration={1.2}>
              <p className="mb-4 font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-runway-amber">Flight Safety</p>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <h1 className="font-serif text-5xl md:text-7xl font-normal leading-[1.05] tracking-tight mb-6 text-white">
                Safety Built Into <br />
                Every Flight
              </h1>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[1rem] leading-relaxed text-white/80 mb-10 max-w-md">
                Verified access and operational discipline aren&apos;t just protocols—they are the bedrock of our aviation ecosystem. We manage risk so you can manage the mission.
              </p>
            </StaggerItem>
          </StaggerContainer>
          
        </div>
      </section>

      {/* ═══ Section 2: Safety Philosophy ═════════════════════════════════════ */}
      <section className="-mt-12 pt-12 pb-28 px-8 md:px-24 bg-mkt-main relative z-20 overflow-hidden">
        <AtmoClouds shapes={['A', 'D']} extraDarkCloud />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-0"
          style={{ top: '60%', height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(26,79,214,0.10) 15%, rgba(26,79,214,0.10) 85%, transparent 100%)' }}
        />
        <div className="relative z-10 mx-auto max-w-7xl">
          <StaggerContainer className="mb-10" viewportMargin="-20%">
            <StaggerItem duration={1.4}>
              <h2 className="font-serif font-normal text-4xl md:text-5xl text-deep-ink mb-4">Our Philosophy</h2>
              <div className="h-[3px] w-[40px] bg-runway-amber mb-6" />
            </StaggerItem>
          </StaggerContainer>
          <StaggerContainer className="grid grid-cols-1 gap-0 md:grid-cols-2 xl:grid-cols-4" staggerDelay={0.2} viewportMargin="-25%">
            {[
              { icon: 'verified_user', title: 'Qualified pilots only', body: 'Rigorous vetting ensures only those with proven proficiency handle our aircraft.' },
              { icon: 'build_circle', title: 'Maintained with care', body: 'Aircraft are kept in premium condition by certified technicians beyond minimum requirements.' },
              { icon: 'rule', title: 'Clear operating standards', body: 'Standardized SOPs remove ambiguity and ensure consistent flight deck outcomes.' },
              { icon: 'schedule', title: 'Safety before schedule', body: 'We empower every pilot to make the conservative call, regardless of timing pressures.' },
            ].map(({ icon, title, body }, idx) => (
              <StaggerItem key={title} duration={1.3}>
                <div className={`h-full p-8 ${idx < 3 ? 'xl:border-r xl:border-open-ceiling' : ''} ${idx % 2 === 0 ? 'md:border-r md:border-open-ceiling xl:border-r' : ''}`}>
                  <Icon name={icon} className="!text-[40px] text-runway-amber" />
                  <h3 className="mt-3 font-sans text-[16px] font-semibold text-deep-ink">{title}</h3>
                  <p className="mt-2 font-sans text-[13px] leading-[1.6] text-muted-ink">{body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ═══ Section 3: Pilot Approval ═══════════════════════════════════════ */}
      <section className="relative overflow-hidden py-24 px-8 md:px-24 bg-mkt-alt">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-0"
          style={{ top: '55%', height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(26,79,214,0.10) 15%, rgba(26,79,214,0.10) 85%, transparent 100%)' }}
        />
        <div className="relative z-10">
        <StaggerContainer className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8" viewportMargin="-20%">
          <div>
            <StaggerItem duration={1.4}>
              <h2 className="font-serif font-normal text-4xl md:text-6xl text-deep-ink mb-4">Pilot Approval Standards</h2>
              <div className="h-[2px] w-[52px] bg-runway-amber mb-4" />
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="text-muted-ink max-w-xl font-sans">The standard for flying an OZ aircraft is deliberate and uncompromising.</p>
            </StaggerItem>
          </div>
          <div className="h-px bg-[#44474e]/20 flex-grow hidden md:block mx-12 mb-6" />
        </StaggerContainer>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1 pb-10 border-b-[1.5px] border-open-ceiling" staggerDelay={0.5} viewportMargin="-25%">
          {[
            {
              phase: 'Phase 01',
              title: 'Licence Verification',
              body: 'Validation of current RPL, PPL, CPL, and ATPL credentials and medical certifications directly with regulatory databases.',
            },
            {
              phase: 'Phase 02',
              title: 'Document Review',
              body: 'We review your pilot licence and medical records as part of the document verification process.',
            },
            {
              phase: 'Phase 03',
              title: 'Experience Suitability',
              body: 'Evaluating specific flight hours in type and complex environment operations to match our fleet profile.',
            },
            {
              phase: 'Phase 04',
              title: 'Checkout Induction',
              body: 'A mandatory flight to verify handling and system knowledge.',
            },
          ].map(({ phase, title, body }) => (
            <StaggerItem key={phase} duration={1.6}>
              <div className="bg-mkt-lift p-8 border-l-2 border-[rgba(224,177,59,0.35)] h-full">
                <span className="text-xs font-sans uppercase tracking-[0.2em] text-runway-amber/90 mb-6 block">{phase}</span>
                <h4 className="font-serif font-normal text-2xl mb-4 text-deep-ink">{title}</h4>
                <p className="text-sm text-muted-ink font-sans leading-relaxed">{body}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
        </div>
      </section>

      {/* ═══ Section 4: Maintenance Standards ═══════════════════════════════ */}
      <section className="py-24 px-8 md:px-24">
        <div className="relative overflow-hidden rounded-2xl">
          <img className="absolute inset-0 h-full w-full object-cover" src="/Close-upNose.webp" alt="Aircraft maintenance close-up" />
          <div className="absolute inset-0 bg-[rgba(13,27,62,0.72)]" />
          <StaggerContainer staggerDelay={0.4} viewportMargin="-30%" className="relative z-10 rounded-2xl p-8 md:p-10">
            <StaggerItem duration={1.4}>
              <h2 className="font-serif font-normal text-4xl md:text-5xl text-white mb-8">Maintenance Standards</h2>
              <div className="h-[2px] w-[48px] bg-runway-amber mb-8" />
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
                  body: 'No aircraft leaves the maintenance hangar without a thorough inspection by a qualified aviation mechanic.',
                },
                {
                  icon: 'monitoring',
                  title: 'Health Monitoring',
                  body: 'Real-time data logging helps us monitor aircraft usage and identify maintenance needs early.',
                },
              ].map(({ icon, title, body }) => (
                <StaggerItem key={title} duration={1.4}>
                  <div className="flex gap-6">
                    <span className="mt-1 flex h-4 w-4 items-center justify-center rounded-full bg-runway-amber shrink-0">
                      <Icon name={icon} className="text-deep-ink !text-[12px]" />
                    </span>
                    <div>
                      <h5 className="text-xl font-serif font-normal mb-2 text-white">{title}</h5>
                      <p className="text-sm text-white/75">{body}</p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </div>
          </StaggerContainer>
        </div>
      </section>

      {/* ═══ Section 5: Operational Safeguards ════════════════════════════════ */}
      <section className="relative overflow-hidden py-32 px-8 md:px-24 bg-mkt-main">
        <AtmoClouds shapes={['C']} />
        <div className="relative z-10">
        <StaggerContainer className="max-w-4xl mx-auto text-center mb-20" viewportMargin="-20%">
          <StaggerItem duration={1.4}>
            <h2 className="font-serif font-normal text-4xl md:text-6xl mb-6 text-deep-ink">Operational Safeguards</h2>
            <div className="mx-auto h-[2px] w-[48px] bg-runway-amber mb-6" />
          </StaggerItem>
          <StaggerItem duration={1.4}>
            <p className="text-muted-ink font-sans text-lg">We provide the structure; you provide the command.</p>
          </StaggerItem>
        </StaggerContainer>

        <StaggerContainer className="space-y-4" staggerDelay={0.4} viewportMargin="-20%">
          <StaggerItem duration={1.4}>
            <div className="grid grid-cols-1 md:grid-cols-12 items-center bg-mkt-lift border border-[rgba(151,177,215,0.14)] hover:border-[rgba(224,177,59,0.35)] p-8 rounded-lg transition-colors">
              <div className="md:col-span-1 text-clearsky">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(224,177,59,0.35)] bg-[rgba(8,27,52,0.3)]">
                  <Icon name="shield" className="!text-xl text-brand-blue" />
                </span>
              </div>
              <div className="md:col-span-3">
                <h4 className="font-serif font-normal text-xl text-deep-ink">Booking Controls</h4>
              </div>
              <div className="md:col-span-8">
                <p className="text-muted-ink text-sm font-sans">
                  Automated logic cross-references pilot currency and aircraft status at the moment of booking, preventing illegal or unsafe pairings.
                </p>
              </div>
            </div>
          </StaggerItem>

          <StaggerItem duration={1.4}>
            <div className="grid grid-cols-1 md:grid-cols-12 items-center bg-mkt-lift border border-[rgba(151,177,215,0.14)] hover:border-[rgba(224,177,59,0.35)] p-8 rounded-lg transition-colors">
              <div className="md:col-span-1 text-clearsky">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(224,177,59,0.35)] bg-[rgba(8,27,52,0.3)]">
                  <Icon name="psychology" className="!text-xl text-brand-blue" />
                </span>
              </div>
              <div className="md:col-span-3">
                <h4 className="font-serif font-normal text-xl text-deep-ink">Decision Support</h4>
              </div>
              <div className="md:col-span-8">
                <p className="text-muted-ink text-sm font-sans">
                  Conservative decision-making is reinforced through integrated risk assessment tools provided to every member pilot.
                </p>
              </div>
            </div>
          </StaggerItem>
        </StaggerContainer>
        </div>
      </section>

      {/* ═══ Section 6: Pre-flight / Post-flight ══════════════════════════════ */}
      <section className="py-32 px-8 md:px-24 bg-mkt-alt">
        <StaggerContainer className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-0 items-stretch" staggerDelay={0.4} viewportMargin="-20%">

          {/* Pre-flight */}
          <StaggerItem duration={1.4}>
            <div className="bg-mkt-main p-12 md:p-20 h-full">
              <div className="flex items-center gap-4 mb-10">
                <span className="w-12 h-12 rounded-full bg-[rgba(224,177,59,0.12)] border border-[rgba(224,177,59,0.35)] flex items-center justify-center text-runway-amber font-bold font-sans">
                  01
                </span>
                <h2 className="font-serif font-normal text-3xl md:text-4xl text-deep-ink">Pre-flight</h2>
              </div>
              <ul className="space-y-6">
                {[
                  'Comprehensive external walkaround inspection',
                  'Fuel quantity and quality verification (Sumped)',
                  'Weight and balance calculation for actual load',
                  'Weather briefing and alternate selection',
                ].map(item => (
                  <li key={item} className="flex gap-4">
                    <Icon name="check_circle" className="text-runway-amber shrink-0" />
                    <span className="text-muted-ink">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </StaggerItem>

          <div className="hidden lg:block w-px bg-open-ceiling self-stretch mx-4" />

          {/* Post-flight */}
          <StaggerItem duration={1.4}>
            <div className="bg-mkt-main p-12 md:p-20 h-full lg:border-l lg:border-open-ceiling">
              <div className="flex items-center gap-4 mb-10">
                <span className="w-12 h-12 rounded-full bg-[rgba(224,177,59,0.12)] border border-[rgba(224,177,59,0.35)] flex items-center justify-center text-runway-amber font-bold font-sans">
                  02
                </span>
                <h2 className="font-serif font-normal text-3xl md:text-4xl text-deep-ink">Post-flight</h2>
              </div>
              <ul className="space-y-6">
                {[
                  'Detailed flight log entry including Hobbs/Tach',
                  'Confirm VDO meter and air switch status',
                  "Reporting of any defects or 'squawks' immediately",
                  'Return the aircraft safely to the hangar.',
                  'Take all of your belongings.',
                ].map(item => (
                  <li key={item} className="flex gap-4">
                    <Icon name="radio_button_checked" className="text-runway-amber shrink-0" />
                    <span className="text-muted-ink">{item}</span>
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
          <div className="absolute inset-0 bg-gradient-to-b from-[#061524] via-transparent to-[#061524]" />
        </div>

        <StaggerContainer className="relative z-10 max-w-3xl" staggerDelay={0.5} viewportMargin="-25%">
          <StaggerItem duration={1.6}>
            <h2 className="font-serif font-normal text-5xl md:text-7xl mb-8 text-white">The Go/No-Go Culture</h2>
            <div className="mx-auto h-[2px] w-[48px] bg-runway-amber mb-8" />
          </StaggerItem>
          <StaggerItem duration={1.6}>
            <p className="font-sans text-xl text-white mb-10 leading-relaxed italic">
              &ldquo;A superior pilot uses their superior judgment to avoid situations which require the use of their superior skill.&rdquo;
            </p>
          </StaggerItem>
          <StaggerItem duration={1.6}>
            <p className="text-white/75 text-lg font-sans mb-12">
              OZ Rent A Plane maintains a strict zero-penalty rescheduling policy for weather-related cancellations. If the conditions don&apos;t look right, we support your decision to stay on the ground.
            </p>
          </StaggerItem>
        </StaggerContainer>
      </section>

      {/* ═══ Section 8: Type Familiarisation ══════════════════════════════════ */}
      <section className="relative overflow-hidden py-32 px-8 md:px-24 bg-mkt-main">
        <AtmoClouds direction="rtl" shapes={['B', 'E']} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-0"
          style={{ top: '60%', height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(26,79,214,0.10) 15%, rgba(26,79,214,0.10) 85%, transparent 100%)' }}
        />
        <div className="relative z-10">
        <StaggerContainer className="bg-mkt-lift border border-[rgba(151,177,215,0.14)] p-12 md:p-24 rounded-lg flex flex-col md:flex-row gap-16 items-center" viewportMargin="-25%">

          {/* Text */}
          <StaggerItem duration={1.6} className="flex-1 w-full">
            <h2 className="font-serif font-normal text-4xl mb-8 text-deep-ink">Type Familiarisation</h2>
            <div className="h-[2px] w-[48px] bg-runway-amber mb-8" />
            <p className="text-muted-ink text-lg mb-8 font-sans leading-relaxed">
              Even for highly experienced pilots, every cockpit is a unique ecosystem. Our mandatory checkouts aren&apos;t just about &lsquo;flying the plane&rsquo;—they are about mastering the specific avionics, emergency procedures, and operational nuances of the OZ fleet.
            </p>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h6 className="font-bold text-runway-amber mb-2 uppercase text-xs tracking-widest font-sans">Typical Duration</h6>
                <p className="font-serif font-normal text-2xl text-deep-ink">1.5 – 3 Hours</p>
              </div>
              <div>
                <h6 className="font-bold text-runway-amber mb-2 uppercase text-xs tracking-widest font-sans">Validity</h6>
                <p className="font-serif font-normal text-2xl text-deep-ink">90 Days Recency</p>
              </div>
            </div>
          </StaggerItem>

          {/* Cockpit image */}
          <StaggerItem duration={1.6} className="flex-1 w-full relative z-10">
            <div className="aspect-video bg-mkt-lift rounded overflow-hidden group relative">
              <img
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                src="/CockpitRunwayView.webp"
                alt="Cockpit view"
              />
              <div className="absolute inset-0 bg-mkt-main/40 flex items-center justify-center">
                <Icon name="play_circle" className="!text-6xl text-white opacity-80" />
              </div>
            </div>
          </StaggerItem>
        </StaggerContainer>
        </div>
      </section>

      {/* ═══ Section 9: Safety FAQ ════════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-32 px-8 md:px-24 bg-mkt-alt">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{ background: 'radial-gradient(ellipse 100% 90% at 50% 50%, transparent 45%, rgba(15,30,55,0.06) 100%)' }}
        />
        <div className="relative z-10 max-w-4xl mx-auto">
          <StaggerContainer className="mb-16 text-center" viewportMargin="-20%">
            <StaggerItem duration={1.4}>
              <h2 className="font-serif font-normal text-4xl text-deep-ink">Safety Questions</h2>
              <div className="mx-auto h-[2px] w-[48px] bg-runway-amber mt-4" />
            </StaggerItem>
          </StaggerContainer>

          <StaggerContainer className="space-y-1" staggerDelay={0.3} viewportMargin="-20%">
            {/* First FAQ — open with answer */}
            <StaggerItem duration={1.2}>
              <div className="bg-mkt-main p-8">
                <div className="flex justify-between items-center cursor-pointer">
                  <h4 className="font-serif font-normal text-xl text-deep-ink">How is aircraft maintenance tracked?</h4>
                  <Icon name="expand_more" className="text-runway-amber" />
                </div>
                <div className="mt-4 text-muted-ink text-sm leading-relaxed max-w-3xl">
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
                <div className="bg-mkt-main p-8">
                  <div className="flex justify-between items-center cursor-pointer">
                    <h4 className="font-serif font-normal text-xl text-deep-ink">{q}</h4>
                    <Icon name="expand_more" className="text-runway-amber" />
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      <PreFooterCTA
        heading="Ready to Apply for Access?"
        subtext="Join a community of disciplined aviators who value safety above all else."
        ctaLabel="View Pilot Requirements"
        ctaHref="/login"
      />

    </main>
  )
}
