import { redirect } from 'next/navigation'

export default function LegacyAwaitingOutcomeRedirect() {
  redirect('/admin/checkouts/all?status=awaiting_outcome')
}
