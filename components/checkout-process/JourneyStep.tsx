'use client'

import React, { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

/* ─── Icon helper ─────────────────────────────────────────────────────────── */

function Icon({
  name,
  filled = false,
  className = '',
  style,
}: {
  name: string
  filled?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        ...(filled ? { fontVariationSettings: "'FILL' 1" } : undefined),
        ...style,
      }}
    >
      {name}
    </span>
  )
}

/* ─── JourneyStep ─────────────────────────────────────────────────────────── */

interface JourneyStepProps {
  index: number
  icon: string
  title: string
  description: string
  /**
   * 'left'  → editorial text sits in the left column, visual in the right column
   * 'right' → visual sits in the left column, editorial text in the right column
   *
   * On mobile both stacks are in DOM order: text first, then visual.
   */
  side: 'left' | 'right'
  iconFilled?: boolean
  isLast?: boolean
  visual: React.ReactNode
}

export default function JourneyStep({
  index,
  icon,
  title,
  description,
  side,
  iconFilled = false,
  isLast = false,
  visual,
}: JourneyStepProps) {
  const rowRef = useRef<HTMLDivElement>(null)

  /* Node illuminates when the step is roughly centred in the viewport */
  const isActive = useInView(rowRef, {
    margin: '-35% 0px -35% 0px',
    once: false,
  })

  /* ── animation variants ── */
  const textVariant = {
    hidden: { opacity: 0, x: side === 'left' ? -22 : 22 },
    visible: { opacity: 1, x: 0, transition: { duration: 1.05, ease: EASE } },
  }
  const visualVariant = {
    hidden: { opacity: 0, x: side === 'left' ? 22 : -22, scale: 0.985 },
    visible: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: { duration: 1.1, ease: EASE, delay: 0.08 },
    },
  }
  const nodeVariant = {
    hidden: { opacity: 0, scale: 0.65 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.6, ease: EASE, delay: 0.1 },
    },
  }

  const waypointLabel = `WAYPOINT ${String(index).padStart(2, '0')}`

  /* ── DOM order is always [text, node, visual].
        On mobile → stacked in DOM order (text first).
        On desktop with side='right' → CSS Grid column overrides reposition the
        items so that visual lands in col-1, node in col-2, text in col-3. ── */

  return (
    <motion.div
      ref={rowRef}
      /**
       * 3-column grid on desktop:
       *   col-1: content (text or visual)
       *   col-2: 96px centre spine column (node + connector arms)
       *   col-3: content (visual or text)
       *
       * Single column on mobile — items stack in DOM order.
       */
      className={`
        grid grid-cols-1
        md:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)]
        md:items-center
        ${isLast ? '' : 'mb-28 md:mb-36 lg:mb-44'}
      `}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-8% 0px -8% 0px' }}
    >

      {/* ── 1. Editorial text ─────────────────────────────────────────── */}
      <motion.div
        className={[
          'mb-8 md:mb-0',
          side === 'left'
            ? 'md:pr-10 lg:pr-14 text-right'
            : 'md:pl-10 lg:pl-14 text-left',
          side === 'right' ? 'md:col-start-3 md:row-start-1' : '',
        ].join(' ')}
        variants={textVariant}
      >
        {/* Inner wrapper dims the text softly when the step is not active.
            Separated from the motion.div so the enter-animation's opacity
            (0→1) does not conflict with this ambient dim. */}
        <div
          style={{
            opacity: isActive ? 1 : 0.68,
            transition: 'opacity 0.6s ease',
          }}
        >
          <span
            className="block text-[10px] font-bold tracking-[0.28em] uppercase mb-3 font-sans"
            style={{ color: '#aec7f7' }}
          >
            {waypointLabel}
          </span>
          <h3
            className="font-serif text-[1.75rem] lg:text-[2.1rem] leading-tight mb-3.5"
            style={{ color: '#d9e3f6' }}
          >
            {title}
          </h3>
          <p
            className="leading-relaxed text-[0.91rem] lg:text-[0.95rem]"
            style={{
              color: '#94a3b8',
              maxWidth: '26rem',
              display: 'inline-block',
            }}
          >
            {description}
          </p>
        </div>
      </motion.div>

      {/* ── 2. Centre node (hidden on mobile) ────────────────────────── */}
      <motion.div
        className={[
          'hidden md:flex items-center justify-center',
          /* desktop: side='right' → col-2 (explicit, to match text reorder) */
          side === 'right' ? 'md:col-start-2 md:row-start-1' : '',
        ].join(' ')}
        variants={nodeVariant}
      >
        {/* Left connector arm */}
        <div
          className="h-px shrink-0 transition-all duration-500"
          style={{
            width: isActive ? '24px' : '14px',
            background: isActive
              ? 'rgba(174,199,247,0.45)'
              : 'rgba(174,199,247,0.16)',
          }}
        />

        {/* Node circle */}
        <div
          className="shrink-0 flex items-center justify-center transition-all duration-500"
          style={{
            width: isLast ? '44px' : '38px',
            height: isLast ? '44px' : '38px',
            borderRadius: isLast ? '50%' : '7px',
            background: isLast
              ? 'linear-gradient(135deg, #aec7f7, #608bca)'
              : '#091421',
            border: `1px solid ${
              isLast
                ? 'transparent'
                : isActive
                ? 'rgba(174,199,247,0.72)'
                : 'rgba(174,199,247,0.26)'
            }`,
            boxShadow: isActive
              ? '0 0 16px rgba(174,199,247,0.28)'
              : '0 0 6px rgba(174,199,247,0.1)',
            transform: isActive ? 'scale(1.07)' : 'scale(1)',
          }}
        >
          <Icon
            name={icon}
            filled={iconFilled}
            style={{
              fontSize: isLast ? '18px' : '15px',
              color: isLast
                ? '#0c1a2e'
                : isActive
                ? '#aec7f7'
                : '#608bca',
            } as React.CSSProperties}
          />
        </div>

        {/* Right connector arm */}
        <div
          className="h-px shrink-0 transition-all duration-500"
          style={{
            width: isActive ? '24px' : '14px',
            background: isActive
              ? 'rgba(174,199,247,0.45)'
              : 'rgba(174,199,247,0.16)',
          }}
        />
      </motion.div>

      {/* ── 3. Visual panel ───────────────────────────────────────────── */}
      <motion.div
        className={[
          side === 'left' ? 'md:pl-10 lg:pl-14' : 'md:pr-10 lg:pr-14',
          side === 'right' ? 'md:col-start-1 md:row-start-1' : '',
        ].join(' ')}
        variants={visualVariant}
        style={{
          opacity: isActive ? 1 : 0.78,
          transition: 'opacity 0.6s ease',
        }}
      >
        {visual}
      </motion.div>

    </motion.div>
  )
}

