import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
