/**
 * Admin clearance override cascade helpers.
 *
 * When an admin sets clearance via "Update checkout result" (friend/power path),
 * these helpers resolve side effects for documents and open checkout bookings.
 * All four UI outcomes complete open mid-flow bookings and settle payment
 * (paid invoice) like "Mark as Already Paid", without requiring VDO/landing entry.
 */

export const MID_FLOW_CHECKOUT_STATUSES = [
  'checkout_requested',
  'checkout_confirmed',
  'checkout_completed_under_review',
  'checkout_payment_required',
  'on_hold_pending_documents',
] as const

export type MidFlowCheckoutStatus = (typeof MID_FLOW_CHECKOUT_STATUSES)[number]

/** Document types auto-approved on clearance override (uploaded only). */
export const OVERRIDE_APPROVABLE_DOC_TYPES = [
  'pilot_licence',
  'medical_certificate',
  'photo_id',
  'night_vfr_evidence',
] as const

export type BookingOverrideAction = 'complete' | 'cancel'

/**
 * Decide how to resolve an open mid-flow checkout booking for a given override status.
 * All four UI override outcomes complete open mid-flow bookings (bypass docs/payment),
 * matching normal checkout outcome flow — they must not leave the booking as cancelled.
 */
export function resolveCheckoutBookingAction(
  overrideStatus: string,
  _bookingStatus: string,
): BookingOverrideAction | null {
  if (
    overrideStatus === 'cleared_to_fly' ||
    overrideStatus === 'checkout_required' ||
    overrideStatus === 'additional_checkout_required' ||
    overrideStatus === 'not_currently_eligible'
  ) {
    return 'complete'
  }

  return null
}

export function clearanceOverrideNotification(status: string): {
  title: string
  body: string
} {
  switch (status) {
    case 'cleared_to_fly':
      return {
        title: 'Cleared to fly',
        body: 'An administrator has cleared you to fly. Your documents have been approved and you may book aircraft when ready.',
      }
    case 'checkout_required':
      return {
        title: 'Checkout required',
        body: 'An administrator has set your status to checkout required. Please submit a checkout flight request when ready.',
      }
    case 'additional_checkout_required':
      return {
        title: 'Additional checkout required',
        body: 'An administrator has marked that an additional checkout session is required before you can be cleared to fly.',
      }
    case 'not_currently_eligible':
      return {
        title: 'Not currently eligible',
        body: 'An administrator has marked you as not currently eligible for aircraft hire. Contact operations if you have questions.',
      }
    default:
      return {
        title: 'Clearance status updated',
        body: `An administrator updated your clearance status to ${status.replace(/_/g, ' ')}.`,
      }
  }
}
