'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { sendAdminChatMessage, markAdminChatRead } from '@/app/actions/admin'
import type { VerificationEvent } from '@/lib/supabase/types'
import { formatDateTime } from '@/lib/formatDateTime'

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

      {/* ── Message thread ─────────────────────────────────────────── */}
      {chatEvents.length === 0 ? (
        <div className="bg-[#1e2023]/60 border border-white/5 rounded-xl p-10 text-center">
          <span
            className="material-symbols-outlined text-3xl text-slate-600 block mb-3"
            style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
          >
            chat
          </span>
          <p className="text-sm text-slate-500 font-light">
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
                  <div className="w-7 h-7 rounded-full bg-blue-900/40 border border-blue-300/15 flex items-center justify-center flex-shrink-0 mt-1">
                    <span
                      className="material-symbols-outlined text-sm text-blue-300/70"
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
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
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
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    isAdmin
                      ? 'bg-blue-600/15 border border-blue-400/15 text-blue-100 rounded-tr-sm'
                      : 'bg-[#1e2023]/80 border border-white/8 text-[#e2e2e6] rounded-tl-sm'
                  }`}>
                    {ev.body}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[10px] text-slate-600 font-mono">
                    {fmtTime(ev.created_at)}
                  </span>
                </div>

                {/* Admin avatar (right side) */}
                {isAdmin && (
                  <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-400/15 flex items-center justify-center flex-shrink-0 mt-1">
                    <span
                      className="material-symbols-outlined text-sm text-blue-400/70"
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
      <div className="bg-[#1e2023]/60 border border-blue-300/8 rounded-xl p-4 space-y-3">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder={`Message ${customerName}…`}
          rows={3}
          className="w-full bg-transparent focus:outline-none text-sm text-[#e2e2e6] placeholder:text-slate-600 resize-none disabled:opacity-50"
        />

        {error && (
          <p className="text-xs text-red-400/80 leading-relaxed">{error}</p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <p className="text-[10px] text-slate-600 italic">
            ⌘ + Enter to send · This message is visible to {customerName}
          </p>
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !message.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600/20 border border-blue-400/20 text-blue-300 hover:bg-blue-600/30 hover:text-blue-200 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
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
