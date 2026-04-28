'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'

// ─── Frame sequence ───────────────────────────────────────────────────────────
function buildFrameSequence(): string[] {
  const frames: string[] = []
  for (let i = 1; i <= 192; i++) frames.push(`/home-hero-scrolly-Images/scn-1_${String(i).padStart(6, '0')}.webp`)
  for (let i = 1; i <= 192; i++) frames.push(`/home-hero-scrolly-Images/scn-2_${String(i).padStart(6, '0')}.webp`)
  for (let i = 1; i <= 192; i++) frames.push(`/home-hero-scrolly-Images/scn-3_${String(i).padStart(6, '0')}.webp`)
  for (let i = 1; i <= 192; i++) frames.push(`/home-hero-scrolly-Images/snc-4_${String(i).padStart(6, '0')}.webp`)
  return frames
}
const FRAME_PATHS  = buildFrameSequence()
const TOTAL_FRAMES = FRAME_PATHS.length // 768

// ─── Scroll timeline ──────────────────────────────────────────────────────────
//
// The outer div is one continuous tall scroll container.
// Its total height = (HERO_MULT + CONTENT_BEATS_VH) × window.innerHeight.
//
//   Overall scroll progress 0 → 1 covers the entire container.
//
//   heroFraction  = (HERO_MULT − 1) / (HERO_MULT − 1 + CONTENT_BEATS_VH)
//
//   ▪ overallProgress ≤ heroFraction
//       → hero phase: frame advances from 0 to TOTAL_FRAMES − 1
//       → heroProgress = overallProgress / heroFraction  (0 → 1)
//       → contentProgress = −1  (content beats hidden)
//
//   ▪ overallProgress > heroFraction
//       → content phase: frame frozen at TOTAL_FRAMES − 1
//       → contentProgress = (overallProgress − heroFraction) / (1 − heroFraction)  (0 → 1)
//       → hero overlays all opacity 0
//
// Desktop: HERO_MULT = 4.5 → heroFraction = 3.5 / 7.5 = 0.467
// Mobile:  HERO_MULT = 3.0 → heroFraction = 2.0 / 6.0 = 0.333

const DESKTOP_SCROLL_MULTIPLIER = 3.0
const MOBILE_SCROLL_MULTIPLIER  = 2.0

// Extra viewport-heights after the hero phase (0 = no content beats, HomeContent scrolls naturally).
const CONTENT_BEATS_VH = 0

// ─── Image loading constants ──────────────────────────────────────────────────
const DESKTOP_EAGER_FRAMES = 30
const MOBILE_EAGER_FRAMES  = 15
const DESKTOP_LOOKAHEAD    = 4
const MOBILE_LOOKAHEAD     = 3

// ─── Sequence layout (rendering) ─────────────────────────────────────────────
const SEQ_BOUNDS = {
  seq1End: 191,
  seq2End: 383,
  seq3End: 575,
}
const BG_DARKEN_ALPHA = 0.22

// ─── scn-4 scale correction ───────────────────────────────────────────────────
// The scn-4 source frames were exported ~10% more zoomed-in than the final
// frames of scn-3 (camera framing difference at capture time).  Without
// correction this causes a visible zoom-pop at the scn-3→scn-4 boundary.
//
// Fix: apply a sub-unity scale multiplier to the fg-pass render at the start
// of scn-4, then smoothly ease it back to 1.0 over the first 20 % of the
// scene.  Pass-1 (cover fill, 38 % darken) handles any canvas-edge exposure
// during the ease, producing a subtle cinematic vignette rather than a hard
// gap.
const SCN4_START_FRAME   = SEQ_BOUNDS.seq3End + 1          // frame index 576
const SCN4_SCALE_ENTER   = 0.91                             // ~9 % zoom-out at entry
const SCN4_EASE_FRAMES   = Math.round(192 * 0.20)           // ease over first ~38 frames

function getScn4ScaleCorrection(frameIndex: number): number {
  if (frameIndex < SCN4_START_FRAME) return 1.0
  const f = frameIndex - SCN4_START_FRAME
  if (f >= SCN4_EASE_FRAMES) return 1.0
  const t     = f / SCN4_EASE_FRAMES
  const eased = t * t * (3 - 2 * t)   // smoothstep
  return SCN4_SCALE_ENTER + (1.0 - SCN4_SCALE_ENTER) * eased
}

// ─── Sequence layout types ────────────────────────────────────────────────────
interface SequenceLayout {
  fgBlend: number   // 0=contain … 1=cover for fg pass scale
  focalX:  number   // horizontal anchor: 0=left edge, 0.5=centre, 1=right edge
  focalY:  number   // vertical anchor:   0=top  edge, 0.5=centre, 1=bottom edge
}

// ─── Desktop art direction ────────────────────────────────────────────────────
// Landscape canvas — wide images, generous framing.
const DESKTOP_LAYOUT: Record<'seq1' | 'seq2' | 'seq3' | 'seq4', SequenceLayout> = {
  seq1: { fgBlend: 0.72, focalX: 0.50, focalY: 0.40 },
  seq2: { fgBlend: 0.72, focalX: 0.50, focalY: 0.48 },
  seq3: { fgBlend: 0.62, focalX: 0.50, focalY: 0.62 },
  seq4: { fgBlend: 0.72, focalX: 0.50, focalY: 0.50 },
}

// ─── Mobile art direction ─────────────────────────────────────────────────────
// Portrait canvas crops images very differently from desktop.  Each scene has
// its own focal point tuned so the relevant subject stays centred on a narrow
// screen — do NOT derive these from desktop values.
//
// Key fixes vs. the old shared config:
//   scn-2  focalX was 0.65 → drifted to the right on portrait.  Reset to 0.50
//          so the cockpit/plane body stays centred.
//   scn-3  focalY raised (0.70 → 0.55) to keep the horizon in frame on mobile.
//   scn-4  Slightly tighter blend to compensate for the source zoom difference.
//
// fgBlend is raised across all mobile scenes (≥ 0.82) because portrait crops
// need a higher scale to keep the subject filling the narrow canvas.
const MOBILE_LAYOUT: Record<'seq1' | 'seq2' | 'seq3' | 'seq4', SequenceLayout> = {
  seq1: { fgBlend: 0.88, focalX: 0.50, focalY: 0.38 }, // plane in upper-centre
  seq2: { fgBlend: 0.88, focalX: 0.50, focalY: 0.45 }, // re-centred; was drifting right
  seq3: { fgBlend: 0.82, focalX: 0.50, focalY: 0.55 }, // horizon centred vertically
  seq4: { fgBlend: 0.90, focalX: 0.50, focalY: 0.50 }, // neutral centre
}

// ─── Mobile cross-scene interpolation ────────────────────────────────────────
// On mobile a hard layout switch at the scene boundary is visible as a flicker
// because the focal point can jump.  We blend the outgoing → incoming layout
// over a small window of frames around each boundary.
//
// BLEND_WINDOW = number of frames on EACH side of the boundary to interpolate.
// 12 frames ≈ 6 % of a 192-frame scene — smooth but not sluggish.
const MOBILE_BLEND_WINDOW = 12

