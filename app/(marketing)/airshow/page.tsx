'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Icon helper ──────────────────────────────────────────────────────────────

function Icon({
  name,
  className = '',
  fill = false,
  color,
}: {
  name: string
  className?: string
  fill?: boolean
  color?: string
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        ...(fill ? { fontVariationSettings: "'FILL' 1" } : {}),
        ...(color ? { color } : {}),
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}

// ─── Auth-aware checkout CTA ──────────────────────────────────────────────────

function CheckoutCTA({
  className = '',
  style,
  children,
}: {
  className?: string
  style?: Record<string, string | number>
  children: React.ReactNode
}) {
  const [href, setHref] = useState('/login')

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) setHref('/dashboard/checkout')
      })
  }, [])

  return (
    <a href={href} className={className} style={style}>
      {children}
    </a>
  )
}

// ─── Static data ──────────────────────────────────────────────────────────────

const PERFECT_FOR_CARDS = [
  {
    icon: 'photo_camera',
    title: 'Scenic Coastal Flights',
    body: 'Experience the coastline and city from above.',
    image: '/LandingPage/perfect-scenic.png',
    alt: 'Scenic coastal flight view',
  },
  {
    icon: 'adjust',
    title: 'Proficiency Flying',
    body: 'Stay sharp, maintain currency, and build confidence.',
    image: '/LandingPage/perfect-flying.png',
    alt: 'Pilot cockpit view for proficiency flying',
  },
  {
    icon: 'timer',
    title: 'Hour Building',
    body: 'Build hours steadily in a reliable, efficient aircraft.',
    image: '/LandingPage/perfect-hour.png',
    alt: 'Aircraft flying at sunset for hour building',
  },
  {
    icon: 'restaurant',
    title: '$100 Burger',
    body: 'The ideal platform for quick weekend getaways, short cross-country hops, and flying out for lunch.',
    image: '/LandingPage/perfect-burger.png',
    alt: 'Weekend flying destination for a $100 burger trip',
  },
]

const WHY_CARDS = [
  {
    icon: 'local_gas_station',
    title: 'Wet Hire',
    body: 'Fuel included and simple to understand.',
    image: '/LandingPage/wethire.png',
  },
  {
    icon: 'sell',
    title: 'Transparent Pricing',
    body: 'Clear VDO-based rates with no hidden surprises.',
    image: '/LandingPage/pricing.png',
  },
  {
    icon: 'cloud_upload',
    title: 'Fast Online Checkout',
    body: 'Book your checkout and upload documents online.',
    image: '/LandingPage/online.png',
  },
  {
    icon: 'verified_user',
    title: 'Trusted Cessna 172N',
    body: 'A familiar, reliable aircraft for private hire.',
    image: '/LandingPage/cessna172.png',
  },
]

const STEPS = [
  {
    num: '01',
    icon: 'person',
    title: 'Create Account',
    body: 'Set up your pilot profile online.',
  },
  {
    num: '02',
    icon: 'edit_calendar',
    title: 'Book Checkout Flight',
    body: 'Choose your preferred date and time.',
  },
  {
    num: '03',
    icon: 'flight_takeoff',
    title: 'Get Cleared to Fly',
    body: 'After your checkout is confirmed, you can book future hire online.',
  },
] as const


// ─── Section title with yellow wing accent ────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center mb-12 md:mb-16">
      <div className="flex items-center justify-center gap-5 mb-3">
        <div
          className="h-px flex-1"
          style={{
            maxWidth: '140px',
            background: 'linear-gradient(90deg, transparent, rgba(242,188,27,0.72))',
          }}
        />
        <h2
          className="font-serif text-white tracking-[0.10em] leading-tight"
          style={{ fontSize: 'clamp(22px, 3.2vw, 38px)' }}
        >
          {children}
        </h2>
        <div
          className="h-px flex-1"
          style={{
            maxWidth: '140px',
            background: 'linear-gradient(90deg, rgba(242,188,27,0.72), transparent)',
          }}
        />
      </div>
      {/* Yellow diamond accent */}
      <div className="flex items-center justify-center gap-2">
        <div className="h-px w-10" style={{ background: 'rgba(242,188,27,0.38)' }} />
        <div className="w-2 h-2 rotate-45" style={{ background: '#F2BC1B' }} />
        <div className="h-px w-10" style={{ background: 'rgba(242,188,27,0.38)' }} />
      </div>
    </div>
  )
}

