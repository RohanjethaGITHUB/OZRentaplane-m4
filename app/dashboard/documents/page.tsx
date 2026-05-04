import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DocumentsPanel from '@/app/dashboard/DocumentsPanel'
import PortalPageHero from '@/components/PortalPageHero'
import type { UserDocument } from '@/lib/supabase/types'

export const metadata = { title: 'My Documents | OZRentAPlane' }

export default async function CustomerDocumentsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, last_flight_date, has_night_vfr_rating, has_instrument_rating')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')

  const { data: documents } = await supabase
    .from('user_documents')
    .select('*')
    .eq('user_id', user.id)

  return (
    <>
      <PortalPageHero
        eyebrow="Pilot Documents"
        title="My Documents"
        subtitle="Upload your required pilot documents and keep your flight review date up to date for checkout review."
      />

      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10">
        <DocumentsPanel
          user={user}
          documents={(documents as UserDocument[]) || []}
          lastFlightDate={profile?.last_flight_date ?? null}
          hasNightVfrRating={profile?.has_night_vfr_rating ?? null}
          hasInstrumentRating={profile?.has_instrument_rating ?? null}
        />
      </div>
    </>
  )
}
