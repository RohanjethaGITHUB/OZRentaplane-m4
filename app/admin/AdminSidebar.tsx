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
    title: 'Overview',
    href: '/admin',
    icon: 'dashboard',
  },
  {
    title: 'Bookings',
    href: '/admin/bookings',
    icon: 'event_seat',
    items: [
      { label: 'Bookings Overview', href: '/admin/bookings' },
      { label: 'Checkout Flights', href: '/admin/bookings/checkout' },
      { label: 'Flight Bookings', href: '/admin/bookings/flights' },
      { label: 'Payments & Cancellations', href: '/admin/bookings/payments-cancellations' },
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
        className="lg:hidden fixed top-20 left-4 z-40 p-2 bg-[#111620] border border-white/10 rounded-xl text-white/70 hover:text-white"
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
        border-r border-white/5 bg-slate-950/95 lg:bg-slate-950/50 backdrop-blur-xl z-[70] lg:z-10
        flex flex-col py-6 transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex lg:hidden justify-end px-4 mb-2">
          <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-white/50 hover:text-white">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 300" }}>close</span>
          </button>
        </div>

        <div className="hidden lg:block mb-8 px-8 mt-4">
          <h1 className="text-lg font-serif italic text-blue-100 tracking-wide leading-tight">OZ Rent A Plane</h1>
          <p className="text-xs text-slate-400 mt-1">Admin Control Centre</p>
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
                        ? 'text-blue-200 font-semibold bg-[#0c1326] border-blue-900/50 shadow-[0_0_20px_rgba(30,58,138,0.2)]'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${groupActive ? 'text-blue-300' : 'text-slate-500'}`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>
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
                      className="p-2 ml-1 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
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
                    <div className="overflow-hidden flex flex-col gap-1 pl-10 pr-2 border-l border-white/5 ml-6">
                      <div className="py-1" />
                      {group.items.map(item => {
                        const active = isItemActive(item.href)
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors duration-200
                              ${active
                                ? 'text-blue-200 font-semibold bg-white/[0.03]'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'}`}
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

        <div className="mt-auto px-4 pt-4 border-t border-white/5 shrink-0 block bg-slate-950/50 lg:bg-transparent">
          <div className="px-4 py-3 flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-[16px] hover:bg-white/[0.05] transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-blue-900/50 border border-blue-300/20 flex items-center justify-center flex-shrink-0 shadow-inner">
                <span className="text-[11px] font-bold text-blue-200">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                <p className="text-xs text-slate-500 mt-0.5">Administrator</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-500 hover:text-red-400/80 transition-colors flex-shrink-0 ml-2"
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
