import {
  evaluateBookingDocumentsReadiness,
  type BookingReadinessDecision,
  type BookingReadinessItem,
} from '@/lib/booking-readiness'
import { ADMIN_CONTACT_PHONE_TEL } from '@/lib/contact'
import type { PilotClearanceStatus, Profile, UserDocument } from '@/lib/supabase/types'

function bookingPaymentHref(bookingId: string | null | undefined): string {
  return bookingId ? `/dashboard/bookings/${bookingId}#payment` : '/dashboard/bookings'
}

export type DashboardTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'
export type DashboardResponsibleActor = 'customer' | 'admin' | 'instructor' | 'system' | 'none'
export type DashboardJourneyStep = 'account' | 'documents' | 'checkout' | 'approved' | 'ready'

export type DashboardFlightSnapshot = {
  id: string
  bookingType: 'standard' | 'checkout'
  status: string
  scheduledStart: string
  scheduledEnd: string | null
  aircraftRegistration: string | null
}

export type DashboardBookingFocusMode =
  | 'post_flight_required'
  | 'post_flight_clarification_required'
  | 'post_flight_under_review'
  | 'upcoming_confirmed'
  | 'post_flight_payment_required'
  | 'post_flight_payment_proof_under_review'
  | 'post_flight_payment_proof_rejected'
  | 'post_flight_payment_approved'
  | 'block_time_landing_fee_required'

export type DashboardBookingFocusState = {
  mode: DashboardBookingFocusMode
  bookingId: string
}

export type DashboardPaymentSnapshot = {
  bookingId: string | null
  invoiceStatus: string | null
  bankTransferStatus: string | null
  bankTransferNote: string | null
}

export type DashboardActionLink = {
  label: string
  href: string
}

export type DashboardActionState = {
  phase:
    | 'blocked'
    | 'documents'
    | 'checkout'
    | 'checkout_payment'
    | 'checkout_review'
    | 'cleared'
    | 'booking'
    | 'post_flight'
    | 'booking_payment'
    | 'completed'
  statusKey: string
  tone: DashboardTone
  responsibleActor: DashboardResponsibleActor
  customerActionRequired: boolean
  heroLabel: string
  heroMessage: string
  actionEyebrow: string
  actionHeading: string
  actionDescription: string
  primaryAction?: DashboardActionLink
  secondaryAction?: DashboardActionLink
  waitingMessage?: string
  nextMilestone?: string
  journeyStep: DashboardJourneyStep
  severityReason?: string
}

export type DashboardActionStateInput = {
  profile: Pick<
    Profile,
    'account_status' | 'account_lock_reason' | 'pilot_clearance_status' | 'has_night_vfr_rating' | 'last_flight_date'
  >
  documents: UserDocument[]
  bookingReadiness: BookingReadinessDecision | null
  canCreateStandardBooking: boolean
  hasManualCheckoutClearance: boolean
  checkoutBookingId: string | null
  hasPendingCheckoutReschedule?: boolean
  hasPendingAdminProposal?: boolean
  checkoutPayment: DashboardPaymentSnapshot | null
  bookingFocusState: DashboardBookingFocusState | null
  flightSnapshotBooking: DashboardFlightSnapshot | null
  activeBooking: { id: string; status: string } | null
}

function documentNeedsReplacement(item: BookingReadinessItem): boolean {
  return item.state === 'needs_review' && item.detail.toLowerCase().startsWith('rejected')
}

function documentAwaitingReview(item: BookingReadinessItem): boolean {
  return item.state === 'needs_review' && !documentNeedsReplacement(item)
}

function isCheckoutSubmitted(
  clearanceStatus: PilotClearanceStatus,
  checkoutBookingId: string | null,
): boolean {
  return clearanceStatus !== 'checkout_required' || Boolean(checkoutBookingId)
}

function fallbackJourneyStepForClearance(status: PilotClearanceStatus): DashboardJourneyStep {
  if (status === 'cleared_to_fly') return 'ready'
  if (status === 'checkout_completed_under_review' || status === 'checkout_payment_required') return 'approved'
  if (
    status === 'checkout_required' ||
    status === 'checkout_requested' ||
    status === 'checkout_confirmed' ||
    status === 'additional_checkout_required' ||
    status === 'checkout_reschedule_required' ||
    status === 'not_currently_eligible'
  ) {
    return 'checkout'
  }
  return 'documents'
}

function buildState(input: Omit<DashboardActionState, 'actionEyebrow'>): DashboardActionState {
  return {
    ...input,
    actionEyebrow: input.customerActionRequired ? 'YOUR NEXT STEP' : 'CURRENT STATUS',
  }
}

