'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// ─── Frame sequence config ────────────────────────────────────────────────────
// Frames are WebP files under /public/heroScroll-DarkImages/.
// Each sequence has a unique filename prefix derived from its source render;
// frame numbers are zero-padded to 6 digits starting at 000001.
function buildFrameSequence(): string[] {
  const frames: string[] = []
  for (let i = 1; i <= 120; i++) frames.push(`/heroScroll-DarkImages/scn1_${String(i).padStart(6, '0')}.webp`)
  for (let i = 1; i <= 120; i++) frames.push(`/heroScroll-DarkImages/scn2_${String(i).padStart(6, '0')}.webp`)
  for (let i = 1; i <= 120; i++) frames.push(`/heroScroll-DarkImages/scn3_${String(i).padStart(6, '0')}.webp`)
  return frames
}

const FRAME_PATHS = buildFrameSequence()
const TOTAL_FRAMES = FRAME_PATHS.length // 120 * 3 = 360

// ─── Tuning constants ─────────────────────────────────────────────────────────
// How many viewport-heights to pin the hero. Higher = slower scrub.
const DESKTOP_SCROLL_MULTIPLIER = 4.5
const MOBILE_SCROLL_MULTIPLIER  = 3.0   // shorter on mobile — less scrolling to complete

// How many frames to load eagerly before idle-batching the rest
const DESKTOP_EAGER_FRAMES = 30
const MOBILE_EAGER_FRAMES  = 15

// Preload look-ahead window on each scroll event (±N frames around current)
const DESKTOP_LOOKAHEAD = 4
const MOBILE_LOOKAHEAD  = 3

// ─── Sequence boundaries (absolute indices in the merged sequence) ──
const SEQ_BOUNDS = {
  seq1End: 119, // frames   0–119  → seq-1 (120 frames)
  seq2End: 239, // frames 120–239  → seq-2 (120 frames)
  //             frames 240–359  → seq-3 (120 frames)
}

// ─── Opening poster ───────────────────────────────────────────────────────────
// Optional path to a hand-picked still drawn in the foreground pass at frame 0.
// Set to a public path (e.g. '/scrollyImages/poster.webp') to activate, or null
// to use frame 0 of the sequence as-is.
const POSTER_SRC: string | null = null

// ─── 2-layer frame rendering ──────────────────────────────────────────────────
//
// Every frame is drawn twice onto the same canvas:
//
//   Pass 1 — background: the frame at pure cover scale (fills edge-to-edge,
//            always full-bleed, no bars possible). A semi-transparent dark rect
//            is then painted on top to tonally separate it from the foreground.
//
//   Pass 2 — foreground: the same frame at a gentler scale that preserves more
//            of the original composition. Any area not reached by the foreground
//            is seamlessly filled by the background pass beneath it — so there
//            are no exposed canvas strips, no letterbox bars, and no sequence-
//            mismatch artefacts (both passes always use the same source frame).
//
// BG_DARKEN_ALPHA
// ───────────────
//   Opacity of the black rect painted between the two passes.
//   0.0 → background and foreground are equally bright (no tonal separation)
//   0.4 → background is noticeably darker, foreground reads as the primary layer
//   Raise if the background bleed feels too prominent at the edges.
//   Lower if the transition between passes looks abrupt.
const BG_DARKEN_ALPHA = 0.38

