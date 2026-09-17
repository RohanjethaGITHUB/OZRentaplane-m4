import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enqueueCustomerWelcomeEmails } from '@/lib/email/outbox'

function normalizeNextPath(input: string | null): string {
  if (!input) return '/dashboard'
  if (!input.startsWith('/')) return '/dashboard'
  if (input.startsWith('//')) return '/dashboard'
  return input
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = normalizeNextPath(searchParams.get('next'))
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') || (origin.startsWith('https') ? 'https' : 'http')
  const effectiveHost = forwardedHost || host
  const baseUrl = effectiveHost && !origin.includes('localhost')
    ? `${proto}://${effectiveHost}`
    : origin

  if (error || errorDescription) {
    const errorMsg = errorDescription || error || 'Authentication failed. Please try again.'
    return NextResponse.redirect(`${baseUrl}/login?error=${encodeURIComponent(errorMsg)}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (!exchangeError) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, first_name, email, phone_number, phone_country_code, pilot_clearance_status')
          .eq('id', user.id)
          .single()
        if (profile?.email && profile.pilot_clearance_status === 'checkout_required') {
          const customerPhone = profile.phone_number
            ? `${profile.phone_country_code || ''} ${profile.phone_number}`.trim()
            : null

          void enqueueCustomerWelcomeEmails({
            customerId: user.id,
            customerName: profile.full_name || 'Pilot',
            customerEmail: profile.email,
            customerPhone,
            firstName: profile.first_name || undefined,
          }).catch((err) => console.error('[auth/callback] welcome email failed:', err))
        }
      }
      return NextResponse.redirect(`${baseUrl}${next}`)
    } else {
      return NextResponse.redirect(`${baseUrl}/login?error=${encodeURIComponent(exchangeError.message)}`)
    }
  }

  // Missing or invalid code — send back to login
  return NextResponse.redirect(`${baseUrl}/login`)
}
