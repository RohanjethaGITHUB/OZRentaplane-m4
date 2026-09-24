import { expect, test } from '@playwright/test'
import { buildReadingsFromTotals } from '@/lib/aircraft-flight-log'
import { calculateAircraftReadingsTotals } from '@/lib/aircraft-readings'
import {
  calculateBookingDays,
  resolveMaximumVdoHours,
  resolveMinimumVdoBilling,
  resolveStandardBookingBillingBranch,
} from '@/lib/booking/standard-booking-billing'
import { calculatePostFlightCharges } from '@/lib/booking/live-booking-calculator'

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

test('calculateBookingDays correctly resolves unique calendar days across Sydney dates', () => {
  // 3-day booking: 23 Dec 10:00 AEDT to 25 Dec 02:45 AEDT (40.75h)
  const threeDay = calculateBookingDays({
    scheduledStart: '2026-12-23T10:00:00+11:00',
    scheduledEnd: '2026-12-25T02:45:00+11:00',
    bookingSlotHours: 40.75,
  })
  expect(threeDay).toBe(3)

  const threeDayBilling = resolveMinimumVdoBilling({
    bookingSlotHours: 40.75,
    scheduledStart: '2026-12-23T10:00:00+11:00',
    scheduledEnd: '2026-12-25T02:45:00+11:00',
    actualVdoHours: 2.0,
    decision: 'enforce_minimum',
  })
  expect(threeDayBilling.bookingDays).toBe(3)
  expect(threeDayBilling.minimumVdoHours).toBe(12.0)
  expect(threeDayBilling.billedVdoHours).toBe(12.0)

  // 2-day booking: 23 Dec 10:00 AEDT to 24 Dec 18:00 AEDT (32h)
  const twoDay = calculateBookingDays({
    scheduledStart: '2026-12-23T10:00:00+11:00',
    scheduledEnd: '2026-12-24T18:00:00+11:00',
    bookingSlotHours: 32,
  })
  expect(twoDay).toBe(2)

  // Same-day booking: 23 Dec 10:00 AEDT to 23 Dec 16:00 AEDT (6h)
  const sameDay = calculateBookingDays({
    scheduledStart: '2026-12-23T10:00:00+11:00',
    scheduledEnd: '2026-12-23T16:00:00+11:00',
    bookingSlotHours: 6,
  })
  // Formatted display strings with timezone label
  const formattedDates = calculateBookingDays({
    scheduledStart: '23 Dec 2026, 10:00 AM Sydney time (AEDT)',
    scheduledEnd: '25 Dec 2026, 2:45 AM Sydney time (AEDT)',
    bookingSlotHours: 40.75,
  })
  expect(formattedDates).toBe(3)
})

test('block time base flow: hours deducted from package, customer pays only landing charges', () => {
  const res = calculatePostFlightCharges({
    vdoTotal: 2.0,
    bookingSlotHours: 2.0,
    defaultHourlyRate: 330,
    airports: [
      { id: 'ap-1', icao_code: 'YSBK', name: 'Bankstown Airport', default_landing_fee_cents: 2895 },
    ],
    landingRows: [
      { airport_id: 'ap-1', landing_count: 2 },
    ],
    activeBlockTime: {
      id: 'pkg-1',
      package_name: '10h Block Time Package',
      hours_remaining: 10.0,
      rate_per_hour: 300,
      expires_at: '2026-12-31T23:59:59Z',
    },
  })

  expect(res.isBlockTime).toBe(true)
  expect(res.blockPackageName).toBe('10h Block Time Package')
  expect(res.blockHoursBefore).toBe(10.0)
  expect(res.blockHoursDeducted).toBe(2.0)
  expect(res.blockHoursRemainingAfter).toBe(8.0)
  expect(res.blockOverageHours).toBe(0)
  expect(res.flightBaseCents).toBe(0)
  expect(res.landingSubtotalCents).toBe(5790)
  expect(res.amountDueCents).toBe(5790) // Only landing fees!
})

