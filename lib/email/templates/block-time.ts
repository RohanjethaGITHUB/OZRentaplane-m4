import { renderBaseTemplate, escapeHtml } from '@/lib/email/templates/base-template'
import { getAppUrl } from '@/lib/email/app-url'

const appUrl = getAppUrl()

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

export function blockTimePurchaseConfirmedEmail(params: {
  pilotFirstName: string
  packageName: string
  packageHours: number
  currentBalance: number
  ratePerHour: number
  expiryDate: string
  validityDays: number
  amountPaid: number
  invoiceNumber?: string | null
  pdfUrl?: string | null
}) {
  const {
    pilotFirstName,
    packageName,
    packageHours,
    currentBalance,
    ratePerHour,
    expiryDate,
    validityDays,
    amountPaid,
    invoiceNumber,
    pdfUrl,
  } = params

  const subject = `Block Time Purchase Confirmed — ${packageName} (${packageHours}h) — OZ Rent A Plane`
  const details = [
    { label: 'Package', value: packageName },
    { label: 'Hours Credited', value: `${packageHours} hours` },
    { label: 'Current Balance', value: `${currentBalance} hours` },
    { label: 'Locked Rate', value: `$${ratePerHour}/hr` },
    { label: 'Valid Until', value: `${expiryDate} (${validityDays} days)` },
    { label: 'Amount Paid', value: `$${amountPaid.toFixed(2)} AUD` },
  ]
  if (invoiceNumber) {
    details.push({ label: 'Invoice Number', value: invoiceNumber })
  }

  let extraHtml = `
    <div style="margin: 20px 0; padding: 16px; background: #f0f7ff; border-left: 4px solid #0284c7; border-radius: 4px;">
      <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 14px; font-weight: 600;">How to use your hours</h4>
      <p style="margin: 0; color: #475569; font-size: 13px; line-height: 1.6;">
        Your block-time hours are ready to use immediately for any standard hire booking on our fleet. Flight hours will automatically be deducted from your package balance upon flight completion.
      </p>
    </div>
  `

  if (pdfUrl) {
    extraHtml += `
      <div style="margin-bottom: 20px;">
        <a href="${pdfUrl}" target="_blank" style="color: #0284c7; font-size: 14px; text-decoration: underline; font-weight: 600;">
          Download Tax Invoice (PDF)
        </a>
      </div>
    `
  }

  return {
    subject,
    html: renderBaseTemplate({
      headline: 'Block Time Purchase Confirmed',
      message: `Hi ${pilotFirstName}, thank you for your purchase! Your ${packageName} package has been successfully activated and credited to your account.`,
      details,
      extraHtml,
      ctaLabel: 'Book a Flight',
      ctaUrl: `${appUrl}/dashboard/bookings/new`,
    }),
  }
}

export function adminBlockTimePurchaseConfirmedEmail(params: {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  packageName: string
  packageHours: number
  ratePerHour: number
  expiryDate: string
  validityDays: number
  amountPaid: number
  invoiceNumber?: string | null
  pdfUrl?: string | null
  userId: string
}) {
  const {
    customerName,
    customerEmail,
    customerPhone,
    pilotArn,
    packageName,
    packageHours,
    ratePerHour,
    expiryDate,
    validityDays,
    amountPaid,
    invoiceNumber,
    pdfUrl,
    userId,
  } = params

  const subject = `New Block Time Purchase: ${customerName} — ${packageName} (${packageHours}h) — $${amountPaid.toFixed(2)} AUD`
  const details = [
    { label: 'Customer', value: customerName },
    { label: 'Email', value: customerEmail },
    ...(customerPhone ? [{ label: 'Phone', value: customerPhone }] : []),
    ...(pilotArn ? [{ label: 'Pilot ARN', value: pilotArn }] : []),
    { label: 'Package Purchased', value: packageName },
    { label: 'Hours Credited', value: `${packageHours} hours` },
    { label: 'Locked Rate', value: `$${ratePerHour}/hr` },
    { label: 'Amount Paid', value: `$${amountPaid.toFixed(2)} AUD` },
    { label: 'Valid Until', value: `${expiryDate} (${validityDays} days)` },
    ...(invoiceNumber ? [{ label: 'Invoice Number', value: invoiceNumber }] : []),
    { label: 'Status', value: 'Active & Paid' },
  ]

  let extraHtml = ''
  if (pdfUrl) {
    extraHtml += `
      <div style="margin: 20px 0;">
        <a href="${pdfUrl}" target="_blank" style="color: #0284c7; font-size: 14px; text-decoration: underline; font-weight: 600;">
          Download Tax Invoice (PDF)
        </a>
      </div>
    `
  }

  return {
    subject,
    html: renderBaseTemplate({
      headline: 'New Block Time Package Purchased',
      message: `${customerName} has purchased a ${packageName} (${packageHours} hours) package for $${amountPaid.toFixed(2)} AUD. Hours have been credited to their account.`,
      details,
      extraHtml: extraHtml || undefined,
      ctaLabel: 'View User in Admin',
      ctaUrl: `${appUrl}/admin/users/${userId}`,
    }),
  }
}

