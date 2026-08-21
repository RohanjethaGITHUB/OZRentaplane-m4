'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  sendAdminChatMessage,
  markAdminChatRead,
  getAdminThread,
  getAdminThreadListPage,
  searchCustomers,
} from '@/app/actions/admin'
import {
  ADMIN_THREAD_PAGE_SIZE,
  type AdminThreadListFilter,
} from '@/lib/chat/admin-threads'
import type { ThreadSummary, VerificationEvent } from '@/lib/supabase/types'
import { formatDateTime, formatDateFromISO } from '@/lib/formatDateTime'
import { useRealtimeEvent } from '@/hooks/useRealtimeEvent'
import { ThreadRealtimeListener } from '@/components/realtime/ThreadRealtimeListener'

// --- Helpers ---

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
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
  not_started: 'bg-slate-100 text-slate-600 border border-slate-200',
  pending_review: 'bg-blue-50 text-blue-700 border border-blue-200',
  verified: 'bg-green-50 text-green-700 border border-green-200',
  rejected: 'bg-red-50 text-red-700 border border-red-200',
  on_hold: 'bg-amber-50 text-amber-700 border border-amber-200',
}

type DiscoveredCustomer = {
  id: string
  full_name: string | null
  verification_status: string
}

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not Started',
  pending_review: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
  on_hold: 'On Hold',
}

type FilterKey = AdminThreadListFilter

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'pending_review', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'rejected', label: 'Rejected' },
]

// --- Props ---

interface Props {
  initialThreads: ThreadSummary[]
  initialHasMore: boolean
  initialSelectedUserId?: string | null
}

// --- New-message search modal ---

interface NewMessageModalProps {
  onSelect: (customer: { id: string; full_name: string | null; verification_status: string }) => void
  onClose: () => void
}

