'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type NavItem = { label: string; icon: string; href: string }

type NavGroupType = {
  title: string
  items: NavItem[]
  defaultOpenKeys: string[]
}

const NAV_GROUPS: NavGroupType[] = [
  {
    title: 'Main',
    defaultOpenKeys: ['/admin'],
    items: [
      { label: 'Overview', icon: 'dashboard', href: '/admin' }
    ]
  },
  {
    title: 'Customers',
    defaultOpenKeys: ['/admin/customers', '/admin/all-customers', '/admin/pending-verifications', '/admin/messages', '/admin/on-hold', '/admin/verified-users', '/admin/rejected-users'],
    items: [
      { label: 'Customers Overview', icon: 'group_work', href: '/admin/customers' },
      { label: 'All Customers', icon: 'people', href: '/admin/all-customers' },
      { label: 'Pending Verifications', icon: 'pending_actions', href: '/admin/pending-verifications' },
      { label: 'Messages', icon: 'chat', href: '/admin/messages' },
    ]
  },
  {
    title: 'Bookings',
    defaultOpenKeys: ['/admin/bookings', '/admin/bookings/calendar', '/admin/bookings/requests', '/admin/bookings/post-flight-reviews', '/admin/bookings/blocks/new'],
    items: [
      { label: 'Bookings Overview', icon: 'event_seat', href: '/admin/bookings' },
      { label: 'Calendar', icon: 'calendar_month', href: '/admin/bookings/calendar' },
      { label: 'Booking Requests', icon: 'fact_check', href: '/admin/bookings/requests' },
      { label: 'Post-Flight Reviews', icon: 'assignment_turned_in', href: '/admin/bookings/post-flight-reviews' }
    ]
  },
  {
    title: 'Aircraft',
    defaultOpenKeys: ['/admin/aircraft', '/admin/aircraft/meter-history'],
    items: [
      { label: 'Aircraft Overview', icon: 'airlines', href: '/admin/aircraft' },
      { label: 'Meter History', icon: 'av_timer', href: '/admin/aircraft/meter-history' },
      { label: 'Availability / Status', icon: 'flight', href: '/admin/aircraft-availability' } // placeholder
    ]
  }
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
    'Main': true,
  })

  // Expand group automatically if current route lives inside it
  useEffect(() => {
    let changed = false
    const newOpenState = { ...openGroups }

    for (const group of NAV_GROUPS) {
      // Main must specifically match absolute /admin
      let isActiveInGroup = false
      if (group.title === 'Main') {
        isActiveInGroup = pathname === '/admin'
      } else {
        isActiveInGroup = group.defaultOpenKeys.some(key => 
          (key === '/admin/customers' || key === '/admin/bookings' || key === '/admin/aircraft') 
            ? pathname === key 
            : pathname.startsWith(key)
        )
      }
      
      if (isActiveInGroup && !newOpenState[group.title]) {
        newOpenState[group.title] = true
        changed = true
      }
    }

    if (changed) {
      setOpenGroups(newOpenState)
    }
  }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    if (href === '/admin/customers') return pathname === '/admin/customers'
    if (href === '/admin/bookings') return pathname === '/admin/bookings'
    if (href === '/admin/aircraft') return pathname === '/admin/aircraft'
    return pathname.startsWith(href)
  }

  function toggleGroup(title: string) {
    setOpenGroups(prev => ({
      ...prev,
      [title]: !prev[title]
    }))
  }

  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <aside className="fixed left-0 top-0 h-full flex flex-col py-8 w-72 border-r border-white/5 bg-slate-950/80 backdrop-blur-xl z-50">
      {/* Brand */}
      <div className="mb-8 px-10">
        <h1 className="text-base font-serif italic text-blue-100 tracking-wider leading-tight">OZ Rent A Plane</h1>
        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mt-1">Admin ATC</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar flex flex-col gap-8 text-sm">
        {NAV_GROUPS.map(group => {
          const isOpen = openGroups[group.title]

          return (
            <div key={group.title} className="flex flex-col gap-2">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.title)}
                className="w-full flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 hover:text-slate-200 transition-colors"
                title={`Toggle ${group.title}`}
              >
                <span>{group.title}</span>
                <span 
                  className={`material-symbols-outlined text-[18px] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                >
                  expand_more
                </span>
              </button>

              {/* Group Items Grid Container for smooth height transition */}
              <div 
                className={`grid transition-[grid-template-rows,opacity] duration-[400ms] ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
              >
                <div className="overflow-hidden flex flex-col gap-1 ml-2">
                  {group.items.map(item => {
                    const active = isActive(item.href)
                    const isMessages = item.href === '/admin/messages'
                    const isOnHold   = item.href === '/admin/on-hold'
                    const showBadge  = isMessages && unreadMessageCount > 0

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 px-4 py-2.5 rounded-[12px] transition-all duration-300 border border-transparent
                          ${active
                            ? 'text-blue-300 font-bold bg-[#0c1326] border-blue-900/50 shadow-[0_0_20px_rgba(30,58,138,0.2)]'
                            : 'text-slate-400 font-normal hover:text-white hover:bg-white/5'}`}
                      >
                        <span
                          className={`material-symbols-outlined text-[18px] ${
                            isOnHold && active ? 'text-amber-400' :
                            isOnHold           ? 'text-amber-600/60' :
                            active ? 'text-blue-400' : 'text-slate-500'
                          }`}
                          style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                        >
                          {item.icon}
                        </span>
                        <span className={`tracking-wide flex-1 whitespace-nowrap ${active ? 'pl-[2px]' : ''}`}>{item.label}</span>
                        {showBadge && (
                          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-500 text-[10px] font-bold text-white tabular-nums border border-white/10">
                            {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </nav>

      {/* Admin identity footer */}
      <div className="mt-auto px-6 pt-4 border-t border-white/5 shrink-0 block">
        <div className="px-4 py-3 flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-[16px] hover:bg-white/[0.05] transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-blue-900/50 border border-blue-300/20 flex items-center justify-center flex-shrink-0 shadow-inner">
              <span className="text-[11px] font-bold text-blue-200">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{displayName}</p>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mt-0.5">Administrator</p>
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
  )
}
