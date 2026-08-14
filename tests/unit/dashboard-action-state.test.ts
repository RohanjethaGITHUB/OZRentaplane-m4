import test from 'node:test'
import assert from 'node:assert/strict'

import { evaluateBookingReadinessDecision } from '../../lib/booking-readiness'
import {
  resolveDashboardActionState,
  type DashboardActionStateInput,
} from '../../lib/dashboard/dashboard-action-state'
import type { UserDocument } from '../../lib/supabase/types'

function approvedDocument(type: UserDocument['document_type']): UserDocument {
  return {
    id: `${type}-1`,
    user_id: 'user-1',
    document_type: type,
    file_name: `${type}.pdf`,
    storage_path: `${type}.pdf`,
    status: 'approved',
    review_notes: null,
    uploaded_at: '2026-07-10T00:00:00.000Z',
    expiry_date: type === 'medical_certificate' ? '2027-07-10' : null,
    issue_date: null,
    reviewed_at: '2026-07-10T00:00:00.000Z',
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    licence_type: null,
    licence_number: null,
    medical_class: null,
    id_type: null,
    document_number: null,
    has_red_card: null,
    red_card_expiry_month: null,
    red_card_expiry_year: null,
  }
}

function uploadedDocument(type: UserDocument['document_type']): UserDocument {
  return {
    ...approvedDocument(type),
    id: `${type}-uploaded`,
    status: 'uploaded',
  }
}

function rejectedDocument(type: UserDocument['document_type']): UserDocument {
  return {
    ...approvedDocument(type),
    id: `${type}-rejected`,
    status: 'rejected',
  }
}

function baseDocuments(includeNightVfr = false): UserDocument[] {
  const docs = [
    approvedDocument('pilot_licence'),
    approvedDocument('medical_certificate'),
    approvedDocument('photo_id'),
  ]
  if (includeNightVfr) docs.push(approvedDocument('night_vfr_evidence'))
  return docs
}

function buildInput(overrides: Partial<DashboardActionStateInput> = {}): DashboardActionStateInput {
  const profile = {
    account_status: 'active' as const,
    account_lock_reason: null,
    pilot_clearance_status: 'checkout_required' as const,
    has_night_vfr_rating: false,
    last_flight_date: '2026-06-15',
  }

  const documents = baseDocuments(false)
  const bookingReadiness = evaluateBookingReadinessDecision({
    clearanceStatus: profile.pilot_clearance_status,
    hasHistoricalClearance: false,
    hasPaidCheckoutInvoice: false,
    documents,
    hasNightVfrRating: profile.has_night_vfr_rating,
    lastFlightDate: profile.last_flight_date,
    termsAccepted: true,
  })

  return {
    profile,
    documents,
    bookingReadiness,
    canCreateStandardBooking: false,
    hasManualCheckoutClearance: false,
    checkoutBookingId: null,
    checkoutPayment: null,
    bookingFocusState: null,
    flightSnapshotBooking: null,
    activeBooking: null,
    ...overrides,
  }
}

test('no-show lock overrides cleared state', () => {
  const state = resolveDashboardActionState(
    buildInput({
      profile: {
        account_status: 'blocked',
        account_lock_reason: 'checkout_no_show',
        pilot_clearance_status: 'cleared_to_fly',
        has_night_vfr_rating: false,
        last_flight_date: '2026-06-15',
      },
      canCreateStandardBooking: true,
    }),
  )

  assert.equal(state.statusKey, 'account_locked_no_show')
  assert.equal(state.primaryAction?.href, '/dashboard/messages')
})

test('no-show lock overrides an upcoming booking', () => {
  const state = resolveDashboardActionState(
    buildInput({
      profile: {
        account_status: 'blocked',
        account_lock_reason: 'checkout_no_show',
        pilot_clearance_status: 'cleared_to_fly',
        has_night_vfr_rating: false,
        last_flight_date: '2026-06-15',
      },
      bookingFocusState: { mode: 'upcoming_confirmed', bookingId: 'booking-1' },
      flightSnapshotBooking: {
        id: 'booking-1',
        bookingType: 'standard',
        status: 'confirmed',
        scheduledStart: '2026-07-20T10:00:00.000Z',
        scheduledEnd: '2026-07-20T12:00:00.000Z',
        aircraftRegistration: 'VH-OZR',
      },
    }),
  )

  assert.equal(state.statusKey, 'account_locked_no_show')
})

