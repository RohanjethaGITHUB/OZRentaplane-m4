import { sendEmail } from '@/lib/email/send-email'
import {
  bookingConfirmedEmail,
  bookingCancelledEmail,
  cancellationRequestedEmail,
  proxyBookingConfirmedEmail,
  adminProxyBookingCreatedEmail,
} from '@/lib/email/templates/booking'
import {
  checkoutRequestReceivedEmail,
  adminNewCheckoutRequestEmail,
  checkoutConfirmedEmail,
  bankTransferProofReceivedEmail,
  adminBankTransferProofUploadedEmail,
} from '@/lib/email/templates/checkout'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_CC_EMAIL = 'ozrentaplane@gmail.com'

function formatBookingTypeLabel(bookingType: 'standard' | 'checkout'): string {
  return bookingType === 'checkout' ? 'Checkout' : 'Standard'
}

function formatSydneyDate(isoDateTime: string): string {
  return new Date(isoDateTime).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    dateStyle: 'medium',
  })
}

function formatSydneyTimeRange(startIso: string, endIso: string): string {
  const formatOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Australia/Sydney',
    timeStyle: 'short',
  }

  const start = new Date(startIso).toLocaleTimeString('en-AU', formatOptions)
  const end = new Date(endIso).toLocaleTimeString('en-AU', formatOptions)
  return `${start} → ${end} AEST`
}

export async function notifyBookingSubmitted(opts: {
  customerEmail: string
  customerName: string
  ref: string
  aircraft: string
  start: string
  end: string
  bookingId?: string
}) {
  const template = bookingConfirmedEmail({ aircraft: opts.aircraft, date: opts.start, start: opts.start, end: opts.end })
  await sendEmail({
    to: opts.customerEmail,
    subject: template.subject,
    html: template.html,
    eventType: 'booking_confirmed',
    entityType: 'booking',
    entityId: opts.bookingId ?? null,
    metadata: { ref: opts.ref },
  })

  if (ADMIN_EMAIL) {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: 'New aircraft booking confirmed',
      html: bookingConfirmedEmail({ aircraft: opts.aircraft, date: opts.start, start: opts.start, end: opts.end }).html,
      eventType: 'admin_new_booking_confirmed',
      entityType: 'booking',
      entityId: opts.bookingId ?? null,
      metadata: { customerEmail: opts.customerEmail, customerName: opts.customerName, ref: opts.ref },
    })
  }
}

export async function notifyBookingConfirmed(opts: {
  customerEmail: string
  customerName: string
  ref: string
  aircraft: string
  start: string
  end: string
  bookingId?: string
}) {
  return notifyBookingSubmitted(opts)
}

export async function notifyBookingCancelled(opts: {
  customerEmail: string
  customerName: string
  ref: string
  reason: string
  bookingId?: string
}) {
  const template = bookingCancelledEmail(opts.reason)
  await sendEmail({
    to: opts.customerEmail,
    subject: template.subject,
    html: template.html,
    eventType: 'booking_cancelled',
    entityType: 'booking',
    entityId: opts.bookingId ?? null,
    metadata: { reason: opts.reason, ref: opts.ref },
  })
}

export async function notifyClarificationRequested(opts: {
  customerEmail: string
  customerName: string
  ref: string
  question: string
  bookingId?: string
}) {
  const template = cancellationRequestedEmail()
  await sendEmail({
    to: opts.customerEmail,
    subject: template.subject,
    html: template.html,
    eventType: 'cancellation_requested',
    entityType: 'booking',
    entityId: opts.bookingId ?? null,
    metadata: { question: opts.question, ref: opts.ref },
  })
}

export async function notifyClarificationResponseReceived(opts: {
  ref: string
  customerName: string
  response: string
  bookingId?: string
}) {
  if (!ADMIN_EMAIL) return
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: 'Cancellation review required',
    html: cancellationRequestedEmail().html,
    eventType: 'admin_cancellation_review_required',
    entityType: 'booking',
    entityId: opts.bookingId ?? null,
    metadata: { ref: opts.ref, customerName: opts.customerName, response: opts.response },
  })
}