// fgBlend (per sequence, per device)
// ────────────────────────────────────
//   Controls the foreground scale: lerp between containScale and coverScale.
//   containScale = Math.min(cw/iw, ch/ih)  — fits entire frame inside canvas
//   coverScale   = Math.max(cw/iw, ch/ih)  — fills canvas edge-to-edge
//   fgScale      = containScale + (coverScale − containScale) × fgBlend
//
//   fgBlend = 0.0 → pure contain: entire source frame visible in foreground
//   fgBlend = 1.0 → pure cover:   foreground identical to background, max crop
//   fgBlend = 0.7 → 70 % toward cover — meaningful crop reduction without
//                   the composition feeling loose or unframed
//
// focalX / focalY
// ───────────────
//   0.0 → anchor foreground to the left / top edge of the canvas
//   0.5 → center the foreground on that axis
//   1.0 → anchor foreground to the right / bottom edge
//
//   When the foreground under-fills an axis (fgBlend < 1), focal controls
//   *where* the image sits within the canvas (not just which crop survives).
//   focalY toward 1.0 pulls the image upward, preserving more bottom content
//   (dashboard, lower cockpit) within the visible foreground region.
//
// ── Tuning guide ─────────────────────────────────────────────────────────────
//   Foreground still feels too zoomed  → lower fgBlend (try −0.05 steps)
//   Foreground looks loose / floating  → raise fgBlend
//   Background edge bleed too visible  → raise BG_DARKEN_ALPHA
//   Dashboard / lower frame still cut  → raise focalY toward 0.7–0.8
//   Subject off-center horizontally    → nudge focalX away from 0.5
//   Mobile needs tighter fit           → raise mobile fgBlend (portrait has less
//                                        room between contain and cover ratios)

interface SequenceLayout { fgBlend: number; focalX: number; focalY: number }

const SEQUENCE_LAYOUT: Record<'desktop' | 'mobile', Record<'seq1' | 'seq2' | 'seq3', SequenceLayout>> = {
  desktop: {
    //         fgBlend  focalX  focalY
    seq1: { fgBlend: 0.72, focalX: 0.5, focalY: 0.40 },
    seq2: { fgBlend: 0.72, focalX: 0.5, focalY: 0.48 },
    seq3: { fgBlend: 0.62, focalX: 0.5, focalY: 0.62 },
  },
  mobile: {
    seq1: { fgBlend: 0.90, focalX: 0.50, focalY: 0.40 },
    seq2: { fgBlend: 0.90, focalX: 0.50, focalY: 0.48 },
    // seq-3 mobile — pilot POV payoff, intentionally composed for portrait.
    // fgBlend 0.78: slightly less zoom than before, more vertical frame visible
    //   so dashboard and forward sky coexist without cramping.
    // focalX 0.65: strong rightward bias — Harbour Bridge is on the right side
    //   of the cockpit frame; Opera House (left) is intentionally de-prioritised.
    //   Raise toward 0.75+ to push even further right. Lower toward 0.55 to
    //   pull back toward centre if the bridge exits the right edge.
    // focalY 0.70: pulls the image up, dashboard anchored in lower foreground,
    //   windscreen / sky fills upper two-thirds.
    seq3: { fgBlend: 0.78, focalX: 0.65, focalY: 0.70 },
  },
}

function getLayout(frameIndex: number, isMobile: boolean): SequenceLayout {
  const device = isMobile ? SEQUENCE_LAYOUT.mobile : SEQUENCE_LAYOUT.desktop
  if (frameIndex <= SEQ_BOUNDS.seq1End) return device.seq1
  if (frameIndex <= SEQ_BOUNDS.seq2End) return device.seq2
  return device.seq3
}

