'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Overview',      href: '/dashboard',              exact: true,  icon: 'grid_view',      badgeKey: null             },
  { label: 'Book a Flight', href: '/dashboard/bookings/new', exact: true,  icon: 'flight_takeoff', badgeKey: null             },
  { label: 'My Bookings',   href: '/dashboard/bookings',     exact: false, excludePrefix: '/dashboard/bookings/new', icon: 'luggage', badgeKey: 'booking' },
  { label: 'Messages',      href: '/dashboard/messages',     exact: false, icon: 'chat',           badgeKey: 'message'        },
]

function isNavItemActive(item: typeof NAV_ITEMS[number], pathname: string): boolean {
  if ('excludePrefix' in item && item.excludePrefix && pathname.startsWith(item.excludePrefix)) return false
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

type Props = {
  verificationStatus?: string | null
  messageCount?: number
  bookingUpdateCount?: number
}

export default function CustomerPortalSubNav({ verificationStatus, messageCount = 0, bookingUpdateCount = 0 }: Props) {
  const pathname = usePathname()



  function getBadge(key: string | null): number {
    if (key === 'message') return messageCount
    if (key === 'booking') return bookingUpdateCount
    return 0
  }

  return (
    <nav
      className="sticky top-4 z-40 px-4 md:px-8 xl:px-10 pointer-events-none mt-3 mb-6"
      aria-label="Customer portal navigation"
    >
      <div className="max-w-[1280px] mx-auto pointer-events-auto">
        <div className="bg-[#050B14]/85 backdrop-blur-2xl border border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-2xl flex flex-col lg:flex-row lg:items-center p-2 gap-2 lg:gap-0">

          {/* Left: Portal Brand */}
          <div className="flex items-center px-3 py-1.5">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-xl bg-[#a7c8ff]/[0.08] border border-[#a7c8ff]/[0.12] flex items-center justify-center flex-shrink-0 group-hover:bg-[#a7c8ff]/[0.12] transition-colors">
                <span
                  className="material-symbols-outlined text-[16px] text-[#a7c8ff]/60 group-hover:text-[#a7c8ff]/90 transition-colors"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  flight
                </span>
              </div>
              <span className="text-white/85 font-serif italic font-medium tracking-wide text-sm group-hover:text-white transition-colors">Pilot Portal</span>
            </Link>
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px self-stretch my-1.5 bg-white/[0.06] flex-shrink-0 mx-1" />

          {/* Right: Nav Links with icons */}
          <div className="overflow-x-auto scrollbar-none flex-1">
            <ul className="flex items-center gap-0.5 px-1">
              {NAV_ITEMS.map(item => {
                const active = isNavItemActive(item, pathname)
                const badge  = getBadge(item.badgeKey)
                return (
                  <li key={item.href} className="flex-shrink-0">
                    <Link
                      href={item.href}
                      className={`relative flex flex-col items-center gap-0.5 px-3.5 py-2 rounded-xl transition-all duration-200 group ${
                        active
                          ? 'text-blue-300 bg-blue-500/[0.12] border border-blue-400/[0.18]'
                          : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                      }`}
                    >
                      {/* Icon with badge */}
                      <div className="relative">
                        <span
                          className={`material-symbols-outlined text-[17px] transition-colors ${active ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-300'}`}
                          style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                        >
                          {item.icon}
                        </span>
                        {badge > 0 && (
                          <span className="absolute -top-1 -right-1.5 flex items-center justify-center min-w-[14px] h-3.5 rounded-full bg-red-500 text-[8px] font-bold text-white px-0.5 leading-none shadow-[0_0_6px_rgba(239,68,68,0.4)]">
                            {badge > 9 ? '9+' : badge}
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-widest whitespace-nowrap leading-none">
                        {item.label}
                      </span>
                      {active && (
                        <div className="absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </nav>
  )
}
