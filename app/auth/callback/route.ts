import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enqueueCustomerWelcomeEmails } from '@/lib/email/outbox'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
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
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  // Missing or invalid code — send back to login
  return NextResponse.redirect(`${origin}/login`)
}
