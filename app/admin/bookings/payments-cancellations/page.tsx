import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { TabLink } from '@/app/admin/components/AdminUi'

export const metadata = { title: 'Payments & Cancellations | Admin' }

type Tab = 'manual-payments' | 'payment-required' | 'cancellation-requests' | 'resolved'

function getTab(v?: string): Tab {
  if (v === 'manual-payments' || v === 'payment-required' || v === 'cancellation-requests' || v === 'resolved') return v
  return 'manual-payments'
}

export default async function PaymentsAndCancellationsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const tab = getTab(searchParams.tab)

  const [
    { data: pendingTransfers },
    { data: paymentRequiredBookings },
    { data: cancellationRequests },
    { data: resolvedCancellations },
  ] = await Promise.all([
    supabase.from('checkout_bank_transfer_submissions').select('id, invoice_id, submitted_at, account_name, amount').eq('status', 'pending_review').order('submitted_at', { ascending: true }),
    supabase.from('bookings').select('id, booking_reference, pic_name, status').eq('status', 'checkout_payment_required').order('scheduled_start', { ascending: true }),
    supabase.from('booking_cancellation_requests').select('id, booking_id, customer_message, created_at, bookings ( booking_reference, pic_name, estimated_amount )').eq('status', 'pending').order('created_at', { ascending: true }),
    supabase.from('bookings').select('id, booking_reference, pic_name, status').in('status', ['cancelled', 'no_show']).order('updated_at', { ascending: false }).limit(20),
  ])

  const tabs = [
    { key: 'manual-payments', label: 'Manual Payments' },
    { key: 'payment-required', label: 'Payment Required' },
    { key: 'cancellation-requests', label: 'Cancellation Requests' },
    { key: 'resolved', label: 'Refunded / Resolved' },
  ]

  return (
    <>
      <AdminPortalHero eyebrow="Bookings" title="Payments & Cancellations" subtitle="Operational money and exception workflows in one place." />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <TabLink key={t.key} active={tab === t.key} href={`/admin/bookings/payments-cancellations?tab=${t.key}`} label={t.label} />
          ))}
        </div>

        {tab === 'manual-payments' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
            {(pendingTransfers ?? []).length === 0 && <p className="text-slate-400">No manual payments waiting for review.</p>}
            {(pendingTransfers ?? []).map((row) => (
              <Link key={row.id} href="/admin/bookings/checkout?status=checkout_payment_required" className="block rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05]">
                <p className="text-white">{row.account_name || 'Bank transfer evidence'}</p>
                <p className="text-sm text-slate-400">Amount: ${Number(row.amount ?? 0).toFixed(2)} · Submitted {new Date(row.submitted_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</p>
              </Link>
            ))}
          </div>
        )}

        {tab === 'payment-required' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
            {(paymentRequiredBookings ?? []).length === 0 && <p className="text-slate-400">No checkout bookings currently awaiting payment.</p>}
            {(paymentRequiredBookings ?? []).map((b) => (
              <Link key={b.id} href={`/admin/bookings/requests/${b.id}`} className="block rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05]">
                <p className="text-white">{b.pic_name || 'Customer'} · {b.booking_reference || b.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-sm text-amber-300">Payment Required</p>
              </Link>
            ))}
          </div>
        )}

        {tab === 'cancellation-requests' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
            {(cancellationRequests ?? []).length === 0 && <p className="text-slate-400">No pending cancellation requests.</p>}
            {(cancellationRequests ?? []).map((r) => {
              const booking = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings
              return (
                <Link key={r.id} href={`/admin/bookings/requests/${r.booking_id}`} className="block rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05]">
                  <p className="text-white">{booking?.pic_name || 'Customer'} · {booking?.booking_reference || r.booking_id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-sm text-slate-400">{r.customer_message || 'No customer note provided.'}</p>
                </Link>
              )
            })}
          </div>
        )}

        {tab === 'resolved' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
            {(resolvedCancellations ?? []).length === 0 && <p className="text-slate-400">No resolved items yet.</p>}
            {(resolvedCancellations ?? []).map((b) => (
              <Link key={b.id} href={`/admin/bookings/requests/${b.id}`} className="block rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05]">
                <p className="text-white">{b.pic_name || 'Customer'} · {b.booking_reference || b.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-sm text-slate-400 capitalize">{b.status.replace(/_/g, ' ')}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
