import { renderBaseTemplate, escapeHtml } from './base-template'
import { getAppUrl } from '../app-url'

const appUrl = getAppUrl()

export function dayBeforeFlightReminderEmail(params: {
  pilotName: string
  bookingRef: string
  aircraft: string
  date: string
  time: string
  bookingType: string
}) {
  const { pilotName, bookingRef, aircraft, date, time, bookingType } = params

  return {
    subject: `Flight Reminder: Tomorrow's booking (${bookingRef}) — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Upcoming flight reminder',
      message: `Hi ${pilotName || 'Pilot'}, this is a friendly reminder of your upcoming ${bookingType.toLowerCase()} flight scheduled for tomorrow.`,
      details: [
        { label: 'Booking Reference', value: bookingRef },
        { label: 'Aircraft', value: aircraft },
        { label: 'Date', value: date },
        { label: 'Time', value: time },
        { label: 'Type', value: bookingType },
      ],
      extraHtml: `
        <p style="margin:16px 0 20px;font-size:14px;line-height:1.6;color:#475569;">
          Please ensure you have completed your pre-flight planning and hold all required current documents before departure.
        </p>
      `,
      ctaLabel: 'View Booking Details',
      ctaUrl: `${appUrl}/dashboard/bookings`,
    }),
  }
}

export function upcomingFlightReminderCustomerEmail(params: {
  pilotName: string
  bookingRef: string
  aircraft: string
  date: string
  time: string
  bookingType: 'standard' | 'checkout' | string
  hoursUntilFlight: number
  bookingId: string
}) {
  const { pilotName, bookingRef, aircraft, date, time, bookingType, hoursUntilFlight, bookingId } = params
  const isCheckout = bookingType === 'checkout'
  const bookingTypeLabel = isCheckout ? 'Checkout Flight' : 'Rental Flight'
  const timeframeLabel = hoursUntilFlight <= 18 ? '12 Hours' : '48 Hours'

  const preflightTips = isCheckout
    ? `
      <div style="margin-top: 20px; padding: 16px; background-color: #f8fafc; border-left: 4px solid #0284c7; border-radius: 4px;">
        <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 14px; font-weight: 600;">Checkout Flight Checklist</h4>
        <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px; line-height: 1.6;">
          <li>Please arrive <strong>20 minutes prior to departure</strong> at Bankstown Airport for your instructor briefing.</li>
          <li>Carry your physical CASA Pilot Licence, Medical Certificate, and Photo ID.</li>
          <li>Ensure you have reviewed the aircraft operating handbook (POH) and weight & balance data.</li>
        </ul>
      </div>
    `
    : `
      <div style="margin-top: 20px; padding: 16px; background-color: #f8fafc; border-left: 4px solid #0284c7; border-radius: 4px;">
        <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 14px; font-weight: 600;">Pre-Flight Preparation Checklist</h4>
        <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px; line-height: 1.6;">
          <li>Please arrive <strong>15–20 minutes early</strong> for your pre-flight walkaround and fuel quantity check.</li>
          <li>Ensure you carry your physical pilot licence, current medical certificate, and photo ID.</li>
          <li>Note tachometer and Hobbs start readings before engine start and log readings promptly upon return.</li>
        </ul>
      </div>
    `

  const ctaUrl = isCheckout ? `${appUrl}/dashboard/checkout` : `${appUrl}/dashboard/bookings/${bookingId}`

  return {
    subject: `Upcoming Flight Reminder: ${timeframeLabel} to departure (${bookingRef}) — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: `Upcoming Flight Reminder (${timeframeLabel} Away)`,
      message: `Hi ${pilotName || 'Pilot'}, this is a reminder for your upcoming ${bookingTypeLabel.toLowerCase()} departing in approximately ${hoursUntilFlight} hours:`,
      details: [
        { label: 'Booking Reference', value: bookingRef },
        { label: 'Flight Type', value: bookingTypeLabel },
        { label: 'Aircraft', value: aircraft },
        { label: 'Departure Date', value: date },
        { label: 'Scheduled Time', value: time },
        { label: 'Departure Base', value: 'Bankstown Airport (YSBK)' },
        { label: 'Status', value: 'Confirmed' },
      ],
      extraHtml: preflightTips,
      ctaLabel: isCheckout ? 'View Checkout Details' : 'View My Booking',
      ctaUrl,
    }),
  }
}

