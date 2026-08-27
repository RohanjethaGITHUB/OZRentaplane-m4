import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  rentalBookingConfirmedCustomerEmail,
  adminRentalBookingConfirmedEmail,
  rentalBookingRescheduledCustomerEmail,
  adminRentalBookingRescheduledEmail,
  rentalBookingCancelledCustomerEmail,
  adminRentalBookingCancelledEmail,
  bookingConfirmedEmail,
} from '@/lib/email/templates/booking'
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
  adminCheckoutUrgentReview24hEmail,
  adminCheckoutOutcomePendingAlertEmail,
  customerCheckoutCancelledEmail,
  adminCheckoutCancelledEmail,
  customerCheckoutTimeProposedEmail,
  adminCheckoutProposalDecisionEmail,
} from '@/lib/email/templates/checkout'
import {
  dayBeforeFlightReminderEmail,
  documentExpiryReminderEmail,
  adminDocumentExpiryAlertEmail,
  flightRecordOverdueEmail,
  postFlightRecordPendingCustomerReminderEmail,
  postFlightRecordPendingAdminReminderEmail,
  adminNewUserInactivityAlertEmail,
  unpaidInvoiceCustomerEmail,
  unpaidInvoiceAdminAlertEmail,
  onboardingNoDocsReminderEmail,
  onboardingIncompleteDocsReminderEmail,
  onboardingRequestCheckoutReminderEmail,
  onboardingActionRequiredReminderEmail,
  adminPendingCheckoutReminderEmail,
  upcomingFlightReminderCustomerEmail,
  adminUpcomingFlightReminderEmail,
  adminFlightRecordPendingReviewEmail,
  adminBankTransferProofPendingVerificationEmail,
} from '@/lib/email/templates/reminders'
import {
  customerWelcomeRegisteredEmail,
  adminNewCustomerRegisteredEmail,
} from '@/lib/email/templates/account'
import {
  blockTimeExpiryReminderEmail,
  blockTimePurchaseConfirmedEmail,
  blockTimeLowBalanceEmail,
} from '@/lib/email/templates/block-time'
import {
  adminWeeklyOperationsDigestEmail,
  type WeeklyDigestFlightItem,
  type WeeklyDigestCustomerItem,
} from '@/lib/email/templates/admin-digest'
import type { SendEmailInput } from '@/lib/email/send-email'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'devjamaviation@gmail.com'

export type EmailOutboxEventType =
  | 'booking_confirmed'
  | 'admin_new_booking_confirmed'
  | 'booking_rescheduled'
  | 'admin_booking_rescheduled'
  | 'booking_cancelled'
  | 'admin_booking_cancelled'
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
  | 'flight_reminder_day_before'
  | 'document_expiry_reminder'
  | 'admin_document_expiry_alert'
  | 'flight_record_overdue_nudge'
  | 'post_flight_record_pending_reminder'
  | 'admin_post_flight_record_pending_alert'
  | 'admin_flight_record_pending_review_alert'
  | 'admin_bank_transfer_pending_verification_alert'
  | 'block_time_purchase_confirmed'
  | 'block_time_low_balance_reminder'
  | 'block_time_expiry_reminder'
  | 'admin_weekly_operations_digest'
  | 'admin_new_user_inactivity_alert'
  | 'unpaid_invoice_customer_reminder'
  | 'admin_unpaid_invoice_alert'
  | 'customer_welcome_registered'
  | 'admin_new_customer_registered'
  | 'onboarding_no_docs_reminder'
  | 'onboarding_incomplete_docs_reminder'
  | 'onboarding_request_checkout_reminder'
  | 'onboarding_action_required_reminder'
  | 'admin_pending_checkout_reminder'
  | 'admin_checkout_urgent_review_24h'
  | 'admin_checkout_outcome_pending_alert'
  | 'checkout_cancelled_by_customer'
  | 'admin_checkout_cancelled_by_customer'
  | 'checkout_cancelled_by_admin'
  | 'checkout_time_proposed'
  | 'admin_checkout_proposal_accepted'
  | 'admin_checkout_proposal_declined'
  | 'upcoming_flight_reminder_48h'
  | 'admin_upcoming_flight_alert_48h'
  | 'upcoming_flight_reminder_12h'
  | 'admin_upcoming_flight_alert_12h'

type BookingConfirmedPayload = {
  bookingId: string
  ref: string
  aircraft: string
  start: string
  end: string
}

type RentalBookingConfirmedPayload = {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  bookingReference: string
  aircraft: string
  date: string
  time: string
  isMultiDay?: boolean
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  daysCount?: number
}

type RentalBookingRescheduledPayload = {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  bookingReference: string
  aircraft: string
  originalTime: string
  newTime: string
  rescheduledBy: 'Customer' | 'Admin'
}

type RentalBookingCancelledPayload = {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  bookingReference: string
  aircraft: string
  scheduledTime?: string | null
  cancelledBy: 'Customer' | 'Admin'
  reason?: string | null
}

type CheckoutRequestSubmittedPayload = {
  bookingId: string
  customerName?: string
  bookingReference?: string
  requestedTime?: string
}

