import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerChatPanel from '@/app/dashboard/CustomerChatPanel'
import PortalPageHero from '@/components/PortalPageHero'
import { ThreadRealtimeListener } from '@/components/realtime/ThreadRealtimeListener'
import type { VerificationEvent } from '@/lib/supabase/types'
import { countCustomerUnreadMessages } from '@/lib/chat/unread'

export const metadata = { title: 'Messages | OZRentAPlane' }

export default async function CustomerMessagesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')

  const { data: events } = await supabase
    .from('verification_events')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const chatEvents = (events as VerificationEvent[]) || []
  const unreadCount = countCustomerUnreadMessages(chatEvents)

  return (
    <>
      <ThreadRealtimeListener threadUserId={user.id} />
      <PortalPageHero
        compact
        eyebrow="Member Support"
        title="Messages"
        subtitle="View updates from the OZRentAPlane team and contact support when needed."
        statusPill={unreadCount > 0
          ? { label: `${unreadCount} unread`, color: 'blue', pulse: true }
          : undefined
        }
      />

      <div className="max-w-[1440px] mx-auto px-3 md:px-4 lg:px-6 py-5 md:py-6">
        <CustomerChatPanel
          events={chatEvents}
          displayName={displayName}
          threadUserId={user.id}
        />
      </div>
    </>
  )
}
