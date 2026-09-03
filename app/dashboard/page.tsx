import { redirect } from 'next/navigation'
import { createClient, getCachedProfile, getCachedUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBlockTimePurchaseIntent } from '@/app/actions/payment'
import DashboardContent from './DashboardContent'
import type { Profile, UserDocument, VerificationEvent, PilotClearanceStatus } from '@/lib/supabase/types'
import { isAwaitingFlightRecordDue } from '@/lib/booking/flight-record-status'
import { evaluateBookingReadinessDecision, hasAcceptedCurrentTerms, type BookingReadinessDecision } from '@/lib/booking-readiness'
import { normalizeActiveCheckoutTerms } from '@/lib/checkout-terms'
import { hasManualCheckoutClearance } from '@/lib/checkout-clearance'
import {
  resolveDashboardActionState,
  type DashboardBookingFocusState,
  type DashboardFlightSnapshot,
} from '@/lib/dashboard/dashboard-action-state'
import { emitClearanceUpdated } from '@/lib/realtime/emit'
import { createPerfLogger } from '@/lib/perf/timing'

type BlockTimePackageRow = {
  id: string
  name: string
  hours: number
  rate_per_hour: number
  validity_days: number
  total_price: number
  created_at: string
  updated_at: string
}

type BlockTimePackageRef = {
  name: string
  hours: number
  rate_per_hour: number
  validity_days: number
}

type BlockTimePurchaseRow = {
  id: string
  status: 'pending' | 'active' | 'exhausted' | 'expired' | 'refunded'
  hours_purchased: number
  hours_remaining: number
  expires_at: string
  purchased_at: string
  activated_at: string | null
  package: BlockTimePackageRef | BlockTimePackageRef[] | null
}

type BlockTimeSummary = {
  totalActiveHoursRemaining: number
  activePurchaseCount: number
  pendingPurchaseCount: number
  earliestExpiry: string | null
  latestPurchase: {
    packageName: string
    hoursPurchased: number
    purchasedAt: string
    status: BlockTimePurchaseRow['status']
  } | null
}

function normalizePackageSlug(input: string | string[] | undefined): string | null {
  const value = Array.isArray(input) ? input[0] : input
  if (!value) return null
  return value.toLowerCase()
}