type AdminCheckoutRequestPayload = {
  bookingId: string
  customerId?: string
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  requestedTime: string
  bookingReference?: string
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

type FlightReminderPayload = {
  bookingId: string
  ref: string
  aircraft: string
  date: string
  time: string
  bookingType: string
  pilotName: string
}

type DocumentExpiryPayload = {
  userId: string
  documentId: string
  pilotName: string
  documentTypeLabel: string
  expiryDate: string
  daysUntilExpiry: number
}

type AdminDocumentExpiryPayload = {
  userId: string
  documentId: string
  pilotName: string
  pilotEmail: string
  documentTypeLabel: string
  expiryDate: string
  daysUntilExpiry: number
}

type FlightRecordOverduePayload = {
  bookingId: string
  ref: string
  aircraft: string
  flightDate: string
  pilotName: string
}

type BlockTimePurchaseConfirmedPayload = {
  purchaseId: string
  userId: string
  pilotFirstName: string
  packageName: string
  packageHours: number
  currentBalance: number
  ratePerHour: number
  expiryDate: string
  validityDays: number
  amountPaid: number
  invoiceNumber?: string | null
  pdfUrl?: string | null
}

type BlockTimeLowBalancePayload = {
  purchaseId: string
  userId: string
  pilotFirstName: string
  packageName: string
  hoursRemaining: number
  ratePerHour: number
  expiryDate: string
}

type BlockTimeExpiryPayload = {
  purchaseId: string
  userId: string
  pilotFirstName: string
  packageName: string
  hoursRemaining: number
  expiryDate: string
  daysUntilExpiry: number
  ratePerHour: number
  validityPeriodLabel: string
}

type AdminWeeklyDigestPayload = {
  reportingPeriodLabel: string
  startDateStr: string
  endDateStr: string
  totalFlights: number
  checkoutFlightsCount: number
  rentalFlightsCount: number
  flights: WeeklyDigestFlightItem[]
  totalNewCustomers: number
  customers: WeeklyDigestCustomerItem[]
}

type AdminNewUserInactivityPayload = {
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone: string | null
  pilotArn: string | null
  registeredDate: string
  documentStatus: string
}

type UnpaidInvoiceCustomerPayload = {
  invoiceId: string
  pilotName: string
  invoiceNumber: string
  amountFormatted: string
  invoiceType: string
  bookingRef?: string | null
  invoiceUrl: string
}

type AdminUnpaidInvoicePayload = {
  invoiceId: string
  customerId: string
  customerName: string
  customerEmail: string
  invoiceNumber: string
  amountFormatted: string
  invoiceType: string
  createdDate: string
}

type CustomerWelcomePayload = {
  customerId: string
  customerName: string
  customerEmail: string
  firstName?: string
}

type AdminNewCustomerPayload = {
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  registeredAt?: string
}

type OnboardingNoDocsPayload = {
  customerId: string
  pilotName: string
  cadenceStep: number
}

type OnboardingIncompleteDocsPayload = {
  customerId: string
  pilotName: string
  missingDocumentLabels: string[]
  cadenceStep: number
}

type OnboardingRequestCheckoutPayload = {
  customerId: string
  pilotName: string
  cadenceStep: number
}

type OnboardingActionRequiredPayload = {
  customerId: string
  pilotName: string
  actionReason: string
  actionUrl?: string
  cadenceStep: number
}

type AdminPendingCheckoutPayload = {
  bookingId: string
  customerId: string
  customerName: string
  customerEmail: string
  requestedTime: string
  hoursPending: number
  cadenceStep: number
}

type AdminCheckoutUrgentReviewPayload = {
  bookingId: string
  customerId?: string
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  requestedTime: string
  bookingReference?: string | null
  hoursUntilFlight: number
}

type AdminCheckoutOutcomePendingPayload = {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  bookingReference?: string | null
  flightDate: string
  aircraft?: string | null
  hoursSinceFlight: number
}

type CheckoutCancelledPayload = {
  bookingId: string
  customerId?: string | null
  customerName?: string | null
  bookingReference?: string | null
  scheduledTime?: string | null
  reason?: string | null
  cancelledBy: 'customer' | 'admin'
}

type AdminCheckoutCancelledPayload = {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  bookingReference?: string | null
  scheduledTime?: string | null
  reason?: string | null
}

type CheckoutTimeProposedPayload = {
  bookingId: string
  customerId?: string | null
  customerName?: string | null
  bookingReference?: string | null
  originalTime?: string | null
  proposedTime: string
  aircraft?: string | null
}

type AdminCheckoutProposalDecisionPayload = {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  decision: 'accepted' | 'declined'
  bookingReference?: string | null
  proposedTime?: string | null
  declineReason?: string | null
}

export type UpcomingFlightReminderPayload = {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  bookingReference: string
  aircraft: string
  date: string
  time: string
  bookingType: 'standard' | 'checkout' | string
  hoursUntilFlight: number
  status?: string
}

export type PostFlightRecordPendingPayload = {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  bookingReference: string
  aircraft: string
  flightDate: string
  hoursOverdue: number
  status?: string
  isClarification?: boolean
}

export type AdminFlightRecordPendingReviewPayload = {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  bookingReference: string
  aircraft: string
  flightDate: string
  submittedDate: string
  hoursSinceSubmission: number
}

export type AdminBankTransferPendingVerificationPayload = {
  invoiceId: string
  bookingId?: string | null
  customerId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  invoiceNumber: string
  bookingRef?: string | null
  amountFormatted: string
  invoiceType: string
  submittedDate: string
  hoursSinceSubmission: number
}

export type EmailOutboxPayload =
  | (BookingConfirmedPayload & { kind: 'booking_confirmed' })
  | (RentalBookingConfirmedPayload & { kind: 'rental_booking_confirmed' })
  | (RentalBookingRescheduledPayload & { kind: 'rental_booking_rescheduled' })
  | (RentalBookingCancelledPayload & { kind: 'rental_booking_cancelled' })
  | (AdminCheckoutRequestPayload & { kind: 'admin_new_checkout_request' })
  | (CheckoutConfirmedPayload & { kind: 'checkout_confirmed' })
  | (CheckoutRejectedPayload & { kind: 'checkout_rejected' })
  | (CheckoutReschedulePayload & { kind: 'checkout_reschedule' })
  | (CheckoutRequestSubmittedPayload & { kind: 'checkout_request_submitted' })
  | (FlightReminderPayload & { kind: 'flight_reminder_day_before' })
  | (DocumentExpiryPayload & { kind: 'document_expiry_reminder' })
  | (AdminDocumentExpiryPayload & { kind: 'admin_document_expiry_alert' })
  | (FlightRecordOverduePayload & { kind: 'flight_record_overdue_nudge' })
  | (PostFlightRecordPendingPayload & { kind: 'post_flight_record_pending_reminder' })
  | (PostFlightRecordPendingPayload & { kind: 'admin_post_flight_record_pending_alert' })
  | (AdminFlightRecordPendingReviewPayload & { kind: 'admin_flight_record_pending_review_alert' })
  | (AdminBankTransferPendingVerificationPayload & { kind: 'admin_bank_transfer_pending_verification_alert' })
  | (BlockTimePurchaseConfirmedPayload & { kind: 'block_time_purchase_confirmed' })
  | (BlockTimeLowBalancePayload & { kind: 'block_time_low_balance_reminder' })
  | (BlockTimeExpiryPayload & { kind: 'block_time_expiry_reminder' })
  | (AdminWeeklyDigestPayload & { kind: 'admin_weekly_operations_digest' })
  | (AdminNewUserInactivityPayload & { kind: 'admin_new_user_inactivity_alert' })
  | (UnpaidInvoiceCustomerPayload & { kind: 'unpaid_invoice_customer_reminder' })
  | (AdminUnpaidInvoicePayload & { kind: 'admin_unpaid_invoice_alert' })
  | (CustomerWelcomePayload & { kind: 'customer_welcome_registered' })
  | (AdminNewCustomerPayload & { kind: 'admin_new_customer_registered' })
  | (OnboardingNoDocsPayload & { kind: 'onboarding_no_docs_reminder' })
  | (OnboardingIncompleteDocsPayload & { kind: 'onboarding_incomplete_docs_reminder' })
  | (OnboardingRequestCheckoutPayload & { kind: 'onboarding_request_checkout_reminder' })
  | (OnboardingActionRequiredPayload & { kind: 'onboarding_action_required_reminder' })
  | (AdminPendingCheckoutPayload & { kind: 'admin_pending_checkout_reminder' })
  | (AdminCheckoutUrgentReviewPayload & { kind: 'admin_checkout_urgent_review_24h' })
  | (AdminCheckoutOutcomePendingPayload & { kind: 'admin_checkout_outcome_pending_alert' })
  | (CheckoutCancelledPayload & { kind: 'checkout_cancelled_by_customer' })
  | (AdminCheckoutCancelledPayload & { kind: 'admin_checkout_cancelled_by_customer' })
  | (CheckoutCancelledPayload & { kind: 'checkout_cancelled_by_admin' })
  | (CheckoutTimeProposedPayload & { kind: 'checkout_time_proposed' })
  | (AdminCheckoutProposalDecisionPayload & { kind: 'admin_checkout_proposal_accepted' })
  | (AdminCheckoutProposalDecisionPayload & { kind: 'admin_checkout_proposal_declined' })
  | (UpcomingFlightReminderPayload & { kind: 'upcoming_flight_reminder_48h' })
  | (UpcomingFlightReminderPayload & { kind: 'admin_upcoming_flight_alert_48h' })
  | (UpcomingFlightReminderPayload & { kind: 'upcoming_flight_reminder_12h' })
  | (UpcomingFlightReminderPayload & { kind: 'admin_upcoming_flight_alert_12h' })

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

export type EnqueueEmailJobInput = {
  eventType: EmailOutboxEventType
  recipientEmail: string
  idempotencyKey: string
  payload: EmailOutboxPayload
}

export async function enqueueRentalBookingConfirmedEmails(opts: {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  bookingReference: string
  aircraft: string
  date: string
  time: string
  isMultiDay?: boolean
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  daysCount?: number
}) {
  const jobs: EnqueueEmailJobInput[] = [
    {
      eventType: 'booking_confirmed',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `rental-booking-confirmed:customer:${opts.bookingId}`,
      payload: {
        kind: 'rental_booking_confirmed',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        pilotArn: opts.pilotArn,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        date: opts.date,
        time: opts.time,
        isMultiDay: opts.isMultiDay,
        startDate: opts.startDate,
        endDate: opts.endDate,
        startTime: opts.startTime,
        endTime: opts.endTime,
        daysCount: opts.daysCount,
      },
    },
  ]

  if (ADMIN_EMAIL) {
    jobs.push({
      eventType: 'admin_new_booking_confirmed',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `rental-booking-confirmed:admin:${opts.bookingId}`,
      payload: {
        kind: 'rental_booking_confirmed',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        pilotArn: opts.pilotArn,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        date: opts.date,
        time: opts.time,
        isMultiDay: opts.isMultiDay,
        startDate: opts.startDate,
        endDate: opts.endDate,
        startTime: opts.startTime,
        endTime: opts.endTime,
        daysCount: opts.daysCount,
      },
    })
  }

  await enqueueEmailJobs(jobs)
}

export async function enqueueRentalBookingRescheduledEmails(opts: {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  bookingReference: string
  aircraft: string
  originalTime: string
  newTime: string
  rescheduledBy: 'Customer' | 'Admin'
}) {
  const idempotencySuffix = `${Date.now()}`
  const jobs: EnqueueEmailJobInput[] = [
    {
      eventType: 'booking_rescheduled',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `rental-booking-rescheduled:customer:${opts.bookingId}:${idempotencySuffix}`,
      payload: {
        kind: 'rental_booking_rescheduled',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        originalTime: opts.originalTime,
        newTime: opts.newTime,
        rescheduledBy: opts.rescheduledBy,
      },
    },
  ]

  if (ADMIN_EMAIL) {
    jobs.push({
      eventType: 'admin_booking_rescheduled',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `rental-booking-rescheduled:admin:${opts.bookingId}:${idempotencySuffix}`,
      payload: {
        kind: 'rental_booking_rescheduled',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        originalTime: opts.originalTime,
        newTime: opts.newTime,
        rescheduledBy: opts.rescheduledBy,
      },
    })
  }

  await enqueueEmailJobs(jobs)
}

export async function enqueueRentalBookingCancelledEmails(opts: {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  bookingReference: string
  aircraft: string
  scheduledTime?: string | null
  cancelledBy: 'Customer' | 'Admin'
  reason?: string | null
}) {
  const jobs: EnqueueEmailJobInput[] = [
    {
      eventType: 'booking_cancelled',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `rental-booking-cancelled:customer:${opts.bookingId}`,
      payload: {
        kind: 'rental_booking_cancelled',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        scheduledTime: opts.scheduledTime,
        cancelledBy: opts.cancelledBy,
        reason: opts.reason,
      },
    },
  ]

  if (ADMIN_EMAIL) {
    jobs.push({
      eventType: 'admin_booking_cancelled',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `rental-booking-cancelled:admin:${opts.bookingId}`,
      payload: {
        kind: 'rental_booking_cancelled',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        scheduledTime: opts.scheduledTime,
        cancelledBy: opts.cancelledBy,
        reason: opts.reason,
      },
    })
  }

  await enqueueEmailJobs(jobs)
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
  await enqueueRentalBookingConfirmedEmails({
    bookingId: opts.bookingId,
    customerName: opts.customerName,
    customerEmail: opts.customerEmail,
    bookingReference: opts.ref,
    aircraft: opts.aircraft,
    date: opts.start,
    time: `${opts.start} – ${opts.end}`,
  })
}

export async function enqueueCheckoutRequestSubmittedEmails(opts: {
  customerEmail: string
  customerName?: string
  bookingId: string
  bookingReference?: string
  requestedTime?: string
  customerId?: string
  customerPhone?: string | null
  pilotArn?: string | null
}) {
  await enqueueCheckoutRequestSubmittedCustomerEmail(opts)
  await enqueueCheckoutRequestSubmittedAdminEmail({
    bookingId: opts.bookingId,
    customerId: opts.customerId,
    customerName: opts.customerName || 'Pilot',
    customerEmail: opts.customerEmail,
    customerPhone: opts.customerPhone,
    pilotArn: opts.pilotArn,
    requestedTime: opts.requestedTime || 'Requested Slot',
    bookingReference: opts.bookingReference,
  })
}

export async function enqueueCheckoutRequestSubmittedCustomerEmail(opts: {
  customerEmail: string
  customerName?: string
  bookingId: string
  bookingReference?: string
  requestedTime?: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'checkout_request_submitted',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `checkout-request-submitted:customer:${opts.bookingId}`,
      payload: {
        kind: 'checkout_request_submitted',
        bookingId: opts.bookingId,
        customerName: opts.customerName,
        bookingReference: opts.bookingReference,
        requestedTime: opts.requestedTime,
      },
    },
  ])
}

