import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAdminThreadList } from '@/app/actions/admin'
import AdminInbox from './AdminInbox'

export const metadata = { title: 'Messages — Admin' }

// Opt out of caching so unread counts are always fresh
export const dynamic = 'force-dynamic'

export default async function AdminMessagesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const threads = await getAdminThreadList()

  return <AdminInbox initialThreads={threads} />
}
