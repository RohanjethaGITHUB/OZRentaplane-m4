import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Block time promotions (Black Friday) ─────────────────────────────────────
// Single source of truth for "is a sale live right now" and "what does this
// package get". Used by the marketing banner, the sale page, the customer
// Block Time page, the purchase server action and the admin Promotions page.

export type PromotionRow = {
  id: string
  slug: string
  name: string
  is_enabled: boolean
  starts_at: string
  ends_at: string
  allow_uncleared_purchase: boolean
  headline: string | null
  marquee_text: string | null
  updated_at?: string
}

export type PromotionRuleRow = {
  id: string
  promotion_id: string
  package_id: string
  bonus_hours: number
  includes_free_checkout: boolean
}

export type PromotionStatus = 'disabled' | 'scheduled' | 'live' | 'ended'

export type PackagePromo = {
  promotionId: string
  bonusHours: number
  freeCheckout: boolean
}

export type LivePromotion = PromotionRow & {
  rules: PromotionRuleRow[]
}

const PROMOTION_COLUMNS =
  'id, slug, name, is_enabled, starts_at, ends_at, allow_uncleared_purchase, headline, marquee_text, updated_at'

export function getPromotionStatus(promo: Pick<PromotionRow, 'is_enabled' | 'starts_at' | 'ends_at'>, now = new Date()): PromotionStatus {
  if (!promo.is_enabled) return 'disabled'
  const t = now.getTime()
  if (t < new Date(promo.starts_at).getTime()) return 'scheduled'
  if (t > new Date(promo.ends_at).getTime()) return 'ended'
  return 'live'
}

export function isPromotionLive(promo: Pick<PromotionRow, 'is_enabled' | 'starts_at' | 'ends_at'> | null | undefined, now = new Date()): boolean {
  return Boolean(promo) && getPromotionStatus(promo!, now) === 'live'
}

/**
 * Returns the currently live promotion with its package rules, or null.
 * Works with an anon, session or service-role client (promotions are public).
 * Never throws — a promotion lookup failure must not break the page.
 */
export async function getLivePromotion(supabase: SupabaseClient, now = new Date()): Promise<LivePromotion | null> {
  try {
    const nowIso = now.toISOString()
    const { data: promo, error } = await supabase
      .from('promotions')
      .select(PROMOTION_COLUMNS)
      .eq('is_enabled', true)
      .lte('starts_at', nowIso)
      .gte('ends_at', nowIso)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !promo) return null

    const { data: rules } = await supabase
      .from('promotion_package_rules')
      .select('id, promotion_id, package_id, bonus_hours, includes_free_checkout')
      .eq('promotion_id', promo.id)

    return {
      ...(promo as PromotionRow),
      rules: ((rules ?? []) as PromotionRuleRow[]).map((r) => ({ ...r, bonus_hours: Number(r.bonus_hours) })),
    }
  } catch {
    return null
  }
}

export function getPackagePromo(promotion: LivePromotion | null, packageId: string): PackagePromo | null {
  if (!promotion) return null
  const rule = promotion.rules.find((r) => r.package_id === packageId)
  if (!rule) return null
  if (rule.bonus_hours <= 0 && !rule.includes_free_checkout) return null
  return {
    promotionId: promotion.id,
    bonusHours: Number(rule.bonus_hours),
    freeCheckout: rule.includes_free_checkout,
  }
}

/**
 * Block time purchase eligibility.
 * Cleared pilots can always buy. During a live promotion that allows it,
 * uncleared pilots can buy too. Blocked or archived accounts never can.
 */
export function canPurchaseBlockTime(input: {
  accountStatus: string | null | undefined
  pilotClearanceStatus: string | null | undefined
  promotion: Pick<PromotionRow, 'is_enabled' | 'starts_at' | 'ends_at' | 'allow_uncleared_purchase'> | null
}): boolean {
  if (input.accountStatus && input.accountStatus !== 'active') return false
  if (input.pilotClearanceStatus === 'cleared_to_fly') return true
  return Boolean(input.promotion && isPromotionLive(input.promotion) && input.promotion.allow_uncleared_purchase)
}

export function formatBonusHours(hours: number): string {
  const n = Number(hours)
  const label = Number.isInteger(n) ? String(n) : n.toFixed(1)
  return `+${label} bonus flight ${n === 1 ? 'hour' : 'hours'}`
}

/** Sydney-time label, e.g. "Mon 30 Nov, 11:59 pm". */
export function formatPromotionDate(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}
