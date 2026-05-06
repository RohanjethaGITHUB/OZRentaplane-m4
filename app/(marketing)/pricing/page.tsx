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
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0d1828]/80 backdrop-blur-md transition-all duration-300 hover:border-[#9cb6de]/35 hover:bg-[#102036]/85">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/5 md:px-6"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-sans text-sm font-semibold text-[#ebf2ff] md:text-[0.95rem]">{item.question}</span>
        <Icon name={open ? 'remove' : 'add'} className="shrink-0 text-[#bad0ef] transition-transform duration-300" />
      </button>
      {open ? (
        <div className="border-t border-white/10 px-5 py-4 font-sans text-sm leading-relaxed text-[#c7d3e5] md:px-6">
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
  { tier: '50+ VDO hours', rate: '$300', highlight: true },
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
    <main className="overflow-x-hidden bg-[#091421] text-[#d9e3f6]">
      <section className="relative flex min-h-[500px] items-center overflow-hidden px-6 md:min-h-[750px] md:px-12 lg:px-20">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/pricing-hero.png")', opacity: 0.78 }}
        />
        <div className="absolute inset-0 z-0 bg-[#050d1b]/45" />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#04101f]/92 via-[#05152a]/76 via-40% to-[#091626]/22" />
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_42%,rgba(15,34,62,0.55),rgba(8,18,33,0.15)_48%,rgba(8,18,33,0)_74%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-px z-[20] h-[45%] bg-gradient-to-b from-transparent via-[#091421]/75 to-[#091421]" />

        <div className="relative z-10 mx-auto w-full max-w-7xl pt-16">
          <StaggerContainer className="max-w-xl" staggerDelay={0.18}>
            <StaggerItem duration={1.2}>
              <div className="mb-5 flex flex-wrap gap-2 md:gap-3">
                {HERO_CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-md border border-[#aac3e8]/35 bg-[#08162a]/84 px-3 py-1 font-sans text-[0.62rem] font-semibold uppercase tracking-[0.17em] text-[#e0ecff] shadow-[0_0_10px_rgba(41,72,119,0.22)] transition-all duration-300 hover:border-[#c8dbfb]/50 hover:bg-[#0d213e]/88"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </StaggerItem>
            <StaggerItem duration={1.25}>
              <h1 className="mb-6 font-serif text-5xl font-normal leading-[1.05] tracking-tight text-white [text-shadow:0_12px_32px_rgba(2,8,18,0.7)] md:text-7xl">
                Transparent Aircraft Hire Pricing
              </h1>
            </StaggerItem>
            <StaggerItem duration={1.2}>
              <p className="mb-10 max-w-lg font-sans text-[1.02rem] font-medium leading-relaxed text-[#e0e9f8] [text-shadow:0_8px_22px_rgba(2,8,18,0.65)]">
                Simple hourly pricing based on VDO hours flown. Fuel and GST included. $25 per landing.
              </p>
            </StaggerItem>
          </StaggerContainer>
          <FadeUp delay={0.18} duration={1.15}>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <a
                href="/pilotRequirements"
                className="inline-block rounded-md bg-gradient-to-r from-[#c3d8ff] to-[#7599d9] px-8 py-4 font-sans text-[0.8rem] font-bold uppercase tracking-widest text-[#0a1d38] shadow-2xl shadow-[#aec7f7]/25 transition-all duration-300 active:scale-95 hover:brightness-110"
              >
                Get Approved to Fly
              </a>
              <a
                href="/checkout-process"
                className="rounded border border-[#d2e2ff]/40 bg-[#09182d]/56 px-8 py-4 font-sans text-[0.8rem] font-bold uppercase tracking-widest text-[#eef4ff] shadow-[0_0_18px_rgba(3,10,20,0.45)] transition-all duration-300 hover:bg-[#0f243f]/72"
              >
                View Checkout Requirements
              </a>
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="-mt-10 pb-24 pt-10 md:pt-14">
        <FadeUp className="mx-auto grid max-w-6xl gap-8 px-6 md:grid-cols-12 md:gap-10 md:px-12" duration={1.05} viewportMargin="-80px">
          <div className="md:col-span-4">
            <p className="mb-3 font-sans text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-[#9fb8df]">Hourly Rate Ladder</p>
            <h2 className="font-serif text-3xl text-[#eaf1ff] md:text-4xl">How Standard Aircraft Hire Pricing Works</h2>
            <p className="mt-5 font-sans text-sm leading-relaxed text-[#c8d3e5]">
              Final pricing is based on total VDO hours flown for the booking.
            </p>
            <div className="mt-7 rounded-lg border border-white/12 bg-[#101d31]/72 p-4">
              <p className="font-sans text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#bfd1ed]">Fuel included · GST included · $25 per landing</p>
            </div>
          </div>

          <div className="md:col-span-8">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c1829]/72 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-md">
              <div className="grid grid-cols-[1fr_auto] border-b border-white/10 bg-[#111f35]/90 px-5 py-4 md:px-8">
                <p className="font-sans text-[0.66rem] font-semibold uppercase tracking-[0.17em] text-[#9fb3d4]">VDO Tier</p>
                <p className="font-sans text-[0.66rem] font-semibold uppercase tracking-[0.17em] text-[#9fb3d4]">Hourly Rate</p>
              </div>
              {PRICING_TIERS.map((tier) => (
                <div
                  key={tier.tier}
                  className={`group relative z-0 grid grid-cols-[1fr_auto] items-center border-b border-white/10 px-5 py-5 transition-all duration-300 hover:z-10 hover:scale-[1.018] hover:border-[#bdd1f2]/35 hover:bg-[#193153]/78 hover:shadow-[0_14px_34px_rgba(8,16,30,0.45),0_0_30px_rgba(113,151,215,0.2)] md:px-8 md:hover:py-6 ${
                    tier.highlight ? 'bg-[#12243e]/72 shadow-[inset_0_0_30px_rgba(117,153,217,0.12)]' : ''
                  }`}
                >
                  <p className={`font-sans text-sm transition-colors duration-300 md:text-[0.98rem] ${tier.highlight ? 'text-[#e2ebfb]' : 'text-[#c4d0e1] group-hover:text-[#e5efff]'}`}>{tier.tier}</p>
                  <p className="font-serif text-3xl text-[#ecf2ff] transition-all duration-300 group-hover:text-[#f4f8ff] md:text-4xl md:group-hover:text-[2.55rem]">
                    {tier.rate}
                    <span className="ml-1 font-sans text-sm text-[#9db1d2] transition-colors duration-300 group-hover:text-[#bfd1ef]">/hr</span>
                  </p>
                </div>
              ))}
              <div className="flex flex-wrap justify-center gap-5 px-5 py-4 md:px-8">
                {['Fuel Included', 'GST Included', '$25 Landing Fee'].map((tag) => (
                  <span
                    key={tag}
                    className="font-sans text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[#a7bcdd]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </FadeUp>
      </section>

      <section className="border-y border-white/5 bg-[#07111e] px-6 py-24 md:px-12 lg:px-20">
        <FadeUp className="mx-auto max-w-6xl" duration={1.05} viewportMargin="-80px">
          <h2 className="text-center font-serif text-3xl text-[#eaf1ff] md:text-5xl">Seamless Billing Workflow</h2>

          <div className="relative mt-16 hidden md:block">
            <div className="absolute left-[8%] right-[8%] top-[22px] h-px bg-[#2e3f5d]" />
            <div className="absolute left-[10%] right-[10%] top-[22px] h-px bg-gradient-to-r from-transparent via-[#84a8e5]/50 to-transparent" />
            <div className="grid grid-cols-5 gap-4">
              {WORKFLOW_STEPS.map((step) => (
                <div key={step.title} className="group relative z-10 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[#87a6d8]/45 bg-[#12243e] shadow-[0_0_0_7px_#07111e] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[#bbcff2]/65 group-hover:shadow-[0_0_0_7px_#07111e,0_0_18px_rgba(117,153,217,0.35)]">
                    <Icon name={step.icon} className="text-[#b8cef1] !text-[19px]" />
                  </div>
                  <p className="mt-4 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#d9e5fb]">{step.title}</p>
                  <p className="mx-auto mt-2 max-w-[160px] font-sans text-[0.78rem] leading-relaxed text-[#9eb0cc]">{step.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 space-y-5 md:hidden">
            {WORKFLOW_STEPS.map((step) => (
              <div key={step.title} className="group relative pl-12">
                <div className="absolute left-[18px] top-0 h-full w-px bg-[#2e3f5d]" />
                <div className="absolute left-0 top-1.5 flex h-9 w-9 items-center justify-center rounded-full border border-[#87a6d8]/45 bg-[#12243e] transition-all duration-300 group-hover:border-[#bbcff2]/65 group-hover:shadow-[0_0_14px_rgba(117,153,217,0.35)]">
                  <Icon name={step.icon} className="text-[#b8cef1] !text-[18px]" />
                </div>
                <p className="font-sans text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-[#d9e5fb]">{step.title}</p>
                <p className="mt-2 font-sans text-[0.82rem] leading-relaxed text-[#9eb0cc]">{step.body}</p>
              </div>
            ))}
          </div>
        </FadeUp>
      </section>

      <section className="relative overflow-hidden px-6 py-24 md:px-12 lg:px-20">
        <div className="absolute inset-0 bg-[#07111f]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(78,111,171,0.18),rgba(7,17,31,0)_45%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_65%,rgba(34,61,105,0.14),rgba(7,17,31,0)_46%)]" />
        <div className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(rgba(137,163,203,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(137,163,203,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
        <FadeUp className="relative z-10 mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-2" duration={1.05} viewportMargin="-80px">
          <div>
            <p className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.17em] text-[#9fb8df]">Multi-Day Hire Rule</p>
            <h2 className="mt-3 font-serif text-4xl text-white md:text-5xl">Multi-Day Booking Minimum</h2>
            <p className="mt-5 font-sans text-sm leading-relaxed text-[#c3d1e5] md:text-base">
              For bookings of 24 hours or longer, a minimum flight usage rule applies.
            </p>
            <div className="mt-6 rounded-lg border border-[#b9ccee]/30 bg-[#0f1e35]/70 p-5 backdrop-blur-md">
              <p className="font-sans text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[#9fb8df]">Minimum Usage Rule</p>
              <p className="mt-2 font-serif text-[1.6rem] leading-tight text-[#edf3ff] md:text-[1.95rem]">
                For every 24 hours booked, a minimum of 4 VDO hours is billable.
              </p>
            </div>
            <p className="mt-5 font-sans text-[0.9rem] leading-relaxed text-[#d0dbed]">
              If you fly more than the minimum, billing is based on your actual VDO hours.
            </p>
          </div>
          <div className="grid gap-3 self-center">
            {MINIMUM_RULES.map((rule) => (
              <div
                key={rule.booked}
                className="group flex items-center justify-between rounded-xl border border-white/16 bg-[#111f35]/74 p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.015] hover:border-[#b9cdef]/52 hover:bg-[#182d4d]/84 hover:shadow-[0_12px_30px_rgba(2,8,18,0.38),0_0_24px_rgba(117,153,217,0.18)] md:p-5"
              >
                <span className="font-sans text-[0.95rem] text-[#e5efff] md:text-[1rem]">{rule.booked}</span>
                <div className="flex items-center gap-2">
                  <Icon name="east" className="text-[#b6caea] transition-transform duration-300 group-hover:translate-x-0.5" />
                  <span className="rounded-full border border-[#c4d6f4]/36 bg-[#213a61]/82 px-3 py-1.5 font-sans text-[0.66rem] font-bold uppercase tracking-[0.12em] text-[#e8f1ff] md:px-4 md:text-[0.7rem]">
                    {rule.minimum}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </FadeUp>
      </section>

      <section className="px-6 py-24 md:px-12 lg:px-20">
        <FadeUp className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-12" duration={1.05} viewportMargin="-80px">
          <div className="lg:col-span-7">
            <h2 className="font-serif text-3xl text-[#eaf1ff] md:text-5xl">What&apos;s Included</h2>
            <p className="mt-4 max-w-2xl font-sans text-sm leading-relaxed text-[#b8c5d9] md:text-base">
              Everything you need for a seamless flight experience, with no hidden fees.
            </p>
            <div className="mt-10 grid gap-3 md:grid-cols-2">
              {INCLUDED_CARDS.map((card, i) => (
                <article
                  key={card.title}
                  className={`rounded-lg border border-white/10 p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-[#b8cbeb]/35 hover:shadow-[0_14px_30px_rgba(2,8,18,0.35)] ${
                    i < 2 ? 'bg-[#121f33]/78' : 'bg-[#0d1828]/75'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/15 bg-[#14263f]">
                      <Icon name={card.icon} className="text-[#b7cdee] !text-[18px]" />
                    </div>
                    <div>
                      <h3 className="font-sans text-[0.95rem] font-semibold text-[#e5edf9]">{card.title}</h3>
                      <p className="mt-1.5 font-sans text-[0.82rem] leading-relaxed text-[#aebcd1]">{card.copy}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0e1b2e] transition-all duration-300 hover:border-[#b8cbeb]/35 hover:shadow-[0_18px_34px_rgba(2,8,18,0.35)] lg:col-span-5">
            <img src="/CockpitRunwayView.webp" alt="Cockpit runway view" className="h-full min-h-[340px] w-full object-cover opacity-72 transition-transform duration-700 hover:scale-[1.03]" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#091421] via-[#091421]/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <p className="font-sans text-[0.66rem] font-semibold uppercase tracking-[0.17em] text-[#a6bfe4]">Transparent Billing</p>
              <p className="mt-2 font-serif text-2xl text-[#edf3ff]">Built for clarity from booking to final invoice.</p>
            </div>
          </div>
        </FadeUp>
      </section>

      <section className="border-t border-white/5 px-6 py-20 md:px-12 lg:px-20">
        <FadeUp className="mx-auto max-w-4xl" duration={1.05} viewportMargin="-80px">
          <h2 className="text-center font-serif text-3xl text-[#eaf1ff] md:text-5xl">Frequently Asked Questions</h2>
          <div className="mt-10 space-y-3">
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.question} item={item} />
            ))}
          </div>
        </FadeUp>
      </section>

      <section className="relative overflow-hidden border-t border-white/5 px-6 py-24 md:px-12 lg:px-20">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/Cockpit-twilight.webp")', opacity: 0.55 }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,84,130,0.3),rgba(7,15,29,0.93)_62%)]" />
        <FadeUp className="relative z-10 mx-auto max-w-3xl text-center" duration={1.05} viewportMargin="-80px">
          <h2 className="font-serif text-4xl text-white md:text-5xl">Ready to Fly?</h2>
          <p className="mx-auto mt-4 max-w-2xl font-sans text-sm leading-relaxed text-[#c3d2e8] md:text-base">
            Get approved and start booking with transparent, competitive aircraft hire pricing.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href="/pilotRequirements"
              className="inline-block rounded-md bg-gradient-to-r from-[#c3d8ff] to-[#7599d9] px-8 py-4 font-sans text-[0.8rem] font-bold uppercase tracking-widest text-[#0a1d38] shadow-2xl shadow-[#aec7f7]/25 transition-all duration-300 active:scale-95 hover:brightness-110"
            >
              Get Approved
            </a>
            <a
              href="mailto:ops@ozrentaplane.com.au?subject=Pricing%20enquiry"
              className="rounded border border-[#d2e2ff]/40 bg-[#09182d]/56 px-8 py-4 font-sans text-[0.8rem] font-bold uppercase tracking-widest text-[#eef4ff] transition-all duration-300 hover:bg-[#0f243f]/72"
            >
              Contact Us
            </a>
          </div>
        </FadeUp>
      </section>
    </main>
  )
}
