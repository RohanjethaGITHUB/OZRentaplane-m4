import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { TabLink } from '@/app/admin/components/AdminUi'

type Tab = 'all' | 'payment_required' | 'manual_review' | 'pending' | 'paid' | 'refunded' | 'cancelled'

function getTab(v?: string): Tab {
  const allowed: Tab[] = ['all', 'payment_required', 'manual_review', 'pending', 'paid', 'refunded', 'cancelled']
  return allowed.includes((v ?? 'all') as Tab) ? (v as Tab) : 'all'
}

export const metadata = { title: 'Booking Payments | Admin' }

export default async function BookingPaymentsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const tab = getTab(searchParams.tab)
  const [{ data: invoices }, { data: manualSubs }] = await Promise.all([
    supabase.from('booking_invoices').select('id, booking_id, status, payment_method, subtotal_cents, stripe_amount_due_cents, total_paid_cents, created_at, updated_at, paid_at').order('updated_at', { ascending: false }),
    supabase.from('booking_bank_transfer_submissions').select('id, booking_id, status, amount, submitted_at').order('submitted_at', { ascending: false }),
  ])

  const bookingIds = Array.from(new Set([...(invoices ?? []).map((i) => i.booking_id).filter(Boolean), ...(manualSubs ?? []).map((s) => s.booking_id).filter(Boolean)]))
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

  const rows = (tab === 'manual_review'
    ? (manualSubs ?? []).filter((s) => s.status === 'pending_review').map((s) => {
        const customer = customerForBooking(s.booking_id)
        const b: any = bookingMap.get(s.booking_id)
        return {
          id: s.id,
          customer: customer.name,
          email: customer.email,
          booking_ref: b?.booking_reference ?? (s.booking_id ? s.booking_id.slice(0, 8).toUpperCase() : '—'),
          flight_date: b?.scheduled_start,
          amount_cents: Math.round((Number(s.amount) || 0) * 100),
          status: 'manual_review',
          method: 'bank_transfer',
          created: s.submitted_at,
          updated: s.submitted_at,
          href: s.booking_id ? `/admin/bookings/requests/${s.booking_id}` : '/admin/bookings/payments',
        }
      })
    : (invoices ?? [])
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

  const totalCollected = (invoices ?? []).filter((i) => i.status === 'paid').reduce((sum, i) => sum + (i.total_paid_cents ?? 0), 0)
  const outstanding = (invoices ?? []).filter((i) => ['payment_required', 'pending'].includes(i.status)).reduce((sum, i) => sum + (i.stripe_amount_due_cents ?? 0), 0)
  const manualReviewCount = (manualSubs ?? []).filter((s) => s.status === 'pending_review').length
  const refunds = (invoices ?? []).filter((i) => ['refunded', 'void'].includes(i.status)).length

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-slate-300">Total collected: <span className="text-emerald-300">${(totalCollected / 100).toFixed(2)}</span></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-slate-300">Outstanding: <span className="text-amber-300">${(outstanding / 100).toFixed(2)}</span></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-slate-300">Manual review: <span className="text-orange-300">{manualReviewCount}</span></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-slate-300">Refunded items: <span className="text-rose-300">{refunds}</span></div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-wrap gap-2">
          {tabs.map((t) => <TabLink key={t.key} active={tab === t.key} href={`/admin/bookings/payments?tab=${t.key}`} label={t.label} />)}
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <table className="w-full text-sm">
            <thead className="bg-[#111316] text-slate-400"><tr><th className="px-4 py-3 text-left">Customer</th><th className="px-4 py-3 text-left">Email</th><th className="px-4 py-3 text-left">Booking Reference</th><th className="px-4 py-3 text-left">Flight Date</th><th className="px-4 py-3 text-left">Amount</th><th className="px-4 py-3 text-left">Payment Status</th><th className="px-4 py-3 text-left">Method</th><th className="px-4 py-3 text-left">Created / Updated</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No payment records for this filter.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.03] text-slate-200">
                  <td className="px-4 py-3">{r.customer}</td>
                  <td className="px-4 py-3 text-slate-300">{r.email}</td>
                  <td className="px-4 py-3">{r.booking_ref}</td>
                  <td className="px-4 py-3">{r.flight_date ? new Date(r.flight_date).toLocaleString('en-AU') : '—'}</td>
                  <td className="px-4 py-3">${(r.amount_cents / 100).toFixed(2)}</td>
                  <td className="px-4 py-3 capitalize">{r.status.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 capitalize">{r.method.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-slate-400">{r.created ? new Date(r.created).toLocaleString('en-AU') : '—'} · {r.updated ? new Date(r.updated).toLocaleString('en-AU') : '—'}</td>
                  <td className="px-4 py-3 text-right"><Link href={r.href} className="text-blue-300 hover:text-blue-200">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
