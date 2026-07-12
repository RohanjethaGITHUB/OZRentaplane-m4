'use client'

import Link from 'next/link'
import { formatDashboardDate } from '@/lib/formatDateTime'
import { formatSydTime } from '@/lib/utils/sydney-time'
import type { DashboardActionState, DashboardFlightSnapshot } from '@/lib/dashboard/dashboard-action-state'

type Props = {
  state: DashboardActionState
  flightSnapshotBooking?: DashboardFlightSnapshot | null
}

function responsibilityBadge(state: DashboardActionState): { label: string; className: string; icon: string } {
  if (state.phase === 'blocked') {
    return {
      label: 'Account restricted',
      className: 'border-red-200 bg-red-50 text-red-700',
      icon: 'lock',
    }
  }
  if (state.customerActionRequired) {
    return {
      label: 'Action needed from you',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
      icon: 'priority_high',
    }
  }
  if (state.responsibleActor === 'admin') {
    return {
      label: 'Waiting for admin',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
      icon: 'shield_person',
    }
  }
  if (state.responsibleActor === 'instructor') {
    return {
      label: 'Waiting for instructor',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
      icon: 'school',
    }
  }
  return {
    label: 'No action required',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: 'check_circle',
  }
}

function toneStyles(tone: DashboardActionState['tone']) {
  if (tone === 'danger') {
    return {
      border: 'border-red-200',
      background: 'bg-[linear-gradient(180deg,#fff7f7_0%,#ffffff_62%)]',
      accent: 'bg-red-500',
      eyebrow: 'text-red-700',
      heading: 'text-[#521b1b]',
      body: 'text-[#7a3940]',
      button: 'bg-red-600 hover:bg-red-700 text-white',
      secondary: 'border-red-200 text-red-700 hover:bg-red-50',
    }
  }
  if (tone === 'warning') {
    return {
      border: 'border-amber-200',
      background: 'bg-[linear-gradient(180deg,#fff9ef_0%,#ffffff_62%)]',
      accent: 'bg-amber-400',
      eyebrow: 'text-amber-700',
      heading: 'text-[#5a3a08]',
      body: 'text-[#7a5b2f]',
      button: 'bg-amber-500 hover:bg-amber-600 text-white',
      secondary: 'border-amber-200 text-amber-700 hover:bg-amber-50',
    }
  }
  if (tone === 'success') {
    return {
      border: 'border-emerald-200',
      background: 'bg-[linear-gradient(180deg,#f3fff8_0%,#ffffff_62%)]',
      accent: 'bg-emerald-500',
      eyebrow: 'text-emerald-700',
      heading: 'text-[#114131]',
      body: 'text-[#386453]',
      button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      secondary: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
    }
  }
  if (tone === 'info') {
    return {
      border: 'border-blue-200',
      background: 'bg-[linear-gradient(180deg,#f5faff_0%,#ffffff_62%)]',
      accent: 'bg-blue-500',
      eyebrow: 'text-blue-700',
      heading: 'text-[#16396a]',
      body: 'text-[#4b6390]',
      button: 'bg-[#1a4fd6] hover:bg-[#1847be] text-white',
      secondary: 'border-blue-200 text-[#1a4fd6] hover:bg-blue-50',
    }
  }
  return {
    border: 'border-slate-200',
    background: 'bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_62%)]',
    accent: 'bg-slate-400',
    eyebrow: 'text-slate-600',
    heading: 'text-[#152d5a]',
    body: 'text-[#4b6390]',
    button: 'bg-[#152d5a] hover:bg-[#102243] text-white',
    secondary: 'border-slate-200 text-[#152d5a] hover:bg-slate-50',
  }
}

function renderBookingSummary(flightSnapshotBooking: DashboardFlightSnapshot) {
  return (
    <div className="rounded-2xl border border-[#152d5a]/10 bg-white/80 px-4 py-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">Date</p>
          <p className="mt-1 text-sm font-semibold text-[#152d5a]">
            {formatDashboardDate(flightSnapshotBooking.scheduledStart) || '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">Time</p>
          <p className="mt-1 text-sm font-semibold text-[#152d5a]">
            {flightSnapshotBooking.scheduledEnd
              ? `${formatSydTime(flightSnapshotBooking.scheduledStart)} – ${formatSydTime(flightSnapshotBooking.scheduledEnd)}`
              : formatSydTime(flightSnapshotBooking.scheduledStart)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">Type</p>
          <p className="mt-1 text-sm font-semibold text-[#152d5a]">
            {flightSnapshotBooking.bookingType === 'checkout' ? 'Checkout Flight' : 'Aircraft Booking'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">Aircraft</p>
          <p className="mt-1 text-sm font-semibold text-[#152d5a]">
            {flightSnapshotBooking.aircraftRegistration ? `Cessna 172 (${flightSnapshotBooking.aircraftRegistration})` : 'Cessna 172'}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function DashboardNextActionPanel({ state, flightSnapshotBooking }: Props) {
  const badge = responsibilityBadge(state)
  const styles = toneStyles(state.tone)
  const showFlightSummary =
    Boolean(flightSnapshotBooking) &&
    ['upcoming_booking_confirmed', 'checkout_confirmed', 'checkout_requested'].includes(state.statusKey)

  return (
    <section
      className={`relative overflow-hidden rounded-[28px] border px-5 py-5 md:px-7 md:py-6 ${styles.border} ${styles.background}`}
      style={{ boxShadow: '0 10px 44px rgba(2,10,22,0.08)' }}
      aria-labelledby="dashboard-next-step-heading"
    >
      <div className={`absolute inset-y-0 left-0 w-1.5 ${styles.accent}`} aria-hidden="true" />

      <div className="relative flex flex-col gap-5 pl-2 md:pl-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${styles.eyebrow}`}>
              {state.actionEyebrow}
            </p>
            <h2
              id="dashboard-next-step-heading"
              className={`mt-2 text-[28px] font-normal leading-tight md:text-[34px] ${styles.heading}`}
              style={{ fontFamily: 'Newsreader, Georgia, serif' }}
            >
              {state.actionHeading}
            </h2>
          </div>

          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold ${badge.className}`}>
            <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
              {badge.icon}
            </span>
            <span>{badge.label}</span>
          </div>
        </div>

        <div className="max-w-3xl">
          <p className={`text-[14px] leading-relaxed md:text-[15px] ${styles.body}`}>
            {state.actionDescription}
          </p>
          {state.waitingMessage ? (
            <p className="mt-3 text-[13px] font-semibold text-[#152d5a]">
              {state.waitingMessage}
            </p>
          ) : null}
        </div>

        {showFlightSummary && flightSnapshotBooking ? renderBookingSummary(flightSnapshotBooking) : null}

        {(state.primaryAction || state.secondaryAction) ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {state.primaryAction ? (
              <Link
                href={state.primaryAction.href}
                className={`inline-flex min-h-[46px] items-center justify-center rounded-xl px-5 py-3 text-[14px] font-semibold transition-colors ${styles.button}`}
              >
                {state.primaryAction.label}
              </Link>
            ) : null}
            {state.secondaryAction ? (
              <Link
                href={state.secondaryAction.href}
                className={`inline-flex min-h-[46px] items-center justify-center rounded-xl border px-5 py-3 text-[14px] font-semibold transition-colors ${styles.secondary}`}
              >
                {state.secondaryAction.label}
              </Link>
            ) : null}
          </div>
        ) : null}

        {state.nextMilestone ? (
          <div className="rounded-2xl border border-[#152d5a]/10 bg-white/70 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              What Happens After This
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#4b6390]">{state.nextMilestone}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