export async function notifyPostFlightClarificationRequested(opts: {
  customerEmail: string
  customerName: string
  ref: string
  category: string
  message: string
  bookingId?: string
}) {
  const template = checkoutRequestReceivedEmail()
  await sendEmail({
    to: opts.customerEmail,
    subject: 'Flight record submitted',
    html: template.html,
    eventType: 'flight_record_submitted',
    entityType: 'booking',
    entityId: opts.bookingId ?? null,
    metadata: { category: opts.category, message: opts.message, ref: opts.ref },
  })
}

export async function notifyFlightRecordResubmitted(opts: {
  ref: string
  customerName: string
  aircraftReg: string
  bookingId?: string
}) {
  if (!ADMIN_EMAIL) return
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: 'Flight record submitted for review',
    html: adminNewCheckoutRequestEmail({ customerName: opts.customerName, customerEmail: '', requestedTime: '', bookingId: opts.bookingId ?? null }).html,
    eventType: 'admin_flight_record_review_required',
    entityType: 'booking',
    entityId: opts.bookingId ?? null,
    metadata: { ref: opts.ref, aircraftReg: opts.aircraftReg },
  })
}

export async function notifyCancellationRequested(opts: { customerEmail: string; bookingId: string }) {
  const template = cancellationRequestedEmail()
  await sendEmail({
    to: opts.customerEmail,
    subject: template.subject,
    html: template.html,
    eventType: 'cancellation_requested',
    entityType: 'booking',
    entityId: opts.bookingId,
  })
}

export async function notifyAdminCancellationReviewRequired(opts: {
  bookingId: string
  customerName: string
  customerEmail: string
  reason: string | null
}) {
  if (!ADMIN_EMAIL) return
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: 'Cancellation review required',
    html: cancellationRequestedEmail().html,
    eventType: 'admin_cancellation_review_required',
    entityType: 'booking',
    entityId: opts.bookingId,
    metadata: { customerName: opts.customerName, customerEmail: opts.customerEmail, reason: opts.reason },
  })
}

export async function notifyFlightRecordSubmitted(opts: {
  bookingId: string
  customerEmail: string
  customerName: string
  aircraft: string
  bookingDate: string
}) {
  await sendEmail({
    to: opts.customerEmail,
    subject: 'Flight record submitted',
    html: checkoutRequestReceivedEmail().html,
    eventType: 'flight_record_submitted',
    entityType: 'booking',
    entityId: opts.bookingId,
  })

  if (ADMIN_EMAIL) {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: 'Flight record submitted for review',
      html: adminNewCheckoutRequestEmail({
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        requestedTime: opts.bookingDate,
        bookingId: opts.bookingId,
      }).html,
      eventType: 'admin_flight_record_review_required',
      entityType: 'booking',
      entityId: opts.bookingId,
      metadata: { aircraft: opts.aircraft },
    })
  }
}

export async function notifyCheckoutRequestSubmitted(opts: {
  customerEmail: string
  customerName: string
  bookingId: string
  requestedTime: string
}) {
  const customerTemplate = checkoutRequestReceivedEmail()
  await sendEmail({
    to: opts.customerEmail,
    subject: customerTemplate.subject,
    html: customerTemplate.html,
    eventType: 'checkout_request_submitted',
    entityType: 'checkout',
    entityId: opts.bookingId,
  })

  if (ADMIN_EMAIL) {
    const adminTemplate = adminNewCheckoutRequestEmail({
      customerName: opts.customerName,
      customerEmail: opts.customerEmail,
      requestedTime: opts.requestedTime,
      bookingId: opts.bookingId,
    })
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: adminTemplate.subject,
      html: adminTemplate.html,
      eventType: 'admin_new_checkout_request',
      entityType: 'checkout',
      entityId: opts.bookingId,
    })
  }
}

