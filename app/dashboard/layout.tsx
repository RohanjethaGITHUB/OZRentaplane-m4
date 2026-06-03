import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import CustomerPortalSubNavSimple from '@/components/customer/CustomerPortalSubNavSimple'
import CustomerDashboardBackgroundOverlay from './CustomerDashboardBackgroundOverlay'
import type { PilotClearanceStatus } from '@/lib/supabase/types'

export default async function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const requestHeaders = await headers()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, pilot_clearance_status, must_change_password')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')
  const requestPath =
    requestHeaders.get('x-matched-path') ??
    requestHeaders.get('x-invoke-path') ??
    requestHeaders.get('next-url') ??
    ''
  const isChangePasswordRoute = requestPath.startsWith('/dashboard/change-password')
  if (profile?.must_change_password && !isChangePasswordRoute) redirect('/dashboard/change-password')
  const clearanceStatus = (profile?.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus
  const isClearedToFly = clearanceStatus === 'cleared_to_fly'

  return (
    <>
      <Navbar initialUser={user} hideCustomerCheckoutLink={isClearedToFly} />
      <div className="relative min-h-screen bg-open-ceiling pt-[84px] text-deep-ink">
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
