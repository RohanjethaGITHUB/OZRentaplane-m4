import { renderBaseTemplate } from './base-template'
import { getAppUrl } from '../app-url'

const appUrl = getAppUrl()

export function checkoutRequestReceivedEmail(params?: {
  customerName?: string | null
  requestedTime?: string | null
  bookingReference?: string | null
  bookingId?: string | null
}) {
  const { customerName, requestedTime, bookingReference, bookingId } = params ?? {}
  const displayName = customerName || 'Pilot'

  return {
    subject: `Checkout Request Received${bookingReference ? ` (${bookingReference})` : ''} — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Checkout Request Received',
      message: `Hi ${displayName}, thank you for requesting your checkout flight. Our operations team is currently reviewing your pilot documents and the requested flight schedule.`,
      details: [
        ...(bookingReference ? [{ label: 'Booking Reference', value: bookingReference }] : []),
        ...(requestedTime ? [{ label: 'Requested Flight Time', value: requestedTime }] : []),
        { label: 'Status', value: 'Awaiting Admin Review' },
        { label: 'Next Step', value: 'Admin Verification & Confirmation' },
      ],
      extraHtml: `
        <div style="margin:20px 0;padding:16px;background:#f8fafc;border-radius:8px;border-left:4px solid #0284c7;">
          <p style="margin:0 0 8px;font-weight:600;color:#0f172a;font-size:14px;">What Happens Next?</p>
          <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:1.6;">
            <li>Our team will verify your uploaded documents (Licence, Medical, Photo ID).</li>
            <li>We will confirm your requested slot or propose an alternative time if there are scheduling conflicts.</li>
            <li>You will receive an email and portal update as soon as your slot is confirmed.</li>
          </ul>
        </div>
      `,
      ctaLabel: 'View Checkout Status',
      ctaUrl: `${appUrl}/dashboard/bookings${bookingId ? `/${bookingId}` : ''}`,
    }),
  }
}

export function adminNewCheckoutRequestEmail(details: {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  requestedTime: string
  bookingReference?: string | null
  bookingId?: string | null
  customerId?: string
}) {
  return {
    subject: `Action Required: New Checkout Request from ${details.customerName} (${details.bookingReference || details.requestedTime})`,
    html: renderBaseTemplate({
      headline: 'New Checkout Request Submitted',
      message: 'A customer has submitted a new checkout request and is awaiting admin review and confirmation.',
      details: [
        { label: 'Customer Name', value: details.customerName },
        { label: 'Customer Email', value: details.customerEmail },
        ...(details.customerPhone ? [{ label: 'Phone', value: details.customerPhone }] : []),
        ...(details.pilotArn ? [{ label: 'Pilot ARN', value: details.pilotArn }] : []),
        { label: 'Requested Flight Time', value: details.requestedTime },
        ...(details.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        { label: 'Next Action Required', value: 'Review pilot documents & confirm or reschedule slot' },
      ],
      extraHtml: `
        <p style="margin:16px 0 20px;font-size:14px;line-height:1.6;color:#475569;">
          Please review the customer's uploaded credentials and confirm the booking or propose a new time slot in the admin console.
        </p>
      `,
      ctaLabel: 'Review & Confirm Request',
      ctaUrl: `${appUrl}/admin/bookings/requests/${details.bookingId || ''}`,
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

export function customerCheckoutCancelledEmail(details: {
  customerName?: string | null
  bookingReference?: string | null
  scheduledTime?: string | null
  reason?: string | null
  cancelledBy: 'customer' | 'admin'
}) {
  const isCustomer = details.cancelledBy === 'customer'
  return {
    subject: `Checkout Flight Cancelled (${details.bookingReference || 'OZ Rent A Plane'})`,
    html: renderBaseTemplate({
      headline: isCustomer ? 'Checkout Request Cancelled' : 'Checkout Flight Cancelled by Operations',
      message: isCustomer
        ? 'Your checkout flight request has been successfully cancelled. You can request a new checkout slot whenever you are ready.'
        : `Your checkout flight has been cancelled by operations.${details.reason ? ` Reason: ${details.reason}` : ''}`,
      details: [
        ...(details.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        ...(details.scheduledTime ? [{ label: 'Scheduled Time', value: details.scheduledTime }] : []),
        { label: 'Status', value: 'Cancelled' },
        ...(details.reason && !isCustomer ? [{ label: 'Cancellation Reason', value: details.reason }] : []),
      ],
      ctaLabel: 'Request New Checkout Slot',
      ctaUrl: `${appUrl}/dashboard/checkout`,
    }),
  }
}

export function adminCheckoutCancelledEmail(details: {
  customerName: string
  customerEmail: string
  bookingReference?: string | null
  scheduledTime?: string | null
  reason?: string | null
  bookingId: string
}) {
  return {
    subject: `Checkout Cancelled by Customer — ${details.customerName} (${details.bookingReference || 'Checkout'})`,
    html: renderBaseTemplate({
      headline: 'Customer Cancelled Checkout Flight',
      message: `${details.customerName} has cancelled their checkout flight request. The aircraft slot has been released.`,
      details: [
        { label: 'Customer', value: details.customerName },
        { label: 'Email', value: details.customerEmail },
        ...(details.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        ...(details.scheduledTime ? [{ label: 'Original Slot', value: details.scheduledTime }] : []),
        ...(details.reason ? [{ label: 'Customer Note', value: details.reason }] : []),
        { label: 'Status', value: 'Cancelled by Customer' },
      ],
      ctaLabel: 'View Admin Schedule',
      ctaUrl: `${appUrl}/admin/calendar`,
    }),
  }
}

export function customerCheckoutTimeProposedEmail(details: {
  customerName?: string | null
  bookingReference?: string | null
  originalTime?: string | null
  proposedTime: string
  aircraft?: string | null
  bookingId: string
}) {
  return {
    subject: `Action Required: New Checkout Time Proposed (${details.bookingReference || details.proposedTime}) — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'New Checkout Flight Time Proposed',
      message: 'The operations team has proposed an alternative time slot for your checkout flight. Please review the details and accept or decline.',
      details: [
        ...(details.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        ...(details.originalTime ? [{ label: 'Original Slot', value: details.originalTime }] : []),
        { label: 'Proposed New Slot', value: details.proposedTime },
        ...(details.aircraft ? [{ label: 'Aircraft', value: details.aircraft }] : []),
        { label: 'Status', value: 'Action Required (Review Proposed Time)' },
      ],
      ctaLabel: 'Review & Respond to Proposed Time',
      ctaUrl: `${appUrl}/dashboard/checkout`,
    }),
  }
}

