import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import CustomerBillingInteractive, {
  PaymentRow,
  CustomerSummary,
  TabKey,
} from './CustomerBillingInteractive'
import {
  getCustomerDerivedStatus,
  getCustomerDerivedStatusMeta,
  hasActiveCheckoutBooking,
} from '@/app/admin/customers/customer-status'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Customer Billing | Admin' }

type BookingInvoiceRow = {
  id: string
  booking_id: string | null
  customer_id: string | null
  invoice_number?: string | null
  status: string
  payment_method: string | null
  subtotal_cents: number | null
  stripe_amount_due_cents: number | null
  total_paid_cents: number | null
  created_at: string | null
  updated_at: string | null
  paid_at: string | null
  pdf_url?: string | null
}

type CheckoutInvoiceRow = {
  id: string
  booking_id: string | null
  customer_id: string | null
  invoice_number?: string | null
  status: string
  payment_method: string | null
  subtotal_cents: number | null
  total_paid_cents: number | null
  created_at: string | null
  updated_at?: string | null
  pdf_url?: string | null
}

type BookingBankTransferSubmissionRow = {
  id: string
  invoice_id: string | null
  booking_id: string | null
  status: string
  reference: string | null
  receipt_storage_path?: string | null
  submitted_at: string | null
  reviewed_at: string | null
}

function getTab(v?: string): TabKey {
  const allowed: TabKey[] = [
    'all',
    'payment_required',
    'manual_review',
    'pending',
    'paid',
    'waived',
    'cancelled',
  ]
  return allowed.includes((v ?? 'all') as TabKey) ? (v as TabKey) : 'all'
}

