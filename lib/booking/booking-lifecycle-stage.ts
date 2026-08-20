import { getStandardBookingPaymentDisplayState } from './standard-booking-payment-state'
import { isAwaitingFlightRecordDue, type FlightRecordStatusRow } from './flight-record-status'

export type BookingLifecycleTone = 'slate' | 'gray' | 'blue' | 'amber' | 'purple' | 'green' | 'rose' | 'orange'

export type BookingLifecycleStageKey =
  | 'booked'
  | 'upcoming'
  | 'in_progress'
  | 'awaiting_flight_readings'
  | 'readings_submitted'
  | 'payment_required'
  | 'payment_still_due'
  | 'payment_review_pending'
  | 'paid_closed'
  | 'waived_closed'
  | 'payment_void'
  | 'payment_failed'
  | 'cancelled'
  | 'no_show'
  | 'admin_hold'
  | 'needs_clarification'
  | 'checkout_requested'
  | 'checkout_confirmed'
  | 'checkout_completed_under_review'
  | 'checkout_payment_required'
  | 'draft'
  | 'unknown'

export type BookingLifecycleStage = {
  key: BookingLifecycleStageKey
  label: string
  tone: BookingLifecycleTone
  sublabel?: string | null
}

export type BookingLifecycleInput = {
  bookingStatus?: string | null
  scheduledStart?: string | null
  scheduledEnd?: string | null
  flightRecordStatus?: string | null
  flightRecords?: FlightRecordStatusRow[] | null
  bookingInvoiceStatus?: string | null
  bookingInvoicePaidAt?: string | null
  bookingInvoiceAmountDueCents?: number | null
  bookingInvoiceTotalPaidCents?: number | null
  latestBankTransferSubmissionStatus?: string | null
  paymentStatus?: string | null
}

const STANDARD_BOOKED = new Set(['draft', 'pending_confirmation'])
const STANDARD_UPCOMING = new Set(['confirmed', 'ready_for_dispatch'])
const STANDARD_IN_PROGRESS = new Set(['dispatched'])
const STANDARD_AWAITING_READINGS = new Set(['awaiting_flight_record', 'flight_record_overdue'])
const STANDARD_REVIEW = new Set(['pending_post_flight_review'])
const STANDARD_SETTLED = new Set(['invoice_generated', 'payment_pending', 'paid', 'completed', 'post_flight_approved'])

const CHECKOUT_STATUS_MAP: Record<string, BookingLifecycleStage> = {
  checkout_requested: { key: 'checkout_requested', label: 'Checkout Requested', tone: 'blue', sublabel: 'Awaiting review' },
  checkout_confirmed: { key: 'checkout_confirmed', label: 'Checkout Confirmed', tone: 'green', sublabel: 'Scheduled' },
  checkout_completed_under_review: {
    key: 'checkout_completed_under_review',
    label: 'Checkout Under Review',
    tone: 'amber',
    sublabel: 'Awaiting outcome',
  },
  checkout_payment_required: {
    key: 'checkout_payment_required',
    label: 'Checkout Payment Required',
    tone: 'orange',
    sublabel: 'Payment needed before bookings unlock',
  },
}

const EXCEPTION_STATUS_MAP: Record<string, BookingLifecycleStage> = {
  cancelled: { key: 'cancelled', label: 'Cancelled', tone: 'rose' },
  no_show: { key: 'no_show', label: 'No Show', tone: 'rose', sublabel: 'Booking did not proceed' },
  admin_hold: { key: 'admin_hold', label: 'On Hold', tone: 'amber', sublabel: 'Held by operations' },
  needs_clarification: {
    key: 'needs_clarification',
    label: 'Needs Clarification',
    tone: 'amber',
    sublabel: 'Customer response required',
  },
}

function cleanStatus(value?: string | null) {
  return value ?? ''
}