export function adminUpcomingFlightReminderEmail(params: {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  bookingRef: string
  aircraft: string
  date: string
  time: string
  bookingType: 'standard' | 'checkout' | string
  hoursUntilFlight: number
  bookingId: string
  status?: string
}) {
  const { customerName, customerEmail, customerPhone, pilotArn, bookingRef, aircraft, date, time, bookingType, hoursUntilFlight, bookingId, status } = params
  const isCheckout = bookingType === 'checkout'
  const bookingTypeLabel = isCheckout ? 'Checkout Flight' : 'Rental Flight'
  const timeframeLabel = hoursUntilFlight <= 18 ? '12h' : '48h'

  const details = [
    { label: 'Customer', value: customerName },
    { label: 'Email', value: customerEmail },
  ]
  if (customerPhone) {
    details.push({ label: 'Phone', value: customerPhone })
  }
  if (pilotArn) {
    details.push({ label: 'Pilot ARN', value: pilotArn })
  }
  details.push(
    { label: 'Booking Ref', value: bookingRef },
    { label: 'Flight Type', value: bookingTypeLabel },
    { label: 'Aircraft', value: aircraft },
    { label: 'Scheduled Date', value: date },
    { label: 'Scheduled Time', value: time },
    { label: 'Hours to Flight', value: `${hoursUntilFlight} hours` },
    { label: 'Status', value: status || 'Confirmed' },
  )

  return {
    subject: `[Admin Alert ${timeframeLabel}] Upcoming ${bookingTypeLabel}: ${customerName} — ${aircraft} (${bookingRef})`,
    html: renderBaseTemplate({
      headline: `Upcoming Flight Alert (${timeframeLabel} to Departure)`,
      message: `Operational alert: An upcoming ${bookingTypeLabel.toLowerCase()} is scheduled to depart in approximately ${hoursUntilFlight} hours.`,
      details,
      ctaLabel: 'View in Admin',
      ctaUrl: `${appUrl}/admin/bookings/requests/${bookingId}`,
    }),
  }
}

export function documentExpiryReminderEmail(params: {
  pilotName: string
  documentTypeLabel: string
  expiryDate: string
  daysUntilExpiry: number
}) {
  const { pilotName, documentTypeLabel, expiryDate, daysUntilExpiry } = params
  const urgencyText = daysUntilExpiry <= 0
    ? 'has expired'
    : daysUntilExpiry === 1
      ? 'expires tomorrow'
      : `expires in ${daysUntilExpiry} days`

  return {
    subject: `Action Required: Your ${documentTypeLabel} ${urgencyText} — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Document Expiry Notice',
      message: `Hi ${pilotName || 'Pilot'}, our records show that your ${documentTypeLabel} ${urgencyText} (expiry date: ${expiryDate}).`,
      details: [
        { label: 'Document', value: documentTypeLabel },
        { label: 'Expiry Date', value: expiryDate },
        { label: 'Status', value: daysUntilExpiry <= 0 ? 'Expired' : daysUntilExpiry === 1 ? 'Expires Tomorrow' : `${daysUntilExpiry} days remaining` },
      ],
      extraHtml: `
        <p style="margin:16px 0 20px;font-size:14px;line-height:1.6;color:#475569;">
          To ensure continued flight clearance and prevent automated booking holds, please upload your renewed document as soon as possible.
        </p>
      `,
      ctaLabel: 'Upload Renewed Document',
      ctaUrl: `${appUrl}/dashboard/documents`,
    }),
  }
}

export function adminDocumentExpiryAlertEmail(params: {
  pilotName: string
  pilotEmail: string
  documentTypeLabel: string
  expiryDate: string
  daysUntilExpiry: number
  customerId: string
}) {
  const { pilotName, pilotEmail, documentTypeLabel, expiryDate, daysUntilExpiry, customerId } = params
  const urgencyText = daysUntilExpiry <= 0 ? 'has expired' : 'is expiring tomorrow'

  return {
    subject: `Document Expiry Alert: ${pilotName}'s ${documentTypeLabel} ${urgencyText}`,
    html: renderBaseTemplate({
      headline: 'Customer Document Expiry Alert',
      message: `A customer's aviation document ${urgencyText}. A notification has been sent to the pilot.`,
      details: [
        { label: 'Customer', value: pilotName },
        { label: 'Email', value: pilotEmail },
        { label: 'Document', value: documentTypeLabel },
        { label: 'Expiry Date', value: expiryDate },
        { label: 'Status', value: daysUntilExpiry <= 0 ? 'Expired' : 'Expires Tomorrow (1 day)' },
      ],
      ctaLabel: 'View Customer Profile',
      ctaUrl: `${appUrl}/admin/users/${customerId}`,
    }),
  }
}