export default async function CustomerBillingPage({
  searchParams,
}: {
  searchParams: { tab?: string; customerId?: string; q?: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const initialTab = getTab(searchParams.tab)

  const [
    { data: standardInvoices },
    { data: checkoutInvoices },
    { data: pendingReviewSubmissions },
    { data: checkoutBankSubmissions },
    { data: allBookings },
    { data: allProfiles },
    { data: revenueRows },
    { data: creditBalances },
    { data: checkoutBookings },
  ] = await Promise.all([
    supabase
      .from('booking_invoices')
      .select(
        'id, booking_id, customer_id, invoice_number, status, payment_method, subtotal_cents, stripe_amount_due_cents, total_paid_cents, created_at, updated_at, paid_at, pdf_url',
      )
      .order('updated_at', { ascending: false }),
    supabase
      .from('checkout_invoices')
      .select(
        'id, booking_id, customer_id, invoice_number, status, payment_method, subtotal_cents, total_paid_cents, created_at, pdf_url',
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('booking_bank_transfer_submissions')
      .select('id, invoice_id, booking_id, status, reference, receipt_storage_path, submitted_at, reviewed_at')
      .order('submitted_at', { ascending: false }),
    supabase
      .from('checkout_bank_transfer_submissions')
      .select('id, invoice_id, booking_id, status, reference, receipt_storage_path, submitted_at, reviewed_at')
      .order('submitted_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(
        'id, booking_reference, booking_type, pic_name, booking_owner_user_id, scheduled_start, status, checkout_lifecycle_status, aircraft ( registration, display_name )',
      )
      .order('scheduled_start', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, first_name, last_name, full_name, email, role, account_status, pilot_clearance_status')
      .order('created_at', { ascending: false }),
    supabase
      .from('customer_payment_ledger')
      .select('customer_id, amount_cents')
      .gt('amount_cents', 0),
    supabase
      .from('customer_credit_balances')
      .select('customer_id, balance_cents'),
    supabase
      .from('bookings')
      .select('booking_owner_user_id, status, checkout_lifecycle_status')
      .eq('booking_type', 'checkout')
      .not('booking_owner_user_id', 'is', null),
  ])

  const stdInvoiceRows = (standardInvoices ?? []) as BookingInvoiceRow[]
  const chkInvoiceRows = (checkoutInvoices ?? []) as CheckoutInvoiceRow[]
  const bankSubmissions = (pendingReviewSubmissions ?? []) as BookingBankTransferSubmissionRow[]
  const chkSubmissions = (checkoutBankSubmissions ?? []) as BookingBankTransferSubmissionRow[]

  // Build signed URL map for receipts
  const receiptUrlMap = new Map<string, string>()
  const allSubmissions = [...bankSubmissions, ...chkSubmissions]
  const pathsToSign = Array.from(
    new Set(allSubmissions.map((s) => s.receipt_storage_path).filter(Boolean) as string[]),
  )

  await Promise.all(
    pathsToSign.map(async (path) => {
      try {
        const { data } = await supabase.storage
          .from('bank_transfer_receipts')
          .createSignedUrl(path, 7200)
        if (data?.signedUrl) {
          receiptUrlMap.set(path, data.signedUrl)
        }
      } catch (err) {
        // ignore storage error
      }
    }),
  )

  const submissionByInvoice = new Map<string, BookingBankTransferSubmissionRow>()
  const latestPendingReviewByInvoice = new Map<string, BookingBankTransferSubmissionRow>()
  for (const submission of allSubmissions) {
    if (submission.invoice_id && !submissionByInvoice.has(submission.invoice_id)) {
      submissionByInvoice.set(submission.invoice_id, submission)
    }
    if (submission.booking_id && !submissionByInvoice.has(submission.booking_id)) {
      submissionByInvoice.set(submission.booking_id, submission)
    }
    if (submission.status === 'pending_review' && submission.invoice_id && !latestPendingReviewByInvoice.has(submission.invoice_id)) {
      latestPendingReviewByInvoice.set(submission.invoice_id, submission)
    }
  }

  const profilesById = new Map<
    string,
    { name: string; email: string; role?: string; account_status?: any; pilot_clearance_status?: any }
  >()
  for (const p of allProfiles ?? []) {
    profilesById.set(p.id, {
      name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Customer',
      email: p.email || '—',
      role: p.role,
      account_status: p.account_status,
      pilot_clearance_status: p.pilot_clearance_status,
    })
  }

  const bookingsById = new Map<
    string,
    {
      booking_ref: string
      booking_type: string
      pic_name?: string | null
      owner_id: string | null
      flight_date?: string | null
      status: string
      checkout_status?: string | null
      aircraftDisplay?: string | null
    }
  >()

  for (const b of allBookings ?? []) {
    const rawAc = b.aircraft as unknown
    const ac = Array.isArray(rawAc) ? rawAc[0] : (rawAc as { registration?: string; display_name?: string } | null)
    bookingsById.set(b.id, {
      booking_ref: b.booking_reference,
      booking_type: b.booking_type,
      pic_name: b.pic_name,
      owner_id: b.booking_owner_user_id,
      flight_date: b.scheduled_start,
      status: b.status,
      checkout_status: b.checkout_lifecycle_status,
      aircraftDisplay: ac?.display_name || ac?.registration || null,
    })
  }

  const paymentRows: PaymentRow[] = []

  // 1. Booking Invoices (Rental / Flights)
  for (const inv of stdInvoiceRows) {
    const bkg = inv.booking_id ? bookingsById.get(inv.booking_id) : null
    const custId = inv.customer_id || bkg?.owner_id || null
    const profile = custId ? profilesById.get(custId) : null
    const submission = submissionByInvoice.get(inv.id) || (inv.booking_id ? submissionByInvoice.get(inv.booking_id) : null)
    const pendingSubmission = latestPendingReviewByInvoice.get(inv.id)

    const effectiveStatus = pendingSubmission ? 'manual_review' : inv.status
    const receiptUrl = submission?.receipt_storage_path ? receiptUrlMap.get(submission.receipt_storage_path) ?? null : null

    paymentRows.push({
      id: inv.id,
      invoiceId: inv.invoice_number ?? inv.id,
      bookingId: inv.booking_id,
      ownerId: custId,
      customer: profile?.name || bkg?.pic_name || 'Customer',
      email: profile?.email || '—',
      booking_ref: bkg?.booking_ref || inv.invoice_number || 'N/A',
      service_name: 'Aircraft Rental',
      aircraft: bkg?.aircraftDisplay,
      is_checkout: false,
      flight_date: bkg?.flight_date ?? null,
      paid_at: inv.paid_at || null,
      amount_cents: inv.subtotal_cents ?? inv.stripe_amount_due_cents ?? inv.total_paid_cents ?? 0,
      status: effectiveStatus,
      method: inv.payment_method || (submission ? 'bank_transfer' : 'stripe'),
      created: inv.created_at,
      updated: inv.updated_at || inv.paid_at || inv.created_at,
      href: inv.booking_id ? `/admin/bookings/requests/${inv.booking_id}` : '#',
      pdf_url: inv.pdf_url,
      bank_reference: submission?.reference,
      bank_submission_id: pendingSubmission?.id,
      receipt_url: receiptUrl,
    })
  }

  // 2. Checkout Invoices
  for (const inv of chkInvoiceRows) {
    const bkg = inv.booking_id ? bookingsById.get(inv.booking_id) : null
    const custId = inv.customer_id || bkg?.owner_id || null
    const profile = custId ? profilesById.get(custId) : null
    const submission = submissionByInvoice.get(inv.id) || (inv.booking_id ? submissionByInvoice.get(inv.booking_id) : null)
    const pendingSubmission = latestPendingReviewByInvoice.get(inv.id)

    const effectiveStatus = pendingSubmission ? 'manual_review' : inv.status
    const receiptUrl = submission?.receipt_storage_path ? receiptUrlMap.get(submission.receipt_storage_path) ?? null : null

    paymentRows.push({
      id: inv.id,
      invoiceId: inv.invoice_number ?? inv.id,
      bookingId: inv.booking_id,
      ownerId: custId,
      customer: profile?.name || bkg?.pic_name || 'Customer',
      email: profile?.email || '—',
      booking_ref: bkg?.booking_ref || inv.invoice_number || 'N/A',
      service_name: 'Checkout Flight',
      aircraft: bkg?.aircraftDisplay,
      is_checkout: true,
      flight_date: bkg?.flight_date ?? null,
      paid_at: (inv as any).paid_at || null,
      amount_cents: inv.subtotal_cents ?? inv.total_paid_cents ?? 0,
      status: effectiveStatus,
      method: inv.payment_method || (submission ? 'bank_transfer' : 'stripe'),
      created: inv.created_at,
      updated: inv.updated_at || inv.created_at,
      href: inv.booking_id ? `/admin/bookings/requests/${inv.booking_id}` : '#',
      pdf_url: inv.pdf_url,
      bank_reference: submission?.reference,
      bank_submission_id: pendingSubmission?.id,
      receipt_url: receiptUrl,
    })
  }

  // Sort paymentRows descending by updated date
  paymentRows.sort((a, b) => {
    const dateA = a.updated ? new Date(a.updated).getTime() : 0
    const dateB = b.updated ? new Date(b.updated).getTime() : 0
    return dateB - dateA
  })

  // Customer Summaries & Balances
  const usersWithCheckoutRequests = new Set(
    (checkoutBookings ?? [])
      .filter((b) =>
        hasActiveCheckoutBooking({
          status: b.status as string | null,
          checkout_lifecycle_status: (b as any).checkout_lifecycle_status ?? null,
        }),
      )
      .map((b) => b.booking_owner_user_id)
      .filter(Boolean),
  )

  const totalPaidByCustomer = new Map<string, number>()
  for (const row of revenueRows ?? []) {
    if (!row.customer_id) continue
    totalPaidByCustomer.set(
      row.customer_id,
      (totalPaidByCustomer.get(row.customer_id) ?? 0) + (row.amount_cents ?? 0),
    )
  }

  const creditBalanceByCustomer = new Map<string, number>()
  for (const cb of creditBalances ?? []) {
    creditBalanceByCustomer.set(cb.customer_id, cb.balance_cents ?? 0)
  }

  const customerList: CustomerSummary[] = (allProfiles ?? [])
    .filter((c) => c.role === 'customer' || !c.role)
    .map((c) => {
      const derivedStatus = getCustomerDerivedStatus({
        accountStatus: c.account_status,
        pilotClearanceStatus: c.pilot_clearance_status,
        hasCheckoutRequest: usersWithCheckoutRequests.has(c.id),
      })
      const statusMeta = getCustomerDerivedStatusMeta(derivedStatus)
      const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Customer'

      return {
        id: c.id,
        name,
        email: c.email || '—',
        totalPaidCents: totalPaidByCustomer.get(c.id) ?? 0,
        creditBalanceCents: creditBalanceByCustomer.get(c.id) ?? 0,
        status: {
          label: statusMeta.label,
          tone: statusMeta.tone,
        },
      }
    })

  // Calculate high-level KPIs
  const totalCollected = paymentRows
    .filter((r) => r.status === 'paid')
    .reduce((sum, r) => sum + r.amount_cents, 0)

  const outstanding = paymentRows
    .filter((r) => r.status === 'payment_required' || r.status === 'pending')
    .reduce((sum, r) => sum + r.amount_cents, 0)

  const manualReviewCount = paymentRows.filter(
    (r) =>
      r.status === 'manual_review' ||
      r.status === 'payment_review_pending' ||
      r.status === 'bank_transfer_pending_review' ||
      Boolean(r.bank_submission_id),
  ).length

  const waivedCount = paymentRows.filter(
    (r) => r.status === 'waived' || r.status === 'admin_waived' || r.status === 'void',
  ).length

  const totalCredits = (creditBalances ?? []).reduce(
    (sum, cb) => sum + Math.max(0, cb.balance_cents ?? 0),
    0,
  )

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      {/* Rich Aviation Hero Header */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a1b33] via-[#0e274c] to-[#152d5a] border-b border-[#152d5a]/20 pt-8 pb-20 sm:pb-24 px-4 sm:px-6 md:px-10">
        {/* Glow & Ambient Lighting */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 20% 0%, rgba(26,79,214,0.35) 0%, transparent 65%), radial-gradient(ellipse at 85% 100%, rgba(16,185,129,0.18) 0%, transparent 55%)',
          }}
        />
        {/* Faint Runway grid lines */}
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10 mx-auto max-w-[1400px]">
          {/* Eyebrow and Live Status */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-blue-200">
                Financial Operations Command
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white/90 text-xs font-semibold">
                <span className="material-symbols-outlined text-[14px] text-emerald-400">check_circle</span>
                {customerList.length} Customer Accounts
              </span>
              {manualReviewCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-400/30 text-amber-200 text-xs font-bold">
                  <span className="material-symbols-outlined text-[14px] text-amber-400">warning</span>
                  {manualReviewCount} Needs Review
                </span>
              )}
            </div>
          </div>

          {/* Title & Subtitle */}
          <h1
            className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight mb-2"
            style={{ fontFamily: 'Newsreader, Georgia, serif' }}
          >
            Customer Billing &amp; Settlement
          </h1>
          <p className="text-xs sm:text-sm text-blue-100/80 max-w-2xl leading-relaxed">
            Real-time ledger tracking, bank transfer verification, automated Stripe reconciliations, and customer credit adjustments.
          </p>
        </div>
      </section>

      {/* Main Interactive Content hanging over hero edge */}
      <div className="relative z-20 mx-auto max-w-[1400px] px-4 sm:px-6 md:px-10 -mt-12 sm:-mt-14 pb-24">
        <CustomerBillingInteractive
          rows={paymentRows}
          customers={customerList}
          initialTab={initialTab}
          initialCustomerId={searchParams.customerId}
          initialQuery={searchParams.q ?? ''}
          metrics={{
            totalCollected,
            outstanding,
            manualReviewCount,
            waivedCount,
            totalCredits,
          }}
        />
      </div>
    </div>
  )
}
