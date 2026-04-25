import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerPortalTopNav from '@/components/CustomerPortalTopNav'
import CustomerPortalSubNav from '@/components/CustomerPortalSubNav'
import Footer from '@/components/Footer'

// Single server-side shell for all /dashboard/* routes.
// Fetches auth + profile once; child pages do their own data fetching.
export default async function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, verification_status')
    .eq('id', user.id)
    .single()

  // Admins should not land in the customer portal
  if (profile?.role === 'admin') redirect('/admin')

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'

  return (
    <div className="min-h-screen flex flex-col bg-[#060d18] text-oz-text font-sans relative">

      {/* Subtle noise grain overlay — matches public website aesthetic */}
      <div
        className="fixed inset-0 pointer-events-none z-[9999] opacity-[0.025] mix-blend-overlay"
        style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }}
      />

      {/* Ambient deep-navy glow */}
      <div className="fixed top-0 left-0 w-[700px] h-[500px] bg-[#a7c8ff]/[0.03] blur-[140px] rounded-full pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-0 w-[600px] h-[400px] bg-[#a7c8ff]/[0.02] blur-[120px] rounded-full pointer-events-none -z-10" />

      {/* Portal navigation */}
      <CustomerPortalTopNav displayName={displayName} />
      <CustomerPortalSubNav verificationStatus={profile?.verification_status} />

      {/* Page content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Global footer */}
      <Footer forceShow />
    </div>
  )
}
