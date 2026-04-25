import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardContent from './DashboardContent'
import type { Profile, UserDocument, VerificationEvent } from '@/lib/supabase/types'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Admins belong in /admin
  if (profile?.role === 'admin') redirect('/admin')

  // Fetch documents and verification events in parallel
  const [{ data: documents }, { data: events }] = await Promise.all([
    supabase
      .from('user_documents')
      .select('*')
      .eq('user_id', user.id),
    supabase
      .from('verification_events')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  return (
    <DashboardContent
      user={user}
      profile={profile as Profile | null}
      documents={(documents as UserDocument[]) || []}
      events={(events as VerificationEvent[]) || []}
    />
  )
}
