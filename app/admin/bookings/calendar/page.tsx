import { redirect } from 'next/navigation'

export default function LegacyCalendarRedirect() {
  redirect('/admin/calendar')
}
