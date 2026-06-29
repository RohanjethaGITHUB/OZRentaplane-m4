function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildShell(params: {
  headline: string
  intro: string
  bodyHtml: string
  ctaLabel: string
  ctaUrl: string
  footerNote: string
}): string {
  const { headline, intro, bodyHtml, ctaLabel, ctaUrl, footerNote } = params

  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#152d5a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #dbe8fb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#152d5a;color:#ffffff;padding:20px 24px;">
                <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#f59e0b;font-weight:700;">OZ Rent A Plane</div>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;font-family:Georgia,serif;font-weight:400;">${escapeHtml(headline)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(intro)}</p>
                ${bodyHtml}
                <div style="text-align:center;margin:32px 0 24px;">
                  <a href="${escapeHtml(ctaUrl)}" style="background:#1a4fd6;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">${escapeHtml(ctaLabel)}</a>
                </div>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">${escapeHtml(footerNote)}</p>
                <p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#334155;">Safe flying,<br><strong>The OZ Rent A Plane Team</strong></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function blockTimeExpiryReminderEmail(
  pilotFirstName: string,
  packageName: string,
  hoursRemaining: number,
  expiryDate: string,
  daysUntilExpiry: number,
  ratePerHour: number,
  validityPeriodLabel: string,
) {
  const subject = `Your Block Time package expires in ${daysUntilExpiry} days -- ${hoursRemaining}h remaining`
  const html = buildShell({
    headline: 'Package Expiry Reminder',
    intro: `Hi ${pilotFirstName},`,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">Just a heads up -- your Block Time package expires in <strong>${daysUntilExpiry} days</strong> on <strong>${escapeHtml(expiryDate)}</strong>.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;padding:14px 16px;background:#f0f6ff;border:1px solid #dbe8fb;border-radius:8px;">
        <tr><td style="padding:4px 0;font-size:14px;line-height:1.5;color:#475569;"><strong style="color:#152d5a;">Package:</strong> ${escapeHtml(packageName)}</td></tr>
        <tr><td style="padding:4px 0;font-size:14px;line-height:1.5;color:#475569;"><strong style="color:#152d5a;">Hours remaining:</strong> ${hoursRemaining}h</td></tr>
        <tr><td style="padding:4px 0;font-size:14px;line-height:1.5;color:#475569;"><strong style="color:#152d5a;">Expires:</strong> ${escapeHtml(expiryDate)}</td></tr>
      </table>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#334155;">Any unused hours will expire on this date.</p>
      <p style="margin:0 0 10px;font-size:16px;line-height:1.5;color:#152d5a;font-weight:700;">Want to keep flying at your locked rate?</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">Top up now and your ${formatMoney(ratePerHour)}/hr rate continues for another ${escapeHtml(validityPeriodLabel)}.</p>
    `,
    ctaLabel: 'Top up your hours',
    ctaUrl: 'https://ozrentaplane.com/dashboard',
    footerNote: 'Unused hours at expiry are forfeited per our Terms and Conditions.',
  })

  return { subject, html }
}

export function blockTimeWinBackEmail(
  pilotFirstName: string,
  oldPackageName: string,
  oldRatePerHour: number,
  expiryDate: string,
  vdoHours: number,
  flightTotal: number,
  costAtOldRate: number,
  winBackSaving: number,
) {
  const subject = 'You flew today -- here is what your old rate would have saved you'
  const html = buildShell({
    headline: 'Block Time Win Back',
    intro: `Hi ${pilotFirstName},`,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">Great to see you flying again.</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">Your Block Time package expired on <strong>${escapeHtml(expiryDate)}</strong>, so today's flight was charged at the standard Pay As You Fly rate of <strong>$330/hr</strong>.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;padding:14px 16px;background:#f0f6ff;border:1px solid #dbe8fb;border-radius:8px;">
        <tr><td style="padding:4px 0;font-size:14px;line-height:1.5;color:#475569;"><strong style="color:#152d5a;">Hours flown:</strong> ${vdoHours}h</td></tr>
        <tr><td style="padding:4px 0;font-size:14px;line-height:1.5;color:#475569;"><strong style="color:#152d5a;">Charged at:</strong> $330/hr</td></tr>
        <tr><td style="padding:4px 0;font-size:14px;line-height:1.5;color:#475569;"><strong style="color:#152d5a;">Amount charged:</strong> ${formatMoney(flightTotal)}</td></tr>
      </table>
      <p style="margin:0 0 10px;font-size:16px;line-height:1.5;color:#152d5a;font-weight:700;">Savings section</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
        <tr><td style="padding:4px 0;font-size:14px;line-height:1.5;color:#475569;"><strong style="color:#152d5a;">Your old rate:</strong> ${formatMoney(oldRatePerHour)}/hr</td></tr>
        <tr><td style="padding:4px 0;font-size:14px;line-height:1.5;color:#475569;"><strong style="color:#152d5a;">Cost at old rate:</strong> ${formatMoney(costAtOldRate)}</td></tr>
        <tr><td style="padding:4px 0;font-size:14px;line-height:1.5;color:#475569;"><strong style="color:#152d5a;">You could have saved:</strong> ${formatMoney(winBackSaving)}</td></tr>
      </table>
      <p style="margin:0 0 4px;font-size:13px;line-height:1.5;color:#64748b;"><strong style="color:#152d5a;">Package:</strong> ${escapeHtml(oldPackageName)}</p>
    `,
    ctaLabel: 'View Block Time packages',
    ctaUrl: 'https://ozrentaplane.com/block-time',
    footerNote: 'We can help you get back on a better rate whenever you are ready.',
  })

  return { subject, html }
}
