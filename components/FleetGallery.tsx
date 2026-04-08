'use client'

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import Image from 'next/image'
import {
  motion, AnimatePresence,
  useMotionValue, useDragControls,
} from 'framer-motion'
import type { GalleryImage } from '@/lib/getFleetImages'

// ─── Design tokens ─────────────────────────────────────────────────────────────
const BASE     = '#091421'
const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number]

// ─── Teaser collage: each card has explicit size + position ───────────────────
// Cards ordered back → front so z-index stacks correctly in DOM.
const STACK_CARDS = [
  // back cards (rendered first, appear behind)
  { w: 295, h: 192, left: 52,  top: -28, rotate: -2.0, z: 10, opacity: 0.52, shadow: '0 4px 18px rgba(0,0,0,0.40)' },
  { w: 265, h: 174, left: 152, top:  88, rotate:  5.2, z: 20, opacity: 0.72, shadow: '0 8px 26px rgba(0,0,0,0.52)' },
  { w: 285, h: 185, left: -86, top:  78, rotate: -6.5, z: 30, opacity: 0.85, shadow: '0 12px 38px rgba(0,0,0,0.60)' },
  // front card (rendered last, always on top)
  { w: 340, h: 222, left: 28,  top:  28, rotate:  1.5, z: 40, opacity: 1.00, shadow: '0 22px 58px -6px rgba(0,0,0,0.74)' },
]

// ─── Expanded: 3 depth bands (foreground / midground / background) ────────────
const DEPTH_BANDS = [
  // 0 = foreground
  { scaleMul: 1.00, opacity: 1.00, blur: 0,    zBase: 20, shadow: '0 24px 56px -6px rgba(0,0,0,0.85)' },
  // 1 = midground
  { scaleMul: 0.70, opacity: 0.85, blur: 0,    zBase: 10, shadow: '0 12px 24px -4px rgba(0,0,0,0.50)' },
  // 2 = background
  { scaleMul: 0.45, opacity: 0.65, blur: 1.5,  zBase: 5,  shadow: '0 6px 12px -2px rgba(0,0,0,0.30)'  },
]

// ─── Tile size rotation ────────────────────────────────────────────────────────
// Scaled down (~60%) to create a significantly zoomed-out, expansive open gallery
const TILE_SIZES = [
  { w: 252, h: 168 },
  { w: 168, h: 228 },
  { w: 216, h: 144 },
  { w: 153, h: 207 },
  { w: 237, h: 159 },
  { w: 177, h: 237 },
]

const COLS_PER_ROW = 5
const COL_STRIDE   = 298
const ROW_STRIDE   = 268

function buildLayout(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const col   = i % COLS_PER_ROW
    const row   = Math.floor(i / COLS_PER_ROW)
    const depth = i % 3
    const band  = DEPTH_BANDS[depth]
    const size  = TILE_SIZES[i % TILE_SIZES.length]
    const jx    = ((i * 137) % 72) - 36
    const jy    = ((i * 97)  % 52) - 26
    // Background tiles nudged slightly further back in layout space
    const depthPad = depth * 18
    return {
      x:     col * COL_STRIDE + jx,
      y:     row * ROW_STRIDE + jy + depthPad,
      w:     Math.round(size.w * band.scaleMul),
      h:     Math.round(size.h * band.scaleMul),
      depth,
    }
  })
}

// ─── Props ─────────────────────────────────────────────────────────────────────
interface FleetGalleryProps {
  images: GalleryImage[]
}

const PLACEHOLDER_COUNT = 10

