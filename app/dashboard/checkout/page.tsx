import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerBookingShell from '../bookings/CustomerBookingShell'
import CheckoutFlow from './CheckoutFlow'
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

  // Only redirect for terminal states where the checkout form is irrelevant:
  //   cleared_for_solo_hire         → checkout complete, go to dashboard
  //   checkout_confirmed            → waiting for the flight, no new booking needed
  //   checkout_completed_under_review → outcome pending, no new booking needed
  //   not_currently_eligible        → blocked, contact operations
  //
  // Keep alive for:
  //   checkout_required                   → initial checkout flow
  //   checkout_requested                  → just submitted, success screen must show
  //   additional_supervised_time_required → may book another checkout session
  //   reschedule_required                 → may book another checkout session
  const TERMINAL_STATES = [
    'cleared_for_solo_hire',
    'checkout_confirmed',
    'checkout_completed_under_review',
    'not_currently_eligible',
  ]
  if (TERMINAL_STATES.includes(clearanceStatus)) {
    redirect('/dashboard')
  }

  const { data: documents } = await supabase
    .from('user_documents')
    .select('id, document_type, status, expiry_date, uploaded_at')
    .eq('user_id', user.id)

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, registration, aircraft_type, display_name, status, default_hourly_rate')
    .eq('registration', 'VH-KZG')
    .single()

  if (!aircraft) {
    redirect('/dashboard')
  }

  return (
    <CustomerBookingShell user={user as User} profile={typedProfile}>
      <CheckoutFlow
        aircraftId={aircraft.id}
        aircraftRegistration={aircraft.registration}
        aircraftDisplayName={aircraft.display_name || aircraft.aircraft_type}
        aircraftStatus={aircraft.status}
        documents={(documents ?? []) as UserDocument[]}
        pilotClearanceStatus={clearanceStatus}
        initialLastFlightDate={typedProfile?.last_flight_date ?? ''}
      />
    </CustomerBookingShell>
  )
}