export async function enqueueCheckoutRequestSubmittedAdminEmail(opts: {
  bookingId: string
  customerId?: string
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  requestedTime: string
  bookingReference?: string
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
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        pilotArn: opts.pilotArn,
        requestedTime: opts.requestedTime,
        bookingReference: opts.bookingReference,
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

export async function enqueueCheckoutCancelledByCustomerEmails(opts: {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  bookingReference?: string | null
  scheduledTime?: string | null
  reason?: string | null
}) {
  const jobs: EnqueueEmailJobInput[] = [
    {
      eventType: 'checkout_cancelled_by_customer',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `checkout-cancelled:customer:${opts.bookingId}`,
      payload: {
        kind: 'checkout_cancelled_by_customer',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        bookingReference: opts.bookingReference,
        scheduledTime: opts.scheduledTime,
        reason: opts.reason,
        cancelledBy: 'customer',
      },
    },
  ]

  if (ADMIN_EMAIL) {
    jobs.push({
      eventType: 'admin_checkout_cancelled_by_customer',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `checkout-cancelled:admin:${opts.bookingId}`,
      payload: {
        kind: 'admin_checkout_cancelled_by_customer',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        bookingReference: opts.bookingReference,
        scheduledTime: opts.scheduledTime,
        reason: opts.reason,
      },
    })
  }

  await enqueueEmailJobs(jobs)
}

export async function enqueueCheckoutCancelledByAdminEmail(opts: {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  bookingReference?: string | null
  scheduledTime?: string | null
  reason?: string | null
}) {
  await enqueueEmailJobs([
    {
      eventType: 'checkout_cancelled_by_admin',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `checkout-cancelled-by-admin:${opts.bookingId}`,
      payload: {
        kind: 'checkout_cancelled_by_admin',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        bookingReference: opts.bookingReference,
        scheduledTime: opts.scheduledTime,
        reason: opts.reason,
        cancelledBy: 'admin',
      },
    },
  ])
}

export async function enqueueCustomerCheckoutTimeProposedEmail(opts: {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  bookingReference?: string | null
  originalTime?: string | null
  proposedTime: string
  aircraft?: string | null
  idempotencyKey?: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'checkout_time_proposed',
      recipientEmail: opts.customerEmail,
      idempotencyKey: opts.idempotencyKey || `checkout-time-proposed:${opts.bookingId}:${Date.now()}`,
      payload: {
        kind: 'checkout_time_proposed',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        bookingReference: opts.bookingReference,
        originalTime: opts.originalTime,
        proposedTime: opts.proposedTime,
        aircraft: opts.aircraft,
      },
    },
  ])
}

export async function enqueueAdminCheckoutProposalDecisionEmail(opts: {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  decision: 'accepted' | 'declined'
  bookingReference?: string | null
  proposedTime?: string | null
  declineReason?: string | null
  idempotencyKey?: string
}) {
  if (!ADMIN_EMAIL) return
  const eventType = opts.decision === 'accepted' ? 'admin_checkout_proposal_accepted' : 'admin_checkout_proposal_declined'
  await enqueueEmailJobs([
    {
      eventType,
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: opts.idempotencyKey || `checkout-proposal-decision:${opts.decision}:${opts.bookingId}:${Date.now()}`,
      payload: {
        kind: eventType,
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        decision: opts.decision,
        bookingReference: opts.bookingReference,
        proposedTime: opts.proposedTime,
        declineReason: opts.declineReason,
      },
    },
  ])
}

export async function enqueueFlightReminderEmail(opts: {
  recipientEmail: string
  pilotName: string
  bookingId: string
  ref: string
  aircraft: string
  date: string
  time: string
  bookingType: string
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'flight_reminder_day_before',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'flight_reminder_day_before',
        bookingId: opts.bookingId,
        ref: opts.ref,
        aircraft: opts.aircraft,
        date: opts.date,
        time: opts.time,
        bookingType: opts.bookingType,
        pilotName: opts.pilotName,
      },
    },
  ])
}

export type UpcomingFlightReminderInput = {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  bookingReference: string
  aircraft: string
  date: string
  time: string
  bookingType: 'standard' | 'checkout' | string
  hoursUntilFlight: number
  status?: string
  scheduledStartIso: string
}

