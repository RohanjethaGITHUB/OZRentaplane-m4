import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCachedProfile, getCachedUser } from '@/lib/supabase/server'
import AdminSidebar from './AdminSidebar'
import AdminOperationalCounts from './components/AdminOperationalCounts'
import { RealtimeProvider } from '@/components/realtime/RealtimeProvider'
import { AdminRealtimeListener } from '@/components/realtime/AdminRealtimeListener'
import { createPerfLogger } from '@/lib/perf/timing'

// Server-side guard: only admins can access any /admin route.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perf = createPerfLogger({ route: '/admin/layout', role: 'admin' })
  const markTotal = perf.start('admin_layout', 'total_blocking_admin_layout_preparation')
  const markAuthPrep = perf.start('admin_layout', 'admin_shell_authorization_preparation')

  const { data: { user } } = await perf.time(
    'admin_layout',
    'authenticated_user_lookup',
    () => getCachedUser(),
  )
  if (!user) redirect('/login')

  const { data: profile } = await perf.time(
    'admin_layout',
    'profile_role_lookup',
    () => getCachedProfile(user.id, 'admin'),
    (result) => ({ rowCount: result.data ? 1 : 0 }),
  )

  markAuthPrep()

  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const adminName = profile.full_name ?? user.email?.split('@')[0] ?? 'Administrator'

  markTotal()

  return (
    <RealtimeProvider>
      <AdminRealtimeListener />
      <div className="admin-theme min-h-[100dvh] flex flex-col bg-[var(--admin-bg)] text-[var(--admin-text)] font-sans relative isolate overflow-x-clip">

        {/* Ambient glow */}
        <div className="fixed top-0 left-0 w-[520px] h-[420px] bg-[var(--admin-sidebar-glow)] blur-[130px] rounded-full pointer-events-none -z-10" />

        {/* Admin Layout with Sidebar */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          <Suspense fallback={<AdminSidebar displayName={adminName} unreadMessageCount={0} />}>
            <AdminOperationalCounts displayName={adminName} unreadMessageCount={0} />
          </Suspense>
          
          {/* Page content */}
          <main className="flex-1 min-w-0 overflow-y-auto overflow-x-clip bg-[var(--admin-content-bg)] relative lg:pl-72 pb-[env(safe-area-inset-bottom)]">
            <div className="min-h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </RealtimeProvider>
  )
}
