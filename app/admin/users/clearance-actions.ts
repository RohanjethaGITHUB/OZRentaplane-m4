import type { PilotClearanceStatus } from '@/lib/supabase/types'

export type ActionCta = {
  label: string
  href: (bookingId?: string | null) => string
  style: 'primary' | 'secondary' | 'ghost'
}

export type ClearanceAction = {
  urgency: 'high' | 'medium' | 'low' | 'none'
  /** Icon name (Material Symbols) */
  icon: string
  title: string
  description: string
  ctas: ActionCta[]
}

export const CLEARANCE_ACTION: Record<PilotClearanceStatus, ClearanceAction> = {
  checkout_required: {
    urgency: 'none',
    icon: 'how_to_reg',
    title: 'Checkout Not Yet Requested',
    description: 'This customer has not submitted a checkout flight request yet. No action required until they submit.',
    ctas: [],
  },

  checkout_requested: {
    urgency: 'high',
    icon: 'assignment_turned_in',
    title: 'Review Checkout Request',
    description: 'Customer has submitted a checkout flight request. Review their documents and schedule the checkout flight.',
    ctas: [
      {
        label: 'Review Checkout Request',
        href: (id) => id ? `/admin/bookings/requests/${id}` : '/admin/bookings/checkout',
        style: 'primary',
      },
      {
        label: 'View All Checkout Requests',
        href: () => '/admin/bookings/checkout',
        style: 'ghost',
      },
    ],
  },

  checkout_confirmed: {
    urgency: 'medium',
    icon: 'flight_takeoff',
    title: 'Checkout Flight Scheduled',
    description: 'Checkout flight is confirmed and scheduled. No immediate action required. Check back after the flight date.',
    ctas: [
      {
        label: 'View Checkout Booking',
        href: (id) => id ? `/admin/bookings/requests/${id}` : '/admin/bookings/checkout',
        style: 'primary',
      },
    ],
  },

  checkout_completed_under_review: {
    urgency: 'high',
    icon: 'rate_review',
    title: 'Review Checkout Outcome',
    description: 'The customer has completed their checkout flight. Review the post-flight record and determine the clearance outcome.',
    ctas: [
      {
        label: 'Review Checkout Outcome',
        href: (id) => id ? `/admin/bookings/requests/${id}` : '/admin/bookings/post-flight',
        style: 'primary',
      },
      {
        label: 'View Checkout Booking',
        href: (id) => id ? `/admin/bookings/requests/${id}` : '/admin/bookings/checkout',
        style: 'secondary',
      },
    ],
  },

  checkout_payment_required: {
    urgency: 'high',
    icon: 'payments',
    title: 'Invoice Payment Required',
    description: 'Customer must pay the checkout invoice before they can access standard aircraft bookings. Chase payment or review the invoice.',
    ctas: [
      {
        label: 'View Invoice Booking',
        href: (id) => id ? `/admin/bookings/requests/${id}` : '/admin/bookings/payment-required',
        style: 'primary',
      },
    ],
  },

  cleared_to_fly: {
    urgency: 'none',
    icon: 'verified',
    title: 'Cleared to Fly',
    description: 'This pilot has passed checkout and can make standard aircraft bookings independently.',
    ctas: [
      {
        label: 'View Booking Activity',
        href: () => '/admin/bookings/flights',
        style: 'ghost',
      },
    ],
  },

  additional_checkout_required: {
    urgency: 'medium',
    icon: 'supervisor_account',
    title: 'Additional Checkout Required',
    description: 'This pilot needs another checkout session before being cleared. They can book another checkout flight once payment is settled.',
    ctas: [
      {
        label: 'View Previous Checkout',
        href: (id) => id ? `/admin/bookings/requests/${id}` : '/admin/bookings/checkout',
        style: 'primary',
      },
    ],
  },

  checkout_reschedule_required: {
    urgency: 'medium',
    icon: 'event_repeat',
    title: 'Checkout Reschedule Required',
    description: 'The checkout could not be properly assessed. The pilot can book another checkout session once payment is settled.',
    ctas: [
      {
        label: 'View Previous Checkout',
        href: (id) => id ? `/admin/bookings/requests/${id}` : '/admin/bookings/checkout',
        style: 'primary',
      },
    ],
  },

  not_currently_eligible: {
    urgency: 'low',
    icon: 'block',
    title: 'Not Currently Eligible',
    description: 'This pilot is not ready to continue with aircraft hire. Further training with a qualified instructor is required before they can proceed.',
    ctas: [
      {
        label: 'View Review Notes',
        href: () => '#review-history',
        style: 'ghost',
      },
    ],
  },
}
