import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PortalPageHero from '@/components/PortalPageHero'
import { formatDateFromISO } from '@/lib/formatDateTime'
import { createBlockTimeOveragePaymentSession } from '@/app/actions/payment'
import BlockTimeTopupCard from '../pricing/BlockTimeTopupCard'

export const metadata = { title: 'Purchase History | OZRentAPlane' }

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

function formatAud(value: number): string {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
}

function packageName(purchase: PurchaseRow): string {
  return one(purchase.package)?.name ?? 'Block Time'
}

const PURCHASE_STATUS_PILL: Record<string, { label: string; className: string; dot: string }> = {
  active: { label: 'Active', className: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  pending: { label: 'Pending payment', className: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-400' },
  exhausted: { label: 'Used up', className: 'text-slate-600 bg-slate-50 border-slate-200', dot: 'bg-slate-400' },
  expired: { label: 'Expired', className: 'text-slate-600 bg-slate-50 border-slate-200', dot: 'bg-slate-400' },
  refunded: { label: 'Refunded', className: 'text-red-700 bg-red-50 border-red-200', dot: 'bg-red-400' },
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

export default async function PurchaseHistoryPage({
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
        eyebrow="Dashboard"
        title="Purchase History"
        subtitle="Review pending purchases, manage your active block time, and see every flight billed to your package."
        backgroundImage="/optimized/pricing-hero-1400.jpg"
        backgroundPosition="center"
        backHref="/dashboard"
        backLabel="Back to dashboard"
        statusPill={
          activePurchases.length > 0
            ? { label: `${totalHoursRemaining.toFixed(1)}h remaining`, color: 'green', pulse: true }
            : { label: purchases.length > 0 ? 'Purchase history' : 'No active package', color: 'slate' }
        }
      />

      <div className="mx-auto max-w-[1320px] space-y-8 pb-16 pt-2">
        {topupOutcome === 'success' ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <p className="text-[14px] font-semibold text-emerald-800">Top-up payment received</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-emerald-700">
              Your hours are being added now — the new balance and expiry will appear here within a minute or two of
              Stripe confirming the payment. A tax invoice is on its way to your inbox.
            </p>
          </div>
        ) : topupOutcome === 'cancelled' ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-[14px] font-semibold text-amber-900">Top-up cancelled</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-amber-800">
              No payment was taken. Your package is unchanged — you can start a new top-up whenever you are ready.
            </p>
          </div>
        ) : null}

      {overageOutcome === 'success' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="text-[14px] font-semibold text-emerald-800">Overage payment received</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-emerald-700">
            Thank you — your overage invoice is being marked paid now. Bookings, block time purchases, and top-ups will be
            available again within a minute or two of Stripe confirming the payment.
          </p>
        </div>
      ) : overageOutcome === 'cancelled' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-[14px] font-semibold text-amber-900">Overage payment cancelled</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-amber-800">
            No payment was taken. The overage invoice remains outstanding — new bookings and block time purchases stay
            unavailable until it is paid.
          </p>
        </div>
      ) : null}

      {outstandingOverages.length > 0 && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-600">Action required</p>
              <h2 className="mt-1 text-[18px] font-semibold text-rose-900">Outstanding block time overage</h2>
              <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-rose-800">
                A recent flight exceeded your block time balance. The extra hours were billed at your locked package rate on
                the {outstandingOverages.length === 1 ? 'invoice' : 'invoices'} below. New bookings, package purchases, and
                top-ups are unavailable until {outstandingOverages.length === 1 ? 'it is' : 'they are'} paid.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {outstandingOverages.map((invoice) => (
              <div
                key={invoice.id}
                className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-[13px] font-semibold text-[#152d5a]">
                    Invoice {invoice.invoice_number} — ${Number(invoice.total).toFixed(2)}
                  </p>
                  <p className="text-[12px] text-[#4b6390]">
                    Issued {new Date(invoice.created_at).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' })}
                    {invoice.pdf_url && (
                      <>
                        {' · '}
                        <a
                          href={invoice.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#1a4fd6] underline underline-offset-2"
                        >
                          View PDF
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <form action={createBlockTimeOveragePaymentSession.bind(null, invoice.id)}>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-full bg-rose-600 px-5 py-2.5 text-[12px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-rose-500"
                  >
                    Pay ${Number(invoice.total).toFixed(2)} now
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      <section
        id="top-up"
        className="rounded-2xl border border-[#152d5a]/10 bg-white p-6 md:p-8"
        style={{ boxShadow: '0 4px 40px rgba(2,10,22,0.08)' }}
      >
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6]">Current balance</p>
            <h2
              className="mt-2 text-[32px] font-normal leading-tight text-[#152d5a] md:text-[38px]"
              style={{ fontFamily: 'Newsreader, Georgia, serif' }}
            >
              {totalHoursRemaining.toFixed(1)} hours remaining
            </h2>
            <p className="mt-1.5 text-[14px] text-[#4b6390]">
              {hasActivePackage ? (
                <>
                  Across{' '}
                  <span className="font-semibold text-[#152d5a]">
                    {activePurchases.length} active {activePurchases.length === 1 ? 'package' : 'packages'}
                  </span>
                  {earliestExpiry ? <> · earliest expiry {formatDateFromISO(earliestExpiry)}</> : null}
                </>
              ) : (
                'You have no active block time package. Purchase one below to lock in a lower hourly rate.'
              )}
            </p>
          </div>
          {hasActivePackage ? (
            <Link
              href="#top-up"
              className="inline-flex items-center gap-1 self-start rounded-full border border-[#1a4fd6]/10 bg-[#f0f6ff] px-3.5 py-1.5 text-[12px] font-bold text-[#1a4fd6] transition-colors hover:bg-[#e0eeff] hover:text-[#153eb2]"
            >
              Top up your package
              <span className="material-symbols-outlined text-[14px]">add</span>
            </Link>
          ) : (
            <Link
              href="/dashboard/pricing"
              className="inline-flex items-center gap-1 self-start rounded-full border border-[#1a4fd6]/10 bg-[#f0f6ff] px-3.5 py-1.5 text-[12px] font-bold text-[#1a4fd6] transition-colors hover:bg-[#e0eeff] hover:text-[#153eb2]"
            >
              Browse packages
              <span className="material-symbols-outlined text-[14px]">sell</span>
            </Link>
          )}
        </div>

        {hasActivePackage ? (
          <div className="mt-6 flex flex-col gap-3">
            {activePurchases.map((purchase, index) => {
              const used = Number(purchase.hours_purchased) - Number(purchase.hours_remaining)
              const pct = Math.min(100, Math.max(0, (Number(purchase.hours_remaining) / Number(purchase.hours_purchased)) * 100))

              return (
                <div
                  key={purchase.id}
                  className="rounded-xl border border-[#e2e8f0]/80 bg-[#f8fbff]/70 p-4 transition-colors hover:bg-[#f8fbff]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[16px] font-semibold text-[#152d5a]">{packageName(purchase)}</h3>
                        {activePurchases.length > 1 ? (
                          <span className="rounded-full border border-[#1a4fd6]/15 bg-[#f0f6ff] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1a4fd6]">
                            {index === 0 ? 'Used first' : `Queue #${index + 1}`}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[12px] text-[#4b6390]">
                        ${Number(purchase.rate_per_hour).toFixed(0)}/hr · expires {formatDateFromISO(purchase.expires_at)}
                      </p>
                    </div>
                    <p className="text-[14px] font-semibold text-[#152d5a]">
                      {Number(purchase.hours_remaining).toFixed(1)}h
                      <span className="font-normal text-[#4b6390]"> of {Number(purchase.hours_purchased).toFixed(0)}h left</span>
                    </p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                    <div className="h-full rounded-full bg-[#1a4fd6]" style={{ width: `${pct}%` }} />
                  </div>
                  {used > 0 ? <p className="mt-1.5 text-[11px] text-[#4b6390]">{used.toFixed(1)}h flown so far</p> : null}
                </div>
              )
            })}
          </div>
        ) : null}

        {hasActivePackage ? (
          <BlockTimeTopupCard
            purchaseId={activePurchases[0].id}
            packageName={packageName(activePurchases[0])}
            hoursPurchased={Number(activePurchases[0].hours_purchased)}
            hoursRemaining={Number(activePurchases[0].hours_remaining)}
            ratePerHour={Number(activePurchases[0].rate_per_hour)}
            expiresAt={activePurchases[0].expires_at}
            validityDays={Number(one(activePurchases[0].package)?.validity_days ?? 0)}
          />
        ) : null}
      </section>

      {pendingPurchases.length > 0 ? (
        <section id="pending-purchases" className="scroll-mt-24">
          <SectionHeading icon="hourglass_top" label="Pending purchases" />
          <div className="flex flex-col gap-3">
            {pendingPurchases.map((purchase) => (
              <div
                key={purchase.id}
                className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-[#152d5a]">{packageName(purchase)}</h3>
                    <StatusPill status="pending" />
                  </div>
                  <p className="mt-1 text-[12px] text-[#4b6390]">
                    {Number(purchase.hours_purchased).toFixed(0)} hours · {formatAud(Number(purchase.amount_paid))} · started{' '}
                    {formatDateFromISO(purchase.purchased_at)}
                  </p>
                </div>
                <p className="max-w-[420px] text-[12px] leading-relaxed text-amber-800">
                  Payment for this purchase was never completed. If you paid, it will activate automatically once the payment
                  is confirmed — otherwise simply start a new purchase below.
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {purchases.length > 0 ? (
        <section>
          <SectionHeading icon="receipt_long" label="Purchase history" />
          <div className="overflow-hidden rounded-2xl border border-[#152d5a]/10 bg-white">
            {purchases.map((purchase, idx) => (
              <div
                key={purchase.id}
                className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between ${
                  idx > 0 ? 'border-t border-[#152d5a]/[0.07]' : ''
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-[#152d5a]">{packageName(purchase)}</p>
                    <StatusPill status={purchase.status} />
                  </div>
                  <p className="mt-0.5 text-[12px] text-[#4b6390]">
                    {Number(purchase.hours_purchased).toFixed(0)} hours at ${Number(purchase.rate_per_hour).toFixed(0)}/hr ·
                    purchased {formatDateFromISO(purchase.purchased_at)}
                    {purchase.status === 'active' ? <> · expires {formatDateFromISO(purchase.expires_at)}</> : null}
                  </p>
                  {purchase.status === 'refunded' && purchase.refunded_at ? (
                    <p className="mt-0.5 text-[12px] font-medium text-red-600">
                      Refunded {formatAud(Number(purchase.refund_amount ?? purchase.amount_paid))} on{' '}
                      {formatDateFromISO(purchase.refunded_at)}
                    </p>
                  ) : null}
                </div>
                <p className="text-[14px] font-semibold text-[#152d5a]">{formatAud(Number(purchase.amount_paid))}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeading icon="flight_land" label="Flights billed to block time" />
        {usage.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-[#152d5a]/10 bg-white">
            {usage.map((row, idx) => {
              const booking = one(row.booking)
              const invoice = one(row.invoice)
              const aircraft = one(booking?.aircraft ?? null)

              return (
                <div
                  key={row.id}
                  className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${
                    idx > 0 ? 'border-t border-[#152d5a]/[0.07]' : ''
                  }`}
                >
                  <div>
                    <p className="text-[14px] font-semibold text-[#152d5a]">
                      {booking?.scheduled_start
                        ? new Date(booking.scheduled_start).toLocaleDateString('en-AU', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : formatDateFromISO(row.deducted_at)}
                      {aircraft?.registration ? <span className="font-normal text-[#4b6390]"> · {aircraft.registration}</span> : null}
                      {booking?.booking_reference ? (
                        <span className="font-normal text-[#4b6390]"> · {booking.booking_reference}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#4b6390]">
                      {Number(row.hours_deducted).toFixed(1)}h deducted
                      {Number(row.overflow_hours) > 0 ? (
                        <> · {Number(row.overflow_hours).toFixed(1)}h overflow ({formatAud(Number(row.overflow_amount))})</>
                      ) : null}
                      {' · '}balance after: {Number(row.hours_after).toFixed(1)}h
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {invoice?.pdf_url ? (
                      <a
                        href={invoice.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center whitespace-nowrap rounded-xl border border-[#152d5a]/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#152d5a] transition-colors hover:bg-[#f0f6ff]"
                      >
                        Invoice {invoice.invoice_number}
                      </a>
                    ) : null}
                    {booking ? (
                      <Link
                        href={`/dashboard/bookings/${booking.id}`}
                        className="flex items-center justify-between whitespace-nowrap rounded-xl bg-[#152d5a] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-[#1a3a6e]"
                      >
                        View booking
                        <span className="material-symbols-outlined ml-2 text-[14px]">chevron_right</span>
                      </Link>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#152d5a]/10 bg-white p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f0f6ff]">
              <span className="material-symbols-outlined text-[28px] text-[#1a4fd6]">flight_land</span>
            </div>
            <div>
              <p className="text-[16px] font-semibold text-[#152d5a]">No block time flights yet</p>
              <p className="mt-1 max-w-[360px] text-[13px] text-[#4b6390]">
                Flights billed against your block time balance will appear here after each post-flight review.
              </p>
            </div>
          </div>
        )}
      </section>
      </div>
    </>
  )
}
