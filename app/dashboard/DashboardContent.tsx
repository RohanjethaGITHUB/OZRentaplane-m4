'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { Profile, PilotClearanceStatus, UserDocument, VerificationEvent } from '@/lib/supabase/types'
import { getCheckoutPaymentDisplayState } from '@/lib/checkout-payment-state'
import { formatDateFromISO } from '@/lib/formatDateTime'
import { formatSydTime } from '@/lib/utils/sydney-time'
import { ADMIN_CONTACT_PHONE_DISPLAY, ADMIN_CONTACT_PHONE_TEL } from '@/lib/contact'

// ── Exported types ────────────────────────────────────────────────────────────

export type CheckoutInvoiceData = {
  invoiceId: string
  invoiceStatus?: string | null
  subtotalCents: number
  advanceAppliedCents: number
  totalPaidCents: number
  currentCreditCents: number
  displayAmountDueCents: number
  checkoutOutcome: string | null
  checkoutDurationHours: number | null
  landingSubtotalCents: number
  bankTransferStatus?: string | null
  landingCharges: {
    airportIcao: string
    airportName: string
    landingCount: number
    unitAmountCents: number
    totalAmountCents: number
  }[]
}

export type FlightSnapshotBooking = {
  id: string
  bookingType: 'standard' | 'checkout'
  status: string
  scheduledStart: string
  scheduledEnd: string | null
  aircraftRegistration: string | null
}

export type BookingReadinessSummary = {
  show: boolean
  hasHistoricalClearance: boolean
  docsReady: boolean
  termsAccepted: boolean
  flightRecencyComplete: boolean
  hasAwaitingReview: boolean
  hasMissingOrExpired: boolean
}

export type BlockTimeSummary = {
  totalActiveHoursRemaining: number
  activePurchaseCount: number
  pendingPurchaseCount: number
  earliestExpiry: string | null
  latestPurchase: {
    packageName: string
    hoursPurchased: number
    purchasedAt: string
    status: 'pending' | 'active' | 'exhausted' | 'expired' | 'refunded'
  } | null
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  user: User
  profile: Profile | null
  documents: UserDocument[]
  events: VerificationEvent[]
  isFirstLogin: boolean
  mustChangePassword?: boolean
  passwordUpdated?: boolean
  checkoutBookingId?: string | null
  checkoutInvoice?: CheckoutInvoiceData | null
  activeBooking?: { id: string; status: string } | null
  mainBookingHeroState?: {
    mode: 'post_flight_required' | 'post_flight_under_review' | 'upcoming_confirmed' | 'post_flight_payment_required' | 'post_flight_awaiting_payment_confirmation'
    bookingId: string
  } | null
  flightSnapshotBooking?: FlightSnapshotBooking | null
  bookingReadiness?: BookingReadinessSummary | null
  blockTimeSummary?: BlockTimeSummary | null
  flashNotice?: { kind: 'success'; title: string; message: string; actionLabel?: string; actionUrl?: string } | null
  newlyPurchasedInvoicePdfUrl?: string | null
}

// ── Status config (clearance-level) ──────────────────────────────────────────

type StatusTone = 'amber' | 'blue' | 'violet' | 'slate' | 'green' | 'red'

type StatusConfig = {
  statusPill: string
  statusTone: StatusTone
  primaryCtaLabel: string
  primaryCtaHref: string
}

const STATUS_CONFIG: Record<PilotClearanceStatus, StatusConfig> = {
  checkout_required: {
    statusPill: 'Checkout Required',
    statusTone: 'amber',
    primaryCtaLabel: 'Book Checkout',
    primaryCtaHref: '/dashboard/checkout',
  },
  checkout_requested: {
    statusPill: 'Checkout Requested',
    statusTone: 'blue',
    primaryCtaLabel: 'View Checkout Booking',
    primaryCtaHref: '/dashboard/bookings',
  },
  checkout_confirmed: {
    statusPill: 'Checkout Confirmed',
    statusTone: 'blue',
    primaryCtaLabel: 'View Checkout Booking',
    primaryCtaHref: '/dashboard/bookings',
  },
  checkout_completed_under_review: {
    statusPill: 'Checkout Under Review',
    statusTone: 'amber',
    primaryCtaLabel: 'View Checkout Booking',
    primaryCtaHref: '/dashboard/bookings',
  },
  checkout_payment_required: {
    statusPill: 'Payment Required',
    statusTone: 'amber',
    primaryCtaLabel: 'Complete Payment',
    primaryCtaHref: '/dashboard/bookings',
  },
  additional_checkout_required: {
    statusPill: 'Additional Checkout Required',
    statusTone: 'amber',
    primaryCtaLabel: 'Book Another Checkout',
    primaryCtaHref: '/dashboard/checkout',
  },
  checkout_reschedule_required: {
    statusPill: 'Checkout Reschedule Required',
    statusTone: 'amber',
    primaryCtaLabel: 'Reschedule Checkout',
    primaryCtaHref: '/dashboard/checkout',
  },
  not_currently_eligible: {
    statusPill: 'Not Currently Eligible',
    statusTone: 'red',
    primaryCtaLabel: 'Contact Us',
    primaryCtaHref: '/dashboard/messages',
  },
  cleared_to_fly: {
    statusPill: 'Cleared to Fly',
    statusTone: 'green',
    primaryCtaLabel: 'Book a Flight',
    primaryCtaHref: '/dashboard/bookings/new',
  },
}

// ── Tone helpers ──────────────────────────────────────────────────────────────

function pillClass(tone: StatusTone): string {
  if (tone === 'amber') return 'text-amber-200 border-amber-400/50 bg-amber-500/10'
  if (tone === 'blue') return 'text-blue-200 border-blue-400/40 bg-blue-500/10'
  if (tone === 'violet') return 'text-violet-100 border-violet-300/50 bg-violet-500/10'
  if (tone === 'green') return 'text-emerald-100 border-emerald-300/50 bg-emerald-500/10'
  if (tone === 'red') return 'text-red-100 border-red-300/50 bg-red-500/10'
  return 'text-slate-100 border-slate-300/40 bg-slate-500/10'
}

function toneDotColor(tone: StatusTone): string {
  if (tone === 'amber') return '#fbbf24'
  if (tone === 'red') return '#f87171'
  if (tone === 'green') return '#34d399'
  if (tone === 'violet') return '#a78bfa'
  return '#60a5fa'
}

function toneAccentGradient(tone: StatusTone): string {
  if (tone === 'amber') return 'linear-gradient(90deg, rgba(245,158,11,0.65) 0%, rgba(245,158,11,0.06) 100%)'
  if (tone === 'green') return 'linear-gradient(90deg, rgba(52,211,153,0.65) 0%, rgba(52,211,153,0.06) 100%)'
  if (tone === 'red') return 'linear-gradient(90deg, rgba(248,113,113,0.65) 0%, rgba(248,113,113,0.06) 100%)'
  return 'linear-gradient(90deg, rgba(96,165,250,0.65) 0%, rgba(96,165,250,0.06) 100%)'
}

function toneCtaStyle(tone: StatusTone): React.CSSProperties {
  if (tone === 'amber') return { background: '#f59e0b', color: '#0f1a2a' }
  if (tone === 'green') return { background: '#34d399', color: '#052e16' }
  if (tone === 'red') return { background: '#ef4444', color: '#fff' }
  return { background: '#3b82f6', color: '#fff' }
}

function toneBorder(tone: StatusTone): string {
  if (tone === 'amber') return 'rgba(245,158,11,0.22)'
  if (tone === 'green') return 'rgba(52,211,153,0.22)'
  if (tone === 'red') return 'rgba(248,113,113,0.22)'
  return 'rgba(96,165,250,0.18)'
}

function toneIconBg(tone: StatusTone): React.CSSProperties {
  if (tone === 'amber') return { background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)' }
  if (tone === 'green') return { background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.25)' }
  if (tone === 'red') return { background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.25)' }
  return { background: 'rgba(96,165,250,0.09)', border: '1px solid rgba(96,165,250,0.20)' }
}