function resolveCheckoutReadiness(input: {
  documentItems: BookingReadinessItem[]
  bookingReadiness: BookingReadinessDecision | null
  hasNightVfrRating: boolean | null
}): {
  hasRejectedDocument: boolean
  hasExpiredDocument: boolean
  hasDocumentsAwaitingReview: boolean
  missingDocumentItems: BookingReadinessItem[]
  nightVfrProofMissing: boolean
  flightRecencyMissing: boolean
  termsIncomplete: boolean
  nightVfrUnanswered: boolean
  checkoutRequestReady: boolean
} {
  const { documentItems, bookingReadiness, hasNightVfrRating } = input
  const hasRejectedDocument = documentItems.some(documentNeedsReplacement)
  const hasExpiredDocument = documentItems.some((item) => item.state === 'expired')
  const hasDocumentsAwaitingReview = documentItems.some(documentAwaitingReview)
  const missingDocumentItems = documentItems.filter((item) => item.state === 'missing')
  const nightVfrProofMissing = missingDocumentItems.some((item) => item.key === 'night_vfr_evidence')
  const flightRecencyMissing = bookingReadiness ? !bookingReadiness.flightRecencyComplete : false
  const termsIncomplete = bookingReadiness ? !bookingReadiness.currentTermsAccepted : false
  const nightVfrUnanswered = hasNightVfrRating === null

  const checkoutDocumentsReady = documentItems.every((item) => {
    if (item.state === 'missing' || item.state === 'expired') return false
    if (documentNeedsReplacement(item)) return false
    return true
  })

  return {
    hasRejectedDocument,
    hasExpiredDocument,
    hasDocumentsAwaitingReview,
    missingDocumentItems,
    nightVfrProofMissing,
    flightRecencyMissing,
    termsIncomplete,
    nightVfrUnanswered,
    checkoutRequestReady:
      checkoutDocumentsReady && !flightRecencyMissing && !termsIncomplete && !nightVfrUnanswered,
  }
}

function resolveManualPaymentState(snapshot: DashboardPaymentSnapshot | null): {
  kind: 'none' | 'payment_required' | 'proof_under_review' | 'proof_rejected' | 'payment_approved'
  adminNote: string | null
} {
  if (!snapshot) return { kind: 'none', adminNote: null }
  if (snapshot.bankTransferStatus === 'rejected') {
    return { kind: 'proof_rejected', adminNote: snapshot.bankTransferNote ?? null }
  }
  if (snapshot.bankTransferStatus === 'pending_review') {
    return { kind: 'proof_under_review', adminNote: snapshot.bankTransferNote ?? null }
  }
  if (snapshot.bankTransferStatus === 'approved') {
    return { kind: 'payment_approved', adminNote: snapshot.bankTransferNote ?? null }
  }
  return { kind: 'payment_required', adminNote: snapshot.bankTransferNote ?? null }
}

export function getJourneyStepIndex(step: DashboardJourneyStep): number {
  return ['account', 'documents', 'checkout', 'approved', 'ready'].indexOf(step)
}

