'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  on_hold:        'On Hold',
}
const STATUS_COLOR: Record<string, string> = {
  not_started:    'text-slate-400',
  pending_review: 'text-amber-400',
  verified:       'text-green-400',
  rejected:       'text-red-400',
  on_hold:        'text-amber-400',
}

type Props = {
  adminName: string
  pendingCount: number
  unreadMessageCount: number
}

export default function AdminPortalTopNav({ adminName, pendingCount, unreadMessageCount }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState<SearchResult[]>([])
  const [searched, setSearched]     = useState(false)
  const [open, setOpen]             = useState(false)
  const [isPending, startTransition] = useTransition()
  const wrapperRef                  = useRef<HTMLDivElement>(null)

  // Debounced search
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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(id: string) {
    setQuery(''); setResults([]); setOpen(false)
    router.push(`/admin/users/${id}`)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = adminName
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'OZ'

  const totalBadge = pendingCount + unreadMessageCount

  return (
    <header className="sticky top-0 z-50 bg-[#091421] border-b border-white/[0.07] shadow-[0_1px_0_rgba(255,255,255,0.04)]">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between gap-6">

        {/* Brand */}
        <Link href="/admin" className="flex flex-col leading-none shrink-0 select-none">
          <span className="font-serif italic text-[15px] text-[#d9e3f6] tracking-tight">OZRentAPlane</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a7c8ff]/40 mt-0.5">Operations Portal</span>
        </Link>

        {/* Customer search */}
        <div ref={wrapperRef} className="relative flex-1 max-w-xs hidden md:block">
          <span
            className={`material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] transition-colors ${isPending ? 'text-oz-blue/60' : 'text-white/25'}`}
            style={{ fontVariationSettings: "'wght' 300" }}
          >
            {isPending ? 'progress_activity' : 'search'}
          </span>
          <input
            className="w-full bg-white/[0.04] border border-white/[0.07] focus:border-oz-blue/30 focus:outline-none text-sm pl-9 pr-4 py-2 rounded-xl transition-all duration-200 text-oz-text placeholder:text-white/25"
            placeholder="Search customers…"
            type="text"
            autoComplete="off"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { if (searched) setOpen(true) }}
          />
          {open && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#111620] border border-white/10 rounded-xl overflow-hidden shadow-2xl shadow-black/60 z-50">
              {results.length === 0 ? (
                <div className="px-4 py-5 text-center text-white/30 text-sm">
                  No results for &ldquo;{query}&rdquo;
                </div>
              ) : (
                <>
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-[9px] uppercase tracking-widest text-white/25 font-bold">
                      {results.length} result{results.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ul>
                    {results.map(r => {
                      const name     = r.full_name ?? 'Unknown'
                      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                      const color    = STATUS_COLOR[r.verification_status] ?? 'text-white/40'
                      const label    = STATUS_LABEL[r.verification_status] ?? r.verification_status
                      return (
                        <li key={r.id}>
                          <button
                            onClick={() => handleSelect(r.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left group"
                          >
                            <div className="w-7 h-7 rounded-full bg-oz-blue/10 border border-oz-blue/20 flex items-center justify-center text-oz-blue text-[10px] font-bold flex-shrink-0">
                              {initials}
                            </div>
                            <p className="text-sm font-medium text-oz-text group-hover:text-oz-blue transition-colors flex-1 truncate">{name}</p>
                            <span className={`text-[10px] font-bold uppercase tracking-widest flex-shrink-0 ${color}`}>{label}</span>
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
        <div className="flex items-center gap-4 shrink-0">

          {/* View website */}
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:flex items-center gap-1.5 text-[11px] font-medium text-white/30 hover:text-white/70 transition-colors"
            title="View public website"
          >
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'wght' 300" }}>open_in_new</span>
            View Site
          </a>

          <div className="h-4 w-px bg-white/10" />

          {/* Notifications bell */}
          <Link
            href="/admin/pending-verifications"
            className="relative flex items-center justify-center w-8 h-8 rounded-full text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
            title="Pending verifications"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'wght' 300" }}>notifications</span>
            {totalBadge > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] bg-[#a7c8ff] text-[#091421] text-[8px] font-black rounded-full flex items-center justify-center px-1 leading-none">
                {totalBadge > 99 ? '99+' : totalBadge}
              </span>
            )}
          </Link>

          {/* Settings */}
          <Link
            href="/admin/settings"
            className="flex items-center justify-center w-8 h-8 rounded-full text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
            title="Settings"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'wght' 300" }}>settings</span>
          </Link>

          <div className="h-4 w-px bg-white/10" />

          {/* Admin avatar + sign out */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#a7c8ff]/10 border border-[#a7c8ff]/25 flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#a7c8ff]">{initials}</span>
            </div>
            <button
              onClick={handleLogout}
              className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-white/30 hover:text-white/70 transition-colors"
              title="Sign out"
            >
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'wght' 300" }}>logout</span>
              <span className="hidden lg:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