export function flightRecordOverdueEmail(params: {
  pilotName: string
  bookingRef: string
  aircraft: string
  flightDate: string
  bookingId: string
}) {
  const { pilotName, bookingRef, aircraft, flightDate, bookingId } = params

  return {
    subject: `Action Required: Please submit flight record for ${bookingRef} — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Flight Record Overdue',
      message: `Hi ${pilotName || 'Pilot'}, your flight has concluded, but we haven't received your flight log and VDO readings yet.`,
      details: [
        { label: 'Booking Reference', value: bookingRef },
        { label: 'Aircraft', value: aircraft },
        { label: 'Flight Date', value: flightDate },
      ],
      extraHtml: `
        <p style="margin:16px 0 20px;font-size:14px;line-height:1.6;color:#475569;">
          Submitting your VDO start/stop readings promptly allows us to finalize your flight record and keeps the aircraft log accurate for other pilots.
        </p>
      `,
      ctaLabel: 'Submit Flight Readings',
      ctaUrl: `${appUrl}/dashboard/bookings/${bookingId}`,
    }),
  }
}

export function postFlightRecordPendingCustomerReminderEmail(params: {
  pilotName: string
  bookingRef: string
  aircraft: string
  flightDate: string
  hoursOverdue: number
  bookingId: string
  isClarification?: boolean
}) {
  const { pilotName, bookingRef, aircraft, flightDate, hoursOverdue, bookingId, isClarification } = params

  const headline = isClarification ? 'Flight Record Clarification Required' : 'Submit Post-Flight Record'
  const message = isClarification
    ? `Hi ${pilotName || 'Pilot'}, our operations team has requested clarification on your submitted flight record for booking ${bookingRef}. Please review and update your details.`
    : `Hi ${pilotName || 'Pilot'}, your flight on ${flightDate} has concluded. Please submit your final VDO tachometer, Hobbs readings, and flight log so we can finalize your booking.`

  const ctaLabel = isClarification ? 'Review Clarification Request' : 'Submit Flight Record'

  return {
    subject: `Action Required: Please submit flight record for ${bookingRef} — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline,
      message,
      details: [
        { label: 'Booking Reference', value: bookingRef },
        { label: 'Aircraft', value: aircraft },
        { label: 'Flight Date', value: flightDate },
        { label: 'Time Elapsed', value: `${hoursOverdue} hours post-flight` },
        { label: 'Status', value: isClarification ? 'Clarification Requested' : 'Awaiting Flight Record' },
      ],
      extraHtml: `
        <div style="margin-top: 20px; padding: 16px; background-color: #f8fafc; border-left: 4px solid #0284c7; border-radius: 4px;">
          <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 14px; font-weight: 600;">Why is this needed?</h4>
          <p style="margin: 0; color: #475569; font-size: 13px; line-height: 1.6;">
            Submitting your VDO start/stop meter readings promptly allows our operations team to verify aircraft block times, process invoicing, and keep maintenance records current for the next flight.
          </p>
        </div>
      `,
      ctaLabel,
      ctaUrl: `${appUrl}/dashboard/bookings/${bookingId}`,
    }),
  }
}

export function postFlightRecordPendingAdminReminderEmail(params: {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  bookingRef: string
  aircraft: string
  flightDate: string
  hoursOverdue: number
  bookingId: string
  status?: string
}) {
  const { customerName, customerEmail, customerPhone, pilotArn, bookingRef, aircraft, flightDate, hoursOverdue, bookingId, status } = params

  const details = [
    { label: 'Customer', value: customerName },
    { label: 'Email', value: customerEmail },
  ]
  if (customerPhone) {
    details.push({ label: 'Phone', value: customerPhone })
  }
  if (pilotArn) {
    details.push({ label: 'Pilot ARN', value: pilotArn })
  }
  details.push(
    { label: 'Booking Ref', value: bookingRef },
    { label: 'Aircraft', value: aircraft },
    { label: 'Flight Date', value: flightDate },
    { label: 'Time Past Flight', value: `${hoursOverdue} hours` },
    { label: 'Status', value: status || 'Awaiting Flight Record' },
  )

  return {
    subject: `[Admin Reminder] Outstanding Flight Record: ${customerName} — ${aircraft} (${bookingRef})`,
    html: renderBaseTemplate({
      headline: 'Post-Flight Record Pending (1+ Day Past Flight)',
      message: `Operational reminder: The flight on ${flightDate} concluded more than 24 hours ago, and the post-flight record has not yet been submitted by the customer. Admin can also submit and complete the flight record directly.`,
      details,
      extraHtml: `
        <div style="margin-top: 20px; padding: 14px 16px; background-color: #f8fafc; border-left: 4px solid #0284c7; border-radius: 4px;">
          <p style="margin: 0; color: #334155; font-size: 13px; line-height: 1.5;">
            You can enter the Hobbs/Tachometer readings directly in the admin dashboard to finalize the booking and generate the invoice.
          </p>
        </div>
      `,
      ctaLabel: 'Submit Flight Record in Admin',
      ctaUrl: `${appUrl}/admin/bookings/requests/${bookingId}`,
    }),
  }
}

export function adminFlightRecordPendingReviewEmail(params: {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  pilotArn?: string | null
  bookingRef: string
  aircraft: string
  flightDate: string
  submittedDate: string
  hoursSinceSubmission: number
  bookingId: string
}) {
  const { customerName, customerEmail, customerPhone, pilotArn, bookingRef, aircraft, flightDate, submittedDate, hoursSinceSubmission, bookingId } = params

  const details = [
    { label: 'Customer', value: customerName },
    { label: 'Email', value: customerEmail },
  ]
  if (customerPhone) details.push({ label: 'Phone', value: customerPhone })
  if (pilotArn) details.push({ label: 'Pilot ARN', value: pilotArn })
  details.push(
    { label: 'Booking Ref', value: bookingRef },
    { label: 'Aircraft', value: aircraft },
    { label: 'Flight Date', value: flightDate },
    { label: 'Submitted At', value: submittedDate },
    { label: 'Awaiting Admin Review', value: `${hoursSinceSubmission} hours` },
    { label: 'Status', value: 'Pending Post-Flight Review' },
  )

  return {
    subject: `[Admin Action Required] Flight Record Review Pending (1+ Day): ${customerName} — ${aircraft} (${bookingRef})`,
    html: renderBaseTemplate({
      headline: 'Flight Record Awaiting Admin Review',
      message: `A flight log was submitted by the customer on ${submittedDate} (over 24 hours ago) and is awaiting admin review to send invoice, mark paid, or finalize.`,
      details,
      extraHtml: `
        <div style="margin-top: 20px; padding: 14px 16px; background-color: #f8fafc; border-left: 4px solid #0284c7; border-radius: 4px;">
          <p style="margin: 0; color: #334155; font-size: 13px; line-height: 1.5;">
            Please review the meter readings and billing calculation to issue the invoice or approve the flight record.
          </p>
        </div>
      `,
      ctaLabel: 'Review & Send Invoice',
      ctaUrl: `${appUrl}/admin/bookings/requests/${bookingId}`,
    }),
  }
}

export function adminBankTransferProofPendingVerificationEmail(params: {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  invoiceNumber: string
  bookingRef?: string | null
  amountFormatted: string
  invoiceType: string
  submittedDate: string
  hoursSinceSubmission: number
  invoiceId: string
  bookingId?: string | null
}) {
  const { customerName, customerEmail, customerPhone, invoiceNumber, bookingRef, amountFormatted, invoiceType, submittedDate, hoursSinceSubmission, bookingId } = params

  const details = [
    { label: 'Customer', value: customerName },
    { label: 'Email', value: customerEmail },
  ]
  if (customerPhone) details.push({ label: 'Phone', value: customerPhone })
  if (bookingRef) details.push({ label: 'Booking Ref', value: bookingRef })
  details.push(
    { label: 'Invoice Number', value: invoiceNumber },
    { label: 'Invoice Type', value: invoiceType },
    { label: 'Amount', value: amountFormatted },
    { label: 'Proof Submitted', value: submittedDate },
    { label: 'Awaiting Verification', value: `${hoursSinceSubmission} hours` },
    { label: 'Status', value: 'Payment Verification Pending' },
  )

  const ctaUrl = bookingId ? `${appUrl}/admin/bookings/requests/${bookingId}` : `${appUrl}/admin/bookings/payments`

  return {
    subject: `[Admin Action Required] Bank Transfer Proof Verification Pending (1+ Day): ${customerName} (${invoiceNumber})`,
    html: renderBaseTemplate({
      headline: 'Bank Transfer Verification Pending',
      message: `A customer uploaded bank transfer proof on ${submittedDate} (over 24 hours ago). Please verify the bank receipt in your account and approve or reject the payment.`,
      details,
      ctaLabel: 'Verify Payment Proof',
      ctaUrl,
    }),
  }
}

export function adminNewUserInactivityAlertEmail(params: {
  customerName: string
  customerEmail: string
  customerPhone: string | null
  pilotArn: string | null
  registeredDate: string
  documentStatus: string
  customerId: string
}) {
  const {
    customerName,
    customerEmail,
    customerPhone,
    pilotArn,
    registeredDate,
    documentStatus,
    customerId,
  } = params

  return {
    subject: `New User Follow-up: ${customerName} (No Checkout Requested) — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'New User Inactivity Alert',
      message: `A new customer registered more than 24 hours ago but has not requested a checkout flight.`,
      details: [
        { label: 'Customer Name', value: customerName },
        { label: 'Email', value: customerEmail },
        { label: 'Phone', value: customerPhone || 'Not provided' },
        { label: 'Pilot ARN', value: pilotArn || 'Not provided' },
        { label: 'Registered Date', value: registeredDate },
        { label: 'Document Progress', value: documentStatus },
        { label: 'Checkout Status', value: 'No checkout requested' },
      ],
      extraHtml: `
        <p style="margin:16px 0 20px;font-size:14px;line-height:1.6;color:#475569;">
          You can reach out to this pilot to offer assistance with document uploads or scheduling their initial checkout flight.
        </p>
      `,
      ctaLabel: 'View Customer Profile',
      ctaUrl: `${appUrl}/admin/users/${customerId}`,
    }),
  }
}

