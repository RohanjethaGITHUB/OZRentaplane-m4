import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  AdminDataTable,
  AdminPageHeader,
  AdminRowActionButton,
  AdminStatusBadge,
} from '@/app/admin/components/AdminListView'

function outcomeLabel(v: string | null): string {
  if (!v) return 'No outcome yet'
  if (v === 'cleared_to_fly') return 'Cleared to Fly'
  if (v === 'additional_checkout_required') return 'Additional Checkout Required'
  if (v === 'checkout_reschedule_required') return 'Checkout Reschedule Required'
  if (v === 'not_currently_eligible') return 'Not Currently Eligible'
  return v.replace(/_/g, ' ')
}

function fullName(p: { first_name: string | null; last_name: string | null; full_name: string | null; email: string | null } | undefined, picName: string | null) {
  if (p?.first_name) return `${p.first_name} ${p.last_name ?? ''}`.trim()
  if (p?.full_name) return p.full_name
  if (picName) return picName
  return p?.email ?? 'Customer'
}

function statusLabel(v: string): string {
  if (v === 'checkout_requested') return 'New Request'
  if (v === 'checkout_payment_required') return 'Payment Required'
  if (v === 'checkout_completed_under_review') return 'Awaiting Outcome'
  if (v === 'checkout_reschedule_required') return 'Reschedule Required'
  if (v === 'no_show') return 'No Show'
  return v.replace(/_/g, ' ')
}

export const metadata = { title: 'Checkout History | Admin' }
export const dynamic = 'force-dynamic'

export default async function CheckoutHistoryPage() {
  noStore()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, booking_reference, booking_owner_user_id, pic_name, status, scheduled_start, created_at, updated_at')
    .eq('booking_type', 'checkout')
    .order('updated_at', { ascending: false })

  const bookingIds = (bookings ?? []).map((b) => b.id)
  const ownerIds = Array.from(new Set((bookings ?? []).map((b) => b.booking_owner_user_id).filter(Boolean)))

  const [{ data: profiles }, { data: invoices }, { data: outcomeEvents }] = await Promise.all([
    ownerIds.length ? supabase.from('profiles').select('id, first_name, last_name, full_name, email').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
    bookingIds.length ? supabase.from('checkout_payment_invoices').select('booking_id, status, checkout_outcome, updated_at').in('booking_id', bookingIds) : Promise.resolve({ data: [] as any[] }),
    bookingIds.length ? supabase.from('booking_audit_events').select('booking_id, created_at, new_value').eq('event_type', 'checkout_outcome_recorded').in('booking_id', bookingIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
  ])

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const invoiceByBooking = new Map<string, any>()
  for (const inv of invoices ?? []) {
    const prev = invoiceByBooking.get(inv.booking_id)
    if (!prev || new Date(inv.updated_at ?? 0).getTime() > new Date(prev.updated_at ?? 0).getTime()) invoiceByBooking.set(inv.booking_id, inv)
  }
  const outcomeByBooking = new Map<string, string>()
  for (const event of outcomeEvents ?? []) {
    if (!event.booking_id) continue
    const outcome = typeof event.new_value?.outcome === 'string' ? event.new_value.outcome : null
    if (!outcome) continue
    if (!outcomeByBooking.has(event.booking_id)) outcomeByBooking.set(event.booking_id, outcome)
  }

  const rows = (bookings ?? []).map((b) => {
    const owner = profileMap.get(b.booking_owner_user_id)
    const inv = invoiceByBooking.get(b.id)
    const outcome = outcomeByBooking.get(b.id) ?? inv?.checkout_outcome ?? null
    const payment = inv?.status ? inv.status.replace(/_/g, ' ') : 'No Payment Record'
    return {
      id: b.id,
      bookingRef: b.booking_reference ?? b.id.slice(0, 8).toUpperCase(),
      customer: fullName(owner, b.pic_name),
      submitted: b.created_at,
      scheduled: b.scheduled_start,
      status: statusLabel(b.status),
      outcome: outcomeLabel(outcome),
      payment,
      updatedAt: b.updated_at,
    }
  })

  return (
    <div>
      <AdminPageHeader
        eyebrow="Checkouts"
        title="History"
        subtitle="Chronological checkout status history and related payment/outcome state."
      />
      <div className="max-w-[1450px] mx-auto px-6 md:px-10 py-12 pb-24">
        <AdminDataTable columns={['Customer', 'Submitted', 'Scheduled', 'Current Status', 'Outcome', 'Payment State', 'Last Updated', 'Action']}>
          {rows.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-[var(--admin-text-muted)]">No checkout history found.</td></tr>}
          {rows.map((r) => {
            const statusLower = r.status.toLowerCase()
            const statusTone = statusLower.includes('cancel') || statusLower.includes('no show')
              ? 'red'
              : statusLower.includes('payment')
              ? 'orange'
              : statusLower.includes('awaiting')
              ? 'amber'
              : statusLower.includes('completed')
              ? 'emerald'
              : 'slate'
            const paymentLower = r.payment.toLowerCase()
            const paymentTone = paymentLower.includes('paid')
              ? 'emerald'
              : paymentLower.includes('required')
              ? 'orange'
              : paymentLower.includes('pending')
              ? 'amber'
              : paymentLower.includes('refund') || paymentLower.includes('cancel')
              ? 'red'
              : 'slate'
            return (
              <tr key={r.id} className="border-t border-[var(--admin-divider)] hover:bg-[var(--admin-row-hover)] transition-colors">
                <td className="px-5 py-[16px]">
                  <p className="text-lg leading-tight font-semibold text-[var(--admin-text)]">{r.customer}</p>
                  <p className="text-sm text-[var(--admin-text-muted)] mt-1">{r.bookingRef}</p>
                </td>
                <td className="px-5 py-[16px] text-[14px] text-[var(--admin-text)]">{new Date(r.submitted).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                <td className="px-5 py-[16px] text-[14px] text-[var(--admin-text)]">{r.scheduled ? new Date(r.scheduled).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'}</td>
                <td className="px-5 py-[16px]"><AdminStatusBadge label={r.status} tone={statusTone} /></td>
                <td className="px-5 py-[16px]">{r.outcome === 'No outcome yet' ? <span className="text-sm text-[var(--admin-text-muted)]">{r.outcome}</span> : <AdminStatusBadge label={r.outcome} tone="slate" />}</td>
                <td className="px-5 py-[16px]"><AdminStatusBadge label={r.payment} tone={paymentTone} /></td>
                <td className="px-5 py-[16px] text-[14px] text-[var(--admin-text)]">{new Date(r.updatedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                <td className="px-5 py-[16px] text-right"><AdminRowActionButton href={`/admin/bookings/requests/${r.id}`} label="View Checkout" /></td>
              </tr>
            )
          })}
        </AdminDataTable>
      </div>
    </div>
  )
}
