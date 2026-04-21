'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

// Keep the Tab type in sync with DashboardContent
export type DashTab = 'Dashboard' | 'My Profile' | 'Documents' | 'Messages' | 'Bookings' | 'Support'

type NavItem = {
  label: string
  icon: string
  href?: string          // route-based navigation
  tab?: DashTab          // SPA tab navigation (DashboardContent only)
  requiresVerified?: boolean
}

type NavGroup = {
  title: string
  activeTabs?: DashTab[]
  activeRoutes?: string[] // prefixes that auto-open this group
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Main',
    activeTabs: ['Dashboard'],
    items: [
      { label: 'Dashboard', icon: 'dashboard', tab: 'Dashboard' },
    ],
  },
  {
    title: 'Account',
    activeTabs: ['My Profile', 'Documents'],
    items: [
      { label: 'My Profile', icon: 'account_circle', tab: 'My Profile' },
      { label: 'Documents',  icon: 'description',    tab: 'Documents'  },
    ],
  },
  {
    title: 'Bookings',
    activeTabs: ['Bookings'],
    activeRoutes: ['/dashboard/bookings'],
    items: [
      { label: 'My Bookings',      icon: 'calendar_month', href: '/dashboard/bookings',     requiresVerified: true },
      { label: 'Request a Flight', icon: 'flight_takeoff', href: '/dashboard/bookings/new', requiresVerified: true },
    ],
  },
  {
    title: 'Support',
    activeTabs: ['Messages', 'Support'],
    items: [
      { label: 'Messages', icon: 'chat',            tab: 'Messages' },
      { label: 'Support',  icon: 'contact_support', tab: 'Support'  },
    ],
  },
]

type Props = {
  displayName: string
  sidebarRole?: string
  activeTab?: DashTab
  onTabChange?: (tab: DashTab) => void
  chatUnreadCount?: number
  isVerified?: boolean
  onLogout: () => void
}

export default function CustomerSidebar({
  displayName,
  sidebarRole = 'Aviator Member',
  activeTab,
  onTabChange,
  chatUnreadCount = 0,
  isVerified = false,
  onLogout,
}: Props) {
  const pathname = usePathname()

  function isGroupActive(group: NavGroup): boolean {
    if (activeTab && group.activeTabs?.includes(activeTab)) return true
    if (group.activeRoutes?.some(r => pathname.startsWith(r))) return true
    return false
  }

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Main: true,
    Account: false,
    Bookings: false,
    Support: false,
  })

  // Auto-expand the group that owns the active route/tab
  useEffect(() => {
    const updates: Record<string, boolean> = {}
    for (const group of NAV_GROUPS) {
      if (isGroupActive(group) && !openGroups[group.title]) {
        updates[group.title] = true
      }
    }
    if (Object.keys(updates).length > 0) {
      setOpenGroups(prev => ({ ...prev, ...updates }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, activeTab])

  function isItemActive(item: NavItem): boolean {
    if (item.tab && activeTab === item.tab) return true
    if (item.href) {
      // Exact match for /dashboard/bookings (don't highlighted for sub-routes of sub-routes)
      if (item.href === '/dashboard/bookings') return pathname === '/dashboard/bookings'
      return pathname === item.href || pathname.startsWith(item.href + '/')
    }
    return false
  }

  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-white/5 bg-[#091421]/90 backdrop-blur-xl flex flex-col py-8 z-50">
      {/* Brand */}
      <div className="mb-10 px-6">
        <h1 className="text-xl font-serif italic text-white tracking-tight">The Blue Hour</h1>
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-oz-blue/60 mt-1">{sidebarRole}</p>
      </div>

      {/* Collapsible Nav Groups */}
      <nav className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-5">
        {NAV_GROUPS.map(group => {
          const isOpen = openGroups[group.title] ?? false

          return (
            <div key={group.title} className="flex flex-col gap-1">
              {/* Group heading */}
              <button
                onClick={() => setOpenGroups(prev => ({ ...prev, [group.title]: !prev[group.title] }))}
                className="w-full flex items-center justify-between px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 hover:text-slate-300 transition-colors"
              >
                <span>{group.title}</span>
                <span className={`material-symbols-outlined text-[16px] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>

              {/* Smooth height expansion via CSS grid trick */}
              <div className={`grid transition-[grid-template-rows,opacity] duration-[380ms] ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden flex flex-col gap-1 ml-1">
                  {group.items.map(item => {
                    const active = isItemActive(item)
                    const locked = (item.requiresVerified === true) && !isVerified
                    const showBadge = item.tab === 'Messages' && chatUnreadCount > 0 && !locked

                    const pillClass = `w-full flex items-center gap-3 px-4 py-2.5 rounded-[10px] transition-all duration-200 border border-transparent text-left ${
                      active
                        ? 'text-oz-blue font-bold bg-oz-blue/10 border-oz-blue/20 shadow-[0_0_12px_rgba(59,130,246,0.12)]'
                        : locked
                        ? 'text-slate-600 cursor-not-allowed opacity-50'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`

                    const inner = (
                      <>
                        <span
                          className={`material-symbols-outlined text-[17px] flex-shrink-0 ${active ? 'text-oz-blue' : locked ? 'text-slate-600' : 'text-slate-500'}`}
                          style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                        >
                          {item.icon}
                        </span>
                        <span className="text-xs font-semibold tracking-wide flex-1 truncate">{item.label}</span>
                        {locked && (
                          <span className="material-symbols-outlined text-[13px] text-slate-600 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>lock</span>
                        )}
                        {showBadge && (
                          <span className="flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-oz-blue text-[9px] font-bold text-white tabular-nums flex-shrink-0">
                            {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
                          </span>
                        )}
                      </>
                    )

                    // Route-based item
                    if (item.href && !locked) {
                      return (
                        <Link key={item.label} href={item.href} className={pillClass}>
                          {inner}
                        </Link>
                      )
                    }

                    // Tab-based item (SPA) or locked item
                    return (
                      <button
                        key={item.label}
                        disabled={locked}
                        onClick={() => {
                          if (locked) return
                          if (item.tab && onTabChange) {
                            onTabChange(item.tab)
                          } else {
                            // On booking sub-routes: navigate back to dashboard root
                            window.location.href = '/dashboard'
                          }
                        }}
                        className={pillClass}
                      >
                        {inner}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </nav>

      {/* User card */}
      <div className="px-4 pt-4 border-t border-white/5 shrink-0">
        <div className="px-3 py-3 flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-[14px] hover:bg-white/[0.05] transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-oz-blue/10 border border-oz-blue/20 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-oz-blue">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{displayName}</p>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold">{sidebarRole}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0 ml-2"
            title="Sign out"
          >
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'wght' 300" }}>logout</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
