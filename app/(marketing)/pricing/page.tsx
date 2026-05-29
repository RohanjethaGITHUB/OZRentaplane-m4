'use client'

import { useState } from 'react'
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/MotionPresets'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'

type FaqItemType = {
  question: string
  answer: string
}

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function FaqItem({ item }: { item: FaqItemType }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-xl border border-mkt-subtle bg-mkt-lift backdrop-blur-sm transition-all duration-300 hover:border-runway-amber/35">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left md:px-6"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`font-sans text-sm font-medium md:text-[0.96rem] ${open ? 'text-brand-blue' : 'text-deep-ink'}`}>{item.question}</span>
        <Icon
          name="add"
          className={`shrink-0 text-runway-amber transition-transform duration-300 ${open ? 'rotate-45' : 'rotate-0'}`}
        />
      </button>
      {open ? (
        <div className="border-t border-mkt-subtle px-5 py-4 font-sans text-sm leading-relaxed text-muted-ink md:px-6">
          {item.answer}
        </div>
      ) : null}
    </div>
  )
}

const HERO_CHIPS = ['Wet Hire', 'GST Included', '$25 Per Landing', 'Billed by VDO Hours']

const PRICING_TIERS = [
  { tier: 'Less than 10 VDO hours', rate: '$330', highlight: false },
  { tier: '10 to 24.9 VDO hours', rate: '$320', highlight: false },
  { tier: '25 to 49.9 VDO hours', rate: '$310', highlight: false },
  { tier: '50 to 99.9 VDO hours', rate: '$300', highlight: false },
  { tier: '100+ VDO hours', rate: '$290', highlight: true },
]

const WORKFLOW_STEPS = [
  { title: 'Reserve', body: 'Book your aircraft slot online', icon: 'event_available' },
  { title: 'Fly', body: 'Complete your flight', icon: 'flight_takeoff' },
  { title: 'Record VDO', body: 'Submit VDO meter hours', icon: 'timer' },
  { title: 'Apply Rate', body: 'Tiered rate plus landing fees', icon: 'calculate' },
  { title: 'Final Invoice', body: 'Transparent digital billing', icon: 'receipt_long' },
]

const MINIMUM_RULES = [
  { booked: '24 hrs booked', minimum: '4 VDO hrs minimum' },
  { booked: '36 hrs booked', minimum: '6 VDO hrs minimum' },
  { booked: '48 hrs booked', minimum: '8 VDO hrs minimum' },
  { booked: '72 hrs booked', minimum: '12 VDO hrs minimum' },
]

const INCLUDED_CARDS = [
  {
    icon: 'local_gas_station',
    title: 'Wet Hire',
    copy: 'Fuel is built into your hourly rate for simpler, more predictable pricing.',
  },
  {
    icon: 'receipt',
    title: 'GST Included',
    copy: 'All listed hourly rates include GST.',
  },
  {
    icon: 'flight_land',
    title: '$25 Per Landing',
    copy: 'A flat $25 charge applies per landing.',
  },
  {
    icon: 'speed',
    title: 'VDO-Based Billing',
    copy: 'Your flying time is measured using the aircraft’s VDO meter.',
  },
  {
    icon: 'post_add',
    title: 'Simple Post-Flight Invoicing',
    copy: 'Final charges are reviewed after your flight record is submitted.',
  },
  {
    icon: 'headphones',
    title: 'Spare Headsets Included for Free',
    copy: 'Additional headsets are available at no extra cost, making it easier to bring passengers along comfortably.',
  },
  {
    icon: 'garage',
    title: 'Easy hangar access',
    copy: 'Aircraft access is straightforward with sliding hangar doors and 24-hour hangar availability.',
  },
  {
    icon: 'health_and_safety',
    title: 'Life Vests Included at No Extra Cost',
    copy: 'Life vests are provided for suitable flights at no extra charge, supporting safer planning for coastal or over-water routes.',
  },
]

