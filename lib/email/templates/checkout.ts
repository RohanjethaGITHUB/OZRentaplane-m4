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

export function checkoutPaymentRequiredEmail(details: Record<string, string | number | null>) {
  return {
    subject: 'Payment required for your checkout flight',
    html: renderBaseTemplate({
      headline: 'Payment required for your checkout flight',
      message:
        'Payment is required before the checkout process can be completed. You can pay by card or bank transfer.',
      details: [{ label: 'Amount', value: details.amount }],
      ctaLabel: 'Pay Now',
      ctaUrl: `${appUrl}/dashboard/bookings/${details.bookingId ?? ''}`,
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