// ── Pilot journey strip ─────────────────────────────────────────────────────

type JourneyStep = {
  key: string
  label: string
  icon: string
}

const JOURNEY_STEPS: JourneyStep[] = [
  { key: 'account_created', label: 'Account Created', icon: 'check' },
  { key: 'checkout_requested', label: 'Checkout Requested', icon: 'description' },
  { key: 'checkout_booked', label: 'Checkout Flight Booked', icon: 'calendar_month' },
  { key: 'checkout_result', label: 'Checkout Result', icon: 'verified_user' },
  { key: 'ready_to_fly', label: 'Ready to Fly', icon: 'flag' },
]

function getStepState(
  stepId: string,
  status: PilotClearanceStatus,
): 'completed' | 'current' | 'upcoming' | 'locked' {
  const order = ['account', 'documents', 'checkout', 'approved', 'ready']
  const statusToStep: Record<PilotClearanceStatus, number> = {
    checkout_required: 1,
    checkout_requested: 2,
    checkout_confirmed: 2,
    checkout_completed_under_review: 3,
    checkout_payment_required: 3,
    cleared_to_fly: 5,
    additional_checkout_required: 3,
    checkout_reschedule_required: 3,
    not_currently_eligible: 3,
  }

  const currentIndex = statusToStep[status] ?? 0
  const stepIndex = order.indexOf(stepId)

  if (stepIndex < currentIndex) return 'completed'
  if (stepIndex === currentIndex) return 'current'
  if (stepId === 'ready' && status !== 'cleared_to_fly') return 'locked'
  return 'upcoming'
}

function getJourneyStepIndex(clearanceStatus: PilotClearanceStatus): number {
  if (clearanceStatus === 'checkout_required') return 0
  if (clearanceStatus === 'checkout_requested') return 1
  if (clearanceStatus === 'checkout_confirmed') return 2
  if (clearanceStatus === 'checkout_completed_under_review') return 3
  if (clearanceStatus === 'checkout_payment_required') return 3
  if (clearanceStatus === 'additional_checkout_required') return 3
  if (clearanceStatus === 'checkout_reschedule_required') return 3
  if (clearanceStatus === 'not_currently_eligible') return 0
  return 4
}

function PilotJourneyStrip({ clearanceStatus }: { clearanceStatus: PilotClearanceStatus }) {
  const steps = [
    {
      id: 'account',
      label: 'Account Created',
      sublabel: getStepState('account', clearanceStatus) === 'completed' ? 'Completed' : 'Upcoming',
      icon: 'person',
      state: getStepState('account', clearanceStatus),
    },
    {
      id: 'documents',
      label: 'Documents',
      sublabel:
        getStepState('documents', clearanceStatus) === 'current'
          ? 'In Progress'
          : getStepState('documents', clearanceStatus) === 'completed'
            ? 'Completed'
            : 'Upcoming',
      icon: 'description',
      state: getStepState('documents', clearanceStatus),
    },
    {
      id: 'checkout',
      label: 'Checkout',
      sublabel:
        getStepState('checkout', clearanceStatus) === 'current'
          ? 'Required'
          : getStepState('checkout', clearanceStatus) === 'completed'
            ? 'Completed'
            : 'Upcoming',
      icon: 'flight_takeoff',
      state: getStepState('checkout', clearanceStatus),
    },
    {
      id: 'approved',
      label: 'Approved',
      sublabel:
        getStepState('approved', clearanceStatus) === 'current'
          ? 'Pending'
          : getStepState('approved', clearanceStatus) === 'completed'
            ? 'Completed'
            : 'Upcoming',
      icon: 'verified',
      state: getStepState('approved', clearanceStatus),
    },
    {
      id: 'ready',
      label: 'Ready to Fly',
      sublabel: getStepState('ready', clearanceStatus) === 'completed' ? 'Unlocked' : 'Locked',
      icon: 'local_airport',
      state: getStepState('ready', clearanceStatus),
    },
  ] as const

  return (
    <section className="relative bg-[#eef4ff] border border-[#dbeafe] rounded-2xl p-6 md:p-8" style={{ boxShadow: '0 4px 40px rgba(2,10,22,0.08)' }}>
      <div className="flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
        <div className="flex flex-col gap-1 md:min-w-[160px]">
          <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#1a4fd6]">
            PILOT JOURNEY
          </div>
          <div className="text-[22px] font-semibold leading-snug text-[#152d5a]" style={{ fontFamily: 'Newsreader, Georgia, serif' }}>
            Your path to<br />flying solo
          </div>
        </div>

        <div className="flex items-start flex-1 overflow-x-auto scrollbar-none">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div
                  className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    step.state === 'completed'
                      ? 'bg-[#1a4fd6] text-white'
                      : step.state === 'current'
                        ? 'bg-white border-2 border-[#f59e0b] text-[#f59e0b]'
                        : step.state === 'upcoming'
                          ? 'bg-[#f0f6ff] border border-[#152d5a]/15 text-[#94a3b8]'
                          : 'bg-[#f0f6ff] border border-[#152d5a]/10 text-[#c4c6ce]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px] md:text-[16px]">{step.icon}</span>
                </div>
                <div className="text-center">
                  <div
                    className={`hidden md:block text-[11px] font-semibold leading-tight ${
                      step.state === 'completed' || step.state === 'current' ? 'text-[#152d5a]' : 'text-[#94a3b8]'
                    }`}
                  >
                    {step.label}
                  </div>
                  <div
                    className={`hidden text-[10px] leading-tight mt-0.5 ${
                      step.state === 'current' ? 'text-[#f59e0b] font-medium' : 'text-[#94a3b8]'
                    }`}
                  >
                    {step.sublabel}
                  </div>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`h-[2px] w-4 md:w-8 flex-shrink-0 mt-4 mx-1 rounded-full ${step.state === 'completed' ? 'bg-[#1a4fd6]' : 'bg-[#e2e8f0]'}`} />
              )}
            </div>
          ))}
          {/* Control tower — end of runway */}
          <div className="hidden md:block flex-shrink-0 flex items-center pl-0 ml-1">
            <img
              src="/CustomerDashboard/CustomerDashboard-tower.png"
              alt=""
              aria-hidden="true"
              className="w-auto object-contain"
              style={{
                height: '80px',
                filter: 'invert(45%) sepia(60%) saturate(300%) hue-rotate(190deg) brightness(1.1) opacity(0.45)',
              }}
            />
          </div>
        </div>
        {/* Mobile scroll hint — fade right edge */}
        <div className="md:hidden absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#eef4ff] to-transparent pointer-events-none" />
      </div>
    </section>
  )
}

// ── Recent activity strip ────────────────────────────────────────────────────

function formatActivityTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function getActivityChip(event: VerificationEvent): { label: string; tone: string; icon: string } {
  if (event.event_type === 'message') return { label: 'Message', tone: 'text-blue-700 bg-blue-50 border-blue-200', icon: 'chat_bubble' }
  if (event.event_type === 'on_hold') return { label: 'Action needed', tone: 'text-amber-700 bg-amber-50 border-amber-200', icon: 'schedule' }
  if (event.event_type === 'approved') return { label: 'Approved', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: 'check_circle' }
  if (event.event_type === 'rejected') return { label: 'Rejected', tone: 'text-rose-700 bg-rose-50 border-rose-200', icon: 'cancel' }
  if (event.event_type === 'resubmitted') return { label: 'Resubmitted', tone: 'text-violet-700 bg-violet-50 border-violet-200', icon: 'refresh' }
  return { label: 'Update', tone: 'text-slate-700 bg-slate-50 border-slate-200', icon: 'notifications' }
}

