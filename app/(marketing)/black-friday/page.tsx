import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getPromotionStatus, type PromotionRow, type PromotionRuleRow } from '@/lib/promotions'
import BlackFridayView from './BlackFridayView'

export const metadata: Metadata = {
  title: 'Black Friday Sale — Free Checkout Flight | OZ Rent A Plane',
  description:
    'Black Friday at OZ Rent A Plane: a free checkout flight with every block time package, plus up to 5 bonus flight hours. Cessna 172N VH-KZG, Bankstown (YSBK).',
}

export const revalidate = 60

type PackageRow = { id: string; name: string; hours: number; rate_per_hour: number; total_price: number; validity_days: number; display_order: number }

export default async function BlackFridayPage() {
  const supabase = await createClient()

  const [{ data: userData }, { data: promoRow }] = await Promise.all([
    supabase.auth.getUser().catch(() => ({ data: { user: null } })),
    supabase
      .from('promotions')
      .select('id, slug, name, is_enabled, starts_at, ends_at, allow_uncleared_purchase, headline, marquee_text')
      .eq('is_enabled', true)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const promo = promoRow as PromotionRow | null
  const status = promo ? getPromotionStatus(promo) : 'disabled'
  const isLoggedIn = Boolean(userData?.user)

  const [{ data: packageRows }, { data: ruleRows }] = await Promise.all([
    supabase
      .from('block_time_packages')
      .select('id, name, hours, rate_per_hour, total_price, validity_days, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    promo
      ? supabase.from('promotion_package_rules').select('id, promotion_id, package_id, bonus_hours, includes_free_checkout').eq('promotion_id', promo.id)
      : Promise.resolve({ data: [] as PromotionRuleRow[] }),
  ])

  const tiers = ((packageRows ?? []) as PackageRow[]).map((pkg) => {
    const rule = (ruleRows ?? []).find((r) => r.package_id === pkg.id) as PromotionRuleRow | undefined
    const bonus = Number(rule?.bonus_hours ?? 0)
    const total = Number(pkg.hours) + bonus
    const price = Number(pkg.total_price)
    return {
      ...pkg,
      bonus,
      freeCheckout: Boolean(rule?.includes_free_checkout),
      totalHours: total,
      price,
      effectiveRate: total > 0 ? price / total : Number(pkg.rate_per_hour),
      slug: pkg.name.toLowerCase().replace(/\s+/g, '-'),
    }
  })

  return <BlackFridayView promo={promo} status={status} tiers={tiers} isLoggedIn={isLoggedIn} />
}
