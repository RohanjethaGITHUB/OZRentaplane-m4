'use client'

import React from 'react'
import { motion, useScroll, useSpring, useTransform } from 'framer-motion'

interface RouteSpineProps {
  containerRef: React.RefObject<HTMLDivElement>
}

export default function RouteSpine({ containerRef }: RouteSpineProps) {
  /**
   * Track scroll progress through the timeline container.
   * offset: ['start start', 'end end'] means:
   *   0 → container top reaches viewport top
   *   1 → container bottom reaches viewport bottom
   */
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  /* Spring adds physical weight so the plane lags slightly behind scroll */
  const spring = useSpring(scrollYProgress, {
    stiffness: 52,
    damping: 18,
    restDelta: 0.001,
  })

  /* Plane sits from near-top to near-bottom of the container */
  const planeTop = useTransform(spring, [0, 1], ['2%', '94%'])

  /* Completed route grows from top to match the plane position */
  const completedHeight = useTransform(spring, [0, 1], ['2%', '94%'])

  return (
    <div
      className="absolute inset-0 pointer-events-none hidden md:block"
      aria-hidden="true"
      style={{ zIndex: 1 }}
    >

      {/* ── Wide corridor ambient glow ─────────────────────────────── */}
      <div
        className="absolute inset-y-0 left-1/2 w-56 -translate-x-1/2"
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(174,199,247,0.016) 50%, transparent)',
        }}
      />

      {/* ── Base route line — dim "upcoming" state ─────────────────── */}
      {/* Starts visible at 0% so it connects cleanly to the lead-in line */}
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2"
        style={{
          width: '1px',
          background:
            'linear-gradient(to bottom, rgba(174,199,247,0.38) 0%, rgba(174,199,247,0.2) 6%, rgba(174,199,247,0.14) 88%, rgba(174,199,247,0.0) 100%)',
        }}
      />

      {/* ── Completed route line — illuminated, grows with scroll ──── */}
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2"
        style={{
          width: '1px',
          height: completedHeight,
          background:
            'linear-gradient(to bottom, rgba(174,199,247,0.0) 0%, rgba(174,199,247,0.7) 6%, rgba(174,199,247,0.52) 100%)',
          boxShadow: '0 0 5px rgba(174,199,247,0.32)',
        }}
      />

      {/* ── Plane marker — scroll-linked progress indicator ─────────── */}
      <motion.div
        className="absolute left-1/2 pointer-events-none"
        style={{
          top: planeTop,
          x: '-50%',
          y: '-50%',
          zIndex: 30,
        }}
      >
        {/* Radial halo */}
        <div
          style={{
            position: 'absolute',
            inset: '-10px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(174,199,247,0.14) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/*
          `flight` icon by default faces upper-right (~45°).
          rotate(135deg) brings it to face straight down (south).
        */}
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '15px',
            color: '#aec7f7',
            fontVariationSettings: "'FILL' 1",
            display: 'block',
            transform: 'rotate(135deg)',
            filter: 'drop-shadow(0 0 5px rgba(174,199,247,0.65))',
            position: 'relative',
            zIndex: 1,
            lineHeight: 1,
          }}
        >
          flight
        </span>
      </motion.div>

    </div>
  )
}
