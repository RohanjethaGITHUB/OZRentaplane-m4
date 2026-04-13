'use client'

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  MouseEvent as RMouseEvent,
} from 'react'
import Image from 'next/image'
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion'

// ─── Types ────────────────────────────────────────────────────────────────────
type ViewTab = 'exterior' | 'cabin' | 'storage' | 'cockpit' | 'panel'

interface ImageView {
  src: string
  label: string
  alt: string
}

// ─── Exterior walkaround sequence — order is locked ───────────────────────────
const EXTERIOR_VIEWS: ImageView[] = [
  { src: '/CessnaImageTrans-1.png', label: 'Front 3/4', alt: 'Cessna 172N — front-right 3/4 view' },
  { src: '/CessnaImageTrans-2.png', label: 'Profile',   alt: 'Cessna 172N — side profile view'     },
  { src: '/CessnaImageTrans-3.png', label: 'Front',     alt: 'Cessna 172N — straight front view'   },
  { src: '/CessnaImageTrans-4.png', label: 'Rear 3/4',  alt: 'Cessna 172N — rear-right view'       },
]

// ─── Storage views ────────────────────────────────────────────────────────────
const STORAGE_VIEWS: ImageView[] = [
  { src: '/storage-cessna-1.webp', label: 'Overview',  alt: 'Cessna 172N — baggage compartment overview' },
  { src: '/storage-cessna-2.webp', label: 'Detail',    alt: 'Cessna 172N — storage detail view'         },
  { src: '/storage-cessna-3.webp', label: 'Capacity',  alt: 'Cessna 172N — storage capacity view'       },
]

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS: { id: ViewTab; label: string }[] = [
  { id: 'exterior', label: 'Exterior' },
  { id: 'cabin',    label: 'Cabin'    },
  { id: 'storage',  label: 'Storage'  },
  { id: 'cockpit',  label: 'Cockpit'  },
  { id: 'panel',    label: 'Panel'    },
]

// ─── Design tokens ────────────────────────────────────────────────────────────
const A     = 'rgba(174,199,247,1)'
const A_MID = 'rgba(174,199,247,0.55)'
const A_DIM = 'rgba(174,199,247,0.22)'
const A_LO  = 'rgba(174,199,247,0.08)'

// ─── Easing ───────────────────────────────────────────────────────────────────
const EASE_PREMIUM = [0.18, 0.82, 0.16, 1] as [number, number, number, number]
const EASE_OUT = [0.32, 0, 0.67, 0] as [number, number, number, number]

// ─── Image transition variants ────────────────────────────────────────────────
const imgVariants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir === 1 ? 28 : dir === -1 ? -28 : 0,
    y: dir === 0 ? 12 : 6,
    scale: 0.94,
    rotate: dir === 1 ? 0.75 : dir === -1 ? -0.75 : 0,
  }),
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    transition: { duration: 1.4, ease: EASE_PREMIUM },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir === 1 ? -24 : dir === -1 ? 24 : 0,
    y: -4,
    scale: 0.965,
    rotate: dir === 1 ? -0.5 : dir === -1 ? 0.5 : 0,
    transition: { duration: 0.8, ease: EASE_OUT },
  }),
}

// ─── Label transition variants ────────────────────────────────────────────────
const labelVariants = {
  enter: (dir: number) => ({ 
    opacity: 0, 
    y: 4, 
    x: dir === 1 ? 12 : dir === -1 ? -12 : 0 
  }),
  visible: { 
    opacity: 1, 
    y: 0, 
    x: 0, 
    transition: { duration: 0.8, ease: EASE_PREMIUM } 
  },
  exit: (dir: number) => ({ 
    opacity: 0, 
    y: -2, 
    x: dir === 1 ? -12 : dir === -1 ? 12 : 0,
    transition: { duration: 0.5, ease: EASE_OUT } 
  }),
}

// ─── Storage cinematic variants — soft crossfade + Ken Burns push ─────────────
// Each image gets a unique scale/position drift so the sequence feels organic.
const STORAGE_DRIFT: { scale: [number, number]; x: [number, number]; y: [number, number] }[] = [
  { scale: [1.0, 1.06], x: [0, -6],  y: [0, -4]  },
  { scale: [1.02, 1.08], x: [2, -4],  y: [-2, 2]  },
  { scale: [1.0, 1.05], x: [-2, 4],  y: [2, -2]  },
]

