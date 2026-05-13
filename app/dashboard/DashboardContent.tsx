'use client'

import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { Profile, PilotClearanceStatus, UserDocument, VerificationEvent } from '@/lib/supabase/types'
import { getCheckoutPaymentDisplayState } from '@/lib/checkout-payment-state'
import DashboardHeroRunway from '@/components/customer/DashboardHeroRunway'

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
}

type StatusConfig = {
  subtitle: string
  body: string
  primaryCtaLabel: string
  primaryCtaHref: string
  secondaryCtaLabel: string
  secondaryCtaHref: string
  statusPill: string
  statusTone: 'amber' | 'blue' | 'violet' | 'slate' | 'green' | 'red'
  actionTitle: string
  actionBody: string
  progressTitle: string
}

const STATUS_CONFIG: Record<PilotClearanceStatus, StatusConfig> = {
  checkout_required: {
    subtitle: 'Before Solo Hire',
    body: 'Complete your one-time checkout flight before booking aircraft solo.',
    primaryCtaLabel: 'Book checkout flight',
    primaryCtaHref: '/dashboard/checkout',
    secondaryCtaLabel: 'Learn more',
    secondaryCtaHref: '/checkout-process',
    statusPill: 'Checkout Required',
    statusTone: 'amber',
    actionTitle: 'Book your checkout flight',
    actionBody: 'Schedule your checkout orientation flight to start the final onboarding stage.',
    progressTitle: 'Select checkout date',
  },
  checkout_requested: {
    subtitle: 'Checkout Submitted',
    body: 'Your request has been submitted and is now under operations review.',
    primaryCtaLabel: 'View booking',
    primaryCtaHref: '/dashboard/bookings',
    secondaryCtaLabel: 'Contact support',
    secondaryCtaHref: '/dashboard/messages',
    statusPill: 'Checkout Requested',
    statusTone: 'blue',
    actionTitle: 'Checkout request under review',
    actionBody: 'Our team is reviewing your requested time and documents. We will notify you with the outcome.',
    progressTitle: 'Awaiting operations review',
  },
  checkout_confirmed: {
    subtitle: 'Checkout Confirmed',
    body: 'Your checkout flight has been confirmed. Attend the flight to continue toward clearance.',
    primaryCtaLabel: 'View booking details',
    primaryCtaHref: '/dashboard/bookings',
    secondaryCtaLabel: 'Message ops',
    secondaryCtaHref: '/dashboard/messages',
    statusPill: 'Checkout Confirmed',
    statusTone: 'blue',
    actionTitle: 'Prepare for your checkout flight',
    actionBody: 'Review booking details and arrive ready with your required documentation.',
    progressTitle: 'Complete checkout flight',
  },
  checkout_completed_under_review: {
    subtitle: 'Outcome Pending',
    body: 'Your checkout flight is complete and currently under review by operations.',
    primaryCtaLabel: 'View booking',
    primaryCtaHref: '/dashboard/bookings',
    secondaryCtaLabel: 'Contact support',
    secondaryCtaHref: '/dashboard/messages',
    statusPill: 'Under Review',
    statusTone: 'amber',
    actionTitle: 'Awaiting checkout outcome',
    actionBody: 'Your flight has been assessed and is awaiting final outcome publication.',
    progressTitle: 'Outcome under review',
  },
  checkout_payment_required: {
    subtitle: 'Invoice Due',
    body: 'Your checkout invoice is ready. Payment is required before your status can proceed.',
    primaryCtaLabel: 'View invoice',
    primaryCtaHref: '/dashboard/bookings',
    secondaryCtaLabel: 'Contact support',
    secondaryCtaHref: '/dashboard/messages',
    statusPill: 'Payment Required',
    statusTone: 'amber',
    actionTitle: 'Complete your checkout payment',
    actionBody: 'Settle the invoice to continue your clearance progression.',
    progressTitle: 'Pay checkout invoice',
  },
  additional_checkout_required: {
    subtitle: 'Additional Checkout Required',
    body: 'An additional checkout session is required before solo hire can be approved.',
    primaryCtaLabel: 'Book another checkout',
    primaryCtaHref: '/dashboard/checkout',
    secondaryCtaLabel: 'Contact support',
    secondaryCtaHref: '/dashboard/messages',
    statusPill: 'Additional Checkout Required',
    statusTone: 'amber',
    actionTitle: 'Book your additional checkout',
    actionBody: 'Select another checkout time so operations can continue your pathway to clearance.',
    progressTitle: 'Book additional checkout',
  },
  checkout_reschedule_required: {
    subtitle: 'Reschedule Required',
    body: 'Your checkout requires a new booking slot before assessment can continue.',
    primaryCtaLabel: 'Reschedule checkout',
    primaryCtaHref: '/dashboard/checkout',
    secondaryCtaLabel: 'Contact support',
    secondaryCtaHref: '/dashboard/messages',
    statusPill: 'Reschedule Required',
    statusTone: 'amber',
    actionTitle: 'Reschedule your checkout',
    actionBody: 'Choose a new date and time to proceed with the onboarding runway.',
    progressTitle: 'Reschedule checkout',
  },
  not_currently_eligible: {
    subtitle: 'Training Required',
    body: 'Further training is required before solo hire can continue.',
    primaryCtaLabel: 'Contact support',
    primaryCtaHref: '/dashboard/messages',
    secondaryCtaLabel: 'View bookings',
    secondaryCtaHref: '/dashboard/bookings',
    statusPill: 'Not Currently Eligible',
    statusTone: 'red',
    actionTitle: 'Coordinate next training steps',
    actionBody: 'Speak with operations to understand required training before your next assessment.',
    progressTitle: 'Training required',
  },
  cleared_to_fly: {
    subtitle: "You're cleared to book aircraft with Oz Rent A Plane.",
    body: 'Your clearance is complete. You can now request aircraft bookings and manage upcoming flights.',
    primaryCtaLabel: 'Book aircraft',
    primaryCtaHref: '/dashboard/bookings/new',
    secondaryCtaLabel: 'View bookings',
    secondaryCtaHref: '/dashboard/bookings',
    statusPill: 'Cleared to Fly',
    statusTone: 'green',
    actionTitle: 'Book your next flight',
    actionBody: 'Browse available windows and submit a new aircraft booking request.',
    progressTitle: 'Cleared for booking',
  },
}

