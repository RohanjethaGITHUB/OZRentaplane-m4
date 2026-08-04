import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clearanceOverrideNotification,
  resolveCheckoutBookingAction,
} from '../../lib/admin/clearance-override'
import { outcomeFromAuditNewValue } from '../../lib/checkout-outcome'

test('resolveCheckoutBookingAction: cleared_to_fly completes any mid-flow booking', () => {
  assert.equal(resolveCheckoutBookingAction('cleared_to_fly', 'checkout_requested'), 'complete')
  assert.equal(resolveCheckoutBookingAction('cleared_to_fly', 'checkout_confirmed'), 'complete')
  assert.equal(resolveCheckoutBookingAction('cleared_to_fly', 'checkout_payment_required'), 'complete')
})

test('resolveCheckoutBookingAction: checkout_required completes open bookings (no cancel)', () => {
  assert.equal(resolveCheckoutBookingAction('checkout_required', 'checkout_requested'), 'complete')
  assert.equal(resolveCheckoutBookingAction('checkout_required', 'checkout_confirmed'), 'complete')
  assert.equal(resolveCheckoutBookingAction('checkout_required', 'on_hold_pending_documents'), 'complete')
})

test('resolveCheckoutBookingAction: additional/not eligible complete mid-flow (including early request)', () => {
  assert.equal(
    resolveCheckoutBookingAction('additional_checkout_required', 'checkout_requested'),
    'complete',
  )
  assert.equal(
    resolveCheckoutBookingAction('additional_checkout_required', 'on_hold_pending_documents'),
    'complete',
  )
  assert.equal(
    resolveCheckoutBookingAction('additional_checkout_required', 'checkout_confirmed'),
    'complete',
  )
  assert.equal(
    resolveCheckoutBookingAction('not_currently_eligible', 'checkout_completed_under_review'),
    'complete',
  )
  assert.equal(
    resolveCheckoutBookingAction('not_currently_eligible', 'checkout_requested'),
    'complete',
  )
})

test('resolveCheckoutBookingAction: unrelated statuses return null', () => {
  assert.equal(resolveCheckoutBookingAction('checkout_confirmed', 'checkout_requested'), null)
})

test('clearanceOverrideNotification covers four UI outcomes', () => {
  assert.match(clearanceOverrideNotification('cleared_to_fly').title, /Cleared/i)
  assert.match(clearanceOverrideNotification('checkout_required').title, /Checkout required/i)
  assert.match(clearanceOverrideNotification('additional_checkout_required').title, /Additional/i)
  assert.match(clearanceOverrideNotification('not_currently_eligible').title, /eligible/i)
})

test('outcomeFromAuditNewValue reads outcome fields', () => {
  assert.equal(outcomeFromAuditNewValue({ outcome: 'cleared_to_fly' }), 'cleared_to_fly')
  assert.equal(
    outcomeFromAuditNewValue({ pilot_clearance_status: 'additional_checkout_required' }),
    'additional_checkout_required',
  )
  assert.equal(outcomeFromAuditNewValue(null), null)
  assert.equal(outcomeFromAuditNewValue({}), null)
})
