import type { FlightRecordStatus } from '@/lib/supabase/booking-types'

// Flight record statuses shown in the admin review queue.
// Includes needs_clarification so admins can see records awaiting customer input.
export const FLIGHT_RECORD_REVIEW_STATUSES = [
  'pending_review',
  'needs_clarification',
  'resubmitted',
] as const satisfies readonly FlightRecordStatus[]

export type FlightRecordReviewStatus = typeof FLIGHT_RECORD_REVIEW_STATUSES[number]

// Flight record statuses from which admin approval is permitted.
// needs_clarification is intentionally excluded: the customer must formally
// resubmit before the record can be approved. This prevents approving stale
// or unresolved data that the admin themselves flagged as incomplete.
export const FLIGHT_RECORD_APPROVAL_STATUSES = [
  'pending_review',
  'resubmitted',
] as const satisfies readonly FlightRecordStatus[]

export type FlightRecordApprovalStatus = typeof FLIGHT_RECORD_APPROVAL_STATUSES[number]