/** Smoothstep (0→1) for a value t already in [0,1]. */
function smoothstep(t: number): number { return t * t * (3 - 2 * t) }

/**
 * Returns an interpolated SequenceLayout for mobile, blending between adjacent
 * scene configs near each scene boundary to eliminate focal-point jumps.
 */
function getMobileLayout(frameIndex: number): SequenceLayout {
  const seqs = ['seq1', 'seq2', 'seq3', 'seq4'] as const
  const ends  = [SEQ_BOUNDS.seq1End, SEQ_BOUNDS.seq2End, SEQ_BOUNDS.seq3End, Infinity]

  // Determine which scene we're in and how far into / from its end.
  for (let s = 0; s < seqs.length; s++) {
    const sceneStart = s === 0 ? 0 : ends[s - 1] + 1
    const sceneEnd   = ends[s]
    if (frameIndex > sceneEnd) continue

    const current = MOBILE_LAYOUT[seqs[s]]

    // ── Blend-in from previous scene (start of this scene) ───────────────────
    if (s > 0) {
      const framesIn = frameIndex - sceneStart
      if (framesIn < MOBILE_BLEND_WINDOW) {
        const prev = MOBILE_LAYOUT[seqs[s - 1]]
        const t    = smoothstep(framesIn / MOBILE_BLEND_WINDOW)
        return {
          fgBlend: prev.fgBlend + (current.fgBlend - prev.fgBlend) * t,
          focalX:  prev.focalX  + (current.focalX  - prev.focalX)  * t,
          focalY:  prev.focalY  + (current.focalY  - prev.focalY)  * t,
        }
      }
    }

    // ── Blend-out to next scene (end of this scene) ───────────────────────────
    if (s < seqs.length - 1 && sceneEnd !== Infinity) {
      const framesFromEnd = sceneEnd - frameIndex
      if (framesFromEnd < MOBILE_BLEND_WINDOW) {
        const next = MOBILE_LAYOUT[seqs[s + 1]]
        const t    = smoothstep(1 - framesFromEnd / MOBILE_BLEND_WINDOW)
        return {
          fgBlend: current.fgBlend + (next.fgBlend - current.fgBlend) * t,
          focalX:  current.focalX  + (next.focalX  - current.focalX)  * t,
          focalY:  current.focalY  + (next.focalY  - current.focalY)  * t,
        }
      }
    }

    return current
  }
  return MOBILE_LAYOUT.seq4
}

// ─── Layout selector (desktop uses direct lookup; mobile uses interpolation) ──
function getLayout(frameIndex: number, isMobile: boolean): SequenceLayout {
  if (isMobile) return getMobileLayout(frameIndex)
  if (frameIndex <= SEQ_BOUNDS.seq1End) return DESKTOP_LAYOUT.seq1
  if (frameIndex <= SEQ_BOUNDS.seq2End) return DESKTOP_LAYOUT.seq2
  if (frameIndex <= SEQ_BOUNDS.seq3End) return DESKTOP_LAYOUT.seq3
  return DESKTOP_LAYOUT.seq4
}

// ─── Floating paths (BackgroundPaths adaptation) ──────────────────────────────
// Durations are index-derived to avoid Math.random() SSR/client hydration mismatch.
const FLOAT_PATH_DURATIONS = Array.from({ length: 36 }, (_, i) => 20 + ((i * 7 + 3) % 11))

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.7 + i * 0.04,
  }))
  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg className="w-full h-full" viewBox="0 0 696 316" fill="none" aria-hidden="true">
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="rgba(167,200,255,1)"
            strokeWidth={path.width}
            strokeOpacity={0.012 + path.id * 0.001}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{ pathLength: 1, opacity: [0.3, 0.6, 0.3], pathOffset: [0, 1, 0] }}
            transition={{ duration: FLOAT_PATH_DURATIONS[path.id], repeat: Infinity, ease: 'linear' }}
          />
        ))}
      </svg>
    </div>
  )
}

// ─── Ambient Overlays (Living Poster Elements) ────────────────────────────────
const AMBIENT_TUNING = {
  mobile: {
    // Cloud A: much wider and shifted up to counteract narrow portrait framing
    cloudA: 'w-[300%] h-[75%] bottom-[2%]',
    // Cloud B:
    cloudB: 'w-[250%] h-[65%] bottom-[0%]',
  },
  desktop: {
    cloudA: 'md:w-[180%] md:h-[95%] md:bottom-[-2%]',
    cloudB: 'md:w-[150%] md:h-[80%] md:bottom-[-8%]',
  }
}