test('missing documents prevent the standard booking CTA', () => {
  const documents = [approvedDocument('pilot_licence')]
  const state = resolveDashboardActionState(
    buildInput({
      documents,
      bookingReadiness: evaluateBookingReadinessDecision({
        clearanceStatus: 'cleared_to_fly',
        hasHistoricalClearance: true,
        hasPaidCheckoutInvoice: false,
        documents,
        hasNightVfrRating: false,
        lastFlightDate: '2026-06-15',
        termsAccepted: true,
      }),
      profile: {
        account_status: 'active',
        account_lock_reason: null,
        pilot_clearance_status: 'cleared_to_fly',
        has_night_vfr_rating: false,
        last_flight_date: '2026-06-15',
      },
    }),
  )

  assert.equal(state.statusKey, 'documents_missing')
  assert.notEqual(state.primaryAction?.href, '/dashboard/bookings/new')
})

test('terms incomplete blocks booking access', () => {
  const documents = baseDocuments(false)
  const state = resolveDashboardActionState(
    buildInput({
      profile: {
        account_status: 'active',
        account_lock_reason: null,
        pilot_clearance_status: 'cleared_to_fly',
        has_night_vfr_rating: false,
        last_flight_date: '2026-06-15',
      },
      documents,
      bookingReadiness: evaluateBookingReadinessDecision({
        clearanceStatus: 'cleared_to_fly',
        hasHistoricalClearance: true,
        hasPaidCheckoutInvoice: false,
        documents,
        hasNightVfrRating: false,
        lastFlightDate: '2026-06-15',
        termsAccepted: false,
      }),
    }),
  )

  assert.equal(state.statusKey, 'terms_not_accepted')
  assert.notEqual(state.primaryAction?.href, '/dashboard/bookings/new')
})

test('night vfr false completes that requirement and allows checkout request state', () => {
  const state = resolveDashboardActionState(buildInput())

  assert.equal(state.statusKey, 'checkout_required')
  assert.equal(state.primaryAction?.href, '/dashboard/checkout')
})

test('checkout required with missing documents still routes to checkout', () => {
  const documents = [approvedDocument('pilot_licence')]
  const state = resolveDashboardActionState(
    buildInput({
      documents,
      bookingReadiness: evaluateBookingReadinessDecision({
        clearanceStatus: 'checkout_required',
        hasHistoricalClearance: false,
        hasPaidCheckoutInvoice: false,
        documents,
        hasNightVfrRating: false,
        lastFlightDate: '2026-06-15',
        termsAccepted: true,
      }),
    }),
  )

  assert.equal(state.statusKey, 'checkout_required')
  assert.equal(state.primaryAction?.href, '/dashboard/checkout')
  assert.equal(state.secondaryAction?.href, '/dashboard/documents')
  assert.match(state.heroMessage, /upload required documents/i)
})

test('checkout required with incomplete terms still routes to checkout', () => {
  const documents = baseDocuments(false)
  const state = resolveDashboardActionState(
    buildInput({
      documents,
      bookingReadiness: evaluateBookingReadinessDecision({
        clearanceStatus: 'checkout_required',
        hasHistoricalClearance: false,
        hasPaidCheckoutInvoice: false,
        documents,
        hasNightVfrRating: false,
        lastFlightDate: '2026-06-15',
        termsAccepted: false,
      }),
    }),
  )

  assert.equal(state.statusKey, 'checkout_required')
  assert.equal(state.primaryAction?.href, '/dashboard/checkout')
})

