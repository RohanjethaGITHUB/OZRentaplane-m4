'use client'

import React from 'react'
import { motion, useScroll, useSpring, useTransform } from 'framer-motion'

interface RunwaySpineProps {
  containerRef: React.RefObject<HTMLDivElement>
}

/**
 * Runway-style scroll-linked spine.
 *
 * Milestones (scroll 0 → 1):
 *   0 – 60%   → plane travels south down the runway (pointing straight down)
 *   60 – 75%  → near "Complete checkout flight" — plane begins banking (rotating CCW)
 *   75 – 92%  → near "Book first solo" — plane climbing away
 *   92 – 100% → near "Fly, record, finalize" — plane fades off-screen
 *
 * Reverse scroll rewinds all transforms identically — framer-motion
 * spring handles the easing automatically.
 */
export default function RunwaySpine({ containerRef }: RunwaySpineProps) {
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  /* Spring — physical drag so the plane lags slightly behind scroll */
  const spring = useSpring(scrollYProgress, {
    stiffness: 46,
    damping: 15,
    restDelta: 0.001,
  })

  /* Plane position: 1.5% → 95% of container height */
  const planeTop = useTransform(spring, [0, 1], ['1.5%', '95%'])

  /* Illuminated runway segment grows behind the plane */
  const completedHeight = useTransform(spring, [0, 1], ['0%', '94%'])

  /*
   * Heading animation:
   *   135° = pointing south  (material "flight" icon at 0° faces NE, 135° faces S)
   *    60° = climbing / banking away (roughly ESE)
   */
  const planeRotate = useTransform(
    spring,
    [0,    0.60, 0.75, 0.90, 1.0],
    [135,  135,  110,  85,   58],
  )

  /* Fade out as plane "flies away" near the end */
  const planeOpacity = useTransform(spring, [0.88, 1.0], [1, 0.15])

  /* Subtle scale-up as the plane "climbs toward the viewer" */
  const planeScale = useTransform(spring, [0.78, 1.0], [1, 1.25])

  /* Takeoff glow that intensifies when banking begins */
  const glowOpacity = useTransform(spring, [0.58, 0.80], [0, 0.75])

  return (
    <div
      className="absolute inset-0 pointer-events-none hidden md:block"
      aria-hidden="true"
      style={{ zIndex: 1 }}
    >
      {/* ── Wide ambient corridor glow ─────────────────────────────── */}
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2"
        style={{
          width: '260px',
          background:
            'linear-gradient(to right, transparent, rgba(174,199,247,0.013) 50%, transparent)',
        }}
      />

      {/* ── Base runway — dim "ahead" state ────────────────────────── */}
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2"
        style={{
          width: '2px',
          background:
            'linear-gradient(to bottom, rgba(174,199,247,0.42) 0%, rgba(174,199,247,0.18) 4%, rgba(174,199,247,0.10) 88%, transparent 100%)',
        }}
      />

      {/* ── Centre-line runway dashes (decorative) ─────────────────── */}
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2"
        style={{
          width: '2px',
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(174,199,247,0.11) 0px, rgba(174,199,247,0.11) 16px, transparent 16px, transparent 34px)',
          mixBlendMode: 'screen',
        }}
      />

      {/* ── Completed/illuminated runway segment ────────────────────── */}
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2"
        style={{
          width: '2px',
          height: completedHeight,
          background:
            'linear-gradient(to bottom, transparent 0%, rgba(174,199,247,0.68) 3%, rgba(174,199,247,0.50) 100%)',
          boxShadow: '0 0 8px rgba(174,199,247,0.26)',
        }}
      />

      {/* ── Plane marker ────────────────────────────────────────────── */}
      <motion.div
        className="absolute left-1/2 pointer-events-none"
        style={{
          top: planeTop,
          x: '-50%',
          y: '-50%',
          rotate: planeRotate,
          scale: planeScale,
          opacity: planeOpacity,
          zIndex: 30,
        }}
      >
        {/* Ambient halo */}
        <div
          style={{
            position: 'absolute',
            inset: '-14px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(174,199,247,0.17) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Takeoff burst — appears as banking begins */}
        <motion.div
          style={{
            position: 'absolute',
            inset: '-24px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(174,199,247,0.40) 0%, transparent 58%)',
            opacity: glowOpacity,
            pointerEvents: 'none',
          }}
        />

        {/* Plane icon — parent's rotate drives the heading */}
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '19px',
            color: '#aec7f7',
            fontVariationSettings: "'FILL' 1",
            display: 'block',
            filter: 'drop-shadow(0 0 7px rgba(174,199,247,0.72))',
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