export async function enqueueUpcomingFlightReminder48hEmails(opts: UpcomingFlightReminderInput) {
  const scheduleHash = opts.scheduledStartIso.replace(/[^a-zA-Z0-9]/g, '_')
  const jobs: EnqueueEmailJobInput[] = [
    {
      eventType: 'upcoming_flight_reminder_48h',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `upcoming-flight-48h:customer:${opts.bookingId}:${scheduleHash}`,
      payload: {
        kind: 'upcoming_flight_reminder_48h',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        pilotArn: opts.pilotArn,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        date: opts.date,
        time: opts.time,
        bookingType: opts.bookingType,
        hoursUntilFlight: opts.hoursUntilFlight,
        status: opts.status,
      },
    },
  ]

  if (ADMIN_EMAIL) {
    jobs.push({
      eventType: 'admin_upcoming_flight_alert_48h',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `upcoming-flight-48h:admin:${opts.bookingId}:${scheduleHash}`,
      payload: {
        kind: 'admin_upcoming_flight_alert_48h',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        pilotArn: opts.pilotArn,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        date: opts.date,
        time: opts.time,
        bookingType: opts.bookingType,
        hoursUntilFlight: opts.hoursUntilFlight,
        status: opts.status,
      },
    })
  }

  await enqueueEmailJobs(jobs)
}

export async function enqueueUpcomingFlightReminder12hEmails(opts: UpcomingFlightReminderInput) {
  const scheduleHash = opts.scheduledStartIso.replace(/[^a-zA-Z0-9]/g, '_')
  const jobs: EnqueueEmailJobInput[] = [
    {
      eventType: 'upcoming_flight_reminder_12h',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `upcoming-flight-12h:customer:${opts.bookingId}:${scheduleHash}`,
      payload: {
        kind: 'upcoming_flight_reminder_12h',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        pilotArn: opts.pilotArn,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        date: opts.date,
        time: opts.time,
        bookingType: opts.bookingType,
        hoursUntilFlight: opts.hoursUntilFlight,
        status: opts.status,
      },
    },
  ]

  if (ADMIN_EMAIL) {
    jobs.push({
      eventType: 'admin_upcoming_flight_alert_12h',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `upcoming-flight-12h:admin:${opts.bookingId}:${scheduleHash}`,
      payload: {
        kind: 'admin_upcoming_flight_alert_12h',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        pilotArn: opts.pilotArn,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        date: opts.date,
        time: opts.time,
        bookingType: opts.bookingType,
        hoursUntilFlight: opts.hoursUntilFlight,
        status: opts.status,
      },
    })
  }

  await enqueueEmailJobs(jobs)
}

export async function enqueuePostFlightRecordPendingEmails(opts: {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  bookingReference: string
  aircraft: string
  flightDate: string
  hoursOverdue: number
  status?: string
  isClarification?: boolean
  idempotencySuffix?: string
}) {
  const suffix = opts.idempotencySuffix ? `:${opts.idempotencySuffix}` : ''
  const jobs: EnqueueEmailJobInput[] = [
    {
      eventType: 'post_flight_record_pending_reminder',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `post-flight-pending:customer:${opts.bookingId}${suffix}`,
      payload: {
        kind: 'post_flight_record_pending_reminder',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        pilotArn: opts.pilotArn,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        flightDate: opts.flightDate,
        hoursOverdue: opts.hoursOverdue,
        status: opts.status,
        isClarification: opts.isClarification,
      },
    },
  ]

  if (ADMIN_EMAIL) {
    jobs.push({
      eventType: 'admin_post_flight_record_pending_alert',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `post-flight-pending:admin:${opts.bookingId}${suffix}`,
      payload: {
        kind: 'admin_post_flight_record_pending_alert',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        pilotArn: opts.pilotArn,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        flightDate: opts.flightDate,
        hoursOverdue: opts.hoursOverdue,
        status: opts.status,
        isClarification: opts.isClarification,
      },
    })
  }

  await enqueueEmailJobs(jobs)
}

export async function enqueueAdminFlightRecordPendingReviewEmail(opts: {
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  bookingReference: string
  aircraft: string
  flightDate: string
  submittedDate: string
  hoursSinceSubmission: number
  idempotencySuffix?: string
}) {
  if (!ADMIN_EMAIL) return
  const suffix = opts.idempotencySuffix ? `:${opts.idempotencySuffix}` : ''
  await enqueueEmailJobs([
    {
      eventType: 'admin_flight_record_pending_review_alert',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `admin-flight-record-review-pending:${opts.bookingId}${suffix}`,
      payload: {
        kind: 'admin_flight_record_pending_review_alert',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        pilotArn: opts.pilotArn,
        bookingReference: opts.bookingReference,
        aircraft: opts.aircraft,
        flightDate: opts.flightDate,
        submittedDate: opts.submittedDate,
        hoursSinceSubmission: opts.hoursSinceSubmission,
      },
    },
  ])
}

export async function enqueueAdminBankTransferPendingVerificationEmail(opts: {
  invoiceId: string
  bookingId?: string | null
  customerId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  invoiceNumber: string
  bookingRef?: string | null
  amountFormatted: string
  invoiceType: string
  submittedDate: string
  hoursSinceSubmission: number
  idempotencySuffix?: string
}) {
  if (!ADMIN_EMAIL) return
  const suffix = opts.idempotencySuffix ? `:${opts.idempotencySuffix}` : ''
  await enqueueEmailJobs([
    {
      eventType: 'admin_bank_transfer_pending_verification_alert',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `admin-bank-transfer-pending:${opts.invoiceId}${suffix}`,
      payload: {
        kind: 'admin_bank_transfer_pending_verification_alert',
        invoiceId: opts.invoiceId,
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        invoiceNumber: opts.invoiceNumber,
        bookingRef: opts.bookingRef,
        amountFormatted: opts.amountFormatted,
        invoiceType: opts.invoiceType,
        submittedDate: opts.submittedDate,
        hoursSinceSubmission: opts.hoursSinceSubmission,
      },
    },
  ])
}

export async function enqueueDocumentExpiryReminderEmail(opts: {
  recipientEmail: string
  userId: string
  documentId: string
  pilotName: string
  documentTypeLabel: string
  expiryDate: string
  daysUntilExpiry: number
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'document_expiry_reminder',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'document_expiry_reminder',
        userId: opts.userId,
        documentId: opts.documentId,
        pilotName: opts.pilotName,
        documentTypeLabel: opts.documentTypeLabel,
        expiryDate: opts.expiryDate,
        daysUntilExpiry: opts.daysUntilExpiry,
      },
    },
  ])
}

export async function enqueueAdminDocumentExpiryAlertEmail(opts: {
  recipientEmail: string
  userId: string
  documentId: string
  pilotName: string
  pilotEmail: string
  documentTypeLabel: string
  expiryDate: string
  daysUntilExpiry: number
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'admin_document_expiry_alert',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'admin_document_expiry_alert',
        userId: opts.userId,
        documentId: opts.documentId,
        pilotName: opts.pilotName,
        pilotEmail: opts.pilotEmail,
        documentTypeLabel: opts.documentTypeLabel,
        expiryDate: opts.expiryDate,
        daysUntilExpiry: opts.daysUntilExpiry,
      },
    },
  ])
}

export async function enqueueFlightRecordOverdueEmail(opts: {
  recipientEmail: string
  bookingId: string
  ref: string
  aircraft: string
  flightDate: string
  pilotName: string
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'flight_record_overdue_nudge',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'flight_record_overdue_nudge',
        bookingId: opts.bookingId,
        ref: opts.ref,
        aircraft: opts.aircraft,
        flightDate: opts.flightDate,
        pilotName: opts.pilotName,
      },
    },
  ])
}

