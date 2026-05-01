import { redirect } from 'next/navigation'

export default function LegacyPostFlightReviewsRedirect() {
  redirect('/admin/bookings/post-flight')
}
