'use client'

import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { Profile, PilotClearanceStatus, UserDocument, VerificationEvent } from '@/lib/supabase/types'
import { getCheckoutPaymentDisplayState } from '@/lib/checkout-payment-state'
import DashboardHeroRunway from '@/components/customer/DashboardHeroRunway'
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
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  user: User
  profile: Profile | null
  documents: UserDocument[]
  events: VerificationEvent[]
  isFirstLogin: boolean
  checkoutBookingId?: string | null
  checkoutInvoice?: CheckoutInvoiceData | null
  activeBooking?: { id: string; status: string } | null
  mainBookingHeroState?: {
    mode: 'post_flight_required' | 'post_flight_under_review' | 'upcoming_confirmed'
    bookingId: string
  } | null
  flightSnapshotBooking?: FlightSnapshotBooking | null
  bookingReadiness?: BookingReadinessSummary | null
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

// ── Hero status line ──────────────────────────────────────────────────────────

function getHeroStatusLine(
  clearanceStatus: PilotClearanceStatus,
  isAwaitingManualPayment: boolean,
  mainBookingHeroState: Props['mainBookingHeroState'],
): string {
  if (clearanceStatus === 'cleared_to_fly' && mainBookingHeroState) {
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
    if (mainBookingHeroState?.mode === 'post_flight_required') {
      return {
        icon: 'assignment',
        iconColor: '#f59e0b',
        tone: 'amber',
        title: 'Submit post-flight records',
        body: 'Your flight is complete. Submit your VDO/tacho readings and landing details so our team can finalise the booking.',
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
      title: 'Book your next flight',
      body: "You're cleared to fly. Browse available windows and submit a new aircraft booking request.",
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
      title: 'Awaiting payment confirmation',
      body: 'Your payment proof has been submitted. Our team will review it and update your status once confirmed.',
      ctaLabel: 'View Payment Details',
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
      title: 'Book your checkout',
      body: 'Your checkout flight is required before you can hire aircraft solo. Choose a suitable date and time to get started.',
      ctaLabel: 'Book Checkout',
      ctaHref: '/dashboard/checkout',
      secondaryLink: { label: 'View Requirements', href: '/checkout-process' },
    }
  }
  if (clearanceStatus === 'checkout_requested') {
    return {
      icon: 'pending_actions',
      iconColor: '#60a5fa',
      tone: 'blue',
      title: 'Checkout under review',
      body: 'Your checkout request has been submitted. Our team is reviewing the booking and will confirm it shortly.',
      ctaLabel: 'View Checkout Booking',
      ctaHref: checkoutBookingHref,
    }
  }
  if (clearanceStatus === 'checkout_confirmed') {
    return {
      icon: 'event_available',
      iconColor: '#60a5fa',
      tone: 'blue',
      title: 'Prepare for your checkout flight',
      body: 'Your checkout has been confirmed. Review the booking details and arrive ready with your required documentation.',
      ctaLabel: 'View Checkout Booking',
      ctaHref: checkoutBookingHref,
      secondaryLink: { label: 'View Booking Details', href: checkoutBookingHref },
    }
  }
  if (clearanceStatus === 'checkout_completed_under_review') {
    return {
      icon: 'rate_review',
      iconColor: '#f59e0b',
      tone: 'amber',
      title: 'Awaiting checkout result',
      body: 'Your checkout is complete and our team is reviewing the result. We will update your status shortly.',
      ctaLabel: 'View Checkout Booking',
      ctaHref: checkoutBookingHref,
    }
  }
  if (clearanceStatus === 'checkout_payment_required') {
    return {
      icon: 'payments',
      iconColor: '#f59e0b',
      tone: 'amber',
      title: 'Complete payment',
      body: 'Your checkout outcome has been processed and payment is now required before you can continue.',
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
    <div className="flex items-start gap-3 py-2.5 border-b border-white/[0.07] last:border-0">
      <span
        className="material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5"
        style={{ color: 'rgba(148,178,218,0.55)', fontVariationSettings: "'wght' 300" }}
      >
        {icon}
      </span>
      <span className="text-[11px] uppercase tracking-[0.08em] text-white/35 w-24 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-[13px] text-white/80 font-medium leading-snug">{children}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardContent({
  user,
  profile,
  documents: _documents,
  events: _events,
  isFirstLogin: _isFirstLogin,
  checkoutBookingId,
  checkoutInvoice,
  activeBooking,
  mainBookingHeroState,
  flightSnapshotBooking,
  bookingReadiness,
}: Props) {
  const router = useRouter()

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
      ? mainBookingHeroState.mode === 'post_flight_required' ? 'Post-Flight Records Due'
        : mainBookingHeroState.mode === 'post_flight_under_review' ? 'Records Submitted'
        : 'Booking Confirmed'
      : statusConfig.statusPill

  const effectiveTone: StatusTone =
    clearanceStatus === 'cleared_to_fly' && mainBookingHeroState
      ? mainBookingHeroState.mode === 'post_flight_required' ? 'amber'
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
    clearanceStatus === 'cleared_to_fly' && mainBookingHeroState?.mode === 'post_flight_required'
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
  const snapshotStatus = flightSnapshotBooking
    ? getSnapshotStatusDisplay(flightSnapshotBooking.status, flightSnapshotBooking.bookingType)
    : null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {isNoShowLocked && (
        <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 md:p-5">
          <p className="text-base md:text-lg font-semibold text-rose-100 text-center">
            Your account is currently locked because you were marked as a no-show for your checkout flight.
          </p>
          <p className="mt-2 text-sm md:text-base text-rose-100/90 text-center">
            Please contact OZ Rent A Plane to discuss your checkout status and unlock your account.
          </p>
          <p className="mt-2 text-sm md:text-base text-white text-center">
            Call:{' '}
            <a href={`tel:${ADMIN_CONTACT_PHONE_TEL}`} className="underline underline-offset-2">
              {ADMIN_CONTACT_PHONE_DISPLAY}
            </a>
          </p>
        </section>
      )}

      {bookingReadiness?.show && (
        <section className="rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 md:p-5">
          <p className="text-base font-semibold text-white">Before your first booking</p>
          <p className="mt-1 text-sm text-blue-100/90">Your checkout is complete. Please finish your pilot file before booking.</p>
          {bookingReadiness.hasHistoricalClearance ? (
            <p className="mt-1 text-xs text-blue-200/80">Checkout source: Historical/manual completion.</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${bookingReadiness.docsReady ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}>
              Documents: {bookingReadiness.docsReady ? 'Complete' : 'Action required'}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${bookingReadiness.termsAccepted ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}>
              Terms: {bookingReadiness.termsAccepted ? 'Accepted current version' : 'Not accepted'}
            </span>
          </div>
          <button
            onClick={() => router.push('/dashboard/bookings/new')}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-blue-500"
          >
            Complete pilot file
          </button>
        </section>
      )}

      {/* ─── SECTION 1: HERO CARD ────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden rounded-[20px] border"
        style={{
          borderColor: 'rgba(80,122,186,0.22)',
          minHeight: 'clamp(340px, 42vh, 470px)',
          boxShadow: '0 8px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(80,122,186,0.06)',
        }}
      >
        {/* Background image */}
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: "url('/CustomerDashboard/dashboard-Hero.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {/* Subtle left-side readability overlay (localized, lighter) */}
        <div className="absolute inset-0 z-10" style={{ background: 'linear-gradient(105deg, rgba(7,16,30,0.34) 0%, rgba(8,18,34,0.22) 38%, rgba(8,18,34,0.08) 65%, rgba(8,18,34,0.00) 100%)' }} />
        {/* Very light top/bottom vignette */}
        <div className="absolute inset-0 z-10" style={{ background: 'linear-gradient(to top, rgba(6,14,28,0.14) 0%, transparent 50%, rgba(6,14,28,0.10) 100%)' }} />

        {/* Content */}
        <div
          className="relative z-20 flex flex-col h-full px-7 py-7 md:px-12 md:py-8"
          style={{ minHeight: 'clamp(340px, 42vh, 470px)' }}
        >
          {/* Top row: status pill */}
          <div className="flex items-center justify-end gap-4">
            {/* Status pill */}
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[10px] font-bold tracking-[0.14em] uppercase backdrop-blur-sm ${pillClass(effectiveTone)}`}
            >
              {effectiveTone === 'green' ? (
                <span
                  className="material-symbols-outlined text-[13px] leading-none"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              ) : (
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: toneDotColor(effectiveTone) }}
                />
              )}
              {effectiveStatusPill}
            </div>
          </div>

          {/* Main hero content — pushed to lower third */}
          <div className="mt-auto">
            {/* "WELCOME BACK," small label */}
            <p className="text-[11px] md:text-[12px] font-bold uppercase tracking-[0.28em] text-white/55 mb-0.5">
              Welcome back,
            </p>
            {/* "Captain Adam" large gold heading */}
            <h1
              className="font-serif leading-[0.95] tracking-[-0.01em] mb-3.5"
              style={{
                fontSize: 'clamp(42px, 6.5vw, 78px)',
                color: '#e8b84b',
                textShadow: '0 2px 24px rgba(232,184,75,0.22)',
              }}
            >
              Captain {firstName || 'Pilot'}
            </h1>
            <p className="text-[15px] text-white/60 leading-relaxed mb-2.5 max-w-lg">
              Your next adventure is ready when you are.
            </p>
            {/* Dynamic status line — keep green dot for success/ready */}
            <div className="flex items-center gap-2.5 mb-6">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: effectiveTone === 'green' ? '#34d399' : toneDotColor(effectiveTone) }}
              />
              <p className="text-[14px] font-medium text-white/70">{heroStatusLine}</p>
            </div>
            {/* CTA buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => router.push(mainCtaHref)}
                className="inline-flex items-center justify-center gap-2 rounded-full text-[11px] uppercase tracking-[0.16em] font-bold transition-all px-7 py-3 bg-blue-600 hover:bg-blue-500 text-white"
                style={{ boxShadow: '0 0 28px rgba(37,99,235,0.40)' }}
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
                className="inline-flex items-center justify-center gap-2 rounded-full border text-white/75 text-[11px] uppercase tracking-[0.16em] font-bold hover:bg-white/[0.07] hover:text-white transition-all px-7 py-3"
                style={{ borderColor: 'rgba(255,255,255,0.22)' }}
              >
                <span className="material-symbols-outlined text-[15px] leading-none">calendar_month</span>
                {heroSecondaryCta.label}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SECTION 2: PILOT JOURNEY CARD ───────────────────────────────────── */}
      <section
        className="relative rounded-[20px] border overflow-hidden"
        style={{
          borderColor: 'rgba(80,122,186,0.18)',
          boxShadow: '0 4px 40px rgba(0,0,0,0.52)',
        }}
      >
        {/* Background image */}
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: "url('/CustomerDashboard/dashboard-journey.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {/* Very light readability wash for labels/track contrast */}
        <div className="absolute inset-0 z-10" style={{ background: 'rgba(6,14,28,0.18)' }} />
        <div className="absolute inset-0 z-10" style={{ background: 'linear-gradient(to bottom, rgba(6,14,28,0.12) 0%, rgba(6,14,28,0.04) 38%, rgba(6,14,28,0.14) 100%)' }} />

        {/* Content */}
        <div className="relative z-20">
          <div className="px-8 pt-5 pb-0 md:px-12 md:pt-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-blue-300/55 mb-0.5">
              Your Pilot Journey
            </p>
            <p className="text-[13px] text-[#5a7896] leading-tight">
              From takeoff to touchdown, we&apos;ve got you covered.
            </p>
          </div>
          <DashboardHeroRunway
            clearanceStatus={clearanceStatus}
            checkoutPaymentDisplayState={checkoutPaymentDisplayState}
            activeBooking={hasActiveBooking && activeBooking ? activeBooking : null}
            blocked={clearanceStatus === 'not_currently_eligible'}
          />
        </div>
      </section>

      {/* ─── SECTION 3: NEXT ACTION + FLIGHT SNAPSHOT ───────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* ── Next Action Card ── */}
        <div
          className="relative rounded-[20px] border overflow-hidden"
          style={{
            borderColor: toneBorder(nextAction.tone),
            boxShadow: '0 4px 40px rgba(0,0,0,0.52)',
            minHeight: '320px',
          }}
        >
          {/* Background image */}
          <div
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: "url('/CustomerDashboard/dashboard-nextaction.png')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          {/* Lighter, localized readability gradient */}
          <div className="absolute inset-0 z-10" style={{ background: 'linear-gradient(135deg, rgba(7,16,30,0.34) 0%, rgba(7,16,30,0.20) 50%, rgba(7,16,30,0.08) 100%)' }} />
          {/* Top accent line */}
          <div className="absolute top-0 inset-x-0 z-20 h-[3px]" style={{ background: toneAccentGradient(nextAction.tone) }} />

          <div className="relative z-20 px-7 py-7 md:px-8 md:py-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-white/35 mb-6">
              Next Action
            </p>

            {/* Icon + title */}
            <div className="flex items-start gap-5 mb-5">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={toneIconBg(nextAction.tone)}
              >
                <span
                  className="material-symbols-outlined text-[26px]"
                  style={{ color: nextAction.iconColor, fontVariationSettings: "'wght' 200" }}
                >
                  {nextAction.icon}
                </span>
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h2 className="font-serif text-[22px] md:text-[26px] leading-tight text-white">
                  {nextAction.title}
                </h2>
              </div>
            </div>

            <p className="text-[14px] text-white/55 leading-relaxed mb-7">
              {nextAction.body}
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-3">
              <button
                onClick={() => router.push(nextAction.ctaHref)}
                className="inline-flex items-center gap-2 rounded-full text-[11px] uppercase tracking-[0.14em] font-bold transition-all px-6 py-3 whitespace-nowrap"
                style={{ ...toneCtaStyle(nextAction.tone), boxShadow: nextAction.tone === 'amber' ? '0 0 20px rgba(245,158,11,0.30)' : undefined }}
              >
                <span
                  className="material-symbols-outlined text-[15px] leading-none"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  flight_takeoff
                </span>
                {nextAction.ctaLabel}
              </button>
              {nextAction.secondaryLink && (
                <button
                  onClick={() => {
                    const href = nextAction.secondaryLink!.href
                    if (href.startsWith('tel:')) {
                      window.location.href = href
                      return
                    }
                    router.push(href)
                  }}
                  className="inline-flex items-center gap-0.5 text-[12px] text-white/40 hover:text-white/65 transition-colors py-3 px-1"
                >
                  {nextAction.secondaryLink.label}
                  <span className="material-symbols-outlined text-[14px] leading-none">chevron_right</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Flight Snapshot Card ── */}
        <div
          className="relative rounded-[20px] border overflow-hidden"
          style={{
            borderColor: 'rgba(60,100,160,0.22)',
            boxShadow: '0 4px 40px rgba(0,0,0,0.52)',
            minHeight: '320px',
          }}
        >
          {/* Background image */}
          <div
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: "url('/CustomerDashboard/dashboard-flight-snapshot.png')",
              backgroundSize: 'cover',
              backgroundPosition: 'center right',
            }}
          />
          {/* Lighter, localized readability gradient */}
          <div className="absolute inset-0 z-10" style={{ background: 'linear-gradient(135deg, rgba(7,16,30,0.36) 0%, rgba(7,16,30,0.22) 52%, rgba(7,16,30,0.10) 100%)' }} />
          {/* Top accent line */}
          <div className="absolute top-0 inset-x-0 z-20 h-[3px]" style={{ background: 'linear-gradient(90deg, rgba(96,165,250,0.55) 0%, rgba(96,165,250,0.04) 100%)' }} />

          <div className="relative z-20 px-7 py-7 md:px-8 md:py-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-white/35 mb-6">
              Flight Snapshot
            </p>

            {flightSnapshotBooking ? (
              /* ── Populated state ── */
              <div>
                <div className="mb-6">
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
                  className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View Booking Details
                  <span className="material-symbols-outlined text-[14px] leading-none">arrow_forward</span>
                </button>
              </div>
            ) : clearanceStatus === 'cleared_to_fly' ? (
              /* ── Cleared, no booking ── */
              <div className="flex flex-col items-start">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                  style={{ background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.25)' }}
                >
                  <span
                    className="material-symbols-outlined text-[22px]"
                    style={{ color: '#60a5fa', fontVariationSettings: "'wght' 200" }}
                  >
                    flight
                  </span>
                </div>
                <p className="font-serif text-[20px] text-white mb-2">No current booking</p>
                <p className="text-[13px] text-white/50 leading-relaxed mb-6">
                  You&apos;re cleared to fly, but you don&apos;t have an active booking yet. Book your next flight to see the details here.
                </p>
                <button
                  onClick={() => router.push('/dashboard/bookings/new')}
                  className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Book a Flight
                  <span className="material-symbols-outlined text-[14px] leading-none">arrow_forward</span>
                </button>
              </div>
            ) : (
              /* ── Not cleared, no checkout booked ── */
              <div className="flex flex-col items-start">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                  style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.22)' }}
                >
                  <span
                    className="material-symbols-outlined text-[22px]"
                    style={{ color: '#f59e0b', fontVariationSettings: "'wght' 200" }}
                  >
                    how_to_reg
                  </span>
                </div>
                <p className="font-serif text-[20px] text-white mb-2">
                  {clearanceStatus === 'checkout_required' ? 'No checkout booked' : 'No upcoming flight'}
                </p>
                <p className="text-[13px] text-white/50 leading-relaxed mb-6">
                  {clearanceStatus === 'checkout_required'
                    ? 'Once you schedule your checkout flight, your booking details and status will appear here.'
                    : 'Your booking details will appear here once available.'}
                </p>
                {clearanceStatus === 'checkout_required' && (
                  <button
                    onClick={() => router.push('/dashboard/checkout')}
                    className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] font-bold text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Book Checkout
                    <span className="material-symbols-outlined text-[14px] leading-none">arrow_forward</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
