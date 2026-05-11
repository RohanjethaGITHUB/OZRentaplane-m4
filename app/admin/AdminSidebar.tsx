'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type NavItem = { label: string; href: string }

type NavGroupType = {
  title: string
  href: string
  icon: string
  items?: NavItem[]
}

const NAV_GROUPS: NavGroupType[] = [
  {
    title: 'Actions',
    href: '/admin',
    icon: 'dashboard',
  },
  {
    title: 'Checkouts',
    href: '/admin/checkouts',
    icon: 'fact_check',
    items: [
      { label: 'Overview', href: '/admin/checkouts' },
      { label: 'All Checkouts', href: '/admin/checkouts/all' },
      { label: 'Payments', href: '/admin/checkouts/payments' },
      { label: 'History', href: '/admin/checkouts/history' },
    ],
  },
  {
    title: 'Bookings',
    href: '/admin/bookings',
    icon: 'event_seat',
    items: [
      { label: 'Overview', href: '/admin/bookings' },
      { label: 'Upcoming Flights', href: '/admin/bookings/upcoming-flights' },
      { label: 'Awaiting Flight Records', href: '/admin/bookings/awaiting-flight-records' },
      { label: 'Post-flight Review', href: '/admin/bookings/post-flight-review' },
      { label: 'Payments', href: '/admin/bookings/payments' },
      { label: 'History', href: '/admin/bookings/history' },
    ],
  },
  {
    title: 'Customers',
    href: '/admin/customers',
    icon: 'group_work',
    items: [
      { label: 'Customer Overview', href: '/admin/customers' },
      { label: 'Customer Directory', href: '/admin/customers/all' },
      { label: 'Customer Ledger', href: '/admin/customers/ledger' },
      { label: 'Blocked Customers', href: '/admin/customers/blocked' },
    ],
  },
  {
    title: 'Calendar',
    href: '/admin/calendar',
    icon: 'calendar_month',
  },
  {
    title: 'Aircraft',
    href: '/admin/aircraft',
    icon: 'airlines',
    items: [
      { label: 'Aircraft Overview', href: '/admin/aircraft' },
      { label: 'Availability & Blocks', href: '/admin/aircraft/availability' },
      { label: 'Maintenance / Squawks', href: '/admin/aircraft/maintenance' },
    ],
  },
  {
    title: 'Messages',
    href: '/admin/messages',
    icon: 'chat',
  },
  {
    title: 'Settings',
    href: '/admin/settings',
    icon: 'settings',
  },
]

export default function AdminSidebar({
  displayName,
  unreadMessageCount = 0,
}: {
  displayName: string
  unreadMessageCount?: number
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Checkouts: true,
    Bookings: true,
    Customers: true,
    Aircraft: true,
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    let changed = false
    const newOpenState = { ...openGroups }

    for (const group of NAV_GROUPS) {
      if (!group.items) continue
      const inGroup = pathname === group.href || pathname.startsWith(group.href + '/')
      if (inGroup && !newOpenState[group.title]) {
        newOpenState[group.title] = true
        changed = true
      }
    }

    if (changed) setOpenGroups(newOpenState)
  }, [pathname])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isGroupActive(group: NavGroupType) {
    return pathname === group.href || pathname.startsWith(group.href + '/')
  }

  function isItemActive(href: string) {
    return pathname === href
  }

  function toggleGroup(title: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }))
  }

  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <>
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="lg:hidden fixed top-20 left-4 z-40 p-2 bg-[var(--admin-sidebar-bg)] border border-[var(--admin-border)] rounded-xl text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]"
      >
        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 300" }}>menu</span>
      </button>

      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={`
        fixed left-0 top-[64px] lg:top-0 lg:absolute h-[calc(100vh-64px)] lg:h-full w-72
        border-r border-[var(--admin-border)] bg-[var(--admin-sidebar-bg)]/95 lg:bg-[var(--admin-sidebar-bg)]/88 backdrop-blur-xl z-[70] lg:z-10
        flex flex-col py-6 transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex lg:hidden justify-end px-4 mb-2">
          <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-white/50 hover:text-white">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 300" }}>close</span>
          </button>
        </div>

        <div className="hidden lg:block mb-10 px-8 mt-4">
          <h1 className="text-[2.65rem] leading-none font-semibold italic tracking-tight text-[var(--admin-text)]">OZ Rent A Plane</h1>
          <p className="text-xs tracking-[0.24em] uppercase text-[var(--admin-text-muted)] mt-2">Admin Control Centre</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-6 custom-scrollbar flex flex-col gap-2 text-base">
          {NAV_GROUPS.map(group => {
            const groupActive = isGroupActive(group)
            const isOpen = openGroups[group.title]
            const isMessages = group.href === '/admin/messages'
            const showBadge = isMessages && unreadMessageCount > 0

            return (
              <div key={group.title} className="flex flex-col gap-1">
                <div className="flex items-center">
                  <Link
                    href={group.href}
                    className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 border border-transparent
                      ${groupActive
                        ? 'text-[#dbeafe] font-semibold bg-[rgba(59,130,246,0.16)] border-[rgba(96,165,250,0.32)]'
                        : 'text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] hover:bg-white/5'}`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${groupActive ? 'text-[#93c5fd]' : 'text-[var(--admin-text-dim)]'}`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>
                      {group.icon}
                    </span>
                    <span className="flex-1 whitespace-nowrap">{group.title}</span>
                    {showBadge && (
                      <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-500 text-[10px] font-bold text-white tabular-nums border border-white/10">
                        {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                      </span>
                    )}
                  </Link>

                  {group.items && (
                    <button
                      onClick={(e) => toggleGroup(group.title, e)}
                      className="p-2 ml-1 text-[var(--admin-text-dim)] hover:text-[var(--admin-text)] rounded-lg hover:bg-white/5 transition-colors"
                      title={`Toggle ${group.title}`}
                    >
                      <span className={`material-symbols-outlined text-[18px] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                        expand_more
                      </span>
                    </button>
                  )}
                </div>

                {group.items && (
                  <div className={`grid transition-[grid-template-rows,opacity] duration-[300ms] ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden flex flex-col gap-1 pl-10 pr-2 border-l border-[var(--admin-divider)] ml-6">
                      <div className="py-1" />
                      {group.items.map(item => {
                        const active = isItemActive(item.href)
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors duration-200
                              ${active
                                ? 'text-[var(--admin-accent)] font-semibold bg-[rgba(59,130,246,0.08)]'
                                : 'text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] hover:bg-white/[0.02]'}`}
                          >
                            <span>{item.label}</span>
                          </Link>
                        )
                      })}
                      <div className="py-1" />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="mt-auto px-4 pt-4 border-t border-[var(--admin-divider)] shrink-0 block bg-slate-950/50 lg:bg-transparent">
          <div className="px-4 py-3 flex items-center justify-between bg-white/[0.03] border border-[var(--admin-border)] rounded-[16px] hover:bg-white/[0.05] transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#1a2333] border border-[var(--admin-border)] flex items-center justify-center flex-shrink-0 shadow-inner">
                <span className="text-[11px] font-bold text-[var(--admin-text)]">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--admin-text)] truncate">{displayName}</p>
                <p className="text-xs text-[var(--admin-text-dim)] mt-0.5">Administrator</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-[var(--admin-text-dim)] hover:text-[var(--admin-danger)] transition-colors flex-shrink-0 ml-2"
              title="Sign out"
            >
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
