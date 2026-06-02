import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import CustomerCreditsManager from './CustomerCreditsManager'
import AdminPortalHero from '@/components/AdminPortalHero'
import { AdminDataTable, AdminStatusBadge } from '@/app/admin/components/AdminListView'
import { getCustomerDerivedStatus, getCustomerDerivedStatusMeta, hasActiveCheckoutBooking } from '@/app/admin/customers/customer-status'

export const metadata = { title: 'Customer Ledger | Admin' }
export default async function CustomerCreditsPage({ searchParams }: { searchParams: { customerId?: string; q?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: customers }, { data: balances }, { data: checkoutBookings }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, account_status, pilot_clearance_status')
      .eq('role', 'customer'),
    supabase.from('customer_credit_balances').select('customer_id, balance_cents'),
    supabase.from('bookings').select('booking_owner_user_id, status, checkout_lifecycle_status').eq('booking_type', 'checkout').not('booking_owner_user_id', 'is', null),
  ])
  const usersWithCheckoutRequests = new Set(
    (checkoutBookings ?? [])
      .filter((b) => hasActiveCheckoutBooking({ status: b.status as string | null, checkout_lifecycle_status: (b as any).checkout_lifecycle_status ?? null }))
      .map((b) => b.booking_owner_user_id)
      .filter(Boolean),
  )
  const balanceMap = new Map((balances ?? []).map((b) => [b.customer_id, b.balance_cents]))
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
      balanceCents: balanceMap.get(c.id) ?? 0,
      status,
    }
  })
  const q = (searchParams.q ?? '').trim().toLowerCase()
  const filteredRows = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows
  const money = (cents: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Math.abs(cents) / 100)

  return (
    <>
      <AdminPortalHero
        eyebrow="Customers"
        title="Customer Ledger"
        subtitle="Credits, payments, manual payments, and refunds."
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-8">
        <section className="space-y-4">
          <form className="rounded-2xl border border-[rgba(12,35,64,0.15)] bg-white p-4">
            <input
              type="search"
              name="q"
              defaultValue={searchParams.q ?? ''}
              placeholder="Search customers..."
              className="w-full md:w-[360px] rounded-lg border border-[rgba(12,35,64,0.18)] bg-white px-3.5 py-2.5 text-sm text-[#0C2340] placeholder:text-[#3d5a80] focus:outline-none focus:ring-1 focus:ring-[#1a4a7a]/40"
            />
          </form>
          <AdminDataTable columns={['Customer', 'Balance', 'Status']}>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-12 text-center text-[var(--admin-text-muted)]">
                  {q ? 'No customers match your search.' : 'No customer ledger records found.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => {
                const status = getCustomerDerivedStatusMeta(r.status)
                const amountClass =
                  r.balanceCents > 0
                    ? 'text-[#86efac]'
                    : r.balanceCents < 0
                    ? 'text-[#f4cd7a]'
                    : 'text-[var(--admin-text-muted)]'
                return (
                  <tr key={r.id} className="border-t border-[var(--admin-divider)] hover:bg-[var(--admin-row-hover)] transition-colors">
                    <td className="px-5 py-[16px]">
                      <Link href={`/admin/customers/ledger?customerId=${r.id}`} className="block">
                        <p className="text-lg leading-tight font-semibold text-[var(--admin-text)]">{r.name}</p>
                        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{r.email}</p>
                      </Link>
                    </td>
                    <td className={`px-5 py-[16px] text-[15px] font-semibold tabular-nums ${amountClass}`}>
                      <Link href={`/admin/customers/ledger?customerId=${r.id}`} className="block">
                        {r.balanceCents < 0 ? '-' : ''}{money(r.balanceCents)}
                      </Link>
                    </td>
                    <td className="px-5 py-[16px]">
                      <Link href={`/admin/customers/ledger?customerId=${r.id}`} className="block"><AdminStatusBadge label={status.label} tone={status.tone} /></Link>
                    </td>
                  </tr>
                )
              })
            )}
          </AdminDataTable>
        </section>

        <CustomerCreditsManager initialCustomerId={searchParams.customerId} />
      </div>
    </>
  )
}
