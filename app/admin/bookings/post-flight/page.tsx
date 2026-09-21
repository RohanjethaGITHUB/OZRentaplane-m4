import { redirect } from 'next/navigation'

export const metadata = { title: 'Post-Flight Reviews | Admin' }

export default function AdminPostFlightReviewsPage() {
  redirect('/admin/bookings')
}
