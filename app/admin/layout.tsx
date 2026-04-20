import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSidebar from './AdminSidebar'
import AdminTopBar from './AdminTopBar'

// Server-side guard: only admins can access any /admin route.
// Fetches real pending count to power the bell badge in the topbar.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const adminName = profile.full_name ?? user.email?.split('@')[0] ?? 'Administrator'

  // Fetch pending verifications count (bell badge) and admin unread message count in parallel
  const [{ count: pendingCount }, { count: unreadMessageCount }] = await Promise.all([
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'customer')
      .eq('verification_status', 'pending_review'),
    supabase
      .from('verification_events')
      .select('*', { count: 'exact', head: true })
      .eq('actor_role', 'customer')
      .is('admin_read_at', null),
  ])

  return (
    <div className="min-h-screen flex bg-[#111316] text-[#e2e2e6] font-sans">
      {/* Grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[9999] opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }}
      />

      <AdminSidebar displayName={adminName} unreadMessageCount={unreadMessageCount ?? 0} />

      {/* Right column: topbar + page content */}
      <div className="flex-1 ml-72 flex flex-col min-h-screen">
        <AdminTopBar pendingCount={pendingCount ?? 0} />

        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