export async function enqueueBlockTimePurchaseConfirmedEmail(opts: {
  recipientEmail: string
  purchaseId: string
  userId: string
  pilotFirstName: string
  packageName: string
  packageHours: number
  currentBalance: number
  ratePerHour: number
  expiryDate: string
  validityDays: number
  amountPaid: number
  invoiceNumber?: string | null
  pdfUrl?: string | null
  idempotencyKey?: string
}) {
  const key = opts.idempotencyKey || `block-time-purchase:${opts.purchaseId}`
  await enqueueEmailJobs([
    {
      eventType: 'block_time_purchase_confirmed',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: key,
      payload: {
        kind: 'block_time_purchase_confirmed',
        purchaseId: opts.purchaseId,
        userId: opts.userId,
        pilotFirstName: opts.pilotFirstName,
        packageName: opts.packageName,
        packageHours: opts.packageHours,
        currentBalance: opts.currentBalance,
        ratePerHour: opts.ratePerHour,
        expiryDate: opts.expiryDate,
        validityDays: opts.validityDays,
        amountPaid: opts.amountPaid,
        invoiceNumber: opts.invoiceNumber,
        pdfUrl: opts.pdfUrl,
      },
    },
  ])
}

export async function enqueueBlockTimeLowBalanceEmail(opts: {
  recipientEmail: string
  purchaseId: string
  userId: string
  pilotFirstName: string
  packageName: string
  hoursRemaining: number
  ratePerHour: number
  expiryDate: string
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'block_time_low_balance_reminder',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'block_time_low_balance_reminder',
        purchaseId: opts.purchaseId,
        userId: opts.userId,
        pilotFirstName: opts.pilotFirstName,
        packageName: opts.packageName,
        hoursRemaining: opts.hoursRemaining,
        ratePerHour: opts.ratePerHour,
        expiryDate: opts.expiryDate,
      },
    },
  ])
}

export async function enqueueBlockTimeExpiryReminderEmail(opts: {
  recipientEmail: string
  purchaseId: string
  userId: string
  pilotFirstName: string
  packageName: string
  hoursRemaining: number
  expiryDate: string
  daysUntilExpiry: number
  ratePerHour: number
  validityPeriodLabel: string
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'block_time_expiry_reminder',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'block_time_expiry_reminder',
        purchaseId: opts.purchaseId,
        userId: opts.userId,
        pilotFirstName: opts.pilotFirstName,
        packageName: opts.packageName,
        hoursRemaining: opts.hoursRemaining,
        expiryDate: opts.expiryDate,
        daysUntilExpiry: opts.daysUntilExpiry,
        ratePerHour: opts.ratePerHour,
        validityPeriodLabel: opts.validityPeriodLabel,
      },
    },
  ])
}

export async function enqueueAdminWeeklyDigestEmail(opts: {
  recipientEmail: string
  reportingPeriodLabel: string
  startDateStr: string
  endDateStr: string
  totalFlights: number
  checkoutFlightsCount: number
  rentalFlightsCount: number
  flights: WeeklyDigestFlightItem[]
  totalNewCustomers: number
  customers: WeeklyDigestCustomerItem[]
  idempotencyKey?: string
}) {
  const key = opts.idempotencyKey || `admin-weekly-digest:${opts.startDateStr}:${opts.endDateStr}`
  await enqueueEmailJobs([
    {
      eventType: 'admin_weekly_operations_digest',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: key,
      payload: {
        kind: 'admin_weekly_operations_digest',
        reportingPeriodLabel: opts.reportingPeriodLabel,
        startDateStr: opts.startDateStr,
        endDateStr: opts.endDateStr,
        totalFlights: opts.totalFlights,
        checkoutFlightsCount: opts.checkoutFlightsCount,
        rentalFlightsCount: opts.rentalFlightsCount,
        flights: opts.flights,
        totalNewCustomers: opts.totalNewCustomers,
        customers: opts.customers,
      },
    },
  ])
}

export async function enqueueAdminNewUserInactivityAlertEmail(opts: {
  recipientEmail: string
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone: string | null
  pilotArn: string | null
  registeredDate: string
  documentStatus: string
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'admin_new_user_inactivity_alert',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'admin_new_user_inactivity_alert',
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        pilotArn: opts.pilotArn,
        registeredDate: opts.registeredDate,
        documentStatus: opts.documentStatus,
      },
    },
  ])
}

export async function enqueueUnpaidInvoiceCustomerEmail(opts: {
  recipientEmail: string
  invoiceId: string
  pilotName: string
  invoiceNumber: string
  amountFormatted: string
  invoiceType: string
  bookingRef?: string | null
  invoiceUrl: string
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'unpaid_invoice_customer_reminder',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'unpaid_invoice_customer_reminder',
        invoiceId: opts.invoiceId,
        pilotName: opts.pilotName,
        invoiceNumber: opts.invoiceNumber,
        amountFormatted: opts.amountFormatted,
        invoiceType: opts.invoiceType,
        bookingRef: opts.bookingRef,
        invoiceUrl: opts.invoiceUrl,
      },
    },
  ])
}

export async function enqueueAdminUnpaidInvoiceAlertEmail(opts: {
  recipientEmail: string
  invoiceId: string
  customerId: string
  customerName: string
  customerEmail: string
  invoiceNumber: string
  amountFormatted: string
  invoiceType: string
  createdDate: string
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'admin_unpaid_invoice_alert',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'admin_unpaid_invoice_alert',
        invoiceId: opts.invoiceId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        invoiceNumber: opts.invoiceNumber,
        amountFormatted: opts.amountFormatted,
        invoiceType: opts.invoiceType,
        createdDate: opts.createdDate,
      },
    },
  ])
}

export async function enqueueCustomerWelcomeEmails(opts: {
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  firstName?: string
}) {
  const jobs: EnqueueEmailJobInput[] = [
    {
      eventType: 'customer_welcome_registered',
      recipientEmail: opts.customerEmail,
      idempotencyKey: `welcome-registered:customer:${opts.customerId}`,
      payload: {
        kind: 'customer_welcome_registered',
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        firstName: opts.firstName,
      },
    },
  ]

  if (ADMIN_EMAIL) {
    jobs.push({
      eventType: 'admin_new_customer_registered',
      recipientEmail: ADMIN_EMAIL,
      idempotencyKey: `welcome-registered:admin:${opts.customerId}`,
      payload: {
        kind: 'admin_new_customer_registered',
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        registeredAt: new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
      },
    })
  }

  await enqueueEmailJobs(jobs)
}

export async function enqueueOnboardingNoDocsReminderEmail(opts: {
  recipientEmail: string
  customerId: string
  pilotName: string
  cadenceStep: number
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'onboarding_no_docs_reminder',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'onboarding_no_docs_reminder',
        customerId: opts.customerId,
        pilotName: opts.pilotName,
        cadenceStep: opts.cadenceStep,
      },
    },
  ])
}

export async function enqueueOnboardingIncompleteDocsReminderEmail(opts: {
  recipientEmail: string
  customerId: string
  pilotName: string
  missingDocumentLabels: string[]
  cadenceStep: number
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'onboarding_incomplete_docs_reminder',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'onboarding_incomplete_docs_reminder',
        customerId: opts.customerId,
        pilotName: opts.pilotName,
        missingDocumentLabels: opts.missingDocumentLabels,
        cadenceStep: opts.cadenceStep,
      },
    },
  ])
}

export async function enqueueOnboardingRequestCheckoutReminderEmail(opts: {
  recipientEmail: string
  customerId: string
  pilotName: string
  cadenceStep: number
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'onboarding_request_checkout_reminder',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'onboarding_request_checkout_reminder',
        customerId: opts.customerId,
        pilotName: opts.pilotName,
        cadenceStep: opts.cadenceStep,
      },
    },
  ])
}

export async function enqueueOnboardingActionRequiredReminderEmail(opts: {
  recipientEmail: string
  customerId: string
  pilotName: string
  actionReason: string
  actionUrl?: string
  cadenceStep: number
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'onboarding_action_required_reminder',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'onboarding_action_required_reminder',
        customerId: opts.customerId,
        pilotName: opts.pilotName,
        actionReason: opts.actionReason,
        actionUrl: opts.actionUrl,
        cadenceStep: opts.cadenceStep,
      },
    },
  ])
}

