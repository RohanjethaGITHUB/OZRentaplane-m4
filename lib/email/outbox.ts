import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { bookingConfirmedEmail } from '@/lib/email/templates/booking'
import {
  adminNewCheckoutRequestEmail,
  checkoutConfirmedEmail,
  checkoutRequestReceivedEmail,
} from '@/lib/email/templates/checkout'
import type { SendEmailInput } from '@/lib/email/send-email'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL

type EmailOutboxEventType =
  | 'booking_confirmed'
  | 'admin_new_booking_confirmed'
  | 'checkout_request_submitted'
  | 'admin_new_checkout_request'
  | 'checkout_confirmed'

type BookingConfirmedPayload = {
  bookingId: string
  ref: string
  aircraft: string
  start: string
  end: string
}

type AdminCheckoutRequestPayload = {
  bookingId: string
  customerName: string
  customerEmail: string
  requestedTime: string
}

type CheckoutConfirmedPayload = {
  bookingId: string
  time: string
  aircraft: string
}

type EmailOutboxPayload =
  | (BookingConfirmedPayload & { kind: 'booking_confirmed' })
  | (AdminCheckoutRequestPayload & { kind: 'admin_new_checkout_request' })
  | (CheckoutConfirmedPayload & { kind: 'checkout_confirmed' })
  | ({ bookingId: string; kind: 'checkout_request_submitted' })

export type EmailOutboxJob = {
  id: string
  event_type: EmailOutboxEventType
  recipient_email: string
  payload: EmailOutboxPayload
  idempotency_key: string
  status: 'pending' | 'processing' | 'sent' | 'failed'
  attempts: number
  max_attempts: number
}

type EnqueueEmailJobInput = {
  eventType: EmailOutboxEventType
  recipientEmail: string
  idempotencyKey: string
  payload: EmailOutboxPayload
}

export async function enqueueBookingConfirmedEmails(opts: {
  customerEmail: string
  customerName: string
  ref: string
  aircraft: string
  start: string
  end: string
  bookingId: string
}) {
  const jobs: EnqueueEmailJobInput[] = [
    {
      eventType: 'booking_confirmed',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `booking-confirmed:customer:${opts.bookingId}`,
      payload: {
        kind: 'booking_confirmed',
        bookingId: opts.bookingId,
        ref: opts.ref,
        aircraft: opts.aircraft,
        start: opts.start,
        end: opts.end,
      },
    },
  ]

  if (ADMIN_EMAIL) {
    jobs.push({
      eventType: 'admin_new_booking_confirmed',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `booking-confirmed:admin:${opts.bookingId}`,
      payload: {
        kind: 'booking_confirmed',
        bookingId: opts.bookingId,
        ref: opts.ref,
        aircraft: opts.aircraft,
        start: opts.start,
        end: opts.end,
      },
    })
  }

  await enqueueEmailJobs(jobs)
}

export async function enqueueCheckoutRequestSubmittedEmails(opts: {
  customerEmail: string
  customerName: string
  bookingId: string
  requestedTime: string
}) {
  await enqueueCheckoutRequestSubmittedCustomerEmail(opts)
  await enqueueCheckoutRequestSubmittedAdminEmail(opts)
}

export async function enqueueCheckoutRequestSubmittedCustomerEmail(opts: {
  customerEmail: string
  bookingId: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'checkout_request_submitted',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `checkout-request-submitted:customer:${opts.bookingId}`,
      payload: {
        kind: 'checkout_request_submitted',
        bookingId: opts.bookingId,
      },
    },
  ])
}

export async function enqueueCheckoutRequestSubmittedAdminEmail(opts: {
  customerEmail: string
  customerName: string
  bookingId: string
  requestedTime: string
}) {
  if (!ADMIN_EMAIL) return
  await enqueueEmailJobs([
    {
      eventType: 'admin_new_checkout_request',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `checkout-request-submitted:admin:${opts.bookingId}`,
      payload: {
        kind: 'admin_new_checkout_request',
        bookingId: opts.bookingId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        requestedTime: opts.requestedTime,
      },
    },
  ])
}

export async function enqueueCheckoutConfirmedEmail(opts: {
  customerEmail: string
  bookingId: string
  time: string
  aircraft: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'checkout_confirmed',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `checkout-approved:customer:${opts.bookingId}`,
      payload: {
        kind: 'checkout_confirmed',
        bookingId: opts.bookingId,
        time: opts.time,
        aircraft: opts.aircraft,
      },
    },
  ])
}

async function enqueueEmailJobs(jobs: EnqueueEmailJobInput[]) {
  if (jobs.length === 0) return
  const admin = createAdminClient()
  const { error } = await admin
    .from('email_outbox')
    .upsert(
      jobs.map((job) => ({
        event_type: job.eventType,
        recipient_email: job.recipientEmail,
        payload: job.payload,
        idempotency_key: job.idempotencyKey,
        status: 'pending',
      })),
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    )

  if (error) {
    console.error('[email-outbox] enqueue failed', {
      code: error.code,
      message: sanitizeErrorMessage(error.message),
      count: jobs.length,
    })
    throw new Error('EMAIL_ENQUEUE_FAILED')
  }
}

export function renderOutboxEmail(job: EmailOutboxJob): SendEmailInput {
  const payload = job.payload

  if (job.event_type === 'booking_confirmed' && payload.kind === 'booking_confirmed') {
    const template = bookingConfirmedEmail({
      aircraft: payload.aircraft,
      date: payload.start,
      start: payload.start,
      end: payload.end,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'booking_confirmed',
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { ref: payload.ref },
    }
  }

  if (job.event_type === 'admin_new_booking_confirmed' && payload.kind === 'booking_confirmed') {
    const template = bookingConfirmedEmail({
      aircraft: payload.aircraft,
      date: payload.start,
      start: payload.start,
      end: payload.end,
    })
    return {
      to: job.recipient_email,
      subject: 'New aircraft booking confirmed',
      html: template.html,
      eventType: 'admin_new_booking_confirmed',
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { ref: payload.ref },
    }
  }

  if (job.event_type === 'checkout_request_submitted' && payload.kind === 'checkout_request_submitted') {
    const template = checkoutRequestReceivedEmail()
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'checkout_request_submitted',
      entityType: 'checkout',
      entityId: payload.bookingId,
    }
  }

  if (job.event_type === 'admin_new_checkout_request' && payload.kind === 'admin_new_checkout_request') {
    const template = adminNewCheckoutRequestEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      requestedTime: payload.requestedTime,
      bookingId: payload.bookingId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_new_checkout_request',
      entityType: 'checkout',
      entityId: payload.bookingId,
    }
  }

  if (job.event_type === 'checkout_confirmed' && payload.kind === 'checkout_confirmed') {
    const template = checkoutConfirmedEmail({
      time: payload.time,
      aircraft: payload.aircraft,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'checkout_confirmed',
      entityType: 'checkout',
      entityId: payload.bookingId,
    }
  }

  throw new Error('UNSUPPORTED_EMAIL_OUTBOX_EVENT')
}

export function nextEmailRetryAt(attempts: number) {
  const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attempts - 1)))
  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
}

export function sanitizeErrorMessage(message: string) {
  return message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').slice(0, 240)
}
