import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PortalPageHero from '@/components/PortalPageHero'
import PackageCard from '@/components/PackageCard'
import { BOOKING_TYPE_CARDS } from '@/lib/booking-type-cards'
import { BookingTypeCardView } from '@/components/BookingTypeCardView'
import { formatDateFromISO } from '@/lib/formatDateTime'
import BlockTimePackageScroller from './BlockTimePackageScroller'
import BlockTimePurchaseButton from './BlockTimePurchaseButton'
import BlockTimeTopupCard from './BlockTimeTopupCard'
import { createBlockTimeOveragePaymentSession } from '@/app/actions/payment'

export const metadata = { title: 'Pricing | OZRentAPlane' }

type PackageRow = {
  id: string
  name: string
  hours: number
  rate_per_hour: number
  total_price: number
  validity_days: number
}

type PurchaseRow = {
  id: string
  status: string
  hours_purchased: number
  hours_remaining: number
  rate_per_hour: number
  amount_paid: number
  purchased_at: string
  activated_at: string | null
  expires_at: string
  queue_position: number | null
  refund_amount: number | null
  refunded_at: string | null
  package: PackageJoin | PackageJoin[] | null
}

type PackageJoin = { name: string; validity_days: number }

type UsageRow = {
  id: string
  booking_id: string
  hours_deducted: number
  overflow_hours: number
  overflow_amount: number
  hours_after: number
  deducted_at: string
  invoice: InvoiceJoin | InvoiceJoin[] | null
  booking: BookingJoin | BookingJoin[] | null
}

