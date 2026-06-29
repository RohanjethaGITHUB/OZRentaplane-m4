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
import { evaluateBookingDocumentsReadiness, evaluateBookingReadinessDecision, hasAcceptedCurrentTerms } from '@/lib/booking-readiness'
import BookingReadinessInlinePanel from './BookingReadinessInlinePanel'
import { hasManualCheckoutClearance } from '@/lib/checkout-clearance'

type BlockTimePurchaseRow = {
  id: string
  status: 'pending' | 'active' | 'exhausted' | 'expired' | 'refunded'
  hours_purchased: number
  hours_remaining: number
  expires_at: string
  purchased_at: string
  activated_at: string | null
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
    status: BlockTimePurchaseRow['status']
    ratePerHour: number
  } | null
}

export const metadata = { title: 'Book a Flight | Pilot Overview' }

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
  user:            User
  profile:         Profile | null
  icon:            string
  iconColor:       string
  colorCls:        string
  heading:         string
  body:            string
  primaryLabel:    string
  primaryHref:     string
  secondaryLabel?: string
  secondaryHref?:  string
  testId?:         string
}) {
  return (
    <CustomerBookingShell user={user} profile={profile}>
      <div className="px-6 md:px-10 py-10 max-w-2xl mx-auto w-full" data-testid={testId}>
        <Link
          href="/dashboard/bookings"
          className="inline-flex items-center gap-1 text-[#1a4fd6] hover:text-[#1540a8] text-sm mb-6 transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          My Bookings
        </Link>

        <div className={`rounded-2xl border p-10 text-center shadow-sm ${colorCls}`}>
          <span
            className={`material-symbols-outlined text-5xl mb-5 block ${iconColor}`}
            style={{ fontVariationSettings: "'wght' 200" }}
          >
            {icon}
          </span>
          <h2 className="font-serif text-2xl font-normal text-[#152d5a] mb-3">{heading}</h2>
          <p className="text-sm text-[#4b6390] leading-relaxed mb-8 max-w-sm mx-auto">{body}</p>
          <div className={`flex flex-col ${secondaryLabel ? 'sm:flex-row gap-3' : ''} items-center justify-center`}>
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#f59e0b] hover:bg-[#d97706] text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors shadow-sm"
            >
              {primaryLabel}
            </Link>
            {secondaryLabel && secondaryHref && (
              <Link
                href={secondaryHref}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 border border-[#152d5a]/20 hover:border-[#152d5a]/40 text-[#4b6390] hover:text-[#152d5a] rounded-full text-xs font-bold uppercase tracking-widest transition-colors"
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
  documents,
  lastFlightDate,
  missingDocumentsCount,
  documentsAwaitingReviewCount,
  flightRecencyComplete,
  termsAccepted,
  activeTerms,
}: {
  user: User
  profile: Profile | null
  hasHistoricalClearance: boolean
  docItems: ReturnType<typeof evaluateBookingDocumentsReadiness>
  documents: UserDocument[]
  lastFlightDate: string | null
  missingDocumentsCount: number
  documentsAwaitingReviewCount: number
  flightRecencyComplete: boolean
  termsAccepted: boolean
  activeTerms: ReturnType<typeof normalizeActiveCheckoutTerms>
}) {
  const awaitingReviewOnly = documentsAwaitingReviewCount > 0 && missingDocumentsCount === 0 && flightRecencyComplete && termsAccepted
  const heading = awaitingReviewOnly
    ? 'Documents Under Review'
    : 'Complete your pilot file before booking'
  const body = awaitingReviewOnly
    ? 'Your documents have been submitted and are currently under admin review. Booking will unlock once OZ Rent A Plane approves them.'
    : 'Your checkout has already been marked as completed by the OZ Rent A Plane team. Before your first aircraft hire booking, we need to complete your pilot file.'

  return (
    <CustomerBookingShell user={user} profile={profile}>
      <div className="px-6 md:px-10 py-10 max-w-3xl mx-auto w-full" data-testid="booking-readiness-gate">
        <Link href="/dashboard/bookings" className="inline-flex items-center gap-1 text-[#1a4fd6] hover:text-[#1540a8] text-sm mb-6 transition-colors">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          My Bookings
        </Link>

        <div className="rounded-2xl border border-[#152d5a]/10 bg-white p-7 md:p-8 shadow-sm">
          <h2 className="text-2xl font-serif text-[#152d5a]">{heading}</h2>
          <p className="mt-3 text-sm text-[#4b6390] leading-relaxed">{body}</p>
          {hasHistoricalClearance ? (
            <p className="mt-2 text-xs text-[#1a4fd6]">Checkout source: Historical/manual checkout completion.</p>
          ) : null}

          <BookingReadinessInlinePanel
            docItems={docItems}
            documents={documents}
            lastFlightDate={lastFlightDate}
            hasNightVfrRating={profile?.has_night_vfr_rating ?? null}
            flightRecencyComplete={flightRecencyComplete}
            termsAccepted={termsAccepted}
            activeTerms={activeTerms}
            documentsAwaitingReviewCount={documentsAwaitingReviewCount}
            missingDocumentsCount={missingDocumentsCount}
          />
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
        colorCls="bg-white border-[#152d5a]/10"
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
        colorCls="bg-white border-[#152d5a]/10"
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
        colorCls="bg-white border-[#152d5a]/10"
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
    const hasManualClearance = await hasManualCheckoutClearance(user.id)
    const hasPaidInvoice = Boolean(authoritativePaidInvoice?.id)
    const invoiceRequired = !hasHistoricalClearance && !hasManualClearance
    const isClearancePathValid = hasHistoricalClearance || hasManualClearance || hasPaidInvoice

    if (!isClearancePathValid && invoiceRequired) {
      return (
        <LockedGate
          user={user as User}
          profile={typedProfile}
          icon="error"
          iconColor="text-red-400"
          colorCls="bg-white border-[#152d5a]/10"
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
          colorCls="bg-white border-[#152d5a]/10"
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
    const decision = evaluateBookingReadinessDecision({
      clearanceStatus: pilotClearanceStatus,
      hasHistoricalClearance,
      hasPaidCheckoutInvoice: hasPaidInvoice,
      documents: (documents ?? []) as UserDocument[],
      hasNightVfrRating: typedProfile?.has_night_vfr_rating ?? null,
      lastFlightDate: typedProfile?.last_flight_date ?? null,
      termsAccepted,
    })
    const shouldLogBookingEligibility =
      process.env.DEBUG_BOOKING_ELIGIBILITY === 'true' ||
      process.env.NODE_ENV !== 'production'
    if (shouldLogBookingEligibility) {
      console.info('[booking-eligibility]', { customerId: user.id, ...decision })
    }

    const requiresPilotFileReadiness =
      !hasManualClearance &&
      pilotClearanceStatus !== 'cleared_to_fly'

    if (requiresPilotFileReadiness && !decision.bookingReady) {
      return (
        <BookingReadinessGate
          user={user as User}
          profile={typedProfile}
          hasHistoricalClearance={hasHistoricalClearance}
          docItems={docItems}
          documents={(documents ?? []) as UserDocument[]}
          lastFlightDate={typedProfile?.last_flight_date ?? null}
          missingDocumentsCount={decision.missingDocuments.length + decision.expiredDocuments.length}
          documentsAwaitingReviewCount={decision.documentsAwaitingReview.length}
          flightRecencyComplete={decision.flightRecencyComplete}
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

    // Query active block time purchases
    const { data: blockTimePurchaseRows } = await supabase
      .from('pilot_block_time_purchases')
      .select(`
        id,
        status,
        hours_purchased,
        hours_remaining,
        expires_at,
        purchased_at,
        activated_at,
        package:block_time_packages (
          name,
          hours,
          rate_per_hour,
          validity_days
        )
      `)
      .eq('user_id', user.id)
      .order('purchased_at', { ascending: false })
      .limit(10)

    const blockTimePurchases = ((blockTimePurchaseRows ?? []) as any[]).map((purchase) => ({
      ...purchase,
      package: Array.isArray(purchase.package) ? purchase.package[0] ?? null : purchase.package,
    }))

    const activeBlockTimePurchases = blockTimePurchases.filter(
      (purchase) => purchase.status === 'active' && Number(purchase.hours_remaining) > 0,
    )
    const pendingBlockTimePurchases = blockTimePurchases.filter((purchase) => purchase.status === 'pending')
    const totalActiveHoursRemaining = activeBlockTimePurchases.reduce(
      (sum, purchase) => sum + Number(purchase.hours_remaining || 0),
      0,
    )
    const earliestExpiry = activeBlockTimePurchases
      .map((purchase) => purchase.expires_at)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null
    const latestPurchase = blockTimePurchases[0] ?? null
    const latestPurchasePackageName = latestPurchase?.package?.name ?? 'Block Time'
    const latestPurchaseHours = latestPurchase?.package?.hours ?? Number(latestPurchase?.hours_purchased ?? 0)
    
    const blockTimeSummary: BlockTimeSummary | null = blockTimePurchases.length > 0
      ? {
          totalActiveHoursRemaining,
          activePurchaseCount: activeBlockTimePurchases.length,
          pendingPurchaseCount: pendingBlockTimePurchases.length,
          earliestExpiry,
          latestPurchase: latestPurchase
            ? {
                packageName: latestPurchasePackageName,
                hoursPurchased: latestPurchaseHours,
                purchasedAt: latestPurchase.purchased_at,
                status: latestPurchase.status,
                ratePerHour: Number(latestPurchase.rate_per_hour || latestPurchase.package?.rate_per_hour || 300),
              }
            : null,
        }
      : null

    // Query past completed standard flights
    const { data: pastBookings } = await supabase
      .from('bookings')
      .select(`
        id,
        status,
        flight_records (
          vdo_total
        )
      `)
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'standard')
      .eq('status', 'completed')

    let completedFlightsCount = 0
    let totalVdoHours = 0
    if (pastBookings) {
      completedFlightsCount = pastBookings.length
      totalVdoHours = pastBookings.reduce((sum, b) => {
        const fr = Array.isArray(b.flight_records)
          ? b.flight_records[0]
          : b.flight_records
        return sum + Number(fr?.vdo_total || 0)
      }, 0)
    }

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
          blockTimeSummary={blockTimeSummary}
          completedFlightsCount={completedFlightsCount}
          totalVdoHours={totalVdoHours}
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
