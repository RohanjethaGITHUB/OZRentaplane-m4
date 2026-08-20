import test from 'node:test'
import assert from 'node:assert/strict'

import { deriveBookingLifecycleStage } from '../../lib/booking/booking-lifecycle-stage'
import { getStandardBookingPaymentDisplayState } from '../../lib/booking/standard-booking-payment-state'

test('payment_pending + payment_required invoice stays payment required without proof', () => {
  assert.equal(
    getStandardBookingPaymentDisplayState({
      bookingStatus: 'payment_pending',
      invoiceStatus: 'payment_required',
      latestSubmissionStatus: null,
    }),
    'payment_required',
  )

  const stage = deriveBookingLifecycleStage({
    bookingStatus: 'payment_pending',
    bookingInvoiceStatus: 'payment_required',
    latestBankTransferSubmissionStatus: null,
  })
  assert.equal(stage.key, 'payment_required')
  assert.equal(stage.label, 'Payment Required')
})

test('pending_review submission wins over payment_required invoice', () => {
  assert.equal(
    getStandardBookingPaymentDisplayState({
      bookingStatus: 'payment_pending',
      invoiceStatus: 'payment_required',
      latestSubmissionStatus: 'pending_review',
    }),
    'payment_review_pending',
  )

  const stage = deriveBookingLifecycleStage({
    bookingStatus: 'payment_pending',
    bookingInvoiceStatus: 'payment_required',
    latestBankTransferSubmissionStatus: 'pending_review',
  })
  assert.equal(stage.key, 'payment_review_pending')
  assert.equal(stage.label, 'Payment Review Pending')
})

test('bank_transfer_pending_review invoice stays in review pending state', () => {
  const stage = deriveBookingLifecycleStage({
    bookingStatus: 'payment_pending',
    bookingInvoiceStatus: 'bank_transfer_pending_review',
    latestBankTransferSubmissionStatus: null,
  })
  assert.equal(stage.key, 'payment_review_pending')
})

test('paid invoice is the only path to paid / closed', () => {
  const stage = deriveBookingLifecycleStage({
    bookingStatus: 'payment_pending',
    bookingInvoiceStatus: 'paid',
    bookingInvoicePaidAt: '2026-07-12T17:00:00.000Z',
    bookingInvoiceAmountDueCents: 695895,
    bookingInvoiceTotalPaidCents: 695895,
  })
  assert.equal(stage.key, 'paid_closed')
  assert.equal(stage.label, 'Paid / Closed')
})

test('completed booking with unpaid invoice does not show paid', () => {
  const stage = deriveBookingLifecycleStage({
    bookingStatus: 'completed',
    bookingInvoiceStatus: 'payment_required',
    latestBankTransferSubmissionStatus: null,
  })
  assert.notEqual(stage.label, 'Paid / Closed')
  assert.equal(stage.key, 'payment_required')
})

test('post_flight_approved booking with unpaid invoice does not show paid', () => {
  const stage = deriveBookingLifecycleStage({
    bookingStatus: 'post_flight_approved',
    bookingInvoiceStatus: 'payment_required',
    bookingInvoiceAmountDueCents: 695895,
    bookingInvoiceTotalPaidCents: 0,
  })
  assert.notEqual(stage.label, 'Paid / Closed')
  assert.equal(stage.key, 'payment_required')
})

test('waived invoice stays closed without implying customer payment', () => {
  const stage = deriveBookingLifecycleStage({
    bookingStatus: 'completed',
    bookingInvoiceStatus: 'waived',
  })
  assert.equal(stage.key, 'waived_closed')
  assert.equal(stage.label, 'Waived / Closed')
})

test('partial payment does not count as paid', () => {
  assert.equal(
    getStandardBookingPaymentDisplayState({
      bookingStatus: 'payment_pending',
      invoiceStatus: 'payment_required',
      invoiceAmountDueCents: 695895,
      invoiceTotalPaidCents: 1,
    }),
    'payment_still_due',
  )

  const stage = deriveBookingLifecycleStage({
    bookingStatus: 'payment_pending',
    bookingInvoiceStatus: 'payment_required',
    bookingInvoiceAmountDueCents: 695895,
    bookingInvoiceTotalPaidCents: 1,
  })
  assert.equal(stage.key, 'payment_still_due')
  assert.equal(stage.label, 'Payment Still Due')
})

test('paid_at without full amount still does not count as paid', () => {
  assert.equal(
    getStandardBookingPaymentDisplayState({
      bookingStatus: 'payment_pending',
      invoiceStatus: 'payment_required',
      invoicePaidAt: '2026-07-12T17:00:00.000Z',
      invoiceAmountDueCents: 695895,
      invoiceTotalPaidCents: 250000,
    }),
    'payment_still_due',
  )
})

test('zero amount due is not treated as a fake paid customer invoice', () => {
  assert.equal(
    getStandardBookingPaymentDisplayState({
      bookingStatus: 'payment_pending',
      invoiceStatus: 'payment_required',
      invoicePaidAt: '2026-07-12T17:00:00.000Z',
      invoiceAmountDueCents: 0,
      invoiceTotalPaidCents: 0,
    }),
    'payment_required',
  )
})

test('confirmed booking with passed flight time transitions to awaiting flight record', () => {
  const stage = deriveBookingLifecycleStage({
    bookingStatus: 'confirmed',
    scheduledStart: '2026-08-20T00:30:00.000Z',
    scheduledEnd: '2026-08-20T02:30:00.000Z',
    flightRecordStatus: null,
  })
  assert.equal(stage.key, 'awaiting_flight_readings')
  assert.equal(stage.label, 'Awaiting Flight Record')
  assert.equal(stage.tone, 'amber')
})

test('confirmed booking in future stays upcoming', () => {
  const stage = deriveBookingLifecycleStage({
    bookingStatus: 'confirmed',
    scheduledStart: '2099-08-20T00:30:00.000Z',
    scheduledEnd: '2099-08-20T02:30:00.000Z',
    flightRecordStatus: null,
  })
  assert.equal(stage.key, 'upcoming')
  assert.equal(stage.label, 'Upcoming')
  assert.equal(stage.tone, 'blue')
})
