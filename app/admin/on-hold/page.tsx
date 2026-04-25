import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminQueueTable from '../AdminQueueTable'
import type { QueueProfile } from '../AdminQueueTable'

export const metadata = { title: 'On-Hold Customers' }

export default async function OnHoldPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profiles, count } = await supabase
    .from('profiles')
    .select('id, full_name, verification_status, updated_at, reviewed_at, admin_review_note', { count: 'exact' })
    .eq('role', 'customer')
    .eq('verification_status', 'on_hold')
    .order('reviewed_at', { ascending: false })

  const profileIds = (profiles ?? []).map(p => p.id)

  const [{ data: allDocs }, { data: unreadEvents }] = await Promise.all([
    profileIds.length > 0
      ? supabase.from('user_documents').select('user_id, document_type, uploaded_at').in('user_id', profileIds)
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
    <div className="p-10 max-w-7xl">
      <header className="mb-12">
        <h2 className="font-serif text-4xl font-light text-[#e2e2e6] tracking-tight">On-Hold Customers</h2>
        <p className="text-slate-400 mt-2 font-light tracking-wide">
          Customers awaiting additional information or documents before verification can proceed
        </p>
        <div className="h-0.5 w-10 bg-amber-600/40 mt-6" />
      </header>

      <AdminQueueTable
        profiles={profiles as QueueProfile[] ?? []}
        docsByUser={docsByUser}
        totalCount={count ?? 0}
        dateMode="reviewed"
        actionLabel="Review"
        unreadByUser={unreadByUser}
      />
    </div>
  )
}
