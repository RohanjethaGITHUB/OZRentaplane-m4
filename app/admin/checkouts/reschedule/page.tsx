import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  AdminDataTable,
  AdminPageHeader,
  AdminStatusBadge,
} from '@/app/admin/components/AdminListView'
import { TabLink } from '@/app/admin/components/AdminUi'
import RescheduleActionButtons from '../cancel-reschedule/RescheduleActionButtons'

type FilterTab = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all'

function getFilterTab(v?: string): FilterTab {
  const allowed: FilterTab[] = ['pending', 'approved', 'rejected', 'cancelled', 'all']
  return allowed.includes((v ?? 'pending') as FilterTab) ? (v as FilterTab) : 'pending'
}

function statusInfo(status: string) {
  if (status === 'pending') return { label: 'Pending review', tone: 'amber' as const }
  if (status === 'approved') return { label: 'Approved', tone: 'emerald' as const }
  if (status === 'rejected') return { label: 'Rejected', tone: 'orange' as const }
  if (status === 'cancelled') return { label: 'Cancelled', tone: 'slate' as const }
  return { label: status, tone: 'slate' as const }
}

function formatSydneyDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export const metadata = { title: 'Checkout Reschedule | Admin' }

export default async function CheckoutReschedulePage({ searchParams }: { searchParams: { tab?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const tab = getFilterTab(searchParams.tab)

  const { data: rows } = await supabase
    .from('checkout_change_requests')
    .select(`
      id, checkout_request_id, request_type, status, created_at,
      original_scheduled_start, original_scheduled_end,
      requested_scheduled_start, requested_scheduled_end,
      bookings (
        id, status, booking_reference, checkout_lifecycle_status,
        scheduled_start, scheduled_end,
        aircraft ( registration ),
        profiles:booking_owner_user_id ( first_name, last_name, full_name, email )
      )
    `)
    .eq('request_type', 'reschedule')
    .order('created_at', { ascending: false })

  const normalized = (rows ?? []).map((row) => {
    const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
    const aircraft = booking && Array.isArray((booking as { aircraft?: unknown }).aircraft)
      ? ((booking as { aircraft?: Array<{ registration?: string }> }).aircraft?.[0] ?? null)
      : (booking as { aircraft?: { registration?: string } } | null)?.aircraft ?? null
    const profile = booking && Array.isArray((booking as { profiles?: unknown }).profiles)
      ? ((booking as { profiles?: Array<{ first_name?: string; last_name?: string; full_name?: string; email?: string }> }).profiles?.[0] ?? null)
      : (booking as { profiles?: { first_name?: string; last_name?: string; full_name?: string; email?: string } } | null)?.profiles ?? null

    const customerName = profile?.first_name
      ? `${profile.first_name} ${profile.last_name ?? ''}`.trim()
      : profile?.full_name ?? profile?.email ?? 'Customer'

    return {
      ...row,
      booking,
      aircraftReg: aircraft?.registration ?? '—',
      customerName,
    }
  })

  const filtered = normalized.filter((row) => {
    if (tab === 'all') return true
    return row.status === tab
  }).sort((a, b) => {
    const aPending = a.status === 'pending' ? 0 : 1
    const bPending = b.status === 'pending' ? 0 : 1
    if (aPending !== bPending) return aPending - bPending
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const tabs: Array<{ key: FilterTab; label: string }> = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'all', label: 'All' },
  ]

  const pendingCount = normalized.filter((row) => row.status === 'pending').length

  return (
    <div>
      <AdminPageHeader
        eyebrow="Checkouts"
        title="Reschedule"
        subtitle="Customer checkout reschedule requests."
      />
      <div className="max-w-[1450px] mx-auto px-6 md:px-10 py-12 pb-24 space-y-6">
        <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-4 flex flex-wrap gap-2 items-center shadow-[var(--admin-shadow-panel)]">
          {tabs.map((t) => (
            <TabLink
              key={t.key}
              active={tab === t.key}
              href={`/admin/checkouts/reschedule?tab=${t.key}`}
              label={t.key === 'pending' ? `${t.label} (${pendingCount})` : t.label}
            />
          ))}
        </div>

        {tab === 'pending' && filtered.length === 0 && (
          <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-8 text-center text-[var(--admin-text-muted)] shadow-[var(--admin-shadow-panel)]">
            No pending reschedule requests.
          </div>
        )}

        <AdminDataTable
          columns={[
            'Customer',
            'Aircraft',
            'Current Checkout Date/Time',
            'Requested New Date/Time',
            'Request Status',
            'Submitted At',
            'Actions',
          ]}
        >
          {filtered.length === 0 && tab !== 'pending' && (
            <tr>
              <td colSpan={7} className="px-5 py-12 text-center text-[var(--admin-text-muted)]">
                No records found for this filter.
              </td>
            </tr>
          )}
          {filtered.map((row) => {
            const status = statusInfo(row.status)
            const isPending = row.status === 'pending'
            return (
              <tr key={row.id} className="border-t border-[var(--admin-divider)] align-top">
                <td className="px-5 py-4">
                  <div className="text-[var(--admin-text)] font-medium">{row.customerName}</div>
                </td>
                <td className="px-5 py-4 text-[var(--admin-text-muted)]">{row.aircraftReg}</td>
                <td className="px-5 py-4 text-[var(--admin-text)]">{formatSydneyDateTime(row.original_scheduled_start)}</td>
                <td className="px-5 py-4 text-[var(--admin-text)]">{formatSydneyDateTime(row.requested_scheduled_start)}</td>
                <td className="px-5 py-4">
                  <AdminStatusBadge label={status.label} tone={status.tone} />
                </td>
                <td className="px-5 py-4 text-[var(--admin-text-muted)]">{formatSydneyDateTime(row.created_at)}</td>
                <td className="px-5 py-4 text-right">
                  {isPending ? (
                    <RescheduleActionButtons
                      changeRequestId={row.id}
                      currentStart={row.original_scheduled_start}
                      currentEnd={row.original_scheduled_end}
                      requestedStart={row.requested_scheduled_start}
                      requestedEnd={row.requested_scheduled_end}
                    />
                  ) : (
                    <Link
                      href={`/admin/bookings/requests/${row.checkout_request_id}`}
                      className="inline-flex items-center rounded-lg border border-[rgba(96,165,250,0.24)] bg-[var(--admin-button-bg)] px-3.5 py-2 text-sm font-medium text-[#bfdbfe] hover:bg-[rgba(37,99,235,0.24)] transition-colors"
                    >
                      View Checkout
                    </Link>
                  )}
                </td>
              </tr>
            )
          })}
        </AdminDataTable>
      </div>
    </div>
  )
}
