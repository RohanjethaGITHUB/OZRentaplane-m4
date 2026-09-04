import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getResendClient } from './resend'
import { isLocalOrDevEnvironment } from './is-local-env'

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
  if (isLocalOrDevEnvironment()) {
    console.info('[email] Suppressed sending email in local development', {
      eventType: input.eventType,
      to: input.to,
      subject: input.subject,
    })
    return { status: 'skipped' }
  }

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
    const rawTo = cleanEmailString(input.to) || input.to.trim()
    const configuredAdmin = cleanEmailString(process.env.ADMIN_EMAIL) || 'info@ozrentaplane.com'
    const devAdminEmail = 'devjamaviation@gmail.com'
    const rohanAdminEmail = 'rohanjetha14@gmail.com'

    let recipients: string[] = [rawTo]
    const isAdminEmail =
      input.eventType.startsWith('admin_') ||
      rawTo.toLowerCase() === 'info@ozrentaplane.com' ||
      rawTo.toLowerCase() === 'ozrentaplane@gmail.com' ||
      rawTo.toLowerCase() === configuredAdmin.toLowerCase() ||
      rawTo.toLowerCase() === devAdminEmail.toLowerCase() ||
      rawTo.toLowerCase() === rohanAdminEmail.toLowerCase()

    if (isAdminEmail) {
      const recipientSet = new Set<string>()
      recipientSet.add(configuredAdmin)
      recipientSet.add(devAdminEmail)
      recipientSet.add(rohanAdminEmail)
      recipients = Array.from(recipientSet)
    }
    
    // Guard with a 5s timeout so network drops / ECONNRESET do not hang Next.js actions
    const sendPromise = resend.emails.send({
      from,
      to: recipients.length === 1 ? recipients[0] : recipients,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: replyTo || undefined,
      attachments: input.attachments,
    })

    const timeoutPromise = new Promise<{ data: null; error: { message: string; name: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: 'Email send timed out after 5s', name: 'TimeoutError' } }), 5000)
    )

    const { data, error } = await Promise.race([sendPromise, timeoutPromise])
    const resendEmailId = (data as { id?: string } | null)?.id ?? null

    if (error) {
      await insertEmailEvent(admin, input, dedupeKey, 'failed', resendEmailId, error.message)
      console.error('[email] send failed', { error: error.message, eventType: input.eventType })
      return { status: 'failed', resendEmailId }
    }

    await insertEmailEvent(admin, input, dedupeKey, 'sent', resendEmailId, null)
    console.info('[email] sent', { resendEmailId, eventType: input.eventType, to: recipients })
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

function isValidUuid(val?: string | null): boolean {
  if (!val) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
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
    entity_id: isValidUuid(input.entityId) ? input.entityId : null,
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