export function blockTimeTopupConfirmedEmail(params: {
  pilotFirstName: string
  packageName: string
  hoursAdded: number
  newBalance: number
  ratePerHour: number
  newExpiresAt: string
  extensionDays?: number
  amountPaid: number
  invoiceNumber?: string | null
  pdfUrl?: string | null
}) {
  const {
    pilotFirstName,
    packageName,
    hoursAdded,
    newBalance,
    ratePerHour,
    newExpiresAt,
    extensionDays,
    amountPaid,
    invoiceNumber,
    pdfUrl,
  } = params

  const subject = `Block Time Top-up Confirmed — +${hoursAdded}h (${packageName}) — OZ Rent A Plane`
  const details = [
    { label: 'Package', value: `${packageName} (Top-up)` },
    { label: 'Hours Added', value: `+${hoursAdded} hours` },
    { label: 'New Total Balance', value: `${newBalance} hours` },
    { label: 'Locked Rate', value: `$${ratePerHour}/hr` },
    {
      label: 'New Expiry Date',
      value: extensionDays ? `${newExpiresAt} (+${extensionDays} days extended)` : newExpiresAt,
    },
    { label: 'Amount Paid', value: `$${amountPaid.toFixed(2)} AUD` },
  ]
  if (invoiceNumber) {
    details.push({ label: 'Invoice Number', value: invoiceNumber })
  }

  let extraHtml = `
    <div style="margin: 20px 0; padding: 16px; background: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 4px;">
      <h4 style="margin: 0 0 8px 0; color: #14532d; font-size: 14px; font-weight: 600;">Top-up Applied</h4>
      <p style="margin: 0; color: #166534; font-size: 13px; line-height: 1.6;">
        Your additional ${hoursAdded} hours are now active and ready to use. Your package expiry date has been automatically extended.
      </p>
    </div>
  `

  if (pdfUrl) {
    extraHtml += `
      <div style="margin-bottom: 20px;">
        <a href="${pdfUrl}" target="_blank" style="color: #0284c7; font-size: 14px; text-decoration: underline; font-weight: 600;">
          Download Tax Invoice (PDF)
        </a>
      </div>
    `
  }

  return {
    subject,
    html: renderBaseTemplate({
      headline: 'Block Time Top-up Confirmed',
      message: `Hi ${pilotFirstName}, your top-up of ${hoursAdded} hours on your ${packageName} package has been successfully processed and credited to your balance.`,
      details,
      extraHtml,
      ctaLabel: 'View Block Time Balance',
      ctaUrl: `${appUrl}/dashboard/purchases`,
    }),
  }
}

