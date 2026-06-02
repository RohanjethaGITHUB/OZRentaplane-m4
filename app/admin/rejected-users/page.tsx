import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import AdminQueueTable from '../AdminQueueTable'
import type { QueueProfile } from '../AdminQueueTable'

export const metadata = { title: 'Rejected Users' }

export default async function RejectedUsersPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profiles, count } = await supabase
    .from('profiles')
    .select('id, full_name, verification_status, updated_at, reviewed_at, admin_review_note', { count: 'exact' })
    .eq('role', 'customer')
    .eq('verification_status', 'rejected')
    .order('reviewed_at', { ascending: false })

  const profileIds = (profiles ?? []).map(p => p.id)
  const { data: allDocs } = profileIds.length > 0
    ? await supabase.from('user_documents').select('user_id, document_type, uploaded_at').in('user_id', profileIds)
    : { data: [] }

  const docsByUser: Record<string, Array<{ document_type: string; uploaded_at: string }>> = {}
  for (const doc of allDocs ?? []) {
    if (!docsByUser[doc.user_id]) docsByUser[doc.user_id] = []
    docsByUser[doc.user_id].push(doc)
  }

  return (
    <div>
      <AdminPortalHero
        eyebrow="Verification"
        title="Rejected Users"
        subtitle="Customers whose verification was not approved."
      />
      <div className="max-w-[1450px] mx-auto px-6 md:px-10 py-10 pb-24">
      <AdminQueueTable
        profiles={profiles as QueueProfile[] ?? []}
        docsByUser={docsByUser}
        totalCount={count ?? 0}
        dateMode="reviewed"
        actionLabel="View"
      />
      </div>
    </div>
  )
}