function slugifyPackageName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}h` : `${rounded.toFixed(1)}h`
}

function formatExpiryDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const perf = createPerfLogger({ route: '/dashboard', role: 'customer' })
  const markTotal = perf.start('customer_dashboard_page', 'customer_dashboard_total_server_page_preparation')
  const supabase = await createClient()

  const { data: { user } } = await perf.time(
    'customer_dashboard_page',
    'customer_dashboard_identity_preparation',
    () => getCachedUser(),
  )
  if (!user) redirect('/login')

  const { data: profile } = await perf.time(
    'customer_dashboard_page',
    'customer_dashboard_profile_preparation',
    () => getCachedProfile(user.id, 'dashboard'),
    (result) => ({ rowCount: result.data ? 1 : 0 }),
  )

  // Admins belong in /admin; Instructors belong in /instructor/dashboard
  if (profile?.role === 'admin') redirect('/admin')
  if (profile?.role === 'instructor') redirect('/instructor/dashboard')

  // ── Login tracking ────────────────────────────────────────────────────────
  const authLastSignIn   = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null
  const profileLastLogin = profile?.last_login_at ? new Date(profile.last_login_at) : null
  const isNewSession     = authLastSignIn !== null && (profileLastLogin === null || authLastSignIn > profileLastLogin)
  const isFirstLogin     = isNewSession && (profile?.login_count ?? 1) === 0

  const loginTrackingPromise = isNewSession
    ? perf.time(
      'customer_dashboard_page',
      'customer_dashboard_login_tracking',
      () => supabase
        .from('profiles')
        .update({
          last_login_at: new Date().toISOString(),
          login_count:   (profile?.login_count ?? 0) + 1,
        })
        .eq('id', user.id),
    )
    : Promise.resolve(null)

  const clearanceStatus = ((profile as Profile | null)?.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus
  const paymentPending  = clearanceStatus === 'checkout_payment_required'
  const nowIso = new Date().toISOString()
  const passwordUpdated = searchParams?.passwordUpdated === '1'
  const mustChangePassword = Boolean((profile as Profile | null)?.must_change_password)
  const skipPasswordPrompt = searchParams?.skip_password_prompt === '1'
  const selectedBlockTimePackageSlug = normalizePackageSlug(searchParams?.block_time_package)

  if (mustChangePassword && !skipPasswordPrompt) {
    await loginTrackingPromise
    redirect('/change-password')
  }

  // ── Start independent fetches ──────────────────────────────────────────────
  // When payment is pending, also fetch:
  //   1. The checkout booking ID (for CTA links)
  //   2. The live invoice breakdown (for the payment panel)
  //   3. The landing charges (for the breakdown line items)
  const primaryQueryPromise = perf.time('customer_dashboard_page', 'customer_dashboard_primary_query_group', () => Promise.all([
    supabase
      .from('user_documents')
      .select('id, user_id, document_type, status, uploaded_at, expiry_date, updated_at, red_card_expiry_month, red_card_expiry_year')
      .eq('user_id', user.id),
    supabase
      .from('verification_events')
      .select('id, user_id, actor_user_id, actor_role, event_type, from_status, to_status, title, body, request_kind, is_read, admin_read_at, email_status, email_sent_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
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
    supabase
      .from('bookings')
      .select('id, status, scheduled_start, scheduled_end, aircraft(registration)')
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'standard')
      .eq('status', 'payment_pending')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('checkout_change_requests')
      .select('id, status, requested_scheduled_start, requested_scheduled_end, admin_note, customer_note, created_at')
      .eq('customer_id', user.id)
      .eq('request_type', 'reschedule')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]))

  const manualClearancePromise = perf.time(
    'customer_dashboard_page',
    'customer_dashboard_manual_checkout_clearance_lookup',
    () => hasManualCheckoutClearance(user.id),
  )

  const readinessPrimaryPromise = perf.time('customer_dashboard_page', 'customer_dashboard_readiness_query_group', () => Promise.all([
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
    supabase
      .from('checkout_invoices')
      .select('id')
      .eq('customer_id', user.id)
      .eq('status', 'paid')
      .limit(1)
      .maybeSingle(),
  ]), (result) => ({
    rowCount: (result[0].data ? 1 : 0) + (result[1].data ? 1 : 0) + (result[2].data ? 1 : 0) + (result[3].data ? 1 : 0),
  }))

  const blockTimePromise = perf.time(
    'customer_dashboard_page',
    'customer_dashboard_block_time_group',
    () => Promise.all([
      supabase
        .from('block_time_packages')
        .select('id, name, hours, rate_per_hour, total_price, validity_days, is_active, display_order, created_at, updated_at')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      supabase
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
        .limit(10),
      searchParams?.block_time_purchase === 'success'
        ? supabase
            .from('invoices')
            .select('pdf_url')
            .eq('user_id', user.id)
            .eq('type', 'block_time_purchase')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]),
    (result) => ({
      rowCount:
        (result[0].data?.length ?? 0) +
        (result[1].data?.length ?? 0) +
        (result[2].data ? 1 : 0),
    }),
  )

  const [
    [
      { data: documents },
      { data: events },
      checkoutBookingResult,
      activeBookingResult,
      postFlightRequiredBookingResult,
      postFlightUnderReviewBookingResult,
      upcomingConfirmedBookingResult,
      checkoutSnapshotBookingResult,
      postFlightPaymentRequiredBookingResult,
      pendingCheckoutRescheduleResult,
    ],
    [{ data: historicalClearance }, termsPrimary, { data: latestTermsAcceptance }, { data: paidCheckoutInvoice }],
  ] = await Promise.all([primaryQueryPromise, readinessPrimaryPromise])

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

  // Self-heal: if profile clearance status is checkout_requested or checkout_confirmed,
  // but no active checkout booking exists (e.g. after cancellation/closure), reconcile to checkout_required.
  let effectiveClearanceStatus = clearanceStatus
  if (
    (clearanceStatus === 'checkout_requested' || clearanceStatus === 'checkout_confirmed') &&
    !checkoutBookingId
  ) {
    effectiveClearanceStatus = 'checkout_required'
    const admin = createAdminClient()
    void (async () => {
      try {
        await admin
          .from('profiles')
          .update({ pilot_clearance_status: 'checkout_required', updated_at: new Date().toISOString() })
          .eq('id', user.id)
        void emitClearanceUpdated(user.id)
      } catch (err) {
        console.error('[dashboard] Failed to auto-reconcile orphaned checkout clearance:', err)
      }
    })()
  }
  const activeBooking = (activeBookingResult.data as { id: string; status: string } | null) ?? null
  const postFlightRequiredBooking = ((postFlightRequiredBookingResult.data as BookingSnapshotRow[] | null) ?? [])
    .find((booking) => isAwaitingFlightRecordDue(booking)) ?? null
  const postFlightUnderReviewBooking = (postFlightUnderReviewBookingResult.data as BookingSnapshotRow | null) ?? null
  const upcomingConfirmedBooking = (upcomingConfirmedBookingResult.data as BookingSnapshotRow | null) ?? null
  const checkoutSnapshotBooking = (checkoutSnapshotBookingResult.data as BookingSnapshotRow | null) ?? null
  const postFlightPaymentRequiredBooking = (postFlightPaymentRequiredBookingResult.data as BookingSnapshotRow | null) ?? null

  // ── Post-flight bank transfer status ──────────────────────────────────────
  let postFlightBankTransferStatus: string | null = null
  let isBlockTimeLandingFeeOnly = false
  if (postFlightPaymentRequiredBooking) {
    const [{ data: pfInvoiceRow }, { data: btInvoiceRow }] = await perf.time(
      'customer_dashboard_page',
      'customer_dashboard_payment_followups',
      () => Promise.all([
        supabase
          .from('booking_invoices')
          .select('id')
          .eq('booking_id', postFlightPaymentRequiredBooking.id)
          .maybeSingle(),
        supabase
          .from('invoices')
          .select('id, is_block_time_overage')
          .eq('booking_id', postFlightPaymentRequiredBooking.id)
          .eq('billing_mode', 'block_time')
          .eq('type', 'flight')
          .in('status', ['awaiting', 'bank_transfer_pending_review'])
          .maybeSingle(),
      ]),
      (result) => ({ rowCount: (result[0].data ? 1 : 0) + (result[1].data ? 1 : 0) }),
    )
    if (btInvoiceRow && !btInvoiceRow.is_block_time_overage) {
      isBlockTimeLandingFeeOnly = true
    }
    const invoiceId = pfInvoiceRow?.id || btInvoiceRow?.id
    if (invoiceId) {
      const { data: pfBtSub } = await perf.time(
        'customer_dashboard_page',
        'customer_dashboard_payment_followups',
        () => supabase
          .from('booking_bank_transfer_submissions')
          .select('status, admin_note')
          .eq('invoice_id', invoiceId)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        (result) => ({ rowCount: result.data ? 1 : 0 }),
      )
      postFlightBankTransferStatus = (pfBtSub as { status: string; admin_note?: string | null } | null)?.status ?? null
    }
  }

  const standardSnapshotBooking = postFlightPaymentRequiredBooking ?? postFlightRequiredBooking ?? postFlightUnderReviewBooking ?? upcomingConfirmedBooking
  const flightSnapshotBooking: DashboardFlightSnapshot | null = standardSnapshotBooking
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

  // Unpaid block-time landing fee invoices — hours are already settled from the
  // package, but the customer still owes landing fees via Purchases.
  const { data: outstandingLandingFeeRow } = await perf.time(
    'customer_dashboard_page',
    'customer_dashboard_landing_fee_outstanding',
    () =>
      supabase
        .from('invoices')
        .select('id, booking_id, invoice_number, total')
        .eq('user_id', user.id)
        .eq('billing_mode', 'block_time')
        .eq('type', 'flight')
        .eq('is_block_time_overage', false)
        .eq('status', 'awaiting')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    (result) => ({ rowCount: result.data ? 1 : 0 }),
  )
  const outstandingLandingFeeInvoice = outstandingLandingFeeRow as {
    id: string
    booking_id: string | null
    invoice_number: string
    total: number
  } | null

  const bookingFocusState: DashboardBookingFocusState | null =
    postFlightPaymentRequiredBooking
      ? {
          mode:
            postFlightBankTransferStatus === 'rejected'
              ? 'post_flight_payment_proof_rejected'
              : postFlightBankTransferStatus === 'pending_review'
                ? 'post_flight_payment_proof_under_review'
                : postFlightBankTransferStatus === 'approved'
                  ? 'post_flight_payment_approved'
                  : isBlockTimeLandingFeeOnly
                    ? 'block_time_landing_fee_required'
                    : 'post_flight_payment_required',
          bookingId: postFlightPaymentRequiredBooking.id,
        }
      : postFlightRequiredBooking
        ? { mode: 'post_flight_required', bookingId: postFlightRequiredBooking.id }
      : postFlightUnderReviewBooking
          ? {
              mode: postFlightUnderReviewBooking.status === 'needs_clarification'
                ? 'post_flight_clarification_required'
                : 'post_flight_under_review',
              bookingId: postFlightUnderReviewBooking.id,
            }
          : outstandingLandingFeeInvoice?.booking_id
            ? {
                mode: 'block_time_landing_fee_required',
                bookingId: outstandingLandingFeeInvoice.booking_id,
              }
            : upcomingConfirmedBooking
              ? { mode: 'upcoming_confirmed', bookingId: upcomingConfirmedBooking.id }
              : null

  // Fetch invoice data only when we have a booking ID
  let checkoutInvoice: import('./DashboardContent').CheckoutInvoiceData | null = null
  let bookingReadiness: BookingReadinessDecision | null = null

  if (paymentPending && checkoutBookingId) {
    const [{ data: invoiceRow }, { data: landingRows }, { data: invoiceStatusRow }] = await perf.time('customer_dashboard_page', 'customer_dashboard_payment_followups', () => Promise.all([
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
    ]), (result) => ({
      rowCount: (result[0].data ? 1 : 0) + (result[1].data?.length ?? 0) + (result[2].data ? 1 : 0),
    }))

    // Fetch latest bank transfer submission for the invoice.
    // Use invoiceRow.invoice_id as the authoritative ID (comes from checkout_invoice_live_amount view);
    // fall back to invoiceStatusRow.id in case the view row is absent.
    let bankTransferStatus: string | null = null
    let bankTransferNote: string | null = null
    const invoiceIdForBtLookup =
      (invoiceRow?.invoice_id as string | null) ?? invoiceStatusRow?.id ?? null
    if (invoiceIdForBtLookup) {
      const { data: btSub } = await perf.time(
        'customer_dashboard_page',
        'customer_dashboard_payment_followups',
        () => supabase
          .from('checkout_bank_transfer_submissions')
          .select('status, admin_note')
          .eq('invoice_id', invoiceIdForBtLookup)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        (result) => ({ rowCount: result.data ? 1 : 0 }),
      )
      bankTransferStatus = (btSub as { status: string; admin_note?: string | null } | null)?.status ?? null
      bankTransferNote = (btSub as { status: string; admin_note?: string | null } | null)?.admin_note ?? null
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
        bankTransferNote,
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

  const hasManualClearance = await manualClearancePromise

  const admin = createAdminClient()
  const [
    authoritativeHistorical,
    authoritativePaidInvoice,
    authoritativeTermsAcceptance,
    authoritativeActiveTermsRow,
  ] = await perf.time(
    'customer_dashboard_page',
    'customer_dashboard_readiness_fallbacks',
    async () => {
      const [historicalFallback, paidInvoiceFallback, termsAcceptanceFallback, activeTermsFallback] = await Promise.all([
        historicalClearance?.id
          ? Promise.resolve({ data: historicalClearance })
          : admin
              .from('historical_checkout_completions')
              .select('id')
              .eq('customer_id', user.id)
              .eq('checkout_outcome', 'cleared_to_fly')
              .eq('is_active', true)
              .order('recorded_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
        paidCheckoutInvoice?.id
          ? Promise.resolve({ data: paidCheckoutInvoice })
          : admin
              .from('checkout_invoices')
              .select('id')
              .eq('customer_id', user.id)
              .eq('status', 'paid')
              .limit(1)
              .maybeSingle(),
        latestTermsAcceptance?.accepted_at
          ? Promise.resolve({ data: latestTermsAcceptance })
          : admin
              .from('booking_terms_acceptances')
              .select('terms_document_id, terms_version, terms_content_hash, accepted_at')
              .eq('user_id', user.id)
              .order('accepted_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
        termsPrimary.data
          ? Promise.resolve({ data: termsPrimary.data })
          : admin
              .from('terms_documents')
              .select('id, version, public_url, content_hash, is_active, created_at, effective_from')
              .eq('is_active', true)
              .order('effective_from', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
      ])

      return [
        historicalFallback.data,
        paidInvoiceFallback.data,
        termsAcceptanceFallback.data,
        activeTermsFallback.data,
      ]
    },
    (result) => ({
      rowCount: result.filter(Boolean).length,
    }),
  )
  const activeTerms = normalizeActiveCheckoutTerms((authoritativeActiveTermsRow as Record<string, unknown> | null) ?? null)
  const termsAccepted = hasAcceptedCurrentTerms(
    activeTerms ? { id: activeTerms.id, version: activeTerms.version, content_hash: activeTerms.content_hash } : null,
    (authoritativeTermsAcceptance as {
      terms_document_id: string | null
      terms_version: string | null
      terms_content_hash: string | null
      accepted_at: string | null
    } | null),
  )

  bookingReadiness = perf.timeSync('customer_dashboard_page', 'customer_dashboard_summary_preparation', () => evaluateBookingReadinessDecision({
    clearanceStatus: effectiveClearanceStatus,
    hasHistoricalClearance: Boolean(authoritativeHistorical?.id),
    hasPaidCheckoutInvoice: Boolean(authoritativePaidInvoice?.id),
    documents: (documents as UserDocument[]) || [],
    hasNightVfrRating: (profile as Profile | null)?.has_night_vfr_rating ?? null,
    lastFlightDate: (profile as Profile | null)?.last_flight_date ?? null,
    termsAccepted,
  }))

  const hasClearancePath = Boolean(authoritativePaidInvoice?.id || authoritativeHistorical?.id)
  const canCreateStandardBooking =
    effectiveClearanceStatus === 'cleared_to_fly' &&
    (hasManualClearance || (hasClearancePath && bookingReadiness.bookingReady))

  const dashboardActionState = resolveDashboardActionState({
    profile: {
      account_status: (profile as Profile | null)?.account_status ?? 'active',
      account_lock_reason: (profile as Profile | null)?.account_lock_reason ?? null,
      pilot_clearance_status: effectiveClearanceStatus,
      has_night_vfr_rating: (profile as Profile | null)?.has_night_vfr_rating ?? null,
      last_flight_date: (profile as Profile | null)?.last_flight_date ?? null,
    },
    documents: (documents as UserDocument[]) || [],
    bookingReadiness,
    canCreateStandardBooking,
    hasManualCheckoutClearance: hasManualClearance,
    checkoutBookingId,
    hasPendingCheckoutReschedule: Boolean(
      pendingCheckoutRescheduleResult?.data?.id &&
      (pendingCheckoutRescheduleResult?.data as any).admin_note !== 'admin_proposed'
    ),
    hasPendingAdminProposal: Boolean(
      pendingCheckoutRescheduleResult?.data?.id &&
      (pendingCheckoutRescheduleResult?.data as any).admin_note === 'admin_proposed'
    ),
    checkoutPayment: checkoutBookingId
      ? {
          bookingId: checkoutBookingId,
          invoiceStatus: checkoutInvoice?.invoiceStatus ?? null,
          bankTransferStatus: checkoutInvoice?.bankTransferStatus ?? null,
          bankTransferNote: checkoutInvoice?.bankTransferNote ?? null,
        }
      : null,
    bookingFocusState,
    flightSnapshotBooking,
    activeBooking,
  })

  const [
    { data: blockTimePackageRows },
    { data: blockTimePurchaseRows },
    { data: recentBlockTimeInvoice },
  ] = await blockTimePromise

  const selectedBlockTimePackage = ((blockTimePackageRows ?? []) as BlockTimePackageRow[]).find(
    (pkg) => slugifyPackageName(pkg.name) === selectedBlockTimePackageSlug,
  ) ?? null

  const blockTimePurchases = ((blockTimePurchaseRows ?? []) as BlockTimePurchaseRow[]).map((purchase) => ({
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
  const showBlockTimeSummary = blockTimePurchases.length > 0
  const blockTimeSummary: BlockTimeSummary | null = showBlockTimeSummary
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
            }
          : null,
      }
    : null

  const purchaseSelectedBlockTime = selectedBlockTimePackage
    ? async () => {
        'use server'
        await createBlockTimePurchaseIntent(selectedBlockTimePackage.id)
      }
    : null

  const newlyPurchasedInvoicePdfUrl = recentBlockTimeInvoice?.pdf_url ?? null
  await loginTrackingPromise
  markTotal()

  return (
    <>
      {selectedBlockTimePackage ? (
        <section className="mx-auto mb-8 max-w-7xl px-4 pt-4 md:mb-10 md:px-6">
          <div className="rounded-2xl border border-[#d8e5fb] bg-white p-5 shadow-[0_12px_38px_rgba(16,38,74,0.08)] md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6]">
                  Block Time Purchase
                </p>
                <h2 className="mt-2 font-serif text-3xl leading-tight text-[#152d5a] md:text-4xl">
                  {selectedBlockTimePackage.name} selected
                </h2>
                <p className="mt-3 font-sans text-[0.95rem] leading-relaxed text-[#4b6390]">
                  {selectedBlockTimePackage.hours} hours at ${selectedBlockTimePackage.rate_per_hour.toFixed(0)}/hr, valid for {Math.round(selectedBlockTimePackage.validity_days / 30)} months. Landing fees are always billed separately.
                </p>
              </div>

              {effectiveClearanceStatus === 'cleared_to_fly' ? (
                <form action={purchaseSelectedBlockTime ?? undefined} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                     type="submit"
                    className="inline-flex items-center justify-center rounded-xl bg-[#f59e0b] px-5 py-3.5 font-sans text-[0.8rem] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#e08f00]"
                  >
                    Purchase Block Time
                  </button>
                  <p className="max-w-[260px] font-sans text-[0.78rem] leading-relaxed text-[#64748b]">
                    You will be sent to Stripe checkout to complete payment securely.
                  </p>
                </form>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                  <p className="font-sans text-sm font-semibold">Checkout clearance required</p>
                  <p className="mt-1 font-sans text-sm leading-relaxed">
                    Block Time can be purchased once your checkout is cleared. Your selected package has been preserved for later.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <DashboardContent
        user={user}
        profile={profile ? { ...(profile as Profile), pilot_clearance_status: effectiveClearanceStatus } : null}
        documents={(documents as UserDocument[]) || []}
        events={(events as VerificationEvent[]) || []}
        isFirstLogin={isFirstLogin}
        mustChangePassword={mustChangePassword}
        passwordUpdated={passwordUpdated}
        checkoutBookingId={checkoutBookingId}
        checkoutInvoice={checkoutInvoice}
        activeBooking={activeBooking}
        dashboardActionState={dashboardActionState}
        flightSnapshotBooking={flightSnapshotBooking}
        bookingReadiness={bookingReadiness}
        blockTimeSummary={blockTimeSummary}
        allBlockTimePackages={blockTimePackageRows ?? []}
        newlyPurchasedInvoicePdfUrl={newlyPurchasedInvoicePdfUrl}
        flashNotice={
          searchParams?.block_time_purchase === 'success'
            ? {
                kind: 'success',
                title: 'Purchase Successful!',
                message: 'Your block time package has been successfully activated.',
                actionLabel: newlyPurchasedInvoicePdfUrl ? 'Download PDF Invoice' : undefined,
                actionUrl: newlyPurchasedInvoicePdfUrl ?? undefined,
              }
            : passwordUpdated
            ? {
                kind: 'success',
                title: 'Password updated',
                message: 'Your new password is now active.',
              }
            : null
        }
      />
    </>
  )
}
