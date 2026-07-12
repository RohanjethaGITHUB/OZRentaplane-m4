import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { TabLink } from '@/app/admin/components/AdminUi'
import { AdminRowActionButton, AdminStatusBadge } from '@/app/admin/components/AdminListView'

type Tab = 'all' | 'payment_required' | 'manual_review' | 'pending' | 'paid' | 'refunded' | 'cancelled'

type BookingInvoiceRow = {
  id: string
  booking_id: string | null
  status: string
  payment_method: string | null
  subtotal_cents: number | null
  stripe_amount_due_cents: number | null
  total_paid_cents: number | null
  created_at: string | null
  updated_at: string | null
  paid_at: string | null
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

function getTab(v?: string): Tab {
  const allowed: Tab[] = ['all', 'payment_required', 'manual_review', 'pending', 'paid', 'refunded', 'cancelled']
  return allowed.includes((v ?? 'all') as Tab) ? (v as Tab) : 'all'
}

export const metadata = { title: 'Booking Payments | Admin' }

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function paymentStatusMeta(status: string) {
  switch (status) {
    case 'payment_required':
      return { label: 'Payment Required', tone: 'amber' as const }
    case 'payment_review_pending':
    case 'bank_transfer_pending_review':
    case 'manual_review':
      return { label: 'Payment Review Pending', tone: 'amber' as const }
    case 'pending':
      return { label: 'Pending', tone: 'blue' as const }
    case 'paid':
      return { label: 'Paid', tone: 'emerald' as const }
    case 'refunded':
    case 'void':
      return { label: 'Refunded', tone: 'red' as const }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'slate' as const }
    default:
      return { label: status.replace(/_/g, ' '), tone: 'slate' as const }
  }
}

function methodLabel(method: string) {
  return method.replace(/_/g, ' ')
}

