'use client'

import React, { useState, useRef, useEffect } from 'react'
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/MotionPresets'

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface FaqItem {
  q: string
  a: string
}

interface FaqCategory {
  id: string
  number: string
  title: string
  items: FaqItem[]
}

/* ─── FAQ data ────────────────────────────────────────────────────────────── */

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: 'eligibility',
    number: '01',
    title: 'Pilot Eligibility',
    items: [
      {
        q: 'What licences are required to rent with OZRentAPlane?',
        a: 'We require a minimum of a Private Pilot Licence (PPL) with a current medical certificate and a minimum of 200 total flight hours. Specific airframes may require additional type ratings or endorsements.',
      },
      {
        q: 'Do you accept international flight licences?',
        a: 'Yes — ICAO-compliant international licences are accepted for recreational VFR operations. Licence holders must additionally hold a current CASA-recognised medical. We recommend contacting our team prior to booking to confirm your specific credentials.',
      },
      {
        q: 'Is there a minimum age requirement for pilots?',
        a: 'Pilots must be a minimum of 17 years of age to operate solo and hold a valid student pilot certificate for supervised flights. For unrestricted solo hire, the minimum age is 18 with a valid PPL.',
      },
    ],
  },
  {
    id: 'approval',
    number: '02',
    title: 'Approval Process',
    items: [
      {
        q: 'How long does the initial vetting take?',
        a: 'Our flight safety team typically completes credential verification within 24 hours of receiving all required documents. During high-demand periods, allow up to 48 hours. You will receive a confirmation email at each stage of the review.',
      },
      {
        q: 'What documents do I need for the check-ride?',
        a: 'You will need your pilot licence, current medical certificate, logbook (digital or physical), government-issued photo ID, and proof of insurance. Ensure all documents are digitally uploaded to your pilot portal prior to the check-ride date.',
      },
      {
        q: 'Can I expedite my approval?',
        a: 'Priority queue placement is available for returning members and for bookings with lead times under 72 hours. Contact our Flight Ops team directly and we will endeavour to fast-track your review where operationally feasible.',
      },
    ],
  },
  {
    id: 'booking',
    number: '03',
    title: 'Booking & Availability',
    items: [
      {
        q: 'How do I request a booking?',
        a: 'Once your credentials are approved, select your aircraft and mission date from the booking portal. A $100 advance deposit is required to lock your flight window. Final balance is settled automatically on landing via our digital settlement system.',
      },
      {
        q: 'What is the cancellation policy?',
        a: 'Cancellations made more than 48 hours before departure receive a full refund of the deposit. Cancellations within 48 hours forfeit the deposit unless the cancellation is weather-initiated by our operations team, in which case a full refund is issued within 24 hours.',
      },
      {
        q: 'How far in advance can I book?',
        a: 'Bookings open 30 days in advance for standard members and 60 days for priority members. Same-day availability is occasionally offered when the fleet schedule permits — contact our team for late availability.',
      },
    ],
  },
  {
    id: 'pricing',
    number: '04',
    title: 'Pricing',
    items: [
      {
        q: 'How is the final rental cost calculated?',
        a: 'Pricing is based on Hobbs time — the actual hours logged on the aircraft\'s engine meter. You submit the Hobbs-in and Hobbs-out readings via the app immediately after landing. Our system calculates the final charge and issues your invoice within minutes.',
      },
      {
        q: 'What does the $100 advance deposit cover?',
        a: 'The advance deposit is a security commitment that reserves your flight window and initiates the dispatch sequence. It is deducted from your final invoice. If we are unable to confirm your flight due to weather or maintenance, the deposit is returned in full within 24 hours.',
      },
      {
        q: 'Are fuel costs included in the hourly rate?',
        a: 'Fuel is not included in the base hourly rate. You are responsible for refuelling the aircraft to the level at which it was dispatched. Fuel receipts are submitted through the app and reconciled against your final invoice.',
      },
    ],
  },
  {
    id: 'safety',
    number: '05',
    title: 'Safety & Insurance',
    items: [
      {
        q: 'What insurance do I need to provide?',
        a: 'Pilots must hold current hull and liability insurance at the time of dispatch. Minimum liability coverage is $1,000,000 AUD. Proof of insurance must be uploaded to your portal and remain valid for the full duration of your booking.',
      },
      {
        q: 'How are aircraft maintained?',
        a: 'All aircraft on the OZRentAPlane fleet adhere strictly to CASA-mandated maintenance schedules. Each aircraft undergoes pre-flight airworthiness checks before every dispatch. Maintenance logs are available on request through your pilot portal.',
      },
    ],
  },
  {
    id: 'aircraft',
    number: '06',
    title: 'Aircraft',
    items: [
      {
        q: 'What types of aircraft are available for hire?',
        a: 'Our current fleet includes the Cessna 172 (multiple variants), Cirrus SR22, and Piper Archer. Fleet availability varies by location and season. Full aircraft specifications, avionics manifests, and performance data are accessible through your dispatch pack.',
      },
      {
        q: 'What is included in the Dispatch Pack?',
        a: 'Your digital Dispatch Pack includes weight and balance tools, fuel planning worksheets, tail-specific avionics manuals, METAR/TAF integration, and your personalised flight briefing summary. It is available 12 hours before your scheduled departure.',
      },
    ],
  },
]

