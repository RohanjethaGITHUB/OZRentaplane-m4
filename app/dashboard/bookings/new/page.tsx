import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CustomerBookingShell from '../CustomerBookingShell'
import BookingRequestForm from './BookingRequestForm'
import type { User } from '@supabase/supabase-js'
import type { Profile, UserDocument } from '@/lib/supabase/types'
import { ADMIN_CONTACT_PHONE_DISPLAY, ADMIN_CONTACT_PHONE_TEL } from '@/lib/contact'
import { normalizeActiveCheckoutTerms } from '@/lib/checkout-terms'
import { acceptCurrentBookingTermsFromReadiness } from '@/app/actions/booking-readiness'
import { evaluateBookingDocumentsReadiness, hasAcceptedCurrentTerms } from '@/lib/booking-readiness'

export const metadata = { title: 'Book a Flight | Pilot Overview' }

function readinessTone(state: 'complete' | 'missing' | 'needs_review' | 'expired'): string {
  if (state === 'complete') return 'text-emerald-200'
  if (state === 'missing') return 'text-amber-200'
  if (state === 'expired') return 'text-red-200'
  return 'text-blue-200'
}

function readinessLabel(state: 'complete' | 'missing' | 'needs_review' | 'expired'): string {
  if (state === 'complete') return 'Complete'
  if (state === 'missing') return 'Missing'
  if (state === 'expired') return 'Expired'
  return 'Needs review'
}

// ── Shared locked gate shell ─────────────────────────────────────────────────

