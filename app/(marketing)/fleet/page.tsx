import { redirect } from 'next/navigation'

// /fleet is kept for backwards compatibility.
// Canonical URL is /cessna-172.
export default function FleetRedirect() {
  redirect('/cessna-172')
}
