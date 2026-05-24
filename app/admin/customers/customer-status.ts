export type CustomerLifecycleStatus = 'checkout_not_requested' | 'in_checkout' | 'cleared_to_fly' | 'blocked'

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
    case 'cleared_to_fly':
      return { label: 'Cleared to Fly', tone: 'emerald' }
    case 'additional_checkout_required':
      return { label: 'Additional Checkout Required', tone: 'amber' }
    case 'checkout_reschedule_required':
      return { label: 'Checkout Reschedule Required', tone: 'amber' }
    case 'not_currently_eligible':
      return { label: 'Not Currently Eligible', tone: 'red' }
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
  if ([
    'checkout_requested',
    'checkout_confirmed',
    'checkout_completed_under_review',
    'checkout_payment_required',
    'additional_checkout_required',
    'checkout_reschedule_required',
    'not_currently_eligible',
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
    case 'in_checkout':
      return {
        label: 'In checkout',
        description: 'Customers currently moving through the checkout process.',
        tone: 'amber',
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
  if (value === 'all' || value === 'checkout_not_requested' || value === 'in_checkout' || value === 'cleared_to_fly' || value === 'needs_attention' || value === 'blocked') {
    return value
  }
  return 'all'
}
