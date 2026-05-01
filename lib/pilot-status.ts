/**
 * lib/pilot-status.ts
 *
 * Centralised source of truth for pilot clearance status labels, badge colours,
 * and the computed customer display status used in admin tables.
 *
 * ─── Design principles ───────────────────────────────────────────────────────
 *  • DB values are NEVER renamed — only display labels change here.
 *  • checkout_confirmed           → "Checkout Scheduled"  (DB: checkout_confirmed)
 *  • checkout_reschedule_required → "Checkout Reschedule Required"
 *  • All label/colour logic lives in ONE place so pages stay lean.
 */

import type { PilotClearanceStatus, AccountStatus } from '@/lib/supabase/types'

// ─── Account status ───────────────────────────────────────────────────────────

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active:   'Active',
  blocked:  'Blocked',
  archived: 'Archived',
}

export const ACCOUNT_STATUS_BADGE: Record<AccountStatus, string> = {
  active:   'bg-green-500/10 text-green-400 border-green-500/20',
  blocked:  'bg-red-500/10 text-red-400 border-red-500/20',
  archived: 'bg-white/5 text-slate-500 border-white/10',
}

// ─── Pilot clearance labels ───────────────────────────────────────────────────
// Admin-facing labels (more technical)

export const CLEARANCE_LABEL: Record<PilotClearanceStatus, string> = {
  checkout_required:             'Checkout Required',
  checkout_requested:            'Checkout Requested',
  checkout_confirmed:            'Checkout Scheduled',
  checkout_completed_under_review: 'Checkout Under Review',
  checkout_payment_required:     'Payment Required',
  cleared_to_fly:                'Cleared to Fly',
  additional_checkout_required:  'Additional Checkout Required',
  checkout_reschedule_required:  'Checkout Reschedule Required',
  not_currently_eligible:        'Not Currently Eligible',
}

// Customer-facing labels (friendlier language)
export const CLEARANCE_LABEL_CUSTOMER: Record<PilotClearanceStatus, string> = {
  checkout_required:             'Checkout Required',
  checkout_requested:            'Checkout Requested',
  checkout_confirmed:            'Checkout Scheduled',
  checkout_completed_under_review: 'Checkout Under Review',
  checkout_payment_required:     'Payment Required',
  cleared_to_fly:                'Ready to Book Flights',
  additional_checkout_required:  'Additional Checkout Required',
  checkout_reschedule_required:  'Checkout Reschedule Required',
  not_currently_eligible:        'Not Currently Eligible',
}

// ─── Pilot clearance badge colours ───────────────────────────────────────────
// Tailwind classes for border-style pill badges.
// green  = cleared/ready
// blue   = in-progress / submitted
// amber  = action needed / awaiting review
// red    = blocked / ineligible
// orange = payment needed

export const CLEARANCE_BADGE: Record<PilotClearanceStatus, string> = {
  checkout_required:             'bg-slate-500/10 text-slate-400 border-slate-500/20',
  checkout_requested:            'bg-blue-500/10 text-blue-400 border-blue-500/20',
  checkout_confirmed:            'bg-blue-500/10 text-blue-400 border-blue-500/20',
  checkout_completed_under_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  checkout_payment_required:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
  cleared_to_fly:                'bg-green-500/10 text-green-400 border-green-500/20',
  additional_checkout_required:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  checkout_reschedule_required:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  not_currently_eligible:        'bg-red-500/10 text-red-400 border-red-500/20',
}

// Pill color name (for DashboardContent compatibility)
export const CLEARANCE_PILL_COLOR: Record<PilotClearanceStatus, 'green' | 'blue' | 'amber' | 'red' | 'slate'> = {
  checkout_required:             'slate',
  checkout_requested:            'blue',
  checkout_confirmed:            'blue',
  checkout_completed_under_review: 'amber',
  checkout_payment_required:     'amber',
  cleared_to_fly:                'green',
  additional_checkout_required:  'amber',
  checkout_reschedule_required:  'amber',
  not_currently_eligible:        'red',
}