// ─── Shared CTA styles (used by hero + ready section) ────────────────────────

const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-2 rounded-[11px] font-bold uppercase tracking-[0.04em] transition-all hover:-translate-y-0.5 active:scale-[0.98] whitespace-nowrap'

const PRIMARY_BTN_STYLE: Record<string, string | number> = {
  background: '#DFA811',
  color: '#04172A',
  boxShadow: '0 10px 24px rgba(0,0,0,0.22)',
  paddingTop: '13px',
  paddingBottom: '13px',
  paddingLeft: '26px',
  paddingRight: '26px',
  fontSize: '14px',
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AirshowPage() {
  const howItWorksRef = useRef<HTMLElement>(null)


  return (
    <div
      className="overflow-x-hidden"
      style={{ background: '#031321', color: '#F5F7FB' }}
    >

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 — HERO
      ════════════════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden"
        style={{ minHeight: '720px', background: '#031321' }}
      >
        {/* ── Mobile: full-cover background image ── */}
        <div
          className="absolute inset-0 md:hidden"
          style={{
            backgroundImage: "url('/LandingPage/hero.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center right',
          }}
        />

        {/* ── Desktop: aircraft image as a natural right-side layer ──
            height: 108% lets the image breathe without aggressive crop;
            the left-to-right gradient overlay fades it into the dark left area */}
        <div
          className="absolute inset-y-0 right-0 hidden md:block overflow-hidden"
          style={{ width: '64%', zIndex: 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/LandingPage/hero.png"
            alt=""
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              height: '108%',
              width: 'auto',
              maxWidth: 'none',
            }}
          />
        </div>

        {/* ── Desktop gradient: solid dark on left, fades to transparent right ── */}
        <div
          className="absolute inset-0 hidden md:block pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, #031321 0%, #031321 30%, rgba(3,17,32,0.92) 44%, rgba(3,17,32,0.44) 64%, rgba(3,17,32,0.08) 100%)',
            zIndex: 1,
          }}
        />

        {/* ── Mobile overlay ── */}
        <div
          className="absolute inset-0 md:hidden"
          style={{ background: 'rgba(3,17,32,0.86)', zIndex: 1 }}
        />

        {/* ── Bottom fade into next section ── */}
        <div
          className="absolute bottom-0 inset-x-0 pointer-events-none"
          style={{
            height: '110px',
            background: 'linear-gradient(180deg, rgba(3,17,32,0) 70%, #031321 100%)',
            zIndex: 2,
          }}
        />

        {/* ── Left hero content ── */}
        <div
          className="relative mx-auto max-w-[1280px] px-8 md:px-10"
          style={{
            zIndex: 10,
            paddingTop: 'clamp(100px, 14vh, 136px)',
            paddingBottom: 'clamp(72px, 11vh, 100px)',
          }}
        >
          <div className="md:max-w-[500px]">

            {/* H1 */}
            <h1
              className="font-serif text-white mb-6"
              style={{
                fontSize: 'clamp(30px, 3.6vw, 44px)',
                lineHeight: 1.10,
                fontWeight: 600,
              }}
            >
              Private Cessna 172N
              <br />
              Hire <span style={{ color: '#F2BC1B' }}>Made Simple</span>
            </h1>

            {/* Pricing card */}
            <div
              className="mb-5"
              style={{
                background: 'rgba(5,22,41,0.72)',
                border: '1px solid rgba(140,185,235,0.22)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 12px 34px rgba(0,0,0,0.24)',
                borderRadius: '14px',
                padding: '18px 22px',
                maxWidth: '440px',
              }}
            >
              {/* Launch Offer pill inside card */}
              <div
                className="inline-flex items-center gap-1.5 rounded-full mb-4"
                style={{
                  background: 'rgba(7,24,45,0.70)',
                  border: '1px solid rgba(242,188,27,0.52)',
                  padding: '6px 12px',
                }}
              >
                <Icon name="bolt" className="text-[12px]" color="#F2BC1B" />
                <span
                  className="font-bold uppercase"
                  style={{ fontSize: '11px', letterSpacing: '0.10em', color: '#F2BC1B' }}
                >
                  Launch Offer
                </span>
              </div>

              {/* Price row */}
              <div className="mb-3">
                <p
                  className="font-medium line-through leading-none mb-2"
                  style={{ fontSize: 'clamp(16px, 1.8vw, 19px)', color: 'rgba(245,247,251,0.45)' }}
                >
                  Usually $330/hr
                </p>
                <p className="font-bold leading-tight" style={{ color: '#F2BC1B', fontSize: 'clamp(24px, 3.1vw, 32px)' }}>
                  Checkout flight launch rate: $290/hr VDO
                </p>
              </div>

              {/* Benefits */}
              <p style={{ fontSize: '13px', color: 'rgba(245,247,251,0.80)' }}>
                Fuel included
                <span className="mx-1.5" style={{ color: '#F2BC1B' }}>•</span>
                GST included
                <span className="mx-1.5" style={{ color: '#F2BC1B' }}>•</span>
                + landing fee
              </p>
            </div>

            {/* Location */}
            <div className="flex items-center gap-1.5" style={{ marginTop: '18px', marginBottom: '12px' }}>
              <Icon name="location_on" className="text-[17px]" color="#F2BC1B" />
              <span style={{ fontSize: '14px', color: 'rgba(245,247,251,0.78)' }}>
                Based at Bankstown Airport, YSBK
              </span>
            </div>

            {/* Support line */}
            <p
              className="mb-7"
              style={{
                fontSize: '14px',
                lineHeight: 1.55,
                color: 'rgba(245,247,251,0.70)',
                maxWidth: '390px',
                marginTop: '10px',
              }}
            >
              Start with a checkout flight. Once cleared, you can book future
              aircraft hire online.
            </p>

            {/* CTA */}
            <div>
              <CheckoutCTA className={PRIMARY_BTN} style={PRIMARY_BTN_STYLE}>
                <Icon name="flight_takeoff" className="text-[16px]" fill color="#04172A" />
                Book Your Checkout Flight
              </CheckoutCTA>
            </div>

          </div>
        </div>

      </section>

      {/* ── Middle background band: Sections 2, 3, 4 share one continuous image ── */}
      <div
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(3,17,32,0.60) 0%, rgba(3,17,32,0.48) 50%, rgba(3,17,32,0.60) 100%), url('/LandingPage/long-bg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'top center',
          backgroundRepeat: 'no-repeat',
        }}
      >

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 — WHY PILOTS CHOOSE US
      ════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-14 md:py-[68px]"
        style={{
          background: 'transparent',
          borderTop: '1px solid rgba(120,170,230,0.10)',
        }}
      >
        <div className="mx-auto max-w-[1280px] px-5 md:px-10">

          {/* ── Section heading with triple-line aviation wings ── */}
          <div className="text-center mb-10 md:mb-12">

            {/* Desktop: title flanked by 3-line speed-line wings */}
            <div className="hidden sm:flex items-center justify-center gap-6 md:gap-8">

              {/* Left wing — longest line outermost, tapers inward */}
              <div className="flex flex-col items-end gap-[7px] flex-shrink-0 self-center">
                <div style={{ width: '90px', height: '1.5px', background: 'rgba(242,188,27,0.60)' }} />
                <div style={{ width: '62px', height: '1px', background: 'rgba(242,188,27,0.36)' }} />
                <div style={{ width: '36px', height: '1px', background: 'rgba(242,188,27,0.18)' }} />
              </div>

              <h2
                className="font-serif text-white tracking-[0.10em] leading-tight flex-shrink-0"
                style={{ fontSize: 'clamp(26px, 2.8vw, 36px)', fontWeight: 600 }}
              >
                WHY PILOTS CHOOSE US
              </h2>

              {/* Right wing — mirrored */}
              <div className="flex flex-col items-start gap-[7px] flex-shrink-0 self-center">
                <div style={{ width: '90px', height: '1.5px', background: 'rgba(242,188,27,0.60)' }} />
                <div style={{ width: '62px', height: '1px', background: 'rgba(242,188,27,0.36)' }} />
                <div style={{ width: '36px', height: '1px', background: 'rgba(242,188,27,0.18)' }} />
              </div>
            </div>

            {/* Mobile: simplified single-line flanks */}
            <div className="flex sm:hidden items-center justify-center gap-4">
              <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(242,188,27,0.55))' }} />
              <h2
                className="font-serif text-white tracking-[0.10em] leading-tight flex-shrink-0"
                style={{ fontSize: 'clamp(22px, 6vw, 28px)', fontWeight: 600 }}
              >
                WHY PILOTS CHOOSE US
              </h2>
              <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(242,188,27,0.55), transparent)' }} />
            </div>

            {/* Yellow diamond divider */}
            <div className="flex items-center justify-center gap-2 mt-3">
              <div style={{ width: '32px', height: '1px', background: 'rgba(242,188,27,0.32)' }} />
              <div style={{ width: '6px', height: '6px', background: '#F2BC1B', transform: 'rotate(45deg)', borderRadius: '1px' }} />
              <div style={{ width: '32px', height: '1px', background: 'rgba(242,188,27,0.32)' }} />
            </div>
          </div>

          {/* ── Cards grid — image-led with bottom text band ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-[22px]">
            {WHY_CARDS.map((card) => (
              <div
                key={card.title}
                className="relative overflow-hidden rounded-[19px] transition-all hover:-translate-y-1 flex flex-col"
                style={{
                  minHeight: '280px',
                  background: '#07192E',
                  border: '1px solid rgba(120,170,230,0.18)',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
                }}
              >
                {/* Full-card background image — no overlay, full visibility */}
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url('${card.image}')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />

                {/* Icon badge — top-left corner, above the image */}
                <div
                  className="absolute z-20 flex items-center justify-center rounded-full"
                  style={{
                    top: '14px',
                    left: '14px',
                    width: '48px',
                    height: '48px',
                    border: '1px solid rgba(242,188,27,0.50)',
                    background: 'rgba(3,17,32,0.62)',
                    backdropFilter: 'blur(6px)',
                  }}
                >
                  <Icon name={card.icon} className="text-[22px]" color="#F2BC1B" fill />
                </div>

                {/* Text band — bottom of card only, glass panel feel */}
                <div
                  className="absolute bottom-0 inset-x-0 z-10 px-4 pt-5 pb-5"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(3,17,32,0.02) 0%, rgba(3,17,32,0.74) 28%, rgba(3,17,32,0.92) 100%)',
                  }}
                >
                  <h3
                    className="font-semibold text-white mb-1.5"
                    style={{ fontSize: '20px', lineHeight: 1.2 }}
                  >
                    {card.title}
                  </h3>
                  <p
                    style={{
                      fontSize: '14px',
                      lineHeight: 1.50,
                      color: 'rgba(245,247,251,0.78)',
                    }}
                  >
                    {card.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 3 — WHAT'S INCLUDED
      ════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-16 md:py-20"
        style={{ background: 'transparent' }}
      >
        <div className="mx-auto max-w-[1320px] px-5 md:px-10 lg:px-12">
          {/* Contained panel */}
          <div
            className="rounded-[24px]"
            style={{
              background:
                'linear-gradient(180deg, rgba(8,30,55,0.92), rgba(5,22,41,0.94))',
              border: '1px solid rgba(242,188,27,0.26)',
              boxShadow:
                '0 24px 72px rgba(0,0,0,0.46), 0 0 0 1px rgba(242,188,27,0.08)',
              padding: 'clamp(28px, 3.6vw, 48px) clamp(24px, 3.4vw, 46px)',
            }}
          >
            {/* Panel heading */}
            <div className="text-center mb-10 md:mb-12">
              <div className="flex items-center justify-center gap-5 mb-3">
                <div
                  className="hidden sm:block h-px flex-1"
                  style={{
                    maxWidth: '80px',
                    background: 'linear-gradient(90deg, transparent, rgba(242,188,27,0.55))',
                  }}
                />
                <h2
                  className="font-serif text-white text-center tracking-[0.08em] leading-tight"
                  style={{ fontSize: 'clamp(19px, 3vw, 35px)' }}
                >
                  WHAT&apos;S INCLUDED IN THE LAUNCH OFFER
                </h2>
                <div
                  className="hidden sm:block h-px flex-1"
                  style={{
                    maxWidth: '80px',
                    background: 'linear-gradient(90deg, rgba(242,188,27,0.55), transparent)',
                  }}
                />
              </div>
              {/* Yellow accent line */}
              <div className="flex items-center justify-center gap-2">
                <div className="h-px w-10" style={{ background: 'rgba(242,188,27,0.36)' }} />
                <div className="w-1.5 h-1.5 rotate-45" style={{ background: '#F2BC1B' }} />
                <div className="h-px w-10" style={{ background: 'rgba(242,188,27,0.36)' }} />
              </div>
            </div>

            {/* 3 equal cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">

              {/* Card 1 — What's included */}
              <div
                className="rounded-[16px] p-5 md:p-6"
                style={{
                  background: 'rgba(4,16,34,0.72)',
                  border: '1px solid rgba(120,170,230,0.18)',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
                }}
              >
                <h3 className="font-bold mb-4" style={{ fontSize: '15px', color: '#F2BC1B', letterSpacing: '0.02em' }}>
                  What&apos;s included
                </h3>
                <ul className="space-y-3.5">
                  {['Cessna 172N aircraft hire', 'Fuel included', 'GST included', 'Online booking after clearance'].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Icon name="check" className="text-[16px] mt-0.5 flex-shrink-0" color="#34d399" />
                      <span style={{ fontSize: '14px', color: 'rgba(245,247,251,0.82)', lineHeight: 1.5 }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Card 2 — How checkout works */}
              <div
                className="rounded-[16px] p-5 md:p-6"
                style={{
                  background: 'rgba(4,16,34,0.72)',
                  border: '1px solid rgba(120,170,230,0.18)',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
                }}
              >
                <h3 className="font-bold mb-4" style={{ fontSize: '15px', color: '#F2BC1B', letterSpacing: '0.02em' }}>
                  How checkout works
                </h3>
                <ul className="space-y-3.5">
                  {[
                    'First flight is a checkout flight with our team',
                    'Launch checkout rate: $290/hr VDO',
                    'Standard checkout rate is usually $330/hr',
                    'Landing fees apply at $25 per landing',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Icon name="info" className="text-[16px] mt-0.5 flex-shrink-0" color="#60a5fa" />
                      <span style={{ fontSize: '14px', color: 'rgba(245,247,251,0.82)', lineHeight: 1.5 }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Card 3 — Ideal for */}
              <div
                className="rounded-[16px] p-5 md:p-6"
                style={{
                  background: 'rgba(4,16,34,0.72)',
                  border: '1px solid rgba(120,170,230,0.18)',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
                }}
              >
                <h3 className="font-bold mb-4" style={{ fontSize: '15px', color: '#F2BC1B', letterSpacing: '0.02em' }}>
                  Ideal for
                </h3>
                <ul className="space-y-3.5">
                  {[
                    'New PPL holders',
                    'Returning pilots',
                    'Licence conversions',
                    'Pilots wanting private Cessna 172N hire',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Icon name="person_check" className="text-[16px] mt-0.5 flex-shrink-0" color="#F2BC1B" />
                      <span style={{ fontSize: '14px', color: 'rgba(245,247,251,0.82)', lineHeight: 1.5 }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Note strip */}
            <div
              className="flex items-start gap-3 mt-6 rounded-[12px] px-4 py-3.5"
              style={{
                background: 'rgba(4,14,28,0.60)',
                border: '1px solid rgba(120,170,230,0.12)',
              }}
            >
              <Icon name="info" className="text-[17px] mt-0.5 flex-shrink-0" color="rgba(200,218,242,0.48)" />
              <p style={{ fontSize: '13px', color: 'rgba(245,247,251,0.66)', lineHeight: 1.55 }}>
                Once cleared, you can book future aircraft hire online through the OZ Rent A Plane platform.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 4 — HOW IT WORKS
      ════════════════════════════════════════════════════════════════════ */}
      <section
        id="how-it-works"
        ref={howItWorksRef}
        className="py-20 md:py-24"
        style={{
          background: 'transparent',
          borderTop: '1px solid rgba(120,170,230,0.10)',
        }}
      >
        <div className="mx-auto max-w-[1320px] px-5 md:px-10 lg:px-12">
          <SectionTitle>HOW IT WORKS</SectionTitle>

          {/* ── Desktop: horizontal timeline ── */}
          <div className="hidden md:grid md:grid-cols-3 gap-6 relative">
            {/* Dotted connector line — centres at 1/6 and 5/6 of container for 3 cols */}
            <div
              className="absolute pointer-events-none"
              style={{
                top: '70px',
                left: 'calc(16.67% + 40px)',
                right: 'calc(16.67% + 40px)',
                height: '1px',
                background:
                  'repeating-linear-gradient(90deg, rgba(245,247,251,0.30) 0, rgba(245,247,251,0.30) 8px, transparent 8px, transparent 18px)',
              }}
            />

            {STEPS.map((step) => (
              <div
                key={step.num}
                className="flex flex-col items-center text-center px-3"
              >
                {/* Step number */}
                <p
                  className="font-bold uppercase tracking-[0.20em] mb-3"
                  style={{ fontSize: '15px', color: '#F2BC1B' }}
                >
                  {step.num}
                </p>
                {/* Icon circle */}
                <div
                  className="flex items-center justify-center rounded-full mb-6 relative z-10"
                  style={{
                    width: '80px',
                    height: '80px',
                    background: 'rgba(8,28,50,0.80)',
                    border: '1.5px solid rgba(242,188,27,0.48)',
                    boxShadow:
                      '0 0 0 8px #031321, 0 0 0 9px rgba(242,188,27,0.12)',
                  }}
                >
                  <Icon name={step.icon} className="text-[34px]" color="#F2BC1B" />
                </div>
                <h3
                  className="font-semibold text-white mb-2"
                  style={{ fontSize: 'clamp(16px, 1.6vw, 20px)' }}
                >
                  {step.title}
                </h3>
                <p
                  className="leading-[1.55]"
                  style={{
                    fontSize: 'clamp(13px, 1.3vw, 15px)',
                    color: 'rgba(233,240,251,0.68)',
                    maxWidth: '195px',
                  }}
                >
                  {step.body}
                </p>
              </div>
            ))}
          </div>

          {/* ── Mobile: vertical timeline ── */}
          <div className="md:hidden relative pl-12">
            {/* Vertical dotted connector */}
            <div
              className="absolute left-[22px] top-5 bottom-5"
              style={{
                width: '1px',
                background:
                  'repeating-linear-gradient(180deg, rgba(245,247,251,0.28) 0, rgba(245,247,251,0.28) 8px, transparent 8px, transparent 18px)',
              }}
            />

            {STEPS.map((step, i) => (
              <div
                key={step.num}
                className={`relative flex items-start${i < STEPS.length - 1 ? ' mb-10' : ''}`}
              >
                {/* Icon circle — in left padding */}
                <div
                  className="absolute flex items-center justify-center rounded-full flex-shrink-0 z-10"
                  style={{
                    left: '-48px',
                    width: '44px',
                    height: '44px',
                    background: 'rgba(8,28,50,0.90)',
                    border: '1.5px solid rgba(242,188,27,0.46)',
                  }}
                >
                  <Icon name={step.icon} className="text-[20px]" color="#F2BC1B" />
                </div>
                {/* Text */}
                <div>
                  <p
                    className="font-bold uppercase tracking-[0.18em] mb-1"
                    style={{ fontSize: '11px', color: '#F2BC1B' }}
                  >
                    {step.num}
                  </p>
                  <h3 className="font-semibold text-white mb-1.5" style={{ fontSize: '16px' }}>
                    {step.title}
                  </h3>
                  <p
                    className="leading-[1.55]"
                    style={{ fontSize: '14px', color: 'rgba(233,240,251,0.66)' }}
                  >
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      </div>{/* ── end middle background band ── */}

      {/* ════════════════════════════════════════════════════════════════════
          PERFECT FOR SECTION
      ════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-14 md:py-[68px]"
        style={{ background: '#031321' }}
      >
        <div className="mx-auto max-w-[1280px] px-5 md:px-8">
          {/* Gold-bordered container card */}
          <div
            className="rounded-[22px] px-6 pt-10 pb-10 md:px-12 md:pt-12 md:pb-12"
            style={{
              background: 'rgba(5,18,38,0.84)',
              border: '1px solid rgba(242,188,27,0.26)',
              boxShadow: '0 16px 56px rgba(0,0,0,0.38)',
            }}
          >
            {/* Section heading */}
            <div className="text-center mb-10">
              {/* Desktop: wings */}
              <div className="hidden sm:flex items-center justify-center gap-6 md:gap-8 mb-3">
                <div className="flex flex-col items-end gap-[7px] flex-shrink-0 self-center">
                  <div style={{ width: '90px', height: '1.5px', background: 'rgba(242,188,27,0.60)' }} />
                  <div style={{ width: '62px', height: '1px', background: 'rgba(242,188,27,0.36)' }} />
                  <div style={{ width: '36px', height: '1px', background: 'rgba(242,188,27,0.18)' }} />
                </div>
                <h2
                  className="font-serif text-white tracking-[0.10em] leading-tight flex-shrink-0"
                  style={{ fontSize: 'clamp(22px, 2.8vw, 34px)', fontWeight: 600 }}
                >
                  PERFECT FOR
                </h2>
                <div className="flex flex-col items-start gap-[7px] flex-shrink-0 self-center">
                  <div style={{ width: '90px', height: '1.5px', background: 'rgba(242,188,27,0.60)' }} />
                  <div style={{ width: '62px', height: '1px', background: 'rgba(242,188,27,0.36)' }} />
                  <div style={{ width: '36px', height: '1px', background: 'rgba(242,188,27,0.18)' }} />
                </div>
              </div>
              {/* Mobile: single-line wings */}
              <div className="flex sm:hidden items-center justify-center gap-4 mb-3">
                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(242,188,27,0.55))' }} />
                <h2 className="font-serif text-white tracking-[0.10em] leading-tight flex-shrink-0" style={{ fontSize: '24px', fontWeight: 600 }}>
                  PERFECT FOR
                </h2>
                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(242,188,27,0.55), transparent)' }} />
              </div>
              {/* Diamond divider */}
              <div className="flex items-center justify-center gap-2 mb-5">
                <div style={{ width: '32px', height: '1px', background: 'rgba(242,188,27,0.32)' }} />
                <div style={{ width: '6px', height: '6px', background: '#F2BC1B', transform: 'rotate(45deg)', borderRadius: '1px' }} />
                <div style={{ width: '32px', height: '1px', background: 'rgba(242,188,27,0.32)' }} />
              </div>
              <p style={{ fontSize: '16px', color: 'rgba(245,247,251,0.74)', lineHeight: 1.5 }}>
                Once you&apos;re cleared, the Cessna 172N is ideal for practical and enjoyable flying missions.
              </p>
            </div>

            {/* 4 circular cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
              {PERFECT_FOR_CARDS.map((card) => (
                <div key={card.title} className="flex flex-col items-center">
                  {/* Circle with background photo */}
                  <div
                    className="relative rounded-full overflow-hidden mb-5 flex-shrink-0 w-[140px] h-[140px] sm:w-[160px] sm:h-[160px] md:w-[176px] md:h-[176px]"
                    role="img"
                    aria-label={card.alt}
                    style={{
                      border: '2px solid rgba(242,188,27,0.42)',
                      boxShadow: '0 0 0 5px rgba(5,18,38,0.86), 0 8px 28px rgba(0,0,0,0.30)',
                    }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `url('${card.image}')`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                    {/* Very subtle dark tint so icon stays visible */}
                    <div className="absolute inset-0" style={{ background: 'rgba(3,14,28,0.20)' }} />
                    {/* Icon badge — lower-center of circle */}
                    <div
                      className="absolute bottom-3 left-1/2 flex items-center justify-center rounded-full"
                      style={{
                        width: '38px',
                        height: '38px',
                        transform: 'translateX(-50%)',
                        background: 'rgba(3,14,28,0.72)',
                        border: '1px solid rgba(242,188,27,0.52)',
                        backdropFilter: 'blur(4px)',
                      }}
                    >
                      <Icon name={card.icon} className="text-[17px]" color="#F2BC1B" fill />
                    </div>
                  </div>

                  <h3
                    className="font-semibold text-white text-center mb-2"
                    style={{ fontSize: 'clamp(16px, 1.6vw, 20px)', lineHeight: 1.2 }}
                  >
                    {card.title}
                  </h3>
                  <p
                    className="text-center"
                    style={{
                      fontSize: '14px',
                      color: 'rgba(245,247,251,0.70)',
                      lineHeight: 1.5,
                      maxWidth: '180px',
                    }}
                  >
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 5 — READY TO TAKE OFF
      ════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-14 md:py-20"
        style={{ background: '#031321' }}
      >
        <div className="mx-auto max-w-[1320px] px-5 md:px-10 lg:px-12">
          <div
            className="relative overflow-hidden rounded-[24px] flex flex-col md:flex-row"
            style={{
              backgroundImage: "url('/LandingPage/ready.png')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              minHeight: 'clamp(400px, 44vh, 500px)',
              border: '1px solid rgba(242,188,27,0.26)',
              boxShadow: '0 24px 72px rgba(0,0,0,0.44)',
            }}
          >
            {/* Desktop overlay */}
            <div
              className="absolute inset-0 hidden md:block"
              style={{
                background:
                  'linear-gradient(90deg, rgba(3,17,32,0.80) 0%, rgba(3,17,32,0.62) 42%, rgba(3,17,32,0.28) 100%)',
              }}
            />
            {/* Mobile overlay — stronger */}
            <div
              className="absolute inset-0 md:hidden"
              style={{ background: 'rgba(3,17,32,0.84)' }}
            />

            {/* Content */}
            <div className="relative z-10 w-full px-8 pt-10 pb-10 md:px-14 md:pt-14 md:pb-12">

              {/* Heading — centered with symmetric wings matching PERFECT FOR */}
              <div className="text-center mb-8 md:mb-10">

                {/* Desktop: title flanked by triple-line wings */}
                <div className="hidden sm:flex items-center justify-center gap-6 md:gap-8 mb-3">
                  <div className="flex flex-col items-end gap-[7px] flex-shrink-0 self-center">
                    <div style={{ width: '90px', height: '1.5px', background: 'rgba(242,188,27,0.60)' }} />
                    <div style={{ width: '62px', height: '1px', background: 'rgba(242,188,27,0.36)' }} />
                    <div style={{ width: '36px', height: '1px', background: 'rgba(242,188,27,0.18)' }} />
                  </div>
                  <h2
                    className="font-serif text-white tracking-[0.06em] leading-tight flex-shrink-0"
                    style={{ fontSize: 'clamp(22px, 2.8vw, 36px)', fontWeight: 600 }}
                  >
                    Ready to take off?
                  </h2>
                  <div className="flex flex-col items-start gap-[7px] flex-shrink-0 self-center">
                    <div style={{ width: '90px', height: '1.5px', background: 'rgba(242,188,27,0.60)' }} />
                    <div style={{ width: '62px', height: '1px', background: 'rgba(242,188,27,0.36)' }} />
                    <div style={{ width: '36px', height: '1px', background: 'rgba(242,188,27,0.18)' }} />
                  </div>
                </div>

                {/* Mobile: single-line flanks */}
                <div className="flex sm:hidden items-center justify-center gap-4 mb-3">
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(242,188,27,0.55))' }} />
                  <h2 className="font-serif text-white tracking-[0.06em] leading-tight flex-shrink-0" style={{ fontSize: 'clamp(22px, 7vw, 30px)', fontWeight: 600 }}>
                    Ready to take off?
                  </h2>
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(242,188,27,0.55), transparent)' }} />
                </div>

                {/* Diamond divider — centered */}
                <div className="flex items-center justify-center gap-2">
                  <div style={{ width: '32px', height: '1px', background: 'rgba(242,188,27,0.32)' }} />
                  <div style={{ width: '6px', height: '6px', background: '#F2BC1B', transform: 'rotate(45deg)', borderRadius: '1px' }} />
                  <div style={{ width: '32px', height: '1px', background: 'rgba(242,188,27,0.32)' }} />
                </div>
              </div>

              {/* Copy */}
              <p
                className="leading-[1.5] mb-3"
                style={{
                  fontSize: 'clamp(16px, 1.8vw, 20px)',
                  color: 'rgba(245,247,251,0.88)',
                  maxWidth: '640px',
                }}
              >
                Book your checkout flight today and start your aviation
                journey with a simpler online process.
              </p>
              <p
                className="mb-8"
                style={{
                  fontSize: 'clamp(13px, 1.4vw, 16px)',
                  color: 'rgba(245,247,251,0.62)',
                }}
              >
                Launch checkout rate: $290/hr VDO. Fuel and GST included.
                Plus $25 per landing.
              </p>

              {/* CTAs — left-aligned below the text */}
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <CheckoutCTA className={PRIMARY_BTN} style={PRIMARY_BTN_STYLE}>
                  <Icon name="flight_takeoff" className="text-[18px]" fill color="#04172A" />
                  Book Your Checkout Flight
                </CheckoutCTA>
                <a
                  href="/pricing"
                  className="inline-flex items-center gap-1.5 font-semibold transition-all hover:opacity-75 whitespace-nowrap self-center"
                  style={{
                    fontSize: '15px',
                    color: 'rgba(245,247,251,0.80)',
                    padding: '15px 4px',
                  }}
                >
                  View Pricing
                  <Icon name="arrow_forward" className="text-[16px]" color="rgba(245,247,251,0.80)" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