export function unpaidInvoiceCustomerEmail(params: {
  pilotName: string
  invoiceNumber: string
  amountFormatted: string
  invoiceType: string
  bookingRef?: string | null
  invoiceUrl: string
}) {
  const { pilotName, invoiceNumber, amountFormatted, invoiceType, bookingRef, invoiceUrl } = params

  return {
    subject: `Payment Reminder: Invoice ${invoiceNumber} (${amountFormatted}) is pending — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Payment Outstanding',
      message: `Hi ${pilotName || 'Pilot'}, this is a friendly reminder that invoice ${invoiceNumber} for your ${invoiceType.toLowerCase()} is awaiting payment.`,
      details: [
        { label: 'Invoice Number', value: invoiceNumber },
        { label: 'Amount Due', value: amountFormatted },
        { label: 'Type', value: invoiceType },
        ...(bookingRef ? [{ label: 'Booking Reference', value: bookingRef }] : []),
      ],
      extraHtml: `
        <p style="margin:16px 0 20px;font-size:14px;line-height:1.6;color:#475569;">
          Please finalize your payment to ensure continued access to aircraft bookings and flight services.
        </p>
      `,
      ctaLabel: 'Pay Invoice Now',
      ctaUrl: invoiceUrl,
    }),
  }
}

export function unpaidInvoiceAdminAlertEmail(params: {
  customerName: string
  customerEmail: string
  invoiceNumber: string
  amountFormatted: string
  invoiceType: string
  createdDate: string
  customerId: string
}) {
  const { customerName, customerEmail, invoiceNumber, amountFormatted, invoiceType, createdDate, customerId } = params

  return {
    subject: `Unpaid Invoice Alert: ${customerName} (${invoiceNumber} — ${amountFormatted})`,
    html: renderBaseTemplate({
      headline: 'Unpaid Invoice Alert',
      message: `An invoice has been outstanding for more than 24 hours. A payment reminder has been dispatched to the customer.`,
      details: [
        { label: 'Customer', value: customerName },
        { label: 'Email', value: customerEmail },
        { label: 'Invoice Number', value: invoiceNumber },
        { label: 'Amount Due', value: amountFormatted },
        { label: 'Invoice Type', value: invoiceType },
        { label: 'Issued Date', value: createdDate },
        { label: 'Status', value: 'Payment Required (>24h)' },
      ],
      ctaLabel: 'View Customer Profile',
      ctaUrl: `${appUrl}/admin/users/${customerId}`,
    }),
  }
}

export function onboardingNoDocsReminderEmail(params: {
  pilotName: string
}) {
  const { pilotName } = params
  return {
    subject: 'Complete your pilot profile — Upload your required documents — OZ Rent A Plane',
    html: renderBaseTemplate({
      headline: `Hi ${pilotName || 'Pilot'}, let's get you ready to fly`,
      message:
        'To begin hiring aircraft with OZ Rent A Plane, please upload your 3 required pilot documents so our team can review your credentials.',
      details: [
        { label: '1. Pilot Licence', value: 'CASA Private / Commercial Licence' },
        { label: '2. Medical Certificate', value: 'Class 1 or Class 2 Medical' },
        { label: '3. Photo ID', value: 'Driver Licence or Passport' },
      ],
      extraHtml: `
        <p style="margin:16px 0 20px;font-size:14px;line-height:1.6;color:#475569;">
          Uploading your documents takes less than 2 minutes and unlocks checkout flight booking.
        </p>
      `,
      ctaLabel: 'Upload Pilot Documents',
      ctaUrl: `${appUrl}/dashboard/documents`,
    }),
  }
}

