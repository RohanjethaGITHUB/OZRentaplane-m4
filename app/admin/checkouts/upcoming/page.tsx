import { redirect } from 'next/navigation'

export default function LegacyUpcomingCheckoutsRedirect() {
  redirect('/admin/checkouts/all?status=upcoming')
}
