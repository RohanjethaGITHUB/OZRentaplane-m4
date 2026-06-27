with open("app/admin/AdminSidebar.tsx", "r") as f:
    content = f.read()

# Replace NAV_ITEMS list
old_nav = """const NAV_ITEMS: NavItem[] = [
  { label: 'Overview',              icon: 'dashboard',        href: '/admin' },
  { label: 'All Customers',         icon: 'people',           href: '/admin/all-customers' },
  { label: 'Pending Verifications', icon: 'pending_actions',  href: '/admin/pending-verifications' },
  { label: 'On Hold',               icon: 'pause_circle',     href: '/admin/on-hold' },
  { label: 'Verified Users',        icon: 'verified_user',    href: '/admin/verified-users' },
  { label: 'Rejected Users',        icon: 'person_off',       href: '/admin/rejected-users' },
  { label: 'Messages',              icon: 'chat',             href: '/admin/messages' },
  { label: 'Bookings',              icon: 'event_seat',       href: '/admin/bookings' },
  { label: 'Aircraft Availability', icon: 'flight',           href: '/admin/aircraft' },
]"""

new_nav = """const NAV_ITEMS: NavItem[] = [
  { label: 'Overview',              icon: 'dashboard',        href: '/admin' },
  { label: 'All Customers',         icon: 'people',           href: '/admin/all-customers' },
  { label: 'Pending Verifications', icon: 'pending_actions',  href: '/admin/pending-verifications' },
  { label: 'Messages',              icon: 'chat',             href: '/admin/messages' },
  { label: 'Bookings Overview',     icon: 'event_seat',       href: '/admin/bookings' },
  { label: 'Calendar',              icon: 'calendar_month',   href: '/admin/bookings/calendar' },
  { label: 'Booking Requests',      icon: 'fact_check',       href: '/admin/bookings/requests' },
  { label: 'Post-Flight Reviews',   icon: 'assignment_turned_in', href: '/admin/bookings/post-flight-reviews' },
  { label: 'Meter History',         icon: 'av_timer',         href: '/admin/aircraft/meter-history' },
]"""

# Fix isActive to exactly match /admin/bookings
old_is_active = """  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }"""

new_is_active = """  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    if (href === '/admin/bookings') return pathname === '/admin/bookings'
    return pathname.startsWith(href)
  }"""

content = content.replace(old_nav, new_nav)
content = content.replace(old_is_active, new_is_active)

with open("app/admin/AdminSidebar.tsx", "w") as f:
    f.write(content)
print("Updated sidebar")
