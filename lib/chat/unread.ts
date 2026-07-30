import type { VerificationEvent } from '@/lib/supabase/types'

/**
 * Customer-visible chat events (Messages inbox).
 * Includes regular admin/customer chat plus operational notifications
 * (e.g. checkout time updates, clarification requests). Excludes system noise.
 */
export function isCustomerChatEvent(ev: VerificationEvent): boolean {
  if (ev.event_type === 'on_hold' && ev.body) return true
  if (ev.event_type !== 'message' || !ev.body) return false
  if (ev.actor_role === 'customer') return true
  if (ev.actor_role === 'admin') return true
  return false
}

/** Customer-facing unread: admin chat / on-hold messages not yet marked is_read. */
export function countCustomerUnreadMessages(events: VerificationEvent[]): number {
  return events.filter(
    (ev) =>
      isCustomerChatEvent(ev) &&
      ev.actor_role === 'admin' &&
      !ev.is_read,
  ).length
}
