// Booking system TypeScript types for OZRentAPlane.
// Kept separate from lib/supabase/types.ts (verification system) for clarity.
//
// Import ActorRole from ./types rather than redefining it.

import type { ActorRole } from './types'

// ─── Aircraft ─────────────────────────────────────────────────────────────────

export type AircraftStatus =
  | 'available'
  | 'booked'
  | 'dispatched'
  | 'maintenance'
  | 'grounded'
  | 'admin_blocked'
  | 'inactive'

export type MeterType = 'tacho' | 'vdo' | 'air_switch' | 'add_to_mr'

export type Aircraft = {
  id: string
  registration: string
  aircraft_type: string
  display_name: string
  status: AircraftStatus
  default_hourly_rate: number
  default_preflight_buffer_minutes: number
  default_postflight_buffer_minutes: number
  billing_meter_type: MeterType
  maintenance_meter_type: MeterType
  created_at: string
  updated_at: string
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export type BookingType = 'checkout' | 'standard'

export type BookingStatus =
  // Standard booking lifecycle
  | 'draft'
  | 'pending_confirmation'
  | 'confirmed'
  | 'ready_for_dispatch'
  | 'dispatched'
  | 'awaiting_flight_record'
  | 'flight_record_overdue'
  | 'pending_post_flight_review'
  | 'needs_clarification'
  | 'post_flight_approved'
  | 'invoice_generated'
  | 'payment_pending'
  | 'paid'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'overdue'
  | 'admin_hold'
  // Checkout booking statuses
  | 'checkout_requested'
  | 'checkout_confirmed'
  | 'checkout_completed_under_review'
  | 'checkout_payment_required'
  // Provisional first solo booking (pending checkout clearance)
  | 'pending_checkout_clearance'
  | 'released_due_to_checkout'

export type CancellationCategory =
  | 'customer'
  | 'admin'
  | 'weather'
  | 'maintenance'
  | 'safety'
  | 'no_show'
  | 'other'

export type PaymentStatus =
  | 'not_required'
  | 'not_started'
  | 'deposit_required'
  | 'deposit_paid'
  | 'hold_placed'
  | 'final_pending'
  | 'invoice_generated'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'

export type Booking = {
  id: string
  aircraft_id: string
  booking_owner_user_id: string
  booking_type: BookingType
  pic_user_id: string | null
  pic_name: string | null
  pic_arn: string | null
  scheduled_start: string
  scheduled_end: string
  actual_dispatch_time: string | null
  actual_return_time: string | null
  status: BookingStatus
  cancellation_category: CancellationCategory | null
  cancellation_reason: string | null
  admin_override_reason: string | null
  estimated_hours: number | null
  estimated_amount: number | null
  final_amount: number | null
  payment_status: PaymentStatus
  terms_accepted_at: string | null
  risk_acknowledgement_accepted_at: string | null
  eligibility_snapshot: Record<string, unknown> | null
  customer_notes:   string | null
  admin_notes:      string | null
  last_flight_date: string | null   // YYYY-MM-DD — customer-reported last flight date
  created_at: string
  updated_at: string
}

// ─── Schedule blocks ──────────────────────────────────────────────────────────

export type BlockType =
  | 'customer_booking'
  | 'maintenance'
  | 'admin_unavailable'
  | 'owner_use'
  | 'inspection'
  | 'cleaning'
  | 'weather_hold'
  | 'grounded'
  | 'ferry'
  | 'training_check'
  | 'temporary_hold'
  | 'buffer'
  | 'other'

export type BlockStatus = 'active' | 'cancelled' | 'expired' | 'completed'

export type ScheduleBlock = {
  id: string
  aircraft_id: string
  related_booking_id: string | null
  related_usage_record_id: string | null
  block_type: BlockType
  start_time: string
  end_time: string
  public_label: string | null
  internal_reason: string | null
  created_by_user_id: string | null
  created_by_role: ActorRole
  is_public_visible: boolean
  status: BlockStatus
  expires_at: string | null
  created_at: string
  updated_at: string
}

// ─── Aircraft usage records ───────────────────────────────────────────────────

export type UsageSourceType =
  | 'customer_booking'
  | 'owner_use'
  | 'maintenance_run'
  | 'test_flight'
  | 'ferry'
  | 'engine_ground_run'
  | 'admin_correction'
  | 'other'

export type UsageRecordStatus =
  | 'draft'
  | 'submitted'
  | 'pending_review'
  | 'needs_clarification'
  | 'approved'
  | 'approved_with_correction'
  | 'rejected'
  | 'locked'

export type AircraftUsageRecord = {
  id: string
  aircraft_id: string
  related_booking_id: string | null
  related_schedule_block_id: string | null
  source_type: UsageSourceType
  created_by_user_id: string | null
  created_by_role: ActorRole
  pic_name: string | null
  pic_arn: string | null
  usage_date: string
  start_time: string | null
  stop_time: string | null
  status: UsageRecordStatus
  approved_by_user_id: string | null
  approved_at: string | null
  admin_notes: string | null
  created_at: string
  updated_at: string
}

// ─── Flight records ───────────────────────────────────────────────────────────

export type FlightRecordStatus =
  | 'draft'
  | 'submitted'
  | 'pending_review'
  | 'needs_clarification'
  | 'resubmitted'
  | 'approved'
  | 'approved_with_correction'
  | 'rejected'
  | 'locked'

export type SignatureType = 'typed' | 'drawn' | 'none'

export type ReviewFlag = {
  key: string
  severity: 'warning' | 'error'
  message: string
}

export type FlightRecord = {
  id: string
  booking_id: string | null
  usage_record_id: string | null
  aircraft_id: string
  date: string
  pic_name: string | null
  pic_arn: string | null
  tacho_start: number | null
  tacho_stop: number | null
  tacho_total: number | null        // generated column
  vdo_start: number | null
  vdo_stop: number | null
  vdo_total: number | null          // generated column
  air_switch_start: number | null
  air_switch_stop: number | null
  air_switch_total: number | null   // generated column
  add_to_mr: number | null
  oil_added: number | null
  oil_total: number | null
  fuel_added: number | null
  fuel_actual: number | null
  landings: number | null
  customer_notes: string | null
  admin_notes: string | null
  declaration_accepted_at: string | null
  signature_type: SignatureType
  signature_value: string | null
  submitted_by_user_id: string | null
  submitted_at: string | null
  status: FlightRecordStatus
  review_flags: ReviewFlag[] | null
  approved_by_user_id: string | null
  approved_at: string | null
  correction_reason: string | null
  created_at: string
  updated_at: string
}

// ─── Aircraft meter history ───────────────────────────────────────────────────

export type AircraftMeterHistory = {
  id: string
  aircraft_id: string
  source_type: UsageSourceType
  source_record_id: string
  booking_id: string | null
  flight_record_id: string | null
  meter_type: MeterType
  start_reading: number
  stop_reading: number
  total: number
  is_official: boolean
  is_correction: boolean
  correction_of_history_id: string | null
  correction_reason: string | null
  entered_by_user_id: string | null
  approved_by_user_id: string | null
  approved_at: string
  created_at: string
}

// ─── Squawks ──────────────────────────────────────────────────────────────────

export type SquawkReportedPhase =
  | 'pre_flight'
  | 'during_flight'
  | 'post_flight'
  | 'admin_inspection'
  | 'maintenance'

export type SquawkSeverity =
  | 'info_only'
  | 'needs_review'
  | 'dispatch_blocked'
  | 'aircraft_grounded'

export type SquawkStatus = 'open' | 'under_review' | 'resolved' | 'deferred' | 'closed'

export type Squawk = {
  id: string
  aircraft_id: string
  booking_id: string | null
  flight_record_id: string | null
  reported_by_user_id: string | null
  reported_by_role: ActorRole
  reported_phase: SquawkReportedPhase
  severity: SquawkSeverity
  description: string
  status: SquawkStatus
  resolution_notes: string | null
  resolved_by_user_id: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

// ─── Booking audit events ─────────────────────────────────────────────────────

export type BookingAuditEvent = {
  id: string
  booking_id: string | null
  aircraft_id: string | null
  related_record_type: string | null
  related_record_id: string | null
  actor_user_id: string | null
  actor_role: ActorRole
  event_type: string
  event_summary: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}

// ─── Flight record attachments ────────────────────────────────────────────────

export type AttachmentType =
  | 'tacho_photo'
  | 'vdo_photo'
  | 'air_switch_photo'
  | 'fuel_photo'
  | 'oil_photo'
  | 'damage_photo'
  | 'signature'
  | 'other'

export type FlightRecordAttachment = {
  id: string
  flight_record_id: string | null
  squawk_id: string | null
  booking_id: string | null
  aircraft_id: string | null
  uploaded_by_user_id: string
  attachment_type: AttachmentType
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number | null
  created_at: string
}

// ─── Customer calendar block (safe RPC result) ────────────────────────────────
// Returned by get_customer_aircraft_calendar_blocks().
// Contains only calendar-safe fields — no internal_reason, no admin metadata.
// `label` is already resolved by the SQL function (never exposes internal_reason).

export type CustomerCalendarBlock = {
  block_id:    string
  aircraft_id: string
  start_time:  string
  end_time:    string
  label:       string
  block_type:  string
}

// ─── Availability ─────────────────────────────────────────────────────────────

export type AvailabilityReason = {
  type: 'schedule_block'
  block_id: string
  block_type: string
  start_time: string
  end_time: string
  public_label: string | null
  // internal_reason is only populated when includeInternalReasons = true (admin context)
  internal_reason: string | null
}

export type AvailabilityResult =
  | { available: true }
  | { available: false; reasons: AvailabilityReason[] }

// ─── Server action input types ────────────────────────────────────────────────

export type CreateBookingInput = {
  aircraft_id: string
  pic_user_id?: string | null
  pic_name?: string | null
  pic_arn?: string | null
  scheduled_start: string        // ISO 8601
  scheduled_end: string          // ISO 8601
  last_flight_date: string       // YYYY-MM-DD — customer's most recent flight review date
  customer_notes?: string | null
  terms_accepted?: boolean
  risk_acknowledgement_accepted?: boolean
}

export type FlightRecordLandingRow = {
  airport_id:    string
  landing_count: number
}

export type SubmitFlightRecordInput = {
  booking_id: string
  date: string              // YYYY-MM-DD
  pic_name?: string | null
  pic_arn?: string | null
  tacho_start?: number | null
  tacho_stop?: number | null
  vdo_start?: number | null
  vdo_stop?: number | null
  air_switch_start?: number | null
  air_switch_stop?: number | null
  add_to_mr?: number | null
  oil_added?: number | null
  oil_total?: number | null
  fuel_added?: number | null
  fuel_actual?: number | null
  landings?: number | null
  landing_rows?: FlightRecordLandingRow[]
  customer_notes?: string | null
  declaration_accepted?: boolean
  signature_type?: SignatureType
  signature_value?: string | null
}

export type CreateAdminBlockInput = {
  aircraft_id: string
  related_booking_id?: string | null
  block_type: BlockType
  start_time: string
  end_time: string
  public_label?: string | null
  internal_reason?: string | null
  is_public_visible?: boolean
  expires_at?: string | null
  // Availability check options
  exclude_booking_id?: string
  force_override?: boolean
}

export type CreateAdminBlockResult =
  | { created: true; blockId: string }
  | { created: false; conflicts: AvailabilityReason[] }

export type ApproveFlightRecordInput = {
  flight_record_id: string
  with_correction?: boolean
  correction_reason?: string | null
  admin_notes?: string | null
  admin_booking_notes?: string | null
}

export type ResubmitFlightRecordInput = {
  flight_record_id: string
  booking_id: string
  tacho_start?: number | null
  tacho_stop?: number | null
  vdo_start?: number | null
  vdo_stop?: number | null
  air_switch_start?: number | null
  air_switch_stop?: number | null
  add_to_mr?: number | null
  oil_added?: number | null
  oil_total?: number | null
  fuel_added?: number | null
  fuel_actual?: number | null
  landings?: number | null
  customer_notes?: string | null
}

export type FlightRecordClarification = {
  id: string
  flight_record_id: string
  booking_id: string
  requested_by: string
  category: string
  message: string
  is_resolved: boolean
  resolved_at: string | null
  created_at: string
}

export type ClarificationCategory =
  | 'missing_evidence'
  | 'unreadable_image'
  | 'meter_reading_mismatch'
  | 'missing_field_values'
  | 'fuel_oil_unclear'
  | 'landings_unclear'
  | 'other'

export const CLARIFICATION_CATEGORY_LABELS: Record<ClarificationCategory, string> = {
  missing_evidence:       'Missing evidence photos',
  unreadable_image:       'Unreadable image',
  meter_reading_mismatch: 'Meter reading mismatch',
  missing_field_values:   'Missing field values',
  fuel_oil_unclear:       'Fuel or oil detail unclear',
  landings_unclear:       'Landings unclear',
  other:                  'Other',
}

// ─── Checkout system types ────────────────────────────────────────────────────

export type CreateCheckoutBookingInput = {
  aircraft_id:       string
  scheduled_start:   string          // ISO 8601 UTC — end is always computed as start + 1 hour
  customer_notes?:   string | null
  last_flight_date?: string | null   // YYYY-MM-DD — customer's most recent flight before checkout
}

export type CreateProvisionalSoloInput = {
  aircraft_id:      string
  scheduled_start:  string
  scheduled_end:    string
  customer_notes?:  string | null
}

export type CheckoutBookingResult = {
  bookingId:        string
  bookingReference: string
  scheduledStart:   string
  scheduledEnd:     string
}

export type CheckoutOutcome =
  | 'cleared_to_fly'
  | 'additional_checkout_required'
  | 'checkout_reschedule_required'
  | 'not_currently_eligible'

// Checkout invoice VDO billing breakdown.
// vdo_start_reading and vdo_end_reading are null for legacy invoices
// that predate VDO-based billing (migration 045).
export type CheckoutInvoiceVdoBilling = {
  vdo_start_reading:               number | null
  vdo_end_reading:                 number | null
  vdo_hours_flown:                 number | null   // end - start, 1 decimal place
  checkout_rate_cents_per_hour:    number          // 29000 = $290
  checkout_calculated_amount_cents: number | null  // vdo_hours × rate
  checkout_landing_subtotal_cents: number          // sum of landing fees
  checkout_final_amount_cents:     number | null   // base + landings
}

// Landing row as returned by checkout_landing_charges table.
export type CheckoutLandingChargeRow = {
  id:                string
  booking_id:        string
  airport_id:        string
  landing_count:     number
  unit_amount_cents: number
  total_amount_cents: number
  created_at:        string
}

// Input type for markCheckoutOutcome server action.
export type MarkCheckoutOutcomeInput = {
  bookingId:        string
  outcome:          CheckoutOutcome
  adminNote?:       string
  // Payment path (required unless paymentWaived = true)
  vdoStartReading?: number   // e.g. 124.2
  vdoEndReading?:   number   // e.g. 125.0
  landingCharges?:  { airportId: string; landingCount: number }[]
  // Waiver path (non-cleared outcomes only)
  paymentWaived?:   boolean
  waiverReason?:    string
}

export type ProvisionalBookingAction = 'keep' | 'release'
