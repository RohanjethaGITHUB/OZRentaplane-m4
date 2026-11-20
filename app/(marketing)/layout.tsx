import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import PromoMarquee, { PROMO_MARQUEE_HEIGHT } from '@/components/marketing/PromoMarquee'
import { createClient } from '@/lib/supabase/server'
import { getLivePromotion } from '@/lib/promotions'

// Many marketing pages are force-static. Re-render at least every minute so the
// sale banner turns on/off at the scheduled time without a redeploy (admin
// saves also revalidate immediately via revalidatePath('/', 'layout')).
export const revalidate = 60

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const [{ data }, livePromotion] = await Promise.all([
    supabase.auth.getUser().catch(() => ({ data: { user: null } })),
    getLivePromotion(supabase),
  ])
  const user = data?.user ?? null

  // While a sale is live: scrolling strip above the navbar, the "Shop" slot
  // becomes "Black Friday Sale", and content shifts down by the strip height so
  // every page keeps its existing spacing under the header.
  const marqueeText = livePromotion?.marquee_text?.trim() || null
  const offset = marqueeText ? PROMO_MARQUEE_HEIGHT : 0

  return (
    <>
      {marqueeText ? <PromoMarquee text={marqueeText} /> : null}
      <Navbar
        initialUser={user}
        topOffsetPx={offset}
        promoLink={livePromotion ? { label: 'Black Friday Sale', href: '/black-friday' } : null}
      />
      {offset ? <div style={{ paddingTop: offset }}>{children}</div> : children}
      <Footer />
    </>
  )
}
