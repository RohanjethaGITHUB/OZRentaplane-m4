import { renderBaseTemplate } from './base-template'
import { getAppUrl } from '../app-url'

const appUrl = getAppUrl()

function invoicePdfExtraHtml(pdfUrl?: string) {
  if (!pdfUrl) return undefined
  return `<div style="margin: 0 0 20px; padding: 12px 14px; background: #f0f7ff; border: 1px solid #d0e5ff; border-radius: 6px;"><p style="margin: 0 0 8px; font-size: 14px; color: #1e3a8a; font-weight: bold;">Tax Invoice Available</p><p style="margin: 0 0 10px; font-size: 14px; color: #1e40af; line-height: 1.4;">Your official tax invoice PDF has been generated. You can download it directly using the link below:</p><a href="${pdfUrl}" target="_blank" style="display: inline-block; color: #1a4fd6; text-decoration: underline; font-size: 14px; font-weight: 600;">Download Tax Invoice (PDF)</a></div>`
}

export function paymentConfirmedEmail(message: string, pdfUrl?: string) {
  return {
    subject: 'Payment confirmed',
    html: renderBaseTemplate({
      headline: 'Payment confirmed',
      message,
      ctaLabel: 'View Dashboard',
      ctaUrl: `${appUrl}/dashboard`,
      extraHtml: invoicePdfExtraHtml(pdfUrl),
    }),
  }
}

/** Block-time flight finalised with an unpaid landing-fee invoice (send invoice path). */
export function landingFeeInvoiceReadyEmail(message: string, pdfUrl?: string) {
  return {
    subject: 'Landing fee invoice ready — payment required',
    html: renderBaseTemplate({
      headline: 'Landing fee invoice ready',
      message,
      ctaLabel: 'Pay Landing Fee',
      ctaUrl: `${appUrl}/dashboard/purchases`,
      extraHtml: invoicePdfExtraHtml(pdfUrl),
    }),
  }
}

/** Standard / rental flight invoice issued with payment required. */
export function standardBookingInvoicePaymentRequiredEmail(details: {
  bookingId: string
  bookingReference?: string | null
  customerName?: string | null
  flightDate?: string | null
  aircraft?: string | null
  amountDue: string
  invoiceNumber?: string | null
  pdfUrl?: string | null
  customMessage?: string | null
}) {
  return {
    subject: `Payment required for your flight${details.bookingReference ? ` (${details.bookingReference})` : ''} — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Payment required for your flight',
      message:
        details.customMessage ||
        'Your post-flight invoice is ready. Please review the flight details below and complete payment from your dashboard.',
      details: [
        ...(details.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        ...(details.aircraft ? [{ label: 'Aircraft', value: details.aircraft }] : []),
        ...(details.flightDate ? [{ label: 'Flight Date', value: details.flightDate }] : []),
        ...(details.invoiceNumber ? [{ label: 'Invoice Number', value: details.invoiceNumber }] : []),
        { label: 'Amount Due', value: details.amountDue },
      ],
      ctaLabel: 'Pay Now',
      ctaUrl: `${appUrl}/dashboard/bookings/${details.bookingId}#payment`,
      extraHtml: invoicePdfExtraHtml(details.pdfUrl ?? undefined),
    }),
  }
}

/** Flight payment settled / receipt email (mark-paid, manual settlement, or account credit). */
export function flightPaymentSettledEmail(details: {
  bookingId: string
  bookingReference?: string | null
  flightDate?: string | null
  aircraft?: string | null
  amountPaid: string
  paymentMethod?: string | null
  invoiceNumber?: string | null
  pdfUrl?: string | null
  message?: string | null
}) {
  const methodText = details.paymentMethod
    ? details.paymentMethod === 'cash'
      ? 'Cash'
      : details.paymentMethod === 'card_in_person'
      ? 'Card (In Person)'
      : details.paymentMethod === 'bank_transfer'
      ? 'Bank Transfer'
      : details.paymentMethod === 'credit'
      ? 'Account Credit'
      : details.paymentMethod
    : 'Direct Payment'

  return {
    subject: `Payment receipt for flight${details.bookingReference ? ` (${details.bookingReference})` : ''} — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Payment confirmed',
      message:
        details.message ||
        'Payment has been successfully recorded for your flight. Your booking is now completed.',
      details: [
        ...(details.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        ...(details.aircraft ? [{ label: 'Aircraft', value: details.aircraft }] : []),
        ...(details.flightDate ? [{ label: 'Flight Date', value: details.flightDate }] : []),
        ...(details.invoiceNumber ? [{ label: 'Invoice Number', value: details.invoiceNumber }] : []),
        { label: 'Amount Paid', value: details.amountPaid },
        { label: 'Payment Method', value: methodText },
      ],
      ctaLabel: 'View Booking',
      ctaUrl: `${appUrl}/dashboard/bookings/${details.bookingId}`,
      extraHtml: invoicePdfExtraHtml(details.pdfUrl ?? undefined),
    }),
  }
}

/** Flight payment waived email. */
export function flightPaymentWaivedEmail(details: {
  bookingId: string
  bookingReference?: string | null
  flightDate?: string | null
  aircraft?: string | null
  waiverReason?: string | null
  invoiceNumber?: string | null
  message?: string | null
}) {
  return {
    subject: `Flight invoice waived${details.bookingReference ? ` (${details.bookingReference})` : ''} — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Flight invoice waived',
      message:
        details.message ||
        'Your flight invoice has been waived by the OZ Rent A Plane admin team. Your booking is now marked completed.',
      details: [
        ...(details.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        ...(details.aircraft ? [{ label: 'Aircraft', value: details.aircraft }] : []),
        ...(details.flightDate ? [{ label: 'Flight Date', value: details.flightDate }] : []),
        ...(details.invoiceNumber ? [{ label: 'Invoice Number', value: details.invoiceNumber }] : []),
        { label: 'Payment Status', value: 'Waived ($0.00)' },
        ...(details.waiverReason ? [{ label: 'Waiver Reason', value: details.waiverReason }] : []),
      ],
      ctaLabel: 'View Booking',
      ctaUrl: `${appUrl}/dashboard/bookings/${details.bookingId}`,
    }),
  }
}
