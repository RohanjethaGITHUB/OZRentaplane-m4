'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  sendAdminChatMessage,
  markAdminChatRead,
  getAdminThread,
  searchCustomers,
} from '@/app/actions/admin'
import type { ThreadSummary, VerificationEvent } from '@/lib/supabase/types'
import { formatDateTime, formatDateFromISO } from '@/lib/formatDateTime'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return formatDateFromISO(iso)
}

function fmtFull(iso: string): string {
  return formatDateTime(iso)
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const STATUS_BADGE: Record<string, string> = {
  not_started:    'bg-slate-800/60 text-slate-400',
  pending_review: 'bg-blue-900/40 text-blue-300',
  verified:       'bg-green-900/30 text-green-400',
  rejected:       'bg-red-900/30 text-red-400',
  on_hold:        'bg-amber-900/30 text-amber-400',
}

const STATUS_LABEL: Record<string, string> = {
  not_started:    'Not Started',
  pending_review: 'Pending',
  verified:       'Verified',
  rejected:       'Rejected',
  on_hold:        'On Hold',
}

type FilterKey = 'all' | 'unread' | 'pending_review' | 'verified' | 'on_hold' | 'rejected'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',           label: 'All' },
  { key: 'unread',        label: 'Unread' },
  { key: 'pending_review',label: 'Pending' },
  { key: 'verified',      label: 'Verified' },
  { key: 'on_hold',       label: 'On Hold' },
  { key: 'rejected',      label: 'Rejected' },
]

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  initialThreads: ThreadSummary[]
}

// ─── New-message search modal ─────────────────────────────────────────────────

interface NewMessageModalProps {
  onSelect: (customer: { id: string; full_name: string | null; verification_status: string }) => void
  onClose: () => void
}

