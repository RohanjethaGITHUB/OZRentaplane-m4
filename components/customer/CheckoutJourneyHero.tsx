'use client'

import { useEffect, useMemo, useState } from 'react'

type JourneyKey =
  | 'account_created'
  | 'checkout_time_booked'
  | 'documents_uploaded'
  | 'submitted_for_review'
  | 'checkout_complete'
  | 'ready_to_fly'

type Props = {
  firstName: string
  activeIndex: number
  completedMap: Record<JourneyKey, boolean>
}

const STEPS: { key: JourneyKey; label: string; short: string; icon: string }[] = [
  { key: 'account_created', label: 'Account created', short: 'Account', icon: 'check_circle' },
  { key: 'checkout_time_booked', label: 'Checkout time booked', short: 'Booked', icon: 'calendar_month' },
  { key: 'documents_uploaded', label: 'Documents uploaded', short: 'Documents', icon: 'folder' },
  { key: 'submitted_for_review', label: 'Submitted for review', short: 'Review', icon: 'fact_check' },
  { key: 'checkout_complete', label: 'Checkout complete', short: 'Complete', icon: 'run_circle' },
  { key: 'ready_to_fly', label: 'Ready to fly', short: 'Ready', icon: 'flight_takeoff' },
]

export default function CheckoutJourneyHero({ firstName, activeIndex, completedMap }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const currentIndex = Math.max(0, Math.min(STEPS.length - 1, activeIndex))
  const completedCount = useMemo(() => STEPS.filter((s) => completedMap[s.key]).length, [completedMap])
  const progressPercent = (currentIndex / (STEPS.length - 1)) * 100

  return (
    <section className="overflow-hidden rounded-3xl border border-blue-900/40 bg-[linear-gradient(120deg,#071426_0%,#0b1b33_48%,#122a48_100%)] text-slate-100 shadow-[0_18px_48px_rgba(3,10,25,0.35)]">
      <div className="relative p-5 md:p-8">
        <div className="pointer-events-none absolute inset-0 opacity-45">
          <div className="absolute -left-20 top-8 h-52 w-52 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
        </div>

        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.2em] text-blue-200/80">Your hangar-to-runway journey</p>
          <h1 className="mt-2 text-2xl font-semibold md:text-4xl">Welcome, {firstName}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">
            Complete your checkout journey to become ready to fly.
          </p>
        </div>

        <div className="relative mt-6 hidden md:block">
          <div className="relative h-40 overflow-visible rounded-2xl border border-white/10 bg-[#091b31]/60 px-8 pt-8 backdrop-blur-[1px]">
            <div className="absolute left-8 right-8 top-[54px] h-8 rounded-full border border-white/15 bg-[#1a2940]">
              <div className="absolute inset-1 rounded-full border border-white/20 border-dashed" />
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400/55 to-blue-400/55"
                style={{
                  width: `${progressPercent}%`,
                  transition: reduceMotion ? 'none' : 'width 650ms ease',
                }}
              />
            </div>

            <div
              className="absolute top-[33px] z-20"
              style={{
                left: `calc(2rem + (${progressPercent}% * (100% - 4rem) / 100))`,
                transform: 'translateX(-50%)',
                transition: reduceMotion ? 'none' : 'left 650ms ease',
              }}
              aria-hidden="true"
            >
              <span className="material-symbols-outlined text-[30px] text-blue-100 drop-shadow-[0_0_10px_rgba(96,165,250,0.7)]">
                flight
              </span>
            </div>

            <div className="relative flex justify-between">
              {STEPS.map((step, index) => {
                const done = completedMap[step.key]
                const current = index === currentIndex
                return (
                  <div key={step.key} className="w-24 text-center">
                    <div
                      className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full border ${
                        done
                          ? 'border-emerald-300/80 bg-emerald-500/25 text-emerald-100'
                          : current
                            ? 'border-blue-300/80 bg-blue-500/25 text-blue-100 shadow-[0_0_14px_rgba(59,130,246,0.5)]'
                            : 'border-slate-400/45 bg-slate-600/25 text-slate-300'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{step.icon}</span>
                    </div>
                    <p className={`mt-3 text-[11px] font-medium ${done ? 'text-emerald-100' : current ? 'text-blue-100' : 'text-slate-300'}`}>
                      {step.label}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 md:hidden">
          <div className="rounded-2xl border border-white/10 bg-[#091b31]/60 p-4">
            <p className="text-sm text-blue-100">{STEPS[currentIndex]?.label}</p>
            <p className="mt-1 text-xs text-slate-300">{completedCount} of 6 steps completed</p>
            <div className="mt-3 h-2 rounded-full bg-slate-700/70">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400/70 to-blue-400/70"
                style={{ width: `${(completedCount / 6) * 100}%` }}
              />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {STEPS.map((step, index) => (
                <span
                  key={step.key}
                  className={`rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap ${
                    index === currentIndex
                      ? 'border-blue-300/70 bg-blue-500/20 text-blue-100'
                      : completedMap[step.key]
                        ? 'border-emerald-300/60 bg-emerald-500/15 text-emerald-100'
                        : 'border-slate-500/60 bg-slate-600/20 text-slate-300'
                  }`}
                >
                  {step.short}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
