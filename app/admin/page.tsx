import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Admin Overview | OZRentAPlane' }

export default async function AdminMasterOverview() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Counts — standard operations
  const [
    { count: clearedForBookingCount },
    { count: standardBookingReqs },
    { count: confirmedUpcoming },
    { count: awaitingFlightRecords },
    { count: pendingPostReviews },
    { count: openSquawks },
    { count: checkoutRequests },
    { count: checkoutConfirmed },
    { count: checkoutAwaitingOutcome },
    { count: checkoutPaymentRequired },
    { count: manualPaymentPending },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('pilot_clearance_status', 'cleared_to_fly'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'pending_confirmation'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'confirmed'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'awaiting_flight_record'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'standard').eq('status', 'pending_post_flight_review'),
    supabase.from('squawks').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_requested'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_confirmed'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_completed_under_review'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_type', 'checkout').eq('status', 'checkout_payment_required'),
    // Count bank transfer submissions awaiting admin review
    supabase.from('checkout_bank_transfer_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
  ])

  // Fetch KZG status
  const { data: fleet } = await supabase.from('aircraft').select('registration, status').eq('registration', 'VH-KZG').single()

  // A. Action Required
  const actionRequired = [
    { label: 'New Checkout Requests', count: checkoutRequests || 0,        href: '/admin/bookings/checkout?status=checkout_requested',            color: 'text-blue-400',   icon: 'how_to_reg' },
    { label: 'Manual Payment Verification', count: manualPaymentPending || 0, href: '/admin/bookings/checkout?status=checkout_payment_required',  color: 'text-amber-400',  icon: 'account_balance' },
    { label: 'Checkout Outcomes Needed', count: checkoutAwaitingOutcome || 0, href: '/admin/bookings/checkout?status=checkout_completed_under_review', color: 'text-amber-400',  icon: 'rate_review' },
    { label: 'New Booking Requests',  count: standardBookingReqs || 0,     href: '/admin/bookings/flights?status=pending_confirmation',           color: 'text-blue-400',   icon: 'fact_check' },
    { label: 'Post-Flight Reviews',   count: pendingPostReviews || 0,      href: '/admin/bookings/post-flight',                                   color: 'text-purple-400', icon: 'assignment_turned_in' },
  ].filter(a => a.count > 0)

  // B. Today / Upcoming
  const todayUpcoming = [
    { label: 'Confirmed Checkout Flights', count: checkoutConfirmed || 0, href: '/admin/bookings/checkout?status=checkout_confirmed', color: 'text-green-400', icon: 'event_available' },
    { label: 'Confirmed Upcoming Aircraft Bookings', count: confirmedUpcoming || 0, href: '/admin/bookings/flights', color: 'text-green-400', icon: 'event_available' },
  ]

  // C. Waiting on Customer
  const waitingOnCustomer = [
    { label: 'Checkout Payment Required', count: Math.max(0, (checkoutPaymentRequired || 0) - (manualPaymentPending || 0)), href: '/admin/bookings/payment-required', color: 'text-orange-400', icon: 'receipt_long' },
    { label: 'Flight Records Pending', count: awaitingFlightRecords || 0, href: '/admin/bookings/flights', color: 'text-slate-400', icon: 'assignment' },
  ]

  return (
    <>
      <AdminPortalHero
        eyebrow="Operations Command Center"
        title="Admin Overview"
        subtitle="Focused on items requiring your immediate attention."
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-12">

        {/* A. Action Required */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> Action Required
          </h3>
          {actionRequired.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {actionRequired.map(a => (
                <Link key={a.label} href={a.href} className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/30 rounded-xl p-5 transition-colors flex flex-col justify-between min-h-[120px] group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-[40px] pointer-events-none rounded-full" />
                  <div className="flex justify-between items-start relative z-10">
                    <span className={`material-symbols-outlined text-[24px] ${a.color}`} style={{ fontVariationSettings: "'wght' 300" }}>{a.icon}</span>
                    <span className="material-symbols-outlined text-sm text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
                  </div>
                  <div className="relative z-10 mt-4">
                    <div className={`text-3xl font-light font-serif ${a.color} mb-1`}>{a.count}</div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-tight">{a.label}</div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-[#1e2023]/60 border border-white/5 rounded-[1.25rem] p-10 text-center flex flex-col items-center">
              <span className="material-symbols-outlined text-4xl text-slate-600 mb-4" style={{ fontVariationSettings: "'wght' 200" }}>check_circle</span>
              <p className="text-sm text-slate-400">No urgent admin actions right now.</p>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* B. Today / Upcoming */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px] text-blue-400/60" style={{ fontVariationSettings: "'wght' 300" }}>calendar_today</span>
              Today / Upcoming
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {todayUpcoming.map(card => (
                <Link
                  key={card.label}
                  href={card.href}
                  className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-5 group hover:bg-[#282a2d] transition-colors flex flex-col justify-between min-h-[110px]"
                >
                  <div className="flex justify-between items-start mb-4">
                    <span className="material-symbols-outlined text-xl text-slate-600 group-hover:text-slate-500 transition-colors" style={{ fontVariationSettings: "'wght' 300" }}>{card.icon}</span>
                    <span className="material-symbols-outlined text-sm text-slate-700 group-hover:text-slate-500 transition-colors">arrow_forward</span>
                  </div>
                  <div>
                    <div className={`text-2xl font-light font-serif ${card.count > 0 ? card.color : 'text-slate-500'}`}>{card.count}</div>
                    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-1 leading-tight">{card.label}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* C. Waiting on Customer */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px] text-slate-400" style={{ fontVariationSettings: "'wght' 300" }}>hourglass_empty</span>
              Waiting on Customer
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {waitingOnCustomer.map(card => (
                <Link
                  key={card.label}
                  href={card.href}
                  className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-5 group hover:bg-[#282a2d] transition-colors flex flex-col justify-between min-h-[110px]"
                >
                  <div className="flex justify-between items-start mb-4">
                    <span className="material-symbols-outlined text-xl text-slate-600 group-hover:text-slate-500 transition-colors" style={{ fontVariationSettings: "'wght' 300" }}>{card.icon}</span>
                    <span className="material-symbols-outlined text-sm text-slate-700 group-hover:text-slate-500 transition-colors">arrow_forward</span>
                  </div>
                  <div>
                    <div className={`text-2xl font-light font-serif ${card.count > 0 ? card.color : 'text-slate-500'}`}>{card.count}</div>
                    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-1 leading-tight">{card.label}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* D. Aircraft Status */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px] text-slate-400" style={{ fontVariationSettings: "'wght' 300" }}>airlines</span>
            Aircraft Status
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* KZG Status */}
            <Link href="/admin/aircraft" className="bg-[#1e2023]/60 border border-white/5 rounded-xl p-4 flex items-center gap-4 hover:bg-[#282a2d] transition-colors">
              <span className="material-symbols-outlined text-slate-500" style={{ fontVariationSettings: "'wght' 300" }}>flight_takeoff</span>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-0.5">{fleet?.registration || 'VH-KZG'}</div>
                <div className={`text-sm ${fleet?.status === 'active' ? 'text-green-400' : 'text-slate-400'} capitalize`}>
                  {fleet?.status || 'Unknown'}
                </div>
              </div>
            </Link>

            {/* Squawks */}
            <div className="bg-[#1e2023]/60 border border-white/5 rounded-xl p-4 flex items-center gap-4">
              <span className="material-symbols-outlined text-slate-500" style={{ fontVariationSettings: "'wght' 300" }}>build_circle</span>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-0.5">Open Squawks</div>
                <div className={`text-sm ${openSquawks && openSquawks > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                  {openSquawks || 0} issues
                </div>
              </div>
            </div>

            {/* Cleared Customers */}
            <Link href="/admin/customers" className="bg-[#1e2023]/60 border border-white/5 rounded-xl p-4 flex items-center gap-4 hover:bg-[#282a2d] transition-colors">
              <span className="material-symbols-outlined text-slate-500" style={{ fontVariationSettings: "'wght' 300" }}>verified</span>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-0.5">Cleared Customers</div>
                <div className="text-sm text-green-400">
                  {clearedForBookingCount || 0} pilots
                </div>
              </div>
            </Link>
          </div>
        </section>

      </div>
    </>
  )
}
