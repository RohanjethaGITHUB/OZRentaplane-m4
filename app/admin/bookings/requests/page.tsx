import { redirect } from 'next/navigation'

export default function LegacyRequestsRedirect() {
  redirect('/admin/bookings/checkout')
}