export default async function BookingPaymentsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const tab = getTab(searchParams.tab)
  const [{ data: invoices }, { data: pendingReviewSubmissions }] = await Promise.all([
    supabase.from('booking_invoices').select('id, booking_id, status, payment_method, subtotal_cents, stripe_amount_due_cents, total_paid_cents, created_at, updated_at, paid_at').order('updated_at', { ascending: false }),
    supabase
      .from('booking_bank_transfer_submissions')
      .select('id, invoice_id, booking_id, status, reference, submitted_at, reviewed_at')
      .eq('status', 'pending_review')
      .order('submitted_at', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
  ])

  const invoiceRows = (invoices ?? []) as BookingInvoiceRow[]
  const pendingReviewRows = (pendingReviewSubmissions ?? []) as BookingBankTransferSubmissionRow[]
  const latestPendingReviewByInvoice = new Map<string, BookingBankTransferSubmissionRow>()
  for (const submission of pendingReviewRows) {
    if (!submission.invoice_id) continue
    if (!latestPendingReviewByInvoice.has(submission.invoice_id)) {
      latestPendingReviewByInvoice.set(submission.invoice_id, submission)
    }
  }
  const manualReviewSubmissions = Array.from(latestPendingReviewByInvoice.values())

  const bookingIds = Array.from(new Set([
    ...invoiceRows.map((i) => i.booking_id).filter(Boolean),
    ...manualReviewSubmissions.map((s) => s.booking_id).filter(Boolean),
  ]))
  const { data: bookingRows } = bookingIds.length ? await supabase.from('bookings').select('id, booking_reference, pic_name, booking_owner_user_id, scheduled_start').in('id', bookingIds) : { data: [] }
  const customerIds = Array.from(new Set((bookingRows ?? []).map((b: any) => b.booking_owner_user_id).filter(Boolean)))
  const { data: customerRows } = customerIds.length ? await supabase.from('profiles').select('id, first_name, last_name, full_name, email').in('id', customerIds) : { data: [] }

  const bookingMap = new Map((bookingRows ?? []).map((b: any) => [b.id, b]))
  const customerMap = new Map((customerRows ?? []).map((c: any) => [c.id, c]))

  function customerForBooking(bookingId: string | null) {
    if (!bookingId) return { name: 'Customer', email: '—' }
    const b: any = bookingMap.get(bookingId)
    const c: any = customerMap.get(b?.booking_owner_user_id)
    const name = c?.first_name ? `${c.first_name} ${c.last_name ?? ''}`.trim() : (c?.full_name ?? b?.pic_name ?? 'Customer')
    return { name, email: c?.email ?? '—' }
  }

  const invoiceMap = new Map(invoiceRows.map((invoice) => [invoice.id, invoice]))

  const rows = (tab === 'manual_review'
    ? manualReviewSubmissions.map((submission) => {
        const invoice = submission.invoice_id ? invoiceMap.get(submission.invoice_id) ?? null : null
        const customer = customerForBooking(submission.booking_id)
        const b: any = bookingMap.get(submission.booking_id)
        return {
          id: submission.id,
          ownerId: b?.booking_owner_user_id ?? null,
          customer: customer.name,
          email: customer.email,
          booking_ref: b?.booking_reference ?? (submission.booking_id ? submission.booking_id.slice(0, 8).toUpperCase() : '—'),
          flight_date: b?.scheduled_start,
          amount_cents: invoice?.stripe_amount_due_cents ?? invoice?.subtotal_cents ?? 0,
          status: 'payment_review_pending',
          method: invoice?.payment_method ?? 'bank_transfer',
          created: submission.submitted_at,
          updated: submission.reviewed_at ?? submission.submitted_at,
          href: submission.booking_id ? `/admin/bookings/requests/${submission.booking_id}` : '/admin/bookings/payments',
        }
      })
    : invoiceRows
        .filter((i) => {
          if (tab === 'all') return true
          if (tab === 'payment_required') return i.status === 'payment_required'
          if (tab === 'pending') return i.status === 'pending'
          if (tab === 'paid') return i.status === 'paid'
          if (tab === 'refunded') return i.status === 'refunded' || i.status === 'void'
          if (tab === 'cancelled') return i.status === 'cancelled'
          return true
        })
        .map((i) => {
          const customer = customerForBooking(i.booking_id)
          const b: any = bookingMap.get(i.booking_id)
        return {
          id: i.id,
          ownerId: b?.booking_owner_user_id ?? null,
          customer: customer.name,
          email: customer.email,
          booking_ref: b?.booking_reference ?? (i.booking_id ? i.booking_id.slice(0, 8).toUpperCase() : '—'),
            flight_date: b?.scheduled_start,
            amount_cents: i.status === 'paid' ? (i.total_paid_cents ?? 0) : (i.stripe_amount_due_cents ?? i.subtotal_cents ?? 0),
            status: i.status,
            method: i.payment_method ?? '—',
            created: i.created_at,
            updated: i.paid_at ?? i.updated_at,
            href: i.booking_id ? `/admin/bookings/requests/${i.booking_id}` : '/admin/bookings/payments',
          }
        }))

  const totalCollected = invoiceRows.filter((i) => i.status === 'paid').reduce((sum, i) => sum + (i.total_paid_cents ?? 0), 0)
  const outstanding = invoiceRows.filter((i) => ['payment_required', 'pending', 'bank_transfer_pending_review'].includes(i.status)).reduce((sum, i) => sum + (i.stripe_amount_due_cents ?? 0), 0)
  const manualReviewCount = manualReviewSubmissions.length
  const refunds = invoiceRows.filter((i) => ['refunded', 'void'].includes(i.status)).length

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'payment_required', label: 'Payment Required' },
    { key: 'manual_review', label: 'Manual Review' },
    { key: 'pending', label: 'Pending' },
    { key: 'paid', label: 'Paid' },
    { key: 'refunded', label: 'Refunded' },
    { key: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <>
      <AdminPortalHero eyebrow="Bookings" title="Booking Payments" subtitle="Payment operations for standard flight bookings." />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-[var(--admin-radius-xl)] border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 shadow-[var(--admin-shadow-panel)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--admin-text-muted)] font-semibold">Total collected</p>
            <p className="mt-4 text-3xl font-semibold text-[var(--admin-text)]">{formatCurrency(totalCollected)}</p>
            <p className="mt-1 text-sm text-[var(--admin-text-muted)]">Settled payments across booking invoices.</p>
          </div>
          <div className="rounded-[var(--admin-radius-xl)] border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 shadow-[var(--admin-shadow-panel)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--admin-text-muted)] font-semibold">Outstanding</p>
            <p className="mt-4 text-3xl font-semibold text-[var(--admin-warning)]">{formatCurrency(outstanding)}</p>
            <p className="mt-1 text-sm text-[var(--admin-text-muted)]">Amount still awaiting customer payment.</p>
          </div>
          <div className="rounded-[var(--admin-radius-xl)] border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 shadow-[var(--admin-shadow-panel)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--admin-text-muted)] font-semibold">Manual review</p>
            <p className="mt-4 text-3xl font-semibold text-[#b45309]">{manualReviewCount}</p>
            <p className="mt-1 text-sm text-[var(--admin-text-muted)]">Bank transfer submissions pending review.</p>
          </div>
          <div className="rounded-[var(--admin-radius-xl)] border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 shadow-[var(--admin-shadow-panel)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--admin-text-muted)] font-semibold">Refunded items</p>
            <p className="mt-4 text-3xl font-semibold text-[#991b1b]">{refunds}</p>
            <p className="mt-1 text-sm text-[var(--admin-text-muted)]">Invoices marked refunded or void.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-4 flex flex-wrap gap-2 shadow-[var(--admin-shadow-panel)]">
          {tabs.map((t) => <TabLink key={t.key} active={tab === t.key} href={`/admin/bookings/payments?tab=${t.key}`} label={t.label} />)}
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] shadow-[var(--admin-shadow-panel)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-white/70 text-[var(--admin-text-muted)]">
                <tr className="border-b border-[var(--admin-divider)]">
                  <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Customer</th>
                  <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Email</th>
                  <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Booking Reference</th>
                  <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Flight Date</th>
                  <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Amount</th>
                  <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Payment Status</th>
                  <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Method</th>
                  <th className="px-5 py-4 text-left font-semibold uppercase tracking-[0.12em] text-[11px]">Created / Updated</th>
                  <th className="px-5 py-4 text-right font-semibold uppercase tracking-[0.12em] text-[11px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-divider)]">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-14 text-center text-[var(--admin-text-muted)]">
                      No payment records for this filter.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const statusMeta = paymentStatusMeta(r.status)
                  return (
                    <tr key={r.id} className="text-[var(--admin-text-muted)] hover:bg-[#f6f9fd] transition-colors">
                      <td className="px-5 py-4 font-medium text-[var(--admin-text)]">
                        {r.ownerId ? (
                          <Link href={`/admin/users/${r.ownerId}`} className="hover:underline hover:text-blue-400 transition-colors">
                            {r.customer}
                          </Link>
                        ) : (
                          r.customer
                        )}
                      </td>
                      <td className="px-5 py-4 text-[var(--admin-text-muted)]">{r.email}</td>
                      <td className="px-5 py-4 font-medium text-[var(--admin-text)]">
                        <Link href={r.href} className="hover:underline hover:text-blue-400 transition-colors font-mono">
                          {r.booking_ref}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-[var(--admin-text)]">{r.flight_date ? new Date(r.flight_date).toLocaleString('en-AU') : '—'}</td>
                      <td className="px-5 py-4 font-medium text-[var(--admin-text)]">{formatCurrency(r.amount_cents)}</td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center rounded-full border border-[var(--admin-border)] bg-[var(--admin-panel-bg-soft)] px-2.5 py-1 text-xs font-medium text-[var(--admin-text)]">
                          {methodLabel(r.method)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[var(--admin-text)]">
                        <div>{r.created ? new Date(r.created).toLocaleString('en-AU') : '—'}</div>
                        <div className="mt-1 text-[11px] text-[var(--admin-text-muted)]">
                          Updated: {r.updated ? new Date(r.updated).toLocaleString('en-AU') : '—'}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex justify-end">
                          <AdminRowActionButton href={r.href} label="View" />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