test('checkout required with unanswered night vfr still routes to checkout', () => {
  const documents = baseDocuments(false)
  const state = resolveDashboardActionState(
    buildInput({
      profile: {
        account_status: 'active',
        account_lock_reason: null,
        pilot_clearance_status: 'checkout_required',
        has_night_vfr_rating: null,
        last_flight_date: '2026-06-15',
      },
      documents,
      bookingReadiness: evaluateBookingReadinessDecision({
        clearanceStatus: 'checkout_required',
        hasHistoricalClearance: false,
        hasPaidCheckoutInvoice: false,
        documents,
        hasNightVfrRating: null,
        lastFlightDate: '2026-06-15',
        termsAccepted: true,
      }),
    }),
  )

  assert.equal(state.statusKey, 'checkout_required')
  assert.equal(state.primaryAction?.href, '/dashboard/checkout')
})

test('night vfr proof missing after clearance still requires documents', () => {
  const documents = baseDocuments(false)
  const state = resolveDashboardActionState(
    buildInput({
      profile: {
        account_status: 'active',
        account_lock_reason: null,
        pilot_clearance_status: 'cleared_to_fly',
        has_night_vfr_rating: true,
        last_flight_date: '2026-06-15',
      },
      documents,
      bookingReadiness: evaluateBookingReadinessDecision({
        clearanceStatus: 'cleared_to_fly',
        hasHistoricalClearance: true,
        hasPaidCheckoutInvoice: false,
        documents,
        hasNightVfrRating: true,
        lastFlightDate: '2026-06-15',
        termsAccepted: true,
      }),
    }),
  )

  assert.equal(state.statusKey, 'night_vfr_proof_required')
  assert.equal(state.primaryAction?.href, '/dashboard/documents')
})

test('rejected documents still take priority over checkout request', () => {
  const documents = [
    rejectedDocument('pilot_licence'),
    approvedDocument('medical_certificate'),
    approvedDocument('photo_id'),
  ]
  const state = resolveDashboardActionState(
    buildInput({
      documents,
      bookingReadiness: evaluateBookingReadinessDecision({
        clearanceStatus: 'checkout_required',
        hasHistoricalClearance: false,
        hasPaidCheckoutInvoice: false,
        documents,
        hasNightVfrRating: false,
        lastFlightDate: '2026-06-15',
        termsAccepted: true,
      }),
    }),
  )

  assert.equal(state.statusKey, 'documents_rejected')
  assert.equal(state.primaryAction?.href, '/dashboard/documents')
})

test('night vfr true requires proof when evidence is missing', () => {
  const documents = baseDocuments(false)
  const state = resolveDashboardActionState(
    buildInput({
      profile: {
        account_status: 'active',
        account_lock_reason: null,
        pilot_clearance_status: 'checkout_required',
        has_night_vfr_rating: true,
        last_flight_date: '2026-06-15',
      },
      documents,
      bookingReadiness: evaluateBookingReadinessDecision({
        clearanceStatus: 'checkout_required',
        hasHistoricalClearance: false,
        hasPaidCheckoutInvoice: false,
        documents,
        hasNightVfrRating: true,
        lastFlightDate: '2026-06-15',
        termsAccepted: true,
      }),
    }),
  )

  // Checkout-first: missing Night VFR proof no longer blocks the checkout CTA.
  assert.equal(state.statusKey, 'checkout_required')
  assert.equal(state.primaryAction?.href, '/dashboard/checkout')
})

test('pending checkout bank proof becomes an admin-waiting state', () => {
  const state = resolveDashboardActionState(
    buildInput({
      profile: {
        account_status: 'active',
        account_lock_reason: null,
        pilot_clearance_status: 'checkout_payment_required',
        has_night_vfr_rating: false,
        last_flight_date: '2026-06-15',
      },
      checkoutBookingId: 'checkout-1',
      checkoutPayment: {
        bookingId: 'checkout-1',
        invoiceStatus: 'payment_required',
        bankTransferStatus: 'pending_review',
        bankTransferNote: null,
      },
    }),
  )

  assert.equal(state.statusKey, 'checkout_payment_proof_under_review')
  assert.equal(state.customerActionRequired, false)
})

