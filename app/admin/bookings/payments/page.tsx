import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import AdminBookingPaymentsInteractive, { PaymentRow, TabKey } from './AdminBookingPaymentsInteractive'

export const dynamic = 'force-dynamic'

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
  submitted_at: string | null
  reviewed_at: string | null
}

function getTab(v?: string): TabKey {
  const allowed: TabKey[] = ['all', 'payment_required', 'manual_review', 'pending', 'paid', 'refunded', 'cancelled']
  return allowed.includes((v ?? 'all') as TabKey) ? (v as TabKey) : 'all'
}

export const metadata = { title: 'Booking & Checkout Payments | Admin' }

export default async function BookingPaymentsPage({ searchParams }: { searchParams: { tab?: string } }) {
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
    { data: allBookings },
    { data: allProfiles },
  ] = await Promise.all([
    supabase
      .from('booking_invoices')
      .select('id, booking_id, customer_id, invoice_number, status, payment_method, subtotal_cents, stripe_amount_due_cents, total_paid_cents, created_at, updated_at, paid_at, pdf_url')
      .order('updated_at', { ascending: false }),
    supabase
      .from('checkout_invoices')
      .select('id, booking_id, customer_id, invoice_number, status, payment_method, subtotal_cents, total_paid_cents, created_at, pdf_url')
      .order('created_at', { ascending: false }),
    supabase
      .from('booking_bank_transfer_submissions')
      .select('id, invoice_id, booking_id, status, reference, submitted_at, reviewed_at')
      .order('submitted_at', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
    supabase
      .from('bookings')
      .select('id, booking_reference, booking_type, pic_name, booking_owner_user_id, scheduled_start, status, checkout_lifecycle_status, aircraft ( registration, display_name )')
      .order('scheduled_start', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, first_name, last_name, full_name, email'),
  ])

  const stdInvoiceRows = (standardInvoices ?? []) as BookingInvoiceRow[]
  const chkInvoiceRows = (checkoutInvoices ?? []) as CheckoutInvoiceRow[]
  const bankSubmissions = (pendingReviewSubmissions ?? []) as BookingBankTransferSubmissionRow[]

  const submissionByInvoice = new Map<string, BookingBankTransferSubmissionRow>()
  const latestPendingReviewByInvoice = new Map<string, BookingBankTransferSubmissionRow>()
  for (const submission of bankSubmissions) {
    if (!submission.invoice_id) continue
    if (!submissionByInvoice.has(submission.invoice_id)) {
      submissionByInvoice.set(submission.invoice_id, submission)
    }
    if (submission.status === 'pending_review' && !latestPendingReviewByInvoice.has(submission.invoice_id)) {
      latestPendingReviewByInvoice.set(submission.invoice_id, submission)
    }
  }

  const bookingMap = new Map((allBookings ?? []).map((b: any) => [b.id, b]))
  const profileMap = new Map((allProfiles ?? []).map((p: any) => [p.id, p]))

  function resolveCustomer(customerId?: string | null, bookingId?: string | null) {
    const b: any = bookingId ? bookingMap.get(bookingId) : null
    const custId = customerId || b?.booking_owner_user_id
    if (custId && profileMap.has(custId)) {
      const p = profileMap.get(custId)
      const name = p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Customer'
      return { name, email: p?.email ?? '—', id: custId }
    }
    return { name: b?.pic_name || 'Customer', email: '—', id: custId || null }
  }

  const allRows: PaymentRow[] = []
  const seenBookingIds = new Set<string>()

  // 1. Add Checkout Invoices
  for (const ci of chkInvoiceRows) {
    if (ci.booking_id) seenBookingIds.add(ci.booking_id)
    const cust = resolveCustomer(ci.customer_id, ci.booking_id)
    const b: any = ci.booking_id ? bookingMap.get(ci.booking_id) : null
    const sub = submissionByInvoice.get(ci.id)
    const amount = ci.status === 'paid' ? (ci.total_paid_cents ?? ci.subtotal_cents ?? 0) : (ci.subtotal_cents ?? 0)

    allRows.push({
      id: ci.id,
      invoiceId: ci.id,
      bookingId: ci.booking_id,
      ownerId: cust.id,
      customer: cust.name,
      email: cust.email,
      booking_ref: b?.booking_reference ?? ci.invoice_number ?? (ci.booking_id ? `CHK-${ci.booking_id.slice(0, 6).toUpperCase()}` : '—'),
      flight_date: b?.scheduled_start,
      amount_cents: amount > 0 ? amount : 25000,
      status: ci.status === 'paid' ? 'paid' : ci.status || 'pending',
      method: ci.payment_method ?? (sub ? 'bank_transfer' : 'stripe'),
      created: ci.created_at,
      updated: ci.created_at,
      href: ci.booking_id ? `/admin/bookings/requests/${ci.booking_id}` : '/admin/bookings/payments',
      pdf_url: ci.pdf_url ?? (ci.booking_id ? `/dashboard/bookings/${ci.booking_id}/invoice` : null),
      bank_reference: sub?.reference ?? null,
      bank_submission_id: sub?.status === 'pending_review' ? sub.id : null,
    })
  }

  // 2. Add Standard Rental Booking Invoices
  for (const i of stdInvoiceRows) {
    if (i.booking_id) seenBookingIds.add(i.booking_id)
    const cust = resolveCustomer(i.customer_id, i.booking_id)
    const b: any = i.booking_id ? bookingMap.get(i.booking_id) : null
    const sub = submissionByInvoice.get(i.id)

    allRows.push({
      id: i.id,
      invoiceId: i.id,
      bookingId: i.booking_id,
      ownerId: cust.id,
      customer: cust.name,
      email: cust.email,
      booking_ref: b?.booking_reference ?? i.invoice_number ?? (i.booking_id ? i.booking_id.slice(0, 8).toUpperCase() : '—'),
      flight_date: b?.scheduled_start,
      amount_cents: i.status === 'paid' ? (i.total_paid_cents ?? 0) : (i.stripe_amount_due_cents ?? i.subtotal_cents ?? 0),
      status: i.status,
      method: i.payment_method ?? (sub ? 'bank_transfer' : 'stripe'),
      created: i.created_at,
      updated: i.paid_at ?? i.updated_at,
      href: i.booking_id ? `/admin/bookings/requests/${i.booking_id}` : '/admin/bookings/payments',
      pdf_url: i.pdf_url ?? (i.booking_id ? `/dashboard/bookings/${i.booking_id}/invoice` : null),
      bank_reference: sub?.reference ?? null,
      bank_submission_id: sub?.status === 'pending_review' ? sub.id : null,
    })
  }

  // 3. Fallback for Completed Checkouts without separate checkout_invoices row
  for (const b of (allBookings ?? []) as any[]) {
    if (b.booking_type === 'checkout' && !seenBookingIds.has(b.id)) {
      const cust = resolveCustomer(b.booking_owner_user_id, b.id)
      const isPaid = b.status === 'completed' || b.checkout_lifecycle_status === 'cleared_to_fly'

      allRows.push({
        id: b.id,
        invoiceId: b.id,
        bookingId: b.id,
        ownerId: cust.id,
        customer: cust.name,
        email: cust.email,
        booking_ref: b.booking_reference ?? `CHK-${b.id.slice(0, 6).toUpperCase()}`,
        flight_date: b.scheduled_start,
        amount_cents: 25000,
        status: isPaid ? 'paid' : 'pending',
        method: 'stripe',
        created: b.scheduled_start,
        updated: b.scheduled_start,
        href: `/admin/bookings/requests/${b.id}`,
        pdf_url: `/dashboard/bookings/${b.id}/invoice`,
        bank_reference: null,
        bank_submission_id: null,
      })
    }
  }

  // Sort newest first
  allRows.sort((a, b) => new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime())

  const totalCollected = allRows
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + i.amount_cents, 0)

  const outstanding = allRows
    .filter((i) => ['payment_required', 'pending', 'bank_transfer_pending_review'].includes(i.status))
    .reduce((sum, i) => sum + i.amount_cents, 0)

  const manualReviewCount = latestPendingReviewByInvoice.size
  const refundsCount = allRows.filter((i) => ['refunded', 'void'].includes(i.status)).length

  return (
    <>
      <AdminPortalHero
        eyebrow="Financial Operations"
        title="Booking Payments & Invoices"
        subtitle="Manage financial settlements, track invoices, and verify payments across all checkouts and rental flights."
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">
        <AdminBookingPaymentsInteractive
          rows={allRows}
          initialTab={initialTab}
          metrics={{
            totalCollected,
            outstanding,
            manualReviewCount,
            refundsCount,
          }}
        />
      </div>
    </>
  )
}
