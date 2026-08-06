import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DocumentsPanelV2 from '@/app/dashboard/DocumentsPanelV2'
import PortalPageHero from '@/components/PortalPageHero'
import { normalizeActiveCheckoutTerms } from '@/lib/checkout-terms'
import { hasAcceptedCurrentTerms } from '@/lib/booking-readiness'
import type { UserDocument } from '@/lib/supabase/types'

export const metadata = { title: 'My Documents | OZRentAPlane' }
export const revalidate = 0

export default async function CustomerDocumentsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileResult, documentsResult, activeTermsResult, latestTermsAcceptanceResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, last_flight_date, has_night_vfr_rating, has_instrument_rating, terms_accepted_at, terms_version, pilot_clearance_status')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_documents')
      .select('*, user_document_files(id, file_name, storage_path, uploaded_at)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('terms_documents')
      .select('id, version, public_url, content_hash, is_active, created_at, effective_from')
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('booking_terms_acceptances')
      .select('terms_document_id, terms_version, terms_content_hash, accepted_at')
      .eq('user_id', user.id)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  console.log('[dashboard/documents] activeTermsResult', {
    data: activeTermsResult.data,
    error: activeTermsResult.error,
  })

  const profile = profileResult.data

  if (profile?.role === 'admin') redirect('/admin')

  const documents = documentsResult.data
  const activeTerms = normalizeActiveCheckoutTerms((activeTermsResult.data as Record<string, unknown> | null) ?? null)
  const latestTermsAcceptance = latestTermsAcceptanceResult.data

  const pilotLicenceDocument =
    (documents as UserDocument[] | null)?.find((doc) => doc.document_type === 'pilot_licence') ?? null
  const currentTermsAccepted = hasAcceptedCurrentTerms(
    activeTerms ? { id: activeTerms.id, version: activeTerms.version, content_hash: activeTerms.content_hash } : null,
    (latestTermsAcceptance as {
      terms_document_id: string | null
      terms_version: string | null
      terms_content_hash: string | null
      accepted_at: string | null
    } | null),
  )
  const termsAcceptedAt = currentTermsAccepted ? (latestTermsAcceptance?.accepted_at ?? null) : null
  console.log('[dashboard/documents] activeTerms', activeTerms)
  console.log('[dashboard/documents] latestTermsAcceptance', latestTermsAcceptance)
  console.log('[dashboard/documents] currentTermsAccepted', currentTermsAccepted)
  console.log('[dashboard/documents] termsAcceptedAt prop', termsAcceptedAt)

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
          termsAcceptedAt={termsAcceptedAt}
          clearanceStatus={(profile as { pilot_clearance_status?: string | null } | null)?.pilot_clearance_status ?? null}
        />
      </div>
    </>
  )
}