export function onboardingIncompleteDocsReminderEmail(params: {
  pilotName: string
  missingDocumentLabels: string[]
}) {
  const { pilotName, missingDocumentLabels } = params

  return {
    subject: `Action Required: Finish uploading your pilot documents (${missingDocumentLabels.length} remaining) — OZ Rent A Plane`,
    html: renderBaseTemplate({
      headline: 'Almost there! Finish your pilot documents',
      message: `Hi ${pilotName || 'Pilot'}, you have started uploading your documents, but we still need the following to complete your onboarding profile:`,
      details: missingDocumentLabels.map((doc, idx) => ({
        label: `Missing Document ${idx + 1}`,
        value: doc,
      })),
      extraHtml: `
        <p style="margin:16px 0 20px;font-size:14px;line-height:1.6;color:#475569;">
          Once all required documents are uploaded, you can immediately request your initial checkout flight.
        </p>
      `,
      ctaLabel: 'Upload Remaining Documents',
      ctaUrl: `${appUrl}/dashboard/documents`,
    }),
  }
}

export function onboardingRequestCheckoutReminderEmail(params: {
  pilotName: string
}) {
  const { pilotName } = params

  return {
    subject: 'Your documents are in order — Request your checkout flight today — OZ Rent A Plane',
    html: renderBaseTemplate({
      headline: 'Your documents are ready!',
      message: `Hi ${pilotName || 'Pilot'}, all your required aviation documents have been uploaded and recorded. Your next step is to schedule your initial checkout flight.`,
      details: [
        { label: 'Document Status', value: 'All required documents submitted' },
        { label: 'Next Step', value: 'Book Initial Checkout Flight' },
      ],
      extraHtml: `
        <p style="margin:16px 0 20px;font-size:14px;line-height:1.6;color:#475569;">
          Choose your preferred aircraft and time slot directly in your portal. Our team will review and confirm your slot promptly.
        </p>
      `,
      ctaLabel: 'Request Checkout Flight',
      ctaUrl: `${appUrl}/dashboard/checkout`,
    }),
  }
}