/* ─── Accordion Item ──────────────────────────────────────────────────────── */

function AccordionItem({ item, defaultOpen = false }: { item: FaqItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className="overflow-hidden transition-all duration-300"
      style={{
        background: '#121c29',
        borderRadius: '6px',
      }}
    >
      <button
        className="w-full flex items-center justify-between p-7 text-left transition-colors duration-200"
        style={{ background: open ? '#16202e' : 'transparent' }}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span
          className="font-sans font-medium text-[1rem] md:text-[1.05rem] pr-6"
          style={{ color: '#d9e3f6' }}
        >
          {item.q}
        </span>
        <span
          className="material-symbols-outlined shrink-0 transition-transform duration-300"
          style={{
            color: '#aec7f7',
            fontSize: '20px',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div
          className="px-7 pb-7 text-[0.9rem] leading-relaxed"
          style={{ color: '#94a3b8' }}
        >
          {item.a}
        </div>
      )}
    </div>
  )
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function FaqPage() {
  const [activeCategory, setActiveCategory] = useState('eligibility')
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const rightPaneRef = useRef<HTMLDivElement>(null)

  /**
   * Suppress scroll-listener updates while a programmatic scroll is in flight
   * so the clicked nav item stays highlighted during the animation.
   */
  const isProgrammaticScroll = useRef(false)
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ─────────────────────────────────────────────────────────────────────────
     scrollspy — fires on every manual scroll of the right pane.

     KEY FIX: we use getBoundingClientRect() instead of el.offsetTop.
     el.offsetTop is measured from the nearest *positioned* ancestor, which is
     NOT the right-pane div (it has no position style), so it included the full
     hero-section height and caused massive overshoot in both click targeting
     and active-section detection.

     getBoundingClientRect() returns live viewport-relative coordinates.
     Subtracting pane.getBoundingClientRect().top converts that to a position
     relative to the visible top of the scroll container — exactly what we need.

     Reading line = 30 % down from the visible top of the pane.
     A section becomes active when its top edge has crossed that line.
     We walk every section and take the LAST qualifying one, so the active
     section is always the one whose heading most recently passed the line.
  ───────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const pane = rightPaneRef.current
    if (!pane) return

    const onScroll = () => {
      if (isProgrammaticScroll.current) return

      const paneTop  = pane.getBoundingClientRect().top
      const readLine = pane.clientHeight * 0.30   // 30 % down from pane top

      let activeId = FAQ_CATEGORIES[0].id

      for (const cat of FAQ_CATEGORIES) {
        const el = sectionRefs.current[cat.id]
        if (!el) continue
        // Distance from pane's visible top edge to the section's top edge.
        // Positive  → section is below the visible top (not yet scrolled past).
        // Zero/neg  → section top has scrolled up past (or to) the pane top.
        const distFromPaneTop = el.getBoundingClientRect().top - paneTop
        if (distFromPaneTop <= readLine) {
          activeId = cat.id
        }
      }

      setActiveCategory(activeId)
    }

    pane.addEventListener('scroll', onScroll, { passive: true })
    return () => pane.removeEventListener('scroll', onScroll)
  }, [])

  /* ─────────────────────────────────────────────────────────────────────────
     scrollTo — click handler.

     KEY FIX: target = el.getBoundingClientRect().top          (px from viewport top)
                      - pane.getBoundingClientRect().top        (subtract pane origin)
                      + pane.scrollTop                          (add current scroll)
                      - BREATHING_ROOM                          (a little padding)

     This formula is invariant to the DOM nesting / offsetParent chain because
     it works purely from live viewport coordinates, not the offsetTop chain.
  ───────────────────────────────────────────────────────────────────────── */
  const BREATHING = 28   // px gap above the section heading after scroll

  const scrollTo = (id: string) => {
    const pane = rightPaneRef.current
    const el   = sectionRefs.current[id]
    if (!pane || !el) return

    // Immediately highlight the clicked topic
    setActiveCategory(id)

    // Lock out the scroll listener so it cannot override our highlighted state
    isProgrammaticScroll.current = true
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current)

    // Compute the exact target scroll position relative to the pane
    const target =
      el.getBoundingClientRect().top    // element top in viewport
      - pane.getBoundingClientRect().top // subtract pane's visible top in viewport
      + pane.scrollTop                   // add current pane scroll offset
      - BREATHING                        // breathing room above heading

    pane.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })

    // Release the lock after smooth scroll settles (~800 ms is safe)
    programmaticScrollTimer.current = setTimeout(() => {
      isProgrammaticScroll.current = false
    }, 800)
  }

  return (
    <main
      className="bg-[#091421] text-[#d9e3f6] font-sans overflow-x-hidden"
      style={{ paddingTop: '62px' }}
    >

      {/* ════════════════════════════════════════════════════════════
          Section 1 — Hero
      ════════════════════════════════════════════════════════════ */}
      <section className="relative px-6 md:px-12 lg:px-20 overflow-hidden min-h-[500px] md:min-h-[750px] flex items-center">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/Pilot&aircraftTwilight.webp")', opacity: 0.75 }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#040f1e]/95 via-[#040f1e]/55 to-[#040f1e]/10" />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#091421]/25 via-transparent to-[#091421]/35" />

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-16">
          <StaggerContainer className="max-w-xl" staggerDelay={0.2}>
            <StaggerItem duration={1.4}>
              <h1 className="font-serif text-5xl md:text-7xl font-normal leading-[1.05] tracking-tight mb-6 text-white">
                Everything <br />
                You Need
              </h1>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[1rem] leading-relaxed text-[#c4c6cf] mb-10 max-w-md">
                Preparation is the cornerstone of exceptional aviation. From pilot
                eligibility to advanced safety protocols, we have curated the
                essential knowledge for your journey with OZRentAPlane.
              </p>
            </StaggerItem>
          </StaggerContainer>
          <FadeUp delay={1.2} duration={1.4}>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="/pilotRequirements"
                className="inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] rounded-md font-sans font-bold tracking-widest uppercase text-[0.8rem] px-8 py-4 shadow-2xl shadow-[#aec7f7]/20 transition-all active:scale-95 hover:brightness-110"
              >
                Pilot Requirements
              </a>
              <a
                href="#booking"
                className="font-sans font-bold text-[0.8rem] tracking-widest uppercase px-8 py-4 rounded border border-white/20 text-[#c4c6cf] hover:bg-white/5 transition-colors"
              >
                Book a Flight
              </a>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          Section 2 — FAQ
          Layout: the section itself is a flex column that fills the
          viewport height (minus the navbar). The heading sits at the
          top; the split pane below uses flex-1 + min-h-0 so it fills
          the remaining space. Only the RIGHT column is scrollable —
          the left nav never moves.
      ════════════════════════════════════════════════════════════ */}
      <section
        className="flex flex-col px-6 md:px-12 lg:px-20"
        style={{ height: 'calc(100vh - 62px)' }}
      >
        <div className="max-w-7xl mx-auto w-full flex flex-col flex-1 min-h-0 py-14">

          {/* ── Section heading — centred ──────────────────────── */}
          <div className="text-center mb-10 shrink-0">
            <span
              className="block font-sans font-bold text-[10px] tracking-[0.3em] uppercase mb-4"
              style={{ color: '#aec7f7' }}
            >
              Pilot Briefing
            </span>
            <h2
              className="font-serif text-[2.2rem] sm:text-[2.8rem] md:text-[3.2rem] font-normal leading-tight"
              style={{ color: '#d9e3f6' }}
            >
              Frequently Asked{' '}
              <span className="italic">Questions</span>
            </h2>
          </div>

          {/* Mobile: horizontal scrollable pill strip */}
          <div
            className="lg:hidden flex gap-2 mb-8 overflow-x-auto pb-2 shrink-0"
            style={{ scrollbarWidth: 'none' }}
          >
            {FAQ_CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => scrollTo(cat.id)}
                  className="font-sans font-semibold text-[11px] tracking-[0.12em] uppercase transition-all duration-200 shrink-0 px-4 py-2 rounded-full"
                  style={{
                    color: isActive ? '#0c1a2e' : '#94a3b8',
                    background: isActive ? 'linear-gradient(135deg, #aec7f7, #608bca)' : 'transparent',
                    border: isActive ? 'none' : '1px solid rgba(174,199,247,0.22)',
                    cursor: 'pointer',
                  }}
                >
                  {cat.title}
                </button>
              )
            })}
          </div>

          {/*
            Split pane — flex-1 + min-h-0 fills all remaining vertical space.
            min-h-0 is essential: without it, flex children default to
            min-height: auto and overflow instead of shrinking.
          */}
          <div className="flex gap-16 flex-1 min-h-0">

            {/* ── Left nav — static, never scrolls ─────────────── */}
            <aside className="hidden lg:flex flex-col gap-2 w-56 shrink-0 pt-2">
              {FAQ_CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => scrollTo(cat.id)}
                    className="w-full text-left font-sans font-semibold text-[11.5px] tracking-[0.1em] uppercase transition-all duration-200 px-4 py-3 rounded-lg"
                    style={{
                      color: isActive ? '#0c1a2e' : '#94a3b8',
                      background: isActive
                        ? 'linear-gradient(135deg, #aec7f7, #608bca)'
                        : 'transparent',
                      border: isActive ? 'none' : '1px solid rgba(174,199,247,0.16)',
                      cursor: 'pointer',
                      boxShadow: isActive ? '0 4px 14px rgba(174,199,247,0.18)' : 'none',
                    }}
                  >
                    {cat.title}
                  </button>
                )
              })}
            </aside>

            {/* ── Right pane — the ONLY thing that scrolls ─────── */}
            <div
              ref={rightPaneRef}
              className="flex-1 min-w-0 overflow-y-auto"
              style={{ scrollbarWidth: 'none' }}
            >
              <div className="space-y-20 pb-16">
              {FAQ_CATEGORIES.map((cat, ci) => (
                <div
                  key={cat.id}
                  id={cat.id}
                  ref={(el) => { sectionRefs.current[cat.id] = el }}
                >
                  {/* Category heading */}
                  <div className="flex items-baseline gap-4 mb-8">
                    <span
                      className="font-sans font-bold text-[11px] tracking-[0.15em]"
                      style={{ color: 'rgba(174,199,247,0.45)' }}
                    >
                      {cat.number}
                    </span>
                    <h3
                      className="font-serif text-[1.9rem] md:text-[2.2rem]"
                      style={{ color: '#d9e3f6' }}
                    >
                      {cat.title}
                    </h3>
                  </div>

                  {/* Accordion items */}
                  <div className="space-y-3">
                    {cat.items.map((item, ii) => (
                      <AccordionItem
                        key={ii}
                        item={item}
                        defaultOpen={ci === 0 && ii === 0}
                      />
                    ))}
                  </div>
                </div>
              ))}
              </div>   {/* end space-y-20 pb-16 */}
            </div>     {/* end rightPaneRef */}

          </div>       {/* end split pane flex */}
        </div>         {/* end max-w-7xl flex col */}
      </section>

      {/* ════════════════════════════════════════════════════════════
          Section 4 — Pre-Flight Checklist
      ════════════════════════════════════════════════════════════ */}
      <section className="py-24" style={{ background: '#050f1b' }}>
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
          <div
            className="grid grid-cols-1 md:grid-cols-2 overflow-hidden rounded-xl border"
            style={{ borderColor: 'rgba(255,255,255,0.07)' }}
          >

            {/* Left — cockpit image */}
            <div className="relative min-h-[340px] md:min-h-[440px]">
              <img
                src="/Cockpit-twilight.webp"
                alt="Pilot performing pre-flight controls check in the cockpit"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ opacity: 0.88 }}
              />
              {/* Subtle overlay to match panel */}
              <div
                className="absolute inset-0"
                style={{ background: 'rgba(9,20,33,0.18)' }}
              />
            </div>

            {/* Right — checklist */}
            <div
              className="p-10 md:p-16 flex flex-col justify-center"
              style={{ background: '#16202e' }}
            >
              <h2
                className="font-serif text-[2rem] md:text-[2.4rem] leading-tight mb-10"
                style={{ color: '#d9e3f6' }}
              >
                The Essential{' '}
                <br />
                <span className="italic" style={{ color: '#aec7f7' }}>
                  Pre-Flight Checklist
                </span>
              </h2>

              <ul className="space-y-7">
                {[
                  {
                    n: '01',
                    title: 'Document Verification',
                    body: 'Ensure your pilot credentials and medical are digitally uploaded 24h prior.',
                  },
                  {
                    n: '02',
                    title: 'Weather Briefing',
                    body: 'Review real-time METAR and TAF reports via the OZRentAPlane pilot portal.',
                  },
                  {
                    n: '03',
                    title: 'Weight & Balance',
                    body: 'Submit your final flight manifest for centre-of-gravity confirmation.',
                  },
                ].map((step) => (
                  <li key={step.n} className="flex gap-5">
                    <span
                      className="font-sans font-bold text-[0.85rem] shrink-0"
                      style={{ color: '#aec7f7', minWidth: '24px', paddingTop: '2px' }}
                    >
                      {step.n}
                    </span>
                    <div>
                      <p
                        className="font-sans font-semibold text-[0.95rem] mb-1"
                        style={{ color: '#d9e3f6' }}
                      >
                        {step.title}
                      </p>
                      <p
                        className="text-[0.85rem] leading-relaxed"
                        style={{ color: '#94a3b8' }}
                      >
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          Section 5 — Support CTA
      ════════════════════════════════════════════════════════════ */}
      <section className="relative py-40 px-6 text-center overflow-hidden">
        {/* Subtle gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(27,54,93,0.25) 0%, transparent 70%)',
          }}
        />

        <div className="relative z-10 max-w-2xl mx-auto">
          <h2
            className="font-serif text-[2.8rem] sm:text-[3.6rem] md:text-[4.4rem] leading-tight mb-6"
            style={{ color: '#d9e3f6' }}
          >
            Still need help{' '}
            <br />
            <span className="italic" style={{ color: '#aec7f7' }}>
              before you fly?
            </span>
          </h2>

          <p
            className="text-[0.95rem] md:text-[1rem] leading-relaxed mb-12"
            style={{ color: '#94a3b8', maxWidth: '420px', margin: '0 auto 3rem' }}
          >
            Our flight operations team is available 24/7 to assist with
            technical queries or booking logistics.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:ops@ozrentaplane.com.au"
              className="inline-flex items-center justify-center font-sans font-bold text-[11px] tracking-[0.2em] uppercase px-10 py-4 rounded-full transition-all duration-300 hover:brightness-110 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #aec7f7, #608bca)',
                color: '#0c1a2e',
                boxShadow: '0 8px 28px rgba(174,199,247,0.2)',
              }}
            >
              Contact Flight Ops
            </a>
            <a
              href="/pilotRequirements"
              className="inline-flex items-center justify-center font-sans font-bold text-[11px] tracking-[0.2em] uppercase px-10 py-4 rounded-full border transition-all duration-300 hover:bg-white/5 active:scale-95"
              style={{
                borderColor: 'rgba(255,255,255,0.13)',
                color: '#d9e3f6',
                background: 'rgba(22,32,46,0.5)',
                backdropFilter: 'blur(10px)',
              }}
            >
              View Requirements
            </a>
          </div>
        </div>
      </section>

    </main>
  )
}
