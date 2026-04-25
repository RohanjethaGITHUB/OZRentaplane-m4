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
    .select('role, pilot_arn')
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
        subtitle="Manage the pilot documents used for your checkout request and aircraft access."
      />

      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10">
        <DocumentsPanel
          user={user}
          documents={(documents as UserDocument[]) || []}
          currentArn={profile?.pilot_arn ?? null}
        />
      </div>
    </>
  )
}