function toneClass(tone: StatusConfig['statusTone']): string {
  if (tone === 'amber') return 'text-amber-200 border-amber-400/55 bg-amber-500/10'
  if (tone === 'blue') return 'text-blue-200 border-blue-400/45 bg-blue-500/12'
  if (tone === 'violet') return 'text-violet-100 border-violet-300/55 bg-violet-500/12'
  if (tone === 'green') return 'text-emerald-100 border-emerald-300/55 bg-emerald-500/12'
  if (tone === 'red') return 'text-red-100 border-red-300/55 bg-red-500/12'
  return 'text-slate-100 border-slate-300/45 bg-slate-500/12'
}

function toneDot(tone: StatusConfig['statusTone']): string {
  if (tone === 'amber') return 'bg-amber-300'
  if (tone === 'red') return 'bg-red-300'
  if (tone === 'green') return 'bg-emerald-300'
  return 'bg-blue-300'
}

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
}: Props) {
  const router = useRouter()

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const firstNameFromProfile = (profile?.first_name ?? '').trim()
  const firstNameFromDisplay = displayName.split(' ')[0] ?? ''
  const firstName = firstNameFromProfile || firstNameFromDisplay || ''

  const clearanceStatus = (profile?.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus
  const checkoutPaymentDisplayState =
    clearanceStatus === 'checkout_payment_required'
      ? getCheckoutPaymentDisplayState(
          checkoutInvoice ? { status: checkoutInvoice.invoiceStatus ?? 'payment_required' } : null,
          checkoutInvoice?.bankTransferStatus ? { status: checkoutInvoice.bankTransferStatus } : null,
        )
      : null

  const isAwaitingManualPayment =
    checkoutPaymentDisplayState === 'awaiting_manual_payment_confirmation'

  const baseStatusConfig: StatusConfig = isAwaitingManualPayment
    ? {
        ...STATUS_CONFIG.checkout_payment_required,
        subtitle: 'Payment Submitted',
        body: 'Your bank transfer has been submitted and is awaiting team verification.',
        statusPill: 'Awaiting Payment Confirmation',
        statusTone: 'violet',
        actionTitle: 'Awaiting payment confirmation',
        actionBody: 'No further action is required until payment verification is complete.',
      }
    : STATUS_CONFIG[clearanceStatus]

  const heroOverride: Partial<StatusConfig> | null =
    clearanceStatus === 'cleared_to_fly' && mainBookingHeroState
      ? (
          mainBookingHeroState.mode === 'post_flight_required'
            ? {
                statusPill: 'Flight Completed',
                statusTone: 'amber',
                actionTitle: 'Submit post-flight records',
                actionBody: 'Your flight is complete. Please submit your VDO/tacho readings and landing details so the team can finalise the booking.',
                primaryCtaLabel: 'Submit Post Flight Records',
                primaryCtaHref: `/dashboard/bookings/${mainBookingHeroState.bookingId}`,
                secondaryCtaLabel: 'View Booking',
                secondaryCtaHref: `/dashboard/bookings/${mainBookingHeroState.bookingId}`,
              }
            : mainBookingHeroState.mode === 'post_flight_under_review'
              ? {
                  statusPill: 'Records Submitted',
                  statusTone: 'blue',
                  actionTitle: 'Post-flight records under review',
                  actionBody: 'Thanks, your post-flight details have been submitted. The team will review them and finalise the booking.',
                  primaryCtaLabel: 'View Booking',
                  primaryCtaHref: `/dashboard/bookings/${mainBookingHeroState.bookingId}`,
                  secondaryCtaLabel: 'View Bookings',
                  secondaryCtaHref: '/dashboard/bookings',
                }
              : {
                  statusPill: 'Flight Confirmed',
                  statusTone: 'blue',
                  actionTitle: 'Get ready for your flight',
                  actionBody: 'Your aircraft booking is confirmed. Review the details before arrival and contact the team if anything changes.',
                  primaryCtaLabel: 'View Booking',
                  primaryCtaHref: `/dashboard/bookings/${mainBookingHeroState.bookingId}`,
                  secondaryCtaLabel: 'View Bookings',
                  secondaryCtaHref: '/dashboard/bookings',
                }
        )
      : null

  const statusConfig: StatusConfig = heroOverride
    ? { ...baseStatusConfig, ...heroOverride }
    : baseStatusConfig

  const hasActiveBooking = Boolean(
    activeBooking && !['completed', 'cancelled', 'no_show'].includes(activeBooking.status),
  )
  const mainCtaHref =
    clearanceStatus === 'checkout_payment_required' && checkoutBookingId
      ? `/dashboard/bookings/${checkoutBookingId}`
      : clearanceStatus === 'cleared_to_fly' && mainBookingHeroState
        ? `/dashboard/bookings/${mainBookingHeroState.bookingId}`
        : clearanceStatus === 'cleared_to_fly' && hasActiveBooking && activeBooking
        ? `/dashboard/bookings/${activeBooking.id}`
        : statusConfig.primaryCtaHref
  const mainCtaLabel =
    clearanceStatus === 'cleared_to_fly' && mainBookingHeroState
      ? statusConfig.primaryCtaLabel
      : clearanceStatus === 'cleared_to_fly' && hasActiveBooking
      ? 'View booking'
      : statusConfig.primaryCtaLabel

  return (
    <div>
      {/* ─── 1. HERO (WELCOME + RUNWAY) ────────────────────────────────── */}
      <section
        className="relative w-full overflow-hidden bg-[#061422] md:left-1/2 md:right-1/2 md:ml-[-50vw] md:mr-[-50vw] md:w-screen md:min-h-[clamp(900px,100vh,1220px)]"
      >
        <div
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/customer-dash.png')", backgroundPosition: 'center 22%' }}
        />
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-[#030d19]/55 via-[#061422]/38 to-[#061422]/82" />
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-transparent via-[rgba(16,45,82,0.12)] to-[rgba(24,66,118,0.34)]" />
        <div className="absolute bottom-0 inset-x-0 z-10 h-28 bg-gradient-to-t from-[#061422] via-[#0a2a4a]/28 to-transparent" />

        <div className="relative z-20 mx-auto w-full max-w-[1500px] px-6 md:px-8 md:min-h-[inherit]">
          {/* Mobile: static flow so heading and card stack vertically without overlap */}
          {/* Desktop (md+): heading is absolutely centred, runway card pinned to bottom */}
          <h1 className="relative pt-16 pb-2 md:pt-0 md:pb-0 md:absolute md:left-1/2 md:top-[32%] z-30 w-full md:-translate-x-1/2 md:-translate-y-1/2 text-center font-serif text-[34px] leading-[1.06] tracking-[-0.02em] text-[#dce7fb] md:text-[54px]">
            <span className="block">Welcome to the Cockpit</span>
            <span
              className="mt-2 block font-normal text-[#f3c94e] tracking-[0.02em] text-[38px] md:text-[62px] leading-[0.95] drop-shadow-[0_0_6px_rgba(250,204,21,0.28)]"
              style={{ fontFamily: "'Apple Chancery', 'Snell Roundhand', 'Lucida Handwriting', cursive" }}
            >
              {firstName ? `Captain ${firstName}` : 'Captain'}
            </span>
            <span className="mt-4 flex items-center justify-center gap-3 text-[#d6b252]/80">
              <span className="h-px w-16 bg-[#c9a742]/45" />
              <span className="material-symbols-outlined text-[20px] leading-none">flight</span>
              <span className="h-px w-16 bg-[#c9a742]/45" />
            </span>
          </h1>

          <div className="relative z-20 overflow-x-hidden md:absolute md:inset-x-8 md:bottom-6">
            <DashboardHeroRunway
              clearanceStatus={clearanceStatus}
              checkoutPaymentDisplayState={checkoutPaymentDisplayState}
              activeBooking={hasActiveBooking && activeBooking ? activeBooking : null}
              blocked={clearanceStatus === 'not_currently_eligible'}
            />
          </div>
        </div>
      </section>

      {/* ─── BELOW HERO ─────────────────────────────────────────────────── */}
      <div className="space-y-7 pt-8 md:space-y-9 md:pt-10">
        {/* ─── 2. STATUS / ACTION CARD ──────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-2xl border border-[rgba(80,122,186,0.22)]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "url('/dashboard-section-bg.png')",
              backgroundSize: 'cover',
              backgroundPosition: 'center right',
            }}
          />
          {/* layered dark overlays for text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#030c18]/94 via-[#061422]/82 to-[#061422]/52" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#030c18]/62 to-transparent" />

          <div className="relative z-10 px-8 py-12 md:px-12 md:py-16 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 md:gap-10">
            <div className="max-w-2xl">
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase mb-6 ${toneClass(statusConfig.statusTone)}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${toneDot(statusConfig.statusTone)}`} />
                {statusConfig.statusPill}
              </div>
              <h2 className="mb-4 font-serif text-[40px] leading-[1.08] text-[#e5edf8]">
                {statusConfig.actionTitle}
              </h2>
              <p className="max-w-xl text-[17px] text-[#a8b8cc] leading-relaxed">
                {statusConfig.actionBody}
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3.5">
                <button
                  onClick={() => router.push(mainCtaHref)}
                  className="px-8 py-3.5 rounded bg-[#ffb800] text-[#1a1e2a] text-[12px] uppercase tracking-[0.16em] font-bold hover:bg-[#ffc633] transition-colors whitespace-nowrap"
                >
                  {mainCtaLabel}
                </button>
                <button
                  onClick={() => router.push(statusConfig.secondaryCtaHref)}
                  className="px-8 py-3.5 rounded border border-[rgba(148,163,184,0.3)] text-[#c6d2e8] text-[12px] uppercase tracking-[0.16em] font-bold hover:bg-[rgba(15,38,65,0.68)] transition-colors whitespace-nowrap"
                >
                  {statusConfig.secondaryCtaLabel}
                </button>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
