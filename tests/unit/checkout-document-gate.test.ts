import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CHECKOUT_BLOCKING_DOCUMENT_TYPES,
  isCheckoutDocumentBlocking,
} from '../../lib/checkout-document-gate'

test('checkout confirmation blocks on the core identity documents', () => {
  assert.deepEqual(CHECKOUT_BLOCKING_DOCUMENT_TYPES, [
    'pilot_licence',
    'medical_certificate',
    'photo_id',
  ])
  assert.equal(isCheckoutDocumentBlocking('pilot_licence'), true)
  assert.equal(isCheckoutDocumentBlocking('medical_certificate'), true)
  assert.equal(isCheckoutDocumentBlocking('photo_id'), true)
})

test('night VFR evidence never blocks checkout confirmation', () => {
  assert.equal(isCheckoutDocumentBlocking('night_vfr_evidence'), false)
})