export async function enqueueAdminPendingCheckoutReminderEmail(opts: {
  recipientEmail: string
  bookingId: string
  customerId: string
  customerName: string
  customerEmail: string
  requestedTime: string
  hoursPending: number
  cadenceStep: number
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'admin_pending_checkout_reminder',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'admin_pending_checkout_reminder',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        requestedTime: opts.requestedTime,
        hoursPending: opts.hoursPending,
        cadenceStep: opts.cadenceStep,
      },
    },
  ])
}

export async function enqueueAdminCheckoutUrgentReview24hEmail(opts: {
  recipientEmail: string
  bookingId: string
  customerId?: string
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  requestedTime: string
  bookingReference?: string | null
  hoursUntilFlight: number
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'admin_checkout_urgent_review_24h',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'admin_checkout_urgent_review_24h',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        customerPhone: opts.customerPhone,
        requestedTime: opts.requestedTime,
        bookingReference: opts.bookingReference,
        hoursUntilFlight: opts.hoursUntilFlight,
      },
    },
  ])
}

export async function enqueueAdminCheckoutOutcomePendingAlertEmail(opts: {
  recipientEmail: string
  bookingId: string
  customerId?: string | null
  customerName: string
  customerEmail: string
  bookingReference?: string | null
  flightDate: string
  aircraft?: string | null
  hoursSinceFlight: number
  idempotencyKey: string
}) {
  await enqueueEmailJobs([
    {
      eventType: 'admin_checkout_outcome_pending_alert',
      recipientEmail: opts.recipientEmail,
      idempotencyKey: opts.idempotencyKey,
      payload: {
        kind: 'admin_checkout_outcome_pending_alert',
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        bookingReference: opts.bookingReference,
        flightDate: opts.flightDate,
        aircraft: opts.aircraft,
        hoursSinceFlight: opts.hoursSinceFlight,
      },
    },
  ])
}

