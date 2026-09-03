import { renderBaseTemplate } from './base-template'
import { getAppUrl } from '../app-url'

const appUrl = getAppUrl()

// ─── Standard / Rental Booking: Confirmed ─────────────────────────────────────

export function rentalBookingConfirmedCustomerEmail(opts: {
  customerName: string
  bookingReference: string
  aircraft: string
  date: string
  time: string
  bookingId: string
  isMultiDay?: boolean
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  daysCount?: number
}) {
  const isMulti = opts.isMultiDay || (Boolean(opts.startDate) && Boolean(opts.endDate) && opts.startDate !== opts.endDate)

  const multiDayBadgeHtml = isMulti
    ? `<div style="margin: 0 0 16px;"><span style="display: inline-block; padding: 4px 12px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; border-radius: 9999px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">Multi-Day Booking</span></div>`
    : ''

  const detailsList = [
    { label: 'Booking Reference', value: opts.bookingReference },
    ...(isMulti ? [{ label: 'Booking Type', value: `Multi-Day Rental${opts.daysCount ? ` (${opts.daysCount} days)` : ''}` }] : []),
    { label: 'Aircraft', value: opts.aircraft },
    ...(isMulti
      ? [
          { label: 'Departure', value: `${opts.startDate ?? opts.date} at ${opts.startTime ?? ''}`.trim() },
          { label: 'Return / End', value: `${opts.endDate ?? ''} at ${opts.endTime ?? ''}`.trim() },
        ]
      : [
          { label: 'Flight Date', value: opts.date },
          { label: 'Scheduled Time', value: opts.time },
        ]),
    { label: 'Departure Base', value: 'Bankstown Airport (YSBK)' },
    { label: 'Status', value: 'Confirmed' },
  ]

  return {
    subject: `Aircraft Booking Confirmed (${opts.bookingReference})${isMulti ? ' [Multi-Day]' : ''} — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: isMulti ? 'Multi-Day Aircraft Booking Confirmed' : 'Aircraft Booking Confirmed',
      badgeHtml: multiDayBadgeHtml || undefined,
      message: `Hi ${opts.customerName}, your aircraft hire booking has been confirmed. Below are your flight reservation details:`,
      details: detailsList,
      extraHtml: `
        <div style="margin-top: 24px; padding: 16px; background-color: #f8fafc; border-left: 4px solid #0284c7; border-radius: 4px;">
          <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 14px; font-weight: 600;">Pre-Flight Reminders</h4>
          <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px; line-height: 1.6;">
            <li>Please arrive 15–20 minutes prior to departure for your daily inspection and pre-flight briefing.</li>
            <li>Ensure you carry your physical pilot licence, current medical certificate, and photo ID.</li>
            <li>Submit your flight readings promptly in the pilot portal upon return.</li>
          </ul>
        </div>
      `,
      ctaLabel: 'View My Booking',
      ctaUrl: `${appUrl}/dashboard/bookings/${opts.bookingId}`,
    }),
  }
}

export function adminRentalBookingConfirmedEmail(opts: {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  bookingReference: string
  aircraft: string
  date: string
  time: string
  bookingId: string
  customerId?: string | null
  isMultiDay?: boolean
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  daysCount?: number
}) {
  const isMulti = opts.isMultiDay || (Boolean(opts.startDate) && Boolean(opts.endDate) && opts.startDate !== opts.endDate)

  const multiDayBadgeHtml = isMulti
    ? `<div style="margin: 0 0 16px;"><span style="display: inline-block; padding: 4px 12px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; border-radius: 9999px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">Multi-Day Booking</span></div>`
    : ''

  const details = [
    { label: 'Customer', value: opts.customerName },
    { label: 'Email', value: opts.customerEmail },
  ]
  if (opts.customerPhone) {
    details.push({ label: 'Phone', value: opts.customerPhone })
  }
  if (opts.pilotArn) {
    details.push({ label: 'Pilot ARN', value: opts.pilotArn })
  }
  details.push(
    { label: 'Booking Ref', value: opts.bookingReference },
    ...(isMulti ? [{ label: 'Booking Type', value: `Multi-Day Rental${opts.daysCount ? ` (${opts.daysCount} days)` : ''}` }] : []),
    { label: 'Aircraft', value: opts.aircraft },
    ...(isMulti
      ? [
          { label: 'Departure', value: `${opts.startDate ?? opts.date} at ${opts.startTime ?? ''}`.trim() },
          { label: 'Return / End', value: `${opts.endDate ?? ''} at ${opts.endTime ?? ''}`.trim() },
        ]
      : [
          { label: 'Flight Date', value: opts.date },
          { label: 'Scheduled Time', value: opts.time },
        ]),
    { label: 'Status', value: 'Confirmed' },
  )

  return {
    subject: `New ${isMulti ? 'Multi-Day ' : ''}Rental Booking: ${opts.customerName} — ${opts.aircraft} (${opts.bookingReference})`,
    html: renderBaseTemplate({
      headline: isMulti ? 'New Multi-Day Rental Booking Confirmed' : 'New Rental Booking Confirmed',
      badgeHtml: multiDayBadgeHtml || undefined,
      message: `A new aircraft rental booking has been created and confirmed for ${opts.customerName}.`,
      details,
      ctaLabel: 'View Booking in Admin',
      ctaUrl: `${appUrl}/admin/bookings/requests/${opts.bookingId}`,
    }),
  }
}

// ─── Standard / Rental Booking: Rescheduled / Changed ─────────────────────────

export function rentalBookingRescheduledCustomerEmail(opts: {
  customerName: string
  bookingReference: string
  aircraft: string
  originalTime: string
  newTime: string
  bookingId: string
}) {
  return {
    subject: `Flight Booking Rescheduled (${opts.bookingReference}) — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Flight Booking Rescheduled',
      message: `Hi ${opts.customerName}, your aircraft booking (${opts.bookingReference}) has been successfully updated with your new flight schedule:`,
      details: [
        { label: 'Booking Reference', value: opts.bookingReference },
        { label: 'Aircraft', value: opts.aircraft },
        { label: 'Previous Schedule', value: opts.originalTime },
        { label: 'Updated Schedule', value: opts.newTime },
        { label: 'Status', value: 'Confirmed' },
      ],
      extraHtml: `
        <div style="margin-top: 20px; padding: 14px 16px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px;">
          <p style="margin: 0; color: #166534; font-size: 13px; font-weight: 500;">
            ✓ Your aircraft schedule block has been updated. Please ensure you arrive 15 minutes before your new departure time.
          </p>
        </div>
      `,
      ctaLabel: 'View Updated Booking',
      ctaUrl: `${appUrl}/dashboard/bookings/${opts.bookingId}`,
    }),
  }
}

