const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

export function getCheckoutSelfServiceCutoffMs(startIsoUtc: string): number {
  return new Date(startIsoUtc).getTime() - TWELVE_HOURS_MS
}

export function isCheckoutSelfServiceAllowed(startIsoUtc: string, now = new Date()): boolean {
  const startMs = new Date(startIsoUtc).getTime()
  if (Number.isNaN(startMs)) return false
  return now.getTime() < getCheckoutSelfServiceCutoffMs(startIsoUtc)
}

export function isNoShowLockedProfile(profile: {
  account_status?: string | null
  account_lock_reason?: string | null
}): boolean {
  return profile.account_status === 'blocked' && profile.account_lock_reason === 'checkout_no_show'
}