export async function enqueueEmailJobs(jobs: EnqueueEmailJobInput[]) {
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

  // In local development or when AUTO_DRAIN_OUTBOX is set, immediately drain the outbox
  // so emails are sent during local testing without requiring an external cron trigger.
  if (process.env.NODE_ENV !== 'production' || process.env.AUTO_DRAIN_OUTBOX === 'true') {
    import('@/lib/jobs/run-job')
      .then(({ runJob }) => {
        runJob('email-outbox').catch((err) => {
          console.error('[email-outbox-local-drain] Error during local drain:', err)
        })
      })
      .catch((err) => {
        console.error('[email-outbox-local-drain] Failed to import runJob:', err)
      })
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
    const template = checkoutRequestReceivedEmail({
      customerName: payload.customerName,
      bookingReference: payload.bookingReference,
      requestedTime: payload.requestedTime,
      bookingId: payload.bookingId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'checkout_request_submitted',
      entityType: 'checkout',
      entityId: payload.bookingId,
      metadata: { bookingReference: payload.bookingReference },
    }
  }

  if (job.event_type === 'admin_new_checkout_request' && payload.kind === 'admin_new_checkout_request') {
    const template = adminNewCheckoutRequestEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      customerPhone: payload.customerPhone,
      pilotArn: payload.pilotArn,
      requestedTime: payload.requestedTime,
      bookingReference: payload.bookingReference,
      bookingId: payload.bookingId,
      customerId: payload.customerId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_new_checkout_request',
      entityType: 'checkout',
      entityId: payload.bookingId,
      metadata: { customerEmail: payload.customerEmail, customerId: payload.customerId },
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
    const template =
      job.event_type === 'checkout_reschedule_requested'
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

  if (job.event_type === 'flight_reminder_day_before' && payload.kind === 'flight_reminder_day_before') {
    const template = dayBeforeFlightReminderEmail({
      pilotName: payload.pilotName,
      bookingRef: payload.ref,
      aircraft: payload.aircraft,
      date: payload.date,
      time: payload.time,
      bookingType: payload.bookingType,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'flight_reminder_day_before',
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { ref: payload.ref },
    }
  }

  if (job.event_type === 'document_expiry_reminder' && payload.kind === 'document_expiry_reminder') {
    const template = documentExpiryReminderEmail({
      pilotName: payload.pilotName,
      documentTypeLabel: payload.documentTypeLabel,
      expiryDate: payload.expiryDate,
      daysUntilExpiry: payload.daysUntilExpiry,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'document_expiry_reminder',
      entityType: 'user_document',
      entityId: payload.documentId,
      metadata: { userId: payload.userId, daysUntilExpiry: payload.daysUntilExpiry },
    }
  }

  if (job.event_type === 'admin_document_expiry_alert' && payload.kind === 'admin_document_expiry_alert') {
    const template = adminDocumentExpiryAlertEmail({
      pilotName: payload.pilotName,
      pilotEmail: payload.pilotEmail,
      documentTypeLabel: payload.documentTypeLabel,
      expiryDate: payload.expiryDate,
      daysUntilExpiry: payload.daysUntilExpiry,
      customerId: payload.userId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_document_expiry_alert',
      entityType: 'user_document',
      entityId: payload.documentId,
      metadata: { userId: payload.userId, daysUntilExpiry: payload.daysUntilExpiry },
    }
  }

  if (job.event_type === 'flight_record_overdue_nudge' && payload.kind === 'flight_record_overdue_nudge') {
    const template = flightRecordOverdueEmail({
      pilotName: payload.pilotName,
      bookingRef: payload.ref,
      aircraft: payload.aircraft,
      flightDate: payload.flightDate,
      bookingId: payload.bookingId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'flight_record_overdue_nudge',
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { ref: payload.ref },
    }
  }

  if (job.event_type === 'block_time_purchase_confirmed' && payload.kind === 'block_time_purchase_confirmed') {
    const template = blockTimePurchaseConfirmedEmail({
      pilotFirstName: payload.pilotFirstName,
      packageName: payload.packageName,
      packageHours: payload.packageHours,
      currentBalance: payload.currentBalance,
      ratePerHour: payload.ratePerHour,
      expiryDate: payload.expiryDate,
      validityDays: payload.validityDays,
      amountPaid: payload.amountPaid,
      invoiceNumber: payload.invoiceNumber,
      pdfUrl: payload.pdfUrl,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'block_time_purchase_confirmed',
      entityType: 'block_time_purchase',
      entityId: payload.purchaseId,
      metadata: { userId: payload.userId, invoiceNumber: payload.invoiceNumber },
    }
  }

  if (job.event_type === 'block_time_low_balance_reminder' && payload.kind === 'block_time_low_balance_reminder') {
    const template = blockTimeLowBalanceEmail({
      pilotFirstName: payload.pilotFirstName,
      packageName: payload.packageName,
      hoursRemaining: payload.hoursRemaining,
      ratePerHour: payload.ratePerHour,
      expiryDate: payload.expiryDate,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'block_time_low_balance_reminder',
      entityType: 'block_time_purchase',
      entityId: payload.purchaseId,
      metadata: { userId: payload.userId, hoursRemaining: payload.hoursRemaining },
    }
  }

  if (job.event_type === 'block_time_expiry_reminder' && payload.kind === 'block_time_expiry_reminder') {
    const template = blockTimeExpiryReminderEmail(
      payload.pilotFirstName,
      payload.packageName,
      payload.hoursRemaining,
      payload.expiryDate,
      payload.daysUntilExpiry,
      payload.ratePerHour,
      payload.validityPeriodLabel,
    )
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'block_time_expiry_reminder',
      entityType: 'block_time_purchase',
      entityId: payload.purchaseId,
      metadata: { userId: payload.userId, daysUntilExpiry: payload.daysUntilExpiry },
    }
  }

  if (job.event_type === 'admin_weekly_operations_digest' && payload.kind === 'admin_weekly_operations_digest') {
    const template = adminWeeklyOperationsDigestEmail({
      reportingPeriodLabel: payload.reportingPeriodLabel,
      startDateStr: payload.startDateStr,
      endDateStr: payload.endDateStr,
      totalFlights: payload.totalFlights,
      checkoutFlightsCount: payload.checkoutFlightsCount,
      rentalFlightsCount: payload.rentalFlightsCount,
      flights: payload.flights,
      totalNewCustomers: payload.totalNewCustomers,
      customers: payload.customers,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_weekly_operations_digest',
      entityType: 'operations_digest',
      entityId: `${payload.startDateStr}_${payload.endDateStr}`,
      metadata: { totalFlights: payload.totalFlights, totalNewCustomers: payload.totalNewCustomers },
    }
  }

  if (job.event_type === 'admin_new_user_inactivity_alert' && payload.kind === 'admin_new_user_inactivity_alert') {
    const template = adminNewUserInactivityAlertEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      customerPhone: payload.customerPhone,
      pilotArn: payload.pilotArn,
      registeredDate: payload.registeredDate,
      documentStatus: payload.documentStatus,
      customerId: payload.customerId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_new_user_inactivity_alert',
      entityType: 'user',
      entityId: payload.customerId,
      metadata: { customerEmail: payload.customerEmail },
    }
  }

  if (job.event_type === 'unpaid_invoice_customer_reminder' && payload.kind === 'unpaid_invoice_customer_reminder') {
    const template = unpaidInvoiceCustomerEmail({
      pilotName: payload.pilotName,
      invoiceNumber: payload.invoiceNumber,
      amountFormatted: payload.amountFormatted,
      invoiceType: payload.invoiceType,
      bookingRef: payload.bookingRef,
      invoiceUrl: payload.invoiceUrl,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'unpaid_invoice_customer_reminder',
      entityType: 'invoice',
      entityId: payload.invoiceId,
      metadata: { invoiceNumber: payload.invoiceNumber },
    }
  }

  if (job.event_type === 'admin_unpaid_invoice_alert' && payload.kind === 'admin_unpaid_invoice_alert') {
    const template = unpaidInvoiceAdminAlertEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      invoiceNumber: payload.invoiceNumber,
      amountFormatted: payload.amountFormatted,
      invoiceType: payload.invoiceType,
      createdDate: payload.createdDate,
      customerId: payload.customerId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_unpaid_invoice_alert',
      entityType: 'invoice',
      entityId: payload.invoiceId,
      metadata: { customerEmail: payload.customerEmail, invoiceNumber: payload.invoiceNumber },
    }
  }

  if (job.event_type === 'customer_welcome_registered' && payload.kind === 'customer_welcome_registered') {
    const template = customerWelcomeRegisteredEmail({
      customerName: payload.customerName,
      firstName: payload.firstName,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'customer_welcome_registered',
      entityType: 'user',
      entityId: payload.customerId,
      metadata: { customerEmail: payload.customerEmail },
    }
  }

  if (job.event_type === 'admin_new_customer_registered' && payload.kind === 'admin_new_customer_registered') {
    const template = adminNewCustomerRegisteredEmail({
      customerId: payload.customerId,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      customerPhone: payload.customerPhone,
      registeredAt: payload.registeredAt,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_new_customer_registered',
      entityType: 'user',
      entityId: payload.customerId,
      metadata: { customerEmail: payload.customerEmail },
    }
  }

  if (job.event_type === 'onboarding_no_docs_reminder' && payload.kind === 'onboarding_no_docs_reminder') {
    const template = onboardingNoDocsReminderEmail({
      pilotName: payload.pilotName,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'onboarding_no_docs_reminder',
      entityType: 'user',
      entityId: payload.customerId,
      metadata: { cadenceStep: payload.cadenceStep },
    }
  }

  if (job.event_type === 'onboarding_incomplete_docs_reminder' && payload.kind === 'onboarding_incomplete_docs_reminder') {
    const template = onboardingIncompleteDocsReminderEmail({
      pilotName: payload.pilotName,
      missingDocumentLabels: payload.missingDocumentLabels,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'onboarding_incomplete_docs_reminder',
      entityType: 'user',
      entityId: payload.customerId,
      metadata: { cadenceStep: payload.cadenceStep },
    }
  }

  if (job.event_type === 'onboarding_request_checkout_reminder' && payload.kind === 'onboarding_request_checkout_reminder') {
    const template = onboardingRequestCheckoutReminderEmail({
      pilotName: payload.pilotName,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'onboarding_request_checkout_reminder',
      entityType: 'user',
      entityId: payload.customerId,
      metadata: { cadenceStep: payload.cadenceStep },
    }
  }

  if (job.event_type === 'onboarding_action_required_reminder' && payload.kind === 'onboarding_action_required_reminder') {
    const template = onboardingActionRequiredReminderEmail({
      pilotName: payload.pilotName,
      actionReason: payload.actionReason,
      actionUrl: payload.actionUrl,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'onboarding_action_required_reminder',
      entityType: 'user',
      entityId: payload.customerId,
      metadata: { cadenceStep: payload.cadenceStep },
    }
  }

  if (job.event_type === 'admin_pending_checkout_reminder' && payload.kind === 'admin_pending_checkout_reminder') {
    const template = adminPendingCheckoutReminderEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      bookingId: payload.bookingId,
      requestedTime: payload.requestedTime,
      hoursPending: payload.hoursPending,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_pending_checkout_reminder',
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId, cadenceStep: payload.cadenceStep },
    }
  }

  if (job.event_type === 'admin_checkout_urgent_review_24h' && payload.kind === 'admin_checkout_urgent_review_24h') {
    const template = adminCheckoutUrgentReview24hEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      customerPhone: payload.customerPhone,
      requestedTime: payload.requestedTime,
      bookingReference: payload.bookingReference,
      bookingId: payload.bookingId,
      hoursUntilFlight: payload.hoursUntilFlight,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_checkout_urgent_review_24h',
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId },
    }
  }

  if (job.event_type === 'admin_checkout_outcome_pending_alert' && payload.kind === 'admin_checkout_outcome_pending_alert') {
    const template = adminCheckoutOutcomePendingAlertEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      bookingReference: payload.bookingReference,
      flightDate: payload.flightDate,
      aircraft: payload.aircraft,
      hoursSinceFlight: payload.hoursSinceFlight,
      bookingId: payload.bookingId,
      customerId: payload.customerId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_checkout_outcome_pending_alert',
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId },
    }
  }

  if (
    (job.event_type === 'checkout_cancelled_by_customer' && payload.kind === 'checkout_cancelled_by_customer') ||
    (job.event_type === 'checkout_cancelled_by_admin' && payload.kind === 'checkout_cancelled_by_admin')
  ) {
    const template = customerCheckoutCancelledEmail({
      customerName: payload.customerName,
      bookingReference: payload.bookingReference,
      scheduledTime: payload.scheduledTime,
      reason: payload.reason,
      cancelledBy: payload.cancelledBy,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: job.event_type,
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId },
    }
  }

  if (job.event_type === 'admin_checkout_cancelled_by_customer' && payload.kind === 'admin_checkout_cancelled_by_customer') {
    const template = adminCheckoutCancelledEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      bookingReference: payload.bookingReference,
      scheduledTime: payload.scheduledTime,
      reason: payload.reason,
      bookingId: payload.bookingId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_checkout_cancelled_by_customer',
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId },
    }
  }

  if (job.event_type === 'checkout_time_proposed' && payload.kind === 'checkout_time_proposed') {
    const template = customerCheckoutTimeProposedEmail({
      customerName: payload.customerName,
      bookingReference: payload.bookingReference,
      originalTime: payload.originalTime,
      proposedTime: payload.proposedTime,
      aircraft: payload.aircraft,
      bookingId: payload.bookingId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'checkout_time_proposed',
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId },
    }
  }

  if (
    (job.event_type === 'admin_checkout_proposal_accepted' && payload.kind === 'admin_checkout_proposal_accepted') ||
    (job.event_type === 'admin_checkout_proposal_declined' && payload.kind === 'admin_checkout_proposal_declined')
  ) {
    const template = adminCheckoutProposalDecisionEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      decision: payload.decision,
      bookingReference: payload.bookingReference,
      proposedTime: payload.proposedTime,
      declineReason: payload.declineReason,
      bookingId: payload.bookingId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: job.event_type,
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId },
    }
  }

  if (
    (job.event_type === 'booking_confirmed' || job.event_type === 'admin_new_booking_confirmed') &&
    payload.kind === 'rental_booking_confirmed'
  ) {
    const template =
      job.event_type === 'booking_confirmed'
        ? rentalBookingConfirmedCustomerEmail({
            customerName: payload.customerName,
            bookingReference: payload.bookingReference,
            aircraft: payload.aircraft,
            date: payload.date,
            time: payload.time,
            bookingId: payload.bookingId,
            isMultiDay: payload.isMultiDay,
            startDate: payload.startDate,
            endDate: payload.endDate,
            startTime: payload.startTime,
            endTime: payload.endTime,
            daysCount: payload.daysCount,
          })
        : adminRentalBookingConfirmedEmail({
            customerName: payload.customerName,
            customerEmail: payload.customerEmail,
            customerPhone: payload.customerPhone,
            pilotArn: payload.pilotArn,
            bookingReference: payload.bookingReference,
            aircraft: payload.aircraft,
            date: payload.date,
            time: payload.time,
            bookingId: payload.bookingId,
            customerId: payload.customerId,
            isMultiDay: payload.isMultiDay,
            startDate: payload.startDate,
            endDate: payload.endDate,
            startTime: payload.startTime,
            endTime: payload.endTime,
            daysCount: payload.daysCount,
          })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: job.event_type,
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId, bookingReference: payload.bookingReference },
    }
  }

  if (
    (job.event_type === 'booking_confirmed' || job.event_type === 'admin_new_booking_confirmed') &&
    payload.kind === 'booking_confirmed'
  ) {
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
      eventType: job.event_type,
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { ref: payload.ref },
    }
  }

  if (
    (job.event_type === 'booking_rescheduled' || job.event_type === 'admin_booking_rescheduled') &&
    payload.kind === 'rental_booking_rescheduled'
  ) {
    const template =
      job.event_type === 'booking_rescheduled'
        ? rentalBookingRescheduledCustomerEmail({
            customerName: payload.customerName,
            bookingReference: payload.bookingReference,
            aircraft: payload.aircraft,
            originalTime: payload.originalTime,
            newTime: payload.newTime,
            bookingId: payload.bookingId,
          })
        : adminRentalBookingRescheduledEmail({
            customerName: payload.customerName,
            customerEmail: payload.customerEmail,
            bookingReference: payload.bookingReference,
            aircraft: payload.aircraft,
            originalTime: payload.originalTime,
            newTime: payload.newTime,
            bookingId: payload.bookingId,
            rescheduledBy: payload.rescheduledBy,
          })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: job.event_type,
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId, bookingReference: payload.bookingReference },
    }
  }

  if (
    (job.event_type === 'booking_cancelled' || job.event_type === 'admin_booking_cancelled') &&
    payload.kind === 'rental_booking_cancelled'
  ) {
    const template =
      job.event_type === 'booking_cancelled'
        ? rentalBookingCancelledCustomerEmail({
            customerName: payload.customerName,
            bookingReference: payload.bookingReference,
            aircraft: payload.aircraft,
            scheduledTime: payload.scheduledTime,
            cancelledBy: payload.cancelledBy,
            reason: payload.reason,
            bookingId: payload.bookingId,
          })
        : adminRentalBookingCancelledEmail({
            customerName: payload.customerName,
            customerEmail: payload.customerEmail,
            customerPhone: payload.customerPhone,
            bookingReference: payload.bookingReference,
            aircraft: payload.aircraft,
            scheduledTime: payload.scheduledTime,
            cancelledBy: payload.cancelledBy,
            reason: payload.reason,
            bookingId: payload.bookingId,
          })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: job.event_type,
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId, bookingReference: payload.bookingReference },
    }
  }

  if (
    (job.event_type === 'upcoming_flight_reminder_48h' && payload.kind === 'upcoming_flight_reminder_48h') ||
    (job.event_type === 'upcoming_flight_reminder_12h' && payload.kind === 'upcoming_flight_reminder_12h')
  ) {
    const template = upcomingFlightReminderCustomerEmail({
      pilotName: payload.customerName,
      bookingRef: payload.bookingReference,
      aircraft: payload.aircraft,
      date: payload.date,
      time: payload.time,
      bookingType: payload.bookingType,
      hoursUntilFlight: payload.hoursUntilFlight,
      bookingId: payload.bookingId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: job.event_type,
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId, bookingReference: payload.bookingReference },
    }
  }

  if (
    (job.event_type === 'admin_upcoming_flight_alert_48h' && payload.kind === 'admin_upcoming_flight_alert_48h') ||
    (job.event_type === 'admin_upcoming_flight_alert_12h' && payload.kind === 'admin_upcoming_flight_alert_12h')
  ) {
    const template = adminUpcomingFlightReminderEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      customerPhone: payload.customerPhone,
      pilotArn: payload.pilotArn,
      bookingRef: payload.bookingReference,
      aircraft: payload.aircraft,
      date: payload.date,
      time: payload.time,
      bookingType: payload.bookingType,
      hoursUntilFlight: payload.hoursUntilFlight,
      bookingId: payload.bookingId,
      status: payload.status,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: job.event_type,
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId, bookingReference: payload.bookingReference },
    }
  }

  if (job.event_type === 'post_flight_record_pending_reminder' && payload.kind === 'post_flight_record_pending_reminder') {
    const template = postFlightRecordPendingCustomerReminderEmail({
      pilotName: payload.customerName,
      bookingRef: payload.bookingReference,
      aircraft: payload.aircraft,
      flightDate: payload.flightDate,
      hoursOverdue: payload.hoursOverdue,
      bookingId: payload.bookingId,
      isClarification: payload.isClarification,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'post_flight_record_pending_reminder',
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId, bookingReference: payload.bookingReference },
    }
  }

  if (job.event_type === 'admin_post_flight_record_pending_alert' && payload.kind === 'admin_post_flight_record_pending_alert') {
    const template = postFlightRecordPendingAdminReminderEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      customerPhone: payload.customerPhone,
      pilotArn: payload.pilotArn,
      bookingRef: payload.bookingReference,
      aircraft: payload.aircraft,
      flightDate: payload.flightDate,
      hoursOverdue: payload.hoursOverdue,
      bookingId: payload.bookingId,
      status: payload.status,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_post_flight_record_pending_alert',
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId, bookingReference: payload.bookingReference },
    }
  }

  if (job.event_type === 'admin_flight_record_pending_review_alert' && payload.kind === 'admin_flight_record_pending_review_alert') {
    const template = adminFlightRecordPendingReviewEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      customerPhone: payload.customerPhone,
      pilotArn: payload.pilotArn,
      bookingRef: payload.bookingReference,
      aircraft: payload.aircraft,
      flightDate: payload.flightDate,
      submittedDate: payload.submittedDate,
      hoursSinceSubmission: payload.hoursSinceSubmission,
      bookingId: payload.bookingId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_flight_record_pending_review_alert',
      entityType: 'booking',
      entityId: payload.bookingId,
      metadata: { customerId: payload.customerId, bookingReference: payload.bookingReference },
    }
  }

  if (job.event_type === 'admin_bank_transfer_pending_verification_alert' && payload.kind === 'admin_bank_transfer_pending_verification_alert') {
    const template = adminBankTransferProofPendingVerificationEmail({
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      customerPhone: payload.customerPhone,
      invoiceNumber: payload.invoiceNumber,
      bookingRef: payload.bookingRef,
      amountFormatted: payload.amountFormatted,
      invoiceType: payload.invoiceType,
      submittedDate: payload.submittedDate,
      hoursSinceSubmission: payload.hoursSinceSubmission,
      invoiceId: payload.invoiceId,
      bookingId: payload.bookingId,
    })
    return {
      to: job.recipient_email,
      subject: template.subject,
      html: template.html,
      eventType: 'admin_bank_transfer_pending_verification_alert',
      entityType: 'invoice',
      entityId: payload.invoiceId,
      metadata: { customerId: payload.customerId, invoiceNumber: payload.invoiceNumber },
    }
  }

  throw new Error(`UNSUPPORTED_EMAIL_OUTBOX_EVENT: ${job.event_type}`)
}

export function nextEmailRetryAt(attempts: number) {
  const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attempts - 1)))
  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
}

export function sanitizeErrorMessage(message: string) {
  return message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').slice(0, 240)
}
