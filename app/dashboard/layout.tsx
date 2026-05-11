import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerPortalTopNav from '@/components/CustomerPortalTopNav'
import CustomerPortalSubNavSimple from '@/components/customer/CustomerPortalSubNavSimple'
import Footer from '@/components/Footer'
import type { PilotClearanceStatus, PopoverNotification } from '@/lib/supabase/types'

export default async function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, pilot_clearance_status, last_notification_seen_at')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')

  const { data: recentEvents } = await supabase
    .from('verification_events')
    .select('id, title, body, event_type, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(8)

  const lastSeenAt = profile?.last_notification_seen_at
    ? new Date(profile.last_notification_seen_at).getTime()
    : 0
  const recentNotifications: PopoverNotification[] = (recentEvents ?? []).map((ev) => ({
    id: ev.id,
    title: ev.title,
    body: ev.body,
    event_type: ev.event_type,
    created_at: ev.created_at,
    is_new: new Date(ev.created_at).getTime() > lastSeenAt,
    href: '/dashboard/messages',
  }))
  const notificationCount = recentNotifications.filter((n) => n.is_new).length
  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const pilotClearanceStatus = (profile?.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_700px_at_15%_-10%,#152845_0%,#071426_48%,#06101f_100%)] text-slate-100">
      <CustomerPortalTopNav
        displayName={displayName}
        notificationCount={notificationCount}
        recentNotifications={recentNotifications}
        pilotClearanceStatus={pilotClearanceStatus}
      />
      <CustomerPortalSubNavSimple />
      <main className="bg-transparent">
        <div className="px-4 py-5 md:px-8 md:py-8 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
      <Footer forceShow />
    </div>
  )
}
