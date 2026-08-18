import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { bookingConfirmedEmail } from '@/lib/email/templates/booking'
import {
  adminNewCheckoutRequestEmail,
  adminCheckoutRejectedEmail,
  checkoutConfirmedEmail,
  checkoutRejectedEmail,
  checkoutRequestReceivedEmail,
  checkoutRescheduleRequestedEmail,
  adminCheckoutRescheduleRequestedEmail,
  checkoutRescheduleApprovedEmail,
  adminCheckoutRescheduleApprovedEmail,
  checkoutRescheduleRejectedEmail,
  adminCheckoutRescheduleRejectedEmail,
} from '@/lib/email/templates/checkout'
import type { SendEmailInput } from '@/lib/email/send-email'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL

type EmailOutboxEventType =
  | 'booking_confirmed'
  | 'admin_new_booking_confirmed'
  | 'checkout_request_submitted'
  | 'admin_new_checkout_request'
  | 'checkout_confirmed'
  | 'admin_checkout_confirmed'
  | 'checkout_rejected'
  | 'admin_checkout_rejected'
  | 'checkout_reschedule_requested'
  | 'admin_checkout_reschedule_requested'
  | 'checkout_reschedule_approved'
  | 'admin_checkout_reschedule_approved'
  | 'checkout_reschedule_rejected'
  | 'admin_checkout_reschedule_rejected'

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

type CheckoutRejectedPayload = {
  bookingId: string
  reason: string
  aircraft: string
  customerName: string
  customerEmail: string
}

type CheckoutReschedulePayload = {
  bookingId: string
  customerName: string
  customerEmail: string
  originalTime: string
  requestedTime: string
  aircraft: string
}

type EmailOutboxPayload =
  | (BookingConfirmedPayload & { kind: 'booking_confirmed' })
  | (AdminCheckoutRequestPayload & { kind: 'admin_new_checkout_request' })
  | (CheckoutConfirmedPayload & { kind: 'checkout_confirmed' })
  | (CheckoutRejectedPayload & { kind: 'checkout_rejected' })
  | (CheckoutReschedulePayload & { kind: 'checkout_reschedule' })
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
  customerName: string
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
    ...(ADMIN_EMAIL ? [{
      eventType: 'admin_checkout_confirmed' as const,
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `checkout-approved:admin:${opts.bookingId}`,
      payload: {
        kind: 'checkout_confirmed' as const,
        bookingId: opts.bookingId,
        time: opts.time,
        aircraft: opts.aircraft,
      },
    }] : []),
  ])
}

export async function enqueueCheckoutRejectedEmails(opts: {
  customerName: string
  customerEmail: string
  bookingId: string
  reason: string
  aircraft: string
}) {
  const payload = {
    kind: 'checkout_rejected' as const,
    bookingId: opts.bookingId,
    reason: opts.reason,
    aircraft: opts.aircraft,
    customerName: opts.customerName,
    customerEmail: opts.customerEmail,
  }
  const jobs: EnqueueEmailJobInput[] = [{
    eventType: 'checkout_rejected',
    recipientEmail: opts.customerEmail,
    idempotencyKey: `checkout-rejected:customer:${opts.bookingId}`,
    payload,
  }]
  if (ADMIN_EMAIL) {
    jobs.push({
      eventType: 'admin_checkout_rejected',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `checkout-rejected:admin:${opts.bookingId}`,
      payload,
    })
  }
  await enqueueEmailJobs(jobs)
}

export async function enqueueCheckoutRescheduleEmails(opts: CheckoutReschedulePayload & {
  outcome: 'requested' | 'approved' | 'rejected'
}) {
  const payload = { kind: 'checkout_reschedule' as const, ...opts }
  const customerEvent = `checkout_reschedule_${opts.outcome}` as EmailOutboxEventType
  const jobs: EnqueueEmailJobInput[] = [{
    eventType: customerEvent,
    recipientEmail: opts.customerEmail,
    idempotencyKey: `checkout-reschedule:${opts.outcome}:customer:${opts.bookingId}`,
    payload,
  }]
  if (ADMIN_EMAIL) {
    jobs.push({
      eventType: `admin_${customerEvent}` as EmailOutboxEventType,
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `checkout-reschedule:${opts.outcome}:admin:${opts.bookingId}`,
      payload,
    })
  }
  await enqueueEmailJobs(jobs)
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

  if (job.event_type === 'admin_checkout_confirmed' && payload.kind === 'checkout_confirmed') {
    const template = checkoutConfirmedEmail({ time: payload.time, aircraft: payload.aircraft })
    return {
      to: job.recipient_email,
      subject: 'Checkout request confirmed',
      html: template.html,
      eventType: 'admin_checkout_confirmed',
      entityType: 'checkout',
      entityId: payload.bookingId,
    }
  }

  if (job.event_type === 'checkout_rejected' && payload.kind === 'checkout_rejected') {
    const template = checkoutRejectedEmail({ reason: payload.reason, aircraft: payload.aircraft })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'checkout_rejected',
      entityType: 'checkout',
      entityId: payload.bookingId,
    }
  }

  if (job.event_type === 'admin_checkout_rejected' && payload.kind === 'checkout_rejected') {
    const template = adminCheckoutRejectedEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      reason: payload.reason,
      aircraft: payload.aircraft,
      bookingId: payload.bookingId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_checkout_rejected',
      entityType: 'checkout',
      entityId: payload.bookingId,
    }
  }

  if (payload.kind === 'checkout_reschedule') {
    const details = {
      bookingId: payload.bookingId,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      originalTime: payload.originalTime,
      requestedTime: payload.requestedTime,
      aircraft: payload.aircraft,
    }
    const template = job.event_type === 'checkout_reschedule_requested'
      ? checkoutRescheduleRequestedEmail(details)
      : job.event_type === 'admin_checkout_reschedule_requested'
        ? adminCheckoutRescheduleRequestedEmail(details)
        : job.event_type === 'checkout_reschedule_approved'
          ? checkoutRescheduleApprovedEmail(details)
          : job.event_type === 'admin_checkout_reschedule_approved'
            ? adminCheckoutRescheduleApprovedEmail(details)
            : job.event_type === 'checkout_reschedule_rejected'
              ? checkoutRescheduleRejectedEmail(details)
              : adminCheckoutRescheduleRejectedEmail(details)
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: job.event_type,
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
