'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { sendCustomerReply, markCustomerMessagesRead } from '@/app/actions/verification'
import type { VerificationEvent } from '@/lib/supabase/types'
import { formatDateTime } from '@/lib/formatDateTime'
import { ThreadRealtimeListener } from '@/components/realtime/ThreadRealtimeListener'
import { useRealtimeEvent } from '@/hooks/useRealtimeEvent'
import { isCustomerChatEvent } from '@/lib/chat/unread'

interface Props {
  events: VerificationEvent[]
  displayName: string
  threadUserId: string
}

export default function CustomerChatPanel({ events, displayName, threadUserId }: Props) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)
  const markingReadRef = useRef(false)

  const chatEvents = events
    .filter(isCustomerChatEvent)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const hasUnreadAdmin = chatEvents.some(
    (ev) => ev.actor_role === 'admin' && !ev.is_read,
  )

  async function markThreadRead() {
    if (markingReadRef.current) return
    markingReadRef.current = true
    try {
      await markCustomerMessagesRead()
      router.refresh()
    } catch {
      /* non-critical */
    } finally {
      markingReadRef.current = false
    }
  }

  // Mark read on open, and again whenever unread admin messages are present
  // (e.g. realtime refresh delivered a new message while this page is open).
  useEffect(() => {
    if (!hasUnreadAdmin) return
    void markThreadRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnreadAdmin, chatEvents.length])

  // Admin message arrived while this panel is open — mark read immediately.
  useRealtimeEvent('chat:message', () => {
    void markThreadRead()
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatEvents.length])

  async function handleSend() {
    if (!message.trim()) return
    setError('')
    setSent(false)
    setLoading(true)
    try {
      await sendCustomerReply(message.trim())
      setMessage('')
      setSent(true)
      router.refresh()
      setTimeout(() => setSent(false), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send message.'
      setError(msg.replace('VALIDATION:', '').trim())
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const avatarInitial = (displayName.trim().charAt(0) || 'P').toUpperCase()

  return (
    <div className="bg-white border border-[#152d5a]/10 rounded-2xl overflow-hidden flex flex-col min-h-[420px] max-h-[min(70vh,640px)]">
      <ThreadRealtimeListener threadUserId={threadUserId} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-5 space-y-4 min-h-0">
        {chatEvents.length === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center gap-3 px-4">
            <div className="w-12 h-12 rounded-2xl bg-[#f0f4ff] flex items-center justify-center">
              <span
                className="material-symbols-outlined text-2xl text-[#1a4fd6]/40"
                style={{ fontVariationSettings: "'wght' 100, 'FILL' 0" }}
              >
                chat
              </span>
            </div>
            <p className="text-sm text-[#6b7ea8] max-w-sm leading-relaxed">
              No messages yet. Send a note below and our team will get back to you here.
            </p>
          </div>
        ) : (
          chatEvents.map(ev => {
            const isAdmin = ev.actor_role === 'admin'
            const isUnread = !ev.is_read && isAdmin

            return (
              <div
                key={ev.id}
                className={`flex gap-3 ${isAdmin ? 'justify-start' : 'justify-end'}`}
              >
                {isAdmin && (
                  <div className="w-8 h-8 rounded-full bg-[#f0f4ff] border border-[#1a4fd6]/15 flex items-center justify-center flex-shrink-0 mt-1">
                    <span
                      className="material-symbols-outlined text-sm text-[#1a4fd6]/60"
                      style={{ fontVariationSettings: "'wght' 300" }}
                    >
                      admin_panel_settings
                    </span>
                  </div>
                )}

                <div className={`max-w-[78%] sm:max-w-[72%] space-y-1 flex flex-col ${isAdmin ? 'items-start' : 'items-end'}`}>
                  <div className={`flex items-center gap-2 ${isAdmin ? '' : 'flex-row-reverse'}`}>
                    <span className="text-[11px] font-semibold text-[#6b7ea8]">
                      {isAdmin ? 'OZRentAPlane Team' : displayName}
                    </span>
                    {isUnread && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1a4fd6] flex-shrink-0" />
                    )}
                    {ev.event_type === 'on_hold' && (
                      <span className="text-[10px] font-semibold text-[#d97706] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        On Hold
                      </span>
                    )}
                  </div>

                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    isAdmin
                      ? 'bg-[#f0f4ff] border border-[#1a4fd6]/10 text-[#152d5a] rounded-tl-sm'
                      : 'bg-[#1a4fd6] text-white rounded-tr-sm'
                  }`}>
                    {ev.body}
                  </div>

                  <span className="text-[11px] text-[#94a3b8]">
                    {formatDateTime(ev.created_at)}
                  </span>
                </div>

                {!isAdmin && (
                  <div className="w-8 h-8 rounded-full bg-[#1a4fd6] flex items-center justify-center flex-shrink-0 mt-1 text-white text-[12px] font-bold">
                    {avatarInitial}
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer — attached to same card */}
      <div className="flex-shrink-0 border-t border-[#152d5a]/10 px-4 sm:px-5 py-4 bg-white">
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
        {sent && (
          <div className="mb-3 rounded-lg bg-[#f0fdf4] border border-[#16a34a]/20 px-3 py-2">
            <p className="text-xs text-[#16a34a]">Message sent successfully.</p>
          </div>
        )}

        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="Send a message to our team..."
          rows={3}
          className="w-full rounded-xl border border-[#152d5a]/15 bg-white px-3.5 py-3 focus:outline-none focus:border-[#1a4fd6]/40 text-sm text-[#152d5a] placeholder:text-[#94a3b8] resize-none disabled:opacity-50"
        />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between mt-3">
          <p className="text-[11px] text-[#94a3b8]">
            Ctrl/Cmd + Enter to send
          </p>
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !message.trim()}
            className="inline-flex items-center justify-center gap-2 min-h-10 px-5 py-2.5 bg-[#e8a020] hover:bg-[#d4911a] text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'wght' 300" }}>send</span>
            )}
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
