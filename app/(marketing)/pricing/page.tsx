'use client'

import { useState } from 'react'
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/MotionPresets'

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
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#08162A]/76 backdrop-blur-sm transition-all duration-300 hover:border-[#E0B13B]/35">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left md:px-6"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-sans text-sm font-medium text-[#F4F6FA] md:text-[0.96rem]">{item.question}</span>
        <Icon
          name={open ? 'remove' : 'add'}
          className="shrink-0 text-[#E0B13B] transition-transform duration-300"
        />
      </button>
      {open ? (
        <div className="border-t border-white/[0.08] px-5 py-4 font-sans text-sm leading-relaxed text-[#A6B2C6] md:px-6">
          {item.answer}
        </div>
      ) : null}
    </div>
  )
}

const HERO_CHIPS = ['Fuel Included', 'GST Included', '$25 Per Landing', 'Billed by VDO Hours']

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
    title: 'Fuel Included',
    copy: 'Wet hire rates mean fuel is covered in your hourly rate.',
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
    icon: 'workspace_premium',
    title: 'Premium Aircraft Access',
    copy: 'Access a well-maintained aircraft through a clear booking process.',
  },
  {
    icon: 'garage',
    title: 'Easy hangar access',
    copy: 'Aircraft access is straightforward with sliding hangar doors and 24-hour hangar availability.',
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
    question: 'Is fuel included in the hourly rate?',
    answer: 'Yes. Standard hire rates shown on this page include fuel.',
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
    <main className="relative overflow-x-hidden bg-mkt-main text-[#F4F6FA]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_9%,rgba(39,79,146,0.28),transparent_35%),radial-gradient(circle_at_80%_45%,rgba(18,53,108,0.24),transparent_40%),radial-gradient(circle_at_55%_82%,rgba(10,37,76,0.2),transparent_44%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_20%_30%,#8ca8d6_1px,transparent_1px),radial-gradient(circle_at_80%_60%,#8ca8d6_1px,transparent_1px)] [background-size:34px_34px,46px_46px]" />

      <section className="relative flex min-h-[560px] items-center overflow-hidden px-6 pb-20 pt-24 md:min-h-[760px] md:px-12 lg:px-20">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/optimized/pricing-hero-1400.jpg")', opacity: 0.62 }}
        />
        <div className="absolute inset-0 z-0 bg-[linear-gradient(95deg,rgba(2,11,25,0.95)_12%,rgba(6,21,42,0.82)_44%,rgba(8,27,52,0.24)_78%)]" />
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_24%_38%,rgba(18,43,79,0.52),transparent_56%)]" />
        <div className="absolute left-[5%] top-[16%] z-0 h-[360px] w-[360px] rounded-full border border-white/[0.08] opacity-20" />
        <div className="absolute left-[9%] top-[20%] z-0 h-[280px] w-[280px] rounded-full border border-[#E0B13B]/30 opacity-20" />

        <div className="relative z-10 mx-auto w-full max-w-7xl">
          <StaggerContainer className="max-w-xl" staggerDelay={0.15}>
            <StaggerItem duration={1.05}>
              <div className="mb-5 flex flex-wrap gap-2.5">
                {HERO_CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#081B34]/78 px-3.5 py-1.5 font-sans text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#F4F6FA]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#E0B13B]" />
                    {chip}
                  </span>
                ))}
              </div>
            </StaggerItem>
            <StaggerItem duration={1.1}>
              <h1 className="mb-5 font-serif text-5xl leading-[1.02] tracking-tight text-[#F4F6FA] md:text-7xl">
                Transparent Aircraft Hire <span className="text-[#F4F6FA] [text-shadow:0_0_18px_rgba(224,177,59,0.26)]">Pricing</span>
              </h1>
            </StaggerItem>
            <StaggerItem duration={1.05}>
              <p className="mb-10 max-w-lg font-sans text-base leading-relaxed text-[#C7D2E5]">
                Simple hourly pricing based on VDO hours flown. Fuel and GST included. $25 per landing.
              </p>
            </StaggerItem>
          </StaggerContainer>
          <FadeUp delay={0.15} duration={1}>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="/pilotRequirements"
                className="inline-flex rounded-md bg-[#E0B13B] px-8 py-4 font-sans text-[0.79rem] font-bold uppercase tracking-[0.15em] text-[#061120] transition-colors duration-300 hover:bg-[#F0C24A]"
              >
                Get Approved to Fly
              </a>
              <a
                href="/checkout-process"
                className="inline-flex rounded-md border border-white/28 bg-mkt-lift/60 px-8 py-4 font-sans text-[0.79rem] font-bold uppercase tracking-[0.15em] text-[#F4F6FA] transition-all duration-300 hover:border-[#E0B13B]/70 hover:text-[#FFF3D2]"
              >
                View Checkout Requirements
              </a>
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="relative pb-24 pt-6 md:pt-12">
        <FadeUp className="mx-auto grid max-w-6xl gap-10 px-6 md:grid-cols-12 md:px-12" duration={1.05} viewportMargin="-80px">
          <div className="md:col-span-4">
            <p className="mb-3 font-sans text-[0.67rem] font-semibold uppercase tracking-[0.2em] text-[#E0B13B]">Hourly Rate Ladder</p>
            <h2 className="font-serif text-4xl leading-tight text-[#F4F6FA]">How Standard Aircraft Hire Pricing Works</h2>
            <p className="mt-5 font-sans text-[0.95rem] leading-relaxed text-[#A6B2C6]">
              Final pricing is based on total VDO hours flown for the booking.
            </p>
            <div className="mt-7 space-y-3">
              <div className="rounded-xl border border-white/12 bg-[#081B34]/70 p-4">
                <p className="inline-flex items-center gap-2 font-sans text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#D7E2F6]">
                  <Icon name="verified" className="!text-[14px] text-[#E0B13B]" />
                  Fuel Included · GST Included · $25 Per Landing
                </p>
              </div>
              <div className="rounded-xl border border-white/12 bg-[#081B34]/70 p-4">
                <p className="inline-flex items-center gap-2 font-sans text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#D7E2F6]">
                  <Icon name="shield" className="!text-[14px] text-[#E0B13B]" />
                  Important Note
                </p>
                <p className="mt-2 font-sans text-[0.84rem] leading-relaxed text-[#A6B2C6]">
                  Overnight aircraft parking charges at other airports are not included and are the pilot&apos;s responsibility.
                </p>
              </div>
            </div>
          </div>

          <div className="relative md:col-span-8">
            <div className="absolute -right-6 bottom-8 hidden h-32 w-32 rounded-full border border-white/[0.08] opacity-25 lg:block" />
            <div className="overflow-hidden rounded-2xl border border-white/12 bg-[linear-gradient(180deg,rgba(8,27,52,0.86),rgba(6,21,42,0.85))] shadow-[0_26px_70px_rgba(0,0,0,0.45),inset_0_0_40px_rgba(56,99,171,0.15)] backdrop-blur-sm md:backdrop-blur-md">
              <div className="grid grid-cols-[1fr_auto] border-b border-white/[0.08] px-6 py-4 md:px-8">
                <p className="font-sans text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#90A4C4]">VDO Tier</p>
                <p className="font-sans text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#90A4C4]">Hourly Rate</p>
              </div>
              {PRICING_TIERS.map((tier) => (
                <div
                  key={tier.tier}
                  className={`grid grid-cols-[1fr_auto] items-center border-b border-white/[0.08] px-6 py-5 md:px-8 ${
                    tier.highlight ? 'bg-[#0D2649]/40' : ''
                  }`}
                >
                  <p className="font-sans text-[0.95rem] text-[#D4DEEF]">{tier.tier}</p>
                  <p className="font-serif text-[2.15rem] leading-none text-[#F4F6FA]">
                    {tier.rate}
                    <span className="ml-1 font-sans text-sm text-[#90A4C4]">/hr</span>
                  </p>
                </div>
              ))}
              <div className="flex flex-wrap justify-center gap-6 px-6 py-4 md:px-8">
                {['Fuel Included', 'GST Included', '$25 Landing Fee'].map((tag) => (
                  <span
                    key={tag}
                    className="font-sans text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[#98ACCA]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </FadeUp>
      </section>

      <section className="relative px-6 py-24 md:px-12 lg:px-20">
        <FadeUp className="mx-auto max-w-6xl" duration={1.05} viewportMargin="-80px">
          <p className="text-center font-sans text-[0.67rem] font-semibold uppercase tracking-[0.2em] text-[#E0B13B]">Seamless Billing Workflow</p>
          <h2 className="mt-3 text-center font-serif text-4xl text-[#F4F6FA] md:text-6xl">Seamless Billing Workflow</h2>

          <div className="relative mt-16 hidden md:block">
            <div className="absolute left-[8%] right-[8%] top-[24px] h-px bg-gradient-to-r from-transparent via-[#8AA6CF]/50 to-transparent" />
            <div className="grid grid-cols-5 gap-4">
              {WORKFLOW_STEPS.map((step, idx) => (
                <div key={step.title} className="relative z-10 text-center">
                  <p className="mb-2 font-sans text-[0.66rem] font-semibold tracking-[0.16em] text-[#E0B13B]">{String(idx + 1).padStart(2, '0')}</p>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.14] bg-[#081B34] shadow-[0_0_0_8px_#061524]">
                    <Icon name={step.icon} className="text-[#BFCDE2] !text-[19px]" />
                  </div>
                  <p className="mt-4 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#E3EBF8]">{step.title}</p>
                  <p className="mx-auto mt-2 max-w-[150px] font-sans text-[0.8rem] leading-relaxed text-[#A6B2C6]">{step.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 space-y-5 md:hidden">
            {WORKFLOW_STEPS.map((step, idx) => (
              <div key={step.title} className="relative pl-12">
                <div className="absolute left-[18px] top-0 h-full w-px bg-white/15" />
                <div className="absolute left-0 top-1.5 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.14] bg-[#081B34]">
                  <Icon name={step.icon} className="text-[#BFCDE2] !text-[18px]" />
                </div>
                <p className="font-sans text-[0.66rem] font-semibold tracking-[0.16em] text-[#E0B13B]">{String(idx + 1).padStart(2, '0')}</p>
                <p className="mt-1 font-sans text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-[#E3EBF8]">{step.title}</p>
                <p className="mt-1.5 font-sans text-[0.82rem] leading-relaxed text-[#A6B2C6]">{step.body}</p>
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
            <p className="mb-5 font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-[#E0B13B]">Multi-Day Hire Rule</p>
            <h2 className="max-w-[11ch] font-serif text-[3.1rem] leading-[0.98] text-[#F4F6FA] md:mb-0 md:text-[4.5rem]">Multi-Day Booking Minimum</h2>
            <p className="mb-0 mt-6 max-w-[520px] font-sans text-[1rem] leading-[1.6] text-[#A6B2C6] md:text-[1.05rem]">
              For bookings of 24 hours or longer, a minimum flight usage rule applies.
            </p>
            <div className="mt-8 rounded-2xl border border-[#97B1D7]/[0.12] bg-[#07162B]/[0.72] p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] md:p-[30px]">
              <div className="flex items-start gap-4">
                <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E0B13B]/30 bg-[#0B213D]/85">
                  <Icon name="flight" className="!text-[15px] text-[#E0B13B]" />
                </div>
                <div>
                  <p className="mb-3 font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-[#E0B13B]">Minimum Usage Rule</p>
                  <p className="font-serif text-[1.9rem] leading-[1.18] text-[#F4F6FA] md:text-[2.05rem]">
                    For every 24 hours booked, a minimum of 4 VDO hours is billable.
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-6 font-sans text-[0.92rem] leading-[1.6] text-[#A6B2C6]">
              If you fly more than the minimum, billing is based on your actual VDO hours.
            </p>
          </div>

          <div className="grid gap-4 self-center md:gap-[17px]">
            {MINIMUM_RULES.map((rule) => (
              <div
                key={rule.booked}
                className="flex min-h-[80px] items-center justify-between rounded-2xl border border-[rgba(233,240,250,0.22)] bg-[rgba(7,22,43,0.48)] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] md:px-7"
              >
                <span className="font-sans text-[1.02rem] font-medium leading-[1.2] text-[#F4F6FA] md:text-[1.12rem]">{rule.booked}</span>
                <div className="flex items-center gap-3">
                  <Icon name="east" className="text-[#D8DFEA] !text-[20px]" />
                  <span className="inline-flex h-10 items-center gap-2 rounded-full border border-[#E0B13B]/[0.28] bg-[#081B34]/[0.78] px-4 font-sans text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[#F4F6FA] md:h-11 md:px-[18px] md:text-[0.75rem]">
                    <Icon name="schedule" className="!text-[14px] text-[#E0B13B]" />
                    {rule.minimum}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </FadeUp>
      </section>

      <section className="relative px-6 py-24 md:px-12 lg:px-20">
        <FadeUp className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-12" duration={1.05} viewportMargin="-80px">
          <div className="lg:col-span-7">
            <p className="font-sans text-[0.67rem] font-semibold uppercase tracking-[0.2em] text-[#E0B13B]">What&apos;s Included</p>
            <h2 className="mt-3 font-serif text-4xl text-[#F4F6FA] md:text-6xl">What&apos;s Included</h2>
            <p className="mt-4 max-w-2xl font-sans text-[0.95rem] leading-relaxed text-[#A6B2C6]">
              Everything you need for a seamless flight experience, with no hidden fees.
            </p>
            <div className="mt-10 grid gap-3 md:grid-cols-2">
              {INCLUDED_CARDS.map((card) => (
                <article key={card.title} className="rounded-xl border border-white/[0.08] bg-[#081B34]/70 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-[#0A223F]">
                      <Icon name={card.icon} className="text-[#E0B13B] !text-[18px]" />
                    </div>
                    <div>
                      <h3 className="font-sans text-[0.95rem] font-semibold text-[#EAF1FC]">{card.title}</h3>
                      <p className="mt-1.5 font-sans text-[0.82rem] leading-relaxed text-[#A6B2C6]">{card.copy}</p>
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
              <p className="font-sans text-[0.66rem] font-semibold uppercase tracking-[0.17em] text-[#E0B13B]">Transparent Billing</p>
              <p className="mt-2 font-serif text-3xl leading-tight text-[#F4F6FA]">Built for clarity from booking to final invoice.</p>
            </div>
          </div>
        </FadeUp>
      </section>

      <section className="relative px-6 py-20 md:px-12 lg:px-20">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle,#89a5d4_1px,transparent_1px)] [background-size:20px_20px]" />
        <FadeUp className="relative mx-auto max-w-5xl" duration={1.05} viewportMargin="-80px">
          <p className="text-center font-sans text-[0.67rem] font-semibold uppercase tracking-[0.2em] text-[#E0B13B]">Frequently Asked Questions</p>
          <h2 className="mt-3 text-center font-serif text-4xl text-[#F4F6FA] md:text-6xl">Frequently Asked Questions</h2>
          <div className="mt-10 space-y-3">
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.question} item={item} />
            ))}
          </div>
        </FadeUp>
      </section>

      <section className="relative overflow-hidden px-6 py-24 md:px-12 lg:px-20">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/Cockpit-twilight.webp")', opacity: 0.5 }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,11,25,0.72),rgba(2,11,25,0.88))]" />
        <FadeUp className="relative z-10 mx-auto max-w-3xl text-center" duration={1.05} viewportMargin="-80px">
          <h2 className="font-serif text-5xl text-[#F4F6FA] md:text-7xl">Ready to Fly?</h2>
          <p className="mx-auto mt-4 max-w-2xl font-sans text-[0.95rem] leading-relaxed text-[#C0CCE0] md:text-base">
            Get approved and start booking with transparent, competitive aircraft hire pricing.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href="/pilotRequirements"
              className="inline-flex rounded-md bg-[#E0B13B] px-8 py-4 font-sans text-[0.79rem] font-bold uppercase tracking-[0.15em] text-[#061120] transition-colors duration-300 hover:bg-[#F0C24A]"
            >
              Get Approved
            </a>
            <a
              href="mailto:ops@ozrentaplane.com.au?subject=Pricing%20enquiry"
              className="inline-flex rounded-md border border-white/28 bg-mkt-lift/52 px-8 py-4 font-sans text-[0.79rem] font-bold uppercase tracking-[0.15em] text-[#F4F6FA] transition-all duration-300 hover:border-[#E0B13B]/70 hover:text-[#FFF3D2]"
            >
              Contact Us
            </a>
          </div>
        </FadeUp>
      </section>
    </main>
  )
}