const FAQ_ITEMS: FaqItemType[] = [
  {
    question: 'How are VDO hours calculated?',
    answer:
      'VDO hours are based on the aircraft’s VDO meter reading. Final standard hire charges are calculated from the VDO hours recorded for the booking.',
  },
  {
    question: 'Are these fixed packages?',
    answer:
      'No. These are flexible hourly rate tiers. Your hourly rate depends on the total VDO hours flown for that booking.',
  },
  {
    question: 'Is this Wet Hire pricing?',
    answer: 'Yes. Standard hire rates on this page are Wet Hire rates.',
  },
  {
    question: 'Is GST included?',
    answer: 'Yes. The listed hourly rates include GST.',
  },
  {
    question: 'Are landing fees included?',
    answer: 'No. A $25 charge applies per landing.',
  },
  {
    question: 'How does the multi-day minimum work?',
    answer:
      'For bookings of 24 hours or longer, minimum billable VDO time is pro-rated at 4 VDO hours per 24 hours booked. For example, 36 hours booked has a 6 VDO hour minimum.',
  },
]

export default function PricingPage() {
  return (
    <main className="relative overflow-x-hidden bg-mkt-main text-deep-ink">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_9%,rgba(39,79,146,0.28),transparent_35%),radial-gradient(circle_at_80%_45%,rgba(18,53,108,0.24),transparent_40%),radial-gradient(circle_at_55%_82%,rgba(10,37,76,0.2),transparent_44%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_20%_30%,#8ca8d6_1px,transparent_1px),radial-gradient(circle_at_80%_60%,#8ca8d6_1px,transparent_1px)] [background-size:34px_34px,46px_46px]" />

      <section className="hero-fade-to-main relative flex min-h-[560px] items-center overflow-hidden px-6 pb-20 pt-24 md:min-h-[760px] md:px-12 lg:px-20">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/optimized/pricing-hero-1400.jpg")', opacity: 0.62 }}
        />
        <div className="absolute inset-0 z-0 bg-[linear-gradient(95deg,rgba(13,27,62,0.92)_12%,rgba(13,27,62,0.78)_44%,rgba(13,27,62,0.55)_78%)]" />
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_24%_38%,rgba(18,43,79,0.52),transparent_56%)]" />

        <div className="relative z-10 mx-auto w-full max-w-7xl">
          <StaggerContainer className="max-w-xl" staggerDelay={0.15}>
            <StaggerItem duration={1.05}>
              <div className="mb-5 flex flex-wrap gap-2.5">
                {HERO_CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-sans text-[0.62rem] font-semibold uppercase tracking-[0.14em]"
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      borderColor: 'rgba(255,255,255,0.25)',
                      color: 'rgba(255,255,255,0.85)',
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-runway-amber" />
                    {chip}
                  </span>
                ))}
              </div>
            </StaggerItem>
            <StaggerItem duration={1.1}>
              <h1 className="mb-5 font-serif text-5xl leading-[1.02] tracking-tight text-white md:text-7xl">
                Transparent Aircraft Hire <span className="text-white [text-shadow:0_0_18px_rgba(224,177,59,0.26)]">Pricing</span>
              </h1>
            </StaggerItem>
            <StaggerItem duration={1.05}>
              <p className="mb-10 max-w-lg font-sans text-base leading-relaxed text-white/80">
                Simple hourly pricing based on VDO hours flown. Wet Hire and GST included. $25 per landing.
              </p>
            </StaggerItem>
          </StaggerContainer>
          <FadeUp delay={0.15} duration={1}>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="/pilotRequirements"
                className="inline-flex rounded-md bg-runway-amber px-8 py-4 font-sans text-[0.79rem] font-bold uppercase tracking-[0.15em] text-deep-ink transition-colors duration-300 hover:bg-runway-amber-hot"
              >
                Get Approved to Fly
              </a>
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="relative bg-mkt-main pb-24 pt-6 md:pt-12">
        <FadeUp className="mx-auto max-w-6xl px-6 md:px-12" duration={1.05} viewportMargin="-80px">
          <div className="mb-8">
            <p className="mb-3 font-sans text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-blue">Hourly Rate Ladder</p>
            <h2 className="font-serif text-4xl leading-tight text-deep-ink">How Standard Aircraft Hire Pricing Works</h2>
            <div className="mt-3 h-[3px] w-[40px] bg-runway-amber" />
            <p className="mt-5 font-sans text-[0.95rem] leading-relaxed text-muted-ink">
              Final pricing is based on total VDO hours flown for the booking.
            </p>
          </div>
          <div className="grid items-start gap-12 md:grid-cols-12">
            <div className="self-start md:col-span-4">
              <div className="space-y-3">
                <div className="rounded-xl border border-white/12 bg-mkt-lift p-4">
                  <p className="inline-flex items-center gap-2 font-sans text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-deep-ink">
                    <Icon name="verified" className="!text-[14px] text-runway-amber" />
                    Wet Hire · GST Included · $25 Per Landing
                  </p>
                </div>
                <div className="rounded-xl border border-white/12 bg-mkt-lift p-4">
                  <p className="inline-flex items-center gap-2 font-sans text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-deep-ink">
                    <Icon name="shield" className="!text-[14px] text-runway-amber" />
                    Important Note
                  </p>
                  <p className="mt-2 font-sans text-[0.84rem] leading-relaxed text-muted-ink">
                    Overnight aircraft parking charges at other airports are not included and are the pilot&apos;s responsibility.
                  </p>
                </div>
              </div>
            </div>
            <div className="relative self-start md:col-span-8">
            <div className="absolute -right-6 bottom-8 hidden h-32 w-32 rounded-full border border-mkt-subtle opacity-25 lg:block" />
            <div className="overflow-hidden rounded-2xl bg-deep-ink shadow-[0_26px_70px_rgba(0,0,0,0.45)]">
              <div className="grid grid-cols-[1fr_auto] bg-white/10 px-6 py-3 md:px-8">
                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-white">VDO Tier</p>
                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-white">Hourly Rate</p>
              </div>
              {PRICING_TIERS.map((tier) => (
                <div
                  key={tier.tier}
                  className={`grid grid-cols-[1fr_auto] items-center border-b border-white/10 px-6 py-4 md:px-8 ${
                    tier.highlight ? 'bg-brand-blue/20' : ''
                  }`}
                >
                  <p className="font-sans text-[14px] text-white/65">{tier.tier}</p>
                  <p className="font-sans text-[22px] font-semibold leading-none text-white">
                    {tier.rate}
                    <span className="ml-1 font-sans text-[12px] text-white/45">/hr</span>
                  </p>
                </div>
              ))}
              <div className="flex flex-wrap justify-center gap-6 bg-brand-blue/30 px-6 py-2.5 md:px-8">
                {['Wet Hire', 'GST Included', '$25 Landing Fee'].map((tag) => (
                  <span
                    key={tag}
                    className="font-sans text-[11px] font-semibold uppercase tracking-[0.06em] text-white/60"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          </div>
        </FadeUp>
      </section>

      <section className="relative bg-mkt-alt px-6 py-24 md:px-12 lg:px-20">
        <FadeUp className="mx-auto max-w-6xl" duration={1.05} viewportMargin="-80px">
          <p className="text-center font-sans text-[0.67rem] font-semibold uppercase tracking-[0.2em] text-runway-amber">Seamless Billing Workflow</p>
          <h2 className="mt-3 text-center font-serif text-4xl text-deep-ink md:text-6xl">Seamless Billing Workflow</h2>

          <div className="relative mt-16 hidden md:block">
            <div className="absolute left-[10%] right-[10%] top-[20px] z-0 border-t-2 border-dashed border-[rgba(26,79,214,0.35)]" />
            <div className="grid grid-cols-5 gap-4">
              {WORKFLOW_STEPS.map((step, idx) => (
                <div key={step.title} className="relative z-10 text-center">
                  <p className="mb-2 font-sans text-[16px] font-semibold tracking-[0.04em] text-brand-blue">{String(idx + 1).padStart(2, '0')}</p>
                  <div className="relative z-10 mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-open-ceiling bg-white shadow-[0_0_0_8px_#f4f8ff]">
                    <Icon name={step.icon} className="text-brand-blue !text-[19px]" />
                  </div>
                  <p className="mt-4 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-deep-ink">{step.title}</p>
                  <p className="mx-auto mt-2 max-w-[150px] font-sans text-[0.8rem] leading-relaxed text-muted-ink">{step.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 space-y-5 md:hidden">
            {WORKFLOW_STEPS.map((step, idx) => (
              <div key={step.title} className="relative pl-12">
                <div className="absolute left-[18px] top-0 h-full w-px bg-white/15" />
                <div className="absolute left-0 top-1.5 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.14] bg-horizon-border">
                  <Icon name={step.icon} className="text-brand-blue !text-[18px]" />
                </div>
                <p className="font-sans text-[16px] font-semibold tracking-[0.04em] text-brand-blue">{String(idx + 1).padStart(2, '0')}</p>
                <p className="mt-1 font-sans text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-deep-ink">{step.title}</p>
                <p className="mt-1.5 font-sans text-[0.82rem] leading-relaxed text-muted-ink">{step.body}</p>
              </div>
            ))}
          </div>
        </FadeUp>
      </section>

      <section className="relative overflow-hidden px-6 py-24 md:px-12 md:py-[100px] lg:px-20">
        <div
          className="absolute inset-0 z-0 bg-cover bg-no-repeat"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(2, 11, 25, 0.28) 0%, rgba(2, 11, 25, 0.14) 35%, rgba(2, 11, 25, 0.08) 70%, rgba(2, 11, 25, 0.12) 100%), linear-gradient(180deg, rgba(2, 11, 25, 0.12) 0%, rgba(2, 11, 25, 0.04) 50%, rgba(2, 11, 25, 0.12) 100%), url('/optimized/pricing-multiday-1500.jpg')",
            backgroundPosition: 'center right, center, center right',
          }}
        />
        <FadeUp className="relative z-10 mx-auto grid max-w-6xl items-start gap-10 md:gap-12 lg:grid-cols-[46%_54%]" duration={1.05} viewportMargin="-80px">
          <div className="max-w-[560px]">
            <p className="mb-5 font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-runway-amber">Multi-Day Hire Rule</p>
            <h2 className="max-w-[11ch] font-serif text-[3.1rem] leading-[0.98] text-white md:mb-0 md:text-[4.5rem]">Multi-Day Booking Minimum</h2>
            <p className="mb-0 mt-6 max-w-[520px] font-sans text-[1rem] leading-[1.6] text-white/80 md:text-[1.05rem]">
              For bookings of 24 hours or longer, a minimum flight usage rule applies.
            </p>
            <div className="mt-8 rounded-2xl border border-white/20 bg-deep-ink/70 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] md:p-[30px]">
              <div className="flex items-start gap-4">
                <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-runway-amber/30 bg-horizon-border">
                  <Icon name="flight" className="!text-[15px] text-runway-amber" />
                </div>
                <div>
                  <p className="mb-3 font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-runway-amber">Minimum Usage Rule</p>
                  <p className="font-serif text-[1.9rem] leading-[1.18] text-white md:text-[2.05rem]">
                    For every 24 hours booked, a minimum of 4 VDO hours is billable.
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-6 font-sans text-[0.92rem] leading-[1.6] text-white/80">
              If you fly more than the minimum, billing is based on your actual VDO hours.
            </p>
          </div>

          <div className="grid gap-4 self-center md:gap-[17px]">
            {MINIMUM_RULES.map((rule) => (
              <div
                key={rule.booked}
                className="flex min-h-[80px] items-center justify-between rounded-2xl border border-[rgba(233,240,250,0.22)] bg-[rgba(7,22,43,0.48)] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] md:px-7"
              >
                <span className="font-sans text-[1.02rem] font-medium leading-[1.2] text-white md:text-[1.12rem]">{rule.booked}</span>
                <div className="flex items-center gap-3">
                  <Icon name="east" className="text-[#D8DFEA] !text-[20px]" />
                  <span className="inline-flex h-10 items-center gap-2 rounded-full border border-runway-amber/[0.28] bg-mkt-lift px-4 font-sans text-[0.72rem] font-bold uppercase tracking-[0.08em] text-deep-ink md:h-11 md:px-[18px] md:text-[0.75rem]">
                    <Icon name="schedule" className="!text-[14px] text-runway-amber" />
                    {rule.minimum}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </FadeUp>
      </section>

      <section className="relative bg-mkt-main px-6 py-24 md:px-12 lg:px-20">
        <FadeUp className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-12" duration={1.05} viewportMargin="-80px">
          <div className="lg:col-span-7">
            <p className="font-sans text-[0.67rem] font-semibold uppercase tracking-[0.2em] text-runway-amber">What&apos;s Included</p>
            <h2 className="mt-3 font-serif text-4xl text-deep-ink md:text-6xl">Everything Built Into Your Hire</h2>
            <p className="mt-4 max-w-2xl font-sans text-[0.95rem] leading-relaxed text-muted-ink">
              Everything you need for a seamless flight experience, with no hidden fees.
            </p>
            <div className="mt-10 grid gap-3 md:grid-cols-2">
              {INCLUDED_CARDS.map((card) => (
                <article key={card.title} className="rounded-xl border border-mkt-subtle bg-mkt-lift p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-horizon-border">
                      <Icon name={card.icon} className="text-runway-amber !text-[18px]" />
                    </div>
                    <div>
                      <h3 className="font-sans text-[0.95rem] font-semibold text-deep-ink">{card.title}</h3>
                      <p className="mt-1.5 font-sans text-[0.82rem] leading-relaxed text-muted-ink">{card.copy}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-mkt-lift lg:col-span-5">
            <img
              src="/CockpitRunwayView.webp"
              alt="Cockpit runway view"
              className="h-full min-h-[360px] w-full object-cover opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#061524] via-[#061524]/32 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <p className="font-sans text-[0.66rem] font-semibold uppercase tracking-[0.17em] text-runway-amber">Transparent Billing</p>
              <p className="mt-2 font-serif text-3xl leading-tight text-white">Built for clarity from booking to final invoice.</p>
            </div>
          </div>
        </FadeUp>
      </section>

      <section className="relative bg-mkt-alt px-6 py-20 md:px-12 lg:px-20">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle,#89a5d4_1px,transparent_1px)] [background-size:20px_20px]" />
        <FadeUp className="relative mx-auto max-w-5xl" duration={1.05} viewportMargin="-80px">
          <p className="text-center font-sans text-[0.67rem] font-semibold uppercase tracking-[0.2em] text-runway-amber">Frequently Asked Questions</p>
          <h2 className="mt-3 text-center font-serif text-4xl text-deep-ink md:text-6xl">Frequently Asked Questions</h2>
          <div className="mt-10 space-y-3">
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.question} item={item} />
            ))}
          </div>
        </FadeUp>
      </section>

      <PreFooterCTA
        heading="Ready to Fly?"
        subtext="Get approved and start booking with transparent, competitive aircraft hire pricing."
        ctaLabel="Get Approved"
        ctaHref="/pilotRequirements"
      />
    </main>
  )
}
