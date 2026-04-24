'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Overview',      href: '/dashboard',              exact: true,  icon: 'grid_view'       },
  { label: 'Book a Flight', href: '/dashboard/bookings/new', exact: true,  icon: 'flight_takeoff'  },
  { label: 'My Bookings',   href: '/dashboard/bookings',     exact: false, excludePrefix: '/dashboard/bookings/new', icon: 'luggage' },
  { label: 'Documents',     href: '/dashboard/documents',    exact: false, icon: 'description'     },
  { label: 'Messages',      href: '/dashboard/messages',     exact: false, icon: 'chat'            },
  { label: 'Account',       href: '/dashboard/settings',     exact: false, icon: 'manage_accounts' },
]

function isNavItemActive(item: typeof NAV_ITEMS[number], pathname: string): boolean {
  if (item.excludePrefix && pathname.startsWith(item.excludePrefix)) return false
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

type Props = {
  verificationStatus?: string | null
}

export default function CustomerPortalSubNav({ verificationStatus }: Props) {
  const pathname = usePathname()

  let statusText  = 'Complete Setup'
  let statusColor = 'text-slate-400 bg-slate-400/10 border-slate-400/20'
  let icon        = 'account_circle'
  let showPulse   = false

  if (verificationStatus === 'verified') {
    statusText  = 'Ready to Fly'
    statusColor = 'text-green-400 bg-green-500/10 border-green-500/20'
    icon        = 'check_circle'
  } else if (verificationStatus === 'pending_review') {
    statusText  = 'Pending Review'
    statusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    icon        = 'hourglass_empty'
  } else if (verificationStatus === 'on_hold' || verificationStatus === 'rejected') {
    statusText  = 'Action Required'
    statusColor = 'text-red-400 bg-red-500/10 border-red-500/20'
    icon        = 'warning'
    showPulse   = true
  }

  return (
    <nav
      className="sticky top-4 z-40 px-4 md:px-8 xl:px-10 pointer-events-none mt-3 mb-6"
      aria-label="Customer portal navigation"
    >
      <div className="max-w-[1280px] mx-auto pointer-events-auto">
        <div className="bg-[#050B14]/85 backdrop-blur-2xl border border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-2xl flex flex-col lg:flex-row lg:items-center p-2 gap-2 lg:gap-0">

          {/* Left: Portal Brand & Status */}
          <div className="flex items-center gap-3 px-3 py-1.5">
            <div className="w-8 h-8 rounded-xl bg-[#a7c8ff]/[0.08] border border-[#a7c8ff]/[0.12] flex items-center justify-center flex-shrink-0">
              <span
                className="material-symbols-outlined text-[16px] text-[#a7c8ff]/60"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                flight
              </span>
            </div>
            <span className="text-white/85 font-serif italic font-medium tracking-wide text-sm">Pilot Portal</span>
            <div className="h-4 w-px bg-white/[0.08]" />
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
              <span className="material-symbols-outlined text-[13px]">{icon}</span>
              <span>{statusText}</span>
              {showPulse && (
                <span className="relative flex h-2 w-2 ml-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px self-stretch my-1.5 bg-white/[0.06] flex-shrink-0 mx-1" />

          {/* Right: Nav Links with icons */}
          <div className="overflow-x-auto scrollbar-none flex-1">
            <ul className="flex items-center gap-0.5 px-1">
              {NAV_ITEMS.map(item => {
                const active = isNavItemActive(item, pathname)
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
                      <span
                        className={`material-symbols-outlined text-[17px] transition-colors ${active ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-300'}`}
                        style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                      >
                        {item.icon}
                      </span>
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