export function adminCheckoutProposalDecisionEmail(details: {
  customerName: string
  customerEmail: string
  decision: 'accepted' | 'declined'
  bookingReference?: string | null
  proposedTime?: string | null
  declineReason?: string | null
  bookingId: string
}) {
  const isAccepted = details.decision === 'accepted'
  return {
    subject: `Proposed Checkout Time ${isAccepted ? 'Accepted' : 'Declined'} by ${details.customerName} (${details.bookingReference || 'Checkout'})`,
    html: renderBaseTemplate({
      headline: isAccepted ? 'Customer Accepted Proposed Time' : 'Customer Declined Proposed Time',
      message: isAccepted
        ? `${details.customerName} has accepted the proposed checkout flight time. The flight is now confirmed.`
        : `${details.customerName} has declined the proposed checkout flight time.`,
      details: [
        { label: 'Customer', value: details.customerName },
        { label: 'Email', value: details.customerEmail },
        ...(details.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        ...(details.proposedTime ? [{ label: 'Proposed Time', value: details.proposedTime }] : []),
        { label: 'Decision', value: isAccepted ? 'Accepted & Confirmed' : 'Declined' },
        ...(details.declineReason ? [{ label: 'Decline Reason', value: details.declineReason }] : []),
      ],
      ctaLabel: 'View Checkout Booking',
      ctaUrl: `${appUrl}/admin/bookings/requests/${details.bookingId}`,
    }),
  }
}

export function checkoutPaymentRequiredEmail(details: {
  bookingId: string
  bookingReference?: string | null
  customerName?: string | null
  flightDate?: string | null
  aircraft?: string | null
  amountDue: string
  invoiceNumber?: string | null
}) {
  return {
    subject: 'Payment required for your checkout flight',
    html: renderBaseTemplate({
      headline: 'Payment required for your checkout flight',
      message:
        'Your checkout flight has been reviewed and your invoice is ready. Payment is required before the checkout process can be completed. You can pay securely online by card or bank transfer.',
      details: [
        ...(details.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        ...(details.aircraft ? [{ label: 'Aircraft', value: details.aircraft }] : []),
        ...(details.flightDate ? [{ label: 'Flight Date', value: details.flightDate }] : []),
        ...(details.invoiceNumber ? [{ label: 'Invoice Number', value: details.invoiceNumber }] : []),
        { label: 'Amount Due', value: details.amountDue },
      ],
      ctaLabel: 'Pay Now',
      ctaUrl: `${appUrl}/dashboard/bookings/${details.bookingId}#payment`,
    }),
  }
}

export function bankTransferProofReceivedEmail(details?: {
  bookingId?: string | null
  bookingReference?: string | null
  aircraft?: string | null
  flightDate?: string | null
  invoiceNumber?: string | null
  amount?: string | null
  transferReference?: string | null
}) {
  return {
    subject: `Bank Transfer Proof Received${details?.bookingReference ? ` (${details.bookingReference})` : ''} — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Payment Proof Received',
      message:
        'Your bank transfer payment proof has been received. Our operations team will review and confirm your payment shortly.',
      details: [
        ...(details?.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        ...(details?.aircraft ? [{ label: 'Aircraft', value: details.aircraft }] : []),
        ...(details?.flightDate ? [{ label: 'Flight Date', value: details.flightDate }] : []),
        ...(details?.invoiceNumber ? [{ label: 'Invoice Number', value: details.invoiceNumber }] : []),
        ...(details?.amount ? [{ label: 'Payable Amount', value: details.amount }] : []),
        ...(details?.transferReference ? [{ label: 'Transfer Reference', value: details.transferReference }] : []),
        { label: 'Status', value: 'Awaiting Admin Confirmation' },
      ],
      ctaLabel: 'View Payment Status',
      ctaUrl: details?.bookingId ? `${appUrl}/dashboard/bookings/${details.bookingId}#payment` : `${appUrl}/dashboard/bookings`,
    }),
  }
}