type InvoiceJoin = { id: string; invoice_number: string; total: number; pdf_url: string | null }
type BookingJoin = {
  id: string
  booking_reference: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  status: string
  aircraft: { registration: string } | { registration: string }[] | null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function normalizePackageSlug(input: string | string[] | undefined): string | null {
  const value = Array.isArray(input) ? input[0] : input
  if (!value) return null
  return value.toLowerCase()
}

function slugifyPackageName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

function packageName(purchase: PurchaseRow): string {
  return one(purchase.package)?.name ?? 'Block Time'
}

function formatAud(value: number): string {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
}

const PURCHASE_STATUS_PILL: Record<string, { label: string; className: string; dot: string }> = {
  active:    { label: 'Active',          className: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  pending:   { label: 'Pending payment', className: 'text-amber-700 bg-amber-50 border-amber-200',       dot: 'bg-amber-400' },
  exhausted: { label: 'Used up',         className: 'text-slate-600 bg-slate-50 border-slate-200',       dot: 'bg-slate-400' },
  expired:   { label: 'Expired',         className: 'text-slate-600 bg-slate-50 border-slate-200',       dot: 'bg-slate-400' },
  refunded:  { label: 'Refunded',        className: 'text-red-700 bg-red-50 border-red-200',             dot: 'bg-red-400' },
}

function StatusPill({ status }: { status: string }) {
  const cfg = PURCHASE_STATUS_PILL[status] ?? {
    label: status.replace(/_/g, ' '),
    className: 'text-slate-600 bg-slate-50 border-slate-200',
    dot: 'bg-slate-400',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cfg.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function SectionHeading({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="material-symbols-outlined text-[18px] text-[#1a4fd6]">{icon}</span>
      <span className="text-[13px] font-semibold uppercase tracking-[0.05em] text-[#152d5a]">{label}</span>
    </div>
  )
}

export default async function BlockTimePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: packageRows }, { data: purchaseRows }, { data: usageRows }, { data: overageRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('pilot_clearance_status')
      .eq('id', user.id)
      .single(),
    supabase
      .from('block_time_packages')
      .select('id, name, hours, rate_per_hour, total_price, validity_days')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('pilot_block_time_purchases')
      .select(`
        id,
        status,
        hours_purchased,
        hours_remaining,
        rate_per_hour,
        amount_paid,
        purchased_at,
        activated_at,
        expires_at,
        queue_position,
        refund_amount,
        refunded_at,
        package:block_time_packages ( name, validity_days )
      `)
      .eq('user_id', user.id)
      .order('purchased_at', { ascending: false }),
    supabase
      .from('pilot_block_time_usage')
      .select(`
        id,
        booking_id,
        hours_deducted,
        overflow_hours,
        overflow_amount,
        hours_after,
        deducted_at,
        invoice:invoices ( id, invoice_number, total, pdf_url ),
        booking:bookings ( id, booking_reference, scheduled_start, scheduled_end, status, aircraft ( registration ) )
      `)
      .eq('user_id', user.id)
      .order('deducted_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, invoice_number, total, created_at, pdf_url')
      .eq('user_id', user.id)
      .eq('is_block_time_overage', true)
      .eq('status', 'awaiting')
      .order('created_at', { ascending: true }),
  ])

  const isCleared = profile?.pilot_clearance_status === 'cleared_to_fly'
  const packages = (packageRows ?? []) as PackageRow[]
  const purchases = (purchaseRows ?? []) as unknown as PurchaseRow[]
  const usage = (usageRows ?? []) as unknown as UsageRow[]
  const selectedPackageSlug = normalizePackageSlug(searchParams?.package)
  const topupOutcomeRaw = searchParams?.block_time_topup
  const topupOutcome = Array.isArray(topupOutcomeRaw) ? topupOutcomeRaw[0] : topupOutcomeRaw ?? null
  const overageOutcomeRaw = searchParams?.overage_payment
  const overageOutcome = Array.isArray(overageOutcomeRaw) ? overageOutcomeRaw[0] : overageOutcomeRaw ?? null
  const outstandingOverages = (overageRows ?? []) as {
    id: string
    invoice_number: string
    total: number
    created_at: string
    pdf_url: string | null
  }[]

  const activePurchases = purchases
    .filter((p) => p.status === 'active')
    .sort((a, b) => {
      const qa = a.queue_position ?? Number.MAX_SAFE_INTEGER
      const qb = b.queue_position ?? Number.MAX_SAFE_INTEGER
      if (qa !== qb) return qa - qb
      return new Date(a.activated_at ?? a.purchased_at).getTime() - new Date(b.activated_at ?? b.purchased_at).getTime()
    })
  const pendingPurchases = purchases.filter((p) => p.status === 'pending')
  const hasActivePackage = activePurchases.length > 0
  const totalHoursRemaining = activePurchases.reduce((sum, p) => sum + Number(p.hours_remaining || 0), 0)
  const earliestExpiry = activePurchases
    .map((p) => p.expires_at)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null

  return (
    <>
      <PortalPageHero
        eyebrow="Pricing"
        title="Pricing"
        subtitle="Compare pay-as-you-fly with prepaid block time, then track your balance, purchases, and flight history below."
        backgroundImage="/optimized/pricing-hero-1400.jpg"
        backgroundPosition="center"
        backHref="/dashboard"
        backLabel="Back to dashboard"
        statusPill={
          activePurchases.length > 0
            ? { label: `${totalHoursRemaining.toFixed(1)}h remaining`, color: 'green', pulse: true }
            : { label: 'No active package', color: 'slate' }
        }
      />

      <BlockTimePackageScroller
        targetId={selectedPackageSlug ? `block-time-package-${selectedPackageSlug}` : null}
      />

      <section className="relative overflow-hidden bg-white px-6 py-24 md:px-12 lg:px-20">
        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-runway-amber">STEP 1</span>
          </div>
          <h2 className="mb-3 font-serif text-4xl font-normal text-oz-navy md:text-5xl">
            Choose your booking type
          </h2>
          <p className="mb-10 text-base text-[#1e3a5f]">
            Two simple ways to book. Pick what works best for your flying.
          </p>

          <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
            <BookingTypeCardView
              card={BOOKING_TYPE_CARDS[0]}
              cta={{
                label: 'Book a Flight',
                href: '/dashboard/bookings/new',
              }}
            />
            <BookingTypeCardView
              card={BOOKING_TYPE_CARDS[1]}
              cta={{
                label: 'Buy a Block Time Package',
                scrollTargetId: 'packages',
              }}
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1320px] space-y-8 pb-16 pt-2">
        <section id="packages">
          <SectionHeading icon="shopping_bag" label="Buy block time" />
          {!isCleared ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
              <p className="text-sm font-semibold">Checkout clearance required</p>
              <p className="mt-1 text-sm leading-relaxed">
                Block Time can be purchased once your checkout is cleared.
              </p>
            </div>
          ) : null}
          {packages.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 pt-4 sm:grid-cols-2 xl:grid-cols-4">
              {packages.map((pkg, index) => {
                const featured = index === packages.length - 2 && packages.length >= 3
                const packageSlug = slugifyPackageName(pkg.name)
                const isSelected = selectedPackageSlug === packageSlug
                return (
                  <PackageCard
                    key={pkg.id}
                    id={`block-time-package-${packageSlug}`}
                    variant="light"
                    className={
                      isSelected
                        ? 'scroll-mt-24 ring-2 ring-[#1a4fd6] ring-offset-4 ring-offset-white shadow-[0_24px_60px_rgba(26,79,214,0.18)]'
                        : ''
                    }
                    pkg={{
                      id: pkg.id,
                      name: pkg.name,
                      hours: Number(pkg.hours),
                      ratePerHour: Number(pkg.rate_per_hour),
                      totalPrice: Number(pkg.total_price),
                      validityDays: pkg.validity_days,
                      featured,
                      badge: featured ? 'Best value' : null,
                    }}
                    action={
                      isCleared ? (
                        hasActivePackage ? (
                          <Link
                            href="/dashboard/purchases#top-up"
                            className="block rounded-xl border border-[#1a4fd6]/10 bg-[#f0f6ff] px-3 py-3 text-center text-[12px] font-semibold leading-relaxed text-[#1a4fd6] transition-colors hover:bg-[#e0eeff] hover:text-[#153eb2]"
                          >
                            You have an active package - top it up instead
                          </Link>
                        ) : (
                          <BlockTimePurchaseButton
                            packageId={pkg.id}
                            packageHours={Number(pkg.hours)}
                            featured={featured}
                            pendingHref="/dashboard/purchases#pending-purchases"
                          />
                        )
                      ) : (
                        <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-[#4b6390]/70">
                          Available after checkout clearance
                        </p>
                      )
                    }
                  />
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#152d5a]/15 bg-white px-5 py-8 text-center">
              <p className="text-[14px] font-medium text-[#152d5a]">No block time packages are available right now.</p>
            </div>
          )}
          <p className="mt-4 text-[12px] text-[#4b6390]">
            All packages include GST and fuel. Landing fees are charged separately. You will be sent to Stripe checkout to
            complete payment securely.
          </p>
        </section>
      </div>
    </>
  )
}
