'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'

type Step = 'time' | 'documents' | 'review' | 'success'

type Props = {
  firstName?: string
  pilotClearanceStatus: string
  formStep?: Step
  orientation?: 'horizontal' | 'vertical'
  variant?: 'card' | 'embedded'
}

type Milestone = {
  label: string
  t: number
}

type Point = {
  x: number
  y: number
}

function HangarSvg({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 94 70" className={className} aria-hidden="true">
      <path d="M5 26 L47 6 L89 26 V64 H5 Z" fill="rgba(24,38,61,0.86)" stroke="rgba(142,166,201,0.62)" strokeWidth="1.5" />
      <path d="M28 64 V34 H66 V64" fill="rgba(17,27,44,0.92)" stroke="rgba(126,150,188,0.66)" strokeWidth="1.4" />
      <path d="M32 37 H62" stroke="rgba(112,137,176,0.56)" strokeWidth="1" />
      <circle cx="47" cy="16" r="4" fill="none" stroke="rgba(139,160,194,0.62)" strokeWidth="1.2" />
      <path d="M18 64 H76" stroke="rgba(120,147,186,0.55)" strokeWidth="1" />
    </svg>
  )
}

export default function RunwayJourney({
  firstName,
  pilotClearanceStatus,
  formStep,
  orientation = 'horizontal',
  variant = 'card',
}: Props) {
  const [reduceMotion, setReduceMotion] = useState(false)
  const [renderLength, setRenderLength] = useState(0)
  const [planeAngle, setPlaneAngle] = useState(0)
  const [planePoint, setPlanePoint] = useState<Point>({ x: 0, y: 0 })

  const pathRef = useRef<SVGPathElement | null>(null)
  const animRef = useRef<number | null>(null)
  const displayedDistanceRef = useRef(0)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const adminOutcomeLabelByStatus: Record<string, string> = {
    additional_checkout_required: 'Additional checkout required',
    checkout_reschedule_required: 'Checkout reschedule required',
    not_currently_eligible: 'Not currently eligible',
  }
  const hasAltOutcome = Boolean(adminOutcomeLabelByStatus[pilotClearanceStatus])

  const labels = [
    'Account created',
    'Date/time selected',
    'Documents uploaded',
    'Checkout requested',
    ...(hasAltOutcome ? [adminOutcomeLabelByStatus[pilotClearanceStatus]] : []),
    'Ready to fly',
  ]

  const total = labels.length

  let stage = 0
  if (formStep === 'documents' || formStep === 'review' || formStep === 'success') stage = Math.max(stage, 1)
  if (formStep === 'review' || formStep === 'success') stage = Math.max(stage, 2)
  if (formStep === 'success') stage = Math.max(stage, 3)
  if (['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required'].includes(pilotClearanceStatus)) stage = Math.max(stage, 3)
  if (hasAltOutcome) stage = Math.max(stage, 4)
  if (pilotClearanceStatus === 'cleared_to_fly') stage = total - 1
  stage = Math.max(0, Math.min(total - 1, stage))

  const isHorizontal = orientation === 'horizontal'
  const frameClass = variant === 'embedded'
    ? 'w-full'
    : `rounded-2xl bg-[#1a2c45] border border-blue-900/35 shadow-[0_10px_26px_rgba(3,10,25,0.24)] ${isHorizontal ? 'p-6 md:p-7' : 'p-7 md:p-8'}`

  const geometry = useMemo(() => {
    if (isHorizontal) {
      return {
        viewBox: '0 0 1000 240',
        d: 'M 112 46 L 112 118 Q 112 154 150 168 Q 172 176 210 176 L 934 176',
        runwayStroke: 74,
        hangarStyle: { left: '4.8%', top: '9.5%', width: '58px' } as const,
      }
    }

    return {
      viewBox: '0 0 280 980',
      d: 'M 122 72 L 122 184 Q 122 236 94 272 Q 74 296 66 324 L 66 918',
      runwayStroke: 84,
      hangarStyle: { left: '86px', top: '7%', width: '68px', transform: 'translateX(-50%)' } as const,
    }
  }, [isHorizontal])

  const milestones = useMemo<Milestone[]>(() => {
    const startT = 0.2
    const endT = 0.96
    return labels.map((label, i) => ({
      label,
      t: startT + (endT - startT) * (i / Math.max(1, total - 1)),
    }))
  }, [labels, total])

  useEffect(() => {
    const path = pathRef.current
    if (!path) return

    const totalLength = path.getTotalLength()
    const targetDistance = milestones[stage] ? milestones[stage].t * totalLength : 0
    const startDistance = displayedDistanceRef.current
    const duration = reduceMotion ? 0 : 900

    if (animRef.current) {
      cancelAnimationFrame(animRef.current)
      animRef.current = null
    }

    const updateFromDistance = (distance: number) => {
      const current = path.getPointAtLength(distance)
      const next = path.getPointAtLength(Math.min(totalLength, distance + 4))
      const angle = (Math.atan2(next.y - current.y, next.x - current.x) * 180) / Math.PI
      setPlanePoint({ x: current.x, y: current.y })
      setPlaneAngle(angle)
      setRenderLength(distance)
    }

    if (duration === 0) {
      displayedDistanceRef.current = targetDistance
      updateFromDistance(targetDistance)
      return
    }

    const startTime = performance.now()
    const animate = (now: number) => {
      const elapsed = now - startTime
      const p = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const distance = startDistance + (targetDistance - startDistance) * eased
      displayedDistanceRef.current = distance
      updateFromDistance(distance)

      if (p < 1) {
        animRef.current = requestAnimationFrame(animate)
      } else {
        animRef.current = null
      }
    }

    animRef.current = requestAnimationFrame(animate)
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current)
        animRef.current = null
      }
    }
  }, [milestones, reduceMotion, stage])

  return (
    <div className={frameClass}>
      {firstName && (
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-200/70">Progress</p>
          <h2 className="text-base md:text-lg font-semibold text-white mt-1">Welcome, {firstName}</h2>
        </div>
      )}

      <div className={isHorizontal ? 'relative h-[220px] md:h-[240px]' : 'relative h-[410px] sm:h-[440px]'}>
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <svg viewBox={geometry.viewBox} className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id="runway-trail-grad" x1="0" y1="0" x2={isHorizontal ? '1' : '0'} y2={isHorizontal ? '0' : '1'}>
                <stop offset="0%" stopColor="rgba(239,246,255,0.95)" />
                <stop offset="55%" stopColor="rgba(191,219,254,0.85)" />
                <stop offset="100%" stopColor="rgba(96,165,250,0.34)" />
              </linearGradient>
              <filter id="runway-trail-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>

            <path d={geometry.d} stroke="rgba(16,27,44,0.96)" strokeWidth={geometry.runwayStroke} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d={geometry.d} stroke="rgba(174,199,247,0.16)" strokeWidth={geometry.runwayStroke + 2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d={geometry.d} stroke="rgba(219,234,254,0.74)" strokeWidth="2" fill="none" strokeDasharray="16 22" strokeLinecap="round" />

            <path
              d={geometry.d}
              stroke="rgba(147,197,253,0.45)"
              strokeWidth="14"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${renderLength} 99999`}
              filter="url(#runway-trail-glow)"
            />
            <path
              d={geometry.d}
              stroke="url(#runway-trail-grad)"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${renderLength} 99999`}
            />

            <path ref={pathRef} d={geometry.d} stroke="transparent" strokeWidth={1} fill="none" />

            {milestones.map((m, i) => {
              const point = pathRef.current
                ? pathRef.current.getPointAtLength(Math.max(0, Math.min(1, m.t)) * pathRef.current.getTotalLength())
                : { x: 0, y: 0 }
              const done = i < stage
              const current = i === stage
              return (
                <g key={m.label} transform={`translate(${point.x} ${point.y})`}>
                  <circle
                    r="8"
                    className={done ? 'fill-emerald-500 stroke-emerald-300' : current ? 'fill-blue-500 stroke-blue-200' : 'fill-slate-500/80 stroke-slate-300/70'}
                    strokeWidth="1.5"
                  />
                  {current && <circle r="13" fill="rgba(191,219,254,0.32)" />}
                  <foreignObject
                    x={isHorizontal ? -72 : 18}
                    y={isHorizontal ? 16 : -12}
                    width={isHorizontal ? 144 : 180}
                    height={isHorizontal ? 40 : 26}
                  >
                    <p className={`text-[12px] md:text-[13px] whitespace-nowrap ${done ? 'text-emerald-100' : current ? 'text-blue-50 font-semibold' : 'text-slate-300/95'} ${isHorizontal ? 'text-center' : 'text-left'}`}>
                      {m.label}
                    </p>
                  </foreignObject>
                </g>
              )
            })}
          </svg>
        </div>

        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: `${planePoint.x}px`,
            top: `${planePoint.y}px`,
            transform: `translate(-50%, -50%) rotate(${planeAngle}deg)`,
            transition: reduceMotion ? 'none' : 'transform 40ms linear',
          }}
          aria-hidden="true"
        >
          <div className="relative h-[40px] w-[40px]">
            <Image
              src="/checkout-timeline-plane.png"
              alt=""
              fill
              className="object-contain drop-shadow-[0_0_10px_rgba(191,219,254,0.75)]"
              sizes="40px"
              priority={false}
            />
          </div>
        </div>

        <div className="absolute pointer-events-none" style={geometry.hangarStyle as React.CSSProperties}>
          <HangarSvg className="h-auto w-full drop-shadow-[0_4px_10px_rgba(2,6,18,0.45)]" />
        </div>
      </div>
    </div>
  )
}
