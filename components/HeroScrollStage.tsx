'use client'

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { motion } from 'framer-motion'

// ─── Frame sequence ───────────────────────────────────────────────────────────
function buildFrameSequence(): string[] {
  const frames: string[] = []
  for (let i = 1; i <= 120; i++) frames.push(`/scrollyImages/seq-1/Cessna_flying_above_202604010949_${String(i).padStart(6, '0')}.webp`)
  for (let i = 1; i <= 110; i++) frames.push(`/scrollyImages/seq-2/Aircraft_transition_outside_202604011034_${String(i).padStart(6, '0')}.webp`)
  for (let i = 1; i <= 192; i++) frames.push(`/scrollyImages/seq-3/Cockpit_view_flying_202604011043_${String(i).padStart(6, '0')}.webp`)
  for (let i = 1; i <= 192; i++) frames.push(`/scrollyImages/seq-4/Plane_climbing_into_202604011652_${String(i).padStart(6, '0')}.webp`)
  return frames
}
const FRAME_PATHS  = buildFrameSequence()
const TOTAL_FRAMES = FRAME_PATHS.length // 614

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
  seq1End: 119,
  seq2End: 229,
}
const BG_DARKEN_ALPHA = 0.38

interface SequenceLayout { fgBlend: number; focalX: number; focalY: number }

const SEQUENCE_LAYOUT: Record<'desktop' | 'mobile', Record<'seq1' | 'seq2' | 'seq3', SequenceLayout>> = {
  desktop: {
    seq1: { fgBlend: 0.72, focalX: 0.50, focalY: 0.40 },
    seq2: { fgBlend: 0.72, focalX: 0.50, focalY: 0.48 },
    seq3: { fgBlend: 0.62, focalX: 0.50, focalY: 0.62 },
  },
  mobile: {
    seq1: { fgBlend: 0.90, focalX: 0.50, focalY: 0.40 },
    seq2: { fgBlend: 0.90, focalX: 0.50, focalY: 0.48 },
    seq3: { fgBlend: 0.78, focalX: 0.65, focalY: 0.70 },
  },
}

function getLayout(frameIndex: number, isMobile: boolean): SequenceLayout {
  const device = isMobile ? SEQUENCE_LAYOUT.mobile : SEQUENCE_LAYOUT.desktop
  if (frameIndex <= SEQ_BOUNDS.seq1End) return device.seq1
  if (frameIndex <= SEQ_BOUNDS.seq2End) return device.seq2
  return device.seq3
}

// ─── Opening poster ───────────────────────────────────────────────────────────
const POSTER_SRC: string | null = null

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

