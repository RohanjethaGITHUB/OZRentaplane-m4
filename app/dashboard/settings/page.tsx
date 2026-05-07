import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PortalPageHero from '@/components/PortalPageHero'
import CustomerAccountForm from './CustomerAccountForm'

export const metadata = { title: 'Account | OZRentAPlane' }

function splitName(fullName: string | null): { firstName: string; lastName: string } {
  const trimmed = (fullName ?? '').trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export default async function CustomerSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const fallback = splitName(profile.full_name)
  const initialFirstName = (profile.first_name ?? fallback.firstName ?? '').trim()
  const initialLastName = (profile.last_name ?? fallback.lastName ?? '').trim()

  return (
    <>
      <PortalPageHero
        eyebrow="Pilot Profile"
        title="Account"
        subtitle="Manage your personal details, preferences, and account settings."
      />

      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <CustomerAccountForm
            userId={user.id}
            email={user.email ?? profile.email ?? ''}
            initialFirstName={initialFirstName}
            initialLastName={initialLastName}
            initialPhoneCountryCode={(profile.phone_country_code ?? '+61').trim() || '+61'}
            initialPhoneNumber={profile.phone_number ?? ''}
          />
        </div>
      </div>
    </>
  )
}
