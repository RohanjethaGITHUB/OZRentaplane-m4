import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerCreditsManager from './CustomerCreditsManager'
import CustomerBillingTable from './CustomerBillingTable'
import AdminPortalHero from '@/components/AdminPortalHero'
import { getCustomerDerivedStatus, hasActiveCheckoutBooking } from '@/app/admin/customers/customer-status'

export const metadata = { title: 'Customer Billing | Admin' }
export default async function CustomerCreditsPage({ searchParams }: { searchParams: { customerId?: string; q?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: customers }, { data: revenueRows }, { data: checkoutBookings }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, account_status, pilot_clearance_status')
      .eq('role', 'customer'),
    supabase.from('customer_payment_ledger').select('customer_id, amount_cents').gt('amount_cents', 0),
    supabase.from('bookings').select('booking_owner_user_id, status, checkout_lifecycle_status').eq('booking_type', 'checkout').not('booking_owner_user_id', 'is', null),
  ])
  const usersWithCheckoutRequests = new Set(
    (checkoutBookings ?? [])
      .filter((b) => hasActiveCheckoutBooking({ status: b.status as string | null, checkout_lifecycle_status: (b as any).checkout_lifecycle_status ?? null }))
      .map((b) => b.booking_owner_user_id)
      .filter(Boolean),
  )
  const totalPaidByCustomer = new Map<string, number>()
  for (const row of revenueRows ?? []) {
    if (!row.customer_id) continue
    totalPaidByCustomer.set(row.customer_id, (totalPaidByCustomer.get(row.customer_id) ?? 0) + (row.amount_cents ?? 0))
  }
  const rows = (customers ?? []).map((c) => {
    const status = getCustomerDerivedStatus({
      accountStatus: c.account_status,
      pilotClearanceStatus: c.pilot_clearance_status,
      hasCheckoutRequest: usersWithCheckoutRequests.has(c.id),
    })
    return {
      id: c.id,
      name: c.full_name || 'Unnamed customer',
      email: c.email || 'No email',
      totalPaidCents: totalPaidByCustomer.get(c.id) ?? 0,
      status,
    }
  })

  const selectedCustomerId = searchParams.customerId

  return (
    <>
      <AdminPortalHero
        eyebrow="Customers"
        title="Customer Billing"
        subtitle="Cumulative money paid in, alongside customer credit history and adjustments."
      />
      <div className="mx-auto max-w-[1400px] px-6 py-8 pb-24 md:px-10 md:py-10">
        {selectedCustomerId ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:items-start">
            <CustomerBillingTable
              rows={rows}
              initialQuery={searchParams.q ?? ''}
              selectedCustomerId={selectedCustomerId}
              compact
            />
            <CustomerCreditsManager initialCustomerId={selectedCustomerId} />
          </div>
        ) : (
          <CustomerBillingTable rows={rows} initialQuery={searchParams.q ?? ''} />
        )}
      </div>
    </>
  )
}