function NewMessageModal({ onSelect, onClose }: NewMessageModalProps) {
  const [query, setQuery] = useState('')
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
      <div className="w-full max-w-md bg-white border border-[rgba(12,35,64,0.15)] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(12,35,64,0.08)]">
          <h3 className="text-sm font-bold text-[#0C2340] tracking-wide">New Message</h3>
          <button
            onClick={onClose}
            className="text-[#3d5a80] hover:text-[#0C2340] transition-colors"
          >
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'wght' 300" }}>close</span>
          </button>
        </div>
        <div className="px-5 py-4 border-b border-[rgba(12,35,64,0.08)]">
          <div className="flex items-center gap-2.5 bg-white border border-[rgba(12,35,64,0.15)] rounded-xl px-3 py-2.5">
            <span className="material-symbols-outlined text-[#3d5a80] text-base" style={{ fontVariationSettings: "'wght' 300" }}>search</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search customer by name..."
              className="flex-1 bg-white text-sm text-[#0C2340] placeholder:text-[#3d5a80] focus:outline-none"
            />
            {loading && (
              <span className="material-symbols-outlined animate-spin text-base text-[#3d5a80]">progress_activity</span>
            )}
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {!query.trim() ? (
            <p className="px-5 py-8 text-center text-sm text-[#3d5a80] font-light">Type a name to find a customer</p>
          ) : results.length === 0 && !loading ? (
            <p className="px-5 py-8 text-center text-sm text-[#3d5a80] font-light">No customers found</p>
          ) : (
            results.map(c => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="w-full text-left px-5 py-3.5 hover:bg-[#f6f9fc] border-b border-[rgba(12,35,64,0.06)] transition-colors"
              >
                <p className="text-sm font-semibold text-[#0C2340]">{c.full_name ?? 'Unknown'}</p>
                <p className="text-[10px] text-[#3d5a80] uppercase tracking-widest mt-0.5">
                  {STATUS_LABEL[c.verification_status] ?? c.verification_status}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// --- Main component ---

export default function AdminInbox({
  initialThreads,
  initialHasMore,
  initialSelectedUserId,
}: Props) {
  const [threads, setThreads] = useState<ThreadSummary[]>(initialThreads)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filterLoading, setFilterLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [discoveredCustomers, setDiscoveredCustomers] = useState<DiscoveredCustomer[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedThread, setSelectedThread] = useState<ThreadSummary | null>(null)
  const [threadEvents, setThreadEvents] = useState<VerificationEvent[]>([])
  const [loadingThread, setLoadingThread] = useState(false)

  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const listEndRef = useRef<HTMLDivElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const initialSelectionDone = useRef(false)
  const loadingMoreRef = useRef(false)

  // While searching, filter client-side over loaded threads; status filter applied server-side.
  const filteredThreads = threads.filter(t => {
    if (!searchQuery.trim()) return true
    return (
      (t.customerName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.customerEmail ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  const threadIds = new Set(filteredThreads.map((t) => t.customerId))
  const discoveryResults = discoveredCustomers.filter((c) => !threadIds.has(c.id))
  const hasSearchResults = filteredThreads.length > 0 || discoveryResults.length > 0

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setDiscoveredCustomers([])
      setSearchLoading(false)
      return
    }
    const t = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const r = await searchCustomers(q)
        setDiscoveredCustomers(r)
      } catch {
        setDiscoveredCustomers([])
      } finally {
        setSearchLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [searchQuery])

  const loadPage = useCallback(async (offset: number, replace: boolean, filter: FilterKey) => {
    if (replace) setFilterLoading(true)
    else {
      if (loadingMoreRef.current) return
      loadingMoreRef.current = true
      setLoadingMore(true)
    }
    try {
      const page = await getAdminThreadListPage({
        offset,
        limit: ADMIN_THREAD_PAGE_SIZE,
        filter,
      })
      setThreads((prev) => {
        if (replace) return page.threads
        const seen = new Set(prev.map((t) => t.customerId))
        return [...prev, ...page.threads.filter((t) => !seen.has(t.customerId))]
      })
      setHasMore(page.hasMore)
    } catch {
      if (replace) setThreads([])
      setHasMore(false)
    } finally {
      setFilterLoading(false)
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }, [])

  async function changeFilter(next: FilterKey) {
    if (next === activeFilter) return
    setActiveFilter(next)
    setSearchQuery('')
    await loadPage(0, true, next)
  }

  // Infinite scroll sentinel
  useEffect(() => {
    const root = listScrollRef.current
    const target = listEndRef.current
    if (!root || !target) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (!hasMore || loadingMoreRef.current || searchQuery.trim()) return
        void loadPage(threads.length, false, activeFilter)
      },
      { root, rootMargin: '120px', threshold: 0 },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, threads.length, activeFilter, searchQuery, loadPage])

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
      markAdminChatRead(thread.customerId).then(() => {
        setThreads(prev => prev.map(t =>
          t.customerId === thread.customerId ? { ...t, unreadCount: 0 } : t
        ))
      }).catch(() => {/* non-critical */})
    } finally {
      setLoadingThread(false)
    }
  }, [])

  function clearSelection() {
    setSelectedId(null)
    setSelectedThread(null)
    setThreadEvents([])
    setSendError('')
    setMessage('')
  }

  useEffect(() => {
    if (threadEvents.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [threadEvents.length])

  useEffect(() => {
    if (initialSelectionDone.current) return
    if (!initialSelectedUserId) return
    if (selectedId) return

    const match = threads.find((thread) => thread.customerId === initialSelectedUserId)
    if (!match) return

    initialSelectionDone.current = true
    selectThread(match)
  }, [initialSelectedUserId, selectThread, selectedId, threads])

  // If deep-linked user is not in first page, fetch until found or exhausted
  useEffect(() => {
    if (initialSelectionDone.current) return
    if (!initialSelectedUserId) return
    if (selectedId) return
    if (threads.some((t) => t.customerId === initialSelectedUserId)) return
    if (!hasMore || loadingMoreRef.current) return
    void loadPage(threads.length, false, activeFilter)
  }, [initialSelectedUserId, selectedId, threads, hasMore, activeFilter, loadPage])

  useRealtimeEvent('chat:message', (event) => {
    void (async () => {
      try {
        const page = await getAdminThreadListPage({
          offset: 0,
          limit: Math.max(threads.length, ADMIN_THREAD_PAGE_SIZE),
          filter: activeFilter,
        })
        setThreads(page.threads)
        setHasMore(page.hasMore)
        if (selectedId && event.threadUserId === selectedId) {
          const fresh = await getAdminThread(selectedId)
          setThreadEvents(fresh)
          markAdminChatRead(selectedId).then(() => {
            setThreads((prev) =>
              prev.map((t) =>
                t.customerId === selectedId ? { ...t, unreadCount: 0 } : t,
              ),
            )
          }).catch(() => {})
        }
      } catch {
        // Fail soft
      }
    })()
  }, [selectedId, threads.length, activeFilter])

  useRealtimeEvent('chat:read', (event) => {
    if (!selectedId || event.threadUserId !== selectedId) return
    void getAdminThread(selectedId).then(setThreadEvents).catch(() => {})
  }, [selectedId])

  async function handleSend() {
    if (!message.trim() || !selectedId || !selectedThread) return
    setSendError('')
    setSending(true)

    const body = message.trim()
    setMessage('')

    const tempEvent: VerificationEvent = {
      id: `temp-${Date.now()}`,
      user_id: selectedId,
      actor_user_id: null,
      actor_role: 'admin',
      event_type: 'message',
      from_status: null,
      to_status: null,
      title: 'Message from Admin',
      body,
      request_kind: null,
      is_read: false,
      admin_read_at: new Date().toISOString(),
      email_status: 'skipped',
      email_sent_at: null,
      created_at: new Date().toISOString(),
    }
    setThreadEvents(prev => [...prev, tempEvent])

    setThreads(prev => prev.map(t =>
      t.customerId === selectedId
        ? { ...t, lastMessageBody: body, lastMessageAt: new Date().toISOString(), lastMessageRole: 'admin', totalMessages: t.totalMessages + 1 }
        : t
    ))

    try {
      await sendAdminChatMessage(selectedId, body)
      const fresh = await getAdminThread(selectedId)
      setThreadEvents(fresh)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send.'
      setSendError(msg.replace('VALIDATION:', '').trim())
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

  function handleNewMessageSelect(customer: { id: string; full_name: string | null; verification_status: string }) {
    setShowNewMessage(false)

    const existing = threads.find(t => t.customerId === customer.id)
    if (existing) {
      selectThread(existing)
      return
    }

    const placeholder: ThreadSummary = {
      customerId: customer.id,
      customerName: customer.full_name,
      customerEmail: null,
      verificationStatus: customer.verification_status as ThreadSummary['verificationStatus'],
      lastMessageBody: null,
      lastMessageAt: null,
      lastMessageRole: null,
      unreadCount: 0,
      totalMessages: 0,
    }
    setThreads(prev => [placeholder, ...prev])
    selectThread(placeholder)
  }

  return (
    <>
      {selectedId && <ThreadRealtimeListener threadUserId={selectedId} refresh={false} />}
      {showNewMessage && (
        <NewMessageModal
          onSelect={handleNewMessageSelect}
          onClose={() => setShowNewMessage(false)}
        />
      )}

      <div className="flex h-[calc(100dvh-0px)] overflow-hidden">

        {/* LEFT PANEL: Thread list */}
        <div
          className={`w-full lg:w-80 xl:w-96 flex-shrink-0 border-r border-[rgba(12,35,64,0.12)] bg-white ${
            selectedId ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'
          }`}
        >

          <div className="px-5 pt-8 pb-4 border-b border-[rgba(12,35,64,0.08)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl tracking-tight text-[#0C2340]">Messages</h2>
              <button
                onClick={() => setShowNewMessage(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a4a7a]/10 border border-[rgba(26,74,122,0.25)] text-[#1a4a7a] hover:bg-[#1a4a7a]/15 hover:text-[#0C2340] rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all hover:scale-[1.02]"
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>add</span>
                New
              </button>
            </div>

            <div className="flex items-center gap-2.5 bg-white border border-[rgba(12,35,64,0.15)] rounded-xl px-3 py-2.5">
              <span className="material-symbols-outlined text-[#3d5a80] text-base flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name..."
                className="flex-1 bg-white text-sm text-[#0C2340] placeholder:text-[#3d5a80] focus:outline-none"
              />
              {searchLoading && (
                <span className="material-symbols-outlined animate-spin text-base text-[#3d5a80]">progress_activity</span>
              )}
              {searchQuery && !searchLoading && (
                <button onClick={() => setSearchQuery('')} className="text-[#3d5a80] hover:text-[#0C2340]">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>close</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-1 px-3 py-2.5 border-b border-[rgba(12,35,64,0.08)] overflow-x-auto scrollbar-hide bg-white">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => void changeFilter(f.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.1em] transition-all ${
                  activeFilter === f.key
                    ? 'bg-[#1a4a7a] border border-[#1a4a7a] text-white'
                    : 'bg-white border border-[rgba(12,35,64,0.15)] text-[#3d5a80] hover:text-[#0C2340] hover:bg-[#f6f9fc]'
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

          <div ref={listScrollRef} className="flex-1 overflow-y-auto">
            {filterLoading ? (
              <div className="flex items-center justify-center py-16">
                <span className="material-symbols-outlined animate-spin text-2xl text-[#3d5a80]">progress_activity</span>
              </div>
            ) : !hasSearchResults && !searchLoading ? (
              <div className="px-5 py-12 text-center">
                <span
                  className="material-symbols-outlined text-3xl text-[#3d5a80] block mb-3"
                  style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
                >
                  {searchQuery ? 'search_off' : 'chat'}
                </span>
                <p className="text-sm text-[#3d5a80] font-light">
                  {searchQuery ? `No customers found for "${searchQuery}"` :
                   activeFilter !== 'all' ? 'No threads in this category' :
                   'No customers yet'}
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
            ) : (
              <>
                {filteredThreads.map(thread => {
                  const isSelected = thread.customerId === selectedId
                  const hasUnread = thread.unreadCount > 0

                  return (
                    <button
                      key={thread.customerId}
                      onClick={() => selectThread(thread)}
                      className={`w-full text-left px-4 py-4 border-b border-[rgba(12,35,64,0.06)] transition-colors relative ${
                        isSelected
                          ? 'bg-[#f6f9fc] border-l-2 border-l-[#1a4a7a]'
                          : 'hover:bg-[#f6f9fc]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative flex-shrink-0">
                          <div className={`w-9 h-9 rounded-full border flex items-center justify-center text-[11px] font-bold ${
                            thread.verificationStatus === 'on_hold'
                              ? 'bg-amber-50 border-amber-300/30 text-amber-700'
                              : thread.verificationStatus === 'verified'
                              ? 'bg-green-50 border-green-300/30 text-green-700'
                              : 'bg-blue-50 border-blue-300/30 text-blue-700'
                          }`}>
                            {getInitials(thread.customerName)}
                          </div>
                          {hasUnread && (
                            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className={`text-sm truncate ${hasUnread ? 'font-bold text-[#0C2340]' : 'font-semibold text-[#0C2340]'}`}>
                              {thread.customerName ?? 'Unknown Customer'}
                            </p>
                            {thread.lastMessageAt && (
                              <span className="text-[10px] text-[#3d5a80] whitespace-nowrap font-mono flex-shrink-0">
                                {fmtRelative(thread.lastMessageAt)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[thread.verificationStatus] ?? 'bg-white text-[#3d5a80]'}`}>
                              {STATUS_LABEL[thread.verificationStatus] ?? thread.verificationStatus}
                            </span>
                          </div>

                          {thread.lastMessageBody ? (
                            <p className={`text-xs mt-1 truncate leading-snug ${
                              hasUnread ? 'text-[#3d5a80]' : 'text-[#3d5a80] font-light'
                            }`}>
                              {thread.lastMessageRole === 'admin' ? 'You: ' : ''}
                              {thread.lastMessageBody}
                            </p>
                          ) : (
                            <p className="text-xs mt-1 truncate leading-snug text-[#3d5a80]/70 italic">
                              No messages yet
                            </p>
                          )}
                        </div>

                        {thread.unreadCount > 0 && (
                          <span className="flex-shrink-0 self-center flex items-center justify-center min-w-[18px] h-4.5 px-1.5 rounded-full bg-[#1a4a7a] text-[9px] font-bold text-white tabular-nums">
                            {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}

                {searchQuery.trim() && discoveryResults.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-[#f6f9fc] border-b border-[rgba(12,35,64,0.06)]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#3d5a80]">
                        Start new conversation
                      </p>
                    </div>
                    {discoveryResults.map((customer) => (
                      <button
                        key={`discover-${customer.id}`}
                        onClick={() => handleNewMessageSelect(customer)}
                        className="w-full text-left px-4 py-4 border-b border-[rgba(12,35,64,0.06)] transition-colors hover:bg-[#f6f9fc]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#dbe8f5] border border-[rgba(12,35,64,0.12)] flex items-center justify-center text-[11px] font-bold text-[#0C2340] flex-shrink-0">
                            {getInitials(customer.full_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#0C2340] truncate">
                              {customer.full_name ?? 'Unknown'}
                            </p>
                            <p className="text-[10px] text-[#3d5a80] uppercase tracking-widest mt-0.5">
                              {STATUS_LABEL[customer.verification_status] ?? customer.verification_status}
                            </p>
                          </div>
                          <span className="material-symbols-outlined text-base text-[#1a4a7a]" style={{ fontVariationSettings: "'wght' 300" }}>
                            chat_add_on
                          </span>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {!searchQuery.trim() && (
                  <div ref={listEndRef} className="h-8 flex items-center justify-center py-3">
                    {loadingMore && (
                      <span className="material-symbols-outlined animate-spin text-base text-[#3d5a80]">progress_activity</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Conversation view */}
        <div
          className={`flex-1 flex-col min-w-0 bg-white ${
            selectedId ? 'flex' : 'hidden lg:flex'
          }`}
        >

          {selectedThread ? (
            <>
              <div className="flex items-center justify-between px-4 sm:px-8 pt-6 sm:pt-8 pb-5 border-b border-[rgba(12,35,64,0.08)] flex-shrink-0 gap-3">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="lg:hidden flex items-center justify-center w-10 h-10 rounded-full border border-[rgba(12,35,64,0.15)] text-[#3d5a80] hover:bg-[#f6f9fc] flex-shrink-0"
                    aria-label="Back to conversations"
                  >
                    <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'wght' 300" }}>arrow_back</span>
                  </button>
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    selectedThread.verificationStatus === 'on_hold'
                      ? 'bg-amber-50 border-amber-300/30 text-amber-700'
                      : selectedThread.verificationStatus === 'verified'
                      ? 'bg-green-50 border-green-300/30 text-green-700'
                      : 'bg-blue-50 border-blue-300/30 text-blue-700'
                  }`}>
                    {getInitials(selectedThread.customerName)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-semibold text-[#0C2340] text-base truncate">
                        {selectedThread.customerName ?? 'Unknown Customer'}
                      </h3>
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${STATUS_BADGE[selectedThread.verificationStatus] ?? 'bg-white text-[#3d5a80]'}`}>
                        {STATUS_LABEL[selectedThread.verificationStatus] ?? selectedThread.verificationStatus}
                      </span>
                    </div>
                    {selectedThread.customerEmail && (
                      <p className="text-xs text-[#3d5a80] mt-0.5 truncate">{selectedThread.customerEmail}</p>
                    )}
                  </div>
                </div>

                <Link
                  href={`/admin/users/${selectedThread.customerId}`}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 border border-[rgba(12,35,64,0.18)] text-[#3d5a80] hover:text-[#0C2340] hover:border-[rgba(12,35,64,0.28)] hover:bg-[#f6f9fc] rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>open_in_new</span>
                  <span className="hidden sm:inline">View Record</span>
                </Link>
              </div>

              <div className="flex-1 overflow-y-auto px-5 sm:px-10 py-6 space-y-4 min-h-0">
                {loadingThread ? (
                  <div className="flex items-center justify-center py-16">
                    <span className="material-symbols-outlined animate-spin text-2xl text-[#3d5a80]">progress_activity</span>
                  </div>
                ) : threadEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <span
                      className="material-symbols-outlined text-3xl text-[#3d5a80]"
                      style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
                    >
                      chat
                    </span>
                    <p className="text-sm text-[#3d5a80] font-light">
                      No messages yet. Send a message below to start the conversation.
                    </p>
                  </div>
                ) : (
                  threadEvents.map(ev => {
                    const isAdmin = ev.actor_role === 'admin'
                    const isUnread = !isAdmin && ev.admin_read_at === null
                    const isDecline = !isAdmin && (
                      ev.body?.toLowerCase().includes('unable to make the proposed') ||
                      ev.title?.toLowerCase().includes('declined') ||
                      ev.event_type === 'rejected'
                    )
                    const isAccept = !isAdmin && (
                      ev.body?.toLowerCase().includes('accepted the proposed') ||
                      ev.title?.toLowerCase().includes('accepted')
                    )

                    return (
                      <div
                        key={ev.id}
                        className={`flex gap-3 ${isAdmin ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isAdmin && (
                          <div className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 mt-1 ${
                            isDecline
                              ? 'bg-rose-100 border-rose-300 text-rose-800'
                              : isAccept
                                ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                : 'bg-[#dbe8f5] border-[rgba(12,35,64,0.12)] text-[#0C2340]'
                          }`}>
                            <span className="text-[10px] font-bold">
                              {getInitials(selectedThread.customerName)}
                            </span>
                          </div>
                        )}

                        <div className={`max-w-[90%] sm:max-w-[68%] space-y-1 flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                          <div className={`flex items-center gap-1.5 sm:gap-2 flex-wrap ${isAdmin ? 'flex-row-reverse' : ''}`}>
                            <span className={`text-[10px] font-bold uppercase tracking-widest truncate max-w-[140px] sm:max-w-none ${
                              isDecline
                                ? 'text-rose-700'
                                : isAccept
                                  ? 'text-emerald-700 font-bold'
                                  : 'text-[#3d5a80]'
                            }`}>
                              {isAdmin ? 'You (Admin)' : (selectedThread.customerName ?? 'Customer')}
                            </span>
                            {isDecline && (
                              <span className="text-[9px] font-bold uppercase tracking-widest text-rose-800 bg-rose-100 border border-rose-300 px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                                declined time
                              </span>
                            )}
                            {isAccept && (
                              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                                accepted time
                              </span>
                            )}
                            {isUnread && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                            )}
                            {ev.event_type === 'on_hold' && (
                              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400/60 border border-amber-400/20 px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                                on hold
                              </span>
                            )}
                          </div>

                          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                            isAdmin
                              ? 'bg-blue-600/15 border border-blue-400/15 text-slate-900 rounded-tr-sm'
                              : isDecline
                                ? 'bg-rose-50/90 border border-rose-200 text-rose-950 rounded-tl-sm'
                                : isAccept
                                  ? 'bg-emerald-50/90 border border-emerald-200 text-emerald-950 rounded-tl-sm'
                                  : 'bg-[#f8f9fb] border border-[rgba(12,35,64,0.08)] text-[#0C2340] rounded-tl-sm'
                          } ${ev.id.startsWith('temp-') ? 'opacity-60' : ''}`}>
                            {ev.body ? (
                              isDecline && ev.body.includes('Note:') ? (
                                <div>
                                  <p>{ev.body.split(/\.\s*Note:/i)[0]}.</p>
                                  {(() => {
                                    const match = ev.body.match(/Note:\s*("?[^"]*"?)\.\s*(.*)/i) || ev.body.match(/Note:\s*(.*)/i)
                                    const noteContent = match ? match[1] : ''
                                    const followUp = match && match[2] ? match[2] : ''
                                    return (
                                      <>
                                        {noteContent && (
                                          <div className="my-2 p-2 rounded-lg bg-rose-100 border border-rose-300 text-rose-900 font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                                            <span className="material-symbols-outlined text-sm text-rose-600 flex-shrink-0">comment</span>
                                            <span>Customer Note: {noteContent}</span>
                                          </div>
                                        )}
                                        {followUp && <p className="text-xs text-rose-800 mt-1">{followUp}</p>}
                                      </>
                                    )
                                  })()}
                                </div>
                              ) : (
                                ev.body.replace(/\.\s*(Please accept or decline.*)/i, '.\n$1')
                              )
                            ) : ''}
                          </div>

                          <span className="text-[10px] text-[#3d5a80] font-mono">
                            {fmtFull(ev.created_at)}
                          </span>
                        </div>

                        {isAdmin && (
                          <div className="w-7 h-7 rounded-full bg-[#dbe8f5] border border-[rgba(12,35,64,0.12)] flex items-center justify-center flex-shrink-0 mt-1">
                            <span
                              className="material-symbols-outlined text-sm text-[#1a4a7a]"
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

              <div className="flex-shrink-0 px-4 sm:px-8 pb-6 sm:pb-8 pt-4 border-t border-[rgba(12,35,64,0.08)]">
                {sendError && (
                  <p className="text-xs text-red-600 mb-2 leading-relaxed">{sendError}</p>
                )}
                <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-2xl p-4 space-y-3 focus-within:border-[#1a4a7a]/30 transition-colors">
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    placeholder={`Message ${selectedThread.customerName ?? 'customer'}...`}
                    rows={3}
                    className="w-full bg-white focus:outline-none text-sm text-[#0C2340] placeholder:text-[#3d5a80] resize-none disabled:opacity-50"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] text-[#3d5a80] italic">Ctrl/Cmd + Enter to send</p>
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={sending || !message.trim()}
                      className="flex items-center gap-2 px-5 py-2.5 min-h-10 bg-[#1a4a7a] border border-[#1a4a7a] text-white hover:bg-[#153d66] rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
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
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-[#f6f9fc] border border-[rgba(12,35,64,0.1)] flex items-center justify-center">
                <span
                  className="material-symbols-outlined text-3xl text-[#3d5a80]"
                  style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
                >
                  forum
                </span>
              </div>
              <div>
                <p className="text-base font-semibold text-[#0C2340] mb-1">Select a conversation</p>
                <p className="text-sm text-[#3d5a80] font-light">
                  Choose a thread from the left, or start a new message.
                </p>
              </div>
              <button
                onClick={() => setShowNewMessage(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1a4a7a]/10 border border-[rgba(26,74,122,0.25)] text-[#1a4a7a] hover:bg-[#1a4a7a]/15 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
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
