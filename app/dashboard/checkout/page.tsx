import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeActiveCheckoutTerms, type ActiveCheckoutTerms } from '@/lib/checkout-terms'
import PortalPageHero from '@/components/PortalPageHero'
import CustomerBookingShell from '../bookings/CustomerBookingShell'
import CheckoutFlow from './CheckoutFlow'
import { deriveJourneyState } from '@/lib/customer-journey'
import type { User } from '@supabase/supabase-js'
import type { PilotClearanceStatus, Profile, UserDocument } from '@/lib/supabase/types'
import { ADMIN_CONTACT_PHONE_DISPLAY, ADMIN_CONTACT_PHONE_TEL } from '@/lib/contact'

export const metadata = { title: 'Checkout Onboarding | Pilot Dashboard' }

type QueryErr = {
  code?: string
  message?: string
}

function summarizeErr(error: unknown): QueryErr | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { code?: unknown; message?: unknown }
  return {
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
  }
}

function logCheckoutLoad(payload: {
  userId: string
  profileFound: boolean
  pilotProfileFound: boolean
  checkoutRequestFound: boolean
  pilotDocumentsFound: boolean
  errors: Record<string, QueryErr | null>
}) {
  console.info('[checkout_route_load]', {
    route: '/dashboard/checkout',
    user_id: payload.userId,
    profile_found: payload.profileFound,
    pilot_profile_found: payload.pilotProfileFound,
    checkout_request_found: payload.checkoutRequestFound,
    pilot_documents_found: payload.pilotDocumentsFound,
    errors: payload.errors,
  })
}

function CheckoutSetupUnavailable() {
  return (
    <section className="space-y-6">
      <section className="rounded-2xl border border-[rgba(148,163,184,0.16)] bg-[rgba(8,22,39,0.88)] p-4 md:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-white">Checkout setup unavailable</h2>
        <p className="mt-2 text-sm text-slate-300">
          We could not load all required checkout data right now. Please refresh and try again shortly.
        </p>
      </section>
    </section>
  )
}

function CheckoutHero({ clearanceStatus }: { clearanceStatus: PilotClearanceStatus }) {
  return (
    <PortalPageHero
      eyebrow="CHECKOUT STATUS"
      title="Your Checkout Flight"
      subtitle={
        clearanceStatus === 'cleared_to_fly'
          ? "Your checkout flight has been approved. You're cleared to book and fly solo."
          : "Before you can hire an aircraft independently, you'll need to complete a one-time checkout flight with a member of our team. They'll assess your flying skills and provide a result. Once cleared, you're free to book solo flights anytime."
      }
      backgroundImage="/CustomerDashboard/CustomerDashboard-CheckoutHero.png"
    />
  )
}

