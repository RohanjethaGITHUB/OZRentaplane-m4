import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import AtmoClouds from '@/components/AtmoClouds'
import CustomerPortalNav from '@/components/customer/CustomerPortalNav'
import CustomerDashboardBackgroundOverlay from './CustomerDashboardBackgroundOverlay'

export default async function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const requestHeaders = await headers()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, pilot_clearance_status, must_change_password, first_name')
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
  const firstName = (profile as any)?.first_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const email = user.email ?? ''

  return (
    <>
      <CustomerPortalNav firstName={firstName} email={email} hideCheckout={true} />
      <div
        className="relative min-h-screen pt-[64px] text-deep-ink dashboard-theme overflow-x-hidden"
        style={{
          background: 'linear-gradient(180deg, #cfe3f5 0%, #daeaf8 60%, #e4f0fb 100%)',
        }}
      >
        {/* Atmospheric clouds — gutter decoration, behind all content */}
        <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
          <AtmoClouds direction="ltr" density="light" />
          <AtmoClouds direction="rtl" density="light" />
        </div>
        <div
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(21,45,90,0.08) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
          aria-hidden="true"
        />
        <div className="pointer-events-none fixed top-[64px] left-0 right-0 z-40 h-[2px] bg-gradient-to-r from-transparent via-[#f59e0b]/30 to-transparent" />
        <CustomerDashboardBackgroundOverlay />

        <main className="relative z-10 mx-auto w-full max-w-[1440px] px-3 md:px-4 lg:px-6 pb-24 pt-4 md:pb-14 md:pt-4">
          <div className="relative">
            <div className="space-y-6">{children}</div>
          </div>
        </main>
      </div>
    </>
  )
}
