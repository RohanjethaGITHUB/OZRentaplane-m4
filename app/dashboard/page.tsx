import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import DashboardContent from './DashboardContent'
import type { FlightSnapshotBooking } from './DashboardContent'
import type { Profile, UserDocument, VerificationEvent, PilotClearanceStatus } from '@/lib/supabase/types'
import { isAwaitingFlightRecordDue } from '@/lib/booking/flight-record-status'
import { evaluateBookingReadinessDecision, hasAcceptedCurrentTerms } from '@/lib/booking-readiness'
import { normalizeActiveCheckoutTerms } from '@/lib/checkout-terms'

type MainBookingHeroState = {
  mode: 'post_flight_required' | 'post_flight_under_review' | 'upcoming_confirmed'
  bookingId: string
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Admins belong in /admin
  if (profile?.role === 'admin') redirect('/admin')

  // ── Login tracking ────────────────────────────────────────────────────────
  const authLastSignIn   = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null
  const profileLastLogin = profile?.last_login_at ? new Date(profile.last_login_at) : null
  const isNewSession     = authLastSignIn !== null && (profileLastLogin === null || authLastSignIn > profileLastLogin)
  const isFirstLogin     = isNewSession && (profile?.login_count ?? 1) === 0

  if (isNewSession) {
    await supabase
      .from('profiles')
      .update({
        last_login_at: new Date().toISOString(),
        login_count:   (profile?.login_count ?? 0) + 1,
      })
      .eq('id', user.id)
  }

  const clearanceStatus = ((profile as Profile | null)?.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus
  const paymentPending  = clearanceStatus === 'checkout_payment_required'
  const nowIso = new Date().toISOString()

  // ── Parallel fetches ──────────────────────────────────────────────────────
  // When payment is pending, also fetch:
  //   1. The checkout booking ID (for CTA links)
  //   2. The live invoice breakdown (for the payment panel)
  //   3. The landing charges (for the breakdown line items)
  const [
    { data: documents },
    { data: events },
    checkoutBookingResult,
    activeBookingResult,
    postFlightRequiredBookingResult,
    postFlightUnderReviewBookingResult,
    upcomingConfirmedBookingResult,
    checkoutSnapshotBookingResult,
  ] = await Promise.all([
    supabase
      .from('user_documents')
      .select('*')
      .eq('user_id', user.id),
    supabase
      .from('verification_events')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    paymentPending
      ? supabase
          .from('bookings')
          .select('id')
          .eq('booking_owner_user_id', user.id)
          .eq('booking_type', 'checkout')
          .eq('status', 'checkout_payment_required')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from('bookings')
      .select('id, status')
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'standard')
      .order('scheduled_start', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('bookings')
      .select('id, status, scheduled_start, scheduled_end, aircraft(registration), flight_records(status, submitted_at)')
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'standard')
      .in('status', ['confirmed', 'ready_for_dispatch', 'dispatched', 'awaiting_flight_record', 'flight_record_overdue'])
      .lte('scheduled_end', nowIso)
      .order('scheduled_end', { ascending: false })
      .limit(10),
    supabase
      .from('bookings')
      .select('id, status, scheduled_start, scheduled_end, updated_at, aircraft(registration)')
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'standard')
      .in('status', ['pending_post_flight_review', 'needs_clarification'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('bookings')
      .select('id, status, scheduled_start, scheduled_end, aircraft(registration)')
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'standard')
      .in('status', ['confirmed', 'ready_for_dispatch'])
      .gte('scheduled_start', nowIso)
      .order('scheduled_start', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('bookings')
      .select('id, status, scheduled_start, scheduled_end, aircraft(registration)')
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'checkout')
      .in('status', ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  type BookingSnapshotRow = {
    id: string
    status: string
    scheduled_start?: string | null
    scheduled_end?: string | null
    aircraft?: { registration: string } | { registration: string }[] | null
    flight_records?: { status: string | null; submitted_at: string | null }[] | null
  }
  function extractAircraftReg(aircraft: BookingSnapshotRow['aircraft']): string | null {
    if (!aircraft) return null
    if (Array.isArray(aircraft)) return (aircraft[0] as { registration: string } | undefined)?.registration ?? null
    return (aircraft as { registration: string }).registration ?? null
  }

  const checkoutBookingId = (checkoutBookingResult.data as { id: string } | null)?.id ?? null
  const activeBooking = (activeBookingResult.data as { id: string; status: string } | null) ?? null
  const postFlightRequiredBooking = ((postFlightRequiredBookingResult.data as BookingSnapshotRow[] | null) ?? [])
    .find((booking) => isAwaitingFlightRecordDue(booking)) ?? null
  const postFlightUnderReviewBooking = (postFlightUnderReviewBookingResult.data as BookingSnapshotRow | null) ?? null
  const upcomingConfirmedBooking = (upcomingConfirmedBookingResult.data as BookingSnapshotRow | null) ?? null
  const checkoutSnapshotBooking = (checkoutSnapshotBookingResult.data as BookingSnapshotRow | null) ?? null

  const standardSnapshotBooking = postFlightRequiredBooking ?? postFlightUnderReviewBooking ?? upcomingConfirmedBooking
  const flightSnapshotBooking: FlightSnapshotBooking | null = standardSnapshotBooking
    ? {
        id: standardSnapshotBooking.id,
        bookingType: 'standard',
        status: standardSnapshotBooking.status,
        scheduledStart: standardSnapshotBooking.scheduled_start ?? '',
        scheduledEnd: standardSnapshotBooking.scheduled_end ?? null,
        aircraftRegistration: extractAircraftReg(standardSnapshotBooking.aircraft),
      }
    : checkoutSnapshotBooking
    ? {
        id: checkoutSnapshotBooking.id,
        bookingType: 'checkout',
        status: checkoutSnapshotBooking.status,
        scheduledStart: checkoutSnapshotBooking.scheduled_start ?? '',
        scheduledEnd: checkoutSnapshotBooking.scheduled_end ?? null,
        aircraftRegistration: extractAircraftReg(checkoutSnapshotBooking.aircraft),
      }
    : null

  const mainBookingHeroState: MainBookingHeroState | null =
    postFlightRequiredBooking
      ? { mode: 'post_flight_required', bookingId: postFlightRequiredBooking.id }
      : postFlightUnderReviewBooking
        ? { mode: 'post_flight_under_review', bookingId: postFlightUnderReviewBooking.id }
        : upcomingConfirmedBooking
          ? { mode: 'upcoming_confirmed', bookingId: upcomingConfirmedBooking.id }
          : null

  // Fetch invoice data only when we have a booking ID
  let checkoutInvoice: import('./DashboardContent').CheckoutInvoiceData | null = null
  let bookingReadiness: import('./DashboardContent').BookingReadinessSummary | null = null

  if (paymentPending && checkoutBookingId) {
    const [{ data: invoiceRow }, { data: landingRows }, { data: invoiceStatusRow }] = await Promise.all([
      supabase
        .from('checkout_invoice_live_amount')
        .select('invoice_id, subtotal_cents, advance_applied_cents, total_paid_cents, current_credit_balance_cents, display_amount_due_cents, checkout_outcome, checkout_duration_hours, checkout_landing_subtotal_cents')
        .eq('customer_id', user.id)
        .maybeSingle(),
      supabase
        .from('checkout_landing_charges')
        .select('airport_id, landing_count, unit_amount_cents, total_amount_cents, airports(icao_code, name)')
        .eq('booking_id', checkoutBookingId),
      supabase
        .from('checkout_invoices')
        .select('id, status')
        .eq('booking_id', checkoutBookingId)
        .single(),
    ])

    // Fetch latest bank transfer submission for the invoice.
    // Use invoiceRow.invoice_id as the authoritative ID (comes from checkout_invoice_live_amount view);
    // fall back to invoiceStatusRow.id in case the view row is absent.
    let bankTransferStatus: string | null = null
    const invoiceIdForBtLookup =
      (invoiceRow?.invoice_id as string | null) ?? invoiceStatusRow?.id ?? null
    if (invoiceIdForBtLookup) {
      const { data: btSub } = await supabase
        .from('checkout_bank_transfer_submissions')
        .select('status')
        .eq('invoice_id', invoiceIdForBtLookup)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      bankTransferStatus = (btSub as { status: string } | null)?.status ?? null
    }

    if (invoiceRow) {
      checkoutInvoice = {
        invoiceId:               invoiceRow.invoice_id as string,
        invoiceStatus:           (invoiceStatusRow as { status?: string } | null)?.status ?? null,
        subtotalCents:           invoiceRow.subtotal_cents as number,
        advanceAppliedCents:     invoiceRow.advance_applied_cents as number,
        totalPaidCents:          invoiceRow.total_paid_cents as number,
        currentCreditCents:      invoiceRow.current_credit_balance_cents as number,
        displayAmountDueCents:   invoiceRow.display_amount_due_cents as number,
        checkoutOutcome:         invoiceRow.checkout_outcome as string | null,
        checkoutDurationHours:   invoiceRow.checkout_duration_hours as number | null,
        landingSubtotalCents:    invoiceRow.checkout_landing_subtotal_cents as number,
        bankTransferStatus,
        landingCharges:          ((landingRows ?? []) as any[]).map(lc => ({
          airportIcao:    (lc.airports as any)?.icao_code ?? '',
          airportName:    (lc.airports as any)?.name ?? '',
          landingCount:   lc.landing_count as number,
          unitAmountCents: lc.unit_amount_cents as number,
          totalAmountCents: lc.total_amount_cents as number,
        })),
      }
    }
  }

  if (clearanceStatus === 'cleared_to_fly') {
    const [{ data: historicalClearance }, termsPrimary, { data: latestTermsAcceptance }] = await Promise.all([
      supabase
        .from('historical_checkout_completions')
        .select('id')
        .eq('customer_id', user.id)
        .eq('checkout_outcome', 'cleared_to_fly')
        .eq('is_active', true)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
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
          .select('id')
          .eq('customer_id', user.id)
          .eq('checkout_outcome', 'cleared_to_fly')
          .eq('is_active', true)
          .order('recorded_at', { ascending: false })
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

    const authoritativeActiveTermsRow = termsPrimary.data ?? (await admin
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
    const readiness = evaluateBookingReadinessDecision({
      clearanceStatus,
      hasHistoricalClearance: Boolean(authoritativeHistorical?.id),
      hasPaidCheckoutInvoice: false,
      documents: (documents as UserDocument[]) || [],
      hasNightVfrRating: (profile as Profile | null)?.has_night_vfr_rating ?? null,
      lastFlightDate: (profile as Profile | null)?.last_flight_date ?? null,
      termsAccepted,
    })

    bookingReadiness = {
      show: !readiness.bookingReady,
      hasHistoricalClearance: Boolean(authoritativeHistorical?.id),
      docsReady: readiness.documentsComplete,
      termsAccepted: readiness.currentTermsAccepted,
      flightRecencyComplete: readiness.flightRecencyComplete,
      hasAwaitingReview: readiness.documentsAwaitingReview.length > 0,
      hasMissingOrExpired: readiness.missingDocuments.length > 0 || readiness.expiredDocuments.length > 0,
    }
  }

  return (
    <DashboardContent
      user={user}
      profile={profile as Profile | null}
      documents={(documents as UserDocument[]) || []}
      events={(events as VerificationEvent[]) || []}
      isFirstLogin={isFirstLogin}
      checkoutBookingId={checkoutBookingId}
      checkoutInvoice={checkoutInvoice}
      activeBooking={activeBooking}
      mainBookingHeroState={mainBookingHeroState}
      flightSnapshotBooking={flightSnapshotBooking}
      bookingReadiness={bookingReadiness}
    />
  )
}
