import { redirect } from 'next/navigation'

export const metadata = { title: 'Post-flight Review | Admin' }

export default function PostFlightReviewPage() {
  redirect('/admin/bookings/post-flight-reviews')
}
