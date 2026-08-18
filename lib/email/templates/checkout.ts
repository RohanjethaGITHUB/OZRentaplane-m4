import { renderBaseTemplate } from './base-template'
import { getAppUrl } from '../app-url'

const appUrl = getAppUrl()

export function checkoutRequestReceivedEmail() {
  return {
    subject: 'Checkout request received',
    html: renderBaseTemplate({
      headline: 'Checkout request received',
      message: 'Your checkout request has been received. The OZ Rent A Plane team will review it shortly.',
      ctaLabel: 'View Checkout Status',
      ctaUrl: `${appUrl}/dashboard/bookings`,
    }),
  }
}

export function adminNewCheckoutRequestEmail(details: Record<string, string | null>) {
  return {
    subject: 'New checkout request submitted',
    html: renderBaseTemplate({
      headline: 'New checkout request submitted',
      message: 'A customer submitted a new checkout request.',
      details: [
        { label: 'Customer', value: details.customerName },
        { label: 'Email', value: details.customerEmail },
        { label: 'Requested time', value: details.requestedTime },
      ],
      ctaLabel: 'Review Checkout Request',
      ctaUrl: `${appUrl}/admin/bookings/requests/${details.bookingId ?? ''}`,
    }),
  }
}

export function checkoutConfirmedEmail(details: Record<string, string | null>) {
  return {
    subject: 'Your checkout flight is confirmed',
    html: renderBaseTemplate({
      headline: 'Your checkout flight is confirmed',
      message: 'Please bring your pilot licence, medical, and photo ID for your checkout flight.',
      details: [
        { label: 'Date/time', value: details.time },
        { label: 'Aircraft', value: details.aircraft },
      ],
      ctaLabel: 'View Checkout Details',
      ctaUrl: `${appUrl}/dashboard/bookings`,
    }),
  }
}

export function checkoutRejectedEmail(details: Record<string, string | null>) {
  return {
    subject: 'Your checkout request was not approved',
    html: renderBaseTemplate({
      headline: 'Checkout request not approved',
      message: 'Your checkout request was not approved. Please review the reason below and contact the OZ Rent A Plane team if you have questions.',
      details: [
        { label: 'Reason', value: details.reason },
        { label: 'Aircraft', value: details.aircraft },
      ],
      ctaLabel: 'View Dashboard',
      ctaUrl: `${appUrl}/dashboard`,
    }),
  }
}

export function adminCheckoutRejectedEmail(details: Record<string, string | null>) {
  return {
    subject: 'Checkout request rejected',
    html: renderBaseTemplate({
      headline: 'Checkout request rejected',
      message: 'A checkout request was rejected by an administrator.',
      details: [
        { label: 'Customer', value: details.customerName },
        { label: 'Email', value: details.customerEmail },
        { label: 'Reason', value: details.reason },
        { label: 'Aircraft', value: details.aircraft },
      ],
      ctaLabel: 'Review Booking',
      ctaUrl: `${appUrl}/admin/bookings/requests/${details.bookingId ?? ''}`,
    }),
  }
}

function rescheduleDetails(details: Record<string, string | null>) {
  return [
    { label: 'Current time', value: details.originalTime },
    { label: 'Requested time', value: details.requestedTime },
    { label: 'Aircraft', value: details.aircraft },
  ]
}

export function checkoutRescheduleRequestedEmail(details: Record<string, string | null>) {
  return {
    subject: 'Checkout reschedule request received',
    html: renderBaseTemplate({
      headline: 'Reschedule request received',
      message: 'Your request to reschedule your checkout flight has been sent to the OZ Rent A Plane team for review.',
      details: rescheduleDetails(details),
      ctaLabel: 'View Checkout Status',
      ctaUrl: `${appUrl}/dashboard/bookings`,
    }),
  }
}

export function adminCheckoutRescheduleRequestedEmail(details: Record<string, string | null>) {
  return {
    subject: 'Checkout reschedule request submitted',
    html: renderBaseTemplate({
      headline: 'Checkout reschedule request submitted',
      message: 'A customer has requested a new checkout time.',
      details: [
        { label: 'Customer', value: details.customerName },
        { label: 'Email', value: details.customerEmail },
        ...rescheduleDetails(details),
      ],
      ctaLabel: 'Review Reschedule Request',
      ctaUrl: `${appUrl}/admin/bookings/requests/${details.bookingId ?? ''}`,
    }),
  }
}