test('block time Case 1: partial hours remaining bills overage at standard aircraft rate ($330/hr)', () => {
  const res = calculatePostFlightCharges({
    vdoTotal: 6.0,
    bookingSlotHours: 6.0,
    defaultHourlyRate: 330,
    airports: [
      { id: 'ap-1', icao_code: 'YSBK', name: 'Bankstown Airport', default_landing_fee_cents: 2895 },
    ],
    landingRows: [
      { airport_id: 'ap-1', landing_count: 1 },
    ],
    activeBlockTime: {
      id: 'pkg-1',
      package_name: '50h Block Time Package',
      hours_remaining: 5.0, // Only 5h left
      rate_per_hour: 290,  // Package rate is $290, but overage must be $330 standard rate
      expires_at: '2026-12-31T23:59:59Z',
    },
  })

  expect(res.isBlockTime).toBe(true)
  expect(res.blockHoursBefore).toBe(5.0)
  expect(res.blockHoursDeducted).toBe(5.0)
  expect(res.blockHoursRemainingAfter).toBe(0)
  expect(res.blockOverageHours).toBe(1.0)
  expect(res.blockOverageAmountCents).toBe(33000) // 1h * $330 = $330.00
  expect(res.flightBaseCents).toBe(33000)
  expect(res.landingSubtotalCents).toBe(2895) // 1 landing * $28.95
  expect(res.hourlyRate).toBe(290)
  expect(res.standardHourlyRate).toBe(330)
  expect(res.amountDueCents).toBe(35895)
})

test('block time Case 2: flight before expiry is honored even if record submitted after package expiry', () => {
  const res = calculatePostFlightCharges({
    vdoTotal: 3.0,
    bookingSlotHours: 3.0,
    defaultHourlyRate: 330,
    scheduledStart: '2026-09-24T10:00:00Z', // Flight was on 24 Sep
    airports: [],
    landingRows: [],
    activeBlockTime: {
      id: 'pkg-1',
      package_name: '10h Package',
      hours_remaining: 5.0,
      rate_per_hour: 300,
      expires_at: '2026-09-25T23:59:59Z', // Package expired on 25 Sep
    },
  })

  // Since scheduledStart (24 Sep) <= expires_at (25 Sep), package is recognized
  expect(res.isBlockTime).toBe(true)
  expect(res.blockHoursDeducted).toBe(3.0)
  expect(res.blockHoursRemainingAfter).toBe(2.0)
  expect(res.amountDueCents).toBe(0)
  expect(res.isFullyCovered).toBe(true)
})

test('block time zero balance flow: 100% covered by package with 0 landings', () => {
  const res = calculatePostFlightCharges({
    vdoTotal: 4.0,
    bookingSlotHours: 4.0,
    defaultHourlyRate: 330,
    airports: [],
    landingRows: [],
    activeBlockTime: {
      id: 'pkg-1',
      package_name: '20h Block Time Package',
      hours_remaining: 10.0,
      rate_per_hour: 300,
      expires_at: '2026-12-31T23:59:59Z',
    },
  })

  expect(res.isBlockTime).toBe(true)
  expect(res.blockHoursDeducted).toBe(4.0)
  expect(res.blockHoursRemainingAfter).toBe(6.0)
  expect(res.amountDueCents).toBe(0)
  expect(res.isFullyCovered).toBe(true)
})

test('block time Case 3: exhausted package (0h remaining) is recognized and bills all flight time as overage at standard rate', () => {
  const res = calculatePostFlightCharges({
    vdoTotal: 3.0,
    bookingSlotHours: 3.0,
    defaultHourlyRate: 330,
    airports: [
      { id: 'ap-1', icao_code: 'YSBK', name: 'Bankstown Airport', default_landing_fee_cents: 2895 },
    ],
    landingRows: [
      { airport_id: 'ap-1', landing_count: 1 },
    ],
    activeBlockTime: {
      id: 'pkg-1',
      package_name: 'Starter Block',
      hours_purchased: 10,
      hours_remaining: 0,
      rate_per_hour: 320,
      status: 'exhausted',
      expires_at: '2026-10-23T09:54:56.631Z',
    },
  })

  expect(res.isBlockTime).toBe(true)
  expect(res.blockPackageName).toBe('Starter Block (10hr package)')
  expect(res.blockHoursBefore).toBe(0)
  expect(res.blockHoursDeducted).toBe(0)
  expect(res.blockHoursRemainingAfter).toBe(0)
  expect(res.blockOverageHours).toBe(3.0)
  expect(res.blockOverageAmountCents).toBe(99000) // 3h * $330 = $990.00
  expect(res.flightBaseCents).toBe(99000)
  expect(res.landingSubtotalCents).toBe(2895)
  expect(res.subtotalCents).toBe(101895)
  expect(res.amountDueCents).toBe(101895)
  expect(res.hourlyRate).toBe(320)
  expect(res.standardHourlyRate).toBe(330)
})

