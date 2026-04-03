'use client'

import { useEffect, useRef } from 'react'
import { useScroll, useTransform, motion, MotionValue } from 'framer-motion'

// ─── Final hero frame ─────────────────────────────────────────────────────────
// Must be the last frame of the hero sequence so the visual is identical to
// the hero's final state when this stage takes over.
const FINAL_FRAME_SRC =
  '/scrollyImages/seq-4/Plane_climbing_into_202604011652_000192.webp'

// ─── Rendering constants ──────────────────────────────────────────────────────
// These must match the values in HeroCanvas.tsx exactly so the pinned
// background is pixel-identical to the hero's last rendered frame.
const BG_DARKEN_ALPHA = 0.38
const DESKTOP_LAYOUT  = { fgBlend: 0.62, focalX: 0.50, focalY: 0.62 }
const MOBILE_LAYOUT   = { fgBlend: 0.78, focalX: 0.65, focalY: 0.70 }

// ─── Stage configuration ──────────────────────────────────────────────────────
// Total scroll height of the pinned stage.
// With 4 beats, each beat has ~100vh of scroll dwell time.
const STAGE_HEIGHT_VH = 400

// ─── Beat timing ─────────────────────────────────────────────────────────────
// startPct / endPct: when in [0–1] stage scroll progress each beat is visible.
// Adjacent beats overlap slightly so the outgoing fade and incoming fade
// overlap for a clean crossfade effect.
interface BeatConfig { id: string; startPct: number; endPct: number }

const BEATS: BeatConfig[] = [
  { id: 'intro',    startPct: 0.03, endPct: 0.27 },
  { id: 'aircraft', startPct: 0.26, endPct: 0.52 },
  { id: 'process',  startPct: 0.50, endPct: 0.74 },
  { id: 'ready',    startPct: 0.73, endPct: 0.96 },
]

// ─── SkyBeat ──────────────────────────────────────────────────────────────────
// Scroll-driven overlay panel. Absolutely positioned within the sticky viewport,
// fades and rises in on entry, fades out on exit.
// pointer-events-none on the wrapper (so invisible beats don't block clicks),
// pointer-events-auto on the content (so visible beats are interactive).

function SkyBeat({
  scrollYProgress,
  config,
  children,
}: {
  scrollYProgress: MotionValue<number>
  config: BeatConfig
  children: React.ReactNode
}) {
  const { startPct, endPct } = config
  const fade = 0.055 // fraction of total stage range used for fade in/out

  const opacity = useTransform(
    scrollYProgress,
    [0, startPct, startPct + fade, endPct - fade, endPct, 1],
    [0,        0,               1,             1,      0, 0],
  )
  const y = useTransform(
    scrollYProgress,
    [0, startPct, startPct + fade, 1],
    [28,      28,               0, 0],
  )

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ opacity, y }}
    >
      <div className="pointer-events-auto w-full">
        {children}
      </div>
    </motion.div>
  )
}

