'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { searchCustomers } from '@/app/actions/admin'

type SearchResult = {
  id: string
  full_name: string | null
  verification_status: string
}

const STATUS_LABEL: Record<string, string> = {
  not_started:    'Not Started',
  pending_review: 'Pending',
  verified:       'Verified',
  rejected:       'Rejected',
}
const STATUS_COLOR: Record<string, string> = {
  not_started:    'text-blue-300/60',
  pending_review: 'text-[#a3b8c9]',
  verified:       'text-green-400',
  rejected:       'text-red-400',
}

type Props = {
  pendingCount: number
}

export default function AdminTopBar({ pendingCount }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState<SearchResult[]>([])
  const [searched, setSearched]     = useState(false)
  const [open, setOpen]             = useState(false)
  const [isPending, startTransition] = useTransition()
  const wrapperRef                  = useRef<HTMLDivElement>(null)

  // Debounced search — fires 300 ms after the user stops typing
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSearched(false)
      setOpen(false)
      return
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const data = await searchCustomers(query)
        setResults(data)
        setSearched(true)
        setOpen(true)
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(id: string) {
    setQuery('')
    setResults([])
    setOpen(false)
    router.push(`/admin/users/${id}`)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-40 flex justify-between items-center w-full pl-8 pr-10 h-20 bg-slate-950/40 backdrop-blur-lg border-b border-white/5">

      {/* Search with live dropdown */}
      <div ref={wrapperRef} className="relative w-80">
        <span
          className={`material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg transition-colors ${isPending ? 'text-blue-300/60' : 'text-slate-500'}`}
          style={{ fontVariationSettings: "'wght' 300" }}
        >
          {isPending ? 'progress_activity' : 'search'}
        </span>
        <input
          className="w-full bg-[#1a1c1f] border border-white/5 focus:border-blue-300/30 focus:ring-0 focus:outline-none text-sm pl-10 pr-4 py-2.5 rounded-xl transition-all duration-300 text-[#e2e2e6] placeholder:text-slate-500"
          placeholder="Search customers by name…"
          type="text"
          autoComplete="off"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (searched) setOpen(true) }}
        />

        {/* Results dropdown */}
        {open && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1c1f] border border-white/10 rounded-xl overflow-hidden shadow-2xl shadow-black/50 z-50">
            {results.length === 0 ? (
              <div className="px-4 py-5 text-center text-slate-500 text-sm font-light">
                No customers found for &ldquo;{query}&rdquo;
              </div>
            ) : (
              <>
                <div className="px-4 pt-3 pb-1">
                  <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold">
                    {results.length} result{results.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <ul>
                  {results.map(r => {
                    const name = r.full_name ?? 'Unknown User'
                    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                    const statusColor = STATUS_COLOR[r.verification_status] ?? 'text-slate-400'
                    const statusLabel = STATUS_LABEL[r.verification_status] ?? r.verification_status
                    return (
                      <li key={r.id}>
                        <button
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left group"
                          onClick={() => handleSelect(r.id)}
                        >
                          <div className="w-7 h-7 rounded-full bg-blue-900/50 border border-blue-300/20 flex items-center justify-center text-blue-200 text-[10px] font-bold flex-shrink-0">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#e2e2e6] group-hover:text-blue-200 transition-colors truncate">
                              {name}
                            </p>
                          </div>
                          <span className={`text-[10px] font-bold uppercase tracking-widest flex-shrink-0 ${statusColor}`}>
                            {statusLabel}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-5">
        {/* Settings */}
        <Link
          href="/admin/settings"
          className="relative text-slate-400 hover:text-blue-100 transition-colors flex items-center justify-center p-1 rounded-full hover:bg-white/5"
          title="Settings"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 300" }}>
            settings
          </span>
        </Link>
        <div className="h-4 w-px bg-white/10" />
        {/* Bell — links to pending verifications, badge shows real count */}
        <Link
          href="/admin/pending-verifications"
          className="relative text-slate-400 hover:text-blue-100 transition-colors flex items-center justify-center p-1 rounded-full hover:bg-white/5"
          title="Pending Verifications"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 300" }}>
            notifications
          </span>
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-blue-400 text-[#111316] text-[9px] font-black rounded-full flex items-center justify-center px-1 leading-none">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </Link>

        <div className="h-6 w-px bg-white/10" />

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-slate-400 hover:text-blue-100 transition-colors group"
          title="Sign out"
        >
          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'wght' 300" }}>
            logout
          </span>
          <span className="text-[10px] uppercase tracking-widest font-medium hidden sm:inline group-hover:text-blue-100 transition-colors">
            Sign Out
          </span>
        </button>
      </div>
    </header>
  )
}