export function adminBlockTimeTopupConfirmedEmail(params: {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  packageName: string
  hoursAdded: number
  newBalance: number
  ratePerHour: number
  newExpiresAt: string
  extensionDays?: number
  amountPaid: number
  invoiceNumber?: string | null
  pdfUrl?: string | null
  userId: string
}) {
  const {
    customerName,
    customerEmail,
    customerPhone,
    pilotArn,
    packageName,
    hoursAdded,
    newBalance,
    ratePerHour,
    newExpiresAt,
    extensionDays,
    amountPaid,
    invoiceNumber,
    pdfUrl,
    userId,
  } = params

  const subject = `Block Time Top-up: ${customerName} — +${hoursAdded}h (${packageName}) — $${amountPaid.toFixed(2)} AUD`
  const details = [
    { label: 'Customer', value: customerName },
    { label: 'Email', value: customerEmail },
    ...(customerPhone ? [{ label: 'Phone', value: customerPhone }] : []),
    ...(pilotArn ? [{ label: 'Pilot ARN', value: pilotArn }] : []),
    { label: 'Package', value: `${packageName} (Top-up)` },
    { label: 'Hours Added', value: `+${hoursAdded} hours` },
    { label: 'New Total Balance', value: `${newBalance} hours` },
    { label: 'Locked Rate', value: `$${ratePerHour}/hr` },
    { label: 'Amount Paid', value: `$${amountPaid.toFixed(2)} AUD` },
    {
      label: 'New Expiry Date',
      value: extensionDays ? `${newExpiresAt} (+${extensionDays} days)` : newExpiresAt,
    },
    ...(invoiceNumber ? [{ label: 'Invoice Number', value: invoiceNumber }] : []),
    { label: 'Status', value: 'Active & Paid' },
  ]

  let extraHtml = ''
  if (pdfUrl) {
    extraHtml += `
      <div style="margin: 20px 0;">
        <a href="${pdfUrl}" target="_blank" style="color: #0284c7; font-size: 14px; text-decoration: underline; font-weight: 600;">
          Download Tax Invoice (PDF)
        </a>
      </div>
    `
  }

  return {
    subject,
    html: renderBaseTemplate({
      headline: 'Block Time Top-up Purchased',
      message: `${customerName} has topped up ${hoursAdded} hours on their ${packageName} package for $${amountPaid.toFixed(2)} AUD.`,
      details,
      extraHtml: extraHtml || undefined,
      ctaLabel: 'View User in Admin',
      ctaUrl: `${appUrl}/admin/users/${userId}`,
    }),
  }
}

export function blockTimeLowBalanceEmail(params: {
  pilotFirstName: string
  packageName: string
  hoursRemaining: number
  ratePerHour: number
  expiryDate: string
}) {
  const { pilotFirstName, packageName, hoursRemaining, ratePerHour, expiryDate } = params
  const subject = `Low Block Time Balance: ${hoursRemaining}h remaining — OZ Rent A Plane`

  return {
    subject,
    html: renderBaseTemplate({
      headline: 'Block Time Balance Running Low',
      message: `Hi ${pilotFirstName}, your block-time balance is running low. You currently have ${hoursRemaining} hours remaining on your ${packageName} package.`,
      details: [
        { label: 'Package', value: packageName },
        { label: 'Remaining Balance', value: `${hoursRemaining} hours` },
        { label: 'Locked Rate', value: `$${ratePerHour}/hr` },
        { label: 'Expires On', value: expiryDate },
      ],
      extraHtml: `
        <div style="margin: 20px 0; padding: 16px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px;">
          <h4 style="margin: 0 0 8px 0; color: #92400e; font-size: 14px; font-weight: 600;">Keep Your Locked Rate</h4>
          <p style="margin: 0; color: #78350f; font-size: 13px; line-height: 1.6;">
            Top up your hours before your next flight to keep flying at your discounted locked rate of $${ratePerHour}/hr without switching to the standard Pay As You Fly rate ($330/hr).
          </p>
        </div>
      `,
      ctaLabel: 'Top Up Block Time',
      ctaUrl: `${appUrl}/dashboard?block_time_package=active`,
    }),
  }
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
