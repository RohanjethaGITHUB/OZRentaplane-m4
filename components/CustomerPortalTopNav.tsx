'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { markNotificationsSeen } from '@/app/actions/auth-tracking'
import type { PopoverNotification } from '@/lib/supabase/types'

const PUBLIC_LINKS = [
  { label: 'Fleet',             href: '/fleet'              },
  { label: 'Checkout Process',  href: '/checkout-process'   },
  { label: 'Safety',            href: '/safety'             },
  { label: 'Resources',         href: '/pilotRequirements'  },
  { label: 'Pricing',           href: '/pricing'            },
]

// Event type → icon + color for notification popover items
const NOTIF_DISPLAY: Record<string, { icon: string; color: string }> = {
  submitted:   { icon: 'upload_file',   color: 'text-blue-400'  },
  resubmitted: { icon: 'upload_file',   color: 'text-blue-400'  },
  approved:    { icon: 'verified_user', color: 'text-green-400' },
  rejected:    { icon: 'person_off',    color: 'text-red-400'   },
  on_hold:     { icon: 'pause_circle',  color: 'text-amber-400' },
  message:     { icon: 'chat',          color: 'text-blue-300'  },
}

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)   return `${days}d ago`
  return new Date(isoString).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

type Props = {
  displayName: string
  notificationCount: number
  recentNotifications: PopoverNotification[]
}

