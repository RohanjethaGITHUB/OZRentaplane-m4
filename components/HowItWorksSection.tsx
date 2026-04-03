'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

// ── Animation variants ────────────────────────────────────────────────────────
const fadeSlide = (dir: -1 | 1) => ({
  hidden:  { opacity: 0, x: dir * 18, y: 8 },
  visible: { opacity: 1, x: 0,        y: 0, transition: { duration: 0.72, ease: [0.33, 1, 0.68, 1] as [number, number, number, number] } },
})

const tileContainer = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.10, delayChildren: 0.30 } },
}

const tileItem = {
  hidden:  { opacity: 0, y: 13 },
  visible: { opacity: 1, y: 0,  transition: { duration: 0.52, ease: [0.33, 1, 0.68, 1] as [number, number, number, number] } },
}

// ── Process steps ─────────────────────────────────────────────────────────────
const STEPS = [
  {
    n:     '01',
    label: 'Apply & Upload Documents',
    sub:   'Submit your pilot licence, medical certificate, and flight experience log. Takes about five minutes.',
  },
  {
    n:     '02',
    label: 'Get Reviewed & Approved',
    sub:   'Our team verifies your credentials. Most pilots receive approval within 48 hours.',
  },
  {
    n:     '03',
    label: 'Book & Fly',
    sub:   'Choose your slot, complete the pre-flight check, and the aircraft is yours.',
  },
]

// ── Calendar data (April 2026 — April 1 = Wednesday, Mon-start week) ─────────
type CellState = 'empty' | 'past' | 'today' | 'off' | 'avail' | 'booked' | 'sel'

const CAL: { d: number; s: CellState }[] = [
  // Row 1
  { d: 0,  s: 'empty'  }, { d: 0,  s: 'empty'  },
  { d: 1,  s: 'past'   }, { d: 2,  s: 'today'  }, { d: 3,  s: 'avail'  }, { d: 4,  s: 'off'    }, { d: 5,  s: 'off'    },
  // Row 2
  { d: 6,  s: 'avail'  }, { d: 7,  s: 'avail'  }, { d: 8,  s: 'avail'  }, { d: 9,  s: 'sel'    }, { d: 10, s: 'booked' }, { d: 11, s: 'off'    }, { d: 12, s: 'off'    },
  // Row 3
  { d: 13, s: 'avail'  }, { d: 14, s: 'avail'  }, { d: 15, s: 'booked' }, { d: 16, s: 'avail'  }, { d: 17, s: 'avail'  }, { d: 18, s: 'off'    }, { d: 19, s: 'off'    },
  // Row 4
  { d: 20, s: 'avail'  }, { d: 21, s: 'booked' }, { d: 22, s: 'avail'  }, { d: 23, s: 'avail'  }, { d: 24, s: 'avail'  }, { d: 25, s: 'off'    }, { d: 26, s: 'off'    },
]

function cellClass(s: CellState): string {
  const base = 'w-7 h-7 rounded-lg flex items-center justify-center text-[11.5px] font-sans font-medium transition-colors duration-150'
  switch (s) {
    case 'empty':  return `${base} pointer-events-none`
    case 'past':   return `${base} text-oz-subtle/25`
    case 'today':  return `${base} text-oz-subtle/50 ring-1 ring-inset ring-oz-blue/25`
    case 'off':    return `${base} text-oz-subtle/20`
    case 'avail':  return `${base} text-oz-text/75 hover:bg-oz-blue/15 cursor-pointer`
    case 'booked': return `${base} text-oz-subtle/35 line-through decoration-oz-subtle/25`
    case 'sel':    return `${base} bg-oz-blue text-oz-deep font-bold`
    default:       return base
  }
}

// ── Time slots ────────────────────────────────────────────────────────────────
const TIME_SLOTS = [
  { label: '07:00 – 09:00', sel: false, avail: true  },
  { label: '09:00 – 11:00', sel: true,  avail: true  },
  { label: '14:00 – 16:00', sel: false, avail: false },
]