/* ─── Visual sub-components ─────────────────────────────────────────────────── */

/** Framed image card — used for most steps */
export function StepImageCard({ src, alt }: { src: string; alt: string }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: '#16202e',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 0 24px rgba(174,199,247,0.06)',
      }}
    >
      <div style={{ aspectRatio: '16/10' }}>
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          style={{ opacity: 0.9 }}
          loading="lazy"
        />
      </div>
    </div>
  )
}

/** Verification progress UI — Step 3 */
export function VerificationCard() {
  return (
    <div
      className="rounded-xl border p-7"
      style={{
        background: '#16202e',
        borderColor: 'rgba(174,199,247,0.15)',
        boxShadow: '0 0 20px rgba(174,199,247,0.06)',
      }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shrink-0"
          style={{ boxShadow: '0 0 8px rgba(74,222,128,0.45)' }}
        />
        <span
          className="text-[10px] font-bold uppercase tracking-[0.28em]"
          style={{ color: '#d9e3f6' }}
        >
          Verification Processing
        </span>
      </div>
      <div
        className="h-1 w-full rounded-full overflow-hidden mb-5"
        style={{ background: '#0c1a2e' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: '72%',
            background: 'linear-gradient(to right, #aec7f7, #608bca)',
          }}
        />
      </div>
      <div className="flex items-center gap-2" style={{ color: '#94a3b8' }}>
        <span
          className="material-symbols-outlined"
          style={{ color: '#aec7f7', fontSize: '14px' }}
        >
          schedule
        </span>
        <span className="text-[0.82rem] italic">
          Priority queue: Est. completion in 4h 12m
        </span>
      </div>
    </div>
  )
}

/** 2×2 confirmation check chips — Step 5 */
export function ConfirmationGrid() {
  const checks = [
    { icon: 'wb_sunny', label: 'Weather Verified' },
    { icon: 'build', label: 'Maintenance OK' },
    { icon: 'badge', label: 'Pilot Current' },
    { icon: 'done_all', label: 'ATC Approval' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {checks.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2.5 px-4 py-3.5 rounded-lg border"
          style={{
            background: '#16202e',
            borderColor: 'rgba(174,199,247,0.12)',
          }}
        >
          <span
            className="material-symbols-outlined shrink-0"
            style={{ color: '#aec7f7', fontSize: '17px' }}
          >
            {item.icon}
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-[0.13em]"
            style={{ color: '#d9e3f6' }}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  )
}

/** "Ready. Set. Fly." closing card — Step 7 */
export function FlyCard() {
  return (
    <div
      className="rounded-xl border p-8 lg:p-10"
      style={{
        background: '#16202e',
        borderColor: 'rgba(174,199,247,0.2)',
        boxShadow: '0 0 32px rgba(174,199,247,0.08)',
      }}
    >
      <div
        className="font-serif text-[2.5rem] lg:text-[3rem] italic leading-none mb-0.5"
        style={{ color: '#aec7f7' }}
      >
        Ready.
      </div>
      <div
        className="font-serif text-[2.5rem] lg:text-[3rem] italic leading-none mb-7"
        style={{ color: '#d9e3f6' }}
      >
        Set. Fly.
      </div>
      <div
        className="flex items-center gap-3.5 p-4 rounded-lg border"
        style={{
          background: 'rgba(12,26,46,0.6)',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'rgba(174,199,247,0.1)' }}
        >
          <span
            className="material-symbols-outlined"
            style={{ color: '#aec7f7', fontSize: '16px' }}
          >
            receipt_long
          </span>
        </div>
        <div>
          <div
            className="text-[9px] font-bold uppercase tracking-[0.3em] mb-0.5"
            style={{ color: '#aec7f7' }}
          >
            Post-Flight Ops
          </div>
          <div
            className="text-[0.82rem] font-semibold"
            style={{ color: '#d9e3f6' }}
          >
            Automated Digital Settlement
          </div>
        </div>
      </div>
    </div>
  )
}
