'use client'

import { useState } from 'react'
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/MotionPresets'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'
import AtmoClouds from '@/components/AtmoClouds'

export const dynamic = 'force-static'

type FaqItemType = {
  question: string
  answer: string
}

type BookingTypeCard = {
  eyebrow?: string
  title: string
  subtitle: string
  headerClassName: string
  headerEyebrowClassName?: string
  headerTitleClassName?: string
  headerSubtitleClassName?: string
  pricePanelClassName: string
  priceClassName: string
  price: string | string[]
  priceCaption?: string
  priceCaptionClassName?: string
  panelPrice?: string
  panelPriceClassName?: string
  panelCaption?: string
  panelCaptionClassName?: string
  bullets: string[]
  features: string[]
}

type BillingStep = {
  title: string
  icon: string
  caption: string
}

function Icon({
  name,
  className = '',
  filled = false,
}: {
  name: string
  className?: string
  filled?: boolean
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={
        filled
          ? {
              fontVariationSettings: '"FILL" 1, "wght" 500, "GRAD" 0, "opsz" 24',
            }
          : undefined
      }
    >
      {name}
    </span>
  )
}

function SectionHeading({
  eyebrow,
  title,
  subtext,
  align = 'center',
}: {
  eyebrow: string
  title: string
  subtext?: string
  align?: 'center' | 'left'
}) {
  return (
    <div className={align === 'left' ? 'text-left' : 'text-center'}>
      <p
        className={`font-sans text-xs font-bold uppercase tracking-[0.18em] text-runway-amber ${
          align === 'left' ? '' : ''
        }`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-3 font-serif text-3xl font-normal leading-tight text-oz-deep md:text-4xl">
        {title}
      </h2>
      {subtext ? (
        <p
          className={`mt-4 font-sans text-sm leading-relaxed text-oz-muted ${
            align === 'left' ? 'max-w-2xl' : 'mx-auto max-w-2xl'
          }`}
        >
          {subtext}
        </p>
      ) : null}
    </div>
  )
}

function LandingFeeNote({
  className = '',
  textClassName = 'text-oz-muted',
  iconClassName = 'text-runway-amber',
}: {
  className?: string
  textClassName?: string
  iconClassName?: string
}) {
  return (
    <p className={`mt-3 inline-flex items-start gap-2 font-sans text-xs leading-relaxed ${textClassName} ${className}`}>
      <Icon name="info" className={`mt-[1px] !text-[14px] ${iconClassName}`} />
      <span>+ $28.95 landing fee per flight (not included in hourly rate)</span>
    </p>
  )
}

function CheckList({
  items,
  filled = true,
}: {
  items: string[]
  filled?: boolean
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item} className="flex items-start gap-3">
          <Icon
            name="check_circle"
            filled={filled}
            className={`mt-[1px] shrink-0 !text-[18px] ${filled ? 'text-runway-amber' : 'text-oz-navy'}`}
          />
          <span className="text-sm leading-relaxed text-oz-navy/85">{item}</span>
        </div>
      ))}
    </div>
  )
}