function RecentActivityStrip({ events }: { events: VerificationEvent[] }) {
  const visibleEvents = events.slice(0, 4)

  return (
    <section className="rounded-2xl border border-[#152d5a]/10 bg-white p-5 md:p-6" style={{ boxShadow: '0 4px 40px rgba(2,10,22,0.08)' }}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#4b6390]">Recent Activity</p>
          <p className="mt-1 text-sm text-[#4b6390]">Latest updates from your pilot file and booking history.</p>
        </div>
      </div>

      {visibleEvents.length > 0 ? (
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-3">
            {visibleEvents.map((event) => {
              const chip = getActivityChip(event)
              return (
                <article key={event.id} className="min-w-[260px] rounded-2xl border border-[#152d5a]/10 bg-[#f8fbff] p-4 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${chip.tone}`}>
                      <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {chip.icon}
                      </span>
                      {chip.label}
                    </div>
                    <span className="text-[11px] text-[#64748b]">{formatActivityTimestamp(event.created_at)}</span>
                  </div>
                  <h3 className="mt-3 text-[15px] font-semibold text-[#152d5a]">{event.title}</h3>
                  {event.body ? <p className="mt-1.5 text-sm leading-relaxed text-[#4b6390]">{event.body}</p> : null}
                </article>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[#152d5a]/15 bg-[#f8fafc] p-5 text-sm text-[#4b6390]">
          No recent activity yet. Updates will appear here as your pilot file changes.
        </div>
      )}
    </section>
  )
}

// ── Hero status line ──────────────────────────────────────────────────────────

function getHeroStatusLine(
  clearanceStatus: PilotClearanceStatus,
  isAwaitingManualPayment: boolean,
  mainBookingHeroState: Props['mainBookingHeroState'],
): string {
  if (clearanceStatus === 'cleared_to_fly' && mainBookingHeroState) {
    if (mainBookingHeroState.mode === 'post_flight_awaiting_payment_confirmation')
      return 'Your bank transfer proof has been submitted. The admin team will review and confirm your payment.'
    if (mainBookingHeroState.mode === 'post_flight_payment_required')
      return 'Your post-flight invoice is ready. Please complete payment to close this booking.'
    if (mainBookingHeroState.mode === 'post_flight_required')
      return 'Your flight is complete. Please submit your post-flight records.'
    if (mainBookingHeroState.mode === 'post_flight_under_review')
      return 'Your records are submitted. Our team is finalising the booking.'
    return 'Your flight is booked and ready.'
  }
  if (clearanceStatus === 'cleared_to_fly') return "All systems ready. You're good to fly."
  if (isAwaitingManualPayment) return 'Your payment proof has been submitted and is awaiting confirmation.'
  if (clearanceStatus === 'checkout_required') return 'Your checkout flight is the next step before solo hire.'
  if (clearanceStatus === 'checkout_requested') return 'Your checkout has been submitted and is under review.'
  if (clearanceStatus === 'checkout_confirmed') return "Your checkout has been confirmed. We'll see you on the day."
  if (clearanceStatus === 'checkout_completed_under_review') return 'Your checkout is complete. Our team is reviewing the result.'
  if (clearanceStatus === 'checkout_payment_required') return 'Your checkout invoice is ready and payment is required to continue.'
  if (clearanceStatus === 'additional_checkout_required') return 'An additional checkout session is required before solo hire.'
  if (clearanceStatus === 'checkout_reschedule_required') return 'Your checkout requires a new booking slot to continue.'
  if (clearanceStatus === 'not_currently_eligible') return 'Further training is required before solo hire can continue.'
  return 'Your next adventure is ready when you are.'
}

// ── Next action config ────────────────────────────────────────────────────────

type NextActionConfig = {
  icon: string
  iconColor: string
  tone: StatusTone
  title: string
  body: string
  ctaLabel: string
  ctaHref: string
  secondaryLink?: { label: string; href: string }
}

function getNextActionConfig(
  isNoShowLocked: boolean,
  clearanceStatus: PilotClearanceStatus,
  isAwaitingManualPayment: boolean,
  mainBookingHeroState: Props['mainBookingHeroState'],
  mainCtaLabel: string,
  mainCtaHref: string,
  checkoutBookingId: string | null,
  flightSnapshotBooking: FlightSnapshotBooking | null,
): NextActionConfig {
  if (isNoShowLocked) {
    return {
      icon: 'lock',
      iconColor: '#f87171',
      tone: 'red',
      title: 'Account locked after no-show',
      body: 'Your checkout flight was marked as a no-show. Please contact the OZ Rent A Plane team to discuss your checkout status and unlock your account.',
      ctaLabel: 'Contact Team',
      ctaHref: '/dashboard/messages',
      secondaryLink: { label: `Call ${ADMIN_CONTACT_PHONE_DISPLAY}`, href: `tel:${ADMIN_CONTACT_PHONE_TEL}` },
    }
  }

  // ── cleared_to_fly overrides ──
  if (clearanceStatus === 'cleared_to_fly') {
    if (mainBookingHeroState?.mode === 'post_flight_awaiting_payment_confirmation') {
      return {
        icon: 'account_balance',
        iconColor: '#60a5fa',
        tone: 'blue',
        title: 'Awaiting payment confirmation',
        body: "Your bank transfer proof has been submitted. We'll confirm it once it has been reviewed.",
        ctaLabel: 'View booking details',
        ctaHref: mainCtaHref,
      }
    }
    if (mainBookingHeroState?.mode === 'post_flight_payment_required') {
      return {
        icon: 'payments',
        iconColor: '#f59e0b',
        tone: 'amber',
        title: 'Payment Required',
        body: 'Your post-flight invoice is ready. Please complete payment to unlock aircraft bookings.',
        ctaLabel: 'View payment',
        ctaHref: mainCtaHref,
        secondaryLink: { label: 'View Booking Details', href: `/dashboard/bookings/${mainBookingHeroState.bookingId}` },
      }
    }
    if (mainBookingHeroState?.mode === 'post_flight_required') {
      return {
        icon: 'assignment',
        iconColor: '#f59e0b',
        tone: 'amber',
        title: 'Submit Post-Flight Records',
        body: 'Your flight is complete. Submit your VDO and tacho readings so our team can finalise the booking.',
        ctaLabel: mainCtaLabel,
        ctaHref: mainCtaHref,
        secondaryLink: { label: 'View Booking Details', href: `/dashboard/bookings/${mainBookingHeroState.bookingId}` },
      }
    }
    if (mainBookingHeroState?.mode === 'post_flight_under_review') {
      return {
        icon: 'rate_review',
        iconColor: '#60a5fa',
        tone: 'blue',
        title: 'Post-flight records under review',
        body: "Thanks — your post-flight details have been submitted. Our team will review them and finalise the booking.",
        ctaLabel: mainCtaLabel,
        ctaHref: mainCtaHref,
        secondaryLink: { label: 'View My Bookings', href: '/dashboard/bookings' },
      }
    }
    if (mainBookingHeroState?.mode === 'upcoming_confirmed') {
      return {
        icon: 'flight',
        iconColor: '#60a5fa',
        tone: 'blue',
        title: 'Get ready for your flight',
        body: 'Your aircraft booking is confirmed. Review the details before arrival and contact the team if anything changes.',
        ctaLabel: mainCtaLabel,
        ctaHref: mainCtaHref,
        secondaryLink: { label: 'View Booking Details', href: `/dashboard/bookings/${mainBookingHeroState.bookingId}` },
      }
    }
    return {
      icon: 'flight_takeoff',
      iconColor: '#f59e0b',
      tone: 'amber',
      title: 'Book Your Next Flight',
      body: "You're cleared to fly. Browse available times and book your next rental flight.",
      ctaLabel: 'Book a Flight',
      ctaHref: '/dashboard/bookings/new',
      secondaryLink: { label: 'View My Bookings', href: '/dashboard/bookings' },
    }
  }

  // ── awaiting manual payment ──
  if (isAwaitingManualPayment) {
    return {
      icon: 'account_balance',
      iconColor: '#60a5fa',
      tone: 'blue',
      title: 'Awaiting confirmation',
      body: 'Your payment proof has been submitted. Our team will review it and update your status once confirmed.',
      ctaLabel: 'View Details',
      ctaHref: checkoutBookingId ? `/dashboard/bookings/${checkoutBookingId}` : '/dashboard/bookings',
    }
  }

  // ── checkout flow states ──
  const checkoutBookingHref = flightSnapshotBooking?.bookingType === 'checkout'
    ? `/dashboard/bookings/${flightSnapshotBooking.id}`
    : checkoutBookingId
    ? `/dashboard/bookings/${checkoutBookingId}`
    : '/dashboard/bookings'

  if (clearanceStatus === 'checkout_required') {
    return {
      icon: 'how_to_reg',
      iconColor: '#f59e0b',
      tone: 'amber',
      title: 'Complete Your Checkout',
      body: 'A one-time checkout flight is required before you can hire an aircraft solo.',
      ctaLabel: 'Book a Flight',
      ctaHref: '/dashboard/bookings',
      secondaryLink: { label: 'View Requirements', href: '/checkout-process' },
    }
  }
  if (clearanceStatus === 'checkout_requested') {
    return {
      icon: 'pending_actions',
      iconColor: '#60a5fa',
      tone: 'blue',
      title: 'Checkout Request Submitted',
      body: 'Our team is reviewing your request and will confirm your checkout time shortly.',
      ctaLabel: 'View Status',
      ctaHref: checkoutBookingHref,
    }
  }
  if (clearanceStatus === 'checkout_confirmed') {
    return {
      icon: 'event_available',
      iconColor: '#60a5fa',
      tone: 'blue',
      title: 'Checkout Flight Confirmed',
      body: "Your checkout flight is confirmed. We'll see you on the day - no further action needed.",
      ctaLabel: 'View Booking',
      ctaHref: checkoutBookingHref,
    }
  }
  if (clearanceStatus === 'checkout_completed_under_review') {
    return {
      icon: 'rate_review',
      iconColor: '#f59e0b',
      tone: 'amber',
      title: 'Awaiting Checkout Outcome',
      body: 'Your checkout flight is under review by our flight operations team.',
      ctaLabel: 'View Details',
      ctaHref: checkoutBookingHref,
    }
  }
  if (clearanceStatus === 'checkout_payment_required') {
    return {
      icon: 'payments',
      iconColor: '#f59e0b',
      tone: 'amber',
      title: 'Complete Payment',
      body: 'Your checkout flight is complete. Please pay your invoice to unlock aircraft bookings.',
      ctaLabel: 'Complete Payment',
      ctaHref: checkoutBookingId ? `/dashboard/bookings/${checkoutBookingId}` : '/dashboard/bookings',
    }
  }
  if (clearanceStatus === 'additional_checkout_required') {
    return {
      icon: 'schedule',
      iconColor: '#f59e0b',
      tone: 'amber',
      title: 'Book your additional checkout',
      body: 'An additional checkout session is required before solo hire can be approved. Select another checkout date and time.',
      ctaLabel: 'Book Another Checkout',
      ctaHref: '/dashboard/checkout',
    }
  }
  if (clearanceStatus === 'checkout_reschedule_required') {
    return {
      icon: 'event_repeat',
      iconColor: '#f59e0b',
      tone: 'amber',
      title: 'Reschedule your checkout',
      body: 'Your checkout requires a new booking slot before assessment can continue. Book a new date and time when you are ready.',
      ctaLabel: 'Reschedule Checkout',
      ctaHref: '/dashboard/checkout',
    }
  }
  if (clearanceStatus === 'not_currently_eligible') {
    return {
      icon: 'info',
      iconColor: '#94a3b8',
      tone: 'slate',
      title: 'Coordinate next training steps',
      body: 'Speak with our team to understand the required training before your next assessment.',
      ctaLabel: 'Contact Us',
      ctaHref: '/dashboard/messages',
    }
  }
  return {
    icon: 'flight_takeoff',
    iconColor: '#60a5fa',
    tone: 'blue',
    title: 'Continue your journey',
    body: 'Check your current status and follow the next steps to progress through the pilot portal.',
    ctaLabel: mainCtaLabel,
    ctaHref: mainCtaHref,
  }
}

// ── Snapshot status display ───────────────────────────────────────────────────

function getSnapshotStatusDisplay(status: string, bookingType: string): { label: string; textColor: string; dotColor: string } {
  if (bookingType === 'checkout') {
    if (status === 'checkout_requested') return { label: 'Awaiting Review', textColor: 'text-blue-300', dotColor: '#60a5fa' }
    if (status === 'checkout_confirmed') return { label: 'Confirmed', textColor: 'text-emerald-300', dotColor: '#34d399' }
    if (status === 'checkout_completed_under_review') return { label: 'Awaiting Outcome', textColor: 'text-amber-300', dotColor: '#fbbf24' }
    if (status === 'checkout_payment_required') return { label: 'Payment Required', textColor: 'text-orange-300', dotColor: '#fb923c' }
    return { label: 'Checkout Flight', textColor: 'text-blue-300', dotColor: '#60a5fa' }
  }
  if (['confirmed', 'ready_for_dispatch', 'dispatched'].includes(status)) return { label: 'Confirmed', textColor: 'text-emerald-300', dotColor: '#34d399' }
  if (['awaiting_flight_record', 'flight_record_overdue'].includes(status)) return { label: 'Awaiting Record', textColor: 'text-amber-300', dotColor: '#fbbf24' }
  if (['pending_post_flight_review', 'needs_clarification'].includes(status)) return { label: 'Under Review', textColor: 'text-purple-300', dotColor: '#c084fc' }
  if (status === 'post_flight_approved') return { label: 'Flight Approved', textColor: 'text-emerald-300', dotColor: '#34d399' }
  return { label: status.replace(/_/g, ' '), textColor: 'text-slate-300', dotColor: '#94a3b8' }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SnapshotRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#152d5a]/10 last:border-0">
      <span
        className="material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5"
        style={{ color: 'rgba(75,99,144,0.75)', fontVariationSettings: "'wght' 300" }}
      >
        {icon}
      </span>
      <span className="text-[11px] uppercase tracking-[0.08em] text-[#64748b] w-24 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-[13px] text-[#152d5a] font-medium leading-snug">{children}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardContent({
  user,
  profile,
  documents,
  events,
  isFirstLogin: _isFirstLogin,
  mustChangePassword = false,
  passwordUpdated = false,
  checkoutBookingId,
  checkoutInvoice,
  activeBooking,
  mainBookingHeroState,
  flightSnapshotBooking,
  bookingReadiness,
  blockTimeSummary,
  flashNotice,
  newlyPurchasedInvoicePdfUrl,
}: Props) {
  const router = useRouter()
  const [toastVisible, setToastVisible] = useState(Boolean(flashNotice) || passwordUpdated)
  const openedInvoiceUrlRef = useRef<string | null>(null)
  const toastNotice =
    flashNotice ??
    (passwordUpdated
      ? {
          kind: 'success' as const,
          title: 'Password updated successfully',
          message: 'Welcome to OZ Rent A Plane.',
          actionLabel: undefined,
          actionUrl: undefined,
        }
      : null)

  useEffect(() => {
    if (!toastNotice) return
    setToastVisible(true)
    const hideTimer = window.setTimeout(() => setToastVisible(false), 4200)
    const stripTimer = window.setTimeout(() => {
      window.history.replaceState({}, '', '/dashboard')
    }, 1200)
    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(stripTimer)
    }
  }, [toastNotice])

  // Automatically open the invoice PDF in a new tab upon successful purchase
  useEffect(() => {
    if (
      newlyPurchasedInvoicePdfUrl &&
      openedInvoiceUrlRef.current !== newlyPurchasedInvoicePdfUrl
    ) {
      openedInvoiceUrlRef.current = newlyPurchasedInvoicePdfUrl
      try {
        window.open(newlyPurchasedInvoicePdfUrl, '_blank')
      } catch (err) {
        console.error("Popup blocker prevented automatic PDF launch:", err)
      }
    }
  }, [newlyPurchasedInvoicePdfUrl])

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const firstNameFromProfile = (profile?.first_name ?? '').trim()
  const firstName = firstNameFromProfile || displayName.split(' ')[0] || ''

  const clearanceStatus = (profile?.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus
  const isNoShowLocked =
    profile?.account_status === 'blocked' &&
    profile?.account_lock_reason === 'checkout_no_show'
  const checkoutPaymentDisplayState =
    clearanceStatus === 'checkout_payment_required'
      ? getCheckoutPaymentDisplayState(
          checkoutInvoice ? { status: checkoutInvoice.invoiceStatus ?? 'payment_required' } : null,
          checkoutInvoice?.bankTransferStatus ? { status: checkoutInvoice.bankTransferStatus } : null,
        )
      : null

  const isAwaitingManualPayment = checkoutPaymentDisplayState === 'awaiting_manual_payment_confirmation'

  // Status pill override when awaiting manual payment
  const statusConfig: StatusConfig = isAwaitingManualPayment
    ? { ...STATUS_CONFIG.checkout_payment_required, statusPill: 'Awaiting Payment Confirmation', statusTone: 'violet' }
    : STATUS_CONFIG[clearanceStatus]

  // Status pill / CTA overrides for cleared_to_fly booking states
  const effectiveStatusPill =
    clearanceStatus === 'cleared_to_fly' && mainBookingHeroState
      ? mainBookingHeroState.mode === 'post_flight_awaiting_payment_confirmation' ? 'Awaiting Payment Confirmation'
        : mainBookingHeroState.mode === 'post_flight_payment_required' ? 'Payment Required'
        : mainBookingHeroState.mode === 'post_flight_required' ? 'Post-Flight Records Due'
        : mainBookingHeroState.mode === 'post_flight_under_review' ? 'Records Submitted'
        : 'Booking Confirmed'
      : statusConfig.statusPill

  const effectiveTone: StatusTone =
    clearanceStatus === 'cleared_to_fly' && mainBookingHeroState
      ? mainBookingHeroState.mode === 'post_flight_awaiting_payment_confirmation' ? 'blue'
        : mainBookingHeroState.mode === 'post_flight_payment_required' ? 'amber'
        : mainBookingHeroState.mode === 'post_flight_required' ? 'amber'
        : mainBookingHeroState.mode === 'post_flight_under_review' ? 'blue'
        : 'blue'
      : statusConfig.statusTone

  const hasActiveBooking = Boolean(
    activeBooking && !['completed', 'cancelled', 'no_show'].includes(activeBooking.status),
  )

  // Main CTA
  const mainCtaHref =
    isNoShowLocked
      ? '/dashboard/messages'
      :
    clearanceStatus === 'checkout_payment_required' && checkoutBookingId
      ? `/dashboard/bookings/${checkoutBookingId}`
      : clearanceStatus === 'cleared_to_fly' && mainBookingHeroState
      ? `/dashboard/bookings/${mainBookingHeroState.bookingId}`
      : clearanceStatus === 'cleared_to_fly' && hasActiveBooking && activeBooking
      ? `/dashboard/bookings/${activeBooking.id}`
      : statusConfig.primaryCtaHref

  const mainCtaLabel =
    isNoShowLocked
      ? 'Contact Team'
      :
    clearanceStatus === 'cleared_to_fly' && mainBookingHeroState?.mode === 'post_flight_awaiting_payment_confirmation'
      ? 'View Booking Details'
      : clearanceStatus === 'cleared_to_fly' && mainBookingHeroState?.mode === 'post_flight_payment_required'
      ? 'Pay Invoice'
      : clearanceStatus === 'cleared_to_fly' && mainBookingHeroState?.mode === 'post_flight_required'
      ? 'Submit Post-Flight Records'
      : clearanceStatus === 'cleared_to_fly' && mainBookingHeroState?.mode === 'post_flight_under_review'
      ? 'View Booking'
      : clearanceStatus === 'cleared_to_fly' && mainBookingHeroState?.mode === 'upcoming_confirmed'
      ? 'View Booking'
      : clearanceStatus === 'cleared_to_fly' && hasActiveBooking
      ? 'View Booking'
      : statusConfig.primaryCtaLabel

  const heroStatusLine = getHeroStatusLine(clearanceStatus, isAwaitingManualPayment, mainBookingHeroState)

  const heroSecondaryCta = mainBookingHeroState
    ? { label: 'View My Booking', href: `/dashboard/bookings/${mainBookingHeroState.bookingId}` }
    : flightSnapshotBooking
    ? { label: 'View My Booking', href: `/dashboard/bookings/${flightSnapshotBooking.id}` }
    : { label: 'View My Bookings', href: '/dashboard/bookings' }

  const nextAction = getNextActionConfig(
    isNoShowLocked,
    clearanceStatus,
    isAwaitingManualPayment,
    mainBookingHeroState,
    mainCtaLabel,
    mainCtaHref,
    checkoutBookingId ?? null,
    flightSnapshotBooking ?? null,
  )

  // ── Snapshot status ──
  const snapshotStatus = (() => {
    if (!flightSnapshotBooking) return null
    if (mainBookingHeroState?.mode === 'post_flight_awaiting_payment_confirmation') {
      return { label: 'Awaiting Payment Confirmation', textColor: 'text-blue-300', dotColor: '#60a5fa' }
    }
    if (mainBookingHeroState?.mode === 'post_flight_payment_required') {
      return { label: 'Payment Required', textColor: 'text-orange-300', dotColor: '#fb923c' }
    }
    return getSnapshotStatusDisplay(flightSnapshotBooking.status, flightSnapshotBooking.bookingType)
  })()

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {toastVisible && toastNotice ? (
        <div className="fixed right-4 top-[76px] z-[120] w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-emerald-400/30 bg-white/95 p-4 shadow-[0_24px_80px_rgba(2,10,22,0.12)] backdrop-blur-xl md:right-6 md:top-[84px]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#152d5a]">{toastNotice.title}</p>
              <p className="mt-1 text-sm text-[#4b6390]">{toastNotice.message}</p>
              {toastNotice.actionUrl && toastNotice.actionLabel && (
                <div className="mt-2.5">
                  <a
                    href={toastNotice.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#1a4fd6] hover:text-[#153eb2] hover:underline"
                  >
                    <span className="material-symbols-outlined text-[15px]">download</span>
                    {toastNotice.actionLabel}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {mustChangePassword && !passwordUpdated ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>Your account is using a temporary password. Please update it when you get a chance.</p>
            <Link href="/change-password" className="font-semibold text-amber-900 hover:text-amber-950">
              Update now →
            </Link>
          </div>
        </section>
      ) : null}

      {isNoShowLocked && (
        <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 md:p-5">
          <p className="text-base md:text-lg font-semibold text-rose-100 text-center">
            Your account is currently locked because you were marked as a no-show for your checkout flight.
          </p>
          <p className="mt-2 text-sm md:text-base text-rose-100/90 text-center">
            Please contact OZ Rent A Plane to discuss your checkout status and unlock your account.
          </p>
          <p className="mt-2 text-sm md:text-base text-[#152d5a] text-center">
            Call:{' '}
            <a href={`tel:${ADMIN_CONTACT_PHONE_TEL}`} className="underline underline-offset-2">
              {ADMIN_CONTACT_PHONE_DISPLAY}
            </a>
          </p>
        </section>
      )}

      {/* ─── SECTION 1: HERO CARD ────────────────────────────────────────────── */}
      <section
        data-hero="dashboard"
        className="relative overflow-hidden -mt-6"
        style={{
          minHeight: '380px',
          marginLeft: 'calc(-50vw + 50%)',
          marginRight: 'calc(-50vw + 50%)',
          width: '100vw',
          backgroundImage: 'url(/CustomerDashboard/CustomerDashboard-hero.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center right',
          boxShadow: '0 8px 64px rgba(2,10,22,0.18)',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, rgba(8,20,50,0.82) 0%, rgba(8,20,50,0.65) 45%, rgba(8,20,50,0.15) 100%)',
          }}
        />

        <div className="relative z-10 max-w-[1440px] mx-auto px-3 md:px-4 lg:px-6 py-12 md:py-16">
          <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#f59e0b] mb-3 font-sans">
            DASHBOARD
          </div>
          <h1
            className="text-5xl md:text-6xl font-bold text-white leading-tight mb-4"
            style={{ fontFamily: 'Newsreader, Georgia, serif' }}
          >
            Welcome back,<br />
            Captain {firstName}
          </h1>
          <div className="mb-3">
            <div
              className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full border text-[13px] font-semibold"
              style={{
                background: 'rgba(245,158,11,0.15)',
                borderColor: 'rgba(245,158,11,0.35)',
                color: '#f59e0b',
              }}
            >
              <span className="material-symbols-outlined text-[14px]">flight_takeoff</span>
              {effectiveStatusPill}
            </div>
          </div>
          <p className="text-[15px] text-white/80 leading-relaxed mb-6 max-w-md">
            {clearanceStatus === 'checkout_required'
              ? "You're almost ready for solo hire. Complete your checkout to access and book your aircraft."
              : heroStatusLine}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => router.push(mainCtaHref)}
              className="bg-[#f59e0b] hover:bg-[#e08c00] text-white font-semibold rounded-xl px-6 py-3 flex items-center gap-2 transition-colors"
            >
              <span
                className="material-symbols-outlined text-[15px] leading-none"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                flight_takeoff
              </span>
              {mainCtaLabel}
            </button>
            <button
              onClick={() => router.push(heroSecondaryCta.href)}
              className="bg-transparent border border-white/40 hover:border-white text-white font-medium rounded-xl px-5 py-3 flex items-center gap-2 transition-colors"
            >
              <span className="material-symbols-outlined text-[15px] leading-none">calendar_month</span>
              {heroSecondaryCta.label}
            </button>
          </div>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, rgba(13,27,62,0.3))' }}
        />
      </section>

      {/* ─── SECTION 2: PILOT JOURNEY CARD ───────────────────────────────────── */}
      <PilotJourneyStrip clearanceStatus={clearanceStatus} />

      {/* ─── SECTION 2.5: BLOCK TIME BALANCE BANNER ──────────────────────────── */}
      {blockTimeSummary && (
        <section
          className="bg-white border border-[#152d5a]/10 rounded-2xl p-6 md:p-8 transition-all hover:shadow-[0_8px_30px_rgba(2,10,22,0.06)]"
          style={{ boxShadow: '0 4px 40px rgba(2,10,22,0.08)' }}
        >
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#1a4fd6] font-sans">
                BLOCK TIME BALANCE
              </p>
              <h2
                className="text-[32px] md:text-[38px] font-normal leading-tight text-[#152d5a] mt-2"
                style={{ fontFamily: 'Newsreader, Georgia, serif' }}
              >
                {blockTimeSummary.totalActiveHoursRemaining.toFixed(0)} hours remaining
              </h2>
              <p className="text-[14px] text-[#4b6390] mt-1.5 font-sans">
                You have {blockTimeSummary.totalActiveHoursRemaining.toFixed(1)} hours available across{' '}
                <span className="font-semibold text-[#152d5a]">
                  {blockTimeSummary.activePurchaseCount} active{' '}
                  {blockTimeSummary.activePurchaseCount === 1 ? 'package' : 'packages'}
                </span>
                .
              </p>
            </div>

            {/* Badges and Buy More CTA */}
            <div className="flex flex-wrap items-center gap-2 md:mt-2 font-sans">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {blockTimeSummary.activePurchaseCount} active
              </span>

              {blockTimeSummary.earliestExpiry && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-[#4b6390] bg-[#f8fafc] border border-[#152d5a]/10 shadow-sm">
                  <span className="material-symbols-outlined text-[13px]">event</span>
                  Earliest expiry {formatDateFromISO(blockTimeSummary.earliestExpiry)}
                </span>
              )}

              <Link
                href="/dashboard/checkout"
                className="inline-flex items-center gap-1 text-[12px] font-bold text-[#1a4fd6] hover:text-[#153eb2] px-3.5 py-1.5 bg-[#f0f6ff] hover:bg-[#e0eeff] rounded-full border border-[#1a4fd6]/10 transition-colors ml-1"
              >
                Buy More
                <span className="material-symbols-outlined text-[14px]">add</span>
              </Link>
            </div>
          </div>

          {/* Inner Card: Latest Purchase details */}
          {blockTimeSummary.latestPurchase && (
            <div className="mt-6 border border-[#e2e8f0]/80 rounded-xl p-4 bg-[#f8fbff]/70 hover:bg-[#f8fbff] transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="font-sans">
                <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#1a4fd6]">
                  LATEST PURCHASE
                </p>
                <h3 className="text-[17px] font-semibold text-[#152d5a] mt-1">
                  {blockTimeSummary.latestPurchase.packageName}
                </h3>
                <p className="text-[12px] text-[#4b6390] mt-0.5">
                  {blockTimeSummary.latestPurchase.hoursPurchased} hours bought on{' '}
                  {formatDateFromISO(blockTimeSummary.latestPurchase.purchasedAt)}.
                </p>
              </div>

              {/* Status Box */}
              <div className="border border-[#e2e8f0] rounded-xl p-3 bg-white text-center min-w-[120px] shadow-sm flex flex-col items-center justify-center font-sans">
                <p className="text-[9px] font-semibold tracking-[0.14em] uppercase text-[#64748b]">
                  STATUS
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      blockTimeSummary.latestPurchase.status === 'active'
                        ? 'bg-emerald-500'
                        : blockTimeSummary.latestPurchase.status === 'pending'
                        ? 'bg-amber-400'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span className="text-[13px] font-bold text-[#152d5a] capitalize">
                    {blockTimeSummary.latestPurchase.status}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ─── SECTION 3: NEXT ACTION + UPCOMING BOOKING + DOCUMENT READINESS ─── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* ── Next Action Card ── */}
        <div
          className="bg-white border border-[#152d5a]/10 rounded-2xl p-5 flex flex-col relative overflow-hidden min-h-[280px]"
          style={{
            position: 'relative',
            boxShadow: '0 4px 40px rgba(2,10,22,0.08)',
          }}
        >
          <div className="absolute top-0 inset-x-0 z-20 h-[3px]" style={{ background: toneAccentGradient(nextAction.tone) }} />

          {/* Top row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">send</span>
              <span className="text-[16px] font-semibold text-[#4b6390]">Next Action</span>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-[#f59e0b] text-[#f59e0b] flex items-center gap-1">
              ★ PRIORITY
            </span>
          </div>

          {/* Checklist illustration — always visible, absolute top-right */}
          <div className="hidden md:block absolute top-20 right-3 pointer-events-none select-none">
            <div className="bg-white rounded-xl p-1">
              <img
                src="/CustomerDashboard/CustomerDashboard-checklist.png"
                alt=""
                aria-hidden="true"
                className="w-32 h-36 object-contain"
              />
            </div>
          </div>

          {(() => {
            // Determine if docs need uploading first
            const hasAllDocs =
              documents &&
              documents.filter((d) => d.status === 'approved' || d.status === 'uploaded').length >= 3
            const showDocumentAction = !hasAllDocs && clearanceStatus === 'checkout_required'

            return showDocumentAction ? (
              <>
                <h2
                  className="text-[32px] font-normal text-[#152d5a] leading-tight mb-3 pr-0 md:pr-36"
                  style={{ fontFamily: 'Newsreader, Georgia, serif' }}
                >
                  Upload Your Documents
                </h2>
                <p className="text-[13px] text-[#4b6390] leading-relaxed mb-4 pr-0 md:pr-32">
                  Before booking your checkout flight, upload your pilot licence, medical certificate, and photo ID.
                </p>
                <div className="mt-auto pt-4">
                  <Link
                    href="/dashboard/documents"
                    className="w-full flex items-center justify-center gap-2 bg-[#f59e0b] hover:bg-[#e08c00] text-white font-semibold rounded-xl py-3.5 px-4 transition-colors text-[14px]"
                  >
                    <span className="material-symbols-outlined text-[16px]">upload_file</span>
                    Upload Documents Now
                  </Link>
                </div>
              </>
            ) : (
              <>
                {/* Status-driven action content */}
                <div className="relative z-10">
                  <h2
                    className="text-[32px] font-normal text-[#152d5a] leading-tight mb-3 pr-0 md:pr-36"
                    style={{ fontFamily: 'Newsreader, Georgia, serif' }}
                  >
                    {nextAction.title}
                  </h2>
                </div>

                <p className="text-[13px] text-[#4b6390] leading-relaxed mb-4 pr-0 md:pr-32">
                  {nextAction.body}
                </p>

                <div className="mt-auto pt-4">
                  <Link
                    href={nextAction.ctaHref}
                    className="w-full flex items-center justify-center gap-2 bg-[#f59e0b] hover:bg-[#e08c00] text-white font-semibold rounded-xl py-3.5 px-4 transition-colors text-[14px]"
                  >
                    <span className="material-symbols-outlined text-[16px]">{nextAction.icon}</span>
                    {nextAction.ctaLabel}
                  </Link>
                </div>
              </>
            )
          })()}
        </div>

        {/* ── Upcoming Booking Card ── */}
        <div
          className="relative rounded-2xl overflow-hidden bg-white border border-[#152d5a]/10"
          style={{
            boxShadow: '0 4px 40px rgba(2,10,22,0.08)',
            minHeight: '320px',
          }}
        >
          <div className="absolute top-0 inset-x-0 z-20 h-[3px]" style={{ background: 'linear-gradient(90deg, rgba(96,165,250,0.55) 0%, rgba(96,165,250,0.04) 100%)' }} />

          <div className="relative z-20 p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">calendar_month</span>
              <span className="text-[16px] font-semibold text-[#4b6390]">Upcoming Booking</span>
            </div>

            {flightSnapshotBooking ? (
              /* ── Populated state ── */
              <div className="relative flex flex-col gap-3 flex-1">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                  <img
                    src="/CustomerDashboard/CustomerDashboard-plane.png"
                    alt=""
                    aria-hidden="true"
                    style={{ width: '320px', height: 'auto', opacity: 0.18 }}
                    className="object-contain"
                  />
                </div>
                <div className="relative z-10 mb-6">
                  <SnapshotRow icon="calendar_month" label="Booking Date">
                    {formatDateFromISO(flightSnapshotBooking.scheduledStart) || '—'}
                  </SnapshotRow>
                  {flightSnapshotBooking.scheduledEnd && (
                    <SnapshotRow icon="schedule" label="Time">
                      {formatSydTime(flightSnapshotBooking.scheduledStart)} – {formatSydTime(flightSnapshotBooking.scheduledEnd)}
                    </SnapshotRow>
                  )}
                  <SnapshotRow icon="flight" label="Aircraft">
                    {flightSnapshotBooking.aircraftRegistration
                      ? `Cessna 172 (${flightSnapshotBooking.aircraftRegistration})`
                      : 'Cessna 172'}
                  </SnapshotRow>
                  <SnapshotRow icon="label" label="Type">
                    {flightSnapshotBooking.bookingType === 'checkout' ? 'Checkout Flight' : 'Aircraft Booking'}
                  </SnapshotRow>
                  <SnapshotRow icon="verified" label="Status">
                    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${snapshotStatus?.textColor ?? 'text-slate-300'}`}>
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: snapshotStatus?.dotColor ?? '#94a3b8' }}
                      />
                      {snapshotStatus?.label ?? '—'}
                    </span>
                  </SnapshotRow>
                </div>
                <button
                  onClick={() => router.push(`/dashboard/bookings/${flightSnapshotBooking.id}`)}
                  className="relative z-10 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View Booking Details
                  <span className="material-symbols-outlined text-[14px] leading-none">arrow_forward</span>
                </button>
              </div>
            ) : clearanceStatus === 'cleared_to_fly' ? (
              /* ── Cleared, no booking ── */
              <div>
                <div className="relative flex justify-center items-center" style={{ height: '180px' }}>
                  {/* Circle backdrop — centred, lower half of the space */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: '160px',
                      height: '160px',
                      bottom: '0px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(219,234,254,0.55)',
                    }}
                  />
                  {/* Plane — larger, sits across the circle */}
                  <img
                    src="/CustomerDashboard/CustomerDashboard-plane.png"
                    alt=""
                    aria-hidden="true"
                    className="relative z-10 object-contain"
                    style={{ width: '240px', height: 'auto', position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)' }}
                  />
                </div>
                <p className="text-[20px] font-semibold text-[#152d5a] text-center mb-2">No upcoming bookings</p>
                <p className="text-[12px] text-[#4b6390] text-center leading-relaxed mt-2 mb-5">
                  You&apos;re cleared to fly, but you don&apos;t have an active booking yet. Book your next flight to see the details here.
                </p>
                {/* Check if there's an active booking */}
                {activeBooking || flightSnapshotBooking ? (
                  <div className="flex justify-center">
                    <Link
                      href={`/dashboard/bookings/${checkoutBookingId ?? (activeBooking as { id: string } | null)?.id ?? (flightSnapshotBooking as { id: string } | null)?.id}`}
                      className="border border-[#1a4fd6] text-[#1a4fd6] rounded-xl py-2.5 px-6 text-[13px] font-semibold hover:bg-[#f0f6ff] transition-colors"
                    >
                      View Booking
                    </Link>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <Link
                      href="/dashboard/bookings/new"
                      className="border border-[#1a4fd6] text-[#1a4fd6] rounded-xl py-2.5 px-6 text-[13px] font-semibold hover:bg-[#f0f6ff] transition-colors"
                    >
                      Make a Booking
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              /* ── Not cleared, no checkout booked ── */
              <div>
                <div className="relative flex justify-center items-center" style={{ height: '180px' }}>
                  {/* Circle backdrop — centred, lower half of the space */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: '160px',
                      height: '160px',
                      bottom: '0px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(219,234,254,0.55)',
                    }}
                  />
                  {/* Plane — larger, sits across the circle */}
                  <img
                    src="/CustomerDashboard/CustomerDashboard-plane.png"
                    alt=""
                    aria-hidden="true"
                    className="relative z-10 object-contain"
                    style={{ width: '240px', height: 'auto', position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)' }}
                  />
                </div>
                <p className="text-[20px] font-semibold text-[#152d5a] text-center mb-2">
                  {clearanceStatus === 'checkout_required' ? 'No checkout booked' : 'No upcoming flight'}
                </p>
                <p className="text-[12px] text-[#4b6390] text-center leading-relaxed mt-2 mb-5">
                  {clearanceStatus === 'checkout_required'
                    ? 'Once you schedule your checkout flight, your booking details and status will appear here.'
                    : 'Your booking details will appear here once available.'}
                </p>
                {activeBooking || flightSnapshotBooking ? (
                  <div className="flex justify-center">
                    <Link
                      href={`/dashboard/bookings/${checkoutBookingId ?? (activeBooking as { id: string } | null)?.id ?? (flightSnapshotBooking as { id: string } | null)?.id}`}
                      className="border border-[#1a4fd6] text-[#1a4fd6] rounded-xl py-2.5 px-6 text-[13px] font-semibold hover:bg-[#f0f6ff] transition-colors"
                    >
                      View Booking
                    </Link>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <Link
                      href="/dashboard/bookings/new"
                      className="border border-[#1a4fd6] text-[#1a4fd6] rounded-xl py-2.5 px-6 text-[13px] font-semibold hover:bg-[#f0f6ff] transition-colors"
                    >
                      Make a Booking
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Document Readiness Card ── */}
        <div
          className="bg-white border border-[#152d5a]/10 rounded-2xl p-5 flex flex-col"
          style={{
            boxShadow: '0 4px 40px rgba(2,10,22,0.08)',
          }}
	        >
	          {(() => {
	            // Build latest-per-type map (mirrors DocumentsPanelV2 logic)
	            const docMap = (() => {
	              const map: Record<string, (typeof documents)[number]> = {}
	              for (const doc of (documents ?? [])) {
	                const existing = map[doc.document_type]
	                if (!existing || new Date(doc.updated_at) > new Date(existing.updated_at)) {
	                  map[doc.document_type] = doc
	                }
	              }
	              return map
	            })()

	            // Core 3 required docs (matches DocumentsPanelV2 DOC_TYPES)
	            const CORE_DOC_TYPES = ['pilot_licence', 'medical_certificate', 'photo_id'] as const

	            // Count docs that are uploaded (not missing/rejected) — mirrors allDocsUploaded logic
	            const approvedCount = CORE_DOC_TYPES.filter((key) => {
	              const doc = docMap[key]
	              if (!doc) return false
	              if (doc.status === 'rejected') return false
	              return true
	            }).length

	            // Night VFR is separate/optional
	            const nightVfrDoc = docMap['night_vfr_evidence']
	            const nightVfrState = !nightVfrDoc ? 'missing' : nightVfrDoc.status === 'rejected' ? 'rejected' : 'uploaded'
	            return (
	              <>
	                <div className="flex items-center gap-2 mb-4">
	                  <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">description</span>
	                  <span className="text-[16px] font-semibold text-[#4b6390]">Document Readiness</span>
                </div>

                <div className="flex items-start gap-4 mb-5">
                  <div className="flex-shrink-0">
                    <svg viewBox="0 0 100 100" className="w-28 h-28 flex-shrink-0">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="14"/>
	                      <circle
	                        cx="50" cy="50" r="40"
	                        fill="none"
	                        stroke="#1a4fd6"
	                        strokeWidth="14"
	                        strokeLinecap="round"
	                        strokeDasharray={`${(approvedCount / 3) * 251.2} 251.2`}
	                        transform="rotate(-90 50 50)"
	                      />
	                      <text x="50" y="46" textAnchor="middle" fontWeight="800" fontSize="18" fill="#152d5a">{Math.round((approvedCount / 3) * 100)}%</text>
	                      <text x="50" y="62" textAnchor="middle" fontSize="12" fill="#4b6390">Ready</text>
	                    </svg>
	                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <p className="text-[12px] text-[#4b6390] leading-relaxed">
                      {approvedCount === 0
                        ? 'Upload your pilot documents to get checkout ready.'
	                        : approvedCount < 3
	                          ? "You're making progress. Complete the remaining documents."
	                          : 'All documents uploaded. Awaiting admin verification.'}
	                    </p>
	                  </div>
	                </div>

	                <div className="space-y-3 mb-4">
	                  {[
	                    { label: 'Pilot Licence', key: 'pilot_licence' },
	                    { label: 'Medical Certificate', key: 'medical_certificate' },
	                  ].map((doc) => {
	                    const found = docMap[doc.key]
	                    const isOk = found && found.status !== 'rejected'
	                    const isPending = found && found.status !== 'approved' && found.status !== 'rejected'
	                    return (
	                      <div key={doc.key} className="flex items-center gap-2">
	                        <span className={`material-symbols-outlined text-[15px] flex-shrink-0 ${
	                          isOk && !isPending ? 'text-green-500' :
	                          isPending ? 'text-amber-500' :
	                          'text-slate-300'
	                        }`}>
	                          {isOk && !isPending ? 'check_circle' : isPending ? 'pending' : 'radio_button_unchecked'}
	                        </span>
	                        <span className="text-[11px] text-[#4b6390] flex-1">{doc.label}</span>
	                        <span className={`text-[10px] font-medium ${
	                          isOk && !isPending ? 'text-green-600' :
	                          isPending ? 'text-amber-600' :
	                          'text-slate-400'
	                        }`}>
	                          {isOk && !isPending ? 'Approved' : isPending ? 'Awaiting Approval' : 'Not Submitted'}
	                        </span>
	                      </div>
	                    )
	                  })}
	                  <div className="flex items-center gap-2">
	                    <span className={`material-symbols-outlined text-[15px] flex-shrink-0 ${
	                      nightVfrState === 'uploaded' ? 'text-green-500' :
	                      nightVfrState === 'missing' ? 'text-slate-300' :
	                      'text-red-400'
	                    }`}>
	                      {nightVfrState === 'uploaded' ? 'check_circle' :
	                       nightVfrState === 'missing' ? 'radio_button_unchecked' :
	                       'cancel'}
	                    </span>
	                    <span className="text-[11px] text-[#4b6390] flex-1">Night VFR Endorsement</span>
	                    <span className={`text-[10px] font-medium ${
	                      nightVfrState === 'uploaded' ? 'text-green-600' :
	                      nightVfrState === 'missing' ? 'text-slate-400' :
	                      'text-red-500'
	                    }`}>
	                      {nightVfrState === 'uploaded' ? 'Submitted' :
	                       nightVfrState === 'missing' ? 'Not Submitted' :
	                       'Rejected'}
	                    </span>
	                  </div>
	                </div>

                <Link href="/dashboard/documents" className="flex items-center gap-1 text-[15px] font-semibold text-[#1a4fd6] hover:underline mt-auto">
                  Go to Documents
                  <span className="material-symbols-outlined text-[15px]">chevron_right</span>
                </Link>
              </>
            )
          })()}
        </div>

      </div>

      <div className="bg-white border border-[#152d5a]/10 rounded-2xl px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#1a4fd6]">show_chart</span>
            <span className="text-[15px] font-semibold text-[#152d5a]">Recent Activity</span>
          </div>
          <Link href="/dashboard/bookings" className="text-[12px] text-[#1a4fd6] hover:underline font-medium">
            View All Activity →
          </Link>
        </div>

        <div className="flex flex-col md:flex-row items-stretch gap-2 md:gap-0">
          {(events && events.length > 0 ? events.slice(0, 3) : [
            { label: 'Account created', time: 'Today', icon: 'person', color: 'blue' },
            { label: 'Complete your documents', time: 'Action required', icon: 'description', color: 'amber' },
          ]).map((item: any, i: number, arr: any[]) => {
            const isEvent = 'event_type' in item
            const label = isEvent ? (item.title ?? item.event_type ?? 'Activity update') : item.label
            const time = isEvent
              ? (item.created_at ? new Date(item.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'Recently')
              : item.time
            const isPositive = isEvent
              ? (item.event_type?.includes('approved') || item.event_type?.includes('verified'))
              : item.color === 'blue'

            return (
              <div key={i} className="flex items-center flex-1">
                <div className="flex items-center gap-3 bg-[#f0f6ff] border border-[#152d5a]/08 rounded-xl px-4 py-3 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isPositive ? 'bg-green-100' : 'bg-amber-50'}`}>
                    <span className={`material-symbols-outlined text-[15px] ${isPositive ? 'text-green-600' : 'text-[#f59e0b]'}`}>
                      {isEvent ? (isPositive ? 'check_circle' : 'schedule') : (item.icon ?? 'info')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-[#152d5a] truncate">{label}</div>
                    <div className="text-[11px] text-[#4b6390]">{time}</div>
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <div className="hidden md:flex items-center justify-center w-8 flex-shrink-0">
                    <span className="text-[#94a3b8] text-[18px]">→</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
