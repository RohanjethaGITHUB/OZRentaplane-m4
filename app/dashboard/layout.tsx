import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import CustomerPortalSubNavSimple from '@/components/customer/CustomerPortalSubNavSimple'
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
      <div className="min-h-screen bg-mkt-main pt-[84px] text-[#e5edf8]">
        <div className="hidden md:flex sticky top-[84px] z-40 -mt-px justify-center bg-mkt-main px-4 pb-2 pt-1 md:px-8 md:pt-2">
          <CustomerPortalSubNavSimple hideCheckout={isClearedToFly} />
        </div>

        <main className="mx-auto w-full max-w-[1400px] px-4 pb-6 pt-4 md:px-8 md:pb-10 md:pt-4">
          <div className="space-y-6">{children}</div>
        </main>
      </div>
    </>
  )
}