function LockedGate({
  user,
  profile,
  icon,
  iconColor,
  colorCls,
  heading,
  body,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  testId,
}: {
  user:           User
  profile:        Profile | null
  icon:           string
  iconColor:      string
  colorCls:       string
  heading:        string
  body:           string
  primaryLabel:   string
  primaryHref:    string
  secondaryLabel?: string
  secondaryHref?:  string
  testId?: string
}) {
  return (
    <CustomerBookingShell user={user} profile={profile}>
      <div className="px-6 md:px-10 py-10 max-w-2xl mx-auto w-full" data-testid={testId}>
        <Link
          href="/dashboard/bookings"
          className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-6 transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          My Bookings
        </Link>
        <div className={`border rounded-[1.25rem] p-10 text-center ${colorCls}`}>
          <span
            className={`material-symbols-outlined text-4xl mb-4 block ${iconColor}`}
            style={{ fontVariationSettings: "'wght' 200" }}
          >
            {icon}
          </span>
          <h2 className="text-xl font-serif text-white mb-3">{heading}</h2>
          <p className="text-oz-muted text-sm leading-relaxed mb-6">{body}</p>
          <div className={`flex flex-col ${secondaryLabel ? 'sm:flex-row gap-3' : ''} justify-center`}>
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-oz-blue hover:bg-blue-400 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors"
            >
              {primaryLabel}
            </Link>
            {secondaryLabel && secondaryHref && (
              <Link
                href={secondaryHref}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-white/20 hover:border-white/35 text-white/70 hover:text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors"
              >
                {secondaryLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </CustomerBookingShell>
  )
}

function BookingReadinessGate({
  user,
  profile,
  hasHistoricalClearance,
  docItems,
  termsAccepted,
  activeTerms,
}: {
  user: User
  profile: Profile | null
  hasHistoricalClearance: boolean
  docItems: ReturnType<typeof evaluateBookingDocumentsReadiness>
  termsAccepted: boolean
  activeTerms: ReturnType<typeof normalizeActiveCheckoutTerms>
}) {
  return (
    <CustomerBookingShell user={user} profile={profile}>
      <div className="px-6 md:px-10 py-10 max-w-3xl mx-auto w-full" data-testid="booking-readiness-gate">
        <Link href="/dashboard/bookings" className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-6 transition-colors">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          My Bookings
        </Link>

        <div className="rounded-[1.25rem] border border-blue-500/20 bg-blue-500/10 p-7 md:p-8">
          <h2 className="text-2xl font-serif text-white">Complete your pilot file before booking</h2>
          <p className="mt-3 text-sm text-oz-muted leading-relaxed">
            Your checkout has already been marked as completed by the OZ Rent A Plane team. Before your first aircraft hire booking, we need to complete your pilot file.
          </p>
          {hasHistoricalClearance ? (
            <p className="mt-2 text-xs text-blue-200/90">Checkout source: Historical/manual checkout completion.</p>
          ) : null}

          <div className="mt-6 rounded-xl border border-white/10 bg-[#0b1220]/70 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Required documents</p>
            <div className="mt-3 space-y-2">
              {docItems.map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <div>
                    <p className="text-sm text-white">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.detail}</p>
                  </div>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${readinessTone(item.state)}`}>
                    {readinessLabel(item.state)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-[#0b1220]/70 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Terms and conditions</p>
            <p className={`mt-2 text-sm ${termsAccepted ? 'text-emerald-200' : 'text-amber-200'}`}>
              {termsAccepted ? 'Accepted current version.' : 'Current version not accepted.'}
            </p>
            {!termsAccepted && activeTerms ? (
              <form action={acceptCurrentBookingTermsFromReadiness} className="mt-3 space-y-3">
                <label className="flex items-start gap-2 text-sm text-slate-200">
                  <input required type="checkbox" className="mt-0.5" />
                  <span>I have read and accept the current booking terms and conditions (v{activeTerms.version}).</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  <Link href={activeTerms.public_url} target="_blank" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/80 hover:text-white hover:border-white/40">
                    View terms
                  </Link>
                  <button type="submit" className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-blue-500">
                    Accept current terms
                  </button>
                </div>
              </form>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard/documents" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-oz-blue hover:bg-blue-400 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors">
              Complete required items
            </Link>
            <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-white/20 hover:border-white/35 text-white/70 hover:text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors">
              Return to overview
            </Link>
          </div>
        </div>
      </div>
    </CustomerBookingShell>
  )
}

export default async function NewBookingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'admin') redirect('/admin')

  const typedProfile = profile as Profile | null
  const pilotClearanceStatus = typedProfile?.pilot_clearance_status ?? 'checkout_required'
  const noShowLocked =
    typedProfile?.account_status === 'blocked' &&
    typedProfile?.account_lock_reason === 'checkout_no_show'

  if (noShowLocked) {
    return (
      <LockedGate
        user={user as User}
        profile={typedProfile}
        icon="person_off"
        iconColor="text-rose-400"
        colorCls="bg-rose-500/[0.08] border-rose-500/20"
        heading="Account Locked Due To Checkout No-Show"
        body={`Your account is currently locked because you were marked as a no-show for your checkout flight. Please contact OZ Rent A Plane to discuss your checkout status and unlock your account. Call ${ADMIN_CONTACT_PHONE_DISPLAY}.`}
        primaryLabel="Message Team"
        primaryHref="/dashboard/messages"
        secondaryLabel="Call Team"
        secondaryHref={`tel:${ADMIN_CONTACT_PHONE_TEL}`}
      />
    )
  }

  // ── State A: No checkout request submitted ────────────────────────────────
  if (pilotClearanceStatus === 'checkout_required') {
    return (
      <LockedGate
        user={user as User}
        profile={typedProfile}
        icon="how_to_reg"
        iconColor="text-blue-400"
        colorCls="bg-blue-500/10 border-blue-500/20"
        heading="Complete Your Checkout Flight First"
        body="Before you can book the aircraft, you need to submit a checkout flight request. Once your checkout flight has been completed, approved, and paid, you'll be able to make aircraft bookings."
        primaryLabel="Book Checkout Flight"
        primaryHref="/dashboard/checkout"
        testId="checkout-required-gate"
      />
    )
  }

  // ── Check for payment required ─────────────────────────────────────────────
  const { data: unpaidCheckout } = await supabase
    .from('bookings')
    .select('id')
    .eq('booking_owner_user_id', user.id)
    .eq('booking_type', 'checkout')
    .eq('status', 'checkout_payment_required')
    .limit(1)
    .maybeSingle()

  if (unpaidCheckout) {
    return (
      <LockedGate
        user={user as User}
        profile={typedProfile}
        icon="payments"
        iconColor="text-orange-400"
        colorCls="bg-orange-500/[0.08] border-orange-500/20"
        heading="Checkout Payment Required"
        body="Your checkout flight has been approved. Please pay your checkout invoice before booking the aircraft."
        primaryLabel="Pay Checkout Invoice"
        primaryHref={`/dashboard/bookings/${unpaidCheckout.id}`}
        secondaryLabel="Go to Overview"
        secondaryHref="/dashboard"
        testId="checkout-payment-required-gate"
      />
    )
  }

  // ── State B: Checkout in progress (submitted, confirmed, or under review) ──
  const CHECKOUT_IN_PROGRESS = [
    'checkout_requested',
    'checkout_confirmed',
    'checkout_completed_under_review',
  ]

  if (CHECKOUT_IN_PROGRESS.includes(pilotClearanceStatus)) {
    return (
      <LockedGate
        user={user as User}
        profile={typedProfile}
        icon="pending_actions"
        iconColor="text-amber-400"
        colorCls="bg-amber-500/[0.08] border-amber-500/20"
        heading="Checkout Flight In Progress"
        body="Your checkout flight request is currently in progress. Once your checkout flight is completed and approved by the operations team, you'll receive your checkout invoice. After that invoice is paid, aircraft booking will become available."
        primaryLabel="View My Bookings"
        primaryHref="/dashboard/bookings"
        secondaryLabel="Go to Overview"
        secondaryHref="/dashboard"
        testId="checkout-in-progress-gate"
      />
    )
  }

  // ── State D: Cleared to fly — show the booking form ──────────────────────
  if (pilotClearanceStatus === 'cleared_to_fly') {
    const [{ data: paidInvoice }, { data: historicalClearance }, { data: documents }, activeTermsPrimary, { data: latestTermsAcceptance }] = await Promise.all([
      supabase
        .from('checkout_invoices')
        .select('id')
        .eq('customer_id', user.id)
        .eq('status', 'paid')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('historical_checkout_completions')
        .select('id, checkout_outcome, is_active')
        .eq('customer_id', user.id)
        .eq('checkout_outcome', 'cleared_to_fly')
        .eq('is_active', true)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('user_documents')
        .select('*')
        .eq('user_id', user.id),
      supabase
        .from('terms_documents')
        .select('id, version, public_url, content_hash, is_active, created_at, effective_from')
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('booking_terms_acceptances')
        .select('terms_document_id, terms_version, terms_content_hash, accepted_at')
        .eq('user_id', user.id)
        .order('accepted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const admin = createAdminClient()
    const authoritativeHistorical = historicalClearance?.id
      ? historicalClearance
      : (await admin
          .from('historical_checkout_completions')
          .select('id, checkout_outcome, is_active')
          .eq('customer_id', user.id)
          .eq('checkout_outcome', 'cleared_to_fly')
          .eq('is_active', true)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle()).data

    const authoritativePaidInvoice = paidInvoice?.id
      ? paidInvoice
      : (await admin
          .from('checkout_invoices')
          .select('id')
          .eq('customer_id', user.id)
          .eq('status', 'paid')
          .limit(1)
          .maybeSingle()).data

    const authoritativeTermsAcceptance = latestTermsAcceptance?.accepted_at
      ? latestTermsAcceptance
      : (await admin
          .from('booking_terms_acceptances')
          .select('terms_document_id, terms_version, terms_content_hash, accepted_at')
          .eq('user_id', user.id)
          .order('accepted_at', { ascending: false })
          .limit(1)
          .maybeSingle()).data

    const hasHistoricalClearance = Boolean(authoritativeHistorical?.id)
    const hasPaidInvoice = Boolean(authoritativePaidInvoice?.id)
    const invoiceRequired = !hasHistoricalClearance
    const isClearancePathValid = hasHistoricalClearance || hasPaidInvoice

    if (!isClearancePathValid && invoiceRequired) {
      return (
        <LockedGate
          user={user as User}
          profile={typedProfile}
          icon="error"
          iconColor="text-red-400"
          colorCls="bg-red-500/10 border-red-500/20"
          heading="System Error: Missing Checkout Invoice"
          body="Your profile is cleared to fly, but we could not find a paid checkout invoice on file. Please contact the operations team to resolve this issue."
          primaryLabel="Message Team"
          primaryHref="/dashboard/messages"
          secondaryLabel="Return to Overview"
          secondaryHref="/dashboard"
          testId="missing-checkout-invoice-error"
        />
      )
    }

    if (!isClearancePathValid) {
      return (
        <LockedGate
          user={user as User}
          profile={typedProfile}
          icon="error"
          iconColor="text-red-400"
          colorCls="bg-red-500/10 border-red-500/20"
          heading="Booking access requires checkout clearance"
          body="We could not verify a valid checkout completion path for your account. Please contact the operations team so we can resolve this quickly."
          primaryLabel="Message Team"
          primaryHref="/dashboard/messages"
          secondaryLabel="Return to Overview"
          secondaryHref="/dashboard"
          testId="checkout-clearance-error-gate"
        />
      )
    }

    const docItems = evaluateBookingDocumentsReadiness({
      documents: (documents ?? []) as UserDocument[],
      hasNightVfrRating: typedProfile?.has_night_vfr_rating ?? null,
    })
    const docsReady = docItems.every((item) => item.state === 'complete')

    const authoritativeActiveTermsRow = activeTermsPrimary.data ?? (await admin
      .from('terms_documents')
      .select('id, version, public_url, content_hash, is_active, created_at, effective_from')
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()).data

    const activeTerms = normalizeActiveCheckoutTerms((authoritativeActiveTermsRow as Record<string, unknown> | null) ?? null)
    const termsAccepted = hasAcceptedCurrentTerms(
      activeTerms ? { id: activeTerms.id, version: activeTerms.version, content_hash: activeTerms.content_hash } : null,
      (authoritativeTermsAcceptance as { terms_document_id: string | null; terms_version: string | null; terms_content_hash: string | null; accepted_at: string | null } | null),
    )
    const decision = {
      customerId: user.id,
      clearanceStatus: pilotClearanceStatus,
      clearanceSource: hasHistoricalClearance ? 'historical_checkout' : hasPaidInvoice ? 'normal_checkout' : 'not_cleared',
      hasPaidCheckoutInvoice: hasPaidInvoice,
      checkoutInvoiceRequired: invoiceRequired,
      documentsComplete: docsReady,
      missingDocuments: docItems.filter((item) => item.state !== 'complete').map((item) => item.key),
      currentTermsAccepted: termsAccepted,
      bookingReady: docsReady && termsAccepted,
      blockingReasons: [
        ...(docsReady ? [] : ['documents_incomplete']),
        ...(termsAccepted ? [] : ['terms_not_accepted']),
      ],
    } as const
    const shouldLogBookingEligibility =
      process.env.DEBUG_BOOKING_ELIGIBILITY === 'true' ||
      process.env.NODE_ENV !== 'production'
    if (shouldLogBookingEligibility) {
      console.info('[booking-eligibility]', decision)
    }

    if (!docsReady || !termsAccepted) {
      return (
        <BookingReadinessGate
          user={user as User}
          profile={typedProfile}
          hasHistoricalClearance={hasHistoricalClearance}
          docItems={docItems}
          termsAccepted={termsAccepted}
          activeTerms={activeTerms}
        />
      )
    }

    const { data: aircraft } = await supabase
      .from('aircraft')
      .select('id, registration, aircraft_type, display_name, status, default_hourly_rate')
      .eq('registration', 'VH-KZG')
      .single()

    if (!aircraft) {
      return (
        <CustomerBookingShell user={user as User} profile={typedProfile}>
          <div className="px-6 md:px-10 py-10 max-w-2xl mx-auto w-full">
            <div className="bg-red-500/10 border border-red-500/20 rounded-[1.25rem] p-10 text-center">
              <p className="text-red-300 text-sm">Aircraft configuration unavailable. Please contact the operations team.</p>
            </div>
          </div>
        </CustomerBookingShell>
      )
    }

    const eligibilityBlocked = !typedProfile?.full_name || !typedProfile?.pilot_arn

    const eligibilityWarnings: string[] = []
    if (!typedProfile?.full_name) eligibilityWarnings.push('Your profile name is missing. Please update your profile.')
    if (!typedProfile?.pilot_arn) eligibilityWarnings.push('Your Aviation Reference Number has not been recorded. Please contact operations.')

    const BOOKING_HOURLY_RATE = 320

    return (
      <CustomerBookingShell user={user as User} profile={typedProfile}>
        <BookingRequestForm
          aircraftId={aircraft.id}
          aircraftRegistration={aircraft.registration}
          aircraftType={aircraft.display_name || aircraft.aircraft_type}
          aircraftStatus={aircraft.status}
          hourlyRate={BOOKING_HOURLY_RATE}
          picName={typedProfile?.full_name ?? null}
          picArn={typedProfile?.pilot_arn ?? null}
          eligibilityBlocked={eligibilityBlocked}
          eligibilityWarnings={eligibilityWarnings}
          initialLastFlightDate={typedProfile?.last_flight_date ?? ''}
        />
      </CustomerBookingShell>
    )
  }

  // ── Other statuses (additional checkout, reschedule, not eligible) ────────
  type GateConfig = { icon: string; title: string; body: string; ctaLabel: string; ctaHref: string; colorCls: string; iconColor: string }

  const GATE: Record<string, GateConfig> = {
    additional_checkout_required: {
      icon:      'schedule',
      title:     'Additional Checkout Required',
      body:      'Following your checkout, our team has determined that an additional checkout session is required before you can be cleared to fly. Book another checkout flight to continue.',
      ctaLabel:  'Book Another Checkout',
      ctaHref:   '/dashboard/checkout',
      colorCls:  'bg-amber-500/10 border-amber-500/20',
      iconColor: 'text-amber-400',
    },
    checkout_reschedule_required: {
      icon:      'event_repeat',
      title:     'Checkout Reschedule Required',
      body:      'Your checkout could not be fully assessed this time. Book another checkout session when you are ready to try again.',
      ctaLabel:  'Book Another Checkout',
      ctaHref:   '/dashboard/checkout',
      colorCls:  'bg-amber-500/10 border-amber-500/20',
      iconColor: 'text-amber-400',
    },
    not_currently_eligible: {
      icon:      'block',
      title:     'Not Currently Eligible',
      body:      'Based on your checkout assessment, further training is required before you can continue with aircraft hire. Please contact us when you are ready to try again.',
      ctaLabel:  'Return to Overview',
      ctaHref:   '/dashboard',
      colorCls:  'bg-red-500/10 border-red-500/20',
      iconColor: 'text-red-400',
    },
  }

  const g: GateConfig = GATE[pilotClearanceStatus] ?? {
    icon:      'lock',
    title:     'Solo Booking Unavailable',
    body:      'Solo hire is not available at this time. Please contact the operations team for assistance.',
    ctaLabel:  'Return to Overview',
    ctaHref:   '/dashboard',
    colorCls:  'bg-amber-500/10 border-amber-500/20',
    iconColor: 'text-amber-400',
  }

  return (
    <LockedGate
      user={user as User}
      profile={typedProfile}
      icon={g.icon}
      iconColor={g.iconColor}
      colorCls={g.colorCls}
      heading={g.title}
      body={g.body}
      primaryLabel={g.ctaLabel}
      primaryHref={g.ctaHref}
    />
  )
}
