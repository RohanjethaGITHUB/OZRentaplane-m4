import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function BookingPaymentsPage({
  searchParams,
}: {
  searchParams: { tab?: string; customerId?: string; q?: string }
}) {
  const params = new URLSearchParams()
  if (searchParams.tab) params.set('tab', searchParams.tab)
  if (searchParams.customerId) params.set('customerId', searchParams.customerId)
  if (searchParams.q) params.set('q', searchParams.q)
  const queryString = params.toString()
  redirect(`/admin/customers/ledger${queryString ? `?${queryString}` : ''}`)
}