export function adminRentalBookingRescheduledEmail(opts: {
  customerName: string
  customerEmail: string
  bookingReference: string
  aircraft: string
  originalTime: string
  newTime: string
  bookingId: string
  rescheduledBy: 'Customer' | 'Admin'
}) {
  return {
    subject: `Rental Booking Rescheduled: ${opts.customerName} (${opts.bookingReference})`,
    html: renderBaseTemplate({
      headline: 'Rental Booking Rescheduled',
      message: `The aircraft booking for ${opts.customerName} has been rescheduled by ${opts.rescheduledBy}:`,
      details: [
        { label: 'Customer', value: opts.customerName },
        { label: 'Email', value: opts.customerEmail },
        { label: 'Booking Ref', value: opts.bookingReference },
        { label: 'Aircraft', value: opts.aircraft },
        { label: 'Previous Schedule', value: opts.originalTime },
        { label: 'New Schedule', value: opts.newTime },
        { label: 'Rescheduled By', value: opts.rescheduledBy },
      ],
      ctaLabel: 'View Booking in Admin',
      ctaUrl: `${appUrl}/admin/bookings/requests/${opts.bookingId}`,
    }),
  }
}

// ─── Standard / Rental Booking: Cancelled ─────────────────────────────────────

export function rentalBookingCancelledCustomerEmail(opts: {
  customerName: string
  bookingReference: string
  aircraft: string
  scheduledTime?: string | null
  cancelledBy: 'Customer' | 'Admin'
  reason?: string | null
  bookingId: string
}) {
  const cancelledByLabel = opts.cancelledBy === 'Customer' ? 'You' : 'Operations team'
  const details = [
    { label: 'Booking Reference', value: opts.bookingReference },
    { label: 'Aircraft', value: opts.aircraft },
  ]
  if (opts.scheduledTime) {
    details.push({ label: 'Scheduled Time', value: opts.scheduledTime })
  }
  details.push(
    { label: 'Cancelled By', value: cancelledByLabel },
    { label: 'Reason', value: opts.reason || 'Flight booking cancelled' },
    { label: 'Status', value: 'Cancelled' },
  )

  return {
    subject: `Flight Booking Cancelled (${opts.bookingReference}) — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Flight Booking Cancelled',
      message: `Hi ${opts.customerName}, your aircraft booking (${opts.bookingReference}) has been cancelled.`,
      details,
      extraHtml: `
        <div style="margin-top: 20px; padding: 14px 16px; background-color: #f8fafc; border-left: 4px solid #64748b; border-radius: 4px;">
          <p style="margin: 0; color: #334155; font-size: 13px; line-height: 1.5;">
            Your aircraft reservation has been released. You are welcome to create a new flight booking at any time in the pilot portal.
          </p>
        </div>
      `,
      ctaLabel: 'Book a New Flight',
      ctaUrl: `${appUrl}/dashboard/bookings/new`,
    }),
  }
}

export function adminRentalBookingCancelledEmail(opts: {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  bookingReference: string
  aircraft: string
  scheduledTime?: string | null
  cancelledBy: 'Customer' | 'Admin'
  reason?: string | null
  bookingId: string
}) {
  const details = [
    { label: 'Customer', value: opts.customerName },
    { label: 'Email', value: opts.customerEmail },
  ]
  if (opts.customerPhone) {
    details.push({ label: 'Phone', value: opts.customerPhone })
  }
  details.push(
    { label: 'Booking Ref', value: opts.bookingReference },
    { label: 'Aircraft', value: opts.aircraft },
  )
  if (opts.scheduledTime) {
    details.push({ label: 'Flight Slot', value: opts.scheduledTime })
  }
  details.push(
    { label: 'Cancelled By', value: opts.cancelledBy },
    { label: 'Reason', value: opts.reason || 'Booking cancelled' },
    { label: 'Slot Status', value: 'Released to schedule' },
  )

  return {
    subject: `Rental Booking Cancelled: ${opts.customerName} (${opts.bookingReference})`,
    html: renderBaseTemplate({
      headline: 'Rental Booking Cancelled',
      message: `An aircraft rental booking has been cancelled by ${opts.cancelledBy}:`,
      details,
      ctaLabel: 'View Admin Cancellations',
      ctaUrl: `${appUrl}/admin/bookings/cancellations`,
    }),
  }
}

// ─── Legacy & Clarification wrappers (Backwards Compatibility) ───────────────

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

export function customerFlightRecordSubmittedEmail(opts: {
  customerName: string
  bookingReference: string
  aircraft: string
  bookingDate: string
  bookingId: string
}) {
  return {
    subject: `Flight Record Submitted (${opts.bookingReference}) — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Flight Record Submitted',
      message: `Hi ${opts.customerName}, your flight record and aircraft readings have been successfully submitted for review.`,
      details: [
        { label: 'Booking Reference', value: opts.bookingReference },
        { label: 'Aircraft', value: opts.aircraft },
        { label: 'Flight Date', value: opts.bookingDate },
        { label: 'Status', value: 'Pending Admin Post-Flight Review' },
      ],
      ctaLabel: 'View Flight Record',
      ctaUrl: `${appUrl}/dashboard/bookings/${opts.bookingId}`,
    }),
  }
}

export function adminFlightRecordSubmittedReviewEmail(opts: {
  customerName: string
  customerEmail: string
  bookingReference: string
  aircraft: string
  bookingDate: string
  bookingId: string
}) {
  return {
    subject: `Flight Record Submitted: ${opts.customerName} — ${opts.aircraft} (${opts.bookingReference})`,
    html: renderBaseTemplate({
      headline: 'Flight Record Submitted for Review',
      message: `${opts.customerName} has submitted post-flight readings for their flight. Please review the flight record in the admin portal to finalise billing.`,
      details: [
        { label: 'Customer', value: opts.customerName },
        { label: 'Email', value: opts.customerEmail },
        { label: 'Booking Reference', value: opts.bookingReference },
        { label: 'Aircraft', value: opts.aircraft },
        { label: 'Flight Date', value: opts.bookingDate },
        { label: 'Status', value: 'Pending Post-Flight Review' },
      ],
      ctaLabel: 'Review Flight Record',
      ctaUrl: `${appUrl}/admin/bookings/requests/${opts.bookingId}`,
    }),
  }
}

