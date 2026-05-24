export type FlightRecordStatusRow = {
  status?: string | null
  submitted_at?: string | null
}

export type AwaitingFlightRecordBooking = {
  status?: string | null
  scheduled_start?: string | null
  scheduled_end?: string | null
  flight_records?: FlightRecordStatusRow[] | null
}

const AWAITING_FLIGHT_RECORD_CANDIDATE_STATUSES = new Set([
  'confirmed',
  'ready_for_dispatch',
  'dispatched',
  'awaiting_flight_record',
  'flight_record_overdue',
])

const NON_SUBMITTED_FLIGHT_RECORD_STATUSES = new Set(['draft', 'rejected'])

export function hasSubmittedFlightRecord(records: FlightRecordStatusRow[] | null | undefined): boolean {
  return (records ?? []).some((record) => {
    const status = record.status ?? null
    if (!status) return Boolean(record.submitted_at)
    return !NON_SUBMITTED_FLIGHT_RECORD_STATUSES.has(status)
  })
}

export function isScheduledEndPassed(scheduledEnd: string | null | undefined, now: Date = new Date()): boolean {
  if (!scheduledEnd) return false
  const endMs = new Date(scheduledEnd).getTime()
  return Number.isFinite(endMs) && endMs <= now.getTime()
}

export function isAwaitingFlightRecordDue(
  booking: AwaitingFlightRecordBooking,
  now: Date = new Date(),
): boolean {
  // Canonical rule: no submitted customer flight record AND the full scheduled
  // end timestamp has passed. Never use scheduled_start or date-only checks here.
  return (
    AWAITING_FLIGHT_RECORD_CANDIDATE_STATUSES.has(booking.status ?? '') &&
    isScheduledEndPassed(booking.scheduled_end, now) &&
    !hasSubmittedFlightRecord(booking.flight_records)
  )
}

export function deriveBookingStatusForFlightRecord(
  booking: AwaitingFlightRecordBooking,
  now: Date = new Date(),
): string {
  const status = booking.status ?? ''
  if (isAwaitingFlightRecordDue(booking, now)) return 'awaiting_flight_record'

  if (status === 'awaiting_flight_record' || status === 'flight_record_overdue') {
    return 'confirmed'
  }

  return status
}

export function countAwaitingFlightRecords<T extends AwaitingFlightRecordBooking>(
  bookings: T[] | null | undefined,
  now: Date = new Date(),
): number {
  return (bookings ?? []).filter((booking) => isAwaitingFlightRecordDue(booking, now)).length
}

export function getOldestAwaitingFlightRecordEnd<T extends AwaitingFlightRecordBooking>(
  bookings: T[] | null | undefined,
  now: Date = new Date(),
): string | null {
  const ends = (bookings ?? [])
    .filter((booking) => isAwaitingFlightRecordDue(booking, now))
    .map((booking) => booking.scheduled_end)
    .filter((value): value is string => typeof value === 'string')
    .sort()

  return ends[0] ?? null
}
