import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import PortalPageHero from '@/components/PortalPageHero'
import { PAYMENT_CONFIG } from '@/lib/payments/config'
import { blockTimeTransferReference } from '@/lib/payments/block-time-bank-transfer'
import { formatBonusHours, getLivePromotion, getPackagePromo } from '@/lib/promotions'
import { formatDateFromISO } from '@/lib/formatDateTime'
import { cancelPendingBlockTimePurchase } from '@/app/actions/payment'
import BankTransferReceiptForm from './BankTransferReceiptForm'

export const metadata = { title: 'Bank Transfer | OZRentAPlane' }
export const dynamic = 'force-dynamic'

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function aud(value: number): string {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[#4b6390]">{label}</span>
      <span className={`text-right font-medium text-[#152d5a] ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

export default async function BlockTimeBankTransferPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await getCachedUser()
  if (!user) redirect('/login')

  const { data: purchase } = await supabase
    .from('pilot_block_time_purchases')
    .select(`
      id, user_id, package_id, status, hours_purchased, bonus_hours, rate_per_hour, amount_paid,
      purchased_at, activated_at, expires_at,
      package:block_time_packages ( name, validity_days )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!purchase) notFound()

  const { data: submissionRows } = await supabase
    .from('block_time_bank_transfer_submissions')
    .select('id, status, admin_note, submitted_at, reviewed_at, promo_bonus_hours, promo_free_checkout')
    .eq('purchase_id', id)
    .order('submitted_at', { ascending: false })

  const submissions = submissionRows ?? []
  const latest = submissions[0] ?? null
  const pkg = one(purchase.package as any) as { name: string; validity_days: number } | null
  const packageName = pkg?.name ?? 'Block Time'
  const reference = blockTimeTransferReference(purchase.id)
  const amount = Number(purchase.amount_paid)

  // Promo terms: locked on the first receipt; before that, show what is live now.
  const firstReceipt = submissions[submissions.length - 1] ?? null
  const livePromo = firstReceipt ? null : getPackagePromo(await getLivePromotion(supabase), purchase.package_id)
  const bonusHours = firstReceipt ? Number(firstReceipt.promo_bonus_hours ?? 0) : livePromo?.bonusHours ?? 0
  const freeCheckout = firstReceipt ? firstReceipt.promo_free_checkout === true : livePromo?.freeCheckout ?? false

  const isPending = purchase.status === 'pending'
  const awaitingReview = isPending && latest?.status === 'pending_review'
  const needsNewReceipt = isPending && (latest?.status === 'resubmission_requested' || latest?.status === 'rejected')
  const isActive = purchase.status === 'active'

  const bank = {
    bankName: PAYMENT_CONFIG.BANK_NAME,
    accountName: PAYMENT_CONFIG.BANK_ACCOUNT_NAME,
    bsb: PAYMENT_CONFIG.BANK_BSB,
    accountNumber: PAYMENT_CONFIG.BANK_ACCOUNT_NUMBER,
  }

  return (
    <>
      <PortalPageHero
        eyebrow="Block Time"
        title="Pay by bank transfer"
        subtitle="Transfer the amount below, then upload your receipt. We activate your package once the payment is verified."
        backgroundImage="/optimized/pricing-hero-1400.jpg"
        backgroundPosition="center"
        backHref="/dashboard/pricing"
        backLabel="Back to pricing"
        statusPill={
          isActive
            ? { label: 'Package active', color: 'green', pulse: true }
            : awaitingReview
              ? { label: 'Awaiting admin review', color: 'amber', pulse: true }
              : { label: 'Payment required', color: 'slate' }
        }
      />

      <div className="mx-auto max-w-[900px] space-y-6 px-4 pb-24 pt-4 sm:px-6 sm:pb-16">
        {/* Purchase summary */}
        <section className="rounded-[1.25rem] border border-[#152d5a]/10 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#1a4fd6]">receipt_long</span>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#1a4fd6]">Purchase details</h2>
          </div>
          <div className="space-y-2.5 text-sm">
            <Row label="Package" value={packageName} />
            <Row label="Hours" value={`${Number(purchase.hours_purchased).toFixed(0)} hours`} />
            <Row label="Locked rate" value={`${aud(Number(purchase.rate_per_hour))}/hr`} />
            <Row label="Validity" value={`${pkg?.validity_days ?? '—'} days from activation`} />
            {bonusHours > 0 ? <Row label="Bonus hours" value={formatBonusHours(bonusHours)} /> : null}
            {freeCheckout ? <Row label="Included" value="Free checkout flight" /> : null}
            <div className="flex items-start justify-between gap-4 border-t border-[#152d5a]/10 pt-3 text-base font-bold text-[#1a4fd6]">
              <span>Amount to transfer (incl. GST)</span>
              <span className="tabular-nums">{aud(amount)}</span>
            </div>
          </div>
        </section>

        {isActive ? (
          <section className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-emerald-700">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              <h2 className="text-xs font-bold uppercase tracking-widest">Payment confirmed</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-emerald-900">
              Your bank transfer was verified and your package is active
              {purchase.expires_at ? ` until ${formatDateFromISO(purchase.expires_at)}` : ''}.
            </p>
            <Link
              href="/dashboard/purchases"
              className="mt-3 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-emerald-700"
            >
              View my package
            </Link>
          </section>
        ) : !isPending ? (
          <section className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700 sm:p-6">
            This purchase is {purchase.status} and can no longer be paid.{' '}
            <Link href="/dashboard/pricing" className="font-semibold text-[#1a4fd6] underline">Back to pricing</Link>
          </section>
        ) : awaitingReview ? (
          <section className="rounded-[1.25rem] border border-[#152d5a]/10 bg-white p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="material-symbols-outlined text-lg text-[#1a4fd6]">account_balance</span>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#1a4fd6]">Receipt submitted</h2>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-[#4b6390]">
              Thanks — we have your receipt (submitted {formatDateFromISO(latest!.submitted_at)}). An admin will verify the payment, usually within{' '}
              <span className="font-medium text-amber-600">2 to 24 hours</span>. You will get an email as soon as your package is active.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-[#152d5a]/10 bg-[#f0f6ff] p-3 text-sm text-[#152d5a]">
              <span className="material-symbols-outlined text-[18px] text-[#1a4fd6]">pending_actions</span>
              Awaiting admin review — no further action needed
            </div>
            <p className="mt-3 text-[11px] text-[#4b6390]">
              Payment reference: <span className="font-mono text-[#152d5a]">{reference}</span>
            </p>
          </section>
        ) : (
          <>
            {needsNewReceipt && latest ? (
              <section
                className={`rounded-[1.25rem] border p-5 sm:p-6 ${
                  latest.status === 'rejected' ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px]">
                    {latest.status === 'rejected' ? 'error' : 'photo_camera'}
                  </span>
                  <h2 className="text-xs font-bold uppercase tracking-widest">
                    {latest.status === 'rejected' ? 'Payment could not be verified' : 'Please upload a new receipt'}
                  </h2>
                </div>
                {latest.admin_note ? (
                  <p className="mt-2 text-sm leading-relaxed">
                    <span className="font-semibold">Note from our team:</span> {latest.admin_note}
                  </p>
                ) : null}
                <p className="mt-2 text-sm leading-relaxed">
                  Your package has not been activated yet. Upload a clear receipt below once your transfer is complete.
                </p>
              </section>
            ) : null}

            <section className="rounded-[1.25rem] border border-[#152d5a]/10 bg-white p-5 sm:p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#1a4fd6]">info</span>
                <h2 className="text-xs font-bold uppercase tracking-widest text-[#1a4fd6]">How it works</h2>
              </div>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-[#4b6390]">
                <li>Transfer the exact amount below to the OZ Rent A Plane account, using the payment reference.</li>
                <li>Upload a receipt or screenshot of the successful transfer.</li>
                <li>
                  Our team verifies it (usually within <span className="font-medium text-amber-600">2 to 24 hours</span>) and your package is activated. No card surcharge applies.
                </li>
              </ol>
            </section>

            <section className="rounded-[1.25rem] border border-[#152d5a]/10 bg-white p-5 sm:p-6">
              <p className="mb-1 text-xs text-[#4b6390]">Transfer amount</p>
              <p className="mb-4 text-2xl font-bold text-[#152d5a]">{aud(amount)}</p>
              <div className="space-y-2 border-t border-[#152d5a]/10 pt-3 text-sm">
                <Row label="Bank" value={bank.bankName} />
                <Row label="Account name" value={bank.accountName} />
                <Row label="BSB" value={bank.bsb} mono />
                <Row label="Account number" value={bank.accountNumber} mono />
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[#4b6390]">Payment reference</span>
                  <span className="font-mono font-bold text-[#1a4fd6]">{reference}</span>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-[#4b6390]">
                Please include the payment reference exactly as shown so we can match your payment.
              </p>
            </section>

            <section className="rounded-[1.25rem] border border-[#152d5a]/10 bg-white p-5 sm:p-6">
              <BankTransferReceiptForm purchaseId={purchase.id} isResubmission={submissions.length > 0} />
            </section>

            <form
              action={async () => {
                'use server'
                await cancelPendingBlockTimePurchase(purchase.id)
                redirect('/dashboard/pricing')
              }}
              className="text-center"
            >
              <button type="submit" className="text-[12px] font-semibold text-[#4b6390] underline hover:text-[#152d5a]">
                {submissions.length > 0 ? 'Cancel this purchase' : 'Discard this reservation'}
              </button>
            </form>
          </>
        )}
      </div>
    </>
  )
}
