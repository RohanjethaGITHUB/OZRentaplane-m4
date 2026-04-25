/**
 * Email utility for OZRentAPlane verification notifications.
 *
 * Uses the Resend REST API via fetch — no additional npm packages needed.
 *
 * Required environment variables:
 *   RESEND_API_KEY   — Resend API key (starts with re_…). Sign up at resend.com.
 *   EMAIL_FROM       — Verified sender address, e.g.:
 *                      "OZ Rent A Plane <noreply@ozrentaplane.com>"
 *   NEXT_PUBLIC_APP_URL — Public base URL, used in CTA links in emails.
 *
 * Failure behaviour:
 *   - If RESEND_API_KEY is not set, sending is skipped and 'skipped' is returned.
 *   - If the API call fails, 'failed' is returned.
 *   - In both cases the status change and dashboard events are NOT rolled back.
 */

export type EmailSendStatus = 'sent' | 'failed' | 'skipped'

type SendResult = { status: EmailSendStatus }

// ─── Private helpers ──────────────────────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ozrentaplane.com'
const FROM    = process.env.EMAIL_FROM ?? 'OZ Rent A Plane <noreply@ozrentaplane.com>'

function layout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>OZ Rent A Plane</title>
</head>
<body style="margin:0;padding:0;background:#050B14;font-family:Georgia,serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="background:#0c121e;border:1px solid rgba(200,220,255,0.08);border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 40px;border-bottom:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0;font-style:italic;color:#c8dcff;font-size:18px;line-height:1;">OZ Rent A Plane</p>
              <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.3em;color:rgba(200,220,255,0.35);">Verification Update</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:0.2em;">
                OZRentAPlane Operational Portal &middot; Sydney, Australia
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

const cta = (text: string) =>
  `<a href="${APP_URL}/dashboard"
     style="display:inline-block;background:#c8dcff;color:#0c121e;text-decoration:none;padding:12px 28px;border-radius:100px;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.15em;margin-top:8px;">
    ${text}
  </a>`

// ─── Email builders ───────────────────────────────────────────────────────────

export function buildApprovedEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Your OZ Rent A Plane verification has been approved',
    html: layout(`
      <h2 style="margin:0 0 20px;font-size:22px;color:#4ade80;font-weight:normal;">Verification Approved</h2>
      <p style="margin:0 0 14px;color:#8899aa;line-height:1.75;font-size:15px;">Hi ${escHtml(name)},</p>
      <p style="margin:0 0 14px;color:#8899aa;line-height:1.75;font-size:15px;">
        Your pilot credentials have been reviewed and <strong style="color:#e2e2e6;">approved</strong>.
        Your OZ Rent A Plane account is now fully verified and you are cleared to book aircraft from the Sydney fleet.
      </p>
      <p style="margin:0 0 28px;color:#8899aa;line-height:1.75;font-size:15px;">
        Log in to your dashboard to browse available aircraft and submit booking requests.
      </p>
      ${cta('Go to Dashboard')}
    `),
  }
}

export function buildRejectedEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Update on your OZ Rent A Plane verification',
    html: layout(`
      <h2 style="margin:0 0 20px;font-size:22px;color:#f87171;font-weight:normal;">Verification Update</h2>
      <p style="margin:0 0 14px;color:#8899aa;line-height:1.75;font-size:15px;">Hi ${escHtml(name)},</p>
      <p style="margin:0 0 14px;color:#8899aa;line-height:1.75;font-size:15px;">
        We have completed our review of your verification documents. Unfortunately, we were
        <strong style="color:#e2e2e6;">unable to approve</strong> your application at this time.
      </p>
      <p style="margin:0 0 28px;color:#8899aa;line-height:1.75;font-size:15px;">
        If you have questions or would like to submit updated documentation, please contact our
        support team or log in to your dashboard.
      </p>
      ${cta('Go to Dashboard')}
    `),
  }
}

export function buildOnHoldEmail(name: string, message: string): { subject: string; html: string } {
  return {
    subject: 'Action required — your OZ Rent A Plane verification is on hold',
    html: layout(`
      <h2 style="margin:0 0 20px;font-size:22px;color:#fbbf24;font-weight:normal;">Action Required</h2>
      <p style="margin:0 0 14px;color:#8899aa;line-height:1.75;font-size:15px;">Hi ${escHtml(name)},</p>
      <p style="margin:0 0 20px;color:#8899aa;line-height:1.75;font-size:15px;">
        Your verification is currently <strong style="color:#e2e2e6;">on hold</strong>.
        Our team has a request before we can proceed:
      </p>
      <div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.18);padding:20px 24px;border-radius:12px;margin-bottom:28px;">
        <p style="margin:0;color:#e2e2e6;font-size:15px;line-height:1.75;">${escHtml(message)}</p>
      </div>
      <p style="margin:0 0 28px;color:#8899aa;line-height:1.75;font-size:15px;">
        Please log in to your dashboard, upload any required documents, and resubmit for review.
      </p>
      ${cta('Upload & Resubmit')}
    `),
  }
}

export function buildSubmittedEmail(name: string, isResubmit: boolean): { subject: string; html: string } {
  return {
    subject: isResubmit
      ? 'Your updated documents have been received — OZ Rent A Plane'
      : 'Your verification documents have been received — OZ Rent A Plane',
    html: layout(`
      <h2 style="margin:0 0 20px;font-size:22px;color:#c8dcff;font-weight:normal;">Documents Received</h2>
      <p style="margin:0 0 14px;color:#8899aa;line-height:1.75;font-size:15px;">Hi ${escHtml(name)},</p>
      <p style="margin:0 0 14px;color:#8899aa;line-height:1.75;font-size:15px;">
        We have received your ${isResubmit ? 'updated ' : ''}verification documents.
        Your application is now <strong style="color:#e2e2e6;">pending review</strong>.
      </p>
      <p style="margin:0 0 28px;color:#8899aa;line-height:1.75;font-size:15px;">
        Our safety officers will validate your credentials and notify you of the outcome.
        This typically takes 1–3 business days.
      </p>
      ${cta('View Application Status')}
    `),
  }
}

// ─── Core send function ───────────────────────────────────────────────────────

export async function sendVerificationEmail(
  to: string,
  subject: string,
  html: string,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not configured — email skipped.')
    return { status: 'skipped' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[email] Resend API error:', res.status, text)
      return { status: 'failed' }
    }

    return { status: 'sent' }
  } catch (err) {
    console.error('[email] Network error:', err)
    return { status: 'failed' }
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
