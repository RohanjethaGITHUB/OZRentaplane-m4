import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardContent from './DashboardContent'
import type { Profile, UserDocument, VerificationEvent, PilotClearanceStatus } from '@/lib/supabase/types'

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
  // Detect a new auth session by comparing Supabase's last_sign_in_at against
  // our app-level last_login_at. On new session: increment login_count and
  // advance last_login_at so subsequent page loads within the same session
  // don't re-trigger.
  const authLastSignIn  = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null
  const profileLastLogin = profile?.last_login_at ? new Date(profile.last_login_at) : null
  const isNewSession    = authLastSignIn !== null && (profileLastLogin === null || authLastSignIn > profileLastLogin)

  // isFirstLogin is true when login_count was 0 before this session's increment.
  // Existing users are seeded to login_count=1 by migration 026, so they always
  // see "Welcome back". Brand-new users start at 0 and see "Welcome" on first login.
  const isFirstLogin = isNewSession && (profile?.login_count ?? 1) === 0

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

  // Fetch documents, events, and (if payment pending) the checkout booking ID in parallel
  const paymentPending = clearanceStatus === 'checkout_payment_required'

  const [{ data: documents }, { data: events }, checkoutBookingResult] = await Promise.all([
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
  ])

  const checkoutBookingId = (checkoutBookingResult.data as { id: string } | null)?.id ?? null

  return (
    <DashboardContent
      user={user}
      profile={profile as Profile | null}
      documents={(documents as UserDocument[]) || []}
      events={(events as VerificationEvent[]) || []}
      isFirstLogin={isFirstLogin}
      checkoutBookingId={checkoutBookingId}
    />
  )
}
