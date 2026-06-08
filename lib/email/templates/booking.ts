import { renderBaseTemplate } from './base-template'
import { getAppUrl } from '../app-url'

const appUrl = getAppUrl()

export function bookingConfirmedEmail(details: Record<string, string | null>) {
  return {
    subject: 'Your aircraft booking is confirmed',
    html: renderBaseTemplate({
      headline: 'Booking confirmed',
      message: 'Your aircraft booking is confirmed.',
      details: [
        { label: 'Aircraft', value: details.aircraft },
        { label: 'Date', value: details.date },
        { label: 'Start', value: details.start },
        { label: 'End', value: details.end },
      ],
      ctaLabel: 'View Booking',
      ctaUrl: `${appUrl}/dashboard/bookings`,
    }),
  }
}

export function bookingCancelledEmail(reason?: string) {
  return {
    subject: 'Your booking has been cancelled',
    html: renderBaseTemplate({
      headline: 'Your booking has been cancelled',
      message: reason || 'Your booking has been cancelled.',
      ctaLabel: 'View Bookings',
      ctaUrl: `${appUrl}/dashboard/bookings`,
    }),
  }
}

export function cancellationRequestedEmail() {
  return {
    subject: 'Cancellation request received',
    html: renderBaseTemplate({
      headline: 'Cancellation request received',
      message: 'Your cancellation request has been received and the OZ Rent A Plane team will review it.',
      ctaLabel: 'View Booking',
      ctaUrl: `${appUrl}/dashboard/bookings`,
    }),
  }
}

export function proxyBookingConfirmedEmail(details: Record<string, string | null>) {
  const bookingTypeLabel = details.bookingTypeLabel ?? 'Flight'
  const bookingTypeLower = details.bookingTypeLower ?? 'flight'

  return {
    subject: `Your ${bookingTypeLabel} Flight is Confirmed — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: `${bookingTypeLabel} flight confirmed`,
      message: `Hi ${details.customerName ?? 'Pilot'}, your ${bookingTypeLower} flight has been confirmed.`,
      details: [
        { label: 'Aircraft', value: details.aircraft },
        { label: 'Date', value: details.date },
        { label: 'Time', value: details.time },
      ],
      ctaLabel: 'View My Booking',
      ctaUrl: `${appUrl}/dashboard/bookings`,
    }),
  }
}

export function adminProxyBookingCreatedEmail(details: Record<string, string | null>) {
  const bookingTypeLabel = details.bookingTypeLabel ?? 'Standard'
  const bookingTypeLower = details.bookingTypeLower ?? 'standard'
  const templateDetails = [
    { label: 'Customer', value: details.customerName },
    { label: 'Customer email', value: details.customerEmail },
    { label: 'Aircraft', value: details.aircraft },
    { label: 'Date', value: details.date },
    { label: 'Time', value: details.time },
  ]

  if (details.adminNotes) {
    templateDetails.push({ label: 'Admin notes', value: details.adminNotes })
  }

  return {
    subject: `New Proxy Booking Created — ${details.customerName ?? 'Customer'} (${bookingTypeLabel})`,
    html: renderBaseTemplate({
      headline: 'New proxy booking created',
      message: `A ${bookingTypeLower} booking has been created by an admin on behalf of ${details.customerName ?? 'the customer'}.`,
      details: templateDetails,
      ctaLabel: 'View Customer Profile',
      ctaUrl: `${appUrl}/admin/users/${details.customerId ?? ''}`,
    }),
  }
}