function FeaturePill({
  icon,
  title,
  copy,
  tone = 'navy',
}: {
  icon: string
  title: string
  copy: string
  tone?: 'navy' | 'amber'
}) {
  const circleClassName =
    tone === 'amber'
      ? 'border-[#f3d08b] bg-[#fdf0d5] text-runway-amber'
      : 'border-[#cbd9f2] bg-[#e8efff] text-oz-navy'

  return (
    <article className="rounded-xl border border-mkt-subtle bg-white p-4 shadow-[0_18px_55px_rgba(16,38,74,0.08)]">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${circleClassName}`}>
          <Icon name={icon} className="!text-[20px]" />
        </span>
        <div>
          <h3 className="font-sans text-sm font-semibold text-oz-deep">{title}</h3>
          <p className="mt-1.5 font-sans text-xs leading-relaxed text-[#3a4d70]">{copy}</p>
        </div>
      </div>
    </article>
  )
}

function BookingTypeCardView({ card }: { card: BookingTypeCard }) {
  const isPayf = card.title === 'Pay As You Fly (PAYF)'
  const headerClassName = isPayf ? 'bg-[#07224E]' : 'bg-runway-amber'
  const panelClassName = isPayf ? 'bg-[#EEF4FB]' : 'bg-[#FEFCF4]'

  return (
    <article className="flex h-full flex-col rounded-2xl overflow-hidden shadow-md bg-white">
      <div className={`px-8 pt-8 pb-16 text-center ${headerClassName}`}>
        <p
          className={`text-xs font-bold uppercase tracking-[0.15em] ${
            isPayf ? 'text-runway-amber' : 'text-white'
          }`}
        >
          {isPayf ? 'PAY AS YOU FLY' : 'BLOCK TIME COMBO PACKAGES'}
        </p>
        <h3 className={`mt-2 font-serif text-3xl font-normal ${isPayf ? 'text-white' : 'text-oz-navy'}`}>
          {card.title}
        </h3>
        <p className={`mt-2 text-sm ${isPayf ? 'text-white/70' : 'text-oz-navy/80'}`}>{card.subtitle}</p>
      </div>

      <div className="mx-6 -mt-10 relative z-10">
        <div className={`rounded-xl shadow-md p-6 text-center border border-[#e2e8f0] ${panelClassName}`}>
          {isPayf ? (
            <>
              <p className="font-serif text-4xl text-oz-navy">$330/hr</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#4a5568]">FIXED RATE</p>
              <p className="mt-2 text-xs text-[#3a4d70]">+ $28.95 landing fee per flight (not included in hourly rate)</p>
            </>
          ) : (
            <>
              <p className="font-serif text-4xl text-oz-navy">From $290/hr</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#c8860a]">
                SAVE UP TO $40/HR VS PAYF
              </p>
              <p className="mt-2 text-xs text-[#3a4d70]">+ $28.95 landing fee per flight (not included in hourly rate)</p>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white px-8 pt-6 pb-8">
        <div className="space-y-3">
          {card.bullets.map((item) => (
            <div key={item} className="flex items-center gap-3">
              <Icon name="check_circle" filled className="shrink-0 !text-[20px] text-runway-amber" />
              <span className="text-sm text-[#1e3a5f]">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}

function BillingStepCard({
  title,
  steps,
}: {
  title: string
  steps: BillingStep[]
}) {
  return (
    <article className="rounded-2xl border border-mkt-subtle bg-white p-6 shadow-[0_18px_55px_rgba(16,38,74,0.12)] md:p-7">
      <h3 className="text-center font-serif text-xl font-normal text-oz-deep">{title}</h3>
      <div className="mt-6 grid gap-3 md:grid-cols-4 md:gap-0 md:divide-x md:divide-mkt-subtle">
        {steps.map((step) => (
          <div key={step.title} className="flex flex-col items-center text-center md:px-4">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-mkt-subtle bg-mkt-main text-oz-navy">
              <Icon name={step.icon} className="!text-[20px]" />
            </div>
            <p className="mt-3 font-sans text-base font-semibold text-oz-navy">{step.title}</p>
            <p className="mt-1 max-w-[14rem] font-sans text-sm leading-relaxed text-[#3a4d70]">
              {step.caption}
            </p>
          </div>
        ))}
      </div>
    </article>
  )
}

function FaqItem({ item }: { item: FaqItemType }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-mkt-subtle bg-white shadow-[0_14px_40px_rgba(16,38,74,0.08)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left md:px-5"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-sans text-sm font-medium leading-relaxed text-oz-deep md:text-[0.96rem]">
          {item.question}
        </span>
        <Icon
          name="expand_more"
          className={`shrink-0 text-runway-amber transition-transform duration-300 ${open ? 'rotate-180' : 'rotate-0'}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-mkt-subtle px-4 pb-4 pt-3 font-sans text-sm leading-relaxed text-[#3a4d70] md:px-5">
            {item.answer}
          </div>
        </div>
      </div>
    </div>
  )
}

const HERO_CHIPS = ['Wet Hire', 'GST Included', '$28.95 Per Landing', 'Billed by VDO Hours']

const BOOKING_TYPE_CARDS: BookingTypeCard[] = [
  {
    eyebrow: 'PAY AS YOU FLY',
    title: 'Pay As You Fly (PAYF)',
    subtitle: 'Perfect for occasional flyers.',
    headerClassName: 'bg-[#07224E]',
    pricePanelClassName: 'bg-[#EEF4FB]',
    priceClassName: 'text-3xl leading-none text-oz-navy',
    price: '$330/hr',
    priceCaption: 'FIXED RATE',
    priceCaptionClassName: 'text-[#4a5568]',
    bullets: [
      'No upfront package',
      'Pay for actual flying time',
      'Best for occasional flying',
      'Same rate every hour you fly',
    ],
    features: ['No upfront package', 'Pay for actual flying time', 'Best for occasional flying'],
  },
  {
    eyebrow: 'BLOCK TIME COMBO PACKAGES',
    title: 'Prepaid Block Time Packages',
    subtitle: 'Great for regular flyers, training & hour building.',
    headerClassName: 'bg-runway-amber',
    headerEyebrowClassName: 'text-white',
    headerTitleClassName: 'text-oz-navy',
    headerSubtitleClassName: 'text-oz-navy/80',
    pricePanelClassName: 'bg-[#FEFCF4]',
    priceClassName: 'text-3xl leading-none text-oz-navy',
    price: '$290/hr',
    panelPrice: 'From $290/hr',
    panelPriceClassName: 'text-3xl leading-none text-oz-navy',
    panelCaption: 'SAVE UP TO $40/HR VS PAYF',
    panelCaptionClassName: 'text-[#c8860a]',
    bullets: [
      'Discounted hourly rates',
      'Prepay and save more',
      'Perfect for training & building hours',
      'Use your hours when it suits you',
    ],
    features: ['Discounted hourly rates', 'Prepay and save more', 'Perfect for training & building hours'],
  },
]

const MINIMUM_RULES = [
  { booked: '24 hrs booked', minimum: '4 VDO hrs minimum', exampleFlown: '2.5 hours flown', youPayFor: '4 hours (minimum applies)' },
  { booked: '36 hrs booked', minimum: '6 VDO hrs minimum', exampleFlown: '6 hours flown', youPayFor: '6 hours (minimum applies)' },
  { booked: '48 hrs booked', minimum: '8 VDO hrs minimum', exampleFlown: '5 hours flown', youPayFor: '8 hours (minimum applies)' },
  { booked: '72 hrs booked', minimum: '12 VDO hrs minimum', exampleFlown: '15 hours flown', youPayFor: '15 hours (actual hours)' },
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
    title: '$28.95 Per Landing',
    copy: 'A flat $28.95 charge applies per landing.',
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

const BLOCK_TIME_PACKAGES = [
  {
    name: 'Starter Block',
    hours: '10 hours',
    rate: '$320',
    rateSuffix: '/hr',
    total: '$3,200',
    savingsPerHr: '$10/hr',
    validityDays: 30,
    description: 'Best for pilots who fly a few times a month and want a lower locked-in hourly rate.',
    accent: 'from-[#f5b429] via-[#f2a51d] to-[#de8d12]',
    featured: false,
    badge: 'Entry package',
    features: ['Ideal for getting started', 'Great for occasional training', 'Use within 1 month'],
  },
  {
    name: 'Regular Block',
    hours: '25 hours',
    rate: '$310',
    rateSuffix: '/hr',
    total: '$7,750',
    savingsPerHr: '$20/hr',
    validityDays: 60,
    description: 'A balanced option for active pilots who want better value without a long commitment.',
    accent: 'from-[#8ab3ff] via-[#5f86e9] to-[#315fd8]',
    featured: false,
    badge: 'Most popular',
    features: ['Popular with regular flyers', 'Perfect for training', 'Use within 2 months'],
  },
  {
    name: 'Committed Block',
    hours: '50 hours',
    rate: '$300',
    rateSuffix: '/hr',
    total: '$15,000',
    savingsPerHr: '$30/hr',
    validityDays: 90,
    description: 'Ideal for regular flying with stronger savings and enough runway for ongoing use.',
    accent: 'from-[#9ad6ff] via-[#6fb7f8] to-[#2f7fd6]',
    featured: true,
    badge: 'Best value',
    features: ['Best value for frequent flyers', 'Ideal for hour building', 'Use within 3 months'],
  },
  {
    name: 'Pro Block',
    hours: '100 hours',
    rate: '$290',
    rateSuffix: '/hr',
    total: '$29,000',
    savingsPerHr: '$40/hr',
    validityDays: 180,
    description: 'The strongest per-hour savings for pilots flying consistently throughout the year.',
    accent: 'from-[#2d59d6] via-[#234ab2] to-[#17317a]',
    featured: false,
    badge: 'Top tier',
    features: ['Maximum savings', 'Built for serious flyers', 'Use within 6 months'],
  },
]

const PAYF_RATE = 330

function buildBlockTimeLoginHref(packageName: string) {
  const packageSlug = packageName.toLowerCase().replace(/\s+/g, '-')
  const nextPath = `/dashboard/block-time?package=${packageSlug}`
  return `/login?next=${encodeURIComponent(nextPath)}`
}

function formatValidityMonths(validityDays: number) {
  const months = Math.round(validityDays / 30)
  return `Valid for ${months} ${months === 1 ? 'month' : 'months'}`
}

function parseRateAmount(rate: string) {
  return Number(rate.replace(/[^0-9.]/g, ''))
}

function formatSavings(rate: string) {
  return PAYF_RATE - parseRateAmount(rate)
}

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
    answer: 'No. A $28.95 charge applies per landing.',
  },
  {
    question: 'How does the multi-day minimum work?',
    answer:
      'For bookings of 24 hours or longer, minimum billable VDO time is pro-rated at 4 VDO hours per 24 hours booked. For example, 36 hours booked has a 6 VDO hour minimum.',
  },
]

const PAYF_BILLING_STEPS: BillingStep[] = [
  { title: 'Book your flight', icon: 'calendar_month', caption: 'Choose aircraft and time.' },
  { title: 'Fly', icon: 'flight', caption: 'Enjoy your time in the air.' },
  { title: 'Pay by the hour', icon: 'credit_card', caption: 'Billed at $330/hr for actual time flown.' },
  { title: 'Receive invoice', icon: 'receipt_long', caption: 'Transparent invoice sent after flight.' },
]

const BLOCK_BILLING_STEPS: BillingStep[] = [
  { title: 'Choose a package', icon: 'calendar_month', caption: 'Pick the block that suits your needs.' },
  { title: 'Pay upfront', icon: 'flight', caption: 'Secure your hours with payment.' },
  { title: 'Fly & use hours', icon: 'credit_card', caption: 'Hours are deducted as you fly.' },
  { title: 'Receive invoice', icon: 'receipt_long', caption: 'Monthly statement of hours used.' },
]

export default function PricingPage() {
  return (
    <main className="relative overflow-x-hidden bg-mkt-main text-oz-deep">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_9%,rgba(39,79,146,0.28),transparent_35%),radial-gradient(circle_at_80%_45%,rgba(18,53,108,0.24),transparent_40%),radial-gradient(circle_at_55%_82%,rgba(10,37,76,0.2),transparent_44%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_20%_30%,#8ca8d6_1px,transparent_1px),radial-gradient(circle_at_80%_60%,#8ca8d6_1px,transparent_1px)] [background-size:34px_34px,46px_46px]" />

      <section className="hero-fade-to-main relative flex min-h-[560px] items-center overflow-hidden px-6 pb-20 pt-24 md:min-h-[760px] md:px-12 lg:px-20">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/optimized/pricing-hero-1400.jpg")', opacity: 0.82 }}
        />
        <div
          className="absolute inset-0 z-0"
          style={{ background: 'linear-gradient(to right, rgba(5,15,40,0.55) 0%, rgba(5,15,40,0.15) 60%, rgba(5,15,40,0.0) 100%)' }}
        />

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
                Simple hourly pricing based on VDO hours flown. Wet Hire and GST included. $28.95 per landing.
              </p>
            </StaggerItem>
          </StaggerContainer>
          <FadeUp delay={0.15} duration={1}>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="/pilotRequirements"
                className="inline-flex rounded-md bg-runway-amber px-8 py-4 font-sans text-[0.79rem] font-bold uppercase tracking-[0.15em] text-oz-deep transition-colors duration-300 hover:bg-runway-amber-hot"
              >
                Get Approved to Fly
              </a>
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="relative overflow-hidden bg-white px-6 py-24 md:px-12 lg:px-20">
        <AtmoClouds shapes={['A', 'C']} extraDarkCloud />
        <div className="relative z-10 mx-auto max-w-7xl">
          <FadeUp duration={1.05} viewportMargin="-80px">
            <SectionHeading
              eyebrow="STEP 1"
              title="Choose your booking type"
              subtext="Two simple ways to book. Pick what works best for your flying."
            />
          </FadeUp>

          <StaggerContainer className="mt-10 grid grid-cols-2 gap-6 items-stretch" staggerDelay={0.12} viewportMargin="-80px">
            {BOOKING_TYPE_CARDS.map((card) => (
              <StaggerItem key={card.title} duration={0.9}>
                <BookingTypeCardView card={card} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      <section className="w-full bg-white px-4 py-20 md:px-8 lg:px-16" style={{ backgroundColor: '#ffffff' }}>
        <div className="mx-auto max-w-6xl">
          <div style={{ backgroundColor: '#ffffff' }}>
            <div className="text-left">
        <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.15em] text-runway-amber">
                  CHOOSE YOUR BOOKING TYPE
                </span>
              </div>
              <h2 className="mb-3 font-serif text-4xl font-normal text-oz-navy md:text-5xl">
                Two booking options. One clear choice.
              </h2>
              <p className="mb-10 text-base text-[#1e3a5f]">
                Compare Pay As You Fly with Block Time Combo Packages.
              </p>

              <div className="overflow-x-auto">
                <div
                  className="rounded-2xl overflow-hidden border-2 border-[#c8d8ea] shadow-2xl"
                  style={{ backgroundColor: '#ffffff' }}
                >
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th
                          className="bg-[#f0f4f9] px-6 py-5 text-left border-b-2 border-r border-[#c8d8ea] w-[30%]"
                          style={{ backgroundColor: '#f0f4f9' }}
                        >
                          <span className="text-sm font-bold tracking-[0.15em] uppercase text-[#07224E]">FEATURE</span>
                        </th>
                        <th className="bg-[#07224E] px-6 py-5 border-b-2 border-r border-[#1a3a6e] w-[35%]">
                          <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-full border-2 border-white/40 flex items-center justify-center shrink-0">
                              <Icon name="near_me" className="text-white text-xl" />
                            </div>
                            <div>
                              <p className="text-white font-bold text-base tracking-widest">PAY AS YOU FLY</p>
                              <p className="text-white/70 text-base mt-0.5">(PAYF)</p>
                            </div>
                          </div>
                        </th>
                        <th
                          className="bg-[#c8dff5] px-6 py-5 border-b-2 border-[#c8d8ea] w-[35%]"
                          style={{ backgroundColor: '#ddeaf8' }}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-full bg-white border-2 border-[#07224E]/20 flex items-center justify-center shrink-0">
                              <Icon name="sell" className="text-[#07224E] text-xl" />
                            </div>
                            <div>
                              <p className="text-[#07224E] font-bold text-base tracking-widest">BLOCK TIME COMBO PACKAGES</p>
                            </div>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          icon: 'schedule',
                          feature: 'Upfront payment',
                          payf: 'None',
                          block: 'Yes',
                        },
                        {
                          icon: 'timer',
                          feature: 'Hourly rate',
                          payf: '$330/hr',
                          payfCaption: 'Fixed, regardless of hours flown',
                          block: 'From $290/hr',
                          blockCaption: 'Lower rates with more hours',
                        },
                        {
                          icon: 'groups',
                          feature: 'Best for',
                          payf: 'Short flights or uncertain schedules',
                          block: 'Frequent flyers and planned flying',
                        },
                        {
                          icon: 'receipt_long',
                          feature: 'Billing',
                          payf: 'Billed after each flight',
                          block: 'Billed upfront for selected block',
                        },
                        {
                          icon: 'do_not_disturb_on',
                          feature: 'Commitment',
                          payf: 'No commitment',
                          block: 'Commit to a block of hours',
                        },
                        {
                          icon: 'savings',
                          feature: 'Savings',
                          payf: 'Standard rate',
                          block: 'Save up to $40/hr vs PAYF',
                        },
                      ].map((row) => (
                        <tr key={row.feature} className="border-b border-[#b8cee0] last:border-b-0">
                          <td
                            className="bg-[#f7f9fc] px-6 py-5 border-r border-[#dce6f0]"
                            style={{ backgroundColor: '#f7f9fc' }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-[#07224E] flex items-center justify-center shrink-0">
                                <Icon name={row.icon} className="text-white text-[18px]" />
                              </div>
                              <span className="text-base font-semibold text-[#07224E]">{row.feature}</span>
                            </div>
                          </td>
                          <td
                            className="bg-white px-6 py-5 border-r border-[#dce6f0] border-l-4 border-l-runway-amber align-top"
                            style={{ backgroundColor: '#ffffff' }}
                          >
                            <p className="text-base font-medium text-[#07224E]">{row.payf}</p>
                            {row.payfCaption ? (
                              <p className="mt-1 text-sm text-[#8a96a8]">{row.payfCaption}</p>
                            ) : null}
                          </td>
                          <td className="bg-white px-6 py-5 align-top" style={{ backgroundColor: '#ffffff' }}>
                            <p className="text-base font-medium text-[#07224E]">{row.block}</p>
                            {row.blockCaption ? (
                              <p className="mt-1 text-sm text-[#8a96a8]">{row.blockCaption}</p>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden px-6 py-24 md:px-12 lg:px-20" style={{ backgroundColor: '#07224E' }}>
        <div className="relative z-10 mx-auto max-w-7xl">
          <FadeUp duration={1.05} viewportMargin="-80px">
            <div className="mb-3 text-center">
              <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.15em] text-runway-amber">
                BLOCK TIME COMBO PACKAGES
              </p>
              <h2 className="mb-3 text-center font-serif text-4xl font-normal text-white md:text-5xl">
                Save more with prepaid flying hours
              </h2>
              <p className="mb-12 text-center text-base text-white/60">Lock in your hours and reduce your hourly rate.</p>
            </div>
          </FadeUp>

          <StaggerContainer className="grid grid-cols-1 gap-6 items-stretch sm:grid-cols-2 lg:grid-cols-4" staggerDelay={0.1} viewportMargin="-80px">
            {BLOCK_TIME_PACKAGES.map((pkg) => {
              const hoursNum = pkg.hours.split(' ')[0]
              const isFeatured = pkg.featured === true

              return (
                <StaggerItem key={pkg.name} duration={0.85}>
                  <article
                    className={`relative flex flex-col rounded-2xl p-6 ${isFeatured ? 'border-2 border-runway-amber' : 'border border-white/20'}`}
                    style={{ backgroundColor: isFeatured ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)' }}
                  >
                    {isFeatured ? (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <span className="whitespace-nowrap rounded-full bg-runway-amber px-4 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-oz-navy">
                          MOST POPULAR
                        </span>
                      </div>
                    ) : null}

                    <h3
                      className={`font-serif text-xl font-normal text-white text-center mb-1 ${isFeatured ? 'mt-4' : 'mt-0'}`}
                    >
                      {pkg.name}
                    </h3>

                    <div className="my-3 text-center">
                      <span className="font-serif text-7xl font-normal leading-none text-white">{hoursNum}</span>
                      <p className="mt-1 text-sm text-white/50">hours</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/50">{formatValidityMonths(pkg.validityDays)}</p>
                    </div>

                    <div className="my-4 border-t border-white/15" />

                    <div className="my-3 text-center">
                      <p className="mb-1 text-base text-white/40 line-through">$330/hr</p>
                      <p className="inline-flex items-baseline gap-1">
                        <span className="font-serif text-3xl font-normal text-runway-amber">{pkg.rate}</span>
                        <span className="text-xs font-semibold text-white/50">{pkg.rateSuffix}</span>
                      </p>
                    </div>

                    <div className="my-4 border-t border-white/15" />

                    <div className="mb-4 text-center">
                      <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-white/40">TOTAL</p>
                      <p className="text-xl font-semibold text-white">{pkg.total}</p>
                    </div>

                    <div className="mb-4 border-t border-white/15" />

                    <div className="mb-6 text-center">
                      <p className="text-sm font-semibold text-white">Save {pkg.savingsPerHr}</p>
                      <p className="mt-0.5 text-xs text-white/50">vs PAYF</p>
                    </div>

                    <div className="flex-1" />

                    <a
                      href={buildBlockTimeLoginHref(pkg.name)}
                      className={`block w-full rounded-lg px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.12em] transition-colors ${
                        isFeatured
                          ? 'bg-runway-amber text-oz-navy hover:bg-runway-amber-hot'
                          : 'border border-white/30 text-white hover:bg-white/10'
                      }`}
                    >
                      {isFeatured ? 'BUY COMMITTED COMBO' : `BUY ${pkg.name.split(' ')[0].toUpperCase()} COMBO`}
                    </a>
                  </article>
                </StaggerItem>
              )
            })}
          </StaggerContainer>

          <div
            className="mt-10 grid grid-cols-1 gap-6 rounded-2xl border border-white/15 p-6 md:grid-cols-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
          >
            <div className="flex items-start gap-4">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                <Icon name="sell" className="text-xl text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Rates locked in</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/50">Lock in today's rate for your pre-paid hours.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                <Icon name="schedule" className="text-xl text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Use at your pace</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/50">Each package has its own validity period.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                <Icon name="swap_horiz" className="text-xl text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Fully transferable</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/50">Transfer your block to another eligible pilot.</p>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-white/30">All flights are subject to aircraft availability and standard booking conditions.</p>
        </div>
      </section>

      <section className="relative overflow-hidden bg-mkt-alt px-6 py-24 md:px-12 lg:px-20">
        <FadeUp className="relative z-10 mx-auto max-w-7xl" duration={1.05} viewportMargin="-80px">
          <SectionHeading eyebrow="HOW BILLING WORKS" title="Simple, Transparent Billing" />

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <BillingStepCard title="Pay As You Fly (PAYF)" steps={PAYF_BILLING_STEPS} />
            <BillingStepCard title="Block Time Packages" steps={BLOCK_BILLING_STEPS} />
          </div>
        </FadeUp>
      </section>

      <section className="relative overflow-hidden bg-white px-6 py-24 md:px-12 lg:px-20">
        <div className="mx-auto max-w-7xl">
          <FadeUp duration={1.05} viewportMargin="-80px">
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.15em] text-runway-amber">
              WHAT'S INCLUDED
            </p>
            <h2 className="mb-12 text-center font-serif text-4xl font-normal text-oz-navy">
              Everything you need for a great flight
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {INCLUDED_CARDS.map((card, index) => (
                <div key={index} className="flex items-start gap-4 rounded-xl border border-[#e2eaf5] bg-white p-5">
                  <div className="mt-0.5 shrink-0">
                    <Icon name={card.icon} className="!text-[28px] text-[#1a4fd6]" />
                  </div>

                  <div>
                    <p className="text-lg font-semibold leading-snug text-[#0f2d6e]">{card.title}</p>
                    <p className="mt-1 text-base leading-relaxed text-[#6b7a99]">{card.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="relative overflow-hidden bg-mkt-alt px-6 py-20 md:px-12 lg:px-20">
        <div className="mx-auto max-w-7xl rounded-3xl bg-white px-6 py-10 md:px-10 md:py-12 shadow-[0_18px_55px_rgba(16,38,74,0.12)]">
          <FadeUp duration={1.05} viewportMargin="-80px">
            <SectionHeading eyebrow="FREQUENTLY ASKED QUESTIONS" title="FAQ" />
            <div className="mt-8 grid gap-3 grid-cols-1">
              {FAQ_ITEMS.map((item) => (
                <FaqItem key={item.question} item={item} />
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      <PreFooterCTA
        heading="Ready to Fly?"
        subtext="Get approved and start booking with transparent, competitive aircraft hire pricing."
        ctaLabel="Get Approved"
        ctaHref="/login"
      />
    </main>
  )
}
