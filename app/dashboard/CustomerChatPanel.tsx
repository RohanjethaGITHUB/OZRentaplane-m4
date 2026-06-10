'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { sendCustomerReply, markCustomerMessagesRead } from '@/app/actions/verification'
import type { VerificationEvent } from '@/lib/supabase/types'
import { formatDateTime } from '@/lib/formatDateTime'

function isChatEvent(ev: VerificationEvent): boolean {
  if (ev.event_type === 'message' && ev.title === 'Message from Admin') return true
  if (ev.event_type === 'message' && ev.actor_role === 'customer') return true
  if (ev.event_type === 'message' && ev.request_kind === 'message') return true
  if (ev.event_type === 'on_hold' && ev.body) return true
  return false
}

interface Props {
  events:      VerificationEvent[]
  displayName: string
}

export default function CustomerChatPanel({ events, displayName }: Props) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [sent,    setSent]    = useState(false)
  const router    = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const chatEvents = events
    .filter(isChatEvent)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  useEffect(() => {
    markCustomerMessagesRead().catch(() => {})
  }, [])

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

  return (
    <div className="space-y-5">

      {/* ── Conversation thread ──────────────────────────────────── */}
      {chatEvents.length === 0 ? (
        <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#f0f4ff] flex items-center justify-center">
            <span
              className="material-symbols-outlined text-2xl text-[#1a4fd6]/40"
              style={{ fontVariationSettings: "'wght' 100, 'FILL' 0" }}
            >
              chat
            </span>
          </div>
          <p className="text-sm text-[#6b7ea8]">
            No messages yet. When our team sends you a message it will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5 space-y-4 max-h-[520px] overflow-y-auto">
          {chatEvents.map(ev => {
            const isAdmin  = ev.actor_role === 'admin'
            const isUnread = !ev.is_read && isAdmin

            return (
              <div
                key={ev.id}
                className={`flex gap-3 ${isAdmin ? 'justify-start' : 'justify-end'}`}
              >
                {/* Admin avatar */}
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

                <div className={`max-w-[72%] space-y-1 flex flex-col ${isAdmin ? 'items-start' : 'items-end'}`}>
                  {/* Label row */}
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

                  {/* Message bubble */}
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    isAdmin
                      ? 'bg-[#f0f4ff] border border-[#1a4fd6]/10 text-[#152d5a] rounded-tl-sm'
                      : 'bg-[#1a4fd6] text-white rounded-tr-sm'
                  }`}>
                    {ev.body}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[11px] text-[#94a3b8]">
                    {formatDateTime(ev.created_at)}
                  </span>
                </div>

                {/* Customer avatar */}
                {!isAdmin && (
                  <div className="w-8 h-8 rounded-full bg-[#e8edf5] border border-[#152d5a]/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <span
                      className="material-symbols-outlined text-sm text-[#152d5a]/40"
                      style={{ fontVariationSettings: "'wght' 300" }}
                    >
                      person
                    </span>
                  </div>
                )}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ── Compose area ────────────────────────────────────────── */}
      <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="Send a message to our team…"
          rows={3}
          className="w-full bg-transparent focus:outline-none text-sm text-[#152d5a] placeholder:text-[#94a3b8] resize-none disabled:opacity-50"
        />

        {error && (
          <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
        {sent && (
          <div className="mt-2 rounded-lg bg-[#f0fdf4] border border-[#16a34a]/20 px-3 py-2">
            <p className="text-xs text-[#16a34a]">Message sent successfully.</p>
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#152d5a]/6">
          <p className="text-[11px] text-[#94a3b8]">
            ⌘ + Enter to send
          </p>
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !message.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#e8a020] hover:bg-[#d4911a] text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
