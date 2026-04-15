'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type NavItem = { label: string; icon: string; href: string }

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview',              icon: 'dashboard',        href: '/admin' },
  { label: 'All Customers',         icon: 'people',           href: '/admin/all-customers' },
  { label: 'Pending Verifications', icon: 'pending_actions',  href: '/admin/pending-verifications' },
  { label: 'On Hold',               icon: 'pause_circle',     href: '/admin/on-hold' },
  { label: 'Verified Users',        icon: 'verified_user',    href: '/admin/verified-users' },
  { label: 'Rejected Users',        icon: 'person_off',       href: '/admin/rejected-users' },
  { label: 'Bookings',              icon: 'event_seat',       href: '/admin/bookings' },
  { label: 'Aircraft Availability', icon: 'flight',           href: '/admin/aircraft' },
]

export default function AdminSidebar({ displayName }: { displayName: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <aside className="fixed left-0 top-0 h-full flex flex-col py-8 px-6 w-72 border-r border-white/5 bg-slate-950/80 backdrop-blur-xl z-50">
      {/* Brand */}
      <div className="mb-12 px-4">
        <h1 className="text-base font-serif italic text-blue-100 tracking-wider leading-tight">OZ Rent A Plane</h1>
        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mt-1">Admin ATC</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 text-sm
              ${isActive(item.href)
                ? 'text-blue-200 font-bold border-r-2 border-blue-300/50 bg-white/5'
                : 'text-slate-400 font-normal hover:text-blue-100 hover:bg-white/5'}`}
          >
            <span
              className={`material-symbols-outlined ${
                item.href === '/admin/on-hold' && isActive(item.href)
                  ? 'text-amber-400'
                  : item.href === '/admin/on-hold'
                  ? 'text-amber-600/60'
                  : ''
              }`}
              style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
            >
              {item.icon}
            </span>
            <span className="tracking-wide">{item.label}</span>
          </Link>
        ))}
        <div className="pt-6 mt-6 border-t border-white/5">
          <Link
            href="/admin/settings"
            className="flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 text-sm text-slate-400 hover:text-blue-100 hover:bg-white/5"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>settings</span>
            <span className="tracking-wide">Settings</span>
          </Link>
        </div>
      </nav>

      {/* Admin identity footer */}
      <div className="mt-auto px-4 py-4 flex items-center justify-between bg-white/5 rounded-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-blue-900/50 border border-blue-300/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-blue-200">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-blue-100 truncate">{displayName}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-tighter">Administrator</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-slate-500 hover:text-blue-100 transition-colors flex-shrink-0"
          title="Sign out"
        >
          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'wght' 300" }}>logout</span>
        </button>
      </div>
    </aside>
  )
}
