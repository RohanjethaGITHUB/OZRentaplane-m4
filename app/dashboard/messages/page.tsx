import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerChatPanel from '@/app/dashboard/CustomerChatPanel'
import PortalPageHero from '@/components/PortalPageHero'
import type { VerificationStatus, VerificationEvent } from '@/lib/supabase/types'

export const metadata = { title: 'Messages | OZRentAPlane' }

export default async function CustomerMessagesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, verification_status, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')

  const { data: events } = await supabase
    .from('verification_events')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const status      = (profile?.verification_status ?? 'not_started') as VerificationStatus
  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'

  const chatEvents  = (events as VerificationEvent[]) || []
  const unreadCount = chatEvents.filter(
    ev => (ev.event_type === 'message' || (ev.event_type === 'on_hold' && ev.body))
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

      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10">

        {chatEvents.length === 0 ? (
          <div className="bg-gradient-to-br from-[#0c1525] to-[#080e1c] border border-white/[0.07] rounded-xl p-14 flex flex-col items-center justify-center text-center gap-5 shadow-[0_4px_30px_rgba(0,0,0,0.35)]">
            <span
              className="material-symbols-outlined text-4xl text-white/10"
              style={{ fontVariationSettings: "'wght' 100, 'FILL' 0" }}
            >
              chat_bubble
            </span>
            <div>
              <h2 className="text-lg font-serif text-white/50 mb-2">No messages yet</h2>
              <p className="text-sm text-slate-600 font-light max-w-sm leading-relaxed">
                The OZRentAPlane team will contact you here if anything needs your attention.
              </p>
            </div>
          </div>
        ) : (
          <CustomerChatPanel
            events={chatEvents}
            status={status}
            displayName={displayName}
          />
        )}

      </div>
    </>
  )
}