function AmbientOverlays({ innerRef }: { innerRef: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={innerRef}
      className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
      style={{ opacity: 1 }}
    >
      {/* Cloud Layer A - Main oversized structure */}
      <div 
        className={`absolute left-[50%] ${AMBIENT_TUNING.mobile.cloudA} ${AMBIENT_TUNING.desktop.cloudA} flex items-end justify-center will-change-transform opacity-[0.45] mix-blend-screen`}
        style={{ animation: 'drift-cloud-a 14s ease-in-out infinite alternate', transform: 'translateX(-50%)' }}
      >
        <img 
          src="/CloudLayerA.webp" 
          alt="" 
          className="w-full h-full object-cover"
          style={{ 
            // Dropped brightness to pull away from pure white, shifted hue to lavender/cool-blue
            filter: 'brightness(0.90) contrast(1.05) sepia(0.15) hue-rotate(230deg) saturate(1.1)', 
            maskImage: 'radial-gradient(ellipse 90% 100% at 50% 100%, black 15%, rgba(0,0,0,0.4) 50%, transparent 80%)', 
            WebkitMaskImage: 'radial-gradient(ellipse 90% 100% at 50% 100%, black 15%, rgba(0,0,0,0.4) 50%, transparent 80%)' 
          }}
        />
      </div>

      {/* Cloud Layer B - Inner depth */}
      <div 
        className={`absolute left-[50%] ${AMBIENT_TUNING.mobile.cloudB} ${AMBIENT_TUNING.desktop.cloudB} flex items-end justify-center will-change-transform opacity-[0.40] mix-blend-screen`}
        style={{ animation: 'drift-cloud-b 11s ease-in-out infinite alternate', transform: 'translateX(-50%)' }}
      >
        <img 
          src="/CloudLayerB.webp" 
          alt="" 
          className="w-full h-full object-cover"
          style={{ 
            // Slightly deeper lavender tint and lower brightness for depth separation
            filter: 'brightness(0.85) contrast(1.05) sepia(0.20) hue-rotate(230deg) saturate(1.2)',
            maskImage: 'radial-gradient(ellipse 85% 100% at 50% 100%, black 20%, rgba(0,0,0,0.5) 50%, transparent 85%)', 
            WebkitMaskImage: 'radial-gradient(ellipse 85% 100% at 50% 100%, black 20%, rgba(0,0,0,0.5) 50%, transparent 85%)' 
          }}
        />
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes drift-cloud-a {
          0% { transform: translateX(-56%); }
          100% { transform: translateX(-44%); }
        }
        @keyframes drift-cloud-b {
          0% { transform: translateX(-45%); }
          100% { transform: translateX(-55%); }
        }
        @keyframes airy-float {
          0% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-12px) rotate(0.8deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
        .animate-airy-float {
          animation: airy-float 9s ease-in-out infinite;
          transform-origin: center center;
          will-change: transform;
        }
      `}} />
    </div>
  )
}

// ─── Hero text overlays ───────────────────────────────────────────────────────
// startPct / endPct applied to heroProgress (0–1 over the hero phase only).
// alwaysVisible: true → fades in at startPct then stays visible for rest of hero phase
const TEXT_OVERLAYS = [
  {
    id: 'intro',
    startPct: 0,
    endPct: 0.18,
    fullBleed: true,
    alwaysVisible: false,
    content: (
      <>
        {/* ── Zone 1: eyebrow + headline — centre-aligned, upper area ── */}
        <div className="absolute left-0 right-0 flex flex-col items-center text-center px-6 md:px-12" style={{ top: '16vh' }}>
          <h1 className="font-serif text-4xl md:text-7xl font-black leading-tight">
            <span className="block">
              {'FLY'.split('').map((char, i) => (
                <motion.span
                  key={`l1-${i}`}
                  className={`inline-block text-oz-text${char === ' ' ? ' mr-[0.22em]' : ''}`}
                  initial={{ y: 60, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.40 + i * 0.05, type: 'spring', stiffness: 70, damping: 20 }}
                >
                  {char === ' ' ? '\u00A0' : char}
                </motion.span>
              ))}
            </span>
            {/* "YOUR WAY" with handwritten-style SVG underline */}
            <span className="block italic text-oz-blue relative pb-3 animate-airy-float">
              {'YOUR WAY'.split('').map((char, i) => (
                <motion.span
                  key={`l2-${i}`}
                  className={`inline-block${char === ' ' ? ' mr-[0.22em]' : ''}`}
                  initial={{ y: 60, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.80 + i * 0.05, type: 'spring', stiffness: 70, damping: 20 }}
                >
                  {char === ' ' ? '\u00A0' : char}
                </motion.span>
              ))}
              {/* Handwritten underline — draws in after the text settles */}
              <svg
                viewBox="0 0 340 20"
                fill="none"
                aria-hidden="true"
                className="absolute left-1/2 -translate-x-1/2 bottom-[-2px] w-[90%] md:w-[85%] h-[14px] md:h-[18px]"
              >
                <motion.path
                  d="M 6 13 C 45 5, 90 18, 145 10 C 200 3, 255 16, 310 10 C 322 8, 330 9, 334 11"
                  stroke="rgba(167,200,255,0.55)"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ delay: 1.5, duration: 1.2, ease: 'easeOut' }}
                />
              </svg>
            </span>
          </h1>
        </div>

        {/* ── Zone 2: body text + CTA — pinned to bottom, centre-aligned ── */}
        <div className="absolute left-0 right-0 bottom-[13vh] flex flex-col items-center text-center px-6 pointer-events-auto">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4, duration: 0.8, ease: 'easeOut' }}
            className="font-sans text-sm md:text-lg text-oz-muted font-light leading-relaxed max-w-xs md:max-w-md mb-5 md:mb-7"
          >
            A modern platform for pilots — rent, fly, and enjoy
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.7, duration: 0.8, ease: 'easeOut' }}
          >
            <a
              href="/pilotRequirements"
              className="inline-block bg-gradient-to-r from-[#4168a6] to-[#172c4a] text-white rounded-md font-sans font-bold tracking-widest uppercase text-sm px-10 py-4 shadow-xl shadow-[#4168a6]/30 transition-all duration-300 hover:shadow-2xl hover:shadow-[#4168a6]/50 hover:scale-[1.02] active:scale-95"
            >
              Schedule your checkout Flight
            </a>
          </motion.div>
        </div>
      </>
    ),
  },
  {
    id: 'aircraft',
    startPct: 0.28,
    endPct: 0.52,
    fullBleed: false,
    alwaysVisible: false,
    content: (
      <div className="max-w-xs md:max-w-md">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.10, duration: 0.5 }}
          className="font-sans text-[10px] md:text-xs font-bold tracking-[0.3em] uppercase text-oz-blue/70 mb-3 md:mb-4"
        >
          Our Fleet
        </motion.p>
        <h2 className="font-serif text-3xl md:text-5xl font-black leading-tight mb-4 md:mb-5">
          <span className="block">
            {'Built for pilots'.split('').map((char, i) => (
              <motion.span
                key={`fleet-l1-${i}`}
                className={`inline-block text-oz-text${char === ' ' ? ' mr-[0.22em]' : ''}`}
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.18 + i * 0.026, type: 'spring', stiffness: 150, damping: 25 }}
              >
                {char === ' ' ? '\u00A0' : char}
              </motion.span>
            ))}
          </span>
          <span className="block italic text-oz-blue">
            {'Not passengers'.split('').map((char, i) => (
              <motion.span
                key={`fleet-l2-${i}`}
                className={`inline-block${char === ' ' ? ' mr-[0.22em]' : ''}`}
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.44 + i * 0.026, type: 'spring', stiffness: 150, damping: 25 }}
              >
                {char === ' ' ? '\u00A0' : char}
              </motion.span>
            ))}
          </span>
        </h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.92, duration: 0.6 }}
          className="font-sans text-sm md:text-base text-oz-muted font-light leading-relaxed"
        >
          We start with a Cessna 172 — the most trusted training and touring aircraft in the world,
          well-maintained, thoroughly checked, and ready when you are
        </motion.p>
      </div>
    ),
  },
  {
    id: 'cockpit',
    startPct: 0.62,
    endPct: 1.0,
    fullBleed: false,
    alwaysVisible: true,
    content: (
      <div className="max-w-xs md:max-w-md">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.10, duration: 0.5 }}
          className="font-sans text-[9px] font-semibold tracking-[0.38em] uppercase text-oz-blue/75 mb-2.5 md:mb-4"
        >
          The Experience
        </motion.p>
        <h2 className="font-serif text-2xl md:text-5xl font-black leading-tight mb-0 md:mb-5">
          <span className="block">
            {'Command'.split('').map((char, i) => (
              <motion.span
                key={`exp-l1-${i}`}
                className="inline-block text-oz-text"
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.18 + i * 0.032, type: 'spring', stiffness: 150, damping: 25 }}
              >
                {char}
              </motion.span>
            ))}
          </span>
          <span className="block italic text-oz-blue">
            {'your aircraft'.split('').map((char, i) => (
              <motion.span
                key={`exp-l2-${i}`}
                className={`inline-block${char === ' ' ? ' mr-[0.22em]' : ''}`}
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.44 + i * 0.028, type: 'spring', stiffness: 150, damping: 25 }}
              >
                {char === ' ' ? '\u00A0' : char}
              </motion.span>
            ))}
          </span>
        </h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.88, duration: 0.6 }}
          className="hidden md:block font-sans text-base text-oz-muted font-light leading-relaxed"
        >
          From pre-flight checks to touchdown, the aircraft is yours — no instructors required
          for qualified pilots, no unnecessary oversight
        </motion.p>
      </div>
    ),
  },
]

// ─── Safari desktop static text overlays ─────────────────────────────────────
// Plain HTML equivalents of TEXT_OVERLAYS — no Framer Motion components at all.
// Identical text, identical className and layout; zero animation overhead.
// Used when isSafariDesktop = true.
const SAFARI_TEXT_OVERLAYS = [
  {
    id: 'intro',
    startPct: 0,
    endPct: 0.18,
    fullBleed: true,
    alwaysVisible: false,
    content: (
      <>
        <div className="absolute left-0 right-0 flex flex-col items-center text-center px-6 md:px-12" style={{ top: '16vh' }}>
          <h1 className="font-serif text-4xl md:text-7xl font-black leading-tight">
            <span className="block text-oz-text">FLY</span>
            <span className="block italic text-oz-blue relative pb-3">
              YOUR WAY
              <svg
                viewBox="0 0 340 20"
                fill="none"
                aria-hidden="true"
                className="absolute left-1/2 -translate-x-1/2 bottom-[-2px] w-[90%] md:w-[85%] h-[14px] md:h-[18px]"
              >
                <path
                  d="M 6 13 C 45 5, 90 18, 145 10 C 200 3, 255 16, 310 10 C 322 8, 330 9, 334 11"
                  stroke="rgba(167,200,255,0.55)"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </h1>
        </div>
        <div className="absolute left-0 right-0 bottom-[13vh] flex flex-col items-center text-center px-6 pointer-events-auto">
          <p className="font-sans text-sm md:text-lg text-oz-muted font-light leading-relaxed max-w-xs md:max-w-md mb-5 md:mb-7">
            A modern platform for pilots — rent, fly, and enjoy
          </p>
          <a
            href="/pilotRequirements"
            className="inline-block bg-gradient-to-r from-[#4168a6] to-[#172c4a] text-white rounded-md font-sans font-bold tracking-widest uppercase text-sm px-10 py-4 shadow-xl shadow-[#4168a6]/30 transition-all duration-300 hover:shadow-2xl hover:shadow-[#4168a6]/50 hover:scale-[1.02] active:scale-95"
          >
            Schedule your checkout Flight
          </a>
        </div>
      </>
    ),
  },
  {
    id: 'aircraft',
    startPct: 0.28,
    endPct: 0.52,
    fullBleed: false,
    alwaysVisible: false,
    content: (
      <div className="max-w-xs md:max-w-md">
        <p className="font-sans text-[10px] md:text-xs font-bold tracking-[0.3em] uppercase text-oz-blue/70 mb-3 md:mb-4">
          Our Fleet
        </p>
        <h2 className="font-serif text-3xl md:text-5xl font-black leading-tight mb-4 md:mb-5">
          <span className="block text-oz-text">Built for pilots</span>
          <span className="block italic text-oz-blue">Not passengers</span>
        </h2>
        <p className="font-sans text-sm md:text-base text-oz-muted font-light leading-relaxed">
          We start with a Cessna 172 — the most trusted training and touring aircraft in the world,
          well-maintained, thoroughly checked, and ready when you are
        </p>
      </div>
    ),
  },
  {
    id: 'cockpit',
    startPct: 0.62,
    endPct: 1.0,
    fullBleed: false,
    alwaysVisible: true,
    content: (
      <div className="max-w-xs md:max-w-md">
        <p className="font-sans text-[9px] font-semibold tracking-[0.38em] uppercase text-oz-blue/75 mb-2.5 md:mb-4">
          The Experience
        </p>
        <h2 className="font-serif text-2xl md:text-5xl font-black leading-tight mb-0 md:mb-5">
          <span className="block text-oz-text">Command</span>
          <span className="block italic text-oz-blue">your aircraft</span>
        </h2>
        <p className="hidden md:block font-sans text-base text-oz-muted font-light leading-relaxed">
          From pre-flight checks to touchdown, the aircraft is yours — no instructors required
          for qualified pilots, no unnecessary oversight
        </p>
      </div>
    ),
  },
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function HeroScrollStage() {
  const sectionRef         = useRef<HTMLDivElement>(null)
  const canvasRef          = useRef<HTMLCanvasElement>(null)
  const canvasLayerRef     = useRef<HTMLDivElement>(null)
  const overlayRefs        = useRef<(HTMLDivElement | null)[]>([])
  const ambientRefs        = useRef<HTMLDivElement | null>(null)
  const scrollIndicatorRef = useRef<HTMLDivElement | null>(null)

  const imagesRef              = useRef<(HTMLImageElement | null)[]>(new Array(TOTAL_FRAMES).fill(null))
  const loadingRef             = useRef<boolean[]>(new Array(TOTAL_FRAMES).fill(false))
  const posterCanvasRef        = useRef<HTMLCanvasElement>(null)
  const isOpeningChunkReadyRef = useRef(false)
  const hasRevealedLiveHeroRef = useRef(false)

  const currentFrameRef    = useRef(0)
  const prevWidthRef       = useRef(0)
  const targetProgressRef  = useRef(0)   // set by scroll events (raw)
  const currentProgressRef = useRef(0)   // lerp'd toward target each rAF tick
  const rafRef             = useRef<number | null>(null)
  const dirtyRef           = useRef(true)
  const isMobileRef        = useRef(false)

  // ── Performance refs ───────────────────────────────────────────────────────
  // lastDrawnFrameRef: skip the canvas draw when frame index hasn't changed
  const lastDrawnFrameRef  = useRef(-1)
  // overallProgress and heroFraction stored by onScroll, read by renderLoop
  const overallProgressRef = useRef(0)
  const heroFractionRef    = useRef(1)
  // Stable pointer to the latest renderLoop so onScroll / loadFrameAsync can
  // wake the idle RAF without creating a circular useCallback dependency
  const renderLoopRef      = useRef<FrameRequestCallback>(() => {})
  // ResizeObserver handle + last measured CSS size for change-detection
  const roRef              = useRef<ResizeObserver | null>(null)
  const prevCanvasSizeRef  = useRef({ w: 0, h: 0 })
  // Sticky viewport container — ResizeObserver target
  const stickyRef          = useRef<HTMLDivElement>(null)
  // Dev-only diagnostic counters (tree-shaken in production builds)
  const devDrawCountRef    = useRef(0)
  const devSkipCountRef    = useRef(0)
  const devWakeCountRef    = useRef(0)
  const devResizeCountRef  = useRef(0)

  // ── Safari desktop active-scroll performance mode ──────────────────────────
  // isSafariDesktopRef: set once at mount, never changes
  // isScrubbingRef:     true while the user is actively scrolling (+ 200 ms cooldown)
  // scrubTimerRef:      handle for the cooldown setTimeout
  // floatingPathsWrapRef: wraps both FloatingPaths groups so we can hide them as one unit
  const isSafariDesktopRef   = useRef(false)
  const isScrubbingRef       = useRef(false)
  const scrubTimerRef        = useRef<number | null>(null)
  const floatingPathsWrapRef = useRef<HTMLDivElement>(null)

  // Scroll Lock + Timeline State
  const [isScrollLocked, setIsScrollLocked] = useState(true)
  // Set to true after mount if running on Safari desktop — drives hard fallback
  // conditional rendering in JSX (no re-render once locked in).
  const [isSafariDesktop, setIsSafariDesktop] = useState(false)
  const scrollLockedRef    = useRef(true)
  const introCompleteRef   = useRef(false)

  const checkUnlock = useCallback(() => {
    if (
      scrollLockedRef.current &&
      introCompleteRef.current &&
      isOpeningChunkReadyRef.current &&
      hasRevealedLiveHeroRef.current
    ) {
      scrollLockedRef.current = false
      setIsScrollLocked(false)
    }
  }, [])

  const [sectionHeight,  setSectionHeight]  = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [posterVisible,  setPosterVisible]  = useState(true)

  // ── 2-pass canvas draw ─────────────────────────────────────────────────────
  const drawFrame = useCallback((index: number, targetCanvas?: HTMLCanvasElement, singlePass = false): boolean => {
    const canvas = targetCanvas || canvasRef.current
    if (!canvas) return false
    const img = imagesRef.current[index]
    if (!img) { 
      if (canvas === canvasRef.current) dirtyRef.current = true
      return false
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return false

    const { width: cw, height: ch } = canvas
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    if (!iw || !ih) return false

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const containScale = Math.min(cw / iw, ch / ih)
    const coverScale   = Math.max(cw / iw, ch / ih)

    // Pass 1 — background: pure cover, always full-bleed
    const bgW = iw * coverScale
    const bgH = ih * coverScale
    ctx.drawImage(img, (cw - bgW) * 0.5, (ch - bgH) * 0.5, bgW, bgH)

    // singlePass (Safari desktop hard fallback): one drawImage and done.
    // No darkening fillRect, no focal-blend foreground pass — maximum speed.
    if (singlePass) return true

    ctx.fillStyle = `rgba(0,0,0,${BG_DARKEN_ALPHA})`
    ctx.fillRect(0, 0, cw, ch)

    // Pass 2 — foreground: gentler fit, more composition preserved.
    // Base scale is clamped so fgH >= ch and fgW >= cw (no exposed-band risk).
    // For scn-4 a per-frame correction is applied on top to compensate for the
    // source footage being ~10 % more zoomed-in than scn-3's end frames.
    const layout          = getLayout(index, isMobileRef.current)
    const blendScale      = containScale + (coverScale - containScale) * layout.fgBlend
    const baseScale       = Math.max(blendScale, cw / iw, ch / ih)
    const scaleCorrection = getScn4ScaleCorrection(index)
    const fgScale         = baseScale * scaleCorrection
    const fgW             = iw * fgScale
    const fgH             = ih * fgScale
    const fgX             = (cw - fgW) * layout.focalX
    const fgY             = (ch - fgH) * layout.focalY
    ctx.drawImage(img, fgX, fgY, fgW, fgH)
    return true
  }, [])

  const drawPosterFrame = useCallback(() => {
    if (posterCanvasRef.current) {
      drawFrame(0, posterCanvasRef.current)
    }
  }, [drawFrame])

  // ── Resize ────────────────────────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const w = window.innerWidth
    const isMobile = w < 768

    // iPhone Safari jump fix: ignore height-only resizes (address bar scrolling)
    if (isMobile && prevWidthRef.current === w) return
    prevWidthRef.current = w
    isMobileRef.current = isMobile

    const h = window.innerHeight
    // Safari desktop gets an extra-conservative DPR cap (1.25) to reduce canvas
    // buffer area.  Other desktop browsers use 1.5.  Mobile keeps 2 for sharpness.
    // Safari desktop hard fallback: DPR 1.0 — smallest possible canvas buffer.
    const dprCap = isMobile ? 2 : (isSafariDesktopRef.current ? 1.0 : 1.5)
    const dpr    = Math.min(window.devicePixelRatio || 1, dprCap)
    canvas.width  = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    
    if (posterCanvasRef.current) {
      posterCanvasRef.current.width  = canvas.width
      posterCanvasRef.current.height = canvas.height
      drawPosterFrame()
    }
    
    dirtyRef.current = true

    const heroMult  = isMobileRef.current ? MOBILE_SCROLL_MULTIPLIER : DESKTOP_SCROLL_MULTIPLIER
    setSectionHeight(h * (heroMult + CONTENT_BEATS_VH))
    setViewportHeight(h)
  }, [drawPosterFrame])

  // ── Frame loader ───────────────────────────────────────────────────────────
  const loadFrameAsync = useCallback(async (index: number) => {
    if (index < 0 || index >= TOTAL_FRAMES) return
    if (imagesRef.current[index]) return
    if (loadingRef.current[index]) return

    loadingRef.current[index] = true
    return new Promise<void>((resolve) => {
      const img = new Image()
      img.src = FRAME_PATHS[index]
      img.onload = async () => {
        try { await img.decode() } catch (e) {}
        imagesRef.current[index] = img
        if (index === 0) drawPosterFrame()
        if (index === currentFrameRef.current) {
          dirtyRef.current = true
          // Wake the RAF loop if it went idle while waiting for this frame
          if (!rafRef.current) rafRef.current = requestAnimationFrame(renderLoopRef.current)
        }
        resolve()
      }
      img.onerror = () => resolve()
    })
  }, [drawPosterFrame])

  // ── rAF loop ───────────────────────────────────────────────────────────────
  // Lerp currentProgress → targetProgress each tick for cinematic smoothness.
  // Factor 0.075 = slow/buttery. Raise toward 0.15 for a snappier feel.
  //
  // KEY PERF CONTRACT:
  //   • Clears rafRef.current at tick start — callers use !rafRef.current to
  //     detect idle and wake the loop rather than letting it spin constantly.
  //   • Only re-schedules when the lerp is still moving OR canvas is dirty.
  //     When the user stops scrolling the loop drains the lerp then goes quiet.
  //   • lastDrawnFrameRef skip: identical frame → no canvas work at all.
  //   • ALL style writes (overlays, ambient, scroll indicator) happen here in
  //     one batched pass — nothing touches the DOM inside onScroll.
  const LERP_FACTOR = 0.075

  const renderLoop = useCallback((): void => {
    rafRef.current = null   // mark idle; re-set below if more work remains

    const prev   = currentProgressRef.current
    const target = targetProgressRef.current
    const delta  = target - prev

    // Safari desktop hard fallback: snap directly to targetProgress — no lerp.
    // Eliminates the long tail of intermediate RAF frames that drain the lerp
    // queue while compositing.  settled = true always → loop goes idle after
    // one draw per scroll event.
    const settled = isSafariDesktopRef.current
      ? true
      : Math.abs(delta) <= 0.0001
    currentProgressRef.current = (settled || isSafariDesktopRef.current)
      ? target
      : prev + delta * LERP_FACTOR

    const cp = currentProgressRef.current

    // Safari desktop hard fallback: sample every 2nd source frame.
    // Maps progress → {0, 2, 4, …, 766} (384 effective frames out of 768).
    // Halves decode/draw pressure while preserving scene order and flow.
    const frameIndex = isSafariDesktopRef.current
      ? Math.round(cp * ((TOTAL_FRAMES / 2) - 1)) * 2
      : Math.round(cp * (TOTAL_FRAMES - 1))
    const isNewFrame = frameIndex !== lastDrawnFrameRef.current

    // ── Canvas draw ──────────────────────────────────────────────────────────
    if (isNewFrame || dirtyRef.current) {
      currentFrameRef.current = frameIndex
      // Safari desktop hard fallback: always use truly minimal single-pass draw
      // (pure cover only — no darkening fillRect, no focal-blend Pass 2).
      const useSinglePass = isSafariDesktopRef.current
      const didDraw = drawFrame(frameIndex, undefined, useSinglePass)

      if (didDraw) {
        if (process.env.NODE_ENV === 'development') {
          devDrawCountRef.current++
          if (!isNewFrame) devSkipCountRef.current++
          // Log every 60th draw to avoid console spam
          if (devDrawCountRef.current % 60 === 0) {
            const actualDpr = canvasRef.current
              ? (canvasRef.current.width / (window.innerWidth || 1)).toFixed(2)
              : '?'
            console.debug(
              `[Hero] safariDesktop=${isSafariDesktopRef.current} safariFallback=${isSafariDesktopRef.current}` +
              ` singlePass=${useSinglePass} dpr=${actualDpr}` +
              ` frameStep=${isSafariDesktopRef.current ? 2 : 1} frame=${frameIndex}` +
              ` draws=${devDrawCountRef.current} dupSkips=${devSkipCountRef.current}` +
              ` wakes=${devWakeCountRef.current} resizes=${devResizeCountRef.current}`
            )
          }
        }
        lastDrawnFrameRef.current = frameIndex
        dirtyRef.current = false
        if (isOpeningChunkReadyRef.current && !hasRevealedLiveHeroRef.current) {
          hasRevealedLiveHeroRef.current = true
          setPosterVisible(false)
          checkUnlock()
        }
      } else {
        // Frame not loaded yet — stay dirty so we retry when it arrives.
        // loadFrameAsync.onload will also wake the RAF loop then.
        dirtyRef.current = true
      }

      // Lookahead preload — only when frame index moves, not every tick.
      // Safari desktop gets a minimal window (±1) to avoid decode pressure.
      if (isNewFrame) {
        const lookahead = isMobileRef.current
          ? MOBILE_LOOKAHEAD
          : (isSafariDesktopRef.current ? 1 : DESKTOP_LOOKAHEAD)
        for (let lo = -lookahead; lo <= lookahead; lo++) {
          loadFrameAsync(frameIndex + lo)
        }
      }
    }

    // ── All style writes batched here, not in onScroll ───────────────────────
    // Reads lerped cp so animations stay tied to the smooth canvas motion.
    const heroProgress    = cp
    const overallProgress = overallProgressRef.current
    const heroFraction    = heroFractionRef.current
    const inHeroPhase     = overallProgress <= heroFraction

    overlayRefs.current.forEach((el, idx) => {
      if (!el) return
      const { startPct, endPct, alwaysVisible } = TEXT_OVERLAYS[idx]
      const fadeDuration = 0.055
      let opacity = 0
      if (inHeroPhase) {
        if (alwaysVisible) {
          if (heroProgress >= startPct) opacity = Math.min(1, (heroProgress - startPct) / fadeDuration)
        } else if (heroProgress >= startPct && heroProgress <= endPct) {
          const fadeIn  = startPct === 0 ? 1 : Math.min(1, (heroProgress - startPct) / fadeDuration)
          const fadeOut = Math.min(1, (endPct - heroProgress) / fadeDuration)
          opacity = Math.min(fadeIn, fadeOut)
        }
      }
      el.style.opacity = String(opacity)
    })

    if (ambientRefs.current) {
      const startFade = 0.05
      const endFade   = 0.25
      let ambientOp = 1
      if (heroProgress >= endFade) ambientOp = 0
      else if (heroProgress > startFade) ambientOp = 1 - (heroProgress - startFade) / (endFade - startFade)
      // Suppress cloud + propeller compositing during Safari active scrubbing.
      // The RAF loop restores it naturally once isScrubbingRef flips back to false.
      if (isSafariDesktopRef.current && isScrubbingRef.current) ambientOp = 0
      ambientRefs.current.style.opacity = String(ambientOp)
    }

    if (scrollIndicatorRef.current) {
      const indOpacity = Math.max(0, 1 - heroProgress / 0.10) * 0.5
      scrollIndicatorRef.current.style.opacity = String(indOpacity)
    }

    // ── Continue or idle ─────────────────────────────────────────────────────
    if (!settled || dirtyRef.current) {
      rafRef.current = requestAnimationFrame(renderLoopRef.current)
    }
  }, [drawFrame, loadFrameAsync, checkUnlock])

  // Keep renderLoopRef current so onScroll and loadFrameAsync can wake the
  // idle loop without a circular useCallback dependency chain.
  renderLoopRef.current = renderLoop

  // ── Unified scroll handler — ultra-light, zero DOM writes ─────────────────
  // Only job: compute heroProgress from the scroll position and store it in
  // refs so the RAF renderLoop can read it on the next animation frame.
  //
  // Everything removed from here vs the original:
  //   • preload loop (was calling loadFrameAsync up to 14× per scroll event)
  //   • overlay opacity writes  (now batched in renderLoop)
  //   • ambient opacity write   (now batched in renderLoop)
  //   • scroll indicator write  (now batched in renderLoop)
  //   • canvas layer write      (no longer needed — always 1)
  //
  // This is the single biggest Safari scroll-jank fix: the scroll handler now
  // runs in well under 0.1 ms rather than triggering layout + multiple paints.
  const onScroll = useCallback(() => {
    const section = sectionRef.current
    if (!section) return

    // iOS Safari measurement fix
    const scrollY         = window.pageYOffset || document.documentElement.scrollTop || 0
    const sectionTop      = section.offsetTop || 0
    const scrolled        = scrollY - sectionTop

    // Stable viewport height — ignores Safari address-bar resize noise
    const vh              = document.documentElement.clientHeight || window.innerHeight
    const totalScrollable = section.offsetHeight - vh
    if (totalScrollable <= 0) return

    const overallProgress = Math.max(0, Math.min(1, scrolled / totalScrollable))

    const heroMult     = isMobileRef.current ? MOBILE_SCROLL_MULTIPLIER : DESKTOP_SCROLL_MULTIPLIER
    const heroScrollPx = (heroMult - 1) * vh
    const heroFraction = heroScrollPx / totalScrollable

    // heroProgress: 0→1 during scroll animation, then frozen at 1
    const heroProgress = overallProgress <= heroFraction
      ? (heroFraction > 0 ? overallProgress / heroFraction : 1)
      : 1

    // Store in refs — renderLoop reads these on the next RAF tick
    targetProgressRef.current  = heroProgress
    overallProgressRef.current = overallProgress
    heroFractionRef.current    = heroFraction

    // Wake the RAF loop if it went idle between scroll events
    if (!rafRef.current) {
      if (process.env.NODE_ENV === 'development') devWakeCountRef.current++
      rafRef.current = requestAnimationFrame(renderLoopRef.current)
    }

    // ── Safari desktop active-scroll compositing budget ─────────────────────
    // While the user is scrubbing, expensive decorative layers are suppressed
    // to free up compositor bandwidth for the frame-sequence canvas.
    //
    // Reduced layers (Safari desktop only, during active scroll):
    //   • FloatingPaths  — both SVG groups hidden (72 animated motion.paths)
    //   • AmbientOverlays — clouds + propeller zeroed via renderLoop ambientOp
    //   • canvas draw    — single-pass (Pass 2 focal blend skipped)
    //
    // All layers restore automatically 200 ms after scrolling stops.
    if (isSafariDesktopRef.current) {
      if (!isScrubbingRef.current) {
        // First scroll event of this scrub burst — kill decorative layers now
        isScrubbingRef.current = true
        if (floatingPathsWrapRef.current) {
          floatingPathsWrapRef.current.style.transition = 'none'
          floatingPathsWrapRef.current.style.opacity    = '0'
        }
        if (process.env.NODE_ENV === 'development') {
          console.debug('[Hero Safari] scrub START — FloatingPaths + ambient + Pass2 suppressed')
        }
      }
      // Reset the cooldown on every scroll event
      if (scrubTimerRef.current !== null) clearTimeout(scrubTimerRef.current)
      scrubTimerRef.current = window.setTimeout(() => {
        isScrubbingRef.current = false
        scrubTimerRef.current  = null
        // Fade FloatingPaths back in smoothly
        if (floatingPathsWrapRef.current) {
          floatingPathsWrapRef.current.style.transition = 'opacity 0.5s ease'
          floatingPathsWrapRef.current.style.opacity    = '1'
          // Clean up inline transition after it completes
          window.setTimeout(() => {
            if (floatingPathsWrapRef.current) floatingPathsWrapRef.current.style.transition = ''
          }, 550)
        }
        // Wake RAF so renderLoop restores ambient opacity via its normal path
        dirtyRef.current = true
        if (!rafRef.current) rafRef.current = requestAnimationFrame(renderLoopRef.current)
        if (process.env.NODE_ENV === 'development') {
          console.debug('[Hero Safari] scrub END — decorative layers restoring')
        }
      }, 200)
    }
  }, [])

  // ── Mount / unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // ── Safari desktop detection ─────────────────────────────────────────────
    // Must run before resizeCanvas() so the DPR cap is correct on first paint.
    // Heuristic: UA contains "Safari" but not Chrome/Chromium/CriOS/Edge,
    // and not a mobile UA token.  Reliable for all desktop Safari versions.
    const detectedSafari =
      /Safari/.test(navigator.userAgent) &&
      !/Chrome|Chromium|CriOS|EdgA/.test(navigator.userAgent) &&
      !/iPhone|iPad|iPod|Android/.test(navigator.userAgent)

    isSafariDesktopRef.current = detectedSafari
    // Trigger a React re-render so JSX conditionals (no FloatingPaths, no
    // AmbientOverlays, static text overlays) take effect before first scroll.
    if (detectedSafari) setIsSafariDesktop(true)

    if (process.env.NODE_ENV === 'development') {
      console.debug(
        `[Hero] safariDesktop=${detectedSafari} safariFallback=${detectedSafari}` +
        ` nativeDPR=${window.devicePixelRatio}` +
        ` effectiveDPR=${detectedSafari ? 1.0 : Math.min(window.devicePixelRatio, 1.5)}` +
        ` frameStep=${detectedSafari ? 2 : 1}` +
        ` decorativeLayers=${detectedSafari ? 'DISABLED' : 'enabled'}` +
        ` framerMotion=${detectedSafari ? 'DISABLED' : 'enabled'}`
      )
    }

    resizeCanvas()

    // ── ResizeObserver on the sticky viewport ────────────────────────────────
    // Fires only when the rendered size actually changes (≥1 px delta), so it
    // never triggers on Safari address-bar flicker or sub-pixel jitter.
    // Window 'resize' is kept below as a fallback for older Safari / rotation.
    if (typeof ResizeObserver !== 'undefined' && stickyRef.current) {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect
          if (
            Math.abs(width  - prevCanvasSizeRef.current.w) > 1 ||
            Math.abs(height - prevCanvasSizeRef.current.h) > 1
          ) {
            prevCanvasSizeRef.current = { w: width, h: height }
            if (process.env.NODE_ENV === 'development') {
              devResizeCountRef.current++
              console.debug(`[Hero] resize #${devResizeCountRef.current} → ${Math.round(width)}×${Math.round(height)}`)
            }
            resizeCanvas()
            if (!rafRef.current) rafRef.current = requestAnimationFrame(renderLoopRef.current)
          }
        }
      })
      ro.observe(stickyRef.current)
      roRef.current = ro
    }

    window.addEventListener('resize',            resizeCanvas, { passive: true })
    window.addEventListener('orientationchange', resizeCanvas, { passive: true })
    window.addEventListener('scroll',            onScroll,     { passive: true })

    onScroll()

    const chunkCount = isMobileRef.current ? 12 : 20
    const promises: Promise<void>[] = []

    for (let i = 0; i < chunkCount; i++) {
      const p = loadFrameAsync(i)
      if (p) promises.push(p)
    }

    Promise.all(promises).then(() => {
      isOpeningChunkReadyRef.current = true
      dirtyRef.current = true
      checkUnlock()
      // Wake RAF now that the opening chunk is decoded and ready to display
      if (!rafRef.current) rafRef.current = requestAnimationFrame(renderLoopRef.current)
    })

    const eagerCount = isMobileRef.current ? MOBILE_EAGER_FRAMES : DESKTOP_EAGER_FRAMES
    for (let i = chunkCount; i < eagerCount; i++) loadFrameAsync(i)

    let loadIdx = eagerCount
    const loadBatch = () => {
      if (!isOpeningChunkReadyRef.current) {
        setTimeout(loadBatch, 100)
        return
      }

      const batchSize = isMobileRef.current ? 4 : 8
      const end = Math.min(loadIdx + batchSize, TOTAL_FRAMES)
      for (let i = loadIdx; i < end; i++) loadFrameAsync(i)
      loadIdx = end

      if (loadIdx < TOTAL_FRAMES) {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(loadBatch, { timeout: 800 })
        } else {
          setTimeout(loadBatch, 100)
        }
      }
    }

    if ('requestIdleCallback' in window) {
      requestIdleCallback(loadBatch, { timeout: 800 })
    } else {
      setTimeout(loadBatch, 300)
    }

    // Initial RAF tick — draws frame 0 / handles poster reveal on first paint
    rafRef.current = requestAnimationFrame(renderLoop)

    return () => {
      if (scrubTimerRef.current !== null) clearTimeout(scrubTimerRef.current)
      roRef.current?.disconnect()
      roRef.current = null
      window.removeEventListener('resize',            resizeCanvas)
      window.removeEventListener('orientationchange', resizeCanvas)
      window.removeEventListener('scroll',            onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [resizeCanvas, onScroll, loadFrameAsync, renderLoop, checkUnlock])

  // ── Scroll Lock Enforcer ───────────────────────────────────────────────────
  useEffect(() => {
    if (isScrollLocked) {
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      
      const handler = (e: TouchEvent) => e.preventDefault()
      document.addEventListener('touchmove', handler, { passive: false })
      
      return () => {
        document.body.style.overflow = ''
        document.documentElement.style.overflow = ''
        document.removeEventListener('touchmove', handler)
      }
    } else {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
  }, [isScrollLocked])

  // ── Intro + Failsafe Timers ────────────────────────────────────────────────
  useEffect(() => {
    const introTimer = setTimeout(() => {
      introCompleteRef.current = true
      checkUnlock()
    }, 2800)

    const failsafe = setTimeout(() => {
      scrollLockedRef.current = false
      setIsScrollLocked(false)
    }, 4500)

    return () => {
      clearTimeout(introTimer)
      clearTimeout(failsafe)
    }
  }, [checkUnlock])

  // ── Heights ────────────────────────────────────────────────────────────────
  const spacerHeight = sectionHeight > 0 ? sectionHeight - viewportHeight : undefined

  const outerStyle: React.CSSProperties = sectionHeight > 0
    ? { height: `${sectionHeight}px` }
    : { height: `${DESKTOP_SCROLL_MULTIPLIER * 100}svh` }

  const stickyStyle: React.CSSProperties = viewportHeight > 0
    ? { height: `${viewportHeight}px` }
    : { height: '100svh' }

  return (
    <div
      ref={sectionRef}
      className="relative hero-scroll-section"
      style={outerStyle}
    >
      {/* One sticky viewport for the entire timeline */}
      <div
        ref={stickyRef}
        className="sticky top-0 z-10 w-full overflow-hidden"
        style={{ ...stickyStyle, backgroundColor: '#091421' }}
      >
        {/* ── Canvas layer — fades out at end of hero so content sits on clean bg ── */}
        <div ref={canvasLayerRef} className="absolute inset-0">
          {/* Main interactive canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            aria-hidden="true"
          />
          
          {/* Premium smart reveal poster layer */}
          <div 
            className="absolute inset-0 pointer-events-none transition-opacity duration-1000 ease-out bg-[#091421]"
            style={{ opacity: posterVisible ? 1 : 0 }}
          >
            {/* Instant HTML display before script/canvas mounts */}
            <img 
              src={FRAME_PATHS[0]} 
              className="absolute inset-0 w-full h-full object-cover object-top opacity-60 mix-blend-screen"
              alt="Cessna 172 aircraft flying at twilight"
              decoding="sync"
              loading="eager"
            />
            {/* Math-perfect visual clone tracking original cover/focal blend */}
            <canvas
              ref={posterCanvasRef}
              className="absolute inset-0 w-full h-full"
              aria-hidden="true"
            />
          </div>

          {/* Vignettes — very faint top fade only */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#091421]/15 via-transparent to-transparent pointer-events-none" />

          {/* Cooling tint — reduced so source colours read through */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'rgba(2,10,30,0.28)', mixBlendMode: 'multiply' }}
          />

          {/* Lavender / Cool Purple Unifying Tint (Visual Test) */}
          {/* Tweak the RGBA values, opacity, and mixBlendMode here */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'rgba(135, 145, 215, 0.14)', mixBlendMode: 'normal' }}
          />

          {/* Ambient Overlays (Clouds & Propeller)
               Not rendered at all on Safari desktop — animations still consume
               compositor resources even behind opacity:0. Hard removal only. */}
          {!isSafariDesktop && <AmbientOverlays innerRef={ambientRefs} />}

          {/* Floating paths — also fully absent on Safari desktop.
               72 animated motion.path SVGs have measurable rAF cost even hidden. */}
          {!isSafariDesktop && (
            <div ref={floatingPathsWrapRef} className="absolute inset-0 pointer-events-none">
              <FloatingPaths position={1} />
              <FloatingPaths position={-1} />
            </div>
          )}

        </div>

        {/* ── Hero text overlays ──────────────────────────────────────────── */}
        {/* Safari desktop uses SAFARI_TEXT_OVERLAYS (plain HTML, no Framer Motion). */}
        {(isSafariDesktop ? SAFARI_TEXT_OVERLAYS : TEXT_OVERLAYS).map((overlay, idx) => (
          <div
            key={overlay.id}
            ref={(el) => { overlayRefs.current[idx] = el }}
            className={`absolute inset-0 pointer-events-none ${
              overlay.fullBleed
                ? ''
                : `flex md:items-center ${
                    overlay.id === 'cockpit'
                      ? 'items-start pt-20 md:pt-0'
                      : 'items-end pb-28 md:pb-0'
                  }`
            }`}
            style={{ opacity: idx === 0 ? 1 : 0, transition: 'opacity 0.1s linear' }}
          >
            {overlay.fullBleed ? (
              // Full-bleed overlays: content uses absolute positioning directly
              // inside this absolute-inset-0 div — no padding wrapper
              overlay.content
            ) : (
              <div className="px-6 md:px-12 lg:px-20 relative z-10 w-full">
                {overlay.content}
              </div>
            )}
          </div>
        ))}

        {/* ── Scroll indicator ────────────────────────────────────────────── */}
        <div
          ref={scrollIndicatorRef}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
          style={{ opacity: 0.5 }}
        >
          <span className="font-sans text-[10px] tracking-[0.2em] uppercase text-oz-muted">Scroll</span>
          <div className="w-px h-8 bg-oz-blue/40 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-oz-blue animate-bounce" />
          </div>
        </div>

      </div>

      {/* Spacer — occupies (heroMult-1)×vh so HomeContent only enters the     */}
      {/* viewport once the hero animation has played to its final frame.      */}
      <div
        aria-hidden="true"
        style={spacerHeight !== undefined
          ? { height: spacerHeight }
          : { height: `${(DESKTOP_SCROLL_MULTIPLIER - 1) * 100}svh` }}
      />

    </div>
  )
}
