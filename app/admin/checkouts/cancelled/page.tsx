import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  AdminDataTable,
  AdminPageHeader,
  AdminStatusBadge,
} from '@/app/admin/components/AdminListView'

function formatSydneyDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export const metadata = { title: 'Cancelled Checkouts | Admin' }

export default async function CheckoutCancelledPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: cancelRequests }, { data: lifecycleCancelledBookings }] = await Promise.all([
    supabase
      .from('checkout_change_requests')
      .select(`
        id, checkout_request_id, status, created_at, customer_id,
        original_scheduled_start,
        bookings (
          id, status, checkout_lifecycle_status, updated_at,
          scheduled_start, scheduled_end,
          aircraft ( registration ),
          profiles:booking_owner_user_id ( first_name, last_name, full_name, email )
        )
      `)
      .eq('request_type', 'cancel')
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(`
        id, status, checkout_lifecycle_status, updated_at,
        scheduled_start, scheduled_end,
        aircraft ( registration ),
        profiles:booking_owner_user_id ( first_name, last_name, full_name, email )
      `)
      .eq('booking_type', 'checkout')
      .in('checkout_lifecycle_status', ['cancelled_by_customer', 'cancelled_by_admin'])
      .order('updated_at', { ascending: false }),
  ])

  const rows = new Map<string, {
    key: string
    customerName: string
    aircraftReg: string
    originalScheduledStart: string | null
    cancelledBy: 'customer' | 'admin'
    statusLabel: string
    cancelledAt: string | null
  }>()

  for (const row of cancelRequests ?? []) {
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

    rows.set(row.checkout_request_id, {
      key: row.checkout_request_id,
      customerName,
      aircraftReg: aircraft?.registration ?? '—',
      originalScheduledStart: row.original_scheduled_start,
      cancelledBy: 'customer',
      statusLabel: 'Cancelled by customer',
      cancelledAt: row.created_at,
    })
  }

  for (const booking of lifecycleCancelledBookings ?? []) {
    if (rows.has(booking.id)) continue

    const aircraft = Array.isArray((booking as { aircraft?: unknown }).aircraft)
      ? ((booking as { aircraft?: Array<{ registration?: string }> }).aircraft?.[0] ?? null)
      : (booking as { aircraft?: { registration?: string } } | null)?.aircraft ?? null
    const profile = Array.isArray((booking as { profiles?: unknown }).profiles)
      ? ((booking as { profiles?: Array<{ first_name?: string; last_name?: string; full_name?: string; email?: string }> }).profiles?.[0] ?? null)
      : (booking as { profiles?: { first_name?: string; last_name?: string; full_name?: string; email?: string } } | null)?.profiles ?? null

    const customerName = profile?.first_name
      ? `${profile.first_name} ${profile.last_name ?? ''}`.trim()
      : profile?.full_name ?? profile?.email ?? 'Customer'

    const cancelledBy = booking.checkout_lifecycle_status === 'cancelled_by_admin' ? 'admin' : 'customer'

    rows.set(booking.id, {
      key: booking.id,
      customerName,
      aircraftReg: aircraft?.registration ?? '—',
      originalScheduledStart: booking.scheduled_start,
      cancelledBy,
      statusLabel: cancelledBy === 'admin' ? 'Cancelled by admin' : 'Cancelled by customer',
      cancelledAt: booking.updated_at,
    })
  }

  const normalized = Array.from(rows.values()).sort((a, b) => {
    const aTime = a.cancelledAt ? new Date(a.cancelledAt).getTime() : 0
    const bTime = b.cancelledAt ? new Date(b.cancelledAt).getTime() : 0
    return bTime - aTime
  })

  return (
    <div>
      <AdminPageHeader
        eyebrow="Checkouts"
        title="Cancelled"
        subtitle="Cancelled checkout records from customers and admins."
      />
      <div className="max-w-[1450px] mx-auto px-6 md:px-10 py-12 pb-24 space-y-6">
        {normalized.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-slate-300">
            No cancelled checkout requests found.
          </div>
        ) : (
          <AdminDataTable
            columns={[
              'Customer',
              'Aircraft',
              'Original Checkout Date/Time',
              'Cancelled By',
              'Cancellation Status',
              'Submitted/Cancelled At',
            ]}
          >
            {normalized.map((row) => (
              <tr key={row.key} className="border-t border-[var(--admin-divider)] align-top">
                <td className="px-5 py-4"><div className="text-[var(--admin-text)] font-medium">{row.customerName}</div></td>
                <td className="px-5 py-4 text-[var(--admin-text-muted)]">{row.aircraftReg}</td>
                <td className="px-5 py-4 text-[var(--admin-text)]">{formatSydneyDateTime(row.originalScheduledStart)}</td>
                <td className="px-5 py-4">
                  <AdminStatusBadge
                    label={row.cancelledBy === 'admin' ? 'Cancelled by admin' : 'Cancelled by customer'}
                    tone={row.cancelledBy === 'admin' ? 'slate' : 'red'}
                  />
                </td>
                <td className="px-5 py-4"><AdminStatusBadge label={row.statusLabel} tone={row.cancelledBy === 'admin' ? 'slate' : 'red'} /></td>
                <td className="px-5 py-4 text-[var(--admin-text-muted)]">{formatSydneyDateTime(row.cancelledAt)}</td>
              </tr>
            ))}
          </AdminDataTable>
        )}
      </div>
    </div>
  )
}