export function resolveDashboardActionState(input: DashboardActionStateInput): DashboardActionState {
  const clearanceStatus = input.profile.pilot_clearance_status
  const documentItems = evaluateBookingDocumentsReadiness({
    documents: input.documents,
    hasNightVfrRating: input.profile.has_night_vfr_rating,
  })
  const readiness = resolveCheckoutReadiness({
    documentItems,
    bookingReadiness: input.bookingReadiness,
    hasNightVfrRating: input.profile.has_night_vfr_rating,
  })
  const checkoutSubmitted = isCheckoutSubmitted(clearanceStatus, input.checkoutBookingId)
  const checkoutPaymentState = resolveManualPaymentState(input.checkoutPayment)

  if (input.profile.account_status === 'blocked') {
    const noShow = input.profile.account_lock_reason === 'checkout_no_show'
    return buildState({
      phase: 'blocked',
      statusKey: noShow ? 'account_locked_no_show' : 'account_blocked',
      tone: 'danger',
      responsibleActor: 'admin',
      customerActionRequired: true,
      heroLabel: 'Account Action Required',
      heroMessage: noShow
        ? 'Your account is temporarily locked after a missed checkout flight.'
        : 'Your account is temporarily restricted. Please contact the team for help.',
      actionHeading: noShow ? 'Your account is temporarily locked' : 'Your account needs attention',
      actionDescription: noShow
        ? 'You were marked as a no-show for your checkout flight. Please contact OZ Rent A Plane so the team can review your status and unlock your account.'
        : 'A restriction has been applied to your account. Please contact OZ Rent A Plane before continuing with bookings or checkout.',
      primaryAction: { label: 'Contact Team', href: '/dashboard/messages' },
      secondaryAction: { label: 'Call Team', href: `tel:${ADMIN_CONTACT_PHONE_TEL}` },
      nextMilestone: 'After review, the team can confirm your next eligible step.',
      journeyStep: fallbackJourneyStepForClearance(clearanceStatus),
      severityReason: noShow ? 'checkout_no_show' : 'account_blocked',
    })
  }

  if (readiness.hasRejectedDocument) {
    return buildState({
      phase: 'documents',
      statusKey: 'documents_rejected',
      tone: 'danger',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Document Update Required',
      heroMessage: 'One or more required documents were rejected and must be replaced.',
      actionHeading: 'Upload a replacement document',
      actionDescription: 'A required pilot file document was rejected. Open your documents page, review the feedback, and upload a corrected replacement.',
      primaryAction: { label: 'Open Documents', href: '/dashboard/documents' },
      nextMilestone: 'After you upload a replacement, the team will review it again.',
      journeyStep: 'documents',
      severityReason: 'documents_rejected',
    })
  }

  if (checkoutPaymentState.kind === 'proof_rejected') {
    return buildState({
      phase: 'checkout_payment',
      statusKey: 'checkout_payment_proof_rejected',
      tone: 'danger',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Payment Proof Needs Attention',
      heroMessage: 'Your payment proof was rejected and needs to be uploaded again.',
      actionHeading: 'Upload new payment proof',
      actionDescription: checkoutPaymentState.adminNote
        ? `Your checkout payment proof was rejected: ${checkoutPaymentState.adminNote}`
        : 'Your checkout payment proof was rejected. Please upload a new bank transfer receipt or pay by card to continue.',
      primaryAction: {
        label: 'Upload New Proof',
        href: bookingPaymentHref(input.checkoutPayment?.bookingId),
      },
      secondaryAction: { label: 'View Payment Details', href: bookingPaymentHref(input.checkoutPayment?.bookingId) },
      nextMilestone: 'Once valid proof is submitted, the team can review and confirm your payment.',
      journeyStep: 'approved',
      severityReason: 'checkout_payment_rejected',
    })
  }

  if (input.bookingFocusState?.mode === 'post_flight_payment_proof_rejected') {
    return buildState({
      phase: 'booking_payment',
      statusKey: 'booking_payment_proof_rejected',
      tone: 'danger',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Payment Proof Needs Attention',
      heroMessage: 'Your booking payment proof was rejected and needs to be uploaded again.',
      actionHeading: 'Upload new payment proof',
      actionDescription: 'Your post-flight bank transfer proof was rejected. Open the booking and upload a replacement so the team can finish the booking.',
      primaryAction: { label: 'Upload New Proof', href: bookingPaymentHref(input.bookingFocusState.bookingId) },
      secondaryAction: { label: 'View Booking Details', href: bookingPaymentHref(input.bookingFocusState.bookingId) },
      nextMilestone: 'Once valid proof is submitted, the team can review and close the booking.',
      journeyStep: 'ready',
      severityReason: 'booking_payment_rejected',
    })
  }

  if (input.bookingFocusState?.mode === 'post_flight_clarification_required') {
    return buildState({
      phase: 'post_flight',
      statusKey: 'post_flight_clarification_required',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Clarification Needed',
      heroMessage: 'The team needs more information before your booking can be finalised.',
      actionHeading: 'Respond to the clarification request',
      actionDescription: 'Your post-flight submission needs an update before the team can finish the review. Open the booking to review the question and respond.',
      primaryAction: { label: 'Open Booking', href: `/dashboard/bookings/${input.bookingFocusState.bookingId}` },
      nextMilestone: 'After you respond, the team will review the updated post-flight record.',
      journeyStep: 'ready',
      severityReason: 'post_flight_clarification_required',
    })
  }

  if (input.bookingFocusState?.mode === 'post_flight_required') {
    return buildState({
      phase: 'post_flight',
      statusKey: 'post_flight_records_due',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Post-Flight Records Due',
      heroMessage: 'Your flight has finished and post-flight records still need to be submitted.',
      actionHeading: 'Submit your post-flight records',
      actionDescription: 'Open the booking and submit your VDO and tacho readings so the team can review and finalise the flight.',
      primaryAction: { label: 'Submit Post-Flight Records', href: `/dashboard/bookings/${input.bookingFocusState.bookingId}` },
      secondaryAction: { label: 'View Booking Details', href: `/dashboard/bookings/${input.bookingFocusState.bookingId}` },
      nextMilestone: 'After you submit the records, the team will review them and prepare any final billing.',
      journeyStep: 'ready',
      severityReason: 'post_flight_records_due',
    })
  }

  if (input.bookingFocusState?.mode === 'post_flight_payment_required') {
    return buildState({
      phase: 'booking_payment',
      statusKey: 'booking_payment_required',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Payment Required',
      heroMessage: 'Your post-flight invoice is ready and payment is needed to close the booking.',
      actionHeading: 'Complete your post-flight payment',
      actionDescription: 'Open the booking to pay by card or upload bank transfer proof so the team can close the flight.',
      primaryAction: { label: 'Complete Payment', href: bookingPaymentHref(input.bookingFocusState.bookingId) },
      secondaryAction: { label: 'View Booking Details', href: bookingPaymentHref(input.bookingFocusState.bookingId) },
      nextMilestone: 'After payment is confirmed, the booking will be finalised and closed.',
      journeyStep: 'ready',
      severityReason: 'booking_payment_required',
    })
  }

  if (input.bookingFocusState?.mode === 'block_time_landing_fee_required') {
    return buildState({
      phase: 'booking_payment',
      statusKey: 'block_time_landing_fee_required',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Landing Fee Pending',
      heroMessage: 'Flight hours were deducted from your block time balance. Your landing fee invoice is ready and payment is needed to close the booking.',
      actionHeading: 'Pay your landing fee invoice',
      actionDescription: 'Open the booking to pay landing fees by card or upload bank transfer proof so the team can close the flight.',
      primaryAction: { label: 'Pay Landing Fee', href: `/dashboard/bookings/${input.bookingFocusState.bookingId}#payment` },
      secondaryAction: { label: 'View Booking Details', href: `/dashboard/bookings/${input.bookingFocusState.bookingId}` },
      nextMilestone: 'After payment is confirmed, the booking will be finalised and closed.',
      journeyStep: 'ready',
      severityReason: 'block_time_landing_fee_required',
    })
  }

  if (input.bookingFocusState?.mode === 'post_flight_payment_proof_under_review') {
    return buildState({
      phase: 'booking_payment',
      statusKey: 'booking_payment_proof_under_review',
      tone: 'info',
      responsibleActor: 'admin',
      customerActionRequired: false,
      heroLabel: 'Payment Proof Under Review',
      heroMessage: 'Your post-flight payment proof has been submitted and is awaiting review.',
      actionHeading: 'Your payment proof is under review',
      actionDescription: 'You have already uploaded your post-flight bank transfer proof. The team is reviewing it before closing the booking.',
      secondaryAction: { label: 'View Booking Details', href: `/dashboard/bookings/${input.bookingFocusState.bookingId}` },
      waitingMessage: 'No action is required from you right now.',
      nextMilestone: 'After confirmation, the booking will move to its final settled state.',
      journeyStep: 'ready',
      severityReason: 'booking_payment_under_review',
    })
  }

  if (input.bookingFocusState?.mode === 'post_flight_payment_approved') {
    return buildState({
      phase: 'booking_payment',
      statusKey: 'booking_payment_approved_processing',
      tone: 'info',
      responsibleActor: 'admin',
      customerActionRequired: false,
      heroLabel: 'Payment Received',
      heroMessage: 'Your post-flight payment has been approved and the booking is being finalised.',
      actionHeading: 'Payment received',
      actionDescription: 'Your bank transfer has already been approved. The team is now applying the final booking update.',
      secondaryAction: { label: 'View Booking Details', href: `/dashboard/bookings/${input.bookingFocusState.bookingId}` },
      waitingMessage: 'No action is required from you right now.',
      nextMilestone: 'After processing completes, the booking will move to its closed state.',
      journeyStep: 'ready',
      severityReason: 'booking_payment_approved',
    })
  }

  if (input.bookingFocusState?.mode === 'post_flight_under_review') {
    return buildState({
      phase: 'post_flight',
      statusKey: 'post_flight_under_review',
      tone: 'info',
      responsibleActor: 'admin',
      customerActionRequired: false,
      heroLabel: 'Records Under Review',
      heroMessage: 'Your post-flight records have been submitted and are being reviewed.',
      actionHeading: 'Your post-flight records are under review',
      actionDescription: 'The team is reviewing your submitted flight records and preparing any remaining billing or follow-up actions.',
      secondaryAction: { label: 'View Booking Details', href: `/dashboard/bookings/${input.bookingFocusState.bookingId}` },
      waitingMessage: 'No action is required from you right now.',
      nextMilestone: 'After review, the booking will either be finalised or returned for clarification.',
      journeyStep: 'ready',
      severityReason: 'post_flight_under_review',
    })
  }

  if (clearanceStatus === 'checkout_reschedule_required') {
    return buildState({
      phase: 'checkout',
      statusKey: 'checkout_reschedule_required',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Checkout Reschedule Required',
      heroMessage: 'Your checkout needs a new date and time before assessment can continue.',
      actionHeading: 'Reschedule your checkout',
      actionDescription: 'Your previous checkout slot can no longer go ahead. Choose a new time so the team can continue your checkout assessment.',
      primaryAction: { label: 'Reschedule Checkout', href: '/dashboard/checkout' },
      nextMilestone: 'After you request a new slot, the team will confirm the updated checkout booking.',
      journeyStep: 'checkout',
      severityReason: 'checkout_reschedule_required',
    })
  }

  if (clearanceStatus === 'additional_checkout_required') {
    return buildState({
      phase: 'checkout',
      statusKey: 'additional_checkout_required',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Additional Checkout Required',
      heroMessage: 'A follow-up checkout is required before solo hire can continue.',
      actionHeading: 'Book your additional checkout',
      actionDescription: 'Your previous checkout outcome requires another checkout session before you can be cleared to fly.',
      primaryAction: { label: 'Book Another Checkout', href: '/dashboard/checkout' },
      nextMilestone: 'After the next checkout is completed and approved, your clearance can be updated.',
      journeyStep: 'checkout',
      severityReason: 'additional_checkout_required',
    })
  }

  // Checkout-first for new customers: the checkout wizard collects docs, terms,
  // Night VFR, and flight review — so do not trap them on "Open Documents".
  if (clearanceStatus === 'checkout_required' && !checkoutSubmitted) {
    const fileIncomplete =
      readiness.missingDocumentItems.length > 0 ||
      readiness.hasExpiredDocument ||
      readiness.termsIncomplete ||
      readiness.nightVfrUnanswered ||
      readiness.flightRecencyMissing

    return buildState({
      phase: 'checkout',
      statusKey: 'checkout_required',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Checkout Required',
      heroMessage: fileIncomplete
        ? 'Book your checkout flight — you can upload required documents as part of the request.'
        : 'Your pilot file is ready for the next step: requesting your checkout flight.',
      actionHeading: 'Request your checkout',
      actionDescription: fileIncomplete
        ? 'Choose a checkout time, then complete your documents, terms, and flight details in the same request flow.'
        : 'Choose a checkout time so the team can review and confirm your assessment booking.',
      primaryAction: { label: 'Request Checkout', href: '/dashboard/checkout' },
      secondaryAction: { label: 'View Documents', href: '/dashboard/documents' },
      nextMilestone: fileIncomplete
        ? 'After you pick a time and upload your documents, the team will review your request and confirm the checkout booking.'
        : 'After you submit a request, the team will review your file and confirm the checkout booking.',
      journeyStep: 'checkout',
      severityReason: 'checkout_required',
    })
  }

  if (readiness.hasExpiredDocument) {
    return buildState({
      phase: 'documents',
      statusKey: 'documents_expired',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Document Update Required',
      heroMessage: 'A required document has expired and needs to be updated.',
      actionHeading: 'Replace your expired document',
      actionDescription: 'Open your pilot documents and upload an up-to-date replacement so your journey can continue without delays.',
      primaryAction: { label: 'Update Documents', href: '/dashboard/documents' },
      nextMilestone: 'After you upload the updated document, the team will review it.',
      journeyStep: 'documents',
      severityReason: 'documents_expired',
    })
  }

  if (clearanceStatus === 'not_currently_eligible') {
    return buildState({
      phase: 'checkout',
      statusKey: 'not_currently_eligible',
      tone: 'danger',
      responsibleActor: 'instructor',
      customerActionRequired: false,
      heroLabel: 'Training Review Required',
      heroMessage: 'Further training is required before solo hire can continue.',
      actionHeading: 'Your next training step will be coordinated with the team',
      actionDescription: 'The current assessment outcome means solo hire is not available yet. Please contact the team to confirm the required training plan.',
      primaryAction: { label: 'Contact Team', href: '/dashboard/messages' },
      waitingMessage: 'No online action is available until the team confirms the required training path.',
      nextMilestone: 'After review, the team can advise whether another checkout or additional training is needed.',
      journeyStep: 'checkout',
      severityReason: 'not_currently_eligible',
    })
  }

  if (readiness.missingDocumentItems.length > 0) {
    const missingNightVfrOnly =
      readiness.nightVfrProofMissing && readiness.missingDocumentItems.length === 1

    return buildState({
      phase: 'documents',
      statusKey: missingNightVfrOnly ? 'night_vfr_proof_required' : 'documents_missing',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: missingNightVfrOnly ? 'Night VFR Proof Required' : 'Documents Required',
      heroMessage: missingNightVfrOnly
        ? 'Night VFR evidence is required before your file can move forward.'
        : 'Required pilot file documents are still missing.',
      actionHeading: missingNightVfrOnly ? 'Upload your Night VFR proof' : 'Upload your required documents',
      actionDescription: missingNightVfrOnly
        ? 'You selected Night VFR on your profile, so supporting evidence must be uploaded before the team can review this part of your file.'
        : 'Open your documents page and upload the missing pilot file items so you can keep moving through checkout or booking readiness.',
      primaryAction: { label: 'Open Documents', href: '/dashboard/documents' },
      nextMilestone: 'After the required documents are uploaded, the team can review your file.',
      journeyStep: 'documents',
      severityReason: missingNightVfrOnly ? 'night_vfr_proof_missing' : 'documents_missing',
    })
  }

  if (readiness.termsIncomplete) {
    return buildState({
      phase: 'documents',
      statusKey: 'terms_not_accepted',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Terms Acceptance Required',
      heroMessage: 'Current booking terms still need to be accepted.',
      actionHeading: 'Accept the current terms',
      actionDescription: 'Review and accept the latest booking terms so you can continue with checkout or aircraft booking eligibility.',
      primaryAction: { label: 'Review Terms', href: '/dashboard/documents' },
      nextMilestone: 'After you accept the current terms, your remaining readiness items can be reassessed.',
      journeyStep: 'documents',
      severityReason: 'terms_not_accepted',
    })
  }

  if (readiness.nightVfrUnanswered) {
    return buildState({
      phase: 'documents',
      statusKey: 'night_vfr_unanswered',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Night VFR Answer Required',
      heroMessage: 'Your Night VFR status still needs to be recorded.',
      actionHeading: 'Answer the Night VFR question',
      actionDescription: 'Open your documents page and confirm whether you hold a Night VFR rating so the correct requirements can be applied.',
      primaryAction: { label: 'Update Documents', href: '/dashboard/documents' },
      nextMilestone: 'After you answer the question, the correct document requirements will be applied automatically.',
      journeyStep: 'documents',
      severityReason: 'night_vfr_unanswered',
    })
  }

  if (readiness.flightRecencyMissing) {
    return buildState({
      phase: 'documents',
      statusKey: 'flight_recency_required',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Flight Review Date Required',
      heroMessage: 'A valid last flight review date is required before you can continue.',
      actionHeading: 'Add your last flight review date',
      actionDescription: 'Open your documents page and record a valid last flight review date so the team can confirm your current flying recency.',
      primaryAction: { label: 'Update Flight Review', href: '/dashboard/documents' },
      nextMilestone: 'After your flight review date is saved, the remaining readiness checks can continue.',
      journeyStep: 'documents',
      severityReason: 'flight_recency_missing_or_invalid',
    })
  }

  if (clearanceStatus === 'checkout_payment_required') {
    if (checkoutPaymentState.kind === 'proof_under_review') {
      return buildState({
        phase: 'checkout_payment',
        statusKey: 'checkout_payment_proof_under_review',
        tone: 'info',
        responsibleActor: 'admin',
        customerActionRequired: false,
        heroLabel: 'Payment Proof Under Review',
        heroMessage: 'Your checkout payment proof has been submitted and is awaiting admin review.',
        actionHeading: 'Your payment proof is under review',
        actionDescription: 'You have already completed this step. The team is reviewing your bank transfer proof before your checkout result is finalised.',
        secondaryAction: {
          label: 'View Payment Details',
          href: bookingPaymentHref(input.checkoutPayment?.bookingId),
        },
        waitingMessage: 'No action is required from you right now.',
        nextMilestone: 'After payment is confirmed, your checkout outcome can continue to the next stage.',
        journeyStep: 'approved',
        severityReason: 'checkout_payment_under_review',
      })
    }

    if (checkoutPaymentState.kind === 'payment_approved') {
      return buildState({
        phase: 'checkout_review',
        statusKey: 'checkout_payment_approved_processing',
        tone: 'info',
        responsibleActor: 'admin',
        customerActionRequired: false,
        heroLabel: 'Payment Received',
        heroMessage: 'Your checkout payment has been approved and the dashboard is waiting for the next status update.',
        actionHeading: 'Payment received',
        actionDescription: 'Your bank transfer has already been approved. The team is finalising the related checkout status update now.',
        secondaryAction: {
          label: 'View Checkout Details',
          href: bookingPaymentHref(input.checkoutPayment?.bookingId),
        },
        waitingMessage: 'No action is required from you right now.',
        nextMilestone: 'After processing completes, your checkout status will advance automatically.',
        journeyStep: 'approved',
        severityReason: 'checkout_payment_approved',
      })
    }

    return buildState({
      phase: 'checkout_payment',
      statusKey: 'checkout_payment_required',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Payment Required',
      heroMessage: 'Your checkout invoice is ready and must be paid before the next stage can continue.',
      actionHeading: 'Complete your checkout payment',
      actionDescription: 'Open your checkout booking to pay by card or upload bank transfer proof so the team can confirm payment.',
      primaryAction: {
        label: 'Complete Payment',
        href: bookingPaymentHref(input.checkoutPayment?.bookingId),
      },
      secondaryAction: { label: 'View Checkout Details', href: bookingPaymentHref(input.checkoutPayment?.bookingId) },
      nextMilestone: 'After payment is confirmed, your checkout result can move to the next approval stage.',
      journeyStep: 'approved',
      severityReason: 'checkout_payment_required',
    })
  }

  if (input.hasPendingAdminProposal) {
    return buildState({
      phase: 'checkout',
      statusKey: 'checkout_time_proposed',
      tone: 'warning',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Action Required',
      heroMessage: 'The operations team proposed a new time for your checkout flight. Please review and respond.',
      actionHeading: 'Action Required: Review Proposed Checkout Time',
      actionDescription: 'OZRentAPlane proposed a new time for your checkout flight. Review the time in your bookings or messages to accept or decline.',
      primaryAction: {
        label: 'Review new proposed time',
        href: input.checkoutBookingId
          ? `/dashboard/bookings/${input.checkoutBookingId}?reviewProposal=1`
          : '/dashboard/bookings?reviewProposal=1',
      },
      secondaryAction: { label: 'Open Chat', href: '/dashboard/messages' },
      nextMilestone: 'Accept the proposed time or decline to keep your requested slot.',
      journeyStep: 'checkout',
      severityReason: 'checkout_time_proposed',
    })
  }

  if (input.hasPendingCheckoutReschedule) {
    return buildState({
      phase: 'checkout',
      statusKey: 'checkout_reschedule_requested',
      tone: 'info',
      responsibleActor: 'admin',
      customerActionRequired: false,
      heroLabel: 'Reschedule Requested',
      heroMessage: 'Your reschedule request has been submitted and is waiting for team review. Your current slot stays active until a decision is made.',
      actionHeading: 'Your reschedule request is waiting for review',
      actionDescription: 'Our team is reviewing your proposed new checkout time. Your current slot remains reserved until a decision is made.',
      secondaryAction: { label: 'View Checkout', href: input.checkoutBookingId ? `/dashboard/bookings/${input.checkoutBookingId}` : '/dashboard/bookings' },
      waitingMessage: 'No action is required from you right now.',
      nextMilestone: 'After review, your checkout booking time will be updated.',
      journeyStep: 'checkout',
      severityReason: 'checkout_reschedule_requested',
    })
  }

  if (clearanceStatus === 'checkout_requested') {
    return buildState({
      phase: 'checkout',
      statusKey: 'checkout_requested',
      tone: 'info',
      responsibleActor: 'admin',
      customerActionRequired: false,
      heroLabel: 'Checkout Requested',
      heroMessage: 'Your checkout request has been submitted and is waiting for team confirmation.',
      actionHeading: 'Your checkout request is waiting for review',
      actionDescription: 'The team is reviewing your requested checkout slot and will confirm it or suggest a different time if needed.',
      secondaryAction: { label: 'View Checkout', href: input.checkoutBookingId ? `/dashboard/bookings/${input.checkoutBookingId}` : '/dashboard/bookings' },
      waitingMessage: 'No action is required from you right now.',
      nextMilestone: 'After review, your checkout booking will be confirmed or rescheduled.',
      journeyStep: 'checkout',
      severityReason: 'checkout_requested',
    })
  }

  if (clearanceStatus === 'checkout_confirmed') {
    return buildState({
      phase: 'checkout',
      statusKey: 'checkout_confirmed',
      tone: 'info',
      responsibleActor: 'instructor',
      customerActionRequired: false,
      heroLabel: 'Checkout Confirmed',
      heroMessage: 'Your checkout booking is confirmed and no online action is required before the flight.',
      actionHeading: 'Your checkout is booked',
      actionDescription: 'Review the booking details and arrive ready for your checkout flight. The next step after the flight is instructor assessment.',
      primaryAction: { label: 'View Booking', href: input.checkoutBookingId ? `/dashboard/bookings/${input.checkoutBookingId}` : '/dashboard/bookings' },
      waitingMessage: 'No action is required from you right now.',
      nextMilestone: 'After the checkout flight, your instructor outcome will be recorded.',
      journeyStep: 'checkout',
      severityReason: 'checkout_confirmed',
    })
  }

  if (checkoutPaymentState.kind === 'proof_under_review') {
    return buildState({
      phase: 'checkout_review',
      statusKey: 'checkout_payment_proof_under_review_fallback',
      tone: 'info',
      responsibleActor: 'admin',
      customerActionRequired: false,
      heroLabel: 'Payment Proof Under Review',
      heroMessage: 'Your payment proof is already with the team for review.',
      actionHeading: 'Payment proof received',
      actionDescription: 'You have already submitted your payment proof. The team will confirm it and advance the next checkout step.',
      secondaryAction: { label: 'View Details', href: bookingPaymentHref(input.checkoutPayment?.bookingId) },
      waitingMessage: 'No action is required from you right now.',
      nextMilestone: 'After confirmation, the next checkout status will appear automatically.',
      journeyStep: 'approved',
      severityReason: 'checkout_payment_under_review',
    })
  }

  if (clearanceStatus === 'checkout_completed_under_review') {
    return buildState({
      phase: 'checkout_review',
      statusKey: 'checkout_outcome_under_review',
      tone: 'info',
      responsibleActor: 'instructor',
      customerActionRequired: false,
      heroLabel: 'Checkout Under Review',
      heroMessage: 'Your checkout has been completed and is waiting for the outcome review.',
      actionHeading: 'Your checkout outcome is being reviewed',
      actionDescription: 'The instructor and operations team are reviewing your completed checkout before the final clearance decision is recorded.',
      secondaryAction: { label: 'View Checkout', href: input.checkoutBookingId ? `/dashboard/bookings/${input.checkoutBookingId}` : '/dashboard/bookings' },
      waitingMessage: 'No action is required from you right now.',
      nextMilestone: 'After review, the team will either clear you, request another checkout, or advise the next training step.',
      journeyStep: 'approved',
      severityReason: 'checkout_outcome_under_review',
    })
  }

  if (!input.canCreateStandardBooking && input.profile.account_status === 'active' && readiness.hasDocumentsAwaitingReview) {
    return buildState({
      phase: 'documents',
      statusKey: 'documents_under_review',
      tone: 'info',
      responsibleActor: 'admin',
      customerActionRequired: false,
      heroLabel: 'Documents Under Review',
      heroMessage: 'Your file has been submitted and is waiting for document approval.',
      actionHeading: 'Your documents are under review',
      actionDescription: 'Your required documents have been submitted. The team is reviewing them before aircraft booking can be unlocked.',
      secondaryAction: { label: 'View Documents', href: '/dashboard/documents' },
      waitingMessage: 'No action is required from you right now.',
      nextMilestone: 'After the remaining documents are approved, aircraft booking will become available.',
      journeyStep: 'documents',
      severityReason: 'documents_under_review',
    })
  }

  if (input.bookingFocusState?.mode === 'upcoming_confirmed') {
    return buildState({
      phase: 'booking',
      statusKey: 'upcoming_booking_confirmed',
      tone: 'info',
      responsibleActor: 'none',
      customerActionRequired: false,
      heroLabel: 'Booking Confirmed',
      heroMessage: 'Your upcoming booking is confirmed.',
      actionHeading: 'Your next flight is booked',
      actionDescription: 'Review the booking details, aircraft, and timing before you arrive. No further action is needed unless something changes.',
      primaryAction: { label: 'Submit Post Flight Records', href: `/dashboard/bookings/${input.bookingFocusState.bookingId}?action=flight_record` },
      secondaryAction: { label: 'View Booking', href: `/dashboard/bookings/${input.bookingFocusState.bookingId}` },
      waitingMessage: 'No action is required from you right now.',
      nextMilestone: 'After the flight, you will submit your post-flight records.',
      journeyStep: 'ready',
      severityReason: 'upcoming_booking_confirmed',
    })
  }

  if (input.canCreateStandardBooking) {
    return buildState({
      phase: 'cleared',
      statusKey: 'cleared_ready_to_book',
      tone: 'success',
      responsibleActor: 'customer',
      customerActionRequired: true,
      heroLabel: 'Cleared to Fly',
      heroMessage: 'You are cleared and ready to book an aircraft.',
      actionHeading: 'Book your next aircraft',
      actionDescription: 'Your clearance and readiness checks are complete. Choose an aircraft booking time whenever you are ready.',
      primaryAction: { label: 'Book an Aircraft', href: '/dashboard/bookings/new' },
      secondaryAction: { label: 'View My Bookings', href: '/dashboard/bookings' },
      nextMilestone: 'After you book a flight, the dashboard will show your confirmed booking details here.',
      journeyStep: 'ready',
      severityReason: 'cleared_ready_to_book',
    })
  }

  if (input.activeBooking?.status === 'completed') {
    return buildState({
      phase: 'completed',
      statusKey: 'completed_no_current_action',
      tone: 'neutral',
      responsibleActor: 'none',
      customerActionRequired: false,
      heroLabel: 'All Up To Date',
      heroMessage: 'You do not have any active dashboard tasks right now.',
      actionHeading: 'No action is required right now',
      actionDescription: 'Your most recent booking is completed and there are no outstanding actions on your dashboard at the moment.',
      secondaryAction: { label: 'View Booking History', href: '/dashboard/bookings' },
      nextMilestone: 'Your next actionable update will appear here automatically.',
      journeyStep: fallbackJourneyStepForClearance(clearanceStatus),
      severityReason: 'completed_no_current_action',
    })
  }

  return buildState({
    phase: 'completed',
    statusKey: 'safe_fallback',
    tone: 'neutral',
    responsibleActor: 'system',
    customerActionRequired: false,
    heroLabel: 'Status Updating',
    heroMessage: 'Your dashboard is checking the latest information.',
    actionHeading: 'We are checking your current status',
    actionDescription: 'Some of your recent information could not be resolved into a single next step, so we are showing a safe fallback instead of a misleading action.',
    secondaryAction: { label: 'View My Bookings', href: '/dashboard/bookings' },
    waitingMessage: 'No action is required from you right now.',
    nextMilestone: 'Refresh the page or open your bookings for the latest detail view.',
    journeyStep: fallbackJourneyStepForClearance(clearanceStatus),
    severityReason: 'safe_fallback',
  })
}
