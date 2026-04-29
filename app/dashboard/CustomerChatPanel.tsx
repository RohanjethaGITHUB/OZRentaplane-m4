'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { sendCustomerReply, markCustomerMessagesRead } from '@/app/actions/verification'
import type { VerificationEvent } from '@/lib/supabase/types'
import { formatDateTime } from '@/lib/formatDateTime'

// Show message events + on_hold events that carry a customer-facing body
function isChatEvent(ev: VerificationEvent): boolean {
  if (ev.event_type === 'message' && ev.title === 'Message from Admin') return true
  if (ev.event_type === 'message' && ev.actor_role === 'customer') return true
  if (ev.event_type === 'message' && ev.request_kind === 'message') return true
  if (ev.event_type === 'on_hold' && ev.body) return true
  return false
}

function fmtTime(iso: string): string {
  return formatDateTime(iso)
}

interface Props {
  events:      VerificationEvent[]
  displayName: string
}

export default function CustomerChatPanel({ events, displayName }: Props) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [sent, setSent]       = useState(false)
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const chatEvents = events
    .filter(isChatEvent)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  // Mark admin messages as read when panel mounts
  useEffect(() => {
    markCustomerMessagesRead().catch(() => {/* non-critical */})
  }, [])

  // Scroll to bottom on mount and when new messages arrive
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

      {/* ── Conversation thread ────────────────────────────────────── */}
      {chatEvents.length === 0 ? (
        <div className="bg-[#0c121e]/60 backdrop-blur-2xl border border-white/5 rounded-[1.25rem] p-10 text-center">
          <span
            className="material-symbols-outlined text-3xl text-oz-subtle/30 block mb-3"
            style={{ fontVariationSettings: "'wght' 100, 'FILL' 0" }}
          >
            chat
          </span>
          <p className="text-sm text-oz-muted font-light">
            No messages yet. When our team sends you a message it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
          {chatEvents.map(ev => {
            const isAdmin     = ev.actor_role === 'admin'
            const isUnreadForCustomer = !ev.is_read && isAdmin

            return (
              <div
                key={ev.id}
                className={`flex gap-3 ${isAdmin ? 'justify-start' : 'justify-end'}`}
              >
                {/* Admin avatar (left side) */}
                {isAdmin && (
                  <div className="w-7 h-7 rounded-full bg-oz-blue/15 border border-oz-blue/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <span
                      className="material-symbols-outlined text-sm text-oz-blue/60"
                      style={{ fontVariationSettings: "'wght' 300" }}
                    >
                      admin_panel_settings
                    </span>
                  </div>
                )}

                <div className={`max-w-[72%] space-y-1 flex flex-col ${isAdmin ? 'items-start' : 'items-end'}`}>
                  {/* Label row */}
                  <div className={`flex items-center gap-2 ${isAdmin ? '' : 'flex-row-reverse'}`}>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-oz-subtle/60">
                      {isAdmin ? 'OZRentAPlane Team' : 'You'}
                    </span>
                    {isUnreadForCustomer && (
                      <span className="w-1.5 h-1.5 rounded-full bg-oz-blue flex-shrink-0" />
                    )}
                    {ev.event_type === 'on_hold' && (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400/60 border border-amber-400/20 px-1.5 py-0.5 rounded">
                        on hold
                      </span>
                    )}
                  </div>

                  {/* Message body */}
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    isAdmin
                      ? 'bg-[#0c121e]/80 border border-white/8 text-[#e2e2e6] rounded-tl-sm'
                      : 'bg-oz-blue/15 border border-oz-blue/20 text-blue-100 rounded-tr-sm'
                  }`}>
                    {ev.body}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[10px] text-oz-subtle/50 font-mono">
                    {fmtTime(ev.created_at)}
                  </span>
                </div>

                {/* Customer avatar (right side) */}
                {!isAdmin && (
                  <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <span
                      className="material-symbols-outlined text-sm text-white/30"
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

      {/* ── Compose area ──────────────────────────────────────────── */}
      <div className="bg-[#0c121e]/60 backdrop-blur-2xl border border-white/5 rounded-[1.25rem] p-4 space-y-3">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="Send a message to our team…"
          rows={3}
          className="w-full bg-transparent focus:outline-none text-sm text-[#e2e2e6] placeholder:text-oz-subtle/40 resize-none disabled:opacity-50"
        />

        {error && (
          <p className="text-xs text-red-400/80 leading-relaxed">{error}</p>
        )}
        {sent && (
          <p className="text-xs text-green-400/80 leading-relaxed">Message sent.</p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <p className="text-[10px] text-oz-subtle/40 italic">
            ⌘ + Enter to send
          </p>
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !message.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-oz-blue/15 border border-oz-blue/20 text-oz-blue hover:bg-oz-blue/25 hover:text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>send</span>
            )}
            Send
          </button>
        </div>
      </div>

    </div>
  )
}
