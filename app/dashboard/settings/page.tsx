import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PortalPageHero from '@/components/PortalPageHero'
import ProfilePageClient from './ProfilePageClient'

export const metadata = { title: 'Profile | OZRentAPlane' }

export default async function CustomerSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  const { data: documents } = await supabase
    .from('user_documents')
    .select('document_type, status')
    .eq('user_id', user.id)

  // Derive first/last name using same splitName logic as before
  function splitName(fullName: string | null): { firstName: string; lastName: string } {
    const trimmed = (fullName ?? '').trim()
    if (!trimmed) return { firstName: '', lastName: '' }
    const parts = trimmed.split(/\s+/)
    if (parts.length === 1) return { firstName: parts[0], lastName: '' }
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
  }

  const fallback = splitName(profile.full_name)
  const initialFirstName = (profile.first_name ?? fallback.firstName ?? '').trim()
  const initialLastName  = (profile.last_name  ?? fallback.lastName  ?? '').trim()
  const displayFirstName = initialFirstName ? initialFirstName.charAt(0).toUpperCase() + initialFirstName.slice(1).toLowerCase() : ''
  const displayLastName  = initialLastName  ? initialLastName.charAt(0).toUpperCase()  + initialLastName.slice(1).toLowerCase()  : ''
  const fullName = [initialFirstName, initialLastName].filter(Boolean).join(' ')

  // Pilot ID: use profile.pilot_id if it exists, otherwise use last 8 chars of user.id uppercased
  const pilotId = ((profile as { pilot_id?: string | null }).pilot_id ?? `OZP-${user.id.slice(-4).toUpperCase()}`)

  return (
    <>
      <PortalPageHero
        eyebrow="Profile"
        title={displayFirstName ? `Captain ${displayFirstName}` : 'Captain'}
        subtitle="Manage your account details, communication preferences, and security settings in one place."
        backgroundImage="/CustomerDashboard/CustomerDashboard-Profile.png"
        backgroundPosition="center"
      />

      <ProfilePageClient
        userId={user.id}
        email={user.email ?? profile.email ?? ''}
        initialFirstName={displayFirstName}
        initialLastName={displayLastName}
        initialPhoneCountryCode={(profile.phone_country_code ?? '+61').trim() || '+61'}
        initialPhoneNumber={profile.phone_number ?? ''}
        pilotId={pilotId}
        memberSince={profile.created_at ?? null}
        pilotType={(profile as { pilot_licence_type?: string | null; license_type?: string | null }).pilot_licence_type
          ?? (profile as { pilot_licence_type?: string | null; license_type?: string | null }).license_type
          ?? null}
        documents={documents ?? []}
      />
    </>
  )
}
