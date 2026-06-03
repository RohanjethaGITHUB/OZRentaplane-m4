'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type NavItem = { label: string; href: string; badgeKey?: string }

type NavGroupType = {
  title: string
  href: string
  icon: string
  badgeKey?: string
  items?: NavItem[]
}

type BadgeKey =
  | 'actions'
  | 'checkouts'
  | 'checkoutNewRequests'
  | 'checkoutAwaitingOutcome'
  | 'checkoutPayments'
  | 'checkoutReschedule'
  | 'checkoutCancelled'
  | 'bookings'
  | 'awaitingFlightRecord'
  | 'postFlightReview'
  | 'bookingPayments'
  | 'bookingCancellations'
  | 'bookingOnHold'
  | 'messagesUnread'

const NAV_GROUPS: NavGroupType[] = [
  {
    title: 'Actions',
    href: '/admin',
    icon: 'dashboard',
    badgeKey: 'actions',
  },
  {
    title: 'Bookings',
    href: '/admin/bookings',
    icon: 'event_seat',
    badgeKey: 'bookings',
    items: [
      { label: 'Overview', href: '/admin/bookings' },
      { label: 'Upcoming Flights', href: '/admin/bookings/upcoming-flights' },
      { label: 'Awaiting Flight Records', href: '/admin/bookings/awaiting-flight-records', badgeKey: 'awaitingFlightRecord' },
      { label: 'On Hold', href: '/admin/bookings/on-hold', badgeKey: 'bookingOnHold' },
      { label: 'Post-flight Review', href: '/admin/bookings/post-flight-review', badgeKey: 'postFlightReview' },
      { label: 'Payments', href: '/admin/bookings/payments', badgeKey: 'bookingPayments' },
      { label: 'Cancellations', href: '/admin/bookings/cancellations', badgeKey: 'bookingCancellations' },
      { label: 'History', href: '/admin/bookings/history' },
      { label: 'Checkout Overview', href: '/admin/checkouts' },
      { label: 'All Checkouts', href: '/admin/checkouts/all' },
      { label: 'Checkout Payments', href: '/admin/checkouts/payments?tab=paid', badgeKey: 'checkoutPayments' },
      { label: 'Checkout History', href: '/admin/checkouts/history' },
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
      { label: 'Flight Log', href: '/admin/aircraft/flight-log' },
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
  actionCounts = {},
}: {
  displayName: string
  unreadMessageCount?: number
  actionCounts?: Record<string, number>
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  function deriveExpandedGroup(path: string | null): string | null {
    for (const group of NAV_GROUPS) {
      if (!group.items) continue
      const inGroup = path === group.href || (path?.startsWith(group.href + '/') ?? false)
      if (inGroup) return group.title
    }
    return null
  }

  useEffect(() => {
    setExpandedGroup(deriveExpandedGroup(pathname))
  }, [pathname])

  const rawCounts = useMemo(() => {
    const checkoutNewRequests = actionCounts.checkoutNewRequests ?? 0
    const checkoutAwaitingOutcome = actionCounts.checkoutAwaitingOutcome ?? 0
    const checkoutPayments = actionCounts.checkoutPayments ?? 0
    const checkoutReschedule = actionCounts.checkoutReschedule ?? 0
    const checkoutCancelled = actionCounts.checkoutCancelled ?? 0

    const awaitingFlightRecord = actionCounts.awaitingFlightRecord ?? 0
    const bookingOnHold = actionCounts.bookingOnHold ?? 0
    const postFlightReview = actionCounts.postFlightReview ?? 0
    const bookingPayments = actionCounts.bookingPayments ?? 0
    const bookingCancellations = actionCounts.bookingCancellations ?? 0

    const checkouts = checkoutNewRequests + checkoutAwaitingOutcome + checkoutPayments + checkoutReschedule + checkoutCancelled
    const bookings = awaitingFlightRecord + bookingOnHold + postFlightReview + bookingPayments + bookingCancellations
    const messagesUnread = unreadMessageCount
    const actions = checkouts + bookings + messagesUnread

    return {
      checkoutNewRequests,
      checkoutAwaitingOutcome,
      checkoutPayments,
      checkoutReschedule,
      checkoutCancelled,
      awaitingFlightRecord,
      bookingOnHold,
      postFlightReview,
      bookingPayments,
      bookingCancellations,
      checkouts,
      bookings,
      messagesUnread,
      actions,
    } satisfies Record<BadgeKey, number>
  }, [actionCounts, unreadMessageCount])

  const counts = rawCounts

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isGroupActive(group: NavGroupType) {
    if (group.href === '/admin') return pathname === '/admin'
    return pathname === group.href || (pathname?.startsWith(group.href + '/') ?? false)
  }

  function isItemActive(href: string) {
    const [itemPath, itemQuery] = href.split('?')
    if (pathname !== itemPath) return false
    if (!itemQuery) return true
    const qp = new URLSearchParams(itemQuery)
    let matches = true
    qp.forEach((value, key) => {
      if ((searchParams?.get(key) ?? null) !== value) matches = false
    })
    if (!matches) return false
    return true
  }

  function toggleGroup(title: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setExpandedGroup((prev) => (prev === title ? null : title))
  }

  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Keep badges stable and server-driven: no client-side "seen" subtraction.

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
        border-r border-[var(--admin-border)] bg-[#e8f2fb] lg:bg-[#e8f2fb] backdrop-blur-xl z-[70] lg:z-10
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
            const isOpen = expandedGroup === group.title
            const groupCount = group.badgeKey ? (counts[group.badgeKey as BadgeKey] ?? 0) : 0
            const showBadge = groupCount > 0
            const badgeValue = groupCount

            return (
              <div key={group.title} className="flex flex-col gap-1">
                <div className="flex items-center">
                  <Link
                    href={group.href}
                    className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 border border-transparent
                      ${groupActive
                        ? 'text-white font-semibold bg-[#1a4a7a] border-[#1a4a7a] shadow-sm'
                        : 'text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] hover:bg-[#1a4fd6]/8'}`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${groupActive ? 'text-white' : 'text-[var(--admin-text-dim)]'}`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>
                      {group.icon}
                    </span>
                    <span className="flex-1 whitespace-nowrap">{group.title}</span>
                    {showBadge && (
                      <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-[10px] font-bold text-white tabular-nums border border-red-200/30">
                        {badgeValue > 99 ? '99+' : badgeValue}
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
                        const itemCount = item.badgeKey ? (counts[item.badgeKey as BadgeKey] ?? 0) : 0
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors duration-200
                              ${active
                                ? 'text-white font-semibold bg-[#1a4a7a] shadow-sm'
                                : 'text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] hover:bg-[#1a4fd6]/5'}`}
                          >
                            <span>{item.label}</span>
                            {itemCount > 0 && (
                              <span className="ml-auto flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white tabular-nums border border-red-200/30">
                                {itemCount > 99 ? '99+' : itemCount}
                              </span>
                            )}
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

        <div className="mt-auto px-4 pt-4 border-t border-[#152d5a]/15 shrink-0 block bg-[#e8f2fb] lg:bg-[#e8f2fb]">
          <div className="px-4 py-3 flex items-center justify-between bg-[#e8f2fb] border border-[var(--admin-border)] rounded-[16px] transition-colors">
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
