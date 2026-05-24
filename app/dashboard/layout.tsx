import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import CustomerPortalSubNavSimple from '@/components/customer/CustomerPortalSubNavSimple'
import CustomerDashboardBackgroundOverlay from './CustomerDashboardBackgroundOverlay'
import type { PilotClearanceStatus } from '@/lib/supabase/types'

export default async function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, pilot_clearance_status')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')
  const clearanceStatus = (profile?.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus
  const isClearedToFly = clearanceStatus === 'cleared_to_fly'

  return (
    <>
      <Navbar initialUser={user} hideCustomerCheckoutLink={isClearedToFly} />
      <div
        className="relative min-h-screen pt-[84px] text-[#e5edf8]"
        style={{
          backgroundColor: '#020b16',
          backgroundImage: "url('/CustomerDashboard/dashboard-main-bg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center bottom',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <CustomerDashboardBackgroundOverlay />

        <div className="relative z-40 hidden md:flex sticky top-[84px] -mt-px justify-center bg-transparent px-4 pb-0 pt-0 md:px-8">
          <CustomerPortalSubNavSimple hideCheckout={isClearedToFly} />
        </div>

        <main className="relative mx-auto w-full max-w-[1400px] px-4 pb-10 pt-4 md:px-8 md:pb-14 md:pt-4">
          <div className="space-y-6">{children}</div>
        </main>
      </div>
    </>
  )
}
