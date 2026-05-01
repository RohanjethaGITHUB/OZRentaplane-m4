import { redirect } from 'next/navigation'

export default function LegacyCustomerCreditsRedirect({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const params = new URLSearchParams()
  if (searchParams.customerId && typeof searchParams.customerId === 'string') {
    params.set('customerId', searchParams.customerId)
  }
  const queryString = params.toString() ? `?${params.toString()}` : ''
  redirect(`/admin/customers/ledger${queryString}`)
}
