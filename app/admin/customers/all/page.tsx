import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminQueueTable from '../../AdminQueueTable'
import type { QueueProfile } from '../../AdminQueueTable'
import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'All Customers | Admin' }

export default async function AllCustomersPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: profiles, count } = await supabase
    .from('profiles')
    .select(
      'id, full_name, pilot_clearance_status, account_status, updated_at, reviewed_at, admin_review_note',
      { count: 'exact' }
    )
    .eq('role', 'customer')
    .order('updated_at', { ascending: false })

  const profileIds = (profiles ?? []).map(p => p.id)

  // Fetch docs and unread customer message counts in parallel
  const [{ data: allDocs }, { data: unreadEvents }] = await Promise.all([
    profileIds.length > 0
      ? supabase
          .from('user_documents')
          .select('user_id, document_type, uploaded_at')
          .in('user_id', profileIds)
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? supabase
          .from('verification_events')
          .select('user_id')
          .in('user_id', profileIds)
          .eq('actor_role', 'customer')
          .is('admin_read_at', null)
      : Promise.resolve({ data: [] }),
  ])

  const docsByUser: Record<string, Array<{ document_type: string; uploaded_at: string }>> = {}
  for (const doc of allDocs ?? []) {
    if (!docsByUser[doc.user_id]) docsByUser[doc.user_id] = []
    docsByUser[doc.user_id].push(doc)
  }

  const unreadByUser: Record<string, number> = {}
  for (const ev of unreadEvents ?? []) {
    unreadByUser[ev.user_id] = (unreadByUser[ev.user_id] ?? 0) + 1
  }

  return (
    <>
      <AdminPortalHero
        eyebrow="Customer Management"
        title="All Customers"
        subtitle="All registered customer accounts and their pilot clearance status."
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">
        <AdminQueueTable
          profiles={profiles as QueueProfile[] ?? []}
          docsByUser={docsByUser}
          totalCount={count ?? 0}
          dateMode="joined"
          actionLabel="View"
          showDocs={false}
          unreadByUser={unreadByUser}
        />
      </div>
    </>
  )
}
