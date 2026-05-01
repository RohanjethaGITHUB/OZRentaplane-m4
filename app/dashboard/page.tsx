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

  // ── Parallel fetches ──────────────────────────────────────────────────────
  // When payment is pending, also fetch:
  //   1. The checkout booking ID (for CTA links)
  //   2. The live invoice breakdown (for the payment panel)
  //   3. The landing charges (for the breakdown line items)
  const [
    { data: documents },
    { data: events },
    checkoutBookingResult,
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
  ])

  const checkoutBookingId = (checkoutBookingResult.data as { id: string } | null)?.id ?? null

  // Fetch invoice data only when we have a booking ID
  let checkoutInvoice: import('./DashboardContent').CheckoutInvoiceData | null = null

  if (paymentPending && checkoutBookingId) {
    const [{ data: invoiceRow }, { data: landingRows }] = await Promise.all([
      supabase
        .from('checkout_invoice_live_amount')
        .select('invoice_id, subtotal_cents, advance_applied_cents, total_paid_cents, current_credit_balance_cents, display_amount_due_cents, checkout_outcome, checkout_duration_hours, checkout_landing_subtotal_cents')
        .eq('customer_id', user.id)
        .maybeSingle(),
      supabase
        .from('checkout_landing_charges')
        .select('airport_id, landing_count, unit_amount_cents, total_amount_cents, airports(icao_code, name)')
        .eq('booking_id', checkoutBookingId),
    ])

    if (invoiceRow) {
      checkoutInvoice = {
        invoiceId:               invoiceRow.invoice_id as string,
        subtotalCents:           invoiceRow.subtotal_cents as number,
        advanceAppliedCents:     invoiceRow.advance_applied_cents as number,
        totalPaidCents:          invoiceRow.total_paid_cents as number,
        currentCreditCents:      invoiceRow.current_credit_balance_cents as number,
        displayAmountDueCents:   invoiceRow.display_amount_due_cents as number,
        checkoutOutcome:         invoiceRow.checkout_outcome as string | null,
        checkoutDurationHours:   invoiceRow.checkout_duration_hours as number | null,
        landingSubtotalCents:    invoiceRow.checkout_landing_subtotal_cents as number,
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

  return (
    <DashboardContent
      user={user}
      profile={profile as Profile | null}
      documents={(documents as UserDocument[]) || []}
      events={(events as VerificationEvent[]) || []}
      isFirstLogin={isFirstLogin}
      checkoutBookingId={checkoutBookingId}
      checkoutInvoice={checkoutInvoice}
    />
  )
}
