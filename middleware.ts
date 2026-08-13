import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Public marketing / auth entry paths that do not need session refresh
 * when the visitor has no Supabase auth cookie.
 */
function isAnonymousSkippablePath(pathname: string): boolean {
  if (pathname === '/') return true
  if (pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password') return true
  if (pathname.startsWith('/auth/')) return true
  // Static marketing sections under (marketing)
  const publicPrefixes = [
    '/pricing',
    '/shop',
    '/faq',
    '/contact-us',
    '/resources',
    '/cessna-172',
    '/checkout-process',
    '/pilotRequirements',
    '/safety-disclaimer',
    '/privacy',
    '/terms',
  ]
  return publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(
    (cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'),
  )
}

export async function middleware(request: NextRequest) {
  const hostHeader = request.headers.get('host') ?? ''
  const host = hostHeader.split(':')[0]?.toLowerCase() ?? ''

  // Canonical production host enforcement: apex -> www.
  // This runs before auth/session refresh to avoid cross-domain cookie split.
  if (host === 'ozrentaplane.com') {
    const url = request.nextUrl.clone()
    url.host = 'www.ozrentaplane.com'
    return NextResponse.redirect(url, 308)
  }

  let supabaseResponse = NextResponse.next({ request })
  const pathname = normalizePath(request.nextUrl.pathname)

  // Anonymous visitors on public pages: skip getUser() network round-trip.
  // Logged-in users (auth cookie present) still refresh the session everywhere.
  if (!hasSupabaseAuthCookie(request) && isAnonymousSkippablePath(pathname)) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write refreshed tokens back onto both the request and response so
          // subsequent Server Component reads (layout → getUser) see the
          // up-to-date session without needing another round-trip.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not add any code between createServerClient and getUser().
  // A stale session would cause users to be randomly signed out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return supabaseResponse

  const isPasswordGatePath = pathname === '/change-password' || pathname === '/dashboard/change-password'
  const isDashboardPath = pathname === '/dashboard' || pathname.startsWith('/dashboard/')

  if (isDashboardPath && !isPasswordGatePath) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .single()

    if (profile?.must_change_password) {
      const redirectResponse = NextResponse.redirect(new URL('/change-password', request.url))
      supabaseResponse.cookies.getAll().forEach(({ name, value, ...options }) => {
        redirectResponse.cookies.set(name, value, options)
      })
      return redirectResponse
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Exclude Next internals, images, and common static asset extensions.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|map)$).*)',
  ],
}

function normalizePath(pathname: string): string {
  if (!pathname) return ''
  if (pathname === '/') return '/'
  return pathname.replace(/\/+$/, '')
}
