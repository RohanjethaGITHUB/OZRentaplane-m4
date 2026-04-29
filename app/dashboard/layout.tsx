import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerPortalTopNav from '@/components/CustomerPortalTopNav'
import CustomerPortalSubNav from '@/components/CustomerPortalSubNav'
import Footer from '@/components/Footer'
import type { PopoverNotification } from '@/lib/supabase/types'

// Single server-side shell for all /dashboard/* routes.
// Fetches auth + profile once; child pages do their own data fetching.
export default async function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, verification_status, last_notification_seen_at, last_bookings_viewed_at')
    .eq('id', user.id)
    .single()

  // Admins should not land in the customer portal
  if (profile?.role === 'admin') redirect('/admin')

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const seenAt      = profile?.last_notification_seen_at ?? null
  const viewedAt    = profile?.last_bookings_viewed_at ?? null

  // Fetch badge counts and recent notification events in parallel
  const [msgResult, notifResult, bookingResult] = await Promise.all([
    // Unread messages: admin events the customer hasn't read yet
    supabase
      .from('verification_events')
      .select('id, event_type, title, request_kind, body')
      .eq('user_id', user.id)
      .eq('actor_role', 'admin')
      .eq('is_read', false),

    // Recent notification events for bell popover (last 10 admin/system events)
    supabase
      .from('verification_events')
      .select('id, title, body, event_type, request_kind, request_id, created_at')
      .eq('user_id', user.id)
      .in('actor_role', ['admin', 'system'])
      .order('created_at', { ascending: false })
      .limit(10),

    // Booking update count: bookings changed since last My Bookings visit
    viewedAt
      ? supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('booking_owner_user_id', user.id)
          .gt('updated_at', viewedAt)
      : Promise.resolve({ count: 0, error: null }),
  ])

  const messageCount = (msgResult.data ?? []).filter(
    (ev: any) => ((ev.event_type === 'message' && (ev.title === 'Message from Admin' || ev.request_kind === 'message')) || (ev.event_type === 'on_hold' && ev.body))
  ).length
  const bookingUpdateCount = (bookingResult.count ?? 0)

  // Mark notification items as new if they arrived after last_notification_seen_at
  const rawNotifs = (notifResult.data ?? [])
  const recentNotifications: PopoverNotification[] = rawNotifs.map((e: any) => {
    let href = null
    if (e.request_kind === 'booking_update' && e.request_id) {
      href = `/dashboard/bookings/${e.request_id}`
    }
    return {
      id:         e.id,
      title:      e.title,
      body:       e.body ?? null,
      event_type: e.event_type,
      created_at: e.created_at,
      is_new:     seenAt ? new Date(e.created_at) > new Date(seenAt) : true,
      href,
    }
  })

  const notificationCount = recentNotifications.filter(n => n.is_new).length

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
      <CustomerPortalTopNav
        displayName={displayName}
        notificationCount={notificationCount}
        recentNotifications={recentNotifications}
      />
      <CustomerPortalSubNav
        verificationStatus={profile?.verification_status}
        messageCount={messageCount}
        bookingUpdateCount={bookingUpdateCount}
      />

      {/* Page content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Global footer */}
      <Footer forceShow />
    </div>
  )
}
