import type { JobDefinition, JobContext } from '../types'
import { sendEmail } from '@/lib/email/send-email'
import {
  type EmailOutboxJob,
  nextEmailRetryAt,
  renderOutboxEmail,
  sanitizeErrorMessage,
} from '@/lib/email/outbox'

const DEFAULT_BATCH_SIZE = 10

export const emailOutboxJob: JobDefinition = {
  id: 'email-outbox',
  description: 'Claims and drains batches of queued emails from postgres email_outbox',
  async run(ctx: JobContext) {
    const { admin, perf, params } = ctx
    const workerId = `email-outbox:${process.pid || 'worker'}:${Date.now()}`
    const limit = getBatchLimit(params.limit)

    const { data, error } = await perf.time(
      'email_outbox',
      'email_outbox_claim',
      () =>
        admin.rpc('claim_email_outbox_jobs', {
          p_limit: limit,
          p_worker_id: workerId,
        }),
      (result) => ({ rowCount: result.data?.length ?? 0 }),
    )

    if (error) {
      console.error('[job:email-outbox] claim failed', {
        code: error.code,
        message: sanitizeErrorMessage(error.message),
      })
      return {
        ok: false,
        error: 'claim_failed',
        stats: { claimed: 0, sent: 0, failed: 0 },
      }
    }

    const jobs = (data ?? []) as EmailOutboxJob[]
    let sent = 0
    let failed = 0

    for (const job of jobs) {
      const result = await processJob(admin, perf, job)
      if (result === 'sent') sent += 1
      else failed += 1
    }

    return {
      ok: true,
      stats: {
        claimed: jobs.length,
        sent,
        failed,
      },
    }
  },
}

async function processJob(
  admin: JobContext['admin'],
  perf: JobContext['perf'],
  job: EmailOutboxJob,
): Promise<'sent' | 'failed'> {
  const markJobTotal = perf.start('email_outbox', 'email_outbox_job_total')
  try {
    const email = perf.timeSync('email_outbox', 'email_outbox_template_preparation', () =>
      renderOutboxEmail(job),
    )
    email.entityIdText = job.idempotency_key || email.entityIdText || job.id
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY_MISSING')
    if (!process.env.EMAIL_FROM) throw new Error('EMAIL_FROM_MISSING')

    const delivery = await perf.time('email_outbox', 'email_outbox_provider_delivery', () =>
      sendEmail(email),
    )

    if (delivery.status === 'sent' || delivery.status === 'skipped') {
      await perf.time('email_outbox', 'email_outbox_status_update', () =>
        admin
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
          .eq('status', 'processing'),
      )
      markJobTotal({ rowCount: 1 })
      return 'sent'
    }

    await markJobFailed(admin, perf, job, 'PROVIDER_DELIVERY_FAILED')
    markJobTotal({ rowCount: 1 })
    return 'failed'
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_EMAIL_OUTBOX_ERROR'
    await markJobFailed(admin, perf, job, message)
    markJobTotal({ rowCount: 1 })
    return 'failed'
  }
}

async function markJobFailed(
  admin: JobContext['admin'],
  perf: JobContext['perf'],
  job: EmailOutboxJob,
  errorMessage: string,
) {
  const finalFailure = job.attempts >= job.max_attempts
  const status = finalFailure ? 'failed' : 'pending'

  await perf.time('email_outbox', 'email_outbox_status_update', () =>
    admin
      .from('email_outbox')
      .update({
        status,
        locked_at: null,
        locked_by: null,
        last_error: sanitizeErrorMessage(errorMessage),
        available_at: finalFailure ? new Date().toISOString() : nextEmailRetryAt(job.attempts),
      })
      .eq('id', job.id)
      .eq('status', 'processing'),
  )

  console.warn('[job:email-outbox] job failed', {
    eventType: job.event_type,
    status,
    finalFailure,
    errorCode: sanitizeErrorMessage(errorMessage).split(':')[0] ?? 'unknown',
  })
}

function getBatchLimit(raw?: string): number {
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_BATCH_SIZE
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH_SIZE
  return Math.min(50, Math.max(1, parsed))
}
