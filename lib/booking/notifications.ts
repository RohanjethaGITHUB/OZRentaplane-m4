/**
 * lib/booking/notifications.ts
 *
 * Email builders and send helpers for booking lifecycle events.
 *
 * Uses the Resend REST API via fetch — same infrastructure as lib/email.ts
 * (verification emails). Kept separate to avoid coupling booking events
 * to the verification email module.
 *
 * Required environment variables (same as lib/email.ts):
 *   RESEND_API_KEY       — Resend API key (starts with re_…)
 *   EMAIL_FROM           — Verified sender address
 *   NEXT_PUBLIC_APP_URL  — Public base URL for CTA links
 *
 * Additional optional variable:
 *   ADMIN_EMAIL          — Admin inbox for notifications sent to the ops team.
 *                          If not set, admin-facing emails are skipped with a
 *                          console.warn so the rest of the action still completes.
 *
 * Failure behaviour:
 *   Matches lib/email.ts — email failures are logged but never thrown.
 *   The booking action that triggered the notification is NOT rolled back.
 */

export type EmailSendStatus = 'sent' | 'failed' | 'skipped'

const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ozrentaplane.com'
const FROM       = process.env.EMAIL_FROM          ?? 'OZ Rent A Plane <noreply@ozrentaplane.com>'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL

// ── Layout ────────────────────────────────────────────────────────────────────

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
          <tr>
            <td style="padding:28px 40px;border-bottom:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0;font-style:italic;color:#c8dcff;font-size:18px;line-height:1;">OZ Rent A Plane</p>
              <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.3em;color:rgba(200,220,255,0.35);">Booking Update</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 28px;">
              ${bodyHtml}
            </td>
          </tr>
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

const ctaBtn = (text: string, href: string) =>
  `<a href="${href}"
     style="display:inline-block;background:#c8dcff;color:#0c121e;text-decoration:none;padding:12px 28px;border-radius:100px;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.15em;margin-top:8px;">
    ${text}
  </a>`

const refPill = (ref: string) =>
  `<span style="display:inline-block;background:rgba(200,220,255,0.06);border:1px solid rgba(200,220,255,0.12);border-radius:6px;padding:4px 12px;font-family:monospace;font-size:13px;color:#c8dcff;letter-spacing:0.05em;">${esc(ref)}</span>`

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const p = (text: string) =>
  `<p style="margin:0 0 14px;color:#8899aa;line-height:1.75;font-size:15px;">${text}</p>`

const blockquote = (text: string) =>
  `<div style="background:rgba(200,220,255,0.04);border-left:3px solid rgba(200,220,255,0.2);padding:14px 18px;border-radius:4px;margin:0 0 24px;">
    <p style="margin:0;color:#c8dcff;font-size:14px;line-height:1.7;">${esc(text)}</p>
  </div>`

// ── Email builders ─────────────────────────────────────────────────────────────

export function buildBookingSubmittedEmail(
  name: string,
  ref: string,
  aircraft: string,
  start: string,
  end: string,
): { subject: string; html: string } {
  return {
    subject: `Booking request received — ${ref}`,
    html: layout(`
      <h2 style="margin:0 0 20px;font-size:22px;color:#c8dcff;font-weight:normal;">Booking Request Received</h2>
      ${p(`Hi ${esc(name)},`)}
      ${p(`We have received your booking request ${refPill(ref)} for <strong style="color:#e2e2e6;">${esc(aircraft)}</strong>.`)}
      ${p(`<strong style="color:#e2e2e6;">Requested window:</strong> ${esc(start)} &ndash; ${esc(end)} (Sydney time)`)}
      ${p(`Your requested time slot is currently <strong style="color:#e2e2e6;">being held</strong> while our operations team reviews your request. You will receive a confirmation or any follow-up questions within 24 hours.`)}
      ${ctaBtn('View Booking', `${APP_URL}/dashboard/bookings`)}
    `),
  }
}

