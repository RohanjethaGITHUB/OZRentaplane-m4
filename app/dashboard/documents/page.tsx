import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DocumentsPanel from '@/app/dashboard/DocumentsPanel'
import PortalPageHero from '@/components/PortalPageHero'
import type { UserDocument, VerificationStatus, VerificationEvent } from '@/lib/supabase/types'

export const metadata = { title: 'Documents | OZRentAPlane' }

export default async function CustomerDocumentsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, verification_status, pilot_arn')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')

  const [{ data: documents }, { data: events }] = await Promise.all([
    supabase.from('user_documents').select('*').eq('user_id', user.id),
    supabase.from('verification_events').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

  const status = (profile?.verification_status ?? 'not_started') as VerificationStatus

  return (
    <>
      <PortalPageHero
        eyebrow="Pilot Documents"
        title="My Documents"
        subtitle="Manage your licence, medical certificate, and identity documents."
      />

      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10">
        <DocumentsPanel
          user={user}
          documents={(documents as UserDocument[]) || []}
          status={status}
          events={(events as VerificationEvent[]) || []}
          currentArn={profile?.pilot_arn ?? null}
        />
      </div>
    </>
  )
}
