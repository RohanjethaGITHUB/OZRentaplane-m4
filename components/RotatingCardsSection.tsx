'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

// ─── Types ────────────────────────────────────────────────────────────────────

type CardAccent = 'horizon' | 'radial' | 'grid'

interface CardSpec {
  id:           string
  label:        string
  accent:       CardAccent
  w:            number
  h:            number
  fill:         string          // raw CSS gradient
  top:          number
  left?:        number
  right?:       number
  yRange:       [number, number]
  rotateRange:  [number, number]
  duration:     number
  delay:        number
}

// ─── Card specifications ──────────────────────────────────────────────────────
//
// Left cluster — anticlockwise group drift
// Cards overlap into a depth-layered stack with varied sizes and tilts.
// Fills use the oz-* color family so cards read as native to the site palette.

const LEFT_CARDS: CardSpec[] = [
  {
    id:          'exterior',
    label:       'Aircraft Exterior',
    accent:      'horizon',
    w: 214, h: 136,
    fill:        'linear-gradient(148deg, #0c2550 0%, #071630 55%, #040e20 100%)',
    top: 0, left: 0,
    yRange:      [-9, 7],
    rotateRange: [-3.2, -1.5],
    duration:    7.4, delay: 0,
  },
  {
    id:          'cockpit',
    label:       'Cockpit Interior',
    accent:      'radial',
    w: 176, h: 232,
    fill:        'linear-gradient(158deg, #1c1812 0%, #111520 55%, #090d18 100%)',
    top: 108, left: 40,
    yRange:      [-5, 11],
    rotateRange: [0.9, 2.5],
    duration:    8.8, delay: 0.35,
  },
  {
    id:          'inflight',
    label:       'In-flight View',
    accent:      'horizon',
    w: 200, h: 118,
    fill:        'linear-gradient(132deg, #0a2445 0%, #071c38 50%, #040e20 100%)',
    top: 296, left: -8,
    yRange:      [-10, 5],
    rotateRange: [-2.2, -0.7],
    duration:    6.8, delay: 0.7,
  },
]

// Right cluster — clockwise group drift
const RIGHT_CARDS: CardSpec[] = [
  {
    id:          'booking',
    label:       'Booking Calendar',
    accent:      'grid',
    w: 192, h: 122,
    fill:        'linear-gradient(138deg, #0f1c30 0%, #0a1422 55%, #060c18 100%)',
    top: 0, right: 0,
    yRange:      [-6, 9],
    rotateRange: [1.4, 3.0],
    duration:    7.8, delay: 0.15,
  },
  {
    id:          'runway',
    label:       'Runway Detail',
    accent:      'horizon',
    w: 208, h: 146,
    fill:        'linear-gradient(152deg, #181818 0%, #151a24 55%, #0c1018 100%)',
    top: 86, right: 24,
    yRange:      [-9, 6],
    rotateRange: [-2.4, -0.8],
    duration:    9.2, delay: 0.55,
  },
  {
    id:          'registration',
    label:       'Pilot Registration',
    accent:      'grid',
    w: 178, h: 218,
    fill:        'linear-gradient(143deg, #0b1e3c 0%, #091428 55%, #050c1c 100%)',
    top: 196, right: -4,
    yRange:      [-5, 11],
    rotateRange: [0.6, 2.2],
    duration:    7.5, delay: 0.9,
  },
]

// ─── Animation variants ───────────────────────────────────────────────────────

const wordVariant = {
  hidden: { opacity: 0, y: 22, filter: 'blur(8px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.58, ease: [0.33, 1, 0.68, 1] as [number, number, number, number] },
  },
}

// ─── Card inner accent elements ───────────────────────────────────────────────
// Each card type gets a faint abstract decoration that abstractly suggests
// its future subject matter. All elements are ≤4% opacity — invisible as
// shapes but present as texture when the card is examined closely.

function CardAccentLayer({ accent, w, h }: { accent: CardAccent; w: number; h: number }) {
  if (accent === 'horizon') {
    // Faint horizon line at ~35% from top + a lighter upper half suggestion
    const horizonY = Math.round(h * 0.35)
    return (
      <>
        <div
          className="absolute inset-x-0"
          style={{
            top: horizonY,
            height: 1,
            background: 'linear-gradient(90deg, transparent 0%, rgba(167,200,255,0.06) 20%, rgba(167,200,255,0.10) 50%, rgba(167,200,255,0.06) 80%, transparent 100%)',
          }}
        />
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: horizonY,
            background: 'linear-gradient(180deg, rgba(167,200,255,0.025) 0%, transparent 100%)',
          }}
        />
      </>
    )
  }

  if (accent === 'radial') {
    // Faint instrument-ring suggestion centered in the card
    const cx = w / 2
    const cy = h * 0.42
    const r  = Math.min(w, h) * 0.28
    return (
      <div
        className="absolute rounded-full"
        style={{
          width:  r * 2,
          height: r * 2,
          left:   cx - r,
          top:    cy - r,
          border: '1px solid rgba(167,200,255,0.06)',
          boxShadow: 'inset 0 0 12px rgba(167,200,255,0.03)',
        }}
      />
    )
  }

  if (accent === 'grid') {
    // Faint horizontal rule lines suggesting a UI table / form
    const lineCount = 4
    const spacing   = h / (lineCount + 1)
    return (
      <>
        {Array.from({ length: lineCount }, (_, i) => (
          <div
            key={i}
            className="absolute inset-x-3"
            style={{
              top:        Math.round(spacing * (i + 1)),
              height:     1,
              background: 'rgba(167,200,255,0.05)',
              borderRadius: 1,
            }}
          />
        ))}
      </>
    )
  }

  return null
}