// ── Component ─────────────────────────────────────────────────────────────────
export default function HowItWorksSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const inView     = useInView(sectionRef, { once: true, margin: '-80px' })

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className="relative bg-oz-deep overflow-hidden pt-24 pb-28 px-5 md:px-10 lg:px-16"
    >
      {/* Atmospheric haze — gives glass panels something subtle to refract */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: 520,
          background: 'radial-gradient(ellipse 72% 100% at 50% 0%, rgba(10,31,61,0.70) 0%, transparent 100%)',
        }}
      />

      <div className="relative max-w-[1120px] mx-auto">

        {/* ── Section header ───────────────────────────────────────────────── */}
        <motion.p
          className="font-sans font-semibold tracking-[0.38em] uppercase mb-3 text-center"
          style={{ fontSize: 9, color: 'rgba(167,200,255,0.50)' }}
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          How It Works
        </motion.p>

        <motion.h2
          className="font-serif text-[1.85rem] sm:text-[2.35rem] md:text-[2.8rem] font-black text-oz-text leading-[1.07] tracking-tight text-center mb-14 md:mb-16"
          initial={{ opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.62, delay: 0.09, ease: [0.33, 1, 0.68, 1] as [number, number, number, number] }}
        >
          From approval to takeoff,<br className="hidden sm:block" /> kept simple.
        </motion.h2>

        {/* ── Two-panel cards ──────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-5 lg:gap-6 items-stretch">

          {/* ─── Left card: process ──────────────────────────────────────── */}
          <motion.div
            className="how-it-works-glow flex-1 lg:flex-[3] rounded-[28px] p-8 md:p-10 flex flex-col"
            style={{
              background:            'rgba(10,31,61,0.58)',
              backdropFilter:        'blur(24px)',
              WebkitBackdropFilter:  'blur(24px)',
              border:                '1px solid rgba(167,200,255,0.08)',
            }}
            variants={fadeSlide(-1)}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >
            {/* Card intro */}
            <div className="mb-7">
              <p
                className="font-sans font-semibold tracking-[0.36em] uppercase mb-3.5"
                style={{ fontSize: 9, color: 'rgba(167,200,255,0.42)' }}
              >
                The Process
              </p>
              <p className="font-sans text-[0.875rem] md:text-[0.9375rem] font-light text-oz-muted leading-[1.82] max-w-md">
                A clear path for licensed pilots — from submitting your credentials
                to wheels-up.
              </p>
            </div>

            {/* Process tiles */}
            <motion.div
              className="flex flex-col flex-1"
              variants={tileContainer}
              initial="hidden"
              animate={inView ? 'visible' : 'hidden'}
            >
              {STEPS.map((step, i) => (
                <motion.div
                  key={step.n}
                  variants={tileItem}
                  className="group flex items-start gap-5 py-5 transition-transform duration-300 hover:-translate-y-px"
                  style={{ borderTop: '1px solid rgba(167,200,255,0.07)' }}
                >
                  {/* Number badge */}
                  <div
                    className="mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      background: 'rgba(167,200,255,0.06)',
                      border:     '1px solid rgba(167,200,255,0.12)',
                    }}
                  >
                    <span
                      className="font-sans font-bold"
                      style={{ fontSize: 9.5, letterSpacing: '0.04em', color: 'rgba(167,200,255,0.60)' }}
                    >
                      {step.n}
                    </span>
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="font-serif text-[0.975rem] font-black text-oz-text leading-snug mb-1.5 group-hover:text-oz-blue transition-colors duration-200">
                      {step.label}
                    </p>
                    <p className="font-sans text-[0.75rem] text-oz-muted font-light leading-relaxed">
                      {step.sub}
                    </p>
                  </div>

                  {/* Hover arrow */}
                  <div className="mt-1 shrink-0 opacity-0 group-hover:opacity-35 transition-opacity duration-200">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M1 7h12M8 2.5L12.5 7 8 11.5" stroke="rgba(167,200,255,1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </motion.div>
              ))}
              <div style={{ borderTop: '1px solid rgba(167,200,255,0.07)' }} />
            </motion.div>

            {/* CTA */}
            <div className="mt-8">
              <a
                href="#fleet"
                className="inline-flex items-center gap-2.5 font-sans text-[0.8125rem] font-medium text-oz-text/72 border border-oz-blue/20 rounded-full px-5 py-2.5 hover:border-oz-blue/48 hover:text-oz-text transition-all duration-300"
              >
                Start your application
                <svg className="w-3.5 h-3.5 text-oz-blue" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 7h12M8 2.5L12.5 7 8 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
          </motion.div>

          {/* ─── Right card: booking dashboard ───────────────────────────── */}
          <motion.div
            className="flex-1 lg:flex-[2] rounded-[28px] p-7 md:p-8 flex flex-col gap-5"
            style={{
              background:           'rgba(5,27,57,0.62)',
              backdropFilter:       'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)',
              border:               '1px solid rgba(167,200,255,0.07)',
              boxShadow:            '0 20px 60px -16px rgba(0,0,0,0.58)',
            }}
            variants={fadeSlide(1)}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >

            {/* Aircraft header */}
            <div>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="font-serif text-[1.08rem] font-black text-oz-text leading-tight">
                    Cessna 172 Skyhawk
                  </p>
                  <p className="font-sans text-[11px] text-oz-subtle font-light tracking-wide mt-0.5">
                    VH-OZR · Bankstown Airport
                  </p>
                </div>
                {/* Approved badge */}
                <span
                  className="shrink-0 inline-flex items-center gap-1.5 font-sans font-semibold rounded-full px-2.5 py-1"
                  style={{
                    fontSize:       9.5,
                    letterSpacing:  '0.05em',
                    color:          'rgba(134,216,163,0.88)',
                    background:     'rgba(134,216,163,0.09)',
                    border:         '1px solid rgba(134,216,163,0.18)',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: 'rgba(134,216,163,0.82)' }}
                  />
                  APPROVED
                </span>
              </div>
              <div style={{ height: 1, background: 'rgba(167,200,255,0.06)' }} />
            </div>

            {/* Mini calendar */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <p className="font-sans text-[11px] font-semibold tracking-[0.12em] uppercase text-oz-blue/65">
                  April 2026
                </p>
                <div className="flex gap-1">
                  {(['‹', '›'] as const).map((ch, i) => (
                    <button
                      key={i}
                      aria-label={i === 0 ? 'Previous month' : 'Next month'}
                      className="w-6 h-6 rounded-md flex items-center justify-center font-sans text-[13px] text-oz-subtle/45 hover:text-oz-blue/65 transition-colors"
                      style={{ background: 'rgba(167,200,255,0.05)' }}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day-of-week header */}
              <div className="grid grid-cols-7 mb-1">
                {['M','T','W','T','F','S','S'].map((d, i) => (
                  <div
                    key={i}
                    className="w-7 h-6 flex items-center justify-center font-sans font-semibold"
                    style={{ fontSize: 9.5, color: 'rgba(142,144,152,0.40)', letterSpacing: '0.04em' }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-y-0.5">
                {CAL.map((cell, i) => (
                  <div key={i} className={cellClass(cell.s)}>
                    {cell.d > 0 ? cell.d : ''}
                  </div>
                ))}
              </div>
            </div>

            {/* Selected date + time slots */}
            <div>
              <div style={{ height: 1, background: 'rgba(167,200,255,0.06)' }} className="mb-3.5" />
              <p className="font-sans text-[11px] font-semibold tracking-[0.10em] uppercase text-oz-blue/62 mb-2.5">
                Thu, 9 April — Available slots
              </p>
              <div className="flex flex-col gap-1.5">
                {TIME_SLOTS.map((slot) => (
                  <div
                    key={slot.label}
                    className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
                    style={{
                      background: slot.sel
                        ? 'rgba(167,200,255,0.11)'
                        : 'rgba(167,200,255,0.032)',
                      border: slot.sel
                        ? '1px solid rgba(167,200,255,0.20)'
                        : '1px solid rgba(167,200,255,0.055)',
                      opacity: slot.avail ? 1 : 0.38,
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Radio */}
                      <div
                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          border: slot.sel
                            ? '1.5px solid rgba(167,200,255,0.85)'
                            : '1.5px solid rgba(167,200,255,0.28)',
                        }}
                      >
                        {slot.sel && (
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: 'rgba(167,200,255,0.88)' }}
                          />
                        )}
                      </div>
                      <span className="font-sans text-[0.8rem] font-medium text-oz-text/78">
                        {slot.label}
                      </span>
                    </div>
                    {slot.sel && (
                      <span
                        className="font-sans font-semibold"
                        style={{ fontSize: 10, letterSpacing: '0.04em', color: 'rgba(167,200,255,0.65)' }}
                      >
                        2 hrs
                      </span>
                    )}
                    {!slot.avail && (
                      <span
                        className="font-sans"
                        style={{ fontSize: 10, color: 'rgba(142,144,152,0.48)' }}
                      >
                        Booked
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Price + book CTA */}
            <div className="mt-auto pt-1">
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="font-serif text-[1.65rem] font-black text-oz-blue">$598</span>
                <span className="font-sans text-[11px] text-oz-subtle font-light">
                  incl. fuel &amp; insurance
                </span>
              </div>
              <button className="w-full font-sans text-[0.875rem] font-semibold text-oz-deep bg-oz-blue rounded-full py-3 hover:bg-oz-text transition-colors duration-200">
                Book this slot
              </button>
            </div>

          </motion.div>
        </div>
      </div>
    </section>
  )
}