// ─── Hero text overlays ───────────────────────────────────────────────────────
// startPct / endPct applied to heroProgress (0–1 over the hero phase only).
const TEXT_OVERLAYS = [
  {
    id: 'intro',
    startPct: 0,
    endPct: 0.18,
    content: (
      <div className="max-w-sm md:max-w-xl">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.10, duration: 0.5 }}
          className="font-sans text-[10px] md:text-xs font-bold tracking-[0.3em] uppercase text-oz-blue/70 mb-3 md:mb-4"
        >
          Aircraft Rental Platform
        </motion.p>
        <h1 className="font-serif text-4xl md:text-7xl font-black leading-tight mb-4 md:mb-6">
          <span className="block">
            {'The sky is'.split('').map((char, i) => (
              <motion.span
                key={`l1-${i}`}
                className={`inline-block text-oz-text${char === ' ' ? ' mr-[0.22em]' : ''}`}
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.18 + i * 0.028, type: 'spring', stiffness: 150, damping: 25 }}
              >
                {char === ' ' ? '\u00A0' : char}
              </motion.span>
            ))}
          </span>
          <span className="block italic text-oz-blue">
            {'yours to fly.'.split('').map((char, i) => (
              <motion.span
                key={`l2-${i}`}
                className={`inline-block${char === ' ' ? ' mr-[0.22em]' : ''}`}
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.44 + i * 0.028, type: 'spring', stiffness: 150, damping: 25 }}
              >
                {char === ' ' ? '\u00A0' : char}
              </motion.span>
            ))}
          </span>
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.95, duration: 0.6 }}
          className="font-sans text-sm md:text-lg text-oz-muted font-light leading-relaxed max-w-xs md:max-w-md mb-5 md:mb-7"
        >
          A modern platform for licensed pilots. Rent, fly, and return — with zero friction.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.15, duration: 0.5 }}
        >
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2.5 font-sans text-[0.8125rem] font-medium text-oz-text/80 border border-oz-blue/28 rounded-full px-5 py-2.5 hover:border-oz-blue/55 hover:text-oz-text transition-all duration-300 group pointer-events-auto"
          >
            <span className="opacity-90 group-hover:opacity-100 transition-opacity">Start your application</span>
            <span className="inline-block opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300 text-oz-blue">→</span>
          </a>
        </motion.div>
      </div>
    ),
  },
  {
    id: 'aircraft',
    startPct: 0.28,
    endPct: 0.52,
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
            {'Built for pilots.'.split('').map((char, i) => (
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
            {'Not passengers.'.split('').map((char, i) => (
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
          We start with a Cessna 172 — the most trusted training and touring aircraft in the world.
          Well-maintained, thoroughly checked, and ready when you are.
        </motion.p>
      </div>
    ),
  },
  {
    id: 'cockpit',
    startPct: 0.62,
    endPct: 0.85,
    content: (
      <div className="max-w-[158px] md:max-w-md [filter:drop-shadow(0_1px_3px_rgb(0_0_0/0.95))_drop-shadow(0_4px_14px_rgb(0_0_0/0.55))] md:[filter:none]">
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
            {'your aircraft.'.split('').map((char, i) => (
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
          From pre-flight checks to touchdown, the aircraft is yours. No instructors required
          for qualified pilots. No unnecessary oversight.
        </motion.p>
      </div>
    ),
  },
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function HeroScrollStage({ children }: { children?: ReactNode }) {
  const sectionRef         = useRef<HTMLDivElement>(null)
  const canvasRef          = useRef<HTMLCanvasElement>(null)
  const canvasLayerRef     = useRef<HTMLDivElement>(null)
  const overlayRefs        = useRef<(HTMLDivElement | null)[]>([])
  const scrollIndicatorRef = useRef<HTMLDivElement | null>(null)
  const homeContentRef     = useRef<HTMLDivElement>(null)

  const imagesRef       = useRef<(HTMLImageElement | null)[]>(new Array(TOTAL_FRAMES).fill(null))
  const posterRef       = useRef<HTMLImageElement | null>(null)
  const currentFrameRef = useRef(0)
  const rafRef          = useRef<number | null>(null)
  const dirtyRef        = useRef(true)
  const isMobileRef     = useRef(false)

  const [sectionHeight,     setSectionHeight]     = useState(0)
  const [viewportHeight,    setViewportHeight]     = useState(0)
  const [homeContentHeight, setHomeContentHeight]  = useState(0)

  // ── 2-pass canvas draw ─────────────────────────────────────────────────────
  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const img = imagesRef.current[index]
    if (!img) { dirtyRef.current = true; return }
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width: cw, height: ch } = canvas
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    if (!iw || !ih) return

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const containScale = Math.min(cw / iw, ch / ih)
    const coverScale   = Math.max(cw / iw, ch / ih)

    // Pass 1 — background: pure cover, always full-bleed
    const bgW = iw * coverScale
    const bgH = ih * coverScale
    ctx.drawImage(img, (cw - bgW) * 0.5, (ch - bgH) * 0.5, bgW, bgH)

    ctx.fillStyle = `rgba(0,0,0,${BG_DARKEN_ALPHA})`
    ctx.fillRect(0, 0, cw, ch)

    // Pass 2 — foreground: gentler fit, more composition preserved
    const layout  = getLayout(index, isMobileRef.current)
    const fgScale = containScale + (coverScale - containScale) * layout.fgBlend
    const fgW     = iw * fgScale
    const fgH     = ih * fgScale
    const fgImg   = (index === 0 && posterRef.current) ? posterRef.current : img
    ctx.drawImage(fgImg, (cw - fgW) * layout.focalX, (ch - fgH) * layout.focalY, fgW, fgH)
  }, [])

  // ── Resize ────────────────────────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const w = window.innerWidth
    const h = window.innerHeight
    isMobileRef.current = w < 768

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width  = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    dirtyRef.current = true

    const heroMult  = isMobileRef.current ? MOBILE_SCROLL_MULTIPLIER : DESKTOP_SCROLL_MULTIPLIER
    setSectionHeight(h * (heroMult + CONTENT_BEATS_VH))
    setViewportHeight(h)
  }, [])

  // ── Frame loader ───────────────────────────────────────────────────────────
  const loadFrame = useCallback((index: number) => {
    if (index < 0 || index >= TOTAL_FRAMES) return
    if (imagesRef.current[index]) return
    const img = new Image()
    img.src = FRAME_PATHS[index]
    img.onload = () => {
      imagesRef.current[index] = img
      if (index === currentFrameRef.current) dirtyRef.current = true
    }
  }, [])

  // ── rAF loop ───────────────────────────────────────────────────────────────
  const renderLoop = useCallback(() => {
    if (dirtyRef.current) {
      drawFrame(currentFrameRef.current)
      dirtyRef.current = false
    }
    rafRef.current = requestAnimationFrame(renderLoop)
  }, [drawFrame])

  // ── Unified scroll handler ─────────────────────────────────────────────────
  const onScroll = useCallback(() => {
    const section = sectionRef.current
    if (!section) return

    const rect            = section.getBoundingClientRect()
    const scrolled        = -rect.top
    const totalScrollable = section.offsetHeight - window.innerHeight
    if (totalScrollable <= 0) return

    const overallProgress = Math.max(0, Math.min(1, scrolled / totalScrollable))

    const heroMult     = isMobileRef.current ? MOBILE_SCROLL_MULTIPLIER : DESKTOP_SCROLL_MULTIPLIER
    const vh           = window.innerHeight
    const heroScrollPx = (heroMult - 1) * vh
    const heroFraction = heroScrollPx / totalScrollable

    // heroProgress: 0→1 during scroll animation, then frozen at 1
    const heroProgress = overallProgress <= heroFraction
      ? (heroFraction > 0 ? overallProgress / heroFraction : 1)
      : 1

    // ── Frame selection ─────────────────────────────────────────────────────
    // Only advances during hero phase; frozen at final frame during content phase.
    const frameIndex = Math.round(heroProgress * (TOTAL_FRAMES - 1))
    if (frameIndex !== currentFrameRef.current) {
      currentFrameRef.current = frameIndex
      dirtyRef.current = true
      const lookahead = isMobileRef.current ? MOBILE_LOOKAHEAD : DESKTOP_LOOKAHEAD
      for (let i = -lookahead; i <= lookahead; i++) loadFrame(frameIndex + i)
    }

    // ── Hero text overlays ──────────────────────────────────────────────────
    // Hidden once hero phase completes (heroProgress === 1 and we've passed heroFraction).
    const inHeroPhase = overallProgress <= heroFraction
    overlayRefs.current.forEach((el, idx) => {
      if (!el) return
      const { startPct, endPct } = TEXT_OVERLAYS[idx]
      const fadeDuration = 0.055
      let opacity = 0
      if (inHeroPhase) {
        if (heroProgress >= startPct && heroProgress <= endPct) {
          const fadeIn  = startPct === 0 ? 1 : Math.min(1, (heroProgress - startPct) / fadeDuration)
          const fadeOut = Math.min(1, (endPct - heroProgress) / fadeDuration)
          opacity = Math.min(fadeIn, fadeOut)
        }
      }
      el.style.opacity = String(opacity)
    })

    // ── Scroll indicator ────────────────────────────────────────────────────
    // Fades out after the first ~10% of the hero phase.
    if (scrollIndicatorRef.current) {
      const indOpacity = Math.max(0, 1 - heroProgress / 0.10) * 0.5
      scrollIndicatorRef.current.style.opacity = String(indOpacity)
    }

    // ── Canvas layer fade ────────────────────────────────────────────────────
    // Over the last 18% of the hero animation, fade the entire canvas layer
    // (canvas + vignettes + tint + paths) to 0 so the sticky div's solid
    // background is revealed. HomeContent sections use the same base colour,
    // making the transition seamless with no visible jump.
    if (canvasLayerRef.current) {
      const FADE_START = 0.65
      const layerOpacity = heroProgress < FADE_START
        ? 1
        : Math.max(0, 1 - (heroProgress - FADE_START) / (1 - FADE_START))
      canvasLayerRef.current.style.opacity = String(layerOpacity)
    }

  }, [loadFrame])

  // ── Mount / unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    resizeCanvas()

    window.addEventListener('resize',            resizeCanvas, { passive: true })
    window.addEventListener('orientationchange', resizeCanvas, { passive: true })
    window.addEventListener('scroll',            onScroll,     { passive: true })

    onScroll()

    if (POSTER_SRC) {
      const p = new Image()
      p.src = POSTER_SRC
      p.onload = () => {
        posterRef.current = p
        if (currentFrameRef.current === 0) dirtyRef.current = true
      }
    }

    loadFrame(0)

    const eagerCount = isMobileRef.current ? MOBILE_EAGER_FRAMES : DESKTOP_EAGER_FRAMES
    for (let i = 1; i < eagerCount; i++) loadFrame(i)

    let loadIdx = eagerCount
    const loadBatch = () => {
      const batchSize = isMobileRef.current ? 8 : 12
      const end = Math.min(loadIdx + batchSize, TOTAL_FRAMES)
      for (let i = loadIdx; i < end; i++) loadFrame(i)
      loadIdx = end
      if (loadIdx < TOTAL_FRAMES) {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(loadBatch, { timeout: isMobileRef.current ? 800 : 500 })
        } else {
          setTimeout(loadBatch, isMobileRef.current ? 80 : 50)
        }
      }
    }
    if ('requestIdleCallback' in window) {
      requestIdleCallback(loadBatch, { timeout: isMobileRef.current ? 800 : 500 })
    } else {
      setTimeout(loadBatch, isMobileRef.current ? 300 : 200)
    }

    rafRef.current = requestAnimationFrame(renderLoop)

    return () => {
      window.removeEventListener('resize',            resizeCanvas)
      window.removeEventListener('orientationchange', resizeCanvas)
      window.removeEventListener('scroll',            onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [resizeCanvas, onScroll, loadFrame, renderLoop])

  // ── HomeContent height — measured so outerStyle includes it ───────────────
  useEffect(() => {
    const el = homeContentRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHomeContentHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Heights ────────────────────────────────────────────────────────────────
  // spacerHeight = (heroMult−1)×vh  so HomeContent enters the viewport
  // exactly when heroProgress reaches 1 (final frame).  outerStyle includes
  // homeContentHeight so the sticky releases cleanly with no tail scroll.
  const spacerHeight = sectionHeight > 0 ? sectionHeight - viewportHeight : undefined

  const outerStyle: React.CSSProperties = sectionHeight > 0 && spacerHeight !== undefined
    ? { height: `${sectionHeight + homeContentHeight}px` }
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
        className="sticky top-0 z-10 w-full overflow-hidden"
        style={{ ...stickyStyle, backgroundColor: '#091421' }}
      >
        {/* ── Canvas layer — fades out at end of hero so content sits on clean bg ── */}
        <div ref={canvasLayerRef} className="absolute inset-0">
          {/* Canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            aria-hidden="true"
          />

          {/* Vignettes */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#091421]/50 via-transparent to-[#091421]/80 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#091421]/70 via-transparent to-transparent pointer-events-none" />

          {/* Cooling tint */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'rgba(2,10,30,0.44)', mixBlendMode: 'multiply' }}
          />

          {/* Floating paths */}
          <FloatingPaths position={1} />
          <FloatingPaths position={-1} />

          {/* Bottom fade */}
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{ height: 120, background: 'linear-gradient(to top, #091421 0%, transparent 100%)' }}
          />
        </div>

        {/* ── Hero text overlays ──────────────────────────────────────────── */}
        {TEXT_OVERLAYS.map((overlay, idx) => (
          <div
            key={overlay.id}
            ref={(el) => { overlayRefs.current[idx] = el }}
            className={`absolute inset-0 flex pointer-events-none md:items-center ${
              overlay.id === 'cockpit'
                ? 'items-start pt-20 md:pt-0'
                : 'items-end pb-28 md:pb-0'
            }`}
            style={{ opacity: idx === 0 ? 1 : 0, transition: 'opacity 0.1s linear' }}
          >
            <div className="px-6 md:px-12 lg:px-20 relative z-10">
              {overlay.content}
            </div>
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

      {/* HomeContent — normal flow inside the scroll container, z-20 so it   */}
      {/* scrolls over the z-10 sticky canvas. Frozen sky stays visible        */}
      {/* through the frosted glass panels as each section rises into view.    */}
      {children && (
        <div ref={homeContentRef} className="relative z-20">
          {children}
        </div>
      )}
    </div>
  )
}
