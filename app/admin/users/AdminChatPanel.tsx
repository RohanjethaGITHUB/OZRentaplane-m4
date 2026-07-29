'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { sendAdminChatMessage, markAdminChatRead } from '@/app/actions/admin'
import type { VerificationEvent } from '@/lib/supabase/types'
import { formatDateTime } from '@/lib/formatDateTime'
import { ThreadRealtimeListener } from '@/components/realtime/ThreadRealtimeListener'

// Chat shows: 'message' events + 'on_hold' events with a body
// (on_hold events are admin-to-customer messages that start conversation threads)
function isChatEvent(ev: VerificationEvent): boolean {
  if (ev.event_type === 'message') return true
  if (ev.event_type === 'on_hold' && ev.body) return true
  return false
}

function fmtTime(iso: string): string {
  return formatDateTime(iso)
}

interface Props {
  customerId: string
  events: VerificationEvent[]
  customerName: string
}

export default function AdminChatPanel({ customerId, events, customerName }: Props) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const chatEvents = events
    .filter(isChatEvent)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  // Mark customer messages as read when this panel mounts
  useEffect(() => {
    markAdminChatRead(customerId).catch(() => {/* non-critical */})
  }, [customerId])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatEvents.length])

  async function handleSend() {
    if (!message.trim()) return
    setError('')
    setLoading(true)
    try {
      await sendAdminChatMessage(customerId, message.trim())
      setMessage('')
      router.refresh()
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
      <ThreadRealtimeListener threadUserId={customerId} />

      {/* ── Message thread ─────────────────────────────────────────── */}
      {chatEvents.length === 0 ? (
        <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-xl p-10 text-center">
          <span
            className="material-symbols-outlined text-3xl text-[#3d5a80] block mb-3"
            style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
          >
            chat
          </span>
          <p className="text-sm text-[#3d5a80] font-light">
            No messages yet. Send a message below to start a conversation with {customerName}.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1 scrollbar-thin">
          {chatEvents.map(ev => {
            const isAdmin    = ev.actor_role === 'admin'
            const isUnread   = !isAdmin && ev.admin_read_at === null

            return (
              <div
                key={ev.id}
                className={`flex gap-3 ${isAdmin ? 'justify-end' : 'justify-start'}`}
              >
                {/* Customer avatar (left side) */}
                {!isAdmin && (
                  <div className="w-7 h-7 rounded-full bg-[#dbe8f5] border border-[rgba(12,35,64,0.12)] flex items-center justify-center flex-shrink-0 mt-1">
                    <span
                      className="material-symbols-outlined text-[14px] text-[#1a4a7a]"
                      style={{ fontVariationSettings: "'wght' 300" }}
                    >
                      person
                    </span>
                  </div>
                )}

                {/* Bubble */}
                <div className={`max-w-[72%] space-y-1 ${isAdmin ? 'items-end' : 'items-start'} flex flex-col`}>
                  {/* Label row */}
                  <div className={`flex items-center gap-2 ${isAdmin ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#3d5a80]">
                      {isAdmin ? 'You (Admin)' : customerName}
                    </span>
                    {isUnread && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                    )}
                    {ev.event_type === 'on_hold' && (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400/60 border border-amber-400/20 px-1.5 py-0.5 rounded">
                        on hold
                      </span>
                    )}
                  </div>

                  {/* Message body */}
                  <div className={`px-4 py-3 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap ${
                    isAdmin
                      ? 'bg-blue-600/15 border border-blue-400/15 text-blue-100 rounded-tr-sm'
                      : 'bg-[#f8f9fb] border border-[rgba(12,35,64,0.08)] text-[#0C2340] rounded-tl-sm'
                  }`}>
                    {ev.body}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[10px] text-[#3d5a80] font-mono">
                    {fmtTime(ev.created_at)}
                  </span>
                </div>

                {/* Admin avatar (right side) */}
                {isAdmin && (
                  <div className="w-7 h-7 rounded-full bg-[#dbe8f5] border border-[rgba(12,35,64,0.12)] flex items-center justify-center flex-shrink-0 mt-1">
                    <span
                      className="material-symbols-outlined text-[14px] text-[#1a4a7a]"
                      style={{ fontVariationSettings: "'wght' 300" }}
                    >
                      admin_panel_settings
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
      <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-xl p-4 space-y-3">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder={`Message ${customerName}…`}
          rows={3}
          className="w-full rounded-lg border border-[rgba(12,35,64,0.15)] bg-white px-3 py-2 focus:outline-none text-sm text-[#0C2340] placeholder:text-[#3d5a80] resize-none disabled:opacity-50 focus:border-[#1a4a7a]"
        />

        {error && (
          <p className="text-[13px] text-red-600 leading-relaxed">{error}</p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-[rgba(12,35,64,0.12)]">
          <p className="text-[10px] text-[#3d5a80] italic">
            ⌘ + Enter to send · This message is visible to {customerName}
          </p>
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !message.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1a4a7a] border border-[#1a4a7a] text-white hover:bg-[#153d66] hover:text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 300" }}>send</span>
            )}
            Send
          </button>
        </div>
      </div>

    </div>
  )
}