const storageVariants = {
  enter: { opacity: 0, scale: 1.02 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 1.2, ease: EASE_PREMIUM },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: 0.8, ease: EASE_OUT },
  },
}

// ─── Minimal SVG plane silhouette (fallback) ──────────────────────────────────
function PlaceholderPlaneSVG({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 32" fill="none">
      <path
        d="M6 17L2 22h6l6-5H6zM42 15c3 0 4-1 4-2s-1-2-4-2H24l-8-8h-4l4 8H8L6 9H3l1 6v1l-1 6h3l2-2h8l-4 8h4l8-8h18z"
        fill="rgba(174,199,247,0.35)"
      />
    </svg>
  )
}

// ─── Segmented View Tab Bar ───────────────────────────────────────────────────
function ViewTabs({ active, onChange }: { active: ViewTab; onChange: (t: ViewTab) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Aircraft view selector"
      className="relative flex items-center gap-[2px] rounded-full p-[3px]"
      style={{
        background: 'rgba(8,17,30,0.78)',
        border: `1px solid ${A_LO}`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'inset 0 1px 0 rgba(174,199,247,0.04)',
      }}
    >
      {TABS.map(({ id, label }) => {
        const isActive = id === active
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className="relative px-5 py-[7px] rounded-full font-sans font-semibold tracking-[0.15em] uppercase focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#aec7f7]/40 transition-colors duration-300"
            style={{ fontSize: '0.57rem' }}
          >
            {/* Active pill — layoutId animates smoothly between tabs */}
            {isActive && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #c4d9fb 0%, #7aaaf0 100%)',
                  boxShadow: '0 1px 12px rgba(174,199,247,0.28)',
                }}
                transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              />
            )}
            <span
              className="relative z-10 transition-colors duration-300"
              style={{ color: isActive ? '#071020' : A_MID }}
            >
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Premium Thumbnail ────────────────────────────────────────────────────────
function Thumbnail({
  view,
  isActive,
  onClick,
  pipId = 'active-thumbnail-pip',
}: {
  view: ImageView
  isActive: boolean
  onClick: () => void
  pipId?: string
}) {
  const [hovered, setHovered] = useState(false)
  const [imgError, setImgError] = useState(false)

  return (
    <motion.button
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      aria-label={`Switch to ${view.label} view`}
      className="relative flex flex-col items-center gap-[6px] focus-visible:outline-none rounded-lg"
      style={{ flexShrink: 0 }}
      animate={{ scale: isActive ? 1.07 : hovered ? 1.03 : 1 }}
      transition={{ type: 'spring', stiffness: 340, damping: 24 }}
    >
      {/* Frame */}
      <div
        className="relative overflow-hidden"
        style={{
          width:  'clamp(54px, 8.5vw, 74px)',
          height: 'clamp(36px, 5.6vw, 50px)',
          borderRadius: '7px',
          background: 'rgba(7,16,30,0.72)',
          transition: 'border-color 0.3s, box-shadow 0.3s',
          border: isActive
            ? '1px solid rgba(174,199,247,0.55)'
            : hovered
            ? '1px solid rgba(174,199,247,0.20)'
            : `1px solid ${A_LO}`,
          boxShadow: isActive
            ? '0 0 0 1px rgba(174,199,247,0.14), 0 4px 16px rgba(174,199,247,0.12)'
            : hovered
            ? '0 2px 8px rgba(174,199,247,0.06)'
            : '0 1px 4px rgba(0,0,0,0.40)',
        }}
      >
        {!imgError ? (
          <Image
            src={view.src}
            alt={view.alt}
            fill
            className="object-contain p-[8px]"
            style={{
              opacity: isActive ? 1 : hovered ? 0.72 : 0.46,
              transition: 'opacity 0.3s',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6)) drop-shadow(0 1px 2px rgba(174,199,247,0.15))',
            }}
            onError={() => setImgError(true)}
            sizes="74px"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ opacity: isActive ? 0.8 : 0.35 }}
          >
            <PlaceholderPlaneSVG size={26} />
          </div>
        )}

        {/* Active inner glow overlay */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ opacity: isActive ? 1 : 0 }}
          transition={{ duration: 0.4 }}
          style={{
            background:
              'radial-gradient(ellipse 90% 90% at 50% 50%, rgba(174,199,247,0.10) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Label */}
      <span
        className="font-sans font-semibold tracking-[0.15em] uppercase"
        style={{
          fontSize: '0.44rem',
          lineHeight: 1,
          color: isActive ? A : A_MID,
          transition: 'color 0.3s',
        }}
      >
        {view.label}
      </span>

      {/* Animated underline pip */}
      <div className="h-[1.5px] w-[16px] relative flex justify-center">
        {isActive && (
          <motion.div
            layoutId={pipId}
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ type: 'spring', stiffness: 450, damping: 40 }}
            className="absolute inset-0"
            style={{
              borderRadius: '2px',
              background: `linear-gradient(90deg, ${A_DIM}, ${A})`,
            }}
          />
        )}
      </div>
    </motion.button>
  )
}

