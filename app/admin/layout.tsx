import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import AdminSidebar from './AdminSidebar'

// Server-side guard: only admins can access any /admin route.
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

  // Fetch unread message count
  const { count: unreadMessageCount } = await supabase
    .from('verification_events')
    .select('*', { count: 'exact', head: true })
    .eq('actor_role', 'customer')
    .is('admin_read_at', null)

  return (
    <div className="min-h-screen flex flex-col bg-[#0d1117] text-[#e2e2e6] font-sans relative">

      {/* Grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[9999] opacity-[0.025] mix-blend-overlay"
        style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }}
      />

      {/* Ambient glow */}
      <div className="fixed top-0 left-0 w-[500px] h-[400px] bg-[#a7c8ff]/[0.025] blur-[130px] rounded-full pointer-events-none -z-10" />

      {/* Public Top Nav */}
      <Navbar initialUser={user} />

      {/* Admin Layout with Sidebar */}
      <div className="flex flex-1 overflow-hidden relative mt-16 lg:mt-20">
        <AdminSidebar
          displayName={adminName}
          unreadMessageCount={unreadMessageCount ?? 0}
        />
        
        {/* Page content */}
        <main className="flex-1 overflow-y-auto lg:ml-72 bg-[#0d1117] relative">
          <div className="min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