function settleLabel(input: BookingLifecycleInput): BookingLifecycleStage {
  const bookingStatus = cleanStatus(input.bookingStatus)
  const flightRecordStatus = cleanStatus(input.flightRecordStatus)
  const bookingInvoiceStatus = cleanStatus(input.bookingInvoiceStatus)
  const paymentStatus = cleanStatus(input.paymentStatus)

  if (bookingStatus in CHECKOUT_STATUS_MAP) {
    return CHECKOUT_STATUS_MAP[bookingStatus]
  }

  if (bookingStatus in EXCEPTION_STATUS_MAP) {
    return EXCEPTION_STATUS_MAP[bookingStatus]
  }

  if (STANDARD_BOOKED.has(bookingStatus)) {
    return {
      key: bookingStatus === 'draft' ? 'draft' : 'booked',
      label: bookingStatus === 'draft' ? 'Draft' : 'Booked',
      tone: 'gray',
      sublabel: bookingStatus === 'draft' ? 'Not yet confirmed' : 'Awaiting confirmation',
    }
  }

  const isAwaitingRecord = isAwaitingFlightRecordDue({
    status: bookingStatus,
    scheduled_start: input.scheduledStart,
    scheduled_end: input.scheduledEnd,
    flight_records: input.flightRecords ?? (input.flightRecordStatus ? [{ status: input.flightRecordStatus }] : null),
  })

  if (isAwaitingRecord || STANDARD_AWAITING_READINGS.has(bookingStatus)) {
    return {
      key: 'awaiting_flight_readings',
      label: 'Awaiting Flight Record',
      tone: 'amber',
      sublabel: 'Flight completed · Awaiting flight record submission',
    }
  }

  if (STANDARD_UPCOMING.has(bookingStatus)) {
    return {
      key: 'upcoming',
      label: 'Upcoming',
      tone: 'blue',
      sublabel: bookingStatus === 'ready_for_dispatch' ? 'Ready for dispatch' : 'Confirmed booking',
    }
  }

  if (STANDARD_IN_PROGRESS.has(bookingStatus)) {
    return {
      key: 'in_progress',
      label: 'In Progress',
      tone: 'amber',
      sublabel: 'Flight underway',
    }
  }

  if (STANDARD_REVIEW.has(bookingStatus)) {
    const sublabel =
      flightRecordStatus === 'needs_clarification'
        ? 'Needs clarification'
        : flightRecordStatus === 'resubmitted'
          ? 'Resubmitted for review'
          : flightRecordStatus === 'approved' || flightRecordStatus === 'approved_with_correction' || flightRecordStatus === 'locked'
            ? 'Ready for billing'
            : 'Awaiting payment review'

    return {
      key: 'readings_submitted',
      label: 'Readings Submitted',
      tone: 'purple',
      sublabel,
    }
  }

  if (STANDARD_SETTLED.has(bookingStatus)) {
    const paymentDisplayState = getStandardBookingPaymentDisplayState({
      bookingStatus,
      invoiceStatus: bookingInvoiceStatus,
      invoicePaidAt: input.bookingInvoicePaidAt,
      invoiceAmountDueCents: input.bookingInvoiceAmountDueCents,
      invoiceTotalPaidCents: input.bookingInvoiceTotalPaidCents,
      latestSubmissionStatus: input.latestBankTransferSubmissionStatus,
      paymentStatus,
    })

    switch (paymentDisplayState) {
      case 'payment_review_pending':
        return {
          key: 'payment_review_pending',
          label: 'Payment Review Pending',
          tone: 'amber',
          sublabel: 'Booking closed · Bank transfer awaiting admin review',
        }
      case 'payment_proof_rejected':
      case 'payment_required':
      case 'payment_still_due':
        return {
          key: paymentDisplayState === 'payment_still_due' ? 'payment_still_due' : 'payment_required',
          label: paymentDisplayState === 'payment_still_due' ? 'Payment Still Due' : 'Payment Required',
          tone: 'orange',
          sublabel:
            paymentDisplayState === 'payment_proof_rejected'
              ? 'Booking closed · Previous bank transfer proof was rejected'
              : paymentDisplayState === 'payment_still_due'
                ? 'Booking closed · Partial payment recorded, balance still outstanding'
                : 'Booking closed · Awaiting payment',
        }
      case 'waived':
        return {
          key: 'waived_closed',
          label: 'Waived / Closed',
          tone: 'green',
          sublabel: 'No payment required',
        }
      case 'void':
        return {
          key: 'payment_void',
          label: 'Payment Void',
          tone: 'slate',
          sublabel: 'Payment no longer required',
        }
      case 'failed':
        return {
          key: 'payment_failed',
          label: 'Payment Failed',
          tone: 'rose',
          sublabel: 'Payment attempt unsuccessful',
        }
      case 'paid':
        return {
          key: 'paid_closed',
          label: 'Paid / Closed',
          tone: 'green',
          sublabel: 'Payment confirmed',
        }
      default:
        return {
          key: 'unknown',
          label: bookingStatus ? bookingStatus.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()) : 'Unknown',
          tone: 'slate',
          sublabel: 'Booking closed',
        }
    }
  }

  if (bookingStatus === 'pending_checkout_clearance' || bookingStatus === 'released_due_to_checkout') {
    return {
      key: 'admin_hold',
      label: bookingStatus === 'pending_checkout_clearance' ? 'Checkout Clearance Required' : 'Released Due to Checkout',
      tone: 'amber',
      sublabel: bookingStatus === 'pending_checkout_clearance' ? 'Clearance pending' : 'Cleared for checkout flow',
    }
  }

  return {
    key: 'unknown',
    label: bookingStatus ? bookingStatus.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()) : 'Unknown',
    tone: 'slate',
    sublabel: null,
  }
}

export function deriveBookingLifecycleStage(input: BookingLifecycleInput): BookingLifecycleStage {
  return settleLabel(input)
}
