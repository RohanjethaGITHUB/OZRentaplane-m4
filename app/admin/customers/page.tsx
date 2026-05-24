import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { ChartShell, type TimeRangeValue } from '@/app/admin/components/AdminUi'
import { AdminDataTable, AdminStatusBadge } from '@/app/admin/components/AdminListView'
import { getCustomerDerivedStatus, getCustomerDerivedStatusMeta, getRecentSignupStatusMeta, hasActiveCheckoutBooking, type CustomerLifecycleStatus } from './customer-status'
import { getAttentionAssessment } from './attention-reason'
import CustomerOverviewCharts from './CustomerOverviewCharts'
import AttentionBadge from './AttentionBadge'
import { countAwaitingFlightRecords } from '@/lib/booking/flight-record-status'

export const metadata = { title: 'Customer Overview | Admin' }
const DATE_FMT = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Australia/Sydney',
})

function getRange(value?: string): TimeRangeValue {
  if (value === 'today' || value === '7d' || value === '30d' || value === '6m' || value === 'max') return value
  return '30d'
}

function getAdminAttentionStatusMeta(input: {
  accountStatus?: string | null
  pilotClearanceStatus?: string | null
  hasCheckoutRequest: boolean
  attentionReason?: string | null
}): { label: string; tone: 'blue' | 'amber' | 'orange' | 'emerald' | 'red' | 'slate' } {
  const reason = input.attentionReason ?? ''
  if (reason.startsWith('Cancellation requested inside 12-hour cutoff')) {
    return { label: 'Cancellation Requested Inside 12-Hour Cutoff', tone: 'red' }
  }
  if (reason.startsWith('Reschedule requested inside 12-hour cutoff')) {
    return { label: 'Reschedule Requested Inside 12-Hour Cutoff', tone: 'red' }
  }
  if (reason.startsWith('Reschedule request pending')) {
    return { label: 'Reschedule Pending Admin Approval', tone: 'amber' }
  }
  return getRecentSignupStatusMeta(input)
}