// ─── Placeholder card component ───────────────────────────────────────────────

function PlaceholderCard({ card }: { card: CardSpec }) {
  const pos: React.CSSProperties = {
    position: 'absolute',
    width:    card.w,
    height:   card.h,
    top:      card.top,
    ...(card.left  !== undefined ? { left:  card.left  } : {}),
    ...(card.right !== undefined ? { right: card.right } : {}),
  }

  return (
    <motion.div
      style={{
        ...pos,
        background:   card.fill,
        borderRadius: 16,
        overflow:     'hidden',
        border:       '1px solid rgba(255,255,255,0.075)',
        boxShadow:    [
          '0 16px 48px rgba(0,0,0,0.7)',
          '0 4px 12px rgba(0,0,0,0.45)',
          'inset 0 1px 0 rgba(255,255,255,0.065)',
          'inset 0 0 28px rgba(0,0,0,0.25)',
        ].join(', '),
      }}
      initial={{ y: card.yRange[0], rotate: card.rotateRange[0] }}
      animate={{ y: card.yRange, rotate: card.rotateRange }}
      transition={{
        duration:   card.duration,
        delay:      card.delay,
        repeat:     Infinity,
        repeatType: 'mirror',
        ease:       'easeInOut',
      }}
    >
      {/* Top rim highlight — thin specular glint */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.12) 70%, transparent 95%)',
        }}
      />

      {/* Inner frame ring — suggests a mounting/matte around a future image */}
      <div
        className="absolute"
        style={{
          inset:        6,
          borderRadius: 11,
          border:       '1px solid rgba(255,255,255,0.045)',
        }}
      />

      {/* Subject-specific abstract accent */}
      <CardAccentLayer accent={card.accent} w={card.w} h={card.h} />

      {/* Global depth gradient — foreground brighter, corners dimmer */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(160deg, rgba(255,255,255,0.02) 0%, transparent 45%, rgba(0,0,0,0.18) 100%)',
        }}
      />

      {/* Bottom scrim for label legibility */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height:     52,
          background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)',
        }}
      />

      {/* Barely-visible label — present as a design detail, not navigation */}
      <span
        className="absolute bottom-[10px] left-3 select-none pointer-events-none"
        style={{
          fontFamily:    'var(--font-manrope), system-ui, sans-serif',
          fontSize:      8,
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          color:         'rgba(167,200,255,0.20)',
        }}
      >
        {card.label}
      </span>
    </motion.div>
  )
}

// ─── Main section component ───────────────────────────────────────────────────

