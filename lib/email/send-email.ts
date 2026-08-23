import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getResendClient } from './resend'

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text?: string
  attachments?: Array<{
    filename: string
    content: string
    contentType?: string
  }>
  eventType: string
  entityType: string
  entityId?: string | null
  entityIdText?: string | null
  metadata?: Record<string, unknown>
}

function cleanEmailString(value?: string | null): string | undefined {
  if (!value) return undefined
  let clean = value.trim()
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    clean = clean.slice(1, -1).trim()
  }
  return clean || undefined
}

export async function sendEmail(input: SendEmailInput): Promise<{ status: 'sent' | 'failed' | 'skipped'; resendEmailId?: string | null }> {
  const from = cleanEmailString(process.env.EMAIL_FROM)
  const replyTo = cleanEmailString(process.env.EMAIL_REPLY_TO)
  const resend = getResendClient()
  const dedupeKey = getEntityIdText(input)

  const admin = createAdminClientSafe()

  if (!process.env.RESEND_API_KEY || !resend) {
    await insertEmailEvent(admin, input, dedupeKey, 'skipped', null, 'RESEND_API_KEY missing')
    console.warn('[email] skipped: RESEND_API_KEY missing')
    return { status: 'skipped' }
  }

  if (!from) {
    await insertEmailEvent(admin, input, dedupeKey, 'skipped', null, 'EMAIL_FROM missing')
    console.warn('[email] skipped: EMAIL_FROM missing')
    return { status: 'skipped' }
  }

  const existingStatus = await getExistingEventStatus(admin, input, dedupeKey)
  if (existingStatus === 'sent') {
    console.info('[email] already sent; skipping duplicate', { eventType: input.eventType, entityType: input.entityType, entityIdText: dedupeKey, to: input.to })
    return { status: 'skipped' }
  }

  const inserted = await insertEmailEvent(admin, input, dedupeKey, 'pending', null, null)
  if (inserted === 'duplicate') {
    console.info('[email] duplicate event skipped', { eventType: input.eventType, entityType: input.entityType, entityIdText: dedupeKey, to: input.to })
    return { status: 'skipped' }
  }

  try {
    const to = cleanEmailString(input.to) || input.to.trim()
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: replyTo || undefined,
      attachments: input.attachments,
    })
    const resendEmailId = (data as { id?: string } | null)?.id ?? null

    if (error) {
      await insertEmailEvent(admin, input, dedupeKey, 'failed', resendEmailId, error.message)
      console.error('[email] send failed', { error: error.message, eventType: input.eventType })
      return { status: 'failed', resendEmailId }
    }

    await insertEmailEvent(admin, input, dedupeKey, 'sent', resendEmailId, null)
    console.info('[email] sent', { resendEmailId, eventType: input.eventType, to: input.to })
    return { status: 'sent', resendEmailId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email send error'
    await insertEmailEvent(admin, input, dedupeKey, 'failed', null, message)
    console.error('[email] send exception', { message, eventType: input.eventType })
    return { status: 'failed' }
  }
}

function createAdminClientSafe() {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

async function insertEmailEvent(
  admin: ReturnType<typeof createAdminClient> | null,
  input: SendEmailInput,
  entityIdText: string,
  status: 'pending' | 'sent' | 'failed' | 'skipped',
  resendEmailId: string | null,
  errorMessage: string | null,
): Promise<'ok' | 'duplicate'> {
  if (!admin) return 'ok'

  const payload = {
    recipient_email: input.to,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    entity_id_text: entityIdText,
    resend_email_id: resendEmailId,
    status,
    error_message: errorMessage,
    metadata: input.metadata ?? {},
  }

  const { error } = await admin.from('email_events').upsert(payload, {
    onConflict: 'event_type,entity_type,entity_id_text,recipient_email',
    ignoreDuplicates: status === 'pending',
  })

  if (error) {
    if (error.code === '23505') return 'duplicate'
    console.error('[email] email_events upsert failed', { message: error.message })
  }

  return 'ok'
}

async function getExistingEventStatus(
  admin: ReturnType<typeof createAdminClient> | null,
  input: SendEmailInput,
  entityIdText: string,
): Promise<'pending' | 'sent' | 'failed' | 'skipped' | null> {
  if (!admin) return null

  const { data, error } = await admin
    .from('email_events')
    .select('status')
    .eq('event_type', input.eventType)
    .eq('entity_type', input.entityType)
    .eq('entity_id_text', entityIdText)
    .eq('recipient_email', input.to)
    .maybeSingle()

  if (error) {
    console.error('[email] failed checking existing event', { message: error.message })
    return null
  }
  return (data?.status as 'pending' | 'sent' | 'failed' | 'skipped' | undefined) ?? null
}

function getEntityIdText(input: SendEmailInput): string {
  if (input.entityIdText && input.entityIdText.trim().length > 0) return input.entityIdText.trim()
  if (input.entityId && input.entityId.trim().length > 0) return input.entityId.trim()
  return `${input.entityType}:none`
}