export default async function AdminCustomersOverview({ searchParams }: { searchParams: { range?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const range = getRange(searchParams.range)

  const [
    { data: customers },
    { data: checkoutBookings },
    { data: pendingRescheduleRows },
    { data: pendingCancellationRows },
    { data: userDocuments },
    { count: upcomingBookingsCount },
    { data: awaitingFlightRecordRows },
    { count: paymentPendingCount },
    { count: completedBookingsCount },
    { count: cancelledBookingsCount },
    { count: manualReviewCount },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, created_at, updated_at, account_status, pilot_clearance_status')
      .eq('role', 'customer')
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('booking_owner_user_id, status, checkout_lifecycle_status')
      .eq('booking_type', 'checkout')
      .not('booking_owner_user_id', 'is', null),
    supabase
      .from('checkout_change_requests')
      .select('created_at, original_scheduled_start, checkout_request_id, bookings!inner(booking_owner_user_id)')
      .eq('request_type', 'reschedule')
      .eq('status', 'pending'),
    supabase
      .from('booking_cancellation_requests')
      .select('created_at, booking_start_time, booking_id, bookings!inner(booking_owner_user_id)')
      .eq('status', 'pending'),
    supabase
      .from('user_documents')
      .select('user_id, document_type, status, expiry_date, medical_class'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').in('status', ['confirmed', 'ready_for_dispatch']),
    supabase
      .from('bookings')
      .select('id, status, scheduled_end, flight_records(status, submitted_at)')
      .eq('booking_type', 'standard')
      .in('status', ['confirmed', 'ready_for_dispatch', 'dispatched', 'awaiting_flight_record', 'flight_record_overdue'])
      .lte('scheduled_end', new Date().toISOString()),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'payment_pending'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'completed'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'cancelled'),
    supabase.from('booking_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
  ])

  const usersWithCheckoutRequests = new Set(
    (checkoutBookings ?? [])
      .filter((b) => hasActiveCheckoutBooking({ status: b.status as string | null, checkout_lifecycle_status: (b as any).checkout_lifecycle_status ?? null }))
      .map((b) => b.booking_owner_user_id)
      .filter(Boolean),
  )
  const awaitingFlightRecordsCount = countAwaitingFlightRecords(awaitingFlightRecordRows)
  const docsByUser = new Map<string, Array<{ user_id: string; document_type: string; status: string; expiry_date: string | null; medical_class?: string | null }>>()
  for (const doc of userDocuments ?? []) {
    const list = docsByUser.get(doc.user_id) ?? []
    list.push(doc)
    docsByUser.set(doc.user_id, list)
  }
  const pendingCheckoutRescheduleByUser = new Map<string, { createdAt: string; originalStart: string | null }>()
  for (const row of pendingRescheduleRows ?? []) {
    const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
    const customerId = booking?.booking_owner_user_id
    if (!customerId || pendingCheckoutRescheduleByUser.has(customerId)) continue
    pendingCheckoutRescheduleByUser.set(customerId, { createdAt: row.created_at, originalStart: row.original_scheduled_start })
  }
  const pendingCancellationByUser = new Map<string, { createdAt: string; bookingStart: string | null }>()
  for (const row of pendingCancellationRows ?? []) {
    const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
    const customerId = booking?.booking_owner_user_id
    if (!customerId || pendingCancellationByUser.has(customerId)) continue
    pendingCancellationByUser.set(customerId, { createdAt: row.created_at, bookingStart: row.booking_start_time })
  }

  const normalized = (customers ?? []).map((c) => {
    const hasCheckoutRequest = usersWithCheckoutRequests.has(c.id)
    const attention = getAttentionAssessment({
      profileId: c.id,
      accountStatus: c.account_status,
      pilotClearanceStatus: c.pilot_clearance_status,
      hasCheckoutRequest,
      documentsByUser: docsByUser,
      pendingCheckoutRescheduleByUser,
      pendingCancellationByUser,
    })
    const derivedStatus = getCustomerDerivedStatus({
      accountStatus: c.account_status,
      pilotClearanceStatus: c.pilot_clearance_status,
      hasCheckoutRequest,
    })
    return {
      ...c,
      lifecycleStatus: derivedStatus,
      needsAttention: attention.hasIssue,
      attentionReason: attention.reason,
      hasCheckoutRequest,
    }
  })

  const checkoutNotRequestedCount = normalized.filter((c) => c.lifecycleStatus === 'checkout_not_requested').length
  const inCheckoutCount = normalized.filter((c) => c.lifecycleStatus === 'in_checkout').length
  const clearedCount = normalized.filter((c) => c.lifecycleStatus === 'cleared_to_fly').length
  const blockedCount = normalized.filter((c) => c.lifecycleStatus === 'blocked').length
  const lifecycleChart = [
    { key: 'checkout_not_requested' as const, name: 'Checkout Not Requested', value: checkoutNotRequestedCount, color: '#38bdf8', href: '/admin/customers/all?status=checkout_not_requested' },
    { key: 'in_checkout' as const, name: 'In Checkout', value: inCheckoutCount, color: '#60a5fa', href: '/admin/customers/all?status=in_checkout' },
    { key: 'cleared_to_fly' as const, name: 'Cleared to Fly', value: clearedCount, color: '#34d399', href: '/admin/customers/all?status=cleared_to_fly' },
    { key: 'blocked' as const, name: 'Blocked', value: blockedCount, color: '#f87171', href: '/admin/customers/all?status=blocked' },
  ]

  const attentionRows = normalized
    .filter((c) => c.needsAttention)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8)

  const rangeStart = (() => {
    const now = new Date()
    if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (range === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    if (range === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    if (range === '6m') return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
    return null
  })()

  const signupBuckets = new Map<string, number>()
  for (const c of normalized) {
    const created = new Date(c.created_at)
    if (rangeStart && created < rangeStart) continue
    const key = range === '6m' || range === 'max'
      ? created.toLocaleDateString('en-AU', { month: 'short', year: '2-digit', timeZone: 'Australia/Sydney' })
      : created.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', timeZone: 'Australia/Sydney' })
    signupBuckets.set(key, (signupBuckets.get(key) ?? 0) + 1)
  }
  const signupsSeries = Array.from(signupBuckets.entries()).map(([label, count]) => ({ label, count }))

  const checkoutPipelineRows: Array<{ key: CustomerLifecycleStatus; href: string; label?: string; description?: string }> = [
    { key: 'checkout_not_requested', href: '/admin/customers/all?status=checkout_not_requested', label: 'No Checkout Requested', description: 'Customers who have created an account but have not requested checkout yet.' },
    { key: 'in_checkout', href: '/admin/customers/all?status=in_checkout' },
    { key: 'cleared_to_fly', href: '/admin/customers/all?status=cleared_to_fly' },
    { key: 'blocked', href: '/admin/customers/all?status=blocked' },
  ]

  const bookingPipelineRows = [
    {
      label: 'Upcoming bookings',
      description: 'Standard flight bookings confirmed and upcoming.',
      count: upcomingBookingsCount ?? 0,
      href: '/admin/bookings/upcoming-flights',
      color: '#60a5fa',
    },
    {
      label: 'Awaiting flight records',
      description: 'Flights waiting on customer post-flight records.',
      count: awaitingFlightRecordsCount ?? 0,
      href: '/admin/bookings/awaiting-flight-records',
      color: '#fbbf24',
    },
    {
      label: 'Payment pending',
      description: 'Bookings awaiting payment completion.',
      count: paymentPendingCount ?? 0,
      href: '/admin/bookings/payments?tab=payment_required',
      color: '#fb923c',
    },
    {
      label: 'Payment review',
      description: 'Manual transfer submissions pending admin review.',
      count: manualReviewCount ?? 0,
      href: '/admin/bookings/payments?tab=manual_review',
      color: '#f59e0b',
    },
    {
      label: 'Completed bookings',
      description: 'Completed standard flights and finalized records.',
      count: completedBookingsCount ?? 0,
      href: '/admin/bookings/history',
      color: '#34d399',
    },
    {
      label: 'Cancelled bookings',
      description: 'Bookings cancelled and closed operationally.',
      count: cancelledBookingsCount ?? 0,
      href: '/admin/bookings/cancellations?status=cancelled',
      color: '#f87171',
    },
  ]

  return (
    <>
      <AdminPortalHero
        eyebrow="Customers"
        title="Customer Overview"
        subtitle="Customer checkout progression, booking operations, and admin follow-up visibility."
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-8">
        <CustomerOverviewCharts
          lifecycle={lifecycleChart}
          checkoutPipeline={checkoutPipelineRows.map((row) => {
            const count = row.key === 'checkout_not_requested'
              ? checkoutNotRequestedCount
              : row.key === 'in_checkout'
              ? inCheckoutCount
              : row.key === 'cleared_to_fly'
              ? clearedCount
              : blockedCount
            const meta = getCustomerDerivedStatusMeta(row.key)
            return {
              key: row.key,
              name: row.label ?? meta.label,
              value: count,
              color: row.key === 'checkout_not_requested' ? '#38bdf8' : row.key === 'in_checkout' ? '#60a5fa' : row.key === 'cleared_to_fly' ? '#34d399' : '#f87171',
              href: row.href,
            }
          })}
          bookingPipeline={bookingPipelineRows.map((row) => ({
            key: row.label.toLowerCase().replace(/\\s+/g, '_'),
            name: row.label,
            value: row.count,
            color: row.color,
            href: row.href,
          }))}
          signups={signupsSeries}
          activeRange={range}
        />

        <section>
          <ChartShell title="Customers Needing Admin Action">
            <AdminDataTable columns={['Customer', 'Reason', 'Status', 'Updated']}>
              {attentionRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-[var(--admin-text-muted)]">No customers currently need admin follow-up.</td>
                </tr>
              ) : (
                attentionRows.map((customer) => {
                  const status = getAdminAttentionStatusMeta({
                    accountStatus: customer.account_status,
                    pilotClearanceStatus: customer.pilot_clearance_status,
                    hasCheckoutRequest: customer.hasCheckoutRequest,
                    attentionReason: customer.attentionReason,
                  })
                  return (
                    <tr key={customer.id} className="border-t border-[var(--admin-divider)] hover:bg-[var(--admin-row-hover)] transition-colors">
                      <td className="px-5 py-[16px]"><Link href={`/admin/users/${customer.id}`} className="block"><div className="flex items-center gap-2"><p className="text-lg leading-tight font-semibold text-[var(--admin-text)]">{customer.full_name || 'Unnamed customer'}</p>{customer.needsAttention ? <AttentionBadge reason={customer.attentionReason} /> : null}</div><p className="mt-1 text-sm text-[var(--admin-text-muted)]">{customer.email || 'No email'}</p></Link></td>
                      <td className="px-5 py-[16px] text-[14px] text-[var(--admin-text-muted)]"><Link href={`/admin/users/${customer.id}`} className="block">{customer.attentionReason}</Link></td>
                      <td className="px-5 py-[16px]"><Link href={`/admin/users/${customer.id}`} className="block"><AdminStatusBadge label={status.label} tone={status.tone} /></Link></td>
                      <td className="px-5 py-[16px] text-[14px] text-[var(--admin-text)]"><Link href={`/admin/users/${customer.id}`} className="block">{DATE_FMT.format(new Date(customer.updated_at))}</Link></td>
                    </tr>
                  )
                })
              )}
            </AdminDataTable>
          </ChartShell>
        </section>
      </div>
    </>
  )
}