// ─── Helper functions ─────────────────────────────────────────────────────────

export function getClearanceLabel(
  status: string | null | undefined,
  audience: 'admin' | 'customer' = 'admin',
): string {
  if (!status) return 'Unknown'
  const map = audience === 'customer' ? CLEARANCE_LABEL_CUSTOMER : CLEARANCE_LABEL
  return map[status as PilotClearanceStatus] ?? status.replace(/_/g, ' ')
}

export function getClearanceBadge(status: string | null | undefined): string {
  if (!status) return 'bg-white/5 text-slate-500 border-white/10'
  return CLEARANCE_BADGE[status as PilotClearanceStatus] ?? 'bg-white/5 text-slate-400 border-white/10'
}

// ─── Computed customer display status ─────────────────────────────────────────
// Used in admin customer tables/cards. Computed from profile + booking state.
// Priority order matches spec:
//   1. Blocked
//   2. Payment Required (unpaid booking)
//   3. Readings Required (dispatched, awaiting flight record)
//   4. Readings Under Review (flight record submitted, pending review)
//   5. Flight Booked (confirmed standard booking)
//   6. Booking Requested (pending standard booking)
//   7. Mapped pilot_clearance_status label

export type ComputedCustomerStatus = {
  label:     string
  badge:     string   // Tailwind class
  priority:  number  // lower = higher priority
}

export type CustomerStatusInput = {
  account_status:        string | null
  pilot_clearance_status: string | null
  /** Latest booking status (most recent booking of any type) */
  latest_booking_status?: string | null
  /** Latest flight_record status */
  latest_fr_status?: string | null
}

const STATUS_PRIORITY: Array<{
  test: (s: CustomerStatusInput) => boolean
  label: string
  badge: string
  priority: number
}> = [
  {
    priority: 1,
    test: (s) => s.account_status === 'blocked',
    label: 'Blocked',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  {
    priority: 2,
    test: (s) => ['checkout_payment_required'].includes(s.pilot_clearance_status ?? '') ||
                 s.latest_booking_status === 'checkout_payment_required',
    label: 'Payment Required',
    badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  },
  {
    priority: 3,
    test: (s) => ['awaiting_flight_record', 'flight_record_overdue'].includes(s.latest_booking_status ?? ''),
    label: 'Readings Required',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  {
    priority: 4,
    test: (s) => ['pending_review', 'resubmitted'].includes(s.latest_fr_status ?? '') ||
                 s.latest_booking_status === 'pending_post_flight_review',
    label: 'Readings Under Review',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  {
    priority: 5,
    test: (s) => s.latest_booking_status === 'confirmed',
    label: 'Flight Booked',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  {
    priority: 6,
    test: (s) => s.latest_booking_status === 'pending_confirmation',
    label: 'Booking Requested',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
]

export function getComputedCustomerStatus(input: CustomerStatusInput): ComputedCustomerStatus {
  for (const rule of STATUS_PRIORITY) {
    if (rule.test(input)) {
      return { label: rule.label, badge: rule.badge, priority: rule.priority }
    }
  }

  // Fall through to mapped clearance status
  const cs = input.pilot_clearance_status as PilotClearanceStatus | null
  return {
    label:    getClearanceLabel(cs, 'admin'),
    badge:    getClearanceBadge(cs),
    priority: 99,
  }
}

// ─── Is checkout eligible (can submit a new checkout request) ─────────────────

export function isCheckoutEligible(pilotClearanceStatus: string | null | undefined): boolean {
  return ['checkout_required', 'additional_checkout_required', 'checkout_reschedule_required']
    .includes(pilotClearanceStatus ?? '')
}

// ─── Can create standard booking ──────────────────────────────────────────────

export function canCreateStandardBooking(
  accountStatus: string | null | undefined,
  pilotClearanceStatus: string | null | undefined,
): boolean {
  return accountStatus === 'active' && pilotClearanceStatus === 'cleared_to_fly'
}
