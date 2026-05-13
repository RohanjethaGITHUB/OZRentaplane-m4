import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send-email'
import { welcomeCheckoutRequiredEmail } from '@/lib/email/templates/account'

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
          .select('full_name, email, pilot_clearance_status')
          .eq('id', user.id)
          .single()
        if (profile?.email && profile.pilot_clearance_status === 'checkout_required') {
          const template = welcomeCheckoutRequiredEmail(profile.full_name)
          await sendEmail({
            to: profile.email,
            subject: template.subject,
            html: template.html,
            eventType: 'welcome_checkout_required',
            entityType: 'profile',
            entityId: user.id,
          })
        }
      }
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  // Missing or invalid code — send back to login
  return NextResponse.redirect(`${origin}/login`)
}
