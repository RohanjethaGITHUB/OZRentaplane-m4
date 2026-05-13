import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerPortalSidebar from '@/components/customer/CustomerPortalSidebar'
import Navbar from '@/components/Navbar'

export default async function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')

  return (
    <>
      <Navbar initialUser={user} />
      <div className="min-h-screen bg-[#020b18] pt-[84px] text-[#e5edf8] md:flex">
        <CustomerPortalSidebar />
        <main className="flex-1 min-w-0">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-4 md:px-8 md:py-7">
            <div className="space-y-6">
              {children}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
