import type { RealtimeEventType } from '@/lib/realtime/events'

function pathStarts(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function isCustomerBookingDetail(pathname: string): boolean {
  return /^\/dashboard\/bookings\/[^/]+$/.test(pathname)
}

function isAdminBookingDetail(pathname: string): boolean {
  return (
    /^\/admin\/bookings\/requests\/[^/]+$/.test(pathname) ||
    /^\/admin\/bookings\/post-flight\/[^/]+$/.test(pathname)
  )
}

/**
 * Page-level listeners already refresh these customer routes for these events.
 * Layout should not schedule a second full refresh for them.
 */
function customerPageOwnsEvent(type: RealtimeEventType, pathname: string): boolean {
  if (pathStarts(pathname, '/dashboard/messages')) {
    return type === 'chat:message' || type === 'chat:read'
  }
  if (pathname === '/dashboard/bookings') {
    return type === 'booking:status' || type === 'payment:updated' || type === 'ops:queue'
  }
  if (isCustomerBookingDetail(pathname)) {
    return type === 'booking:status' || type === 'payment:updated' || type === 'flight_record:updated'
  }
  return false
}

/**
 * Whether a dashboard layout-level refresh should run for this event+path.
 * Chat badge updates are handled by soft badge sync (not full RSC refresh).
 */
export function isCustomerLayoutRefreshRelevant(
  type: RealtimeEventType,
  pathname: string,
): boolean {
  if (!pathStarts(pathname, '/dashboard')) return false

  // Soft-updated via CustomerPortalNav — never full-refresh for chat alone.
  if (type === 'chat:message' || type === 'chat:read') return false

  if (customerPageOwnsEvent(type, pathname)) return false

  switch (type) {
    case 'booking:status':
    case 'payment:updated':
      return (
        pathname === '/dashboard' ||
        pathStarts(pathname, '/dashboard/bookings') ||
        pathStarts(pathname, '/dashboard/checkout') ||
        pathStarts(pathname, '/dashboard/purchases')
      )
    case 'flight_record:updated':
      return pathname === '/dashboard' || pathStarts(pathname, '/dashboard/bookings')
    case 'verification:updated':
    case 'clearance:updated':
      return (
        pathname === '/dashboard' ||
        pathStarts(pathname, '/dashboard/documents') ||
        pathStarts(pathname, '/dashboard/bookings') ||
        pathStarts(pathname, '/dashboard/checkout') ||
        pathStarts(pathname, '/dashboard/settings')
      )
    case 'block_time:updated':
    case 'ledger:updated':
      return (
        pathname === '/dashboard' ||
        pathStarts(pathname, '/dashboard/pricing') ||
        pathStarts(pathname, '/dashboard/purchases') ||
        pathStarts(pathname, '/dashboard/bookings')
      )
    case 'ops:queue':
    case 'ops:counts':
      return pathname === '/dashboard' || pathStarts(pathname, '/dashboard/bookings')
    default:
      return pathname === '/dashboard'
  }
}

function adminPageOwnsEvent(type: RealtimeEventType, pathname: string): boolean {
  if (pathStarts(pathname, '/admin/messages')) {
    // Inbox updates itself via client fetches; chat badges soft-sync.
    return type === 'chat:message' || type === 'chat:read'
  }
  if (isAdminBookingDetail(pathname)) {
    return type === 'booking:status' || type === 'payment:updated' || type === 'flight_record:updated'
  }
  if (pathStarts(pathname, '/admin/calendar') || pathStarts(pathname, '/admin/bookings/calendar')) {
    // CalendarRealtimeListener covers these; coalesce also helps.
    return type === 'ops:queue' || type === 'ops:counts' || type === 'booking:status'
  }
  return false
}

/**
 * Admin layout full-refresh relevance.
 * ops:counts + chat are soft-synced into the sidebar (not full RSC refresh).
 */
export function isAdminLayoutRefreshRelevant(
  type: RealtimeEventType,
  pathname: string,
): boolean {
  if (!pathStarts(pathname, '/admin')) return false

  // Soft-updated into AdminSidebar — avoid remounting the whole admin page.
  if (type === 'ops:counts' || type === 'chat:message' || type === 'chat:read') return false

  if (adminPageOwnsEvent(type, pathname)) return false

  switch (type) {
    case 'ops:queue':
      return (
        pathname === '/admin' ||
        pathStarts(pathname, '/admin/pending-verifications') ||
        pathStarts(pathname, '/admin/verified-users') ||
        pathStarts(pathname, '/admin/rejected-users') ||
        pathStarts(pathname, '/admin/customers') ||
        pathStarts(pathname, '/admin/bookings') ||
        pathStarts(pathname, '/admin/checkouts') ||
        pathStarts(pathname, '/admin/calendar')
      )
    case 'booking:status':
    case 'payment:updated':
    case 'flight_record:updated':
      return (
        pathname === '/admin' ||
        pathStarts(pathname, '/admin/bookings') ||
        pathStarts(pathname, '/admin/checkouts') ||
        pathStarts(pathname, '/admin/calendar') ||
        pathStarts(pathname, '/admin/customers') ||
        pathStarts(pathname, '/admin/users')
      )
    case 'verification:updated':
    case 'clearance:updated':
      return (
        pathname === '/admin' ||
        pathStarts(pathname, '/admin/pending-verifications') ||
        pathStarts(pathname, '/admin/verified-users') ||
        pathStarts(pathname, '/admin/rejected-users') ||
        pathStarts(pathname, '/admin/customers') ||
        pathStarts(pathname, '/admin/users')
      )
    case 'block_time:updated':
    case 'ledger:updated':
      return (
        pathname === '/admin' ||
        pathStarts(pathname, '/admin/customers') ||
        pathStarts(pathname, '/admin/users') ||
        pathStarts(pathname, '/admin/bookings')
      )
    default:
      return pathname === '/admin'
  }
}