// ─── PinnedSkyStage ───────────────────────────────────────────────────────────
export default function PinnedSkyStage() {
  const outerRef  = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef    = useRef<HTMLImageElement | null>(null)

  // Scroll progress across the full 400vh outer container.
  // progress 0 = top of stage at top of viewport
  // progress 1 = bottom of stage at bottom of viewport
  const { scrollYProgress } = useScroll({
    target: outerRef,
    offset: ['start start', 'end end'],
  })

  // ── 2-pass canvas render ──
  // Identical logic to HeroCanvas.drawFrame so the background is
  // pixel-perfect continuous with the hero's final painted state.
  function drawFrame() {
    const canvas = canvasRef.current
    const img    = imgRef.current
    if (!canvas || !img || !img.naturalWidth) return

    const w   = window.innerWidth
    const h   = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    canvas.width  = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const cw = canvas.width
    const ch = canvas.height
    const iw = img.naturalWidth
    const ih = img.naturalHeight

    const isMobile     = w < 768
    const layout       = isMobile ? MOBILE_LAYOUT : DESKTOP_LAYOUT
    const containScale = Math.min(cw / iw, ch / ih)
    const coverScale   = Math.max(cw / iw, ch / ih)

    // Pass 1 — background: pure cover, always full-bleed, centered
    const bgW = iw * coverScale
    const bgH = ih * coverScale
    ctx.drawImage(img, (cw - bgW) * 0.5, (ch - bgH) * 0.5, bgW, bgH)

    // Tonal separation between background and foreground passes
    ctx.fillStyle = `rgba(0,0,0,${BG_DARKEN_ALPHA})`
    ctx.fillRect(0, 0, cw, ch)

    // Pass 2 — foreground: lerped fit, more composition preserved
    const fgScale = containScale + (coverScale - containScale) * layout.fgBlend
    const fgW     = iw * fgScale
    const fgH     = ih * fgScale
    ctx.drawImage(img, (cw - fgW) * layout.focalX, (ch - fgH) * layout.focalY, fgW, fgH)
  }

  useEffect(() => {
    const img = new Image()
    img.src = FINAL_FRAME_SRC
    img.onload = () => {
      imgRef.current = img
      drawFrame()
    }

    const onResize = () => { if (imgRef.current) drawFrame() }
    window.addEventListener('resize',            onResize, { passive: true })
    window.addEventListener('orientationchange', onResize, { passive: true })

    return () => {
      window.removeEventListener('resize',            onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={outerRef} className="relative" style={{ height: `${STAGE_HEIGHT_VH}vh` }}>

      {/* ── Sticky viewport ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 w-full overflow-hidden bg-oz-deep" style={{ height: '100svh' }}>

        {/* Canvas — final hero frame, rendered identically to HeroCanvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
        />

        {/* Gradient vignettes — match HeroCanvas exactly */}
        <div className="absolute inset-0 bg-gradient-to-b from-oz-deep/50 via-transparent to-oz-deep/80 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-oz-deep/70 via-transparent to-transparent pointer-events-none" />

        {/* Bottom blend — fades into the sections below the pinned stage */}
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none z-10"
          style={{
            height:     140,
            background: 'linear-gradient(to top, #000e25 0%, transparent 100%)',
          }}
        />

        {/* ── Beat 1: Intro / bridge ────────────────────────────────────── */}
        <SkyBeat scrollYProgress={scrollYProgress} config={BEATS[0]}>
          <div className="px-6 md:px-12 lg:px-20 max-w-2xl mx-auto text-center">
            <p
              className="font-sans font-semibold tracking-[0.40em] uppercase mb-5"
              style={{ fontSize: 9, color: 'rgba(167,200,255,0.58)' }}
            >
              Access &amp; Operations
            </p>
            <h2 className="font-serif text-[1.95rem] sm:text-[2.5rem] md:text-[3.1rem] font-black text-oz-text leading-[1.07] tracking-tight mb-6">
              From approval to takeoff,<br className="hidden sm:block" /> kept simple.
            </h2>
            <div
              className="mx-auto mb-6"
              style={{ width: 40, height: 1, background: 'rgba(167,200,255,0.22)' }}
            />
            <p className="font-sans text-sm md:text-[0.9375rem] font-light leading-[1.8] text-oz-muted max-w-md mx-auto mb-8">
              A premium aircraft access experience for licensed pilots — with a clear path from
              registration and review to booking and flight.
            </p>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2.5 font-sans text-[0.8125rem] font-medium text-oz-text/80 border border-oz-blue/28 rounded-full px-5 py-2.5 hover:border-oz-blue/55 hover:text-oz-text transition-all duration-300"
            >
              See how it works
              <svg className="w-3.5 h-3.5 text-oz-blue" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1 7h12M8 2.5L12.5 7 8 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </SkyBeat>

        {/* ── Beat 2: The aircraft ──────────────────────────────────────── */}
        <SkyBeat scrollYProgress={scrollYProgress} config={BEATS[1]}>
          <div className="px-6 md:px-12 lg:px-20 max-w-xl mx-auto text-center">
            <p
              className="font-sans font-semibold tracking-[0.40em] uppercase mb-5"
              style={{ fontSize: 9, color: 'rgba(167,200,255,0.58)' }}
            >
              The Aircraft
            </p>
            <h2 className="font-serif text-[2.1rem] sm:text-[2.7rem] md:text-[3.3rem] font-black text-oz-text leading-[1.07] tracking-tight mb-4">
              Cessna 172 Skyhawk
            </h2>
            <p className="font-sans text-sm md:text-[0.9375rem] font-light leading-[1.8] text-oz-muted max-w-sm mx-auto mb-7">
              The world's most trusted training and touring aircraft. Well-maintained, thoroughly
              checked, and ready when you are.
            </p>
            <div className="inline-flex items-baseline gap-2">
              <span className="font-serif text-[2.1rem] font-black text-oz-blue">$299</span>
              <span
                className="font-sans text-oz-subtle"
                style={{ fontSize: 11, letterSpacing: '0.05em' }}
              >
                / hour · fuel, insurance &amp; maintenance included
              </span>
            </div>
          </div>
        </SkyBeat>

        {/* ── Beat 3: The process ───────────────────────────────────────── */}
        <SkyBeat scrollYProgress={scrollYProgress} config={BEATS[2]}>
          <div className="px-6 md:px-12 lg:px-20 max-w-2xl mx-auto text-center">
            <p
              className="font-sans font-semibold tracking-[0.40em] uppercase mb-5"
              style={{ fontSize: 9, color: 'rgba(167,200,255,0.58)' }}
            >
              The Process
            </p>
            <h2 className="font-serif text-[1.9rem] sm:text-[2.4rem] md:text-[2.8rem] font-black text-oz-text leading-[1.07] tracking-tight mb-10 md:mb-12">
              Four steps from here to takeoff.
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-7 text-left">
              {([
                { n: '01', label: 'Register', sub: 'Create your profile and submit pilot credentials.' },
                { n: '02', label: 'Review',   sub: 'Our team verifies your licence and approves access.' },
                { n: '03', label: 'Book',     sub: 'Choose a date and time. Instantly confirmed.' },
                { n: '04', label: 'Fly',      sub: 'Pre-flight check, then the aircraft is yours.' },
              ] as const).map(step => (
                <div key={step.n} className="flex flex-col gap-1.5">
                  <span
                    className="font-sans font-semibold"
                    style={{ fontSize: 10, letterSpacing: '0.28em', color: 'rgba(167,200,255,0.52)' }}
                  >
                    {step.n}
                  </span>
                  <span className="font-serif text-[1.1rem] font-black text-oz-text leading-tight">
                    {step.label}
                  </span>
                  <span className="font-sans text-[0.75rem] text-oz-muted font-light leading-relaxed">
                    {step.sub}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </SkyBeat>

        {/* ── Beat 4: CTA bridge ────────────────────────────────────────── */}
        <SkyBeat scrollYProgress={scrollYProgress} config={BEATS[3]}>
          <div className="px-6 md:px-12 lg:px-20 max-w-xl mx-auto text-center">
            <p
              className="font-sans font-semibold tracking-[0.40em] uppercase mb-5"
              style={{ fontSize: 9, color: 'rgba(167,200,255,0.58)' }}
            >
              Apply Now
            </p>
            <h2 className="font-serif text-[2.1rem] sm:text-[2.7rem] md:text-[3.1rem] font-black text-oz-text leading-[1.07] tracking-tight mb-6">
              Ready to fly<br className="hidden sm:block" /> over Sydney?
            </h2>
            <p className="font-sans text-sm md:text-[0.9375rem] font-light leading-[1.8] text-oz-muted max-w-sm mx-auto mb-8">
              We're accepting applications from licensed pilots now. Registration is fast, approval
              is thorough.
            </p>
            <a
              href="#fleet"
              className="inline-flex items-center gap-2.5 font-sans text-[0.875rem] font-semibold text-oz-deep bg-oz-blue rounded-full px-6 py-3 hover:bg-oz-text transition-colors duration-200"
            >
              Explore the aircraft
            </a>
          </div>
        </SkyBeat>

      </div>
    </div>
  )
}
