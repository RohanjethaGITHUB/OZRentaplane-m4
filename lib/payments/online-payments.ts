// Single switch for card (Stripe) payments across the whole site.
// Off by default: customers pay by bank transfer and see "Pay online —
// temporarily unavailable". Set NEXT_PUBLIC_ONLINE_PAYMENTS_ENABLED=true (and
// redeploy) to turn cards back on. NEXT_PUBLIC_ so client components can read it.
export const ONLINE_PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_ONLINE_PAYMENTS_ENABLED === 'true'

export const ONLINE_PAYMENTS_UNAVAILABLE_MESSAGE =
  'Online payment is temporarily unavailable. Please pay by bank transfer instead.'