export function adminBankTransferProofUploadedEmail(details: {
  bookingId: string
  customerName: string
  customerEmail: string
  bookingReference?: string | null
  aircraft?: string | null
  flightDate?: string | null
  invoiceNumber?: string | null
  amount: string
  invoiceType?: string | null
  transferReference?: string | null
}) {
  const invoiceTypeLabel = details.invoiceType === 'checkout' ? 'Checkout Flight' : 'Rental / Standard Flight'
  return {
    subject: `Bank Transfer Proof Uploaded: ${details.customerName}${details.bookingReference ? ` (${details.bookingReference})` : ''} — ${details.amount}`,
    html: renderBaseTemplate({
      headline: 'Bank Transfer Proof Uploaded',
      message: 'A customer has uploaded bank transfer payment proof for review. Please verify the received funds and confirm the payment.',
      details: [
        { label: 'Customer', value: details.customerName },
        { label: 'Email', value: details.customerEmail },
        ...(details.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        ...(details.aircraft ? [{ label: 'Aircraft', value: details.aircraft }] : []),
        ...(details.flightDate ? [{ label: 'Flight Date', value: details.flightDate }] : []),
        ...(details.invoiceNumber ? [{ label: 'Invoice Number', value: details.invoiceNumber }] : []),
        { label: 'Payable Amount', value: details.amount },
        ...(details.transferReference ? [{ label: 'Transfer Reference', value: details.transferReference }] : []),
        { label: 'Booking Type', value: invoiceTypeLabel },
        { label: 'Status', value: 'Pending Admin Review' },
      ],
      ctaLabel: 'Review Payment Proof',
      ctaUrl: `${appUrl}/admin/bookings/requests/${details.bookingId}`,
    }),
  }
}

export function checkoutOutcomeEmail(subject: string, headline: string, message: string, ctaLabel: string) {
  return {
    subject,
    html: renderBaseTemplate({ headline, message, ctaLabel, ctaUrl: `${appUrl}/dashboard` }),
  }
}

export function adminCheckoutUrgentReview24hEmail(details: {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  requestedTime: string
  bookingReference?: string | null
  bookingId: string
  hoursUntilFlight: number
}) {
  return {
    subject: `URGENT: Checkout flight in <24h requires confirmation — ${details.customerName}`,
    html: renderBaseTemplate({
      headline: 'Urgent: Unconfirmed Checkout in <24h',
      message: `A checkout request is scheduled to begin in less than ${details.hoursUntilFlight} hours and has not been confirmed or rescheduled yet.`,
      details: [
        { label: 'Customer', value: details.customerName },
        { label: 'Email', value: details.customerEmail },
        ...(details.customerPhone ? [{ label: 'Phone', value: details.customerPhone }] : []),
        { label: 'Requested Flight Time', value: details.requestedTime },
        ...(details.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        { label: 'Status', value: 'Pending Admin Confirmation (<24h to flight)' },
      ],
      extraHtml: `
        <p style="margin:16px 0 20px;font-size:14px;line-height:1.6;color:#b91c1c;font-weight:600;">
          Action required: Please confirm the booking immediately or propose an alternate slot so the customer and instructor can prepare.
        </p>
      `,
      ctaLabel: 'Review & Confirm Slot',
      ctaUrl: `${appUrl}/admin/bookings/requests/${details.bookingId}`,
    }),
  }
}

export function adminCheckoutOutcomePendingAlertEmail(details: {
  customerName: string
  customerEmail: string
  bookingReference?: string | null
  flightDate: string
  aircraft?: string | null
  hoursSinceFlight: number
  bookingId: string
  customerId?: string | null
}) {
  return {
    subject: `Action Required: Pending Checkout Outcome — ${details.customerName} (${details.bookingReference || details.flightDate})`,
    html: renderBaseTemplate({
      headline: 'Pending Checkout Outcome Review',
      message: `The checkout flight for ${details.customerName} concluded ${details.hoursSinceFlight} hours ago. Please submit the checkout outcome so the pilot can proceed.`,
      details: [
        { label: 'Customer', value: details.customerName },
        { label: 'Email', value: details.customerEmail },
        { label: 'Flight Concluded', value: details.flightDate },
        ...(details.aircraft ? [{ label: 'Aircraft', value: details.aircraft }] : []),
        ...(details.bookingReference ? [{ label: 'Booking Reference', value: details.bookingReference }] : []),
        { label: 'Next Action', value: 'Record outcome: Cleared to Fly, Additional Checkout, or Reschedule' },
      ],
      extraHtml: `
        <p style="margin:16px 0 20px;font-size:14px;line-height:1.6;color:#475569;">
          Updating the checkout outcome will automatically notify the customer and update their clearance permissions across the platform.
        </p>
      `,
      ctaLabel: 'Record Checkout Outcome',
      ctaUrl: `${appUrl}/admin/bookings/requests/${details.bookingId}`,
    }),
  }
}

