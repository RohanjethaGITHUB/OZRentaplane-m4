import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import CustomerDirectoryTable from './CustomerDirectoryTable'
import { getCustomerDerivedStatus, getStatusFromQuery, hasActiveCheckoutBooking } from '@/app/admin/customers/customer-status'
import { getAttentionAssessment } from '@/app/admin/customers/attention-reason'

export const metadata = { title: 'Customer Directory | Admin' }

export default async function AllCustomersPage({ searchParams }: { searchParams: { status?: string } }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: profiles }, { data: checkoutBookings }, { data: pendingRescheduleRows }, { data: pendingCancellationRows }, { data: userDocuments }] = await Promise.all([
    supabase
    .from('profiles')
    .select('id, full_name, email, pilot_clearance_status, account_status, updated_at')
    .eq('role', 'customer')
    .order('updated_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('id, booking_owner_user_id, status, checkout_lifecycle_status')
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
  ])

  const usersWithActiveCheckoutRequests = new Set(
    (checkoutBookings ?? [])
      .filter((b) => hasActiveCheckoutBooking({ status: b.status as string | null, checkout_lifecycle_status: (b as any).checkout_lifecycle_status ?? null }))
      .map((b) => b.booking_owner_user_id)
      .filter(Boolean),
  )
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

  const activeStatus = getStatusFromQuery(searchParams.status)
  const rows = (profiles ?? [])
    .map((p) => {
      const hasCheckoutRequest = usersWithActiveCheckoutRequests.has(p.id)
      const attention = getAttentionAssessment({
        profileId: p.id,
        accountStatus: p.account_status,
        pilotClearanceStatus: p.pilot_clearance_status,
        hasCheckoutRequest,
        documentsByUser: docsByUser,
        pendingCheckoutRescheduleByUser,
        pendingCancellationByUser,
      })
      const derivedStatus = getCustomerDerivedStatus({
        accountStatus: p.account_status,
        pilotClearanceStatus: p.pilot_clearance_status,
        hasCheckoutRequest,
      })
      return {
        id: p.id,
        fullName: p.full_name || 'Unnamed customer',
        email: p.email || 'No email',
        updatedAt: p.updated_at,
        lifecycleStatus: derivedStatus,
        needsAttention: attention.hasIssue,
        attentionReason: attention.hasIssue ? attention.reason : null,
      }
    })

  return (
    <>
      <AdminPortalHero eyebrow="Customers" title="Customer Directory" subtitle="Search and filter all customer accounts." />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-6">
        <CustomerDirectoryTable rows={rows} initialFilter={activeStatus} />
      </div>
    </>
  )
}
