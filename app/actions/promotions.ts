'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sydneyInputToUTC } from '@/lib/utils/sydney-time'
import { emitBlockTimeUpdated, emitOpsChanged } from '@/lib/realtime/emit'

type ActionResult = { ok: true } | { ok: false; error: string }

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') throw new Error('Forbidden')
  return { supabase, adminId: user.id }
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : 'Something went wrong. Please try again.' }
}

function revalidatePromotionSurfaces() {
  revalidatePath('/', 'layout')
  revalidatePath('/black-friday')
  revalidatePath('/dashboard/pricing')
  revalidatePath('/admin/promotions')
}

// ─── Promotion settings ───────────────────────────────────────────────────────

export type UpdatePromotionInput = {
  promotionId: string
  name: string
  isEnabled: boolean
  /** Sydney local time, "YYYY-MM-DDTHH:mm" (from <input type="datetime-local">). */
  startsAtSydney: string
  endsAtSydney: string
  allowUnclearedPurchase: boolean
  headline: string
  marqueeText: string
}

export async function updatePromotion(input: UpdatePromotionInput): Promise<ActionResult> {
  try {
    const { supabase, adminId } = await requireAdmin()
    const startsAt = sydneyInputToUTC(input.startsAtSydney)
    const endsAt = sydneyInputToUTC(input.endsAtSydney)
    if (!startsAt || !endsAt) return { ok: false, error: 'Enter a valid start and end date/time.' }
    if (new Date(endsAt) <= new Date(startsAt)) return { ok: false, error: 'The end must be after the start.' }
    if (!input.name.trim()) return { ok: false, error: 'Name is required.' }

    const { error } = await supabase
      .from('promotions')
      .update({
        name: input.name.trim(),
        is_enabled: input.isEnabled,
        starts_at: startsAt,
        ends_at: endsAt,
        allow_uncleared_purchase: input.allowUnclearedPurchase,
        headline: input.headline.trim() || null,
        marquee_text: input.marqueeText.trim() || null,
        updated_by: adminId,
      })
      .eq('id', input.promotionId)
    if (error) return { ok: false, error: error.message }

    revalidatePromotionSurfaces()
    void emitOpsChanged()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/** Closes the sale immediately (keeps it enabled so history/status stays visible). */
export async function endPromotionNow(promotionId: string): Promise<ActionResult> {
  try {
    const { supabase, adminId } = await requireAdmin()
    const { data: promo } = await supabase.from('promotions').select('starts_at').eq('id', promotionId).single()
    if (!promo) return { ok: false, error: 'Promotion not found.' }
    const now = new Date()
    // ends_at must stay after starts_at (DB check) — for a sale that has not
    // started yet, ending it means switching it off.
    const update = new Date(promo.starts_at) < now
      ? { ends_at: now.toISOString(), updated_by: adminId }
      : { is_enabled: false, updated_by: adminId }
    const { error } = await supabase.from('promotions').update(update).eq('id', promotionId)
    if (error) return { ok: false, error: error.message }
    revalidatePromotionSurfaces()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export type UpdatePromotionRuleInput = {
  ruleId: string
  bonusHours: number
  includesFreeCheckout: boolean
}

export async function updatePromotionRules(rules: UpdatePromotionRuleInput[]): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdmin()
    for (const rule of rules) {
      if (!Number.isFinite(rule.bonusHours) || rule.bonusHours < 0 || rule.bonusHours > 50) {
        return { ok: false, error: 'Bonus hours must be between 0 and 50.' }
      }
    }
    for (const rule of rules) {
      const { error } = await supabase
        .from('promotion_package_rules')
        .update({
          bonus_hours: Math.round(rule.bonusHours * 100) / 100,
          includes_free_checkout: rule.includesFreeCheckout,
        })
        .eq('id', rule.ruleId)
      if (error) return { ok: false, error: error.message }
    }
    revalidatePromotionSurfaces()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ─── Case-by-case: manual bonus hours ─────────────────────────────────────────
// The client agrees extra hours one-to-one with regular customers. These are
// never advertised; the admin records them here with a reason (audited).

export async function grantBonusHours(input: {
  customerId: string
  purchaseId: string
  hours: number
  reason: string
}): Promise<ActionResult> {
  try {
    const { adminId } = await requireAdmin()
    const hours = Math.round(Number(input.hours) * 100) / 100
    if (!Number.isFinite(hours) || hours <= 0 || hours > 50) {
      return { ok: false, error: 'Enter between 0.1 and 50 hours.' }
    }
    if (!input.reason.trim()) return { ok: false, error: 'A reason is required (for example "Regular customer — agreed by phone").' }

    const admin = createAdminClient()
    const { data: purchase, error: purchaseErr } = await admin
      .from('pilot_block_time_purchases')
      .select('id, user_id, status, hours_remaining, bonus_hours')
      .eq('id', input.purchaseId)
      .single()
    if (purchaseErr || !purchase) return { ok: false, error: 'Package not found.' }
    if (purchase.user_id !== input.customerId) return { ok: false, error: 'This package belongs to a different customer.' }
    if (!['active', 'exhausted'].includes(purchase.status)) {
      return { ok: false, error: 'Bonus hours can only be added to an active (or used-up) package.' }
    }

    const newRemaining = Math.round((Number(purchase.hours_remaining) + hours) * 100) / 100
    const { data: updated, error: updateErr } = await admin
      .from('pilot_block_time_purchases')
      .update({
        hours_remaining: newRemaining,
        bonus_hours: Math.round((Number(purchase.bonus_hours ?? 0) + hours) * 100) / 100,
        status: 'active',
      })
      .eq('id', purchase.id)
      .eq('hours_remaining', purchase.hours_remaining) // optimistic lock against a concurrent drawdown
      .select('id')
    if (updateErr) return { ok: false, error: updateErr.message }
    if (!updated || updated.length === 0) {
      return { ok: false, error: 'The package balance changed while saving. Refresh and try again.' }
    }

    const { error: grantErr } = await admin.from('block_time_bonus_grants').insert({
      purchase_id: purchase.id,
      user_id: purchase.user_id,
      hours,
      source: 'manual',
      reason: input.reason.trim(),
      granted_by: adminId,
    })
    if (grantErr) console.error('[grantBonusHours] audit insert failed', grantErr)

    await admin.from('verification_events').insert({
      user_id: purchase.user_id,
      actor_user_id: adminId,
      actor_role: 'admin',
      event_type: 'message',
      title: `${hours} bonus flight ${hours === 1 ? 'hour' : 'hours'} added`,
      body: `We've added ${hours} bonus ${hours === 1 ? 'hour' : 'hours'} to your block time package. Your balance is now ${newRemaining} hours. Thanks for flying with OZ Rent A Plane!`,
      is_read: false,
      email_status: 'skipped',
    })

    revalidatePath(`/admin/users/${purchase.user_id}`)
    revalidatePath('/admin/promotions')
    revalidatePath('/dashboard/pricing')
    void emitBlockTimeUpdated(purchase.user_id)
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ─── Free checkout credits ────────────────────────────────────────────────────

export async function cancelCheckoutCredit(creditId: string, reason: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    if (!reason.trim()) return { ok: false, error: 'A reason is required.' }
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('checkout_credits')
      .update({ status: 'cancelled', cancelled_reason: reason.trim() })
      .eq('id', creditId)
      .eq('status', 'available')
      .select('user_id')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'Only an available credit can be cancelled.' }
    revalidatePath(`/admin/users/${data.user_id}`)
    revalidatePath('/admin/promotions')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/** Manually give a customer a free checkout credit (case-by-case goodwill). */
export async function issueCheckoutCredit(customerId: string, reason: string): Promise<ActionResult> {
  try {
    const { adminId } = await requireAdmin()
    if (!reason.trim()) return { ok: false, error: 'A reason is required.' }
    const admin = createAdminClient()
    const { error } = await admin.from('checkout_credits').insert({ user_id: customerId })
    if (error) return { ok: false, error: error.message }
    await admin.from('booking_audit_events').insert({
      actor_user_id: adminId,
      actor_role: 'admin',
      event_type: 'checkout_credit_issued',
      event_summary: `Free checkout credit issued manually. Reason: ${reason.trim()}`,
      new_value: { customer_id: customerId, reason: reason.trim() },
    })
    revalidatePath(`/admin/users/${customerId}`)
    revalidatePath('/admin/promotions')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ─── Customer profile summary ─────────────────────────────────────────────────

export type CustomerPromotionSummary = {
  credits: { id: string; status: string; created_at: string; used_at: string | null; used_on_booking_id: string | null; cancelled_reason: string | null; promotion_name: string | null }[]
  grants: { id: string; hours: number; source: string; reason: string | null; created_at: string; package_name: string | null }[]
  purchases: { id: string; package_name: string; status: string; hours_remaining: number; bonus_hours: number; promotion_name: string | null }[]
}

export async function getCustomerPromotionSummary(customerId: string): Promise<CustomerPromotionSummary> {
  const { supabase } = await requireAdmin()
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

  const [credits, grants, purchases] = await Promise.all([
    supabase
      .from('checkout_credits')
      .select('id, status, created_at, used_at, used_on_booking_id, cancelled_reason, promotion:promotions ( name )')
      .eq('user_id', customerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('block_time_bonus_grants')
      .select('id, hours, source, reason, created_at, purchase:pilot_block_time_purchases ( package:block_time_packages ( name ) )')
      .eq('user_id', customerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('pilot_block_time_purchases')
      .select('id, status, hours_remaining, bonus_hours, package:block_time_packages ( name ), promotion:promotions ( name )')
      .eq('user_id', customerId)
      .in('status', ['active', 'exhausted'])
      .order('purchased_at', { ascending: false }),
  ])

  return {
    credits: (credits.data ?? []).map((c: any) => ({
      id: c.id, status: c.status, created_at: c.created_at, used_at: c.used_at,
      used_on_booking_id: c.used_on_booking_id, cancelled_reason: c.cancelled_reason,
      promotion_name: one<{ name: string }>(c.promotion)?.name ?? null,
    })),
    grants: (grants.data ?? []).map((g: any) => ({
      id: g.id, hours: Number(g.hours), source: g.source, reason: g.reason, created_at: g.created_at,
      package_name: one<{ name: string }>(one<any>(g.purchase)?.package)?.name ?? null,
    })),
    purchases: (purchases.data ?? []).map((p: any) => ({
      id: p.id, status: p.status, hours_remaining: Number(p.hours_remaining), bonus_hours: Number(p.bonus_hours ?? 0),
      package_name: one<{ name: string }>(p.package)?.name ?? 'Block Time',
      promotion_name: one<{ name: string }>(p.promotion)?.name ?? null,
    })),
  }
}
