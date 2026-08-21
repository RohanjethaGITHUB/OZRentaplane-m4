import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerChatPanel from '@/app/dashboard/CustomerChatPanel'
import PortalPageHero from '@/components/PortalPageHero'
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

  const { data: pendingProposal } = await supabase
    .from('checkout_change_requests')
    .select('id, checkout_request_id, requested_scheduled_start, requested_scheduled_end, admin_note, status, created_at')
    .eq('customer_id', user.id)
    .eq('request_type', 'reschedule')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const chatEvents = (events as VerificationEvent[]) || []
  const unreadCount = countCustomerUnreadMessages(chatEvents)

  return (
    <>
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
          pendingProposal={pendingProposal as any}
        />
      </div>
    </>
  )
}
