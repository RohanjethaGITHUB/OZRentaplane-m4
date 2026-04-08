'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion'
import CubeGrid from '@/components/CubeGrid'

// ─── Design tokens ────────────────────────────────────────────────────────────
const BASE = '#091421'

// ─── Cubic-bezier easing ──────────────────────────────────────────────────────
const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number]

// ─── Reveal variants ──────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}
const cardReveal = {
  hidden: { opacity: 0, y: 32, scale: 0.984 },
  visible: { opacity: 1, y: 0, scale: 1 },
}
const aircraftReveal = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1 },
}
const chipItem = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
}
const chipStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.42 } },
}

// ─── Metric chip ──────────────────────────────────────────────────────────────
interface ChipProps {
  value: string
  unit: string
  label: string
  align?: 'left' | 'right'
}

function MetricChip({ value, unit, label, align = 'left' }: ChipProps) {
  return (
    <motion.div
      variants={chipItem}
      className="flex flex-col select-none rounded-xl px-4 py-3 gap-1"
      style={{
        background: 'rgba(9,20,33,0.68)',
        border: '1px solid rgba(174,199,247,0.10)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 2px 12px -2px rgba(0,0,0,0.45)',
        textAlign: align === 'right' ? 'right' : 'left',
      }}
    >
      <div
        className={`flex items-baseline gap-1 ${align === 'right' ? 'justify-end' : ''}`}
      >
        <span
          className="font-serif font-normal leading-none"
          style={{ fontSize: '1.1rem', color: '#d9e3f6' }}
        >
          {value}
        </span>
        <span
          className="font-sans font-semibold leading-none"
          style={{ fontSize: '0.62rem', color: '#aec7f7' }}
        >
          {unit}
        </span>
      </div>
      <span
        className="font-sans font-semibold tracking-[0.22em] uppercase leading-none"
        style={{ fontSize: '0.52rem', color: 'rgba(174,199,247,0.45)' }}
      >
        {label}
      </span>
    </motion.div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AircraftSpotlight() {
  const sectionRef = useRef<HTMLElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-25% 0px' })
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  // ── Tilt spring values ────────────────────────────────────────────────────
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const springCfg = { stiffness: 72, damping: 22, mass: 0.85 }
  const rotateX = useSpring(useTransform(rawY, [-1, 1], [3.5, -3.5]), springCfg)
  const rotateY = useSpring(useTransform(rawX, [-1, 1], [-5.0, 5.0]), springCfg)

  // ── Pointer-tracking glow ─────────────────────────────────────────────────
  const glowX = useSpring(useMotionValue(52), { stiffness: 48, damping: 26 })
  const glowY = useSpring(useMotionValue(48), { stiffness: 48, damping: 26 })
  const glowBg = useTransform(
    [glowX, glowY],
    ([x, y]: number[]) =>
      `radial-gradient(ellipse 58% 58% at ${x}% ${y}%, rgba(174,199,247,0.075) 0%, transparent 68%)`
  )

  // ── Pointer handlers ──────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isTouch || !cardRef.current) return
      const r = cardRef.current.getBoundingClientRect()
      const nx = Math.min(1, Math.max(-1, (e.clientX - r.left) / r.width * 2 - 1))
      const ny = Math.min(1, Math.max(-1, (e.clientY - r.top) / r.height * 2 - 1))
      rawX.set(nx)
      rawY.set(ny)
      glowX.set(((nx + 1) / 2) * 100)
      glowY.set(((ny + 1) / 2) * 100)
    },
    [isTouch, rawX, rawY, glowX, glowY]
  )

  const handleMouseLeave = useCallback(() => {
    rawX.set(0)
    rawY.set(0)
    glowX.set(52)
    glowY.set(48)
  }, [rawX, rawY, glowX, glowY])

  return (
    <section
      ref={sectionRef}
      className="relative w-full py-28 md:py-36 px-4 sm:px-6 lg:px-8 overflow-hidden"
      style={{ background: BASE }}
    >
      {/* Section-level ambient lift */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 45% at 50% 100%, rgba(174,199,247,0.035) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto">

        {/* ── Heading block ─────────────────────────────────────────────────── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          transition={{ duration: 1.5, ease: EASE_OUT }}
          className="mb-10 md:mb-14"
        >
          <p
            className="font-sans font-semibold tracking-[0.44em] uppercase mb-5"
            style={{ fontSize: '0.58rem', color: 'rgba(174,199,247,0.52)' }}
          >
            Fleet Highlight
          </p>

          <h2
            className="font-serif font-normal leading-[1.04] tracking-tight mb-5"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)', color: '#d9e3f6' }}
          >
            Aircraft Spotlight
          </h2>

          <p
            className="font-sans text-sm leading-relaxed max-w-[360px]"
            style={{ color: '#c4c6cf', opacity: 0.82 }}
          >
            A trusted four-seat aircraft designed for stable handling,
            practical touring range, and a calm flying experience.
          </p>
        </motion.div>

        {/* ── Spotlight card ────────────────────────────────────────────────── */}
        <motion.div
          ref={cardRef}
          variants={cardReveal}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          transition={{ duration: 1.8, delay: 0.15, ease: EASE_OUT }}
          style={{
            rotateX: isTouch ? 0 : rotateX,
            rotateY: isTouch ? 0 : rotateY,
            transformPerspective: 1100,
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="relative"
        >
          {/* Card shell */}
          <div
            className="relative w-full overflow-hidden rounded-[1.75rem] md:rounded-[2.25rem]"
            style={{
              background: 'linear-gradient(148deg, #0f2040 0%, #091520 42%, #060d1b 100%)',
              border: '1px solid rgba(174,199,247,0.08)',
              boxShadow:
                '0 48px 96px -20px rgba(0,0,0,0.75), inset 0 1px 0 rgba(174,199,247,0.055)',
            }}
          >

            {/* ── BG layer 0: cube grid texture ── */}
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{ opacity: 0.28 }}
            >
              <CubeGrid
                gridSize={11}
                maxAngle={25}
                radius={4}
                faceColor="#0c1e35"
                borderColor="rgba(174,199,247,0.07)"
                gapPercent={3}
                speed={0.012}
              />
            </div>

            {/* ── BG layer 1: pointer-following glow ── */}
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{ background: glowBg }}
            />

            {/* ── BG layer 2: static centred aircraft halo ── */}
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse 68% 52% at 58% 48%, rgba(174,199,247,0.052) 0%, transparent 65%)',
              }}
            />

            {/* ── BG layer 3: edge vignette (contains light, frames card) ── */}
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse 105% 105% at 50% 50%, transparent 48%, rgba(5,12,24,0.65) 100%)',
              }}
            />

            {/* ── BG layer 4: bottom fade for grounding ── */}
            <div
              aria-hidden="true"
              className="absolute bottom-0 left-0 right-0 pointer-events-none"
              style={{
                height: '42%',
                background:
                  'linear-gradient(to top, rgba(5,12,24,0.82) 0%, transparent 100%)',
              }}
            />

            {/* ═══════════════════════════════════════════════════════════════
                Content layout
                Desktop: chips left | aircraft centre-right | chips right
                Mobile:  aircraft top (centred) | 2×2 chip grid bottom
            ═══════════════════════════════════════════════════════════════ */}

            {/* Desktop side-chip columns + aircraft row */}
            <div
              className="relative flex items-stretch"
              style={{ minHeight: 'clamp(360px, 46vw, 560px)' }}
            >

              {/* Left chip column — desktop only */}
              <motion.div
                variants={chipStagger}
                initial="hidden"
                animate={isInView ? 'visible' : 'hidden'}
                className="hidden md:flex flex-col justify-center gap-3 p-8 lg:p-10 z-20 flex-shrink-0"
                style={{ width: 'clamp(160px, 14vw, 200px)' }}
              >
                <MetricChip value="4" unit="Seats" label="Capacity" />
                <MetricChip value="640" unit="NM" label="Range" />
              </motion.div>

              {/* Aircraft — takes remaining space */}
              <div className="flex-1 relative flex items-center justify-center md:justify-center py-10 md:py-8 z-10 overflow-visible">

                {/* Subtle blue halo directly behind the aircraft */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(ellipse 72% 65% at 52% 50%, rgba(90,148,230,0.065) 0%, transparent 62%)',
                  }}
                />

                {/* Reveal wrapper */}
                <motion.div
                  variants={aircraftReveal}
                  initial="hidden"
                  animate={isInView ? 'visible' : 'hidden'}
                  transition={{ duration: 2.2, delay: 0.25, ease: EASE_OUT }}
                  className="w-full max-w-[640px] md:max-w-[88%] relative z-10 mx-auto"
                >
                  {/* Idle float */}
                  <motion.div
                    animate={{ y: [0, -7, 0] }}
                    transition={{
                      duration: 6.5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      repeatType: 'loop',
                    }}
                  >
                    <Image
                      src="/Cessna-fleet.png"
                      alt="Cessna 172 N — OZRentAPlane primary fleet aircraft"
                      width={900}
                      height={560}
                      className="w-full h-auto object-contain select-none"
                      style={{
                        filter:
                          'drop-shadow(0 22px 44px rgba(0,0,0,0.62)) drop-shadow(0 2px 10px rgba(80,140,230,0.10))',
                      }}
                      priority
                      draggable={false}
                    />
                  </motion.div>
                </motion.div>
              </div>

              {/* Right chip column — desktop only */}
              <motion.div
                variants={chipStagger}
                initial="hidden"
                animate={isInView ? 'visible' : 'hidden'}
                className="hidden md:flex flex-col justify-center gap-3 p-8 lg:p-10 z-20 flex-shrink-0"
                style={{ width: 'clamp(160px, 14vw, 200px)' }}
              >
                <MetricChip value="122" unit="KTAS" label="Cruise" align="right" />
                <MetricChip value="Garmin" unit="G1000 NXi" label="Avionics" align="right" />
              </motion.div>

            </div>

            {/* Mobile chip grid — 2×2, inside card below aircraft */}
            <motion.div
              variants={chipStagger}
              initial="hidden"
              animate={isInView ? 'visible' : 'hidden'}
              className="md:hidden grid grid-cols-2 gap-2 px-5 pb-7 relative z-20"
            >
              <MetricChip value="4" unit="Seats" label="Capacity" />
              <MetricChip value="122" unit="KTAS" label="Cruise" />
              <MetricChip value="640" unit="NM" label="Range" />
              <MetricChip value="Garmin" unit="G1000" label="Avionics" />
            </motion.div>

            {/* ── BG layer 5: model label strip at card bottom ── */}
            <div className="relative z-20 px-6 md:px-10 pb-6 md:pb-7 flex items-center gap-4">
              <div
                className="h-px flex-1"
                style={{ background: 'rgba(174,199,247,0.07)' }}
              />
              <span
                className="font-sans font-semibold tracking-[0.30em] uppercase"
                style={{ fontSize: '0.52rem', color: 'rgba(174,199,247,0.28)' }}
              >
                Cessna 172N · Primary Fleet
              </span>
              <div
                className="h-px flex-1"
                style={{ background: 'rgba(174,199,247,0.07)' }}
              />
            </div>

            {/* ── One-time light sweep on reveal ── */}
            {isInView && (
              <motion.div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none z-30"
                initial={{ x: '-110%' }}
                animate={{ x: '210%' }}
                transition={{ duration: 3.5, delay: 0.6, ease: EASE_OUT }}
                style={{
                  background:
                    'linear-gradient(108deg, transparent 22%, rgba(174,199,247,0.065) 50%, transparent 78%)',
                  willChange: 'transform',
                }}
              />
            )}

          </div>{/* /card shell */}
        </motion.div>{/* /spotlight card */}

      </div>
    </section>
  )
}
