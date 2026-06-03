import { redirect } from 'next/navigation'

export default function CheckoutOverviewPage() {
  redirect('/admin/bookings?tab=checkout')
}
