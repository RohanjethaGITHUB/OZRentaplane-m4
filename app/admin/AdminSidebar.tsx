'use client'

import { useState, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react'
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

type NavSectionType = {
  title: string
  groups: NavGroupType[]
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
    href: '/admin/bookings/flights',
    icon: 'event_seat',
    badgeKey: 'bookings',
    items: [
      { label: 'Booking Directory', href: '/admin/bookings/flights' },
    ],
  },
  {
    title: 'Customers',
    href: '/admin/customers/all',
    icon: 'group_work',
    items: [
      { label: 'Customer Directory', href: '/admin/customers/all' },
      { label: 'Customer Billing', href: '/admin/customers/ledger' },
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
    badgeKey: 'messagesUnread',
  },
  {
    title: 'Settings',
    href: '/admin/settings',
    icon: 'settings',
  },
]

const NAV_SECTIONS: NavSectionType[] = [
  {
    title: 'Operations',
    groups: NAV_GROUPS.slice(0, 2),
  },
  {
    title: 'Customers',
    groups: NAV_GROUPS.slice(2, 3),
  },
  {
    title: 'Fleet',
    groups: NAV_GROUPS.slice(3, 4),
  },
  {
    title: 'Communication',
    groups: NAV_GROUPS.slice(4, 5),
  },
  {
    title: 'Admin',
    groups: NAV_GROUPS.slice(5),
  },
]

function formatBadgeValue(value: number) {
  return value > 99 ? '99+' : value
}

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
      const inGroup =
        group.title === 'Bookings'
          ? (path?.startsWith('/admin/bookings') ?? false) || (path?.startsWith('/admin/checkouts') ?? false)
          : path === group.href || (path?.startsWith(group.href + '/') ?? false)
      if (inGroup) return group.title
    }
    return null
  }

  useEffect(() => {
    setExpandedGroup(deriveExpandedGroup(pathname))
  }, [pathname])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const body = document.body
    const previousOverflow = body.style.overflow

    if (mobileMenuOpen) {
      body.style.overflow = 'hidden'
    }

    return () => {
      body.style.overflow = previousOverflow
    }
  }, [mobileMenuOpen])

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

    const checkouts = actionCounts.checkouts ?? (checkoutNewRequests + checkoutAwaitingOutcome + checkoutPayments + checkoutReschedule + checkoutCancelled)
    const bookings = actionCounts.bookings ?? (awaitingFlightRecord + bookingOnHold + postFlightReview + bookingPayments + bookingCancellations)
    const messagesUnread = unreadMessageCount
    const actions = actionCounts.actions ?? (checkouts + bookings + messagesUnread)

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
  const [hasUnseenBookings, setHasUnseenBookings] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isBookingsPage = (pathname?.startsWith('/admin/bookings') ?? false) || (pathname?.startsWith('/admin/checkouts') ?? false)
    const currentCount = counts.bookings ?? 0

    if (isBookingsPage) {
      localStorage.setItem('admin_seen_bookings_count', String(currentCount))
      setHasUnseenBookings(false)
    } else {
      const seenCountStr = localStorage.getItem('admin_seen_bookings_count')
      if (seenCountStr === null) {
        setHasUnseenBookings(currentCount > 0)
      } else {
        const seenCount = parseInt(seenCountStr, 10)
        setHasUnseenBookings(currentCount > seenCount)
      }
    }
  }, [pathname, counts.bookings])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileMenuOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileMenuOpen])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isGroupActive(group: NavGroupType) {
    if (group.href === '/admin') return pathname === '/admin'
    if (group.title === 'Bookings') {
      return (pathname?.startsWith('/admin/bookings') ?? false) || (pathname?.startsWith('/admin/checkouts') ?? false)
    }
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

  function toggleGroup(title: string, e: ReactMouseEvent<HTMLButtonElement>) {
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
        onClick={() => setMobileMenuOpen((prev) => !prev)}
        aria-label={mobileMenuOpen ? 'Close admin navigation' : 'Open admin navigation'}
        aria-expanded={mobileMenuOpen}
        aria-controls="admin-sidebar-drawer"
        className="lg:hidden fixed top-4 left-4 z-50 inline-flex h-11 min-w-11 items-center gap-2 rounded-full border border-[rgba(148,163,184,0.20)] bg-[rgba(11,31,58,0.94)] px-4 text-[13px] font-semibold tracking-[0.03em] text-[var(--admin-sidebar-text)] shadow-[0_16px_36px_rgba(2,7,18,0.30)] backdrop-blur-md transition-colors hover:bg-[rgba(14,38,71,0.98)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
      >
        <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'wght' 300" }}>menu</span>
        <span className="hidden sm:inline">Menu</span>
      </button>

      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[2px] transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        id="admin-sidebar-drawer"
        className={`
        fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[min(20rem,calc(100vw-1rem))] flex-col overflow-hidden border-r border-[var(--admin-sidebar-border)]
        bg-[var(--admin-sidebar-bg)] shadow-[0_28px_56px_rgba(2,7,18,0.28)] transition-transform duration-300 ease-out
        lg:translate-x-0 lg:shadow-[0_20px_42px_rgba(2,7,18,0.14)] lg:w-72
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
      >
        <div className="hidden lg:flex flex-col gap-4 px-6 pt-6 pb-5 border-b border-[rgba(148,163,184,0.12)]">
          <div>
            <h1 className="font-serif text-[2.2rem] leading-none font-semibold italic tracking-tight text-[var(--admin-sidebar-text)]">
              OZ Rent A Plane
            </h1>
            <p className="mt-2 text-[11.5px] tracking-[0.24em] uppercase text-[var(--admin-sidebar-text-dim)]">
              Aviation Operations Command Centre
            </p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-[var(--admin-sidebar-text-dim)]">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(74,222,128,0.12)]" />
            <span>{counts.actions > 0 ? `${counts.actions} live ops` : 'All queues clear'}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-[rgba(148,163,184,0.12)] px-4 pb-4 pt-[calc(0.9rem+env(safe-area-inset-top))] lg:hidden">
          <div className="min-w-0">
            <p className="font-serif text-[1.2rem] leading-none font-semibold italic tracking-tight text-[var(--admin-sidebar-text)]">OZ Rent A Plane</p>
            <p className="mt-1 text-[10.5px] tracking-[0.24em] uppercase text-[var(--admin-sidebar-text-dim)]">Command Centre</p>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close admin navigation"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(148,163,184,0.18)] bg-white/5 text-[var(--admin-sidebar-text-dim)] transition-colors hover:bg-white/[0.08] hover:text-[var(--admin-sidebar-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'wght' 300" }}>
              close
            </span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-6 pt-4 text-[14.5px] [-webkit-overflow-scrolling:touch] overscroll-contain custom-scrollbar lg:px-4">
          <div className="flex flex-col gap-5">
            {NAV_SECTIONS.map((section) => (
              <section key={section.title} className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-2">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[var(--admin-sidebar-text-dim)]">
                    {section.title}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  {section.groups.map((group) => {
                    const groupActive = isGroupActive(group)
                    const isOpen = expandedGroup === group.title
                    const groupCount = group.badgeKey ? (counts[group.badgeKey as BadgeKey] ?? 0) : 0
                    const showBadge = groupCount > 0

                    return (
                      <div key={group.title} className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={group.href}
                            className={`group flex min-h-11 flex-1 items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60
                              ${groupActive
                                ? 'border-[rgba(96,165,250,0.22)] bg-[var(--admin-sidebar-active)] text-white shadow-[0_12px_28px_rgba(2,7,18,0.24)]'
                                : 'border-transparent text-[var(--admin-sidebar-text-dim)] hover:border-[rgba(148,163,184,0.10)] hover:bg-white/[0.06] hover:text-[var(--admin-sidebar-text)]'}`}
                          >
                            <span
                              className={`material-symbols-outlined text-[20px] transition-colors ${
                                groupActive ? 'text-white' : 'text-[var(--admin-sidebar-text-dim)]'
                              }`}
                              style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                            >
                              {group.icon}
                            </span>
                            <div className="flex flex-1 items-center gap-1.5 min-w-0">
                              <span className="whitespace-nowrap font-medium">{group.title}</span>
                              {group.title === 'Bookings' && hasUnseenBookings && showBadge && !groupActive ? (
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
                                </span>
                              ) : null}
                            </div>
                            {showBadge ? (
                              <span
                                className={`inline-flex min-w-[2.05rem] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                                  groupActive
                                    ? 'border-white/15 bg-white/12 text-white'
                                    : 'border-[rgba(96,165,250,0.18)] bg-[rgba(59,130,246,0.12)] text-[var(--admin-sidebar-text)]'
                                }`}
                              >
                                {formatBadgeValue(groupCount)}
                              </span>
                            ) : null}
                          </Link>

                          {group.items ? (
                            <button
                              onClick={(e) => toggleGroup(group.title, e)}
                              aria-label={`Toggle ${group.title} submenu`}
                              aria-expanded={isOpen}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-transparent text-[var(--admin-sidebar-text-dim)] transition-colors hover:border-[rgba(148,163,184,0.10)] hover:bg-white/[0.06] hover:text-[var(--admin-sidebar-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
                            >
                              <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                                expand_more
                              </span>
                            </button>
                          ) : null}
                        </div>

                        {group.items ? (
                          <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                            <div className="overflow-hidden">
                              <div className="ml-6 flex flex-col gap-1 border-l border-[rgba(148,163,184,0.14)] pl-4 pr-1 pt-1.5">
                                {group.items.map((item) => {
                                  const active = isItemActive(item.href)
                                  const itemCount = item.badgeKey ? (counts[item.badgeKey as BadgeKey] ?? 0) : 0
                                  return (
                                    <Link
                                      key={item.href}
                                      href={item.href}
                                      className={`flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60
                                        ${active
                                          ? 'bg-[rgba(255,255,255,0.08)] text-white shadow-[0_8px_20px_rgba(2,7,18,0.18)]'
                                          : 'text-[var(--admin-sidebar-text-dim)] hover:bg-white/[0.06] hover:text-[var(--admin-sidebar-text)]'}`}
                                    >
                                      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-sky-300' : 'bg-[rgba(148,163,184,0.45)]'}`} />
                                      <span className="flex-1">{item.label}</span>
                                      {itemCount > 0 ? (
                                        <span
                                          className={`inline-flex min-w-[1.95rem] items-center justify-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tabular-nums ${
                                            active
                                              ? 'border-white/15 bg-white/12 text-white'
                                              : 'border-[rgba(96,165,250,0.18)] bg-[rgba(59,130,246,0.12)] text-[var(--admin-sidebar-text)]'
                                          }`}
                                        >
                                          {formatBadgeValue(itemCount)}
                                        </span>
                                      ) : null}
                                    </Link>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </nav>

        <div className="mt-auto shrink-0 border-t border-[rgba(148,163,184,0.12)] bg-[var(--admin-sidebar-bg)] px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-[rgba(148,163,184,0.14)] bg-white/[0.05] px-4 py-3 shadow-[0_12px_28px_rgba(2,7,18,0.18)]">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[rgba(148,163,184,0.16)] bg-white/[0.07] shadow-inner">
                <span className="text-[11px] font-bold tracking-[0.08em] text-[var(--admin-sidebar-text)]">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-[var(--admin-sidebar-text)]">{displayName}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-[var(--admin-sidebar-text-dim)]">Administrator</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-transparent text-[var(--admin-sidebar-text-dim)] transition-colors hover:border-[rgba(148,163,184,0.10)] hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
              title="Sign out"
              aria-label="Sign out"
            >
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>
                logout
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
