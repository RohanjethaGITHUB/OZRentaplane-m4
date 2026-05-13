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
