'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Step = 'time' | 'documents' | 'review' | 'success'

type Props = {
  firstName?: string
  pilotClearanceStatus: string
  formStep?: Step
  orientation?: 'horizontal' | 'vertical'
  variant?: 'card' | 'embedded'
}

export default function RunwayJourney({
  firstName,
  pilotClearanceStatus,
  formStep,
  orientation = 'horizontal',
  variant = 'card',
}: Props) {
  const [reduceMotion, setReduceMotion] = useState(false)
  const [travelingFrom, setTravelingFrom] = useState<number | null>(null)
  const [travelingTo, setTravelingTo] = useState<number | null>(null)
  const [isTraveling, setIsTraveling] = useState(false)

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
  const labelsBottomToTop = [
    'Account created',
    'Date/time selected',
    'Documents uploaded',
    'Checkout requested',
    ...(hasAltOutcome ? [adminOutcomeLabelByStatus[pilotClearanceStatus]] : []),
    'Ready to fly',
  ]
  const total = labelsBottomToTop.length

  let stage = 0
  if (formStep === 'documents' || formStep === 'review' || formStep === 'success') stage = Math.max(stage, 1)
  if (formStep === 'review' || formStep === 'success') stage = Math.max(stage, 2)
  if (formStep === 'success') stage = Math.max(stage, 3)
  if (['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required'].includes(pilotClearanceStatus)) stage = Math.max(stage, 3)
  if (hasAltOutcome) stage = Math.max(stage, 4)
  if (pilotClearanceStatus === 'cleared_to_fly') stage = total - 1
  stage = Math.max(0, Math.min(total - 1, stage))

  const transitionMs = 980
  const prevStageRef = useRef(stage)
  useEffect(() => {
    const prev = prevStageRef.current
    if (prev === stage) return
    prevStageRef.current = stage
    if (reduceMotion) return
    setTravelingFrom(prev)
    setTravelingTo(stage)
    setIsTraveling(true)
    const t = window.setTimeout(() => {
      setIsTraveling(false)
      setTravelingFrom(null)
      setTravelingTo(null)
    }, transitionMs + 120)
    return () => window.clearTimeout(t)
  }, [stage, reduceMotion])

  const isHorizontal = orientation === 'horizontal'
  const milestones = useMemo(() => {
    if (isHorizontal) {
      return labelsBottomToTop.map((label, i) => ({
        label,
        x: 8 + (84 * (i / Math.max(1, total - 1))),
      }))
    }
    return labelsBottomToTop.map((label, i) => ({
      label,
      y: 86 - (76 * (i / Math.max(1, total - 1))),
    }))
  }, [labelsBottomToTop, total, isHorizontal])

  const activePos = isHorizontal
    ? (milestones[stage] as { x: number }).x
    : (milestones[stage] as { y: number }).y

  const planeTransform = isHorizontal ? 'translate(-50%, -50%) rotate(-30deg)' : 'translate(-50%, -50%) rotate(-90deg)'
  const frameClass = variant === 'embedded'
    ? 'w-full'
    : `rounded-2xl bg-[#1a2c45] border border-blue-900/35 shadow-[0_10px_26px_rgba(3,10,25,0.24)] ${isHorizontal ? 'p-6 md:p-7' : 'p-7 md:p-8'}`

  return (
    <div className={frameClass}>
      {firstName && (
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-200/70">Progress</p>
          <h2 className="text-base md:text-lg font-semibold text-white mt-1">Welcome, {firstName}</h2>
        </div>
      )}

      {isHorizontal ? (
        <div className={`${variant === 'embedded' ? 'relative h-[220px] md:h-[240px]' : 'relative h-[200px] md:h-[216px]'}`}>
          <div className="absolute left-[4%] right-[4%] top-[50%] h-[72px] -translate-y-1/2 bg-[#101b2c]/90 border-y border-[#aec7f7]/16 shadow-[inset_0_0_18px_rgba(0,0,0,0.6),0_0_28px_rgba(96,165,250,0.12)] rounded-[3px]">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] opacity-70" style={{ background: 'repeating-linear-gradient(to right, #dbeafe 0, #dbeafe 18px, transparent 18px, transparent 36px)' }} />
            <div className="absolute inset-y-0 top-0 left-0 h-[2px] w-full opacity-75" style={{ background: 'repeating-linear-gradient(to right, #93c5fd 0, #93c5fd 5px, transparent 5px, transparent 34px)', filter: 'drop-shadow(0 0 4px #93c5fd)' }} />
            <div className="absolute inset-y-0 bottom-0 left-0 h-[2px] w-full opacity-75" style={{ background: 'repeating-linear-gradient(to right, #93c5fd 0, #93c5fd 5px, transparent 5px, transparent 34px)', filter: 'drop-shadow(0 0 4px #93c5fd)' }} />
          </div>

          {isTraveling && travelingFrom !== null && travelingTo !== null && (
            <div
              className="absolute z-10 pointer-events-none top-1/2 -translate-y-1/2 h-[5px] rounded-full"
              style={{
                left: `${Math.min((milestones[travelingFrom] as { x: number }).x, (milestones[travelingTo] as { x: number }).x)}%`,
                width: `${Math.abs((milestones[travelingFrom] as { x: number }).x - (milestones[travelingTo] as { x: number }).x)}%`,
                background: 'linear-gradient(to right, rgba(96,165,250,0.08), rgba(191,219,254,0.9), rgba(96,165,250,0.08))',
                boxShadow: '0 0 14px rgba(147,197,253,0.75)',
                opacity: 0.85,
              }}
            />
          )}

          <div
            className="absolute z-20 pointer-events-none top-1/2"
            aria-hidden="true"
            style={{
              left: `${activePos}%`,
              transform: planeTransform,
              transition: reduceMotion ? 'none' : `left ${transitionMs}ms ease`,
            }}
          >
            <span className="material-symbols-outlined block leading-none text-[#c8dcff] drop-shadow-[0_0_16px_rgba(174,199,247,0.8)]" style={{ fontSize: '52px', fontVariationSettings: "'FILL' 1" }}>
              flight
            </span>
            {isTraveling && (
              <span className="absolute left-1/2 top-1/2 pointer-events-none" style={{ width: '38px', height: '15px', transform: 'translate(-120%, -50%)', background: 'linear-gradient(to left, rgba(191,219,254,0.6), rgba(96,165,250,0.04))', filter: 'blur(3px)', opacity: 0.75, borderRadius: '999px' }} />
            )}
          </div>

          {milestones.map((m, i) => {
            const done = i < stage
            const current = i === stage
            const p = m as { label: string; x: number }
            return (
              <div key={p.label} className="absolute" style={{ left: `${p.x}%`, top: '50%', transform: 'translate(-50%, -50%)' }}>
                <div className={`w-4 h-4 rounded-full border ${done ? 'bg-emerald-500 border-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : current ? 'bg-blue-500 border-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.56)]' : 'bg-slate-500/65 border-slate-300/55'}`} />
                <p className={`mt-4 text-[13px] md:text-[14px] whitespace-nowrap text-center ${done ? 'text-emerald-100' : current ? 'text-blue-50 font-semibold' : 'text-slate-300/95'}`}>{p.label}</p>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="relative h-[410px] sm:h-[440px]">
          <div className="absolute top-[9%] bottom-[9%] left-[62px] w-[84px] -translate-x-1/2 bg-[#101b2c]/90 border-x border-[#aec7f7]/16 shadow-[inset_0_0_18px_rgba(0,0,0,0.6),0_0_24px_rgba(96,165,250,0.12)] rounded-[3px]">
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] opacity-70" style={{ background: 'repeating-linear-gradient(to bottom, #dbeafe 0, #dbeafe 18px, transparent 18px, transparent 36px)' }} />
            <div className="absolute inset-x-0 left-0 top-0 w-[2px] h-full opacity-75" style={{ background: 'repeating-linear-gradient(to bottom, #93c5fd 0, #93c5fd 5px, transparent 5px, transparent 34px)', filter: 'drop-shadow(0 0 4px #93c5fd)' }} />
            <div className="absolute inset-x-0 right-0 top-0 w-[2px] h-full opacity-75" style={{ background: 'repeating-linear-gradient(to bottom, #93c5fd 0, #93c5fd 5px, transparent 5px, transparent 34px)', filter: 'drop-shadow(0 0 4px #93c5fd)' }} />
          </div>

          {isTraveling && travelingFrom !== null && travelingTo !== null && (
            <div
              className="absolute z-10 pointer-events-none left-[62px] -translate-x-1/2 w-[5px] rounded-full"
              style={{
                top: `${Math.min((milestones[travelingFrom] as { y: number }).y, (milestones[travelingTo] as { y: number }).y)}%`,
                height: `${Math.abs((milestones[travelingFrom] as { y: number }).y - (milestones[travelingTo] as { y: number }).y)}%`,
                background: 'linear-gradient(to bottom, rgba(96,165,250,0.08), rgba(191,219,254,0.9), rgba(96,165,250,0.08))',
                boxShadow: '0 0 14px rgba(147,197,253,0.75)',
                opacity: 0.85,
              }}
            />
          )}

          <div
            className="absolute z-20 pointer-events-none left-[62px]"
            aria-hidden="true"
            style={{
              top: `${activePos}%`,
              transform: planeTransform,
              transition: reduceMotion ? 'none' : `top ${transitionMs}ms ease`,
            }}
          >
            <span className="material-symbols-outlined block leading-none text-[#c8dcff] drop-shadow-[0_0_16px_rgba(174,199,247,0.8)]" style={{ fontSize: '48px', fontVariationSettings: "'FILL' 1" }}>
              flight
            </span>
          </div>

          {milestones.map((m, i) => {
            const done = i < stage
            const current = i === stage
            const p = m as { label: string; y: number }
            return (
              <div key={p.label} className="absolute flex items-center gap-4" style={{ left: '62px', top: `${p.y}%`, transform: 'translateY(-50%)' }}>
                <div className={`w-4 h-4 rounded-full border ${done ? 'bg-emerald-500 border-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : current ? 'bg-blue-500 border-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.56)]' : 'bg-slate-500/65 border-slate-300/55'}`} />
                <p className={`text-[13px] md:text-[14px] whitespace-nowrap ${done ? 'text-emerald-100' : current ? 'text-blue-50 font-semibold' : 'text-slate-300/95'}`}>{p.label}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
