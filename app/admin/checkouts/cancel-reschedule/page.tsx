import { redirect } from 'next/navigation'

export default function LegacyCheckoutCancelRescheduleRedirect() {
  redirect('/admin/checkouts/reschedule')
}