export default function RotatingCardsSection() {
  const textRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(textRef, { once: true, margin: '-10% 0px' })

  const words = 'From approval to takeoff, kept simple'.split(' ')

  // Stagger timing: body appears after last word lands, CTA after body settles
  const headlineStagger = 0.09
  const headlineDelay   = 0.25
  const bodyDelay       = headlineDelay + words.length * headlineStagger + 0.22
  const ctaDelay        = bodyDelay + 0.62

  return (
    <section className="relative overflow-hidden bg-oz-deep">

      {/* ── Atmospheric layers ──────────────────────────────────────────────── */}

      {/* Top fade — blends the section into the hero above seamlessly */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none z-10"
        style={{
          height:     160,
          background: 'linear-gradient(to bottom, #000e25 0%, rgba(0,14,37,0.85) 40%, transparent 100%)',
        }}
      />

      {/* Central radial blue haze — very restrained, atmospheric only */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: 'radial-gradient(ellipse 68% 52% at 50% 46%, rgba(167,200,255,0.048) 0%, transparent 62%)',
        }}
      />

      {/* Side edge vignettes — frame the card clusters and deepen the atmosphere */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: [
            'radial-gradient(ellipse 42% 70% at  6% 50%, rgba(0,14,37,0.55) 0%, transparent 70%)',
            'radial-gradient(ellipse 42% 70% at 94% 50%, rgba(0,14,37,0.55) 0%, transparent 70%)',
          ].join(', '),
        }}
      />

      {/* Bottom fade — blends into the section below */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none z-10"
        style={{
          height:     120,
          background: 'linear-gradient(to top, #000e25 0%, transparent 100%)',
        }}
      />

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="relative z-20 max-w-[1380px] mx-auto px-6 md:px-10 lg:px-16 py-28 md:py-36 lg:py-48">
        <div
          className={[
            'flex flex-col items-center',
            'md:grid md:items-center',
            'md:grid-cols-[200px_1fr_200px]',
            'lg:grid-cols-[264px_1fr_264px]',
            'xl:grid-cols-[316px_1fr_316px]',
            'gap-8 lg:gap-10',
          ].join(' ')}
        >

          {/* ── Left card cluster ────────────────────────────────────────── */}
          <motion.div
            className="hidden md:block relative self-center flex-shrink-0"
            style={{ height: 432 }}
            initial={{ rotate: -1.6 }}
            animate={{ rotate: [-1.6, 0.5] }}
            transition={{ duration: 16, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
          >
            {LEFT_CARDS.map(card => (
              <PlaceholderCard key={card.id} card={card} />
            ))}
          </motion.div>

          {/* ── Center text block ─────────────────────────────────────────── */}
          <div
            ref={textRef}
            className="flex flex-col items-center text-center gap-6 md:gap-7 w-full"
          >
            {/* Eyebrow */}
            <motion.p
              className="font-sans text-[9px] md:text-[10px] font-semibold tracking-[0.40em] uppercase"
              style={{ color: 'rgba(167,200,255,0.58)' }}
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ duration: 0.55, delay: 0.1, ease: 'easeOut' }}
            >
              Access &amp; Operations
            </motion.p>

            {/* Headline — word-by-word reveal */}
            <motion.h2
              className="font-serif text-[1.9rem] sm:text-[2.4rem] md:text-[2.7rem] lg:text-[3.1rem] font-black text-oz-text leading-[1.08] tracking-tight"
              variants={{
                hidden: {},
                show: {
                  transition: {
                    staggerChildren: headlineStagger,
                    delayChildren:   headlineDelay,
                  },
                },
              }}
              initial="hidden"
              animate={isInView ? 'show' : 'hidden'}
            >
              {words.map((word, i) => (
                <motion.span
                  key={i}
                  variants={wordVariant}
                  // Inline-block so each word is an independent animation unit;
                  // the trailing margin recreates word spacing across line breaks.
                  className="inline-block"
                  style={{ marginRight: i < words.length - 1 ? '0.27em' : 0 }}
                >
                  {word}
                </motion.span>
              ))}
            </motion.h2>

            {/* Divider — a fine horizontal rule that fades in with the body */}
            <motion.div
              className="w-10 flex-shrink-0"
              style={{ height: 1, background: 'rgba(167,200,255,0.22)' }}
              initial={{ opacity: 0, scaleX: 0 }}
              animate={isInView ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0 }}
              transition={{ duration: 0.6, delay: bodyDelay - 0.1, ease: [0.33, 1, 0.68, 1] }}
            />

            {/* Body copy */}
            <motion.p
              className="font-sans text-[0.875rem] md:text-[0.9375rem] font-light leading-[1.75] text-oz-muted max-w-[310px] md:max-w-[360px]"
              initial={{ opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
              transition={{ duration: 0.72, delay: bodyDelay, ease: [0.33, 1, 0.68, 1] }}
            >
              A premium aircraft access experience for approved pilots — with a clear path from registration and review to booking and flight.
            </motion.p>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              transition={{ duration: 0.62, delay: ctaDelay, ease: [0.33, 1, 0.68, 1] }}
            >
              <a
                href="#how-it-works"
                className="group inline-flex items-center gap-3 font-sans font-medium transition-all duration-300"
                style={{
                  fontSize:     '0.8125rem',
                  color:        'rgba(214,227,255,0.82)',
                  border:       '1px solid rgba(167,200,255,0.28)',
                  borderRadius: 999,
                  padding:      '0.68rem 1.5rem',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget
                  el.style.borderColor = 'rgba(167,200,255,0.60)'
                  el.style.color       = '#d6e3ff'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget
                  el.style.borderColor = 'rgba(167,200,255,0.28)'
                  el.style.color       = 'rgba(214,227,255,0.82)'
                }}
              >
                See how it works
                <svg
                  className="w-3.5 h-3.5 text-oz-blue transition-transform duration-200 group-hover:translate-x-0.5"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M1 7h12M8 2.5L12.5 7 8 11.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </motion.div>
          </div>

          {/* ── Right card cluster ────────────────────────────────────────── */}
          <motion.div
            className="hidden md:block relative self-center flex-shrink-0"
            style={{ height: 432 }}
            initial={{ rotate: 1.6 }}
            animate={{ rotate: [1.6, -0.5] }}
            transition={{ duration: 16, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
          >
            {RIGHT_CARDS.map(card => (
              <PlaceholderCard key={card.id} card={card} />
            ))}
          </motion.div>

        </div>
      </div>
    </section>
  )
}