export default function CustomerPortalTopNav({ displayName, notificationCount, recentNotifications }: Props) {
  const [menuOpen,   setMenuOpen]   = useState(false)
  const [notifOpen,  setNotifOpen]  = useState(false)
  const [dropOpen,   setDropOpen]   = useState(false)
  // Optimistically clear bell badge when popover opens
  const [localBadge, setLocalBadge] = useState(notificationCount)
  const [, startTransition] = useTransition()

  const router   = useRouter()
  const pathname = usePathname()

  const notifRef = useRef<HTMLDivElement>(null)
  const dropRef  = useRef<HTMLDivElement>(null)

  // Sync badge from server-side prop changes (after server action revalidation)
  useEffect(() => {
    if (!notifOpen) setLocalBadge(notificationCount)
  }, [notificationCount, notifOpen])

  // Close popovers on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setNotifOpen(false); setDropOpen(false) }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function openNotifications() {
    setNotifOpen(v => !v)
    setDropOpen(false)
    if (!notifOpen && localBadge > 0) {
      setLocalBadge(0)
      startTransition(() => { markNotificationsSeen() })
    }
  }

  function toggleDrop() {
    setDropOpen(v => !v)
    setNotifOpen(false)
  }

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  return (
    <header className="sticky top-0 z-50 bg-[#091421] border-b border-white/[0.07] shadow-[0_1px_0_rgba(255,255,255,0.04)]">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/dashboard" className="shrink-0 flex items-center select-none">
          <img
            src="/OZRentAPlanelogo.png"
            alt="OZRentAPlane"
            className="h-[52px] w-auto object-contain scale-[2.5] origin-left"
          />
        </Link>

        {/* Desktop public nav links */}
        <nav className="hidden lg:flex items-center gap-7">
          {PUBLIC_LINKS.map(link => (
            <a
              key={link.label}
              href={link.href}
              className="font-sans text-[12.5px] font-medium text-white/55 hover:text-white/90 transition-colors duration-200 whitespace-nowrap"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right controls */}
        <div className="flex items-center gap-3 shrink-0">

          {/* Book a Flight — primary CTA */}
          <Link
            href="/dashboard/bookings/new"
            className={`hidden md:inline-flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-full transition-colors duration-200 whitespace-nowrap ${
              pathname === '/dashboard/bookings/new'
                ? 'bg-white text-[#0c1a2e]'
                : 'bg-[#c8dcff] text-[#0c1a2e] hover:bg-white'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 600" }}>
              flight_takeoff
            </span>
            Book a Flight
          </Link>

          {/* ── Notification bell ──────────────────────────────────────────── */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={openNotifications}
              className="relative flex items-center justify-center w-8 h-8 rounded-full text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
              title="Notifications"
              aria-label={`Notifications${localBadge > 0 ? ` — ${localBadge} unread` : ''}`}
            >
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'wght' 300" }}>
                notifications
              </span>
              {localBadge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 rounded-full bg-red-500 text-[9px] font-bold text-white px-1 leading-none shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                  {localBadge > 9 ? '9+' : localBadge}
                </span>
              )}
            </button>

            {/* Notification popover */}
            {notifOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-[320px] bg-[#0c1525] border border-white/[0.09] rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.6)] overflow-hidden z-50">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Notifications</p>
                  <Link
                    href="/dashboard/messages"
                    onClick={() => setNotifOpen(false)}
                    className="text-[10px] text-blue-400/70 hover:text-blue-300 font-medium transition-colors"
                  >
                    View Messages
                  </Link>
                </div>

                {/* Notification list */}
                <div className="max-h-[360px] overflow-y-auto divide-y divide-white/[0.04]">
                  {recentNotifications.length === 0 ? (
                    <div className="py-10 flex flex-col items-center gap-2 text-center px-4">
                      <span className="material-symbols-outlined text-slate-700 text-3xl" style={{ fontVariationSettings: "'wght' 200" }}>notifications_none</span>
                      <p className="text-[12px] text-slate-600 font-light">All caught up</p>
                    </div>
                  ) : (
                    recentNotifications.map(n => {
                      const disp = NOTIF_DISPLAY[n.event_type] ?? NOTIF_DISPLAY.message
                      const content = (
                        <>
                          {/* New indicator */}
                          <div className="flex flex-col items-center pt-1.5 flex-shrink-0">
                            {n.is_new
                              ? <span className="w-1.5 h-1.5 rounded-full bg-blue-400 block" />
                              : <span className="w-1.5 h-1.5 rounded-full bg-transparent block" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 mb-0.5">
                              <span className={`material-symbols-outlined text-[14px] flex-shrink-0 mt-0.5 ${disp.color}`} style={{ fontVariationSettings: "'wght' 300" }}>
                                {disp.icon}
                              </span>
                              <p className={`text-[12px] font-medium leading-snug ${n.is_new ? 'text-white' : 'text-white/60'}`}>
                                {n.title}
                              </p>
                            </div>
                            {n.body && (
                              <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 pl-5">{n.body}</p>
                            )}
                            <p className="text-[10px] text-slate-600 mt-1 pl-5 font-mono">{relativeTime(n.created_at)}</p>
                          </div>
                        </>
                      )

                      if (n.href) {
                        return (
                          <Link
                            key={n.id}
                            href={n.href}
                            onClick={() => setNotifOpen(false)}
                            className={`flex gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03] ${n.is_new ? 'bg-blue-500/[0.04]' : ''} cursor-pointer`}
                          >
                            {content}
                          </Link>
                        )
                      }

                      return (
                        <div
                          key={n.id}
                          className={`flex gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03] ${n.is_new ? 'bg-blue-500/[0.04]' : ''}`}
                        >
                          {content}
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2.5 border-t border-white/[0.05]">
                  <Link
                    href="/dashboard/messages"
                    onClick={() => setNotifOpen(false)}
                    className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 hover:text-blue-300 font-bold uppercase tracking-widest transition-colors py-1"
                  >
                    Go to Messages
                    <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* ── Avatar / name → dropdown ───────────────────────────────────── */}
          <div className="relative" ref={dropRef}>
            <button
              onClick={toggleDrop}
              title={`Account — ${displayName}`}
              className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity"
              aria-expanded={dropOpen}
              aria-haspopup="true"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#a7c8ff]/10 border border-[#a7c8ff]/25 flex-shrink-0">
                <span className="text-[11px] font-bold text-[#a7c8ff]">{initials}</span>
              </div>
              <span className="hidden lg:flex items-center gap-1 text-[12px] font-medium text-white/60 hover:text-white/90 transition-colors whitespace-nowrap">
                {displayName}
                <span
                  className={`material-symbols-outlined text-[14px] text-white/30 transition-transform duration-200 ${dropOpen ? 'rotate-180' : ''}`}
                >
                  expand_more
                </span>
              </span>
            </button>

            {/* Account dropdown */}
            {dropOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-[180px] bg-[#0c1525] border border-white/[0.09] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.55)] overflow-hidden z-50">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setDropOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-3 text-[12px] text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px] text-slate-500" style={{ fontVariationSettings: "'wght' 300" }}>manage_accounts</span>
                  Account
                </Link>
                <div className="h-px bg-white/[0.06]" />
                <Link
                  href="/dashboard/documents"
                  onClick={() => setDropOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-3 text-[12px] text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px] text-slate-500" style={{ fontVariationSettings: "'wght' 300" }}>description</span>
                  Documents
                </Link>
                <div className="h-px bg-white/[0.06]" />
                <button
                  onClick={() => { setDropOpen(false); handleLogout() }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[12px] text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-[16px] text-slate-600" style={{ fontVariationSettings: "'wght' 300" }}>logout</span>
                  Sign Out
                </button>
              </div>
            )}
          </div>

          {/* Hamburger — mobile */}
          <button
            className="lg:hidden flex flex-col justify-center gap-[5px] w-8 h-8 ml-1"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span className={`block w-5 h-0.5 bg-white/60 transition-all duration-300 origin-center ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
            <span className={`block w-5 h-0.5 bg-white/60 transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-white/60 transition-all duration-300 origin-center ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="lg:hidden bg-[#091421]/98 backdrop-blur-xl border-t border-white/[0.06] px-6 py-5 flex flex-col gap-4">
          {PUBLIC_LINKS.map(link => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="font-sans text-[14px] font-medium text-white/70 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
          <div className="h-px bg-white/5 my-1" />
          <Link
            href="/dashboard/bookings/new"
            onClick={() => setMenuOpen(false)}
            className="inline-flex justify-center items-center gap-2 text-sm px-5 py-3 rounded-full font-semibold bg-[#c8dcff] text-[#0c1a2e] hover:bg-white transition-colors"
          >
            Book a Flight
          </Link>
          <Link
            href="/dashboard/settings"
            onClick={() => setMenuOpen(false)}
            className="text-[13px] text-white/50 hover:text-white transition-colors text-center"
          >
            Account
          </Link>
          <Link
            href="/dashboard/documents"
            onClick={() => setMenuOpen(false)}
            className="text-[13px] text-white/50 hover:text-white transition-colors text-center"
          >
            Documents
          </Link>
          <button
            onClick={() => { setMenuOpen(false); handleLogout() }}
            className="text-[13px] text-white/50 hover:text-white transition-colors text-center"
          >
            Sign Out
          </button>
        </div>
      )}
    </header>
  )
}