export default async function CheckoutPage() {
  const supabase = await createClient()
  const ACTIVE_CHECKOUT_STATUSES = [
    'checkout_confirmed',
    'checkout_requested',
    'checkout_completed_under_review',
    'checkout_payment_required',
  ] as const
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr) {
    console.error('[checkout_route_auth_error]', {
      route: '/dashboard/checkout',
      code: authErr.code,
      message: authErr.message,
    })
  }
  if (!user) redirect('/login')

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')

  const typedProfile = profile as Profile | null
  const clearanceStatus = typedProfile?.pilot_clearance_status ?? 'checkout_required'
  const noShowLocked =
    typedProfile?.account_status === 'blocked' &&
    typedProfile?.account_lock_reason === 'checkout_no_show'

  const { data: activeCheckoutBookingForRedirect } = await supabase
    .from('bookings')
    .select('id')
    .eq('booking_owner_user_id', user.id)
    .eq('booking_type', 'checkout')
    .in('status', [...ACTIVE_CHECKOUT_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const TERMINAL_STATES = ['cleared_to_fly', 'not_currently_eligible']
  if (!activeCheckoutBookingForRedirect && TERMINAL_STATES.includes(clearanceStatus)) {
    redirect('/dashboard')
  }

  if (noShowLocked) {
    return (
      <CustomerBookingShell user={user as User} profile={typedProfile}>
        <CheckoutHero clearanceStatus={clearanceStatus} />
        <section className="space-y-5 mt-5">
          <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5">
            <p className="text-sm font-semibold text-rose-100">
              Your account is currently locked because you were marked as a no-show for your checkout flight.
            </p>
            <p className="mt-2 text-sm text-rose-100/90">
              Please contact OZ Rent A Plane to discuss your checkout status and unlock your account.
            </p>
            <p className="mt-2 text-sm text-white">
              Call:{' '}
              <a href={`tel:${ADMIN_CONTACT_PHONE_TEL}`} className="underline underline-offset-2">
                {ADMIN_CONTACT_PHONE_DISPLAY}
              </a>
            </p>
          </section>
        </section>
      </CustomerBookingShell>
    )
  }

  const [{ data: documents, error: documentsErr }, { data: aircraft, error: aircraftErr }, { data: checkoutBooking, error: checkoutBookingErr }] = await Promise.all([
    supabase
      .from('user_documents')
      .select('*')
      .eq('user_id', user.id),
    supabase
      .from('aircraft')
      .select('id, registration, aircraft_type, display_name, status, default_hourly_rate')
      .eq('registration', 'VH-KZG')
      .single(),
    supabase
      .from('bookings')
      .select('id, status, booking_type, scheduled_start, scheduled_end, checkout_lifecycle_status, created_at')
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'checkout')
      .in('status', [...ACTIVE_CHECKOUT_STATUSES])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const latestRescheduleRequest = checkoutBooking
    ? (await supabase
        .from('checkout_change_requests')
        .select('id, status, requested_scheduled_start, requested_scheduled_end, created_at')
        .eq('checkout_request_id', checkoutBooking.id)
        .eq('request_type', 'reschedule')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()).data
    : null

  let activeCheckoutTerms: ActiveCheckoutTerms | null = null
  let termsPrimaryErr: QueryErr | null = null
  let termsFallbackErr: QueryErr | null = null
  let termsAdminPrimaryErr: QueryErr | null = null
  let termsAdminFallbackErr: QueryErr | null = null
  let termsAdminClientErr: QueryErr | null = null

  {
    const primary = await supabase
      .from('terms_documents')
      .select('*')
      .eq('is_active', true)
      .order('effective_from', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    termsPrimaryErr = summarizeErr(primary.error)

    const fallback = await supabase
        .from('terms_documents')
        .select('*')
        .order('effective_from', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
    termsFallbackErr = summarizeErr(fallback.error)
    const row = (primary.data as Record<string, unknown> | null)
      ?? (fallback.data as Record<string, unknown> | null)

    activeCheckoutTerms = normalizeActiveCheckoutTerms(row)
    if (!activeCheckoutTerms) {
      try {
        const admin = createAdminClient()
        const adminPrimary = await admin
          .from('terms_documents')
          .select('*')
          .eq('is_active', true)
          .order('effective_from', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
        termsAdminPrimaryErr = summarizeErr(adminPrimary.error)
        const adminFallback = await admin
          .from('terms_documents')
          .select('*')
          .order('effective_from', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
        termsAdminFallbackErr = summarizeErr(adminFallback.error)
        const adminRow = (adminPrimary.data as Record<string, unknown> | null)
          ?? (adminFallback.data as Record<string, unknown> | null)
        activeCheckoutTerms = normalizeActiveCheckoutTerms(adminRow)
      } catch (error) {
        termsAdminClientErr = summarizeErr(error)
      }
    }
  }

  logCheckoutLoad({
    userId: user.id,
    profileFound: Boolean(typedProfile),
    pilotProfileFound: Boolean(typedProfile),
    checkoutRequestFound: Boolean(checkoutBooking),
    pilotDocumentsFound: (documents?.length ?? 0) > 0,
    errors: {
      profile: summarizeErr(profileErr),
      checkout_request: summarizeErr(checkoutBookingErr),
      pilot_documents: summarizeErr(documentsErr),
      aircraft: summarizeErr(aircraftErr),
      terms_primary: termsPrimaryErr,
      terms_fallback: termsFallbackErr,
      terms_admin_primary: termsAdminPrimaryErr,
      terms_admin_fallback: termsAdminFallbackErr,
      terms_admin_client: termsAdminClientErr,
    },
  })

  if (!aircraft || !activeCheckoutTerms) {
    return (
      <CustomerBookingShell user={user as User} profile={typedProfile}>
        <CheckoutHero clearanceStatus={clearanceStatus} />
        <div className="space-y-5 mt-5">
          <CheckoutSetupUnavailable />
        </div>
      </CustomerBookingShell>
    )
  }

  const firstName = typedProfile?.first_name ?? typedProfile?.full_name?.split(' ')[0] ?? 'Pilot'
  const journey = deriveJourneyState({
    clearanceStatus,
    documents: (documents ?? []) as UserDocument[],
    hasCheckoutBooking: Boolean(checkoutBooking),
  })
  return (
    <CustomerBookingShell user={user as User} profile={typedProfile}>
      <CheckoutHero clearanceStatus={clearanceStatus} />
      <div className="space-y-5 mt-5">
        <CheckoutFlow
          firstName={firstName}
          aircraftId={aircraft.id}
          aircraftRegistration={aircraft.registration}
          aircraftDisplayName={aircraft.display_name || aircraft.aircraft_type}
          aircraftStatus={aircraft.status}
          documents={(documents ?? []) as UserDocument[]}
          pilotClearanceStatus={clearanceStatus}
          journeyActiveIndex={journey.activeIndex}
          journeyCompletedMap={journey.completedMap}
          initialLastFlightDate={typedProfile?.last_flight_date ?? ''}
          initialNightVfrRating={typedProfile?.has_night_vfr_rating ?? null}
          initialInstrumentRating={typedProfile?.has_instrument_rating ?? null}
          activeCheckoutTerms={activeCheckoutTerms}
          activeCheckoutBooking={
            checkoutBooking
              ? {
                  id: checkoutBooking.id,
                  status: checkoutBooking.status,
                  booking_type: checkoutBooking.booking_type,
                  scheduled_start: checkoutBooking.scheduled_start,
                  scheduled_end: checkoutBooking.scheduled_end,
                  checkout_lifecycle_status: checkoutBooking.checkout_lifecycle_status ?? null,
                }
              : null
          }
          pendingRescheduleRequest={
            latestRescheduleRequest
              ? {
                  id: latestRescheduleRequest.id,
                  status: latestRescheduleRequest.status,
                  requested_scheduled_start: latestRescheduleRequest.requested_scheduled_start,
                  requested_scheduled_end: latestRescheduleRequest.requested_scheduled_end,
                }
              : null
          }
        />
      </div>
    </CustomerBookingShell>
  )
}