test('approved checkout bank proof does not stay in under-review state', () => {
  const state = resolveDashboardActionState(
    buildInput({
      profile: {
        account_status: 'active',
        account_lock_reason: null,
        pilot_clearance_status: 'checkout_payment_required',
        has_night_vfr_rating: false,
        last_flight_date: '2026-06-15',
      },
      checkoutBookingId: 'checkout-1',
      checkoutPayment: {
        bookingId: 'checkout-1',
        invoiceStatus: 'payment_required',
        bankTransferStatus: 'approved',
        bankTransferNote: null,
      },
    }),
  )

  assert.equal(state.statusKey, 'checkout_payment_approved_processing')
  assert.notEqual(state.statusKey, 'checkout_payment_proof_under_review')
})

test('rejected checkout bank proof routes back to replacement action', () => {
  const state = resolveDashboardActionState(
    buildInput({
      profile: {
        account_status: 'active',
        account_lock_reason: null,
        pilot_clearance_status: 'checkout_payment_required',
        has_night_vfr_rating: false,
        last_flight_date: '2026-06-15',
      },
      checkoutBookingId: 'checkout-1',
      checkoutPayment: {
        bookingId: 'checkout-1',
        invoiceStatus: 'payment_required',
        bankTransferStatus: 'rejected',
        bankTransferNote: 'Receipt was unreadable',
      },
    }),
  )

  assert.equal(state.statusKey, 'checkout_payment_proof_rejected')
  assert.equal(state.primaryAction?.href, '/dashboard/bookings/checkout-1')
})

test('checkout required routes to checkout instead of bookings', () => {
  const state = resolveDashboardActionState(buildInput())
  assert.equal(state.primaryAction?.href, '/dashboard/checkout')
})

test('cleared customer can book an aircraft', () => {
  const documents = baseDocuments(false)
  const state = resolveDashboardActionState(
    buildInput({
      profile: {
        account_status: 'active',
        account_lock_reason: null,
        pilot_clearance_status: 'cleared_to_fly',
        has_night_vfr_rating: false,
        last_flight_date: '2026-06-15',
      },
      documents,
      bookingReadiness: evaluateBookingReadinessDecision({
        clearanceStatus: 'cleared_to_fly',
        hasHistoricalClearance: true,
        hasPaidCheckoutInvoice: false,
        documents,
        hasNightVfrRating: false,
        lastFlightDate: '2026-06-15',
        termsAccepted: true,
      }),
      canCreateStandardBooking: true,
    }),
  )

  assert.equal(state.statusKey, 'cleared_ready_to_book')
  assert.equal(state.primaryAction?.href, '/dashboard/bookings/new')
})

test('uncleared customer never receives the aircraft booking route', () => {
  const documents = [approvedDocument('pilot_licence'), uploadedDocument('medical_certificate')]
  const state = resolveDashboardActionState(
    buildInput({
      documents,
      bookingReadiness: evaluateBookingReadinessDecision({
        clearanceStatus: 'checkout_required',
        hasHistoricalClearance: false,
        hasPaidCheckoutInvoice: false,
        documents,
        hasNightVfrRating: false,
        lastFlightDate: '2026-06-15',
        termsAccepted: true,
      }),
    }),
  )

  assert.notEqual(state.primaryAction?.href, '/dashboard/bookings/new')
  assert.notEqual(state.secondaryAction?.href, '/dashboard/bookings/new')
})

test('post-flight records due override general upcoming/completed states', () => {
  const state = resolveDashboardActionState(
    buildInput({
      bookingFocusState: { mode: 'post_flight_required', bookingId: 'booking-2' },
      flightSnapshotBooking: {
        id: 'booking-3',
        bookingType: 'standard',
        status: 'confirmed',
        scheduledStart: '2026-07-18T10:00:00.000Z',
        scheduledEnd: '2026-07-18T12:00:00.000Z',
        aircraftRegistration: 'VH-OZR',
      },
      activeBooking: { id: 'booking-9', status: 'completed' },
    }),
  )

  assert.equal(state.statusKey, 'post_flight_records_due')
})

