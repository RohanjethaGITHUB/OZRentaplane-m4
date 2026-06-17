import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DocumentsPanelV2 from '@/app/dashboard/DocumentsPanelV2'
import PortalPageHero from '@/components/PortalPageHero'
import type { UserDocument } from '@/lib/supabase/types'

export const metadata = { title: 'My Documents | OZRentAPlane' }
export const revalidate = 0

export default async function CustomerDocumentsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileResult, documentsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, last_flight_date, has_night_vfr_rating, has_instrument_rating, terms_accepted_at, terms_version')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_documents')
      .select('*, user_document_files(id, file_name, storage_path, uploaded_at)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
  ])

  const profile = profileResult.data

  if (profile?.role === 'admin') redirect('/admin')

  const documents = documentsResult.data

  const pilotLicenceDocument =
    (documents as UserDocument[] | null)?.find((doc) => doc.document_type === 'pilot_licence') ?? null

  return (
    <>
      <PortalPageHero
        eyebrow="Pilot Documents"
        title="My Documents"
        subtitle="Upload your required pilot documents and keep your flight review date up to date for checkout review."
        backgroundImage="/CustomerDashboard/CustomerDashboard-CheckoutHero.png"
      />

      <div className="py-8">
        <DocumentsPanelV2
          user={user}
          documents={(documents as UserDocument[]) || []}
          pilotLicenceDocument={pilotLicenceDocument}
          lastFlightDate={profile?.last_flight_date ?? null}
          hasNightVfrRating={profile?.has_night_vfr_rating ?? null}
          hasInstrumentRating={profile?.has_instrument_rating ?? null}
          termsAcceptedAt={profile?.terms_accepted_at ?? null}
        />
      </div>
    </>
  )
}