// ─── Text overlays ────────────────────────────────────────────────────────────
// startPct / endPct: when in [0–1] scroll progress each overlay is visible.
// Adjust these to retime text relative to the frame sequence.
const TEXT_OVERLAYS = [
  {
    id: 'intro',
    startPct: 0,
    endPct: 0.18,
    content: (
      <div className="max-w-sm md:max-w-xl">
        <p className="font-sans text-[10px] md:text-xs font-bold tracking-[0.3em] uppercase text-oz-blue/70 mb-3 md:mb-4">
          Aircraft Rental Platform
        </p>
        <h1 className="font-serif text-4xl md:text-7xl font-black text-oz-text leading-tight mb-4 md:mb-6">
          The sky is<br />
          <span className="italic text-oz-blue">yours to fly.</span>
        </h1>
        <p className="font-sans text-sm md:text-lg text-oz-muted font-light leading-relaxed max-w-xs md:max-w-md">
          A modern platform for licensed pilots. Rent, fly, and return — with zero friction.
        </p>
      </div>
    ),
  },
  {
    id: 'aircraft',
    startPct: 0.38,
    endPct: 0.55,
    content: (
      <div className="max-w-xs md:max-w-md">
        <p className="font-sans text-[10px] md:text-xs font-bold tracking-[0.3em] uppercase text-oz-blue/70 mb-3 md:mb-4">
          Our Fleet
        </p>
        <h2 className="font-serif text-3xl md:text-5xl font-black text-oz-text leading-tight mb-4 md:mb-5">
          Built for pilots.<br />
          <span className="italic text-oz-blue">Not passengers.</span>
        </h2>
        <p className="font-sans text-sm md:text-base text-oz-muted font-light leading-relaxed">
          We start with a Cessna 172 — the most trusted training and touring aircraft in the world.
          Well-maintained, thoroughly checked, and ready when you are.
        </p>
      </div>
    ),
  },
  {
    id: 'cockpit',
    startPct: 0.72,
    endPct: 0.90,
    content: (
      // Mobile: editorial text, no background panel of any kind.
      // Readability comes from CSS drop-shadow on the text elements — the filter
      // traces text contours with a tight shadow + wider dark halo, giving depth
      // without a visible box or gradient shape. The top-left hero corner is
      // already darkened by the overlapping vignettes (top: oz-deep/50,
      // left: oz-deep/70), so no additional background is needed.
      // Desktop: filter removed, full width, body copy visible.
      <div className="max-w-[158px] md:max-w-md [filter:drop-shadow(0_1px_3px_rgb(0_0_0/0.95))_drop-shadow(0_4px_14px_rgb(0_0_0/0.55))] md:[filter:none]">
        <p className="font-sans text-[9px] font-semibold tracking-[0.38em] uppercase text-oz-blue/75 mb-2.5 md:mb-4">
          The Experience
        </p>
        <h2 className="font-serif text-2xl md:text-5xl font-black text-oz-text leading-tight mb-0 md:mb-5">
          Command<br />
          <span className="italic text-oz-blue">your aircraft.</span>
        </h2>
        <p className="hidden md:block font-sans text-base text-oz-muted font-light leading-relaxed">
          From pre-flight checks to touchdown, the aircraft is yours. No instructors required
          for qualified pilots. No unnecessary oversight.
        </p>
      </div>
    ),
  },
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function HeroCanvas() {
  const sectionRef  = useRef<HTMLDivElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const overlayRefs = useRef<(HTMLDivElement | null)[]>([])

  const imagesRef       = useRef<(HTMLImageElement | null)[]>(new Array(TOTAL_FRAMES).fill(null))
  const posterRef       = useRef<HTMLImageElement | null>(null)
  const currentFrameRef = useRef(0)
  const rafRef          = useRef<number | null>(null)
  const dirtyRef        = useRef(true)
  const isMobileRef     = useRef(false)

  // Heights are computed from window.innerHeight after mount so that
  // mobile Safari's real visual-viewport height is used — not the CSS `vh` unit
  // which includes the browser chrome and causes sticky/pin miscalculations.
  const [sectionHeight,  setSectionHeight]  = useState(0) // px
  const [viewportHeight, setViewportHeight] = useState(0) // px

  // ── Draw a single frame onto the canvas (2-pass) ──
  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const img = imagesRef.current[index]
    // Image not loaded yet — stay dirty so the rAF loop retries next tick
    // rather than giving up and waiting for the onload callback
    if (!img) { dirtyRef.current = true; return }
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // canvas.width/height are physical pixels (DPR-scaled) after resizeCanvas runs.
    const { width: cw, height: ch } = canvas
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    if (!iw || !ih) return

    // Bicubic interpolation for both passes.
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const containScale = Math.min(cw / iw, ch / ih)
    const coverScale   = Math.max(cw / iw, ch / ih)

    // ── Pass 1: background — pure cover, always full-bleed, no bars ──────────
    // Always centered so the background fill is symmetrical regardless of focal.
    const bgW = iw * coverScale
    const bgH = ih * coverScale
    const bgX = (cw - bgW) * 0.5
    const bgY = (ch - bgH) * 0.5
    ctx.drawImage(img, bgX, bgY, bgW, bgH)

    // Tonal separation between background and foreground passes.
    // Darkening the background makes the foreground read as the primary image
    // and prevents the bleed edges from competing with the composition.
    ctx.fillStyle = `rgba(0,0,0,${BG_DARKEN_ALPHA})`
    ctx.fillRect(0, 0, cw, ch)

    // ── Pass 2: foreground — gentler fit, more composition preserved ──────────
    // Scale is lerped between containScale (full frame visible) and coverScale
    // (full-bleed crop). The background pass fills any area the foreground misses,
    // so no exposed canvas strips or sequence-mismatch artefacts are possible.
    const layout  = getLayout(index, isMobileRef.current)
    const fgScale = containScale + (coverScale - containScale) * layout.fgBlend
    const fgW     = iw * fgScale
    const fgH     = ih * fgScale
    const fgX     = (cw - fgW) * layout.focalX
    const fgY     = (ch - fgH) * layout.focalY

    // At frame 0, use the poster image in the foreground if one is configured
    // and has finished loading — otherwise fall back to the sequence frame.
    const fgImg = (index === 0 && posterRef.current) ? posterRef.current : img
    ctx.drawImage(fgImg, fgX, fgY, fgW, fgH)
  }, [])

  // ── Resize canvas + recalculate section height ──
  // Called on mount, resize, and orientationchange.
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const w = window.innerWidth
    const h = window.innerHeight          // real visual viewport on mobile
    isMobileRef.current = w < 768

    // DPR-aware backing store: multiply the internal pixel buffer by devicePixelRatio
    // so the canvas renders at the screen's native physical resolution rather than at
    // 1× CSS pixels. Without this, Retina/HiDPI displays (DPR=2) upscale the 1×
    // buffer 2× to fill the screen, blurring fine-detail areas like water and foliage.
    // Capped at 2 — the jump from 2× to 3× is imperceptible at normal viewing distances
    // and avoids unnecessary GPU memory overhead on high-DPR mobile devices.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    canvas.width  = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    dirtyRef.current = true

    const mult = isMobileRef.current ? MOBILE_SCROLL_MULTIPLIER : DESKTOP_SCROLL_MULTIPLIER
    setSectionHeight(h * mult)
    setViewportHeight(h)
  }, [])

  // ── Load one frame by index ──
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

  // ── rAF render loop — only paints when dirtyRef is true ──
  const renderLoop = useCallback(() => {
    if (dirtyRef.current) {
      drawFrame(currentFrameRef.current)
      dirtyRef.current = false
    }
    rafRef.current = requestAnimationFrame(renderLoop)
  }, [drawFrame])

  // ── Scroll handler — maps scroll progress → frame + overlay opacity ──
  const onScroll = useCallback(() => {
    const section = sectionRef.current
    if (!section) return

    const rect              = section.getBoundingClientRect()
    const scrolled          = -rect.top
    const scrollableDistance = section.offsetHeight - window.innerHeight
    const progress          = Math.max(0, Math.min(1, scrolled / scrollableDistance))

    // Frame selection
    const frameIndex = Math.round(progress * (TOTAL_FRAMES - 1))
    if (frameIndex !== currentFrameRef.current) {
      currentFrameRef.current = frameIndex
      dirtyRef.current = true

      // Preload surrounding frames
      const lookahead = isMobileRef.current ? MOBILE_LOOKAHEAD : DESKTOP_LOOKAHEAD
      for (let i = -lookahead; i <= lookahead; i++) loadFrame(frameIndex + i)
    }

    // Text overlay opacity
    overlayRefs.current.forEach((el, idx) => {
      if (!el) return
      const { startPct, endPct } = TEXT_OVERLAYS[idx]
      const fadeDuration = 0.055
      let opacity = 0
      if (progress >= startPct && progress <= endPct) {
        // When startPct === 0 the overlay should be fully visible at progress 0.
        // Using (progress - 0) / fadeDuration would give 0 at exactly progress=0,
        // making the first overlay invisible on load. Skip fade-in in that case.
        const fadeIn  = startPct === 0 ? 1 : Math.min(1, (progress - startPct) / fadeDuration)
        const fadeOut = Math.min(1, (endPct - progress) / fadeDuration)
        opacity = Math.min(fadeIn, fadeOut)
      }
      el.style.opacity = String(opacity)
    })
  }, [loadFrame])

  useEffect(() => {
    // Only skip for reduced-motion preference — NOT for mobile width
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    resizeCanvas()

    window.addEventListener('resize',            resizeCanvas, { passive: true })
    window.addEventListener('orientationchange', resizeCanvas, { passive: true })
    window.addEventListener('scroll',            onScroll,     { passive: true })

    // Sync overlay opacities from current scroll position on mount.
    // Without this, overlays start with their JSX default opacity and only
    // update after the first user scroll — which means mid-page refreshes
    // show the wrong state, and the first overlay fade-in bug could surface.
    onScroll()

    // Load the opening poster if one is configured. It is only used at frame 0
    // so it does not interfere with the rest of the sequence.
    if (POSTER_SRC) {
      const p = new Image()
      p.src = POSTER_SRC
      p.onload = () => {
        posterRef.current = p
        if (currentFrameRef.current === 0) dirtyRef.current = true
      }
    }

    // Load frame 0 immediately so something appears on first paint
    loadFrame(0)

    // Eager batch
    const eagerCount = isMobileRef.current ? MOBILE_EAGER_FRAMES : DESKTOP_EAGER_FRAMES
    for (let i = 1; i < eagerCount; i++) loadFrame(i)

    // Idle batch — load the rest without blocking the main thread
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

  // ── Heights ───────────────────────────────────────────────────────────────
  // Before JS runs (SSR / first paint), fall back to CSS viewport units.
  // After mount, switch to the exact px values derived from window.innerHeight.
  // This is what makes mobile Safari sticky work correctly.
  const outerStyle: React.CSSProperties = sectionHeight > 0
    ? { height: `${sectionHeight}px` }
    : { height: `${DESKTOP_SCROLL_MULTIPLIER * 100}svh` }   // svh = small viewport height (excludes chrome)

  const stickyStyle: React.CSSProperties = viewportHeight > 0
    ? { height: `${viewportHeight}px` }
    : { height: '100svh' }

  return (
    <div
      ref={sectionRef}
      className="relative hero-scroll-section"
      style={outerStyle}
    >
      {/* Sticky viewport — pinned while parent scrolls */}
      <div
        className="sticky top-0 w-full overflow-hidden bg-oz-deep"
        style={stickyStyle}
      >
        {/* Canvas — frame sequence rendered here */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
        />

        {/* Gradient vignettes */}
        <div className="absolute inset-0 bg-gradient-to-b from-oz-deep/50 via-transparent to-oz-deep/80 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-oz-deep/70 via-transparent to-transparent pointer-events-none" />

        {/* Text overlays
            Desktop: vertically centred (items-center)
            Mobile: anchored to bottom (items-end pb-28) so the aircraft fills the top */}
        {TEXT_OVERLAYS.map((overlay, idx) => (
          <div
            key={overlay.id}
            ref={(el) => { overlayRefs.current[idx] = el }}
            // seq-3 (cockpit): mobile text lives in the upper-left safe area above
            // the dashboard. All other overlays anchor to the bottom on mobile so
            // the aircraft/exterior fills the upper viewport.
            className={`absolute inset-0 flex pointer-events-none md:items-center ${
              overlay.id === 'cockpit'
                ? 'items-start pt-20 md:pt-0'
                : 'items-end pb-28 md:pb-0'
            }`}
            style={{ opacity: idx === 0 ? 1 : 0, transition: 'opacity 0.1s linear' }}
          >
            <div className="px-6 md:px-12 lg:px-20">
              {overlay.content}
            </div>
          </div>
        ))}

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-50">
          <span className="font-sans text-[10px] tracking-[0.2em] uppercase text-oz-muted">Scroll</span>
          <div className="w-px h-8 bg-oz-blue/40 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-oz-blue animate-bounce" />
          </div>
        </div>
      </div>
    </div>
  )
}
