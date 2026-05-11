import { redirect } from 'next/navigation'

export default function LegacyNewCheckoutRequestsRedirect() {
  redirect('/admin/checkouts/all?status=new_requests')
}