function NewMessageModal({ onSelect, onClose }: NewMessageModalProps) {
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState<{ id: string; full_name: string | null; verification_status: string }[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await searchCustomers(query)
        setResults(r)
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-[#1a1d21] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-bold text-[#e2e2e6] tracking-wide">New Message</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'wght' 300" }}>close</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-slate-500 text-base" style={{ fontVariationSettings: "'wght' 300" }}>search</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search customer by name…"
              className="flex-1 bg-transparent text-sm text-[#e2e2e6] placeholder:text-slate-600 focus:outline-none"
            />
            {loading && (
              <span className="material-symbols-outlined animate-spin text-base text-slate-500">progress_activity</span>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto">
          {results.length === 0 && query.trim() && !loading ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500 font-light">
              No customers found for "{query}"
            </div>
          ) : results.length === 0 && !query.trim() ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500 font-light">
              Start typing to search for a customer
            </div>
          ) : results.map(r => (
            <button
              key={r.id}
              onClick={() => onSelect(r)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-blue-900/50 border border-blue-300/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-blue-200">{getInitials(r.full_name)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#e2e2e6] truncate">{r.full_name ?? 'Unknown'}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">{STATUS_LABEL[r.verification_status] ?? r.verification_status}</p>
              </div>
              <span
                className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${STATUS_BADGE[r.verification_status] ?? 'bg-white/5 text-slate-400'}`}
              >
                {STATUS_LABEL[r.verification_status] ?? r.verification_status}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminInbox({ initialThreads }: Props) {
  // Thread list state
  const [threads, setThreads]             = useState<ThreadSummary[]>(initialThreads)
  const [searchQuery, setSearchQuery]     = useState('')
  const [activeFilter, setActiveFilter]   = useState<FilterKey>('all')
  const [showNewMessage, setShowNewMessage] = useState(false)

  // Selected conversation state
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [selectedThread, setSelectedThread] = useState<ThreadSummary | null>(null)
  const [threadEvents, setThreadEvents]   = useState<VerificationEvent[]>([])
  const [loadingThread, setLoadingThread] = useState(false)

  // Compose state
  const [message, setMessage]   = useState('')
  const [sending, setSending]   = useState(false)
  const [sendError, setSendError] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Derived: filtered thread list ──────────────────────────────────────────

  const filteredThreads = threads.filter(t => {
    const matchesSearch = !searchQuery.trim() ||
      (t.customerName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.customerEmail ?? '').toLowerCase().includes(searchQuery.toLowerCase())

    const matchesFilter = activeFilter === 'all' ? true
      : activeFilter === 'unread' ? t.unreadCount > 0
      : t.verificationStatus === activeFilter

    return matchesSearch && matchesFilter
  })

  // ── Select a thread ────────────────────────────────────────────────────────

  const selectThread = useCallback(async (thread: ThreadSummary) => {
    setSelectedId(thread.customerId)
    setSelectedThread(thread)
    setThreadEvents([])
    setSendError('')
    setMessage('')
    setLoadingThread(true)

    try {
      const events = await getAdminThread(thread.customerId)
      setThreadEvents(events)
      // Mark as read (background — non-critical)
      markAdminChatRead(thread.customerId).then(() => {
        // Update local unread count so the badge clears immediately
        setThreads(prev => prev.map(t =>
          t.customerId === thread.customerId ? { ...t, unreadCount: 0 } : t
        ))
      }).catch(() => {/* non-critical */})
    } finally {
      setLoadingThread(false)
    }
  }, [])

  // Auto-scroll to bottom when thread events change
  useEffect(() => {
    if (threadEvents.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [threadEvents.length])

  // ── Send a message ─────────────────────────────────────────────────────────

  async function handleSend() {
    if (!message.trim() || !selectedId || !selectedThread) return
    setSendError('')
    setSending(true)

    const body = message.trim()
    setMessage('')

    // Optimistic: append temp message immediately
    const tempEvent: VerificationEvent = {
      id:            `temp-${Date.now()}`,
      user_id:       selectedId,
      actor_user_id: null,
      actor_role:    'admin',
      event_type:    'message',
      from_status:   null,
      to_status:     null,
      title:         'Message from Admin',
      body,
      request_kind:  null,
      is_read:       false,
      admin_read_at: new Date().toISOString(),
      email_status:  'skipped',
      email_sent_at: null,
      created_at:    new Date().toISOString(),
    }
    setThreadEvents(prev => [...prev, tempEvent])

    // Update thread list preview optimistically
    setThreads(prev => prev.map(t =>
      t.customerId === selectedId
        ? { ...t, lastMessageBody: body, lastMessageAt: new Date().toISOString(), lastMessageRole: 'admin', totalMessages: t.totalMessages + 1 }
        : t
    ))

    try {
      await sendAdminChatMessage(selectedId, body)
      // Re-fetch to get real event ID and canonical server state
      const fresh = await getAdminThread(selectedId)
      setThreadEvents(fresh)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send.'
      setSendError(msg.replace('VALIDATION:', '').trim())
      // Roll back optimistic event
      setThreadEvents(prev => prev.filter(e => e.id !== tempEvent.id))
      setMessage(body)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── New message: select a customer ─────────────────────────────────────────

  function handleNewMessageSelect(customer: { id: string; full_name: string | null; verification_status: string }) {
    setShowNewMessage(false)

    // Check if already in thread list
    const existing = threads.find(t => t.customerId === customer.id)
    if (existing) {
      selectThread(existing)
      return
    }

    // Not in list yet: create a placeholder thread and select it
    const placeholder: ThreadSummary = {
      customerId:         customer.id,
      customerName:       customer.full_name,
      customerEmail:      null,
      verificationStatus: customer.verification_status as ThreadSummary['verificationStatus'],
      lastMessageBody:    null,
      lastMessageAt:      null,
      lastMessageRole:    null,
      unreadCount:        0,
      totalMessages:      0,
    }
    setThreads(prev => [placeholder, ...prev])
    selectThread(placeholder)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {showNewMessage && (
        <NewMessageModal
          onSelect={handleNewMessageSelect}
          onClose={() => setShowNewMessage(false)}
        />
      )}

      <div className="flex h-[calc(100vh-0px)] overflow-hidden">

        {/* ── LEFT PANEL: Thread list ─────────────────────────────────── */}
        <div className="w-80 xl:w-96 flex-shrink-0 border-r border-white/5 flex flex-col bg-[#111316]">

          {/* Header */}
          <div className="px-5 pt-8 pb-4 border-b border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl tracking-tight text-[#e2e2e6]">Messages</h2>
              <button
                onClick={() => setShowNewMessage(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-400/20 text-blue-300 hover:bg-blue-600/30 hover:text-blue-200 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all hover:scale-[1.02]"
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>add</span>
                New
              </button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2.5 bg-white/[0.04] border border-white/8 rounded-xl px-3 py-2.5">
              <span className="material-symbols-outlined text-slate-500 text-base flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name…"
                className="flex-1 bg-transparent text-sm text-[#e2e2e6] placeholder:text-slate-600 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-slate-300">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>close</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 px-3 py-2.5 border-b border-white/5 overflow-x-auto scrollbar-hide">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.1em] transition-all ${
                  activeFilter === f.key
                    ? 'bg-blue-600/20 border border-blue-400/25 text-blue-300'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                {f.label}
                {f.key === 'unread' && threads.some(t => t.unreadCount > 0) && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500 text-[8px] font-bold text-white">
                    {threads.filter(t => t.unreadCount > 0).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Thread rows */}
          <div className="flex-1 overflow-y-auto">
            {filteredThreads.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <span
                  className="material-symbols-outlined text-3xl text-slate-700 block mb-3"
                  style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
                >
                  {searchQuery ? 'search_off' : 'chat'}
                </span>
                <p className="text-sm text-slate-500 font-light">
                  {searchQuery ? `No threads matching "${searchQuery}"` :
                   activeFilter !== 'all' ? 'No threads in this category' :
                   'No conversations yet'}
                </p>
                {!searchQuery && activeFilter === 'all' && (
                  <button
                    onClick={() => setShowNewMessage(true)}
                    className="mt-4 text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Start a conversation
                  </button>
                )}
              </div>
            ) : filteredThreads.map(thread => {
              const isSelected = thread.customerId === selectedId
              const hasUnread  = thread.unreadCount > 0

              return (
                <button
                  key={thread.customerId}
                  onClick={() => selectThread(thread)}
                  className={`w-full text-left px-4 py-4 border-b border-white/[0.04] transition-colors relative ${
                    isSelected
                      ? 'bg-blue-600/10 border-l-2 border-l-blue-400/50'
                      : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className={`w-9 h-9 rounded-full border flex items-center justify-center text-[11px] font-bold ${
                        thread.verificationStatus === 'on_hold'
                          ? 'bg-amber-900/40 border-amber-300/20 text-amber-200'
                          : thread.verificationStatus === 'verified'
                          ? 'bg-green-900/30 border-green-300/20 text-green-200'
                          : 'bg-blue-900/40 border-blue-300/20 text-blue-200'
                      }`}>
                        {getInitials(thread.customerName)}
                      </div>
                      {hasUnread && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-[#111316]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className={`text-sm truncate ${hasUnread ? 'font-bold text-[#e2e2e6]' : 'font-semibold text-slate-300'}`}>
                          {thread.customerName ?? 'Unknown Customer'}
                        </p>
                        {thread.lastMessageAt && (
                          <span className="text-[10px] text-slate-600 whitespace-nowrap font-mono flex-shrink-0">
                            {fmtRelative(thread.lastMessageAt)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[thread.verificationStatus] ?? 'bg-white/5 text-slate-500'}`}>
                          {STATUS_LABEL[thread.verificationStatus] ?? thread.verificationStatus}
                        </span>
                      </div>

                      {thread.lastMessageBody && (
                        <p className={`text-xs mt-1 truncate leading-snug ${
                          hasUnread ? 'text-slate-300' : 'text-slate-500 font-light'
                        }`}>
                          {thread.lastMessageRole === 'admin' ? 'You: ' : ''}
                          {thread.lastMessageBody}
                        </p>
                      )}
                    </div>

                    {/* Unread count pill */}
                    {thread.unreadCount > 0 && (
                      <span className="flex-shrink-0 self-center flex items-center justify-center min-w-[18px] h-4.5 px-1.5 rounded-full bg-blue-500 text-[9px] font-bold text-white tabular-nums">
                        {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── RIGHT PANEL: Conversation view ─────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#111316]">

          {selectedThread ? (
            <>
              {/* Conversation header */}
              <div className="flex items-center justify-between px-8 pt-8 pb-5 border-b border-white/5 flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    selectedThread.verificationStatus === 'on_hold'
                      ? 'bg-amber-900/40 border-amber-300/20 text-amber-200'
                      : selectedThread.verificationStatus === 'verified'
                      ? 'bg-green-900/30 border-green-300/20 text-green-200'
                      : 'bg-blue-900/40 border-blue-300/20 text-blue-200'
                  }`}>
                    {getInitials(selectedThread.customerName)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="font-semibold text-[#e2e2e6] text-base">
                        {selectedThread.customerName ?? 'Unknown Customer'}
                      </h3>
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${STATUS_BADGE[selectedThread.verificationStatus] ?? 'bg-white/5 text-slate-500'}`}>
                        {STATUS_LABEL[selectedThread.verificationStatus] ?? selectedThread.verificationStatus}
                      </span>
                    </div>
                    {selectedThread.customerEmail && (
                      <p className="text-xs text-slate-500 mt-0.5">{selectedThread.customerEmail}</p>
                    )}
                  </div>
                </div>

                {/* View record link */}
                <Link
                  href={`/admin/users/${selectedThread.customerId}`}
                  className="flex items-center gap-2 px-4 py-2 border border-blue-300/15 text-blue-300/70 hover:text-blue-200 hover:border-blue-300/30 hover:bg-blue-300/5 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
                >
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>open_in_new</span>
                  View Record
                </Link>
              </div>

              {/* Message thread */}
              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4 min-h-0">
                {loadingThread ? (
                  <div className="flex items-center justify-center py-16">
                    <span className="material-symbols-outlined animate-spin text-2xl text-slate-600">progress_activity</span>
                  </div>
                ) : threadEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <span
                      className="material-symbols-outlined text-3xl text-slate-700"
                      style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
                    >
                      chat
                    </span>
                    <p className="text-sm text-slate-500 font-light">
                      No messages yet. Send a message below to start the conversation.
                    </p>
                  </div>
                ) : (
                  threadEvents.map(ev => {
                    const isAdmin  = ev.actor_role === 'admin'
                    const isUnread = !isAdmin && ev.admin_read_at === null

                    return (
                      <div
                        key={ev.id}
                        className={`flex gap-3 ${isAdmin ? 'justify-end' : 'justify-start'}`}
                      >
                        {/* Customer avatar */}
                        {!isAdmin && (
                          <div className="w-7 h-7 rounded-full bg-blue-900/40 border border-blue-300/15 flex items-center justify-center flex-shrink-0 mt-1">
                            <span className="text-[10px] font-bold text-blue-200">
                              {getInitials(selectedThread.customerName)}
                            </span>
                          </div>
                        )}

                        {/* Bubble */}
                        <div className={`max-w-[68%] space-y-1 flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                          <div className={`flex items-center gap-2 ${isAdmin ? 'flex-row-reverse' : ''}`}>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              {isAdmin ? 'You (Admin)' : (selectedThread.customerName ?? 'Customer')}
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

                          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                            isAdmin
                              ? 'bg-blue-600/15 border border-blue-400/15 text-blue-100 rounded-tr-sm'
                              : 'bg-[#1e2023]/80 border border-white/8 text-[#e2e2e6] rounded-tl-sm'
                          } ${ev.id.startsWith('temp-') ? 'opacity-60' : ''}`}>
                            {ev.body}
                          </div>

                          <span className="text-[10px] text-slate-600 font-mono">
                            {fmtFull(ev.created_at)}
                          </span>
                        </div>

                        {/* Admin avatar */}
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
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Compose */}
              <div className="flex-shrink-0 px-8 pb-8 pt-4 border-t border-white/5">
                {sendError && (
                  <p className="text-xs text-red-400/80 mb-2 leading-relaxed">{sendError}</p>
                )}
                <div className="bg-[#1a1d21] border border-white/8 rounded-2xl p-4 space-y-3 focus-within:border-blue-400/20 transition-colors">
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    placeholder={`Message ${selectedThread.customerName ?? 'customer'}…`}
                    rows={3}
                    className="w-full bg-transparent focus:outline-none text-sm text-[#e2e2e6] placeholder:text-slate-600 resize-none disabled:opacity-50"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-slate-600 italic">⌘ + Enter to send</p>
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={sending || !message.trim()}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600/20 border border-blue-400/20 text-blue-300 hover:bg-blue-600/30 hover:text-blue-200 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {sending ? (
                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>send</span>
                      )}
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Empty state — no thread selected */
            <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-12">
              <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/8 flex items-center justify-center">
                <span
                  className="material-symbols-outlined text-3xl text-slate-600"
                  style={{ fontVariationSettings: "'wght' 100, 'FILL' 0" }}
                >
                  chat
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="font-serif text-xl text-[#e2e2e6]">Select a conversation</h3>
                <p className="text-sm text-slate-500 font-light max-w-xs leading-relaxed">
                  Choose a thread from the left to read and reply, or start a new message.
                </p>
              </div>
              <button
                onClick={() => setShowNewMessage(true)}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600/20 border border-blue-400/20 text-blue-300 hover:bg-blue-600/30 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all hover:scale-[1.02]"
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>add</span>
                New Message
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
