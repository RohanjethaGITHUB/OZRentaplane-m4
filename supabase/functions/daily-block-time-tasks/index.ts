declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
}

// @ts-ignore Deno runtime import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore Deno runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // STEP 1: Run expiry sweep
    const { data: expiredCount, error: expireErr } = await supabase
      .rpc('expire_block_time_packages')

    if (expireErr) {
      console.error('expire_block_time_packages failed:', expireErr.message)
    } else {
      console.log('Packages expired:', expiredCount)
    }

    // STEP 2: Find packages expiring within 7 days
    // that have not yet had a reminder sent
    const now = new Date()
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { data: expiringPurchases, error: fetchErr } = await supabase
      .from('pilot_block_time_purchases')
      .select(`
        id,
        user_id,
        hours_remaining,
        rate_per_hour,
        expires_at,
        expiry_reminder_sent_at,
        package:block_time_packages (
          name,
          validity_days
        )
      `)
      .eq('status', 'active')
      .gt('hours_remaining', 0)
      .lte('expires_at', sevenDaysFromNow.toISOString())
      .gt('expires_at', now.toISOString())
      .is('expiry_reminder_sent_at', null)

    if (fetchErr) {
      console.error('Failed to fetch expiring purchases:', fetchErr.message)
      return new Response(
        JSON.stringify({ error: fetchErr.message }),
        { status: 500 }
      )
    }

    console.log('Packages needing reminder:', expiringPurchases?.length ?? 0)

    // STEP 3: For each expiring package, fetch pilot profile and send email
    const results = []
    for (const purchase of expiringPurchases ?? []) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, first_name, email')
          .eq('id', purchase.user_id)
          .single()

        if (!profile?.email) {
          console.warn('No email for user:', purchase.user_id)
          continue
        }

        const pilotFirstName = profile.first_name?.trim() ||
          profile.full_name?.split(' ')[0]?.trim() || 'Pilot'

        const expiryDate = new Date(purchase.expires_at)
          .toLocaleDateString('en-AU', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          })

        const daysUntilExpiry = Math.ceil(
          (new Date(purchase.expires_at).getTime() - now.getTime())
          / (1000 * 60 * 60 * 24)
        )

        const packageRow = Array.isArray(purchase.package)
          ? purchase.package[0]
          : purchase.package

        const packageName = packageRow?.name ?? 'Block Time'
        const validityDays = packageRow?.validity_days ?? 30
        const validityPeriodLabel = validityDays === 1
          ? '1 day'
          : `${validityDays} days`

        // Send reminder email via Resend using fetch
        // Edge Functions cannot import from lib/ -- call Resend API directly
        const resendKey = Deno.env.get('RESEND_API_KEY')
        if (!resendKey) {
          console.error('RESEND_API_KEY not set')
          continue
        }

        const subject = `Your Block Time package expires in ${daysUntilExpiry} days -- ${Number(purchase.hours_remaining).toFixed(1)}h remaining`

        const html = buildExpiryReminderHtml({
          pilotFirstName,
          packageName,
          hoursRemaining: Number(purchase.hours_remaining),
          expiryDate,
          daysUntilExpiry,
          ratePerHour: Number(purchase.rate_per_hour),
          validityPeriodLabel,
        })

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
	            from: 'OZ Rent A Plane <info@ozrentaplane.com>',
            to: [profile.email],
            subject,
            html,
          }),
        })

        if (!emailRes.ok) {
          const errText = await emailRes.text()
          console.error('Resend failed for', profile.email, errText)
          results.push({ userId: purchase.user_id, status: 'email_failed' })
          continue
        }

        // Mark reminder as sent
        await supabase
          .from('pilot_block_time_purchases')
          .update({ expiry_reminder_sent_at: now.toISOString() })
          .eq('id', purchase.id)

        console.log('Reminder sent to:', profile.email)
        results.push({ userId: purchase.user_id, status: 'sent' })

      } catch (err) {
        console.error('Error processing purchase:', purchase.id, err)
        results.push({ userId: purchase.user_id, status: 'error' })
      }
    }

    return new Response(
      JSON.stringify({
        expired: expiredCount ?? 0,
        reminders: results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Fatal error in daily-block-time-tasks:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500 }
    )
  }
})

function buildExpiryReminderHtml(params: {
  pilotFirstName: string
  packageName: string
  hoursRemaining: number
  expiryDate: string
  daysUntilExpiry: number
  ratePerHour: number
  validityPeriodLabel: string
}): string {
  const {
    pilotFirstName, packageName, hoursRemaining,
    expiryDate, daysUntilExpiry, ratePerHour, validityPeriodLabel
  } = params

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dbe8fb;">
        <tr><td style="background:#152d5a;padding:32px 40px;">
          <p style="margin:0;color:#f59e0b;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;">OZ Rent A Plane</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;font-family:Georgia,serif;">Package Expiry Reminder</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#152d5a;font-size:16px;">Hi ${pilotFirstName},</p>
          <p style="color:#4b5563;font-size:15px;line-height:1.6;">
            Just a heads up -- your Block Time package expires in
            <strong>${daysUntilExpiry} days</strong> on <strong>${expiryDate}</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f6ff;border-radius:8px;padding:20px;margin:24px 0;">
            <tr><td>
              <p style="margin:0 0 8px;color:#152d5a;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Your current balance</p>
              <p style="margin:4px 0;color:#4b5563;font-size:14px;">Package: <strong>${packageName}</strong></p>
              <p style="margin:4px 0;color:#4b5563;font-size:14px;">Hours remaining: <strong>${hoursRemaining.toFixed(1)}h</strong></p>
              <p style="margin:4px 0;color:#4b5563;font-size:14px;">Expires: <strong>${expiryDate}</strong></p>
            </td></tr>
          </table>
          <p style="color:#4b5563;font-size:15px;line-height:1.6;">Any unused hours will expire on this date.</p>
          <p style="color:#152d5a;font-size:15px;font-weight:600;margin-top:24px;">Want to keep flying at your locked rate?</p>
          <p style="color:#4b5563;font-size:15px;line-height:1.6;">
            Top up now and your <strong>$${ratePerHour}/hr</strong> rate continues
            for another ${validityPeriodLabel}.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="https://ozrentaplane.com/dashboard"
               style="background:#1a4fd6;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">
              Top up your hours
            </a>
          </div>
          <p style="color:#9ca3af;font-size:13px;line-height:1.6;">
            Unused hours at expiry are forfeited per our Terms and Conditions.
          </p>
          <p style="color:#4b5563;font-size:15px;margin-top:32px;">Safe flying,<br><strong>The OZ Rent A Plane Team</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
