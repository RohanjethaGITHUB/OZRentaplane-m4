export type CustomerLifecycleStatus =
  | 'checkout_not_requested'
  | 'payment_required'
  | 'in_checkout'
  | 'additional_checkout_required'
  | 'checkout_reschedule_required'
  | 'not_currently_eligible'
  | 'needs_attention'
  | 'cleared_to_fly'
  | 'blocked'

const ACTIVE_CHECKOUT_BOOKING_STATUSES = new Set([
  'checkout_requested',
  'checkout_confirmed',
  'checkout_completed_under_review',
  'checkout_payment_required',
])

const INACTIVE_CHECKOUT_LIFECYCLE_STATUSES = new Set([
  'cancelled_by_customer',
  'cancelled_by_admin',
  'customer_cancelled',
  'admin_cancelled',
  'completed',
  'expired',
  'rejected',
])

export function hasActiveCheckoutBooking(row: {
  status?: string | null
  checkout_lifecycle_status?: string | null
}): boolean {
  const status = row.status ?? ''
  const lifecycle = row.checkout_lifecycle_status ?? ''
  return ACTIVE_CHECKOUT_BOOKING_STATUSES.has(status) && !INACTIVE_CHECKOUT_LIFECYCLE_STATUSES.has(lifecycle)
}

export function getRecentSignupStatusMeta(input: {
  accountStatus?: string | null
  pilotClearanceStatus?: string | null
  hasCheckoutRequest: boolean
}): {
  label: string
  tone: 'blue' | 'amber' | 'orange' | 'emerald' | 'red' | 'slate'
} {
  if (input.accountStatus === 'blocked') return { label: 'Blocked', tone: 'red' }
  const clearance = input.pilotClearanceStatus ?? 'checkout_required'
  switch (clearance) {
    case 'checkout_required':
      return { label: 'Checkout Required', tone: 'blue' }
    case 'checkout_requested':
      return { label: 'Checkout Requested', tone: 'blue' }
    case 'checkout_confirmed':
      return { label: 'Checkout Scheduled', tone: 'blue' }
    case 'checkout_completed_under_review':
      return { label: 'Awaiting Checkout Outcome', tone: 'amber' }
    case 'checkout_payment_required':
      return { label: 'Payment Required', tone: 'orange' }
    case 'additional_checkout_required':
      return { label: 'Additional Checkout', tone: 'red' }
    case 'checkout_reschedule_required':
      return { label: 'Reschedule Required', tone: 'red' }
    case 'not_currently_eligible':
      return { label: 'Not Eligible', tone: 'red' }
    case 'cleared_to_fly':
      return { label: 'Cleared to Fly', tone: 'emerald' }
    case 'needs_attention':
      return { label: 'Needs Review', tone: 'red' }
    default:
      return { label: 'In Checkout', tone: 'amber' }
  }
}

export function getCustomerDerivedStatus(input: {
  accountStatus?: string | null
  pilotClearanceStatus?: string | null
  hasCheckoutRequest: boolean
}): CustomerLifecycleStatus {
  if (input.accountStatus === 'blocked') return 'blocked'
  const clearance = input.pilotClearanceStatus ?? 'checkout_required'
  if (!input.hasCheckoutRequest && clearance === 'checkout_required') return 'checkout_not_requested'

  if (clearance === 'cleared_to_fly') return 'cleared_to_fly'
  if (clearance === 'checkout_payment_required') return 'payment_required'
  if (clearance === 'additional_checkout_required') return 'additional_checkout_required'
  if (clearance === 'checkout_reschedule_required') return 'checkout_reschedule_required'
  if (clearance === 'not_currently_eligible') return 'not_currently_eligible'
  if ([
    'checkout_requested',
    'checkout_confirmed',
    'checkout_completed_under_review',
  ].includes(clearance)) {
    return 'in_checkout'
  }
  return 'in_checkout'
}

export function getCustomerDerivedStatusMeta(status: CustomerLifecycleStatus): {
  label: string
  description: string
  tone: 'blue' | 'amber' | 'orange' | 'emerald' | 'red' | 'slate'
} {
  switch (status) {
    case 'checkout_not_requested':
      return {
        label: 'Checkout Required',
        description: 'Customers who currently need a checkout before normal aircraft bookings.',
        tone: 'blue',
      }
    case 'payment_required':
      return {
        label: 'Payment Required',
        description: 'Customers who have received a checkout invoice and are awaiting payment confirmation.',
        tone: 'orange',
      }
    case 'in_checkout':
      return {
        label: 'In checkout',
        description: 'Customers currently moving through the checkout process.',
        tone: 'amber',
      }
    case 'additional_checkout_required':
      return {
        label: 'Additional Checkout',
        description: 'Customers who need another checkout before they can book normally.',
        tone: 'red',
      }
    case 'checkout_reschedule_required':
      return {
        label: 'Reschedule Required',
        description: 'Customers whose checkout needs to be rescheduled.',
        tone: 'red',
      }
    case 'not_currently_eligible':
      return {
        label: 'Not Eligible',
        description: 'Customers who are not currently eligible to fly.',
        tone: 'red',
      }
    case 'needs_attention':
      return {
        label: 'Needs Review',
        description: 'Customers who need follow-up after checkout.',
        tone: 'red',
      }
    case 'cleared_to_fly':
      return {
        label: 'Cleared to fly',
        description: 'Customers approved and ready to book aircraft.',
        tone: 'emerald',
      }
    case 'blocked':
      return {
        label: 'Blocked',
        description: 'Customers currently blocked from flying or booking.',
        tone: 'red',
      }
  }
}

export type CustomerFilterKey = 'all' | CustomerLifecycleStatus | 'needs_attention'

export function getStatusFromQuery(value?: string): CustomerFilterKey {
  if (value === 'all' || value === 'checkout_not_requested' || value === 'payment_required' || value === 'in_checkout' || value === 'additional_checkout_required' || value === 'checkout_reschedule_required' || value === 'not_currently_eligible' || value === 'needs_attention' || value === 'cleared_to_fly' || value === 'blocked') {
    return value
  }
  return 'all'
}
