import { NextRequest, NextResponse } from 'next/server'

/**
 * Shared authorization check for Vercel Cron and external cron HTTP requests.
 *
 * In production, Vercel Cron automatically attaches:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Also supports:
 * - Query parameter `?secret=<CRON_SECRET>` for convenient browser testing.
 * - EMAIL_OUTBOX_CRON_SECRET as a backward-compatible fallback.
 * - In local development (NODE_ENV === 'development'), requests are permitted without headers for instant browser testing.
 */
export function authorizeCronRequest(request: NextRequest): NextResponse | null {
  // In local development, permit direct browser testing
  if (process.env.NODE_ENV === 'development') {
    return null
  }

  const secret = process.env.CRON_SECRET || process.env.EMAIL_OUTBOX_CRON_SECRET

  if (!secret) {
    console.error('[cron-auth] Cron disabled: CRON_SECRET is not configured in environment')
    return NextResponse.json({ ok: false, error: 'cron_not_configured' }, { status: 503 })
  }

  const authHeader = request.headers.get('authorization') ?? ''
  const querySecret = request.nextUrl.searchParams.get('secret') ?? ''

  if (authHeader === `Bearer ${secret}` || querySecret === secret) {
    return null
  }

  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
}