// ─── Main component ────────────────────────────────────────────────────────────
export default function FleetGallery({ images }: FleetGalleryProps) {
  const [phase, setPhase]           = useState<'teaser' | 'expanded'>('teaser')
  const [lightbox, setLightbox]     = useState<number | null>(null)
  const [hintVisible, setHintVisible] = useState(true)
  const [isGrabbing, setIsGrabbing] = useState(false)

  const isDraggingRef = useRef(false)

  const panX         = useMotionValue(0)
  const panY         = useMotionValue(0)
  const dragControls = useDragControls()
  const [dragConstraints, setDragConstraints] = useState({ left: 0, right: 0, top: 0, bottom: 0 })

  const isEmpty  = images.length === 0
  const tileData = isEmpty
    ? Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => ({ src: '', alt: `Photograph ${i + 1}` }))
    : images
  const layout = useMemo(() => buildLayout(tileData.length), [tileData.length])

  // Pad teaser images to 4 (cycle if fewer)
  const teaserImgs: GalleryImage[] | null = isEmpty ? null : (
    Array.from({ length: 4 }, (_, i) => images[i % images.length])
  )

  // ── Keyboard nav for lightbox ─────────────────────────────────────────────
  useEffect(() => {
    if (lightbox === null) return
    const total = images.length
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setLightbox(n => n !== null ? (n + 1) % total : null)
      if (e.key === 'ArrowLeft')  setLightbox(n => n !== null ? (n - 1 + total) % total : null)
      if (e.key === 'Escape')     setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, images.length])

  // ── Lock body scroll for lightbox ─────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = lightbox !== null ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [lightbox])

  // ── Lightbox preloading cache ─────────────────────────────────────────────
  const [loadedSet, setLoadedSet] = useState<Set<number>>(new Set())
  
  useEffect(() => {
    if (lightbox !== null && images.length > 0) {
      setLoadedSet(prev => {
        const next = new Set(prev)
        next.add(lightbox)
        next.add((lightbox + 1) % images.length)
        next.add((lightbox - 1 + images.length) % images.length)
        return next
      })
    }
  }, [lightbox, images.length])

  // ── Centre the tile field when entering expanded state ────────────────────
  useEffect(() => {
    if (phase !== 'expanded' || tileData.length === 0) return
    const vpW = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vpH = 680

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    layout.forEach(pos => {
      minX = Math.min(minX, pos.x)
      maxX = Math.max(maxX, pos.x + pos.w)
      minY = Math.min(minY, pos.y)
      maxY = Math.max(maxY, pos.y + pos.h)
    })

    const fieldW = maxX - minX
    const fieldH = maxY - minY
    
    const initX = Math.max(64, (vpW - fieldW) / 2 - minX)
    const initY = Math.max(80, (vpH - fieldH) / 2 - minY + 80)

    panX.set(initX)
    panY.set(initY)

    const padX = vpW * 0.25
    const padY = vpH * 0.25

    setDragConstraints({
      left: Math.min(vpW - maxX - padX, initX),
      right: Math.max(padX - minX, initX),
      top: Math.min(vpH - maxY - padY, initY),
      bottom: Math.max(padY - minY, initY),
    })
  }, [phase, layout, panX, panY, tileData.length])

  const openExpanded = useCallback(() => setPhase('expanded'), [])

  const openImage = useCallback((i: number) => {
    if (!isDraggingRef.current && !isEmpty) setLightbox(i)
  }, [isEmpty])

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <section
      className="relative w-full"
      style={{ background: BASE, overflow: 'hidden' }}
    >

      {/* ═══════════════════════════════════════════════════════════════
          TEASER STATE
      ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {phase === 'teaser' && (
          <motion.div
            key="teaser"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
            className="relative z-10 w-full"
          >
            {/* Subtle background abstract shapes / technical linework */}
            <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-80">
               <div className="w-[800px] h-[800px] border border-white/[0.15] rounded-full absolute mix-blend-screen" />
               <div className="w-[600px] h-[600px] border border-white/[0.12] rounded-full absolute mix-blend-screen" />
               <div className="w-px h-full bg-white/[0.12] absolute" />
               <div className="w-full h-px bg-white/[0.12] absolute" />
               
               {/* Faint technical corner brackets backing the collage area */}
               <div className="absolute w-[460px] h-[340px]">
                 <div className="absolute top-0 left-0 w-8 h-8 border-t border-l border-white/[0.1]" />
                 <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-white/[0.1]" />
                 <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-white/[0.1]" />
                 <div className="absolute bottom-0 right-0 w-8 h-8 border-b border-r border-white/[0.1]" />
               </div>
            </div>

            <div className="relative z-10 w-full min-h-[650px] md:min-h-[750px] max-w-[1400px] mx-auto px-6 md:px-12 pb-12 flex flex-col justify-end">
              
              {/* ── CENTER: image collage + CTA ─────────────────────────── */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-[-40px]">
                <div className="flex flex-col items-center pointer-events-auto">

                  {/* Stack */}
                  <div
                    className="relative"
                    style={{ width: 420, height: 290, overflow: 'visible' }}
                  >
                    {/* Ambient glow behind stack */}
                    <div
                      aria-hidden="true"
                      className="absolute pointer-events-none"
                      style={{
                        inset: '-50px',
                        background: 'radial-gradient(ellipse 72% 56% at 50% 58%, rgba(174,199,247,0.055) 0%, transparent 70%)',
                        zIndex: 0,
                      }}
                    />

                    {/* Cards — back to front (STACK_CARDS is ordered back→front) */}
                    {STACK_CARDS.map((card, i) => {
                      const img = teaserImgs ? teaserImgs[i] : null
                      const isFront = i === STACK_CARDS.length - 1

                      // Custom motion starting points mapping
                      const offXs = [-120, 160, -90, 0]
                      const offYs = [-80, 100, 110, 80]
                      const stRot = [-15, 12, -8, 0]
                      const initDrop = { 
                        x: offXs[i % 4], 
                        y: offYs[i % 4], 
                        rotate: stRot[i % 4], 
                        opacity: 0, 
                        scale: 0.85 
                      }

                      return (
                        <motion.div
                          key={i}
                          className="absolute overflow-hidden rounded-2xl cursor-pointer"
                          initial={initDrop}
                          whileInView={{ 
                            x: 0, 
                            y: 0, 
                            rotate: card.rotate, 
                            opacity: card.opacity, 
                            scale: 1 
                          }}
                          viewport={{ once: true, margin: '-20%' }}
                          style={{
                            width:     card.w,
                            height:    card.h,
                            left:      card.left,
                            top:       card.top,
                            zIndex:    card.z,
                            boxShadow: card.shadow,
                            border:    '1px solid rgba(174,199,247,0.09)',
                          }}
                          whileHover={
                            isFront
                              ? {
                                  y:         -8,
                                  scale:     1.025,
                                  boxShadow: '0 32px 72px -10px rgba(0,0,0,0.82)',
                                  rotate:    0.5,
                                }
                              : {
                                  y:       -4,
                                  opacity: Math.min(1, card.opacity + 0.12),
                                }
                          }
                          transition={{ duration: 1.8, delay: 0.15 + (i * 0.1), ease: EASE_OUT }}
                          onClick={openExpanded}
                        >
                          {img ? (
                            <Image
                              src={img.src}
                              alt={img.alt}
                              fill
                              className="object-cover select-none"
                              sizes="340px"
                              draggable={false}
                            />
                          ) : (
                            <div
                              className="w-full h-full"
                              style={{
                                background: isFront
                                  ? 'linear-gradient(148deg, #102845 0%, #091b30 100%)'
                                  : `linear-gradient(148deg, #0c1f38 0%, #060e1e ${80 - i * 8}%)`,
                              }}
                            />
                          )}
                        </motion.div>
                      )
                    })}
                  </div>

                  {/* CTA — centered below the stack */}
                  {!isEmpty && (
                    <motion.button
                      onClick={openExpanded}
                      className="mt-12 flex items-center justify-center gap-3 font-sans font-semibold text-xs tracking-[0.22em] uppercase px-7 py-3.5 rounded-xl w-fit mx-auto pointer-events-auto"
                      style={{
                        background:     'rgba(174,199,247,0.07)',
                        border:         '1px solid rgba(174,199,247,0.16)',
                        color:          '#aec7f7',
                        backdropFilter: 'blur(10px)',
                      }}
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-20%' }}
                      transition={{ duration: 1.4, delay: 1.0, ease: EASE_OUT }}
                      whileHover={{ background: 'rgba(174,199,247,0.12)', scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      Explore Gallery
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M4.5 2L9 6.5 4.5 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </motion.button>
                  )}

                </div>
              </div>

              {/* ── GROUNDED EDITORIAL TEXT CORNERS ─────────────────────────── */}
              <div className="relative z-20 flex flex-col md:flex-row justify-between items-end w-full pointer-events-none gap-8">
                
                {/* ── LEFT: Title block ─────────────────────────── */}
                <motion.div
                  className="pointer-events-auto max-w-[45%]"
                  initial={{ opacity: 0, x: -60 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-20%' }}
                  transition={{ duration: 1.4, delay: 0.4, ease: EASE_OUT }}
                >
                  <p
                    className="font-sans font-semibold tracking-[0.44em] uppercase mb-4"
                    style={{ fontSize: '0.58rem', color: 'rgba(174,199,247,0.52)' }}
                  >
                    Fleet Gallery
                  </p>

                  <h2
                    className="font-serif font-normal leading-[1.06] tracking-tight"
                    style={{ fontSize: 'clamp(2.8rem, 5vw, 4.2rem)', color: '#d9e3f6' }}
                  >
                    Inside<br />the Aircraft
                  </h2>
                </motion.div>

                {/* ── RIGHT: Support Copy ─────────────────────────── */}
                <motion.div
                  className="pointer-events-auto md:text-right max-w-xs md:max-w-[32%]"
                  initial={{ opacity: 0, x: 60 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-20%' }}
                  transition={{ duration: 1.6, delay: 0.6, ease: EASE_OUT }}
                >
                  <div
                    className="md:ml-auto h-px mb-4 w-12"
                    style={{ background: 'rgba(174,199,247,0.18)' }}
                  />

                  <p
                    className="font-sans leading-relaxed"
                    style={{ fontSize: '0.85rem', color: 'rgba(196,198,207,0.76)' }}
                  >
                    {isEmpty
                      ? 'Gallery images will appear here once added to the fleet-gallery directory.'
                      : `${images.length} photograph${images.length === 1 ? '' : 's'} — cockpit details, ramp walks, and open sky.`
                    }
                  </p>
                </motion.div>

              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            EXPANDED STATE
        ═══════════════════════════════════════════════════════════════ */}
        {phase === 'expanded' && (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42, ease: EASE_OUT }}
            className="relative w-full"
            style={{ height: '680px' }}
          >

            {/* Background Block Pattern */}
            <div 
              className="absolute inset-0 z-0 pointer-events-none select-none"
              style={{
                backgroundImage: `
                  linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
                `,
                backgroundSize: '80px 80px',
                maskImage: 'radial-gradient(ellipse at center, black 10%, transparent 75%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 10%, transparent 75%)'
              }}
            />

            {/* ── Top header (title + collapse button) ─────────────────── */}
            <div
              className="absolute top-0 left-0 right-0 z-30 flex items-start justify-between px-6 md:px-10 pt-7 pb-16 pointer-events-none"
              style={{ background: `linear-gradient(to bottom, ${BASE} 0%, rgba(9,20,33,0.85) 60%, transparent 100%)` }}
            >
              {/* Title — passive, no pointer events */}
              <div className="select-none">
                <p
                  className="font-sans font-semibold tracking-[0.44em] uppercase mb-2"
                  style={{ fontSize: '0.55rem', color: 'rgba(174,199,247,0.40)' }}
                >
                  Fleet Gallery
                </p>
                <h2
                  className="font-serif font-normal leading-none tracking-tight"
                  style={{ fontSize: 'clamp(1.6rem, 2.8vw, 2.4rem)', color: '#d9e3f6' }}
                >
                  Inside the Aircraft
                </h2>
              </div>

              {/* Collapse — needs pointer events restored */}
              <button
                className="pointer-events-auto flex items-center gap-2 font-sans font-semibold text-xs tracking-[0.22em] uppercase px-5 py-2.5 rounded-lg transition-all hover:opacity-80 select-none"
                style={{
                  background:     'rgba(9,20,33,0.82)',
                  border:         '1px solid rgba(174,199,247,0.13)',
                  color:          'rgba(174,199,247,0.65)',
                  backdropFilter: 'blur(10px)',
                }}
                onClick={() => setPhase('teaser')}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Collapse
              </button>
            </div>

            {/* ── Hint — fades after first drag ────────────────────────── */}
            <AnimatePresence>
              {hintVisible && (
                <motion.div
                  className="absolute bottom-8 left-1/2 z-30 pointer-events-none select-none"
                  style={{ transform: 'translateX(-50%)' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.9, duration: 0.6 }}
                >
                  <p
                    className="font-sans tracking-[0.26em] uppercase whitespace-nowrap"
                    style={{ fontSize: '0.58rem', color: 'rgba(174,199,247,0.30)' }}
                  >
                    Drag to explore&ensp;·&ensp;Click to enlarge
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Edge fades ────────────────────────────────────────────── */}
            <div aria-hidden="true" className="absolute inset-y-0 left-0 w-20 z-20 pointer-events-none"
              style={{ background: `linear-gradient(to right, ${BASE}, transparent)` }} />
            <div aria-hidden="true" className="absolute inset-y-0 right-0 w-20 z-20 pointer-events-none"
              style={{ background: `linear-gradient(to left, ${BASE}, transparent)` }} />
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-20 z-20 pointer-events-none"
              style={{ background: `linear-gradient(to top, ${BASE}, transparent)` }} />

            {/* ── Drag capture layer ────────────────────────────────────────
                This div ALWAYS covers the full viewport area and never moves.
                It captures all pointer events for drag — including empty space.
                The content (tiles) lives inside the motion.div that translates.
            ──────────────────────────────────────────────────────────────── */}
            <div
              className="absolute inset-0 z-10 overflow-hidden"
              style={{
                cursor:     isGrabbing ? 'grabbing' : 'grab',
                userSelect: 'none',
                touchAction: 'none',
              }}
              onPointerDown={e => {
                // Start drag from anywhere — empty space or over a tile
                dragControls.start(e)
              }}
            >
              {/* Moving content layer — translates with panX/panY */}
              <motion.div
                drag
                dragConstraints={dragConstraints}
                dragControls={dragControls}
                dragListener={false}
                dragElastic={0.055}
                dragMomentum
                style={{
                  x:          panX,
                  y:          panY,
                  position:   'absolute',
                  top:        0,
                  left:       0,
                  userSelect: 'none',
                  cursor:     'inherit',
                }}
                onDragStart={() => {
                  isDraggingRef.current = true
                  setIsGrabbing(true)
                  if (hintVisible) setHintVisible(false)
                }}
                onDragEnd={() => {
                  setIsGrabbing(false)
                  setTimeout(() => { isDraggingRef.current = false }, 140)
                }}
              >
                {/* Tile field */}
                <div style={{ position: 'relative', width: 0, height: 0 }}>
                  {tileData.map((img, i) => {
                    const pos  = layout[i]
                    const band = DEPTH_BANDS[pos.depth]
                    return (
                      <motion.div
                        key={i}
                        className="absolute overflow-hidden rounded-xl select-none"
                        style={{
                          left:      pos.x,
                          top:       pos.y,
                          width:     pos.w,
                          height:    pos.h,
                          zIndex:    band.zBase,
                          opacity:   band.opacity,
                          boxShadow: band.shadow,
                          border:    '1px solid rgba(174,199,247,0.07)',
                          filter:    band.blur > 0 ? `blur(${band.blur}px)` : undefined,
                        }}
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: band.opacity, scale: 1 }}
                        transition={{ duration: 0.52, delay: i * 0.024, ease: EASE_OUT }}
                        whileHover={{
                          scale:     1.05,
                          zIndex:    60,
                          opacity:   1,
                          filter:    'blur(0px)',
                          boxShadow: '0 28px 60px -6px rgba(0,0,0,0.88)',
                        }}
                        onClick={() => openImage(i)}
                      >
                        {isEmpty ? (
                          <div
                            className="w-full h-full"
                            style={{ background: 'linear-gradient(135deg, #0f2040 0%, #060d1b 100%)' }}
                          />
                        ) : (
                          <Image
                            src={img.src}
                            alt={img.alt}
                            fill
                            className="object-cover pointer-events-none"
                            sizes={`${pos.w}px`}
                            draggable={false}
                            loading="lazy"
                          />
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              </motion.div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          LIGHTBOX
      ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {lightbox !== null && images.length > 0 && (
          <motion.div
            key="lightbox"
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            style={{ background: 'rgba(4,9,18,0.95)', backdropFilter: 'blur(18px)' }}
            onClick={() => setLightbox(null)}
          >
            {/* Image frame */}
            <motion.div
              className="relative"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1,    opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.32, ease: EASE_OUT }}
              onClick={e => e.stopPropagation()}
            >
              <div
                className="relative rounded-2xl overflow-hidden"
                style={{
                  width:     'min(88vw, 1100px)',
                  height:    'min(80vh, 700px)',
                  border:    '1px solid rgba(174,199,247,0.10)',
                  boxShadow: '0 48px 96px -16px rgba(0,0,0,0.88)',
                  background: 'rgba(0,0,0,0.4)', // Base dark loading scrim
                }}
              >
                {Array.from(loadedSet).map((idx) => {
                  const img = images[idx]
                  const isActive = idx === lightbox
                  return (
                    <Image
                      key={img.src}
                      src={img.src}
                      alt={img.alt}
                      fill
                      className={`object-contain transition-opacity duration-200 ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                      sizes="88vw"
                      loading={isActive ? "eager" : "lazy"}
                      priority={isActive}
                    />
                  )
                })}
              </div>

              {/* Caption */}
              <p
                className="mt-4 text-center font-sans text-xs tracking-[0.18em] uppercase select-none"
                style={{ color: 'rgba(174,199,247,0.38)' }}
              >
                {images[lightbox].alt}&ensp;·&ensp;{lightbox + 1} / {images.length}
              </p>
            </motion.div>

            {/* Prev / Next */}
            {images.length > 1 && (
              <>
                <button
                  className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full w-11 h-11 transition-all hover:scale-110"
                  style={{ background: 'rgba(174,199,247,0.08)', border: '1px solid rgba(174,199,247,0.14)' }}
                  onClick={e => {
                    e.stopPropagation()
                    setLightbox(n => n !== null ? (n - 1 + images.length) % images.length : null)
                  }}
                  aria-label="Previous image"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M11 4L6 9l5 5" stroke="#aec7f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                <button
                  className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full w-11 h-11 transition-all hover:scale-110"
                  style={{ background: 'rgba(174,199,247,0.08)', border: '1px solid rgba(174,199,247,0.14)' }}
                  onClick={e => {
                    e.stopPropagation()
                    setLightbox(n => n !== null ? (n + 1) % images.length : null)
                  }}
                  aria-label="Next image"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M7 4l5 5-5 5" stroke="#aec7f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </>
            )}

            {/* Close */}
            <button
              className="absolute top-4 right-4 md:top-6 md:right-6 flex items-center justify-center rounded-full w-9 h-9 transition-all hover:scale-110"
              style={{ background: 'rgba(174,199,247,0.08)', border: '1px solid rgba(174,199,247,0.12)' }}
              onClick={() => setLightbox(null)}
              aria-label="Close lightbox"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="#aec7f7" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </section>
  )
}