// ─── Coming soon placeholder ──────────────────────────────────────────────────
function ComingSoonPlaceholder({ label }: { label: string }) {
  return (
    <motion.div
      key={label}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: EASE_PREMIUM }}
      className="w-full flex flex-col items-center justify-center gap-4 select-none"
      style={{ minHeight: 'clamp(160px, 24vw, 300px)' }}
    >
      <motion.div
        className="rounded-full flex items-center justify-center"
        animate={{ boxShadow: ['0 0 0px rgba(174,199,247,0)', '0 0 18px rgba(174,199,247,0.12)', '0 0 0px rgba(174,199,247,0)'] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 52,
          height: 52,
          background: 'rgba(174,199,247,0.07)',
          border: `1px solid ${A_LO}`,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={A_MID} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </motion.div>

      <div className="flex flex-col items-center gap-[5px]">
        <span
          className="font-sans font-semibold tracking-[0.22em] uppercase"
          style={{ fontSize: '0.52rem', color: A_MID }}
        >
          {label} View
        </span>
        <span className="font-sans" style={{ fontSize: '0.7rem', color: 'rgba(174,199,247,0.28)' }}>
          Coming soon
        </span>
      </div>
    </motion.div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AircraftViewerCard() {
  const [activeTab, setActiveTab] = useState<ViewTab>('exterior')
  const [[activeIdx, direction], setPage] = useState([0, 0])
  const [imgError,  setImgError]  = useState(false)

  // ── Storage tab state ─────────────────────────────────────────────────────
  const [storageIdx, setStorageIdx] = useState(0)

  // ── Autoplay interaction states ───────────────────────────────────────────
  const [lastInteractionTime, setLastInteractionTime] = useState(0)
  const [isHoveringSelector, setIsHoveringSelector]   = useState(false)

  // Whether the mouse is over the stage (used to pause idle float & autoplay)
  const [isHoveringStage, setIsHoveringStage] = useState(false)

  // ── Touch detection ────────────────────────────────────────────────────────
  const [isTouch, setIsTouch] = useState(false)
  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  // ── Preload all images ────────────────────────────────────────────────────
  useEffect(() => {
    ;[...EXTERIOR_VIEWS, ...STORAGE_VIEWS].forEach(({ src }) => {
      const img = new window.Image()
      img.src = src
    })
  }, [])

  // ── Mouse parallax spring values ──────────────────────────────────────────
  const stageRef      = useRef<HTMLDivElement>(null)
  const rawX          = useMotionValue(0)
  const rawY          = useMotionValue(0)
  const springCfg     = { stiffness: 55, damping: 18, mass: 0.9 }
  const parallaxX     = useSpring(useTransform(rawX, [-1, 1], [-6, 6]),  springCfg)
  const parallaxY     = useSpring(useTransform(rawY, [-1, 1], [-4, 4]),  springCfg)
  const rotateX_p     = useSpring(useTransform(rawY, [-1, 1], [ 2, -2]), springCfg)
  const rotateY_p     = useSpring(useTransform(rawX, [-1, 1], [-3,  3]), springCfg)

  // ── Ambient glow position spring — shifts when view changes ───────────────
  const glowXMv       = useMotionValue(52)
  const glowYMv       = useMotionValue(50)
  const glowX         = useSpring(glowXMv, { stiffness: 28, damping: 20 })
  const glowY         = useSpring(glowYMv, { stiffness: 28, damping: 20 })
  const glowBg        = useTransform(
    [glowX, glowY],
    ([x, y]: number[]) =>
      `radial-gradient(ellipse 68% 56% at ${x}% ${y}%, rgba(90,148,230,0.15) 0%, rgba(174,199,247,0.06) 40%, transparent 70%)`
  )

  // Shift glow position subtly on each new view
  const GLOW_POSITIONS = [
    [52, 50], [42, 52], [56, 48], [60, 50],
  ]

  // ── Switch view handler ───────────────────────────────────────────────────
  const switchView = useCallback(
    (idx: number, isAuto = false) => {
      if (idx === activeIdx) return
      setImgError(false)

      let dir = idx > activeIdx ? 1 : -1
      if (isAuto && activeIdx === EXTERIOR_VIEWS.length - 1 && idx === 0) dir = 1
      if (isAuto && activeIdx === 0 && idx === EXTERIOR_VIEWS.length - 1) dir = -1

      setPage([idx, dir])
      // Drift the ambient glow
      const [gx, gy] = GLOW_POSITIONS[idx] ?? [52, 50]
      glowXMv.set(gx)
      glowYMv.set(gy)

      // Manual interaction reset
      if (!isAuto) {
        setLastInteractionTime(Date.now())
      }
    },
    [activeIdx, glowXMv, glowYMv]
  )

  // ── Autoplay Effect — Exterior ─────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'exterior') return

    const timer = setTimeout(() => {
      const now = Date.now()

      // If hovered (and not on touch device), pause
      if (!isTouch && (isHoveringStage || isHoveringSelector)) return

      // If user interacted recently, wait 10 seconds before resuming
      if (now - lastInteractionTime < 10000) return

      // Autoplay advance
      const nextIdx = (activeIdx + 1) % EXTERIOR_VIEWS.length
      switchView(nextIdx, true)
    }, 3200)

    return () => clearTimeout(timer)
  }, [activeTab, activeIdx, isHoveringStage, isHoveringSelector, lastInteractionTime, isTouch, switchView])

  // ── Autoplay Effect — Storage ─────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'storage') return

    const timer = setTimeout(() => {
      const now = Date.now()
      if (!isTouch && (isHoveringStage || isHoveringSelector)) return
      if (now - lastInteractionTime < 10000) return

      setStorageIdx((prev) => (prev + 1) % STORAGE_VIEWS.length)
    }, 3800)

    return () => clearTimeout(timer)
  }, [activeTab, storageIdx, isHoveringStage, isHoveringSelector, lastInteractionTime, isTouch])

  // ── Mouse handlers for parallax ───────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: RMouseEvent<HTMLDivElement>) => {
      if (isTouch || !stageRef.current) return
      const r  = stageRef.current.getBoundingClientRect()
      const nx = Math.min(1, Math.max(-1, ((e.clientX - r.left) / r.width)  * 2 - 1))
      const ny = Math.min(1, Math.max(-1, ((e.clientY - r.top)  / r.height) * 2 - 1))
      rawX.set(nx)
      rawY.set(ny)
    },
    [isTouch, rawX, rawY]
  )

  const handleMouseLeave = useCallback(() => {
    rawX.set(0)
    rawY.set(0)
    setIsHoveringStage(false)
  }, [rawX, rawY])

  const handleTabChange = useCallback(
    (tab: ViewTab) => {
      setActiveTab(tab)
      setLastInteractionTime(Date.now())
    },
    []
  )

  const currentView = EXTERIOR_VIEWS[activeIdx]

  return (
    <div className="w-full flex flex-col">

      {/* ══════════════════════════════════════════════════════════════════════
          STAGE — main image area with ambient glow + parallax + idle float
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        ref={stageRef}
        className="relative w-full flex items-center justify-center overflow-hidden rounded-[1.25rem] md:rounded-[1.75rem]"
        style={{ minHeight: 'clamp(280px, 45vw, 540px)', margin: '0 auto' }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHoveringStage(true)}
        onMouseLeave={handleMouseLeave}
      >

        {/* ── Layer 0: shifting ambient glow behind aircraft ─────────────── */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{ background: glowBg }}
        />

        {/* ── Layer 1: soft edge vignette — frames the stage ──────────────── */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 110% 110% at 50% 50%, transparent 40%, rgba(6,13,27,0.55) 100%)',
          }}
        />

        {/* ── Layer 2: bottom ground shadow — anchors the plane ───────────── */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: '30%',
            background: 'linear-gradient(to top, rgba(5,12,24,0.55) 0%, transparent 100%)',
          }}
        />

        {/* ── Aircraft image — parallax + idle float wrapper ───────────────── */}
        <motion.div
          className="relative z-10 w-full"
          style={{
            maxWidth: 'clamp(320px, 94%, 900px)',
            x:  isTouch ? 0 : parallaxX,
            y:  isTouch ? 0 : parallaxY,
            rotateX: isTouch ? 0 : rotateX_p,
            rotateY: isTouch ? 0 : rotateY_p,
            transformPerspective: 900,
          }}
        >
          {/* Subtle premium breathing — pauses elegantly on hover */}
          <motion.div
            animate={
              isHoveringStage
                ? { y: 0, x: 0, scale: 1 }
                : {
                    y: [0, -8, 0],
                    x: [0, 3, 0],
                    scale: [1, 1.018, 1],
                  }
            }
            transition={
              isHoveringStage
                ? { duration: 1.8, ease: 'easeOut' }
                : {
                    duration: 5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }
            }
          >
            {activeTab === 'exterior' ? (
              /* AnimatePresence drives the premium enter/exit per image */
              <div className="grid items-center justify-items-center w-full" style={{ gridTemplateAreas: '"stage"' }}>
                <AnimatePresence initial={false} custom={direction}>
                  {!imgError ? (
                    <motion.div
                      key={currentView.src}
                      custom={direction}
                      variants={imgVariants}
                      initial="enter"
                      animate="visible"
                      exit="exit"
                      className="flex justify-center items-center w-full"
                      style={{ gridArea: 'stage' }}
                    >
                      <Image
                        src={currentView.src}
                        alt={currentView.alt}
                        width={1200}
                        height={750}
                        className="w-full h-auto object-contain select-none md:scale-105 lg:scale-110"
                        style={{
                          filter:
                            'drop-shadow(0 32px 48px rgba(0,0,0,0.85)) drop-shadow(0 12px 24px rgba(70,130,220,0.25))',
                        }}
                        priority={activeIdx === 0}
                        draggable={false}
                        onError={() => setImgError(true)}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="fallback"
                      custom={direction}
                      variants={imgVariants}
                      initial="enter"
                      animate="visible"
                      exit="exit"
                      className="w-full flex flex-col items-center justify-center gap-4"
                      style={{ gridArea: 'stage', minHeight: 'clamp(160px, 24vw, 320px)' }}
                    >
                      <PlaceholderPlaneSVG size={80} />
                      <p
                        className="font-sans text-center"
                        style={{ color: 'rgba(174,199,247,0.28)', fontSize: '0.68rem' }}
                      >
                        Place /CessnaImageTrans-{activeIdx + 1}.png in /public
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : activeTab === 'storage' ? (
              /* ── Storage cinematic showcase ─ soft crossfade + Ken Burns ───── */
              <div
                className="grid items-center justify-items-center w-full overflow-hidden"
                style={{
                  gridTemplateAreas: '"stage"',
                  borderRadius: '0.75rem',
                }}
              >
                <AnimatePresence initial={false}>
                  <motion.div
                    key={STORAGE_VIEWS[storageIdx].src}
                    variants={storageVariants}
                    initial="enter"
                    animate="visible"
                    exit="exit"
                    className="w-full relative"
                    style={{ gridArea: 'stage' }}
                  >
                    <motion.div
                      animate={{
                        scale: STORAGE_DRIFT[storageIdx].scale,
                        x: STORAGE_DRIFT[storageIdx].x,
                        y: STORAGE_DRIFT[storageIdx].y,
                      }}
                      transition={{ duration: 6, ease: 'easeInOut' }}
                    >
                      <Image
                        src={STORAGE_VIEWS[storageIdx].src}
                        alt={STORAGE_VIEWS[storageIdx].alt}
                        width={1200}
                        height={750}
                        className="w-full h-auto object-cover select-none"
                        style={{
                          borderRadius: '0.75rem',
                          filter:
                            'drop-shadow(0 16px 32px rgba(0,0,0,0.6))',
                        }}
                        draggable={false}
                      />
                    </motion.div>
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <ComingSoonPlaceholder
                  key={activeTab}
                  label={TABS.find((t) => t.id === activeTab)?.label ?? ''}
                />
              </AnimatePresence>
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          CONTROLS — tab bar + animated view label + thumbnail strip
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        className="relative z-10 flex flex-col items-center gap-[14px] pt-5 pb-1"
        onMouseEnter={() => setIsHoveringSelector(true)}
        onMouseLeave={() => setIsHoveringSelector(false)}
      >

        {/* Tab selector with spring-animated pill */}
        <ViewTabs active={activeTab} onChange={handleTabChange} />

        {/* Exterior controls only */}
        {activeTab === 'exterior' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.38, ease: EASE_PREMIUM }}
            className="flex flex-col items-center gap-[12px]"
          >
            {/* Animated view title */}
            <div className="relative h-[14px] flex items-center justify-center">
              <AnimatePresence custom={direction} initial={false}>
                <motion.span
                  key={currentView.label}
                  custom={direction}
                  variants={labelVariants}
                  initial="enter"
                  animate="visible"
                  exit="exit"
                  className="absolute font-sans font-semibold tracking-[0.28em] uppercase whitespace-nowrap"
                  style={{ fontSize: '0.5rem', color: A_MID }}
                >
                  {currentView.label}
                </motion.span>
              </AnimatePresence>
            </div>

            {/* Thumbnail strip */}
            <div
              className="flex items-start gap-[10px] sm:gap-[14px] px-1"
              role="group"
              aria-label="Exterior walkaround views"
            >
              {EXTERIOR_VIEWS.map((view, i) => (
                <Thumbnail
                  key={view.src}
                  view={view}
                  isActive={i === activeIdx}
                  onClick={() => switchView(i)}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Storage controls */}
        {activeTab === 'storage' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.38, ease: EASE_PREMIUM }}
            className="flex flex-col items-center gap-[12px]"
          >
            {/* Animated view title */}
            <div className="relative h-[14px] flex items-center justify-center">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={STORAGE_VIEWS[storageIdx].label}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_PREMIUM } }}
                  exit={{ opacity: 0, y: -2, transition: { duration: 0.35 } }}
                  className="absolute font-sans font-semibold tracking-[0.28em] uppercase whitespace-nowrap"
                  style={{ fontSize: '0.5rem', color: A_MID }}
                >
                  {STORAGE_VIEWS[storageIdx].label}
                </motion.span>
              </AnimatePresence>
            </div>

            {/* Thumbnail strip */}
            <div
              className="flex items-start gap-[10px] sm:gap-[14px] px-1"
              role="group"
              aria-label="Storage detail views"
            >
              {STORAGE_VIEWS.map((view, i) => (
                <Thumbnail
                  key={view.src}
                  view={view}
                  isActive={i === storageIdx}
                  onClick={() => {
                    setStorageIdx(i)
                    setLastInteractionTime(Date.now())
                  }}
                  pipId="storage-thumbnail-pip"
                />
              ))}
            </div>

            {/* Subtle progress dots */}
            <div className="flex items-center gap-[6px]">
              {STORAGE_VIEWS.map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    width: i === storageIdx ? 14 : 4,
                    opacity: i === storageIdx ? 1 : 0.3,
                  }}
                  transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                  style={{
                    height: 3,
                    borderRadius: 2,
                    background: A_MID,
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
