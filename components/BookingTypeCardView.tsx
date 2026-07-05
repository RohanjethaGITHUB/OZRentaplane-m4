'use client'

import Link from 'next/link'
import type { BookingTypeCard } from '@/lib/booking-type-cards'

type CardCta =
  | {
      label: string
      href: string
      className?: string
    }
  | {
      label: string
      scrollTargetId: string
      className?: string
    }

type Props = {
  card: BookingTypeCard
  cta?: CardCta
}

export function BookingTypeCardView({ card, cta }: Props) {
  const isPayf = card.title === 'Pay As You Fly (PAYF)'
  const headerClassName = isPayf ? 'bg-[#07224E]' : 'bg-runway-amber'
  const panelClassName = isPayf ? 'bg-[#EEF4FB]' : 'bg-[#FEFCF4]'
  const ctaClassName =
    cta?.className ??
    (isPayf
      ? 'bg-[#1a4fd6] text-white hover:bg-[#153eb2]'
      : 'bg-[#f59e0b] text-[#07224E] hover:bg-[#e08f00]')

  function handleScrollTarget() {
    if (!cta || !('scrollTargetId' in cta)) return
    document.getElementById(cta.scrollTargetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-md">
      <div className={`px-8 pb-16 pt-8 text-center ${headerClassName}`}>
        <p
          className={`text-xs font-bold uppercase tracking-[0.15em] ${
            isPayf ? 'text-runway-amber' : 'text-white'
          }`}
        >
          {card.eyebrow}
        </p>
        <h3 className={`mt-2 font-serif text-3xl font-normal ${isPayf ? 'text-white' : 'text-oz-navy'}`}>
          {card.title}
        </h3>
        <p className={`mt-2 text-sm ${isPayf ? 'text-white/70' : 'text-oz-navy/80'}`}>{card.subtitle}</p>
      </div>

      <div className="relative z-10 mx-6 -mt-10">
        <div className={`rounded-xl border border-[#e2e8f0] p-6 text-center shadow-md ${panelClassName}`}>
          {isPayf ? (
            <>
              <p className="font-serif text-4xl text-oz-navy">$330/hr</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#4a5568]">FIXED RATE</p>
              <p className="mt-2 text-xs text-[#3a4d70]">+ $28.95 landing fee per flight (not included in hourly rate)</p>
            </>
          ) : (
            <>
              <p className="font-serif text-4xl text-oz-navy">From $290/hr</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#c8860a]">
                SAVE UP TO $40/HR VS PAYF
              </p>
              <p className="mt-2 text-xs text-[#3a4d70]">+ $28.95 landing fee per flight (not included in hourly rate)</p>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white px-8 pb-8 pt-6">
        <div className="space-y-3">
          {card.bullets.map((item) => (
            <div key={item} className="flex items-center gap-3">
              <span className="material-symbols-outlined shrink-0 !text-[20px] text-runway-amber" aria-hidden="true">
                check_circle
              </span>
              <span className="text-sm text-[#1e3a5f]">{item}</span>
            </div>
          ))}
        </div>

        {cta ? (
          <div className="mt-6">
            {'href' in cta ? (
              <Link
                href={cta.href}
                className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.12em] transition-colors ${ctaClassName}`}
              >
                {cta.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleScrollTarget}
                className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.12em] transition-colors ${ctaClassName}`}
              >
                {cta.label}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </article>
  )
}