export function checkoutRescheduleApprovedEmail(details: Record<string, string | null>) {
  return {
    subject: 'Your checkout reschedule was approved',
    html: renderBaseTemplate({
      headline: 'Checkout reschedule approved',
      message: 'Your checkout flight has been moved to the requested time.',
      details: [{ label: 'New time', value: details.requestedTime }, { label: 'Aircraft', value: details.aircraft }],
      ctaLabel: 'View Checkout Details',
      ctaUrl: `${appUrl}/dashboard/bookings`,
    }),
  }
}

export function adminCheckoutRescheduleApprovedEmail(details: Record<string, string | null>) {
  return {
    subject: 'Checkout reschedule approved',
    html: renderBaseTemplate({
      headline: 'Checkout reschedule approved',
      message: 'A checkout reschedule request was approved.',
      details: [
        { label: 'Customer', value: details.customerName },
        { label: 'Email', value: details.customerEmail },
        ...rescheduleDetails(details),
      ],
      ctaLabel: 'View Booking',
      ctaUrl: `${appUrl}/admin/bookings/requests/${details.bookingId ?? ''}`,
    }),
  }
}

export function checkoutRescheduleRejectedEmail(details: Record<string, string | null>) {
  return {
    subject: 'Your checkout reschedule was not approved',
    html: renderBaseTemplate({
      headline: 'Checkout reschedule not approved',
      message: 'Your requested new checkout time was not approved. Your original checkout schedule remains unchanged.',
      details: [{ label: 'Original time', value: details.originalTime }, { label: 'Aircraft', value: details.aircraft }],
      ctaLabel: 'View Checkout Details',
      ctaUrl: `${appUrl}/dashboard/bookings`,
    }),
  }
}

export function adminCheckoutRescheduleRejectedEmail(details: Record<string, string | null>) {
  return {
    subject: 'Checkout reschedule rejected',
    html: renderBaseTemplate({
      headline: 'Checkout reschedule rejected',
      message: 'A checkout reschedule request was rejected; the original schedule remains unchanged.',
      details: [
        { label: 'Customer', value: details.customerName },
        { label: 'Email', value: details.customerEmail },
        ...rescheduleDetails(details),
      ],
      ctaLabel: 'View Booking',
      ctaUrl: `${appUrl}/admin/bookings/requests/${details.bookingId ?? ''}`,
    }),
  }
}

export function checkoutPaymentRequiredEmail(details: Record<string, string | number | null>) {
  return {
    subject: 'Payment required for your checkout flight',
    html: renderBaseTemplate({
      headline: 'Payment required for your checkout flight',
      message:
        'Payment is required before the checkout process can be completed. You can pay by card or bank transfer.',
      details: [{ label: 'Amount', value: details.amount }],
      ctaLabel: 'Pay Now',
      ctaUrl: `${appUrl}/dashboard/bookings/${details.bookingId ?? ''}#payment`,
    }),
  }
}

export function bankTransferProofReceivedEmail() {
  return {
    subject: 'Payment proof received',
    html: renderBaseTemplate({
      headline: 'Payment proof received',
      message:
        'Your payment proof has been received. Your payment status is now Awaiting Payment Confirmation.',
      ctaLabel: 'View Payment Status',
      ctaUrl: `${appUrl}/dashboard/bookings`,
    }),
  }
}

export function adminBankTransferProofUploadedEmail(details: Record<string, string | null>) {
  return {
    subject: 'Bank transfer proof uploaded',
    html: renderBaseTemplate({
      headline: 'Bank transfer proof uploaded',
      message: 'A customer uploaded bank transfer proof for review.',
      details: [
        { label: 'Customer', value: details.customerName },
        { label: 'Email', value: details.customerEmail },
        { label: 'Amount', value: details.amount },
        { label: 'Invoice type', value: details.invoiceType },
      ],
      ctaLabel: 'Review Payment Proof',
      ctaUrl: `${appUrl}/admin/bookings/payments`,
    }),
  }
}

export function checkoutOutcomeEmail(subject: string, headline: string, message: string, ctaLabel: string) {
  return {
    subject,
    html: renderBaseTemplate({ headline, message, ctaLabel, ctaUrl: `${appUrl}/dashboard` }),
  }
}
