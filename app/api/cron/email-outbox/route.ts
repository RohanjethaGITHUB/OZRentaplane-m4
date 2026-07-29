import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send-email'
import {
  type EmailOutboxJob,
  nextEmailRetryAt,
  renderOutboxEmail,
  sanitizeErrorMessage,
} from '@/lib/email/outbox'
import { createPerfLogger } from '@/lib/perf/timing'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DEFAULT_BATCH_SIZE = 10

export async function GET(request: NextRequest) {
  const unauthorized = authorizeCronRequest(request)
  if (unauthorized) return unauthorized

  return processBatch(request)
}

export async function POST(request: NextRequest) {
  const unauthorized = authorizeCronRequest(request)
  if (unauthorized) return unauthorized

  return processBatch(request)
}

function authorizeCronRequest(request: NextRequest) {
  const secret = process.env.EMAIL_OUTBOX_CRON_SECRET || process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV !== 'development') {
    console.error('[email-outbox] processor disabled: missing cron secret')
    return NextResponse.json({ ok: false, error: 'processor_not_configured' }, { status: 503 })
  }
  if (!secret && process.env.NODE_ENV === 'development') return null

  const auth = request.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  return null
}

async function processBatch(request: NextRequest) {
  const perf = createPerfLogger({ route: 'api:email-outbox', role: 'unknown' })
  const markBatchTotal = perf.start('email_outbox', 'email_outbox_batch_total')
  const admin = createAdminClient()
  const workerId = `email-outbox:${process.pid}:${Date.now()}`
  const limit = getBatchLimit(request)

  const { data, error } = await perf.time(
    'email_outbox',
    'email_outbox_claim',
    () => admin.rpc('claim_email_outbox_jobs', {
      p_limit: limit,
      p_worker_id: workerId,
    }),
    (result) => ({ rowCount: result.data?.length ?? 0 }),
  )

  if (error) {
    markBatchTotal({ rowCount: 0 })
    console.error('[email-outbox] claim failed', {
      code: error.code,
      message: sanitizeErrorMessage(error.message),
    })
    return NextResponse.json({ ok: false, error: 'claim_failed' }, { status: 500 })
  }

  const jobs = (data ?? []) as EmailOutboxJob[]
  let sent = 0
  let failed = 0

  for (const job of jobs) {
    const result = await processJob(admin, perf, job)
    if (result === 'sent') sent += 1
    else failed += 1
  }

  markBatchTotal({ rowCount: jobs.length })
  console.info('[email-outbox] batch complete', {
    claimed: jobs.length,
    sent,
    failed,
  })

  return NextResponse.json({ ok: true, claimed: jobs.length, sent, failed })
}

async function processJob(
  admin: ReturnType<typeof createAdminClient>,
  perf: ReturnType<typeof createPerfLogger>,
  job: EmailOutboxJob,
) {
  const markJobTotal = perf.start('email_outbox', 'email_outbox_job_total')
  try {
    const email = perf.timeSync('email_outbox', 'email_outbox_template_preparation', () => renderOutboxEmail(job))
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY_MISSING')
    if (!process.env.EMAIL_FROM) throw new Error('EMAIL_FROM_MISSING')
    const delivery = await perf.time('email_outbox', 'email_outbox_provider_delivery', () => sendEmail(email))

    if (delivery.status === 'sent' || delivery.status === 'skipped') {
      await perf.time('email_outbox', 'email_outbox_status_update', () => admin
        .from('email_outbox')
        .update({
          status: 'sent',
          locked_at: null,
          locked_by: null,
          provider_message_id: delivery.resendEmailId ?? null,
          sent_at: new Date().toISOString(),
          last_error: delivery.status === 'skipped' ? 'PROVIDER_SKIPPED_OR_DUPLICATE' : null,
        })
        .eq('id', job.id)
        .eq('status', 'processing'))
      markJobTotal({ rowCount: 1 })
      console.info('[email-outbox] job complete', {
        eventType: job.event_type,
        status: delivery.status,
      })
      return 'sent' as const
    }

    await markJobFailed(admin, perf, job, 'PROVIDER_DELIVERY_FAILED')
    markJobTotal({ rowCount: 1 })
    return 'failed' as const
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_EMAIL_OUTBOX_ERROR'
    await markJobFailed(admin, perf, job, message)
    markJobTotal({ rowCount: 1 })
    return 'failed' as const
  }
}

async function markJobFailed(
  admin: ReturnType<typeof createAdminClient>,
  perf: ReturnType<typeof createPerfLogger>,
  job: EmailOutboxJob,
  errorMessage: string,
) {
  const finalFailure = job.attempts >= job.max_attempts
  const status = finalFailure ? 'failed' : 'pending'
  await perf.time('email_outbox', 'email_outbox_status_update', () => admin
    .from('email_outbox')
    .update({
      status,
      locked_at: null,
      locked_by: null,
      last_error: sanitizeErrorMessage(errorMessage),
      available_at: finalFailure ? new Date().toISOString() : nextEmailRetryAt(job.attempts),
    })
    .eq('id', job.id)
    .eq('status', 'processing'))

  console.warn('[email-outbox] job failed', {
    eventType: job.event_type,
    status,
    finalFailure,
    errorCode: sanitizeErrorMessage(errorMessage).split(':')[0] ?? 'unknown',
  })
}

function getBatchLimit(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('limit')
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_BATCH_SIZE
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH_SIZE
  return Math.min(50, Math.max(1, parsed))
}
