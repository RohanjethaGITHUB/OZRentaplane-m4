import { CHECKOUT_BLOCKING_DOCUMENT_TYPES } from '@/lib/checkout-document-gate'
import type { Profile, UserDocument } from '@/lib/supabase/types'

export type CustomerOnboardingStateKey =
  | 'account_blocked'
  | 'cleared_to_fly'
  | 'checkout_flight_booked'
  | 'checkout_waiting_admin'
  | 'action_required'
  | 'ready_for_checkout'
  | 'incomplete_documents'
  | 'no_documents'

export const ONBOARDING_DOCUMENT_LABELS: Record<string, string> = {
  pilot_licence: 'Pilot Licence',
  medical_certificate: 'Medical Certificate',
  photo_id: 'Photo ID',
}

export type EvaluatedOnboardingState = {
  stateKey: CustomerOnboardingStateKey
  customerActionRequired: boolean
  adminActionRequired: boolean
  missingDocumentKeys: string[]
  missingDocumentLabels: string[]
  actionReason?: string
  actionUrl?: string
  pendingCheckoutBookingId?: string
  pendingCheckoutRequestedTime?: string
  pendingCheckoutCreatedAt?: string
}

export type CustomerOnboardingInput = {
  profile: Pick<
    Profile,
    'id' | 'account_status' | 'pilot_clearance_status' | 'has_night_vfr_rating' | 'full_name' | 'email' | 'created_at'
  >
  documents: Pick<UserDocument, 'id' | 'document_type' | 'status' | 'expiry_date' | 'created_at' | 'updated_at'>[]
  checkoutBookings: {
    id: string
    status: string
    booking_type: string
    scheduled_start: string | null
    scheduled_end: string | null
    created_at: string
    checkout_lifecycle_status?: string | null
  }[]
}

/**
 * Evaluates the customer's current actionable onboarding state at runtime.
 * Strictly respects the Night VFR non-blocking exception.
 */
export function evaluateCustomerOnboardingState(
  input: CustomerOnboardingInput,
): EvaluatedOnboardingState {
  const { profile, documents, checkoutBookings } = input

  // 1. Account blocked / restricted
  if (profile.account_status === 'blocked') {
    return {
      stateKey: 'account_blocked',
      customerActionRequired: false,
      adminActionRequired: false,
      missingDocumentKeys: [],
      missingDocumentLabels: [],
    }
  }

  // 2. Already cleared to fly (sequence completed)
  if (profile.pilot_clearance_status === 'cleared_to_fly') {
    return {
      stateKey: 'cleared_to_fly',
      customerActionRequired: false,
      adminActionRequired: false,
      missingDocumentKeys: [],
      missingDocumentLabels: [],
    }
  }

  // 3. Inspect checkout bookings
  const activeCheckoutBookings = checkoutBookings.filter(
    (b) => b.booking_type === 'checkout' && b.status !== 'cancelled',
  )

  const confirmedBooking = activeCheckoutBookings.find(
    (b) => (b.status === 'confirmed' || b.status === 'checkout_confirmed') && Boolean(b.scheduled_start),
  )

  if (confirmedBooking) {
    // Checkout flight is already booked and scheduled
    return {
      stateKey: 'checkout_flight_booked',
      customerActionRequired: false,
      adminActionRequired: false,
      missingDocumentKeys: [],
      missingDocumentLabels: [],
    }
  }

  // Check if admin requested changes or reschedule
  const clearanceStatus = profile.pilot_clearance_status
  if (
    clearanceStatus === 'additional_checkout_required' ||
    clearanceStatus === 'checkout_reschedule_required' ||
    clearanceStatus === 'not_currently_eligible'
  ) {
    return {
      stateKey: 'action_required',
      customerActionRequired: true,
      adminActionRequired: false,
      missingDocumentKeys: [],
      missingDocumentLabels: [],
      actionReason:
        clearanceStatus === 'checkout_reschedule_required'
          ? 'Your checkout flight requires rescheduling. Please select a new date and time.'
          : 'The OZ Rent A Plane team has requested additional information or review for your checkout.',
      actionUrl: '/dashboard/checkout',
    }
  }

  const pendingBooking = activeCheckoutBookings.find(
    (b) => b.status === 'pending' || b.status === 'checkout_requested',
  )
  if (pendingBooking) {
    if (pendingBooking.checkout_lifecycle_status === 'reschedule_requested') {
      return {
        stateKey: 'action_required',
        customerActionRequired: true,
        adminActionRequired: false,
        missingDocumentKeys: [],
        missingDocumentLabels: [],
        actionReason: 'A new checkout flight time was proposed by the team and is awaiting your confirmation.',
        actionUrl: `/dashboard/bookings/${pendingBooking.id}`,
      }
    }

    // Standard pending checkout request waiting on admin review
    return {
      stateKey: 'checkout_waiting_admin',
      customerActionRequired: false,
      adminActionRequired: true,
      missingDocumentKeys: [],
      missingDocumentLabels: [],
      pendingCheckoutBookingId: pendingBooking.id,
      pendingCheckoutRequestedTime: pendingBooking.scheduled_start ?? pendingBooking.created_at,
      pendingCheckoutCreatedAt: pendingBooking.created_at,
    }
  }

  // 4. Inspect blocking documents (Night VFR is intentionally non-blocking)
  const blockingDocTypes = CHECKOUT_BLOCKING_DOCUMENT_TYPES as readonly string[]

  // Check for rejected blocking documents
  const rejectedBlockingDoc = documents.find(
    (d) => blockingDocTypes.includes(d.document_type) && d.status === 'rejected',
  )
  if (rejectedBlockingDoc) {
    const label = ONBOARDING_DOCUMENT_LABELS[rejectedBlockingDoc.document_type] ?? 'document'
    return {
      stateKey: 'action_required',
      customerActionRequired: true,
      adminActionRequired: false,
      missingDocumentKeys: [rejectedBlockingDoc.document_type],
      missingDocumentLabels: [label],
      actionReason: `Your ${label} was reviewed and requires replacement. Please upload an updated copy.`,
      actionUrl: '/dashboard/documents',
    }
  }

  // Check valid blocking documents present (uploaded or approved, not expired)
  const validUploadedTypes = new Set<string>(
    documents
      .filter(
        (d) =>
          blockingDocTypes.includes(d.document_type) &&
          (d.status === 'approved' || d.status === 'uploaded'),
      )
      .map((d) => d.document_type),
  )

  const missingKeys = (blockingDocTypes as readonly string[]).filter((t) => !validUploadedTypes.has(t))
  const missingLabels = missingKeys.map((k) => ONBOARDING_DOCUMENT_LABELS[k] ?? k)

  // No documents uploaded at all
  if (validUploadedTypes.size === 0) {
    return {
      stateKey: 'no_documents',
      customerActionRequired: true,
      adminActionRequired: false,
      missingDocumentKeys: missingKeys,
      missingDocumentLabels: missingLabels,
    }
  }

  // Some documents uploaded, but not all 3
  if (missingKeys.length > 0) {
    return {
      stateKey: 'incomplete_documents',
      customerActionRequired: true,
      adminActionRequired: false,
      missingDocumentKeys: missingKeys,
      missingDocumentLabels: missingLabels,
    }
  }

  // All 3 blocking documents uploaded and valid, and no checkout requested yet
  return {
    stateKey: 'ready_for_checkout',
    customerActionRequired: true,
    adminActionRequired: false,
    missingDocumentKeys: [],
    missingDocumentLabels: [],
  }
}
