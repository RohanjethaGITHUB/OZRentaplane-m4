import { expect, test } from '@playwright/test'
import { buildReadingsFromTotals } from '@/lib/aircraft-flight-log'
import { calculateAircraftReadingsTotals } from '@/lib/aircraft-readings'
import {
  resolveMaximumVdoHours,
  resolveMinimumVdoBilling,
  resolveStandardBookingBillingBranch,
} from '@/lib/booking/standard-booking-billing'

test('hidden continuity baseline is preserved when reconstructing full readings from totals', () => {
  const baseline = {
    vdo_start:  120.5,
    tacho_start: 240.0,
    air_switch_start: 88.2,
    mr_start:   15.0,
  }

  const totals = {
    vdo_total:  2.3,
    tacho_total: 2.0,
    air_switch_total: 1.1,
    mr_total:   0.8,
    oil_added:  3.5,
    oil_total:  9.1,
    fuel_added: 15.0,
    fuel_returned: 2.0,
    landings:   2,
    notes:      'Admin review',
  }

  const readings = buildReadingsFromTotals(totals, baseline)
  expect(readings.vdo_start).toBe(120.5)
  expect(readings.vdo_stop).toBe(122.8)
  expect(readings.tacho_start).toBe(240.0)
  expect(readings.tacho_stop).toBe(242.0)
  expect(readings.air_switch_start).toBe(88.2)
  expect(readings.air_switch_stop).toBe(89.3)
  expect(readings.mr_start).toBe(15.0)
  expect(readings.mr_stop).toBe(15.8)
  expect(calculateAircraftReadingsTotals(readings)).toEqual({
    vdo_total:  2.3,
    tacho_total: 2.0,
    air_switch_total: 1.1,
    mr_total:   0.8,
  })
})

test('standard booking billing branch resolves to null-based invoice or waiver paths', () => {
  expect(
    resolveStandardBookingBillingBranch({
      submissionMode: 'send_invoice',
    }),
  ).toEqual({
    kind: 'invoice',
    invoicePaymentMethod: null,
    manualPaymentMethod: null,
  })

  expect(
    resolveStandardBookingBillingBranch({
      submissionMode: 'mark_paid',
    }),
  ).toEqual({
    kind: 'invoice',
    invoicePaymentMethod: null,
    manualPaymentMethod: null,
  })

  expect(
    resolveStandardBookingBillingBranch({
      submissionMode: 'waived',
    }),
  ).toEqual({
    kind: 'waived',
    invoicePaymentMethod: null,
    manualPaymentMethod: null,
  })
})

test('minimum VDO billing resolves the per-day 4-hour minimum and requires a decision when below it', () => {
  expect(
    resolveMinimumVdoBilling({
      bookingSlotHours: 168,
      actualVdoHours: 10,
    }),
  ).toEqual({
    bookingDays: 7,
    minimumVdoHours: 28,
    actualVdoHours: 10,
    billedVdoHours: null,
    isBelowMinimum: true,
    requiresDecision: true,
    appliedDecision: null,
  })

  expect(
    resolveMinimumVdoBilling({
      bookingSlotHours: 168,
      actualVdoHours: 10,
      decision: 'enforce_minimum',
    }),
  ).toEqual({
    bookingDays: 7,
    minimumVdoHours: 28,
    actualVdoHours: 10,
    billedVdoHours: 28,
    isBelowMinimum: true,
    requiresDecision: false,
    appliedDecision: 'enforce_minimum',
  })

  expect(
    resolveMinimumVdoBilling({
      bookingSlotHours: 168,
      actualVdoHours: 32,
    }),
  ).toEqual({
    bookingDays: 7,
    minimumVdoHours: 28,
    actualVdoHours: 32,
    billedVdoHours: 32,
    isBelowMinimum: false,
    requiresDecision: false,
    appliedDecision: null,
  })
})

test('maximum VDO hours is 24h for same-day bookings and 24h per day for multi-day', () => {
  // Same-day / sub-24h slots: bookingDays resolves to 0 for the minimum, but
  // the max must still allow a full day of flying (was previously 0 and blocked all finals).
  expect(resolveMaximumVdoHours(0)).toBe(24)
  expect(resolveMaximumVdoHours(1)).toBe(24)
  expect(resolveMaximumVdoHours(7)).toBe(168)

  const sameDay = resolveMinimumVdoBilling({
    bookingSlotHours: 2.5,
    actualVdoHours: 2,
  })
  expect(sameDay.bookingDays).toBe(0)
  expect(sameDay.billedVdoHours).toBe(2)
  expect(2 > resolveMaximumVdoHours(sameDay.bookingDays)).toBe(false)
})