export function onboardingActionRequiredReminderEmail(params: {
  pilotName: string
  actionReason: string
  actionUrl?: string
}) {
  const { pilotName, actionReason, actionUrl } = params

  return {
    subject: 'Action Required on your OZ Rent A Plane account',
    html: renderBaseTemplate({
      headline: 'Action Required',
      message: `Hi ${pilotName || 'Pilot'}, there is an outstanding action on your account that requires your attention:`,
      details: [
        { label: 'Details', value: actionReason },
        { label: 'Status', value: 'Action Required' },
      ],
      extraHtml: `
        <p style="margin:16px 0 20px;font-size:14px;line-height:1.6;color:#475569;">
          Please log in to your dashboard to resolve this so your onboarding and checkout can proceed smoothly.
        </p>
      `,
      ctaLabel: 'Review and Resolve',
      ctaUrl: actionUrl || `${appUrl}/dashboard`,
    }),
  }
}

export function adminPendingCheckoutReminderEmail(params: {
  customerName: string
  customerEmail: string
  bookingId: string
  requestedTime: string
  hoursPending: number
}) {
  const { customerName, customerEmail, bookingId, requestedTime, hoursPending } = params

  return {
    subject: `Reminder: Checkout Request from ${customerName} awaiting review (${hoursPending}h pending)`,
    html: renderBaseTemplate({
      headline: 'Checkout Request Awaiting Review',
      message: `A checkout request has been waiting for admin confirmation for more than ${hoursPending} hours.`,
      details: [
        { label: 'Customer', value: customerName },
        { label: 'Customer Email', value: customerEmail },
        { label: 'Requested Time', value: requestedTime },
        { label: 'Pending Duration', value: `${hoursPending} hours` },
      ],
      ctaLabel: 'Review Checkout Request',
      ctaUrl: `${appUrl}/admin/bookings/requests/${bookingId}`,
    }),
  }
}

