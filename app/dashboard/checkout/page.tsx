import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeActiveCheckoutTerms, type ActiveCheckoutTerms } from '@/lib/checkout-terms'
import CustomerBookingShell from '../bookings/CustomerBookingShell'
import CheckoutFlow from './CheckoutFlow'
import { deriveJourneyState } from '@/lib/customer-journey'
import type { User } from '@supabase/supabase-js'
import type { Profile, UserDocument } from '@/lib/supabase/types'

export const metadata = { title: 'Checkout Onboarding | Pilot Dashboard' }

export default async function CheckoutPage() {
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
  const clearanceStatus = typedProfile?.pilot_clearance_status ?? 'checkout_required'

  const TERMINAL_STATES = ['cleared_to_fly', 'not_currently_eligible']
  if (TERMINAL_STATES.includes(clearanceStatus)) {
    redirect('/dashboard')
  }

  const [{ data: documents }, { data: aircraft }, { data: checkoutBooking }] = await Promise.all([
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
      .select('id, status, created_at')
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'checkout')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!aircraft) redirect('/dashboard')

  let activeCheckoutTerms: ActiveCheckoutTerms | null = null
  {
    const primary = await supabase
      .from('terms_documents')
      .select('*')
      .eq('is_active', true)
      .order('effective_from', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    const row = (primary.data as Record<string, unknown> | null)
      ?? (await supabase
        .from('terms_documents')
        .select('*')
        .order('effective_from', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()).data as Record<string, unknown> | null

    activeCheckoutTerms = normalizeActiveCheckoutTerms(row)
    if (!activeCheckoutTerms) {
      const admin = createAdminClient()
      const adminPrimary = await admin
        .from('terms_documents')
        .select('*')
        .eq('is_active', true)
        .order('effective_from', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      const adminRow = (adminPrimary.data as Record<string, unknown> | null)
        ?? (await admin
          .from('terms_documents')
          .select('*')
          .order('effective_from', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()).data as Record<string, unknown> | null
      activeCheckoutTerms = normalizeActiveCheckoutTerms(adminRow)
    }
  }

  if (!activeCheckoutTerms) redirect('/dashboard')

  const firstName = typedProfile?.first_name ?? typedProfile?.full_name?.split(' ')[0] ?? 'Pilot'
  const journey = deriveJourneyState({
    clearanceStatus,
    documents: (documents ?? []) as UserDocument[],
    hasCheckoutBooking: Boolean(checkoutBooking),
  })
  return (
    <CustomerBookingShell user={user as User} profile={typedProfile}>
      <section className="space-y-6">
        <section className="rounded-2xl border border-[rgba(148,163,184,0.16)] bg-[rgba(8,22,39,0.88)] p-3 md:p-5 shadow-sm">
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
          />
        </section>
      </section>
    </CustomerBookingShell>
  )
}
