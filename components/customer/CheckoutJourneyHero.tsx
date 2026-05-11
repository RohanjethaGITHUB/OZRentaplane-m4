'use client'

import { useEffect, useMemo, useState } from 'react'

type Props = {
  firstName: string
  activeIndex: number
  completedMap: Record<string, boolean>
}

const MILESTONES = [
  { key: 'checkout', label: 'Book checkout', x: 9, y: 73 },
  { key: 'documents', label: 'Documents', x: 34, y: 72 },
  { key: 'review', label: 'Review', x: 55, y: 72 },
  { key: 'submitted', label: 'Submitted', x: 76, y: 72 },
  { key: 'ready', label: 'Ready to fly', x: 92, y: 67 },
] as const

// Map 6-step journey state to the 5 visual milestones on Checkout-base image.
const JOURNEY_TO_MILESTONE = [0, 0, 1, 2, 3, 4] as const

export default function CheckoutJourneyHero({ firstName, activeIndex, completedMap }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const clampedJourneyIndex = Math.max(0, Math.min(JOURNEY_TO_MILESTONE.length - 1, activeIndex))
  const milestoneIndex = JOURNEY_TO_MILESTONE[clampedJourneyIndex] ?? 0
  const active = MILESTONES[milestoneIndex] ?? MILESTONES[0]
  const isFinalStage = milestoneIndex === MILESTONES.length - 1 && Boolean(completedMap?.ready_to_fly)
  const transition = reduceMotion ? 'none' : 'left 620ms ease, top 620ms ease, transform 620ms ease, opacity 620ms ease'

  const completedCount = useMemo(() => Object.values(completedMap).filter(Boolean).length, [completedMap])

  return (
    <section className="rounded-2xl bg-[#071426] text-white shadow-[0_14px_32px_rgba(3,10,25,0.34)] overflow-hidden">
      <div className="px-5 pt-5 md:px-7 md:pt-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-blue-200/70">Your hangar-to-runway journey</p>
        <h1 className="text-2xl md:text-3xl font-semibold mt-2">Welcome, {firstName}</h1>
        <p className="text-slate-300 mt-2">Complete your checkout journey to become ready to fly.</p>
      </div>

      <div className="relative mt-4 h-[220px] md:h-[320px]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/Checkout-base.png')", backgroundPosition: 'center bottom' }}
        />

        <div className="absolute inset-0 bg-gradient-to-r from-[#071426]/42 via-[#071426]/14 to-[#071426]/28" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#071426]/72 to-transparent" />

        <div className="absolute inset-0 hidden md:block" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
            <line
              x1={MILESTONES[0].x}
              y1={MILESTONES[0].y}
              x2={active.x}
              y2={active.y}
              stroke="#60A5FA"
              strokeOpacity="0.55"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1={MILESTONES[0].x}
              y1={MILESTONES[0].y}
              x2={active.x}
              y2={active.y}
              stroke="#34D399"
              strokeOpacity="0.24"
              strokeWidth="2.7"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div
          className="absolute z-20 pointer-events-none"
          aria-hidden="true"
          style={{
            left: `${active.x}%`,
            top: `${active.y}%`,
            transition,
            opacity: isFinalStage ? 0.92 : 1,
            transform: isFinalStage
              ? 'translate(-50%, -50%) translate(7px, -10px) rotate(-9deg) scale(0.96)'
              : 'translate(-50%, -50%) rotate(-2deg)',
          }}
        >
          <svg className="w-16 sm:w-20 lg:w-24 h-auto drop-shadow-[0_8px_14px_rgba(3,10,25,0.55)]" viewBox="0 0 96 96" fill="none">
            <path d="M85 44L52 50L35 15L28 17L33 52L17 56L10 49L5 51L9 63L10 68L22 72L24 67L17 60L33 56L53 86L60 84L52 50L87 47L85 44Z" fill="#DDEAFE"/>
            <path d="M36 15L33 52" stroke="#9FB7D8" strokeWidth="2"/>
          </svg>
        </div>

        <div className="absolute inset-0 hidden md:block">
          {MILESTONES.map((m, i) => {
            const done = i < milestoneIndex
            const current = i === milestoneIndex
            return (
              <div key={m.key} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${m.x}%`, top: `${m.y}%` }}>
                <div className={`w-3.5 h-3.5 rounded-full border ${done ? 'bg-emerald-500 border-emerald-300' : current ? 'bg-blue-500 border-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.45)]' : 'bg-slate-500/80 border-slate-300/60'}`} />
                <p className={`mt-2 text-[10px] px-2 py-1 rounded whitespace-nowrap bg-[#071426]/42 backdrop-blur-[1px] ${done ? 'text-emerald-100' : current ? 'text-blue-100' : 'text-slate-200'}`}>
                  {m.label}
                </p>
              </div>
            )
          })}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4 md:hidden bg-gradient-to-t from-[#071426]/85 to-transparent">
          <p className="text-sm text-slate-100">{MILESTONES[milestoneIndex]?.label ?? MILESTONES[0]?.label}</p>
          <p className="text-xs text-slate-300 mt-1">{completedCount} of 6 steps completed</p>
        </div>
      </div>
    </section>
  )
}