export async function notifyProxyBookingCreated(opts: {
  bookingId: string
  bookingType: 'standard' | 'checkout'
  customerId: string
  customerName: string
  customerEmail: string
  aircraftRegistration: string
  aircraftName: string
  scheduledStart: string
  scheduledEnd: string
  adminNotes?: string
}) {
  const bookingTypeLabel = formatBookingTypeLabel(opts.bookingType)
  const bookingTypeLower = opts.bookingType
  const aircraftLabel = `${opts.aircraftRegistration} — ${opts.aircraftName}`
  const date = formatSydneyDate(opts.scheduledStart)
  const time = formatSydneyTimeRange(opts.scheduledStart, opts.scheduledEnd)

  const customerTemplate = proxyBookingConfirmedEmail({
    bookingTypeLabel,
    bookingTypeLower,
    customerName: opts.customerName,
    aircraft: aircraftLabel,
    date,
    time,
  })

  await sendEmail({
    to: opts.customerEmail,
    subject: customerTemplate.subject,
    html: customerTemplate.html,
    eventType: 'proxy_booking_created_customer',
    entityType: 'booking',
    entityId: opts.bookingId,
    metadata: {
      bookingType: opts.bookingType,
      customerId: opts.customerId,
      customerEmail: opts.customerEmail,
    },
  })

  const adminTemplate = adminProxyBookingCreatedEmail({
    bookingTypeLabel,
    bookingTypeLower,
    customerId: opts.customerId,
    customerName: opts.customerName,
    customerEmail: opts.customerEmail,
    aircraft: aircraftLabel,
    date,
    time,
    adminNotes: opts.adminNotes ?? null,
  })

  if (ADMIN_EMAIL) {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: adminTemplate.subject,
      html: adminTemplate.html,
      eventType: 'admin_proxy_booking_created_email',
      entityType: 'booking',
      entityId: opts.bookingId,
      metadata: {
        bookingType: opts.bookingType,
        customerId: opts.customerId,
        customerEmail: opts.customerEmail,
      },
    })
  }

  await sendEmail({
    to: ADMIN_CC_EMAIL,
    subject: adminTemplate.subject,
    html: adminTemplate.html,
    eventType: 'admin_proxy_booking_created_cc',
    entityType: 'booking',
    entityId: opts.bookingId,
    metadata: {
      bookingType: opts.bookingType,
      customerId: opts.customerId,
      customerEmail: opts.customerEmail,
    },
  })
}

export async function notifyCheckoutConfirmed(opts: {
  customerEmail: string
  bookingId: string
  time: string
  aircraft: string
}) {
  const template = checkoutConfirmedEmail({ time: opts.time, aircraft: opts.aircraft })
  await sendEmail({
    to: opts.customerEmail,
    subject: template.subject,
    html: template.html,
    eventType: 'checkout_confirmed',
    entityType: 'checkout',
    entityId: opts.bookingId,
  })
}

export async function notifyBankTransferProofReceived(opts: { customerEmail: string; bookingId: string }) {
  const customerTemplate = bankTransferProofReceivedEmail()
  await sendEmail({
    to: opts.customerEmail,
    subject: customerTemplate.subject,
    html: customerTemplate.html,
    eventType: 'bank_transfer_proof_received',
    entityType: 'payment',
    entityId: opts.bookingId,
  })
}

export async function notifyAdminBankTransferProofUploaded(opts: {
  bookingId: string
  customerName: string
  customerEmail: string
  amount: string
  invoiceType: string
}) {
  if (!ADMIN_EMAIL) return
  const template = adminBankTransferProofUploadedEmail(opts)
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: template.subject,
    html: template.html,
    eventType: 'admin_bank_transfer_proof_uploaded',
    entityType: 'payment',
    entityId: opts.bookingId,
  })
}
