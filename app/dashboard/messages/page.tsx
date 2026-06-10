import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerChatPanel from '@/app/dashboard/CustomerChatPanel'
import PortalPageHero from '@/components/PortalPageHero'
import type { VerificationEvent } from '@/lib/supabase/types'

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
  const chatEvents  = (events as VerificationEvent[]) || []
  const unreadCount = chatEvents.filter(
    ev => ((ev.event_type === 'message' && (ev.title === 'Message from Admin' || ev.request_kind === 'message')) || (ev.event_type === 'on_hold' && ev.body))
      && ev.actor_role === 'admin'
      && !ev.is_read,
  ).length

  return (
    <>
      <PortalPageHero
        eyebrow="Member Support"
        title="Messages"
        subtitle="View updates from the OZRentAPlane team and contact support when needed."
        statusPill={unreadCount > 0
          ? { label: `${unreadCount} unread`, color: 'blue', pulse: true }
          : undefined
        }
      />

      <div className="max-w-[1440px] mx-auto px-3 md:px-4 lg:px-6 py-8 md:py-10">
        {chatEvents.length === 0 ? (
          <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-14 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#f0f4ff] flex items-center justify-center">
              <span
                className="material-symbols-outlined text-3xl text-[#1a4fd6]/40"
                style={{ fontVariationSettings: "'wght' 100, 'FILL' 0" }}
              >
                chat_bubble
              </span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#152d5a] mb-1">No messages yet</h2>
              <p className="text-sm text-[#6b7ea8] max-w-sm leading-relaxed">
                The OZRentAPlane team will contact you here if anything needs your attention.
              </p>
            </div>
          </div>
        ) : (
          <CustomerChatPanel
            events={chatEvents}
            displayName={displayName}
          />
        )}

      </div>
    </>
  )
}
