import 'server-only'

/**
 * Checks if the current environment is local / development.
 *
 * In local development:
 * - Direct email sending (sendEmail, sendVerificationEmail) is suppressed.
 * - Outbox job queueing (enqueueEmailJobs) is suppressed so remote crons
 *   will not process and send emails later to admin or user.
 *
 * Override:
 * Set `ENABLE_EMAILS_IN_DEV=true` (or `ENABLE_EMAIL_IN_DEV=true`) in `.env.local`
 * to bypass this suppression when explicitly testing email delivery locally.
 */
export function isLocalOrDevEnvironment(): boolean {
  const allowDevEmails =
    process.env.ENABLE_EMAILS_IN_DEV?.toLowerCase() === 'true' ||
    process.env.ENABLE_EMAIL_IN_DEV?.toLowerCase() === 'true'

  if (allowDevEmails) {
    return false
  }

  if (process.env.NODE_ENV === 'development') {
    return true
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ''
  ).toLowerCase()

  if (appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
    return true
  }

  return false
}