test('post-flight review needs no customer action unless clarification is required', () => {
  const reviewState = resolveDashboardActionState(
    buildInput({
      bookingFocusState: { mode: 'post_flight_under_review', bookingId: 'booking-4' },
    }),
  )
  const clarificationState = resolveDashboardActionState(
    buildInput({
      bookingFocusState: { mode: 'post_flight_clarification_required', bookingId: 'booking-4' },
    }),
  )

  assert.equal(reviewState.statusKey, 'post_flight_under_review')
  assert.equal(reviewState.customerActionRequired, false)
  assert.equal(clarificationState.statusKey, 'post_flight_clarification_required')
  assert.equal(clarificationState.customerActionRequired, true)
})

test('block time landing fee invoice requires payment via Purchases', () => {
  const state = resolveDashboardActionState(
    buildInput({
      bookingFocusState: { mode: 'block_time_landing_fee_required', bookingId: 'booking-21aug' },
    }),
  )

  assert.equal(state.statusKey, 'block_time_landing_fee_required')
  assert.equal(state.customerActionRequired, true)
  assert.equal(state.primaryAction?.href, '/dashboard/bookings/booking-21aug#payment')
  assert.equal(state.tone, 'warning')
})

test('generic account block has absolute precedence', () => {
  const state = resolveDashboardActionState(
    buildInput({
      profile: {
        account_status: 'blocked',
        account_lock_reason: null,
        pilot_clearance_status: 'checkout_payment_required',
        has_night_vfr_rating: false,
        last_flight_date: '2026-06-15',
      },
      checkoutBookingId: 'checkout-1',
      checkoutPayment: {
        bookingId: 'checkout-1',
        invoiceStatus: 'payment_required',
        bankTransferStatus: 'rejected',
        bankTransferNote: null,
      },
      bookingFocusState: { mode: 'post_flight_required', bookingId: 'booking-4' },
    }),
  )

  assert.equal(state.statusKey, 'account_blocked')
})

test('contradictory but non-actionable checkout data falls back safely', () => {
  const documents = baseDocuments(false)
  const state = resolveDashboardActionState(
    buildInput({
      profile: {
        account_status: 'active',
        account_lock_reason: null,
        pilot_clearance_status: 'checkout_required',
        has_night_vfr_rating: false,
        last_flight_date: '2026-06-15',
      },
      documents,
      bookingReadiness: evaluateBookingReadinessDecision({
        clearanceStatus: 'checkout_required',
        hasHistoricalClearance: false,
        hasPaidCheckoutInvoice: false,
        documents,
        hasNightVfrRating: false,
        lastFlightDate: '2026-06-15',
        termsAccepted: true,
      }),
      checkoutBookingId: 'checkout-1',
    }),
  )

  assert.equal(state.statusKey, 'safe_fallback')
  assert.equal(state.customerActionRequired, false)
})

test('rejected documents win before other downstream states', () => {
  const documents = [
    rejectedDocument('pilot_licence'),
    approvedDocument('medical_certificate'),
    approvedDocument('photo_id'),
  ]
  const state = resolveDashboardActionState(
    buildInput({
      documents,
      bookingReadiness: evaluateBookingReadinessDecision({
        clearanceStatus: 'checkout_payment_required',
        hasHistoricalClearance: false,
        hasPaidCheckoutInvoice: false,
        documents,
        hasNightVfrRating: false,
        lastFlightDate: '2026-06-15',
        termsAccepted: true,
      }),
      profile: {
        account_status: 'active',
        account_lock_reason: null,
        pilot_clearance_status: 'checkout_payment_required',
        has_night_vfr_rating: false,
        last_flight_date: '2026-06-15',
      },
      checkoutBookingId: 'checkout-1',
      checkoutPayment: {
        bookingId: 'checkout-1',
        invoiceStatus: 'payment_required',
        bankTransferStatus: 'pending_review',
        bankTransferNote: null,
      },
    }),
  )

  assert.equal(state.statusKey, 'documents_rejected')
})