export function buildBookingConfirmedEmail(
  name: string,
  ref: string,
  aircraft: string,
  start: string,
  end: string,
): { subject: string; html: string } {
  return {
    subject: `Booking confirmed — ${ref}`,
    html: layout(`
      <h2 style="margin:0 0 20px;font-size:22px;color:#4ade80;font-weight:normal;">Booking Confirmed</h2>
      ${p(`Hi ${esc(name)},`)}
      ${p(`Your booking ${refPill(ref)} for <strong style="color:#e2e2e6;">${esc(aircraft)}</strong> has been <strong style="color:#e2e2e6;">confirmed</strong> by our operations team.`)}
      ${p(`<strong style="color:#e2e2e6;">Confirmed window:</strong> ${esc(start)} &ndash; ${esc(end)} (Sydney time)`)}
      ${p(`Please arrive at the aircraft at least 30 minutes before your scheduled departure for pre-flight checks.`)}
      ${ctaBtn('View Booking', `${APP_URL}/dashboard/bookings`)}
    `),
  }
}

export function buildBookingCancelledEmail(
  name: string,
  ref: string,
  reason: string,
): { subject: string; html: string } {
  return {
    subject: `Booking cancelled — ${ref}`,
    html: layout(`
      <h2 style="margin:0 0 20px;font-size:22px;color:#f87171;font-weight:normal;">Booking Cancelled</h2>
      ${p(`Hi ${esc(name)},`)}
      ${p(`Your booking ${refPill(ref)} has been cancelled by the operations team.`)}
      ${reason ? `<p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:rgba(255,255,255,0.25);">Reason provided</p>${blockquote(reason)}` : ''}
      ${p(`If you believe this was made in error or would like to make a new booking request, please log in to your dashboard.`)}
      ${ctaBtn('Request New Booking', `${APP_URL}/dashboard/bookings/new`)}
    `),
  }
}

export function buildClarificationRequestEmail(
  name: string,
  ref: string,
  question: string,
): { subject: string; html: string } {
  return {
    subject: `Action required — clarification needed for ${ref}`,
    html: layout(`
      <h2 style="margin:0 0 20px;font-size:22px;color:#fb923c;font-weight:normal;">Clarification Required</h2>
      ${p(`Hi ${esc(name)},`)}
      ${p(`Our operations team has a question about your booking request ${refPill(ref)} before they can proceed.`)}
      ${p(`<strong style="color:#e2e2e6;">Your time slot remains held</strong> while this is resolved. Please respond as soon as possible so we can continue processing your request.`)}
      <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:rgba(255,255,255,0.25);">Question from operations</p>
      ${blockquote(question)}
      ${ctaBtn('Respond to Query', `${APP_URL}/dashboard/bookings`)}
    `),
  }
}

export function buildClarificationResponseEmail(
  ref: string,
  customerName: string,
  response: string,
): { subject: string; html: string } {
  return {
    subject: `Customer responded to clarification — ${ref}`,
    html: layout(`
      <h2 style="margin:0 0 20px;font-size:22px;color:#c8dcff;font-weight:normal;">Clarification Response Received</h2>
      ${p(`A customer has responded to the clarification request for booking ${refPill(ref)}.`)}
      ${p(`<strong style="color:#e2e2e6;">Customer:</strong> ${esc(customerName)}`)}
      ${p(`The booking has been returned to the pending queue for your review.`)}
      <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:rgba(255,255,255,0.25);">Customer response</p>
      ${blockquote(response)}
      ${ctaBtn('Review Booking', `${APP_URL}/admin/bookings/requests`)}
    `),
  }
}

export function buildPostFlightClarificationEmail(
  name: string,
  ref: string,
  category: string,
  message: string,
): { subject: string; html: string } {
  return {
    subject: `Action required — post-flight record clarification for ${ref}`,
    html: layout(`
      <h2 style="margin:0 0 20px;font-size:22px;color:#fb923c;font-weight:normal;">Post-Flight Record — Clarification Needed</h2>
      ${p(`Hi ${esc(name)},`)}
      ${p(`Our operations team needs some additional information before they can approve your post-flight record for booking ${refPill(ref)}.`)}
      <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:rgba(255,255,255,0.25);">Category</p>
      <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:13px;color:#fb923c;font-weight:600;">${esc(category)}</p>
      <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:rgba(255,255,255,0.25);">Message from operations</p>
      ${blockquote(message)}
      ${p(`Please log in to update your flight record and formally resubmit for review. Sending a message alone will <strong style="color:#e2e2e6;">not</strong> count as a resubmission.`)}
      ${ctaBtn('Update Flight Record', `${APP_URL}/dashboard/bookings`)}
    `),
  }
}

export function buildFlightRecordResubmittedEmail(
  ref: string,
  customerName: string,
  aircraftReg: string,
): { subject: string; html: string } {
  return {
    subject: `Flight record resubmitted — ${ref}`,
    html: layout(`
      <h2 style="margin:0 0 20px;font-size:22px;color:#c8dcff;font-weight:normal;">Flight Record Resubmitted</h2>
      ${p(`A customer has formally resubmitted their post-flight record for review.`)}
      ${p(`<strong style="color:#e2e2e6;">Booking:</strong> ${refPill(ref)}`)}
      ${p(`<strong style="color:#e2e2e6;">Customer:</strong> ${esc(customerName)}`)}
      ${p(`<strong style="color:#e2e2e6;">Aircraft:</strong> ${esc(aircraftReg)}`)}
      ${p(`The flight record is now back in the review queue with status <strong style="color:#e2e2e6;">Resubmitted</strong>.`)}
      ${ctaBtn('Review Now', `${APP_URL}/admin/bookings/post-flight-reviews`)}
    `),
  }
}

// ── Send ──────────────────────────────────────────────────────────────────────

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<EmailSendStatus> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[booking/notifications] RESEND_API_KEY not set — email skipped.')
    return 'skipped'
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    })

    if (!res.ok) {
      console.error('[booking/notifications] Resend error:', res.status, await res.text())
      return 'failed'
    }

    return 'sent'
  } catch (err) {
    console.error('[booking/notifications] Network error:', err)
    return 'failed'
  }
}

// ── Public notification helpers ────────────────────────────────────────────────
// Each helper is fire-and-forget: failures are logged, never thrown.

export async function notifyBookingSubmitted(opts: {
  customerEmail: string
  customerName:  string
  ref:           string
  aircraft:      string
  start:         string
  end:           string
}) {
  const { subject, html } = buildBookingSubmittedEmail(opts.customerName, opts.ref, opts.aircraft, opts.start, opts.end)
  await sendEmail(opts.customerEmail, subject, html)
}

export async function notifyBookingConfirmed(opts: {
  customerEmail: string
  customerName:  string
  ref:           string
  aircraft:      string
  start:         string
  end:           string
}) {
  const { subject, html } = buildBookingConfirmedEmail(opts.customerName, opts.ref, opts.aircraft, opts.start, opts.end)
  await sendEmail(opts.customerEmail, subject, html)
}

export async function notifyBookingCancelled(opts: {
  customerEmail: string
  customerName:  string
  ref:           string
  reason:        string
}) {
  const { subject, html } = buildBookingCancelledEmail(opts.customerName, opts.ref, opts.reason)
  await sendEmail(opts.customerEmail, subject, html)
}

export async function notifyClarificationRequested(opts: {
  customerEmail: string
  customerName:  string
  ref:           string
  question:      string
}) {
  const { subject, html } = buildClarificationRequestEmail(opts.customerName, opts.ref, opts.question)
  await sendEmail(opts.customerEmail, subject, html)
}

export async function notifyClarificationResponseReceived(opts: {
  ref:          string
  customerName: string
  response:     string
}) {
  if (!ADMIN_EMAIL) {
    console.warn('[booking/notifications] ADMIN_EMAIL not set — admin notification skipped.')
    return
  }
  const { subject, html } = buildClarificationResponseEmail(opts.ref, opts.customerName, opts.response)
  await sendEmail(ADMIN_EMAIL, subject, html)
}

export async function notifyPostFlightClarificationRequested(opts: {
  customerEmail: string
  customerName:  string
  ref:           string
  category:      string
  message:       string
}) {
  const { subject, html } = buildPostFlightClarificationEmail(
    opts.customerName, opts.ref, opts.category, opts.message,
  )
  await sendEmail(opts.customerEmail, subject, html)
}

export async function notifyFlightRecordResubmitted(opts: {
  ref:          string
  customerName: string
  aircraftReg:  string
}) {
  if (!ADMIN_EMAIL) {
    console.warn('[booking/notifications] ADMIN_EMAIL not set — admin notification skipped.')
    return
  }
  const { subject, html } = buildFlightRecordResubmittedEmail(opts.ref, opts.customerName, opts.aircraftReg)
  await sendEmail(ADMIN_EMAIL, subject, html)
}
