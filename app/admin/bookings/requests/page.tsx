import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PendingBookingActions from './PendingBookingActions'
import { formatDateTime } from '@/lib/formatDateTime'

export const metadata = { title: 'Booking Requests | Admin' }

export default async function AdminBookingRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Fetch pending bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      created_at,
      scheduled_start,
      scheduled_end,
      pic_name,
      pic_arn,
      estimated_hours,
      estimated_amount,
      customer_notes,
      booking_owner_user_id,
      aircraft ( id, registration, type )
    `)
    .eq('status', 'pending_confirmation')
    .order('created_at', { ascending: false })

  // For owner mapping if possible
  const authorIds = bookings?.map(b => b.booking_owner_user_id) || []
  let profilesData: any[] = []
  
  if (authorIds.length > 0) {
    const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', authorIds)
    if (data) profilesData = data
  }

  const getProfile = (id: string) => profilesData.find(p => p.id === id)

  return (
    <div className="p-10 max-w-7xl mx-auto">
      <header className="mb-12">
        <h2 className="font-serif text-4xl font-light text-[#e2e2e6] tracking-tight">Booking Requests</h2>
        <p className="text-slate-400 mt-2 font-light tracking-wide">
          Pending customer flights requiring dispatch authorization.
        </p>
        <div className="h-0.5 w-10 bg-[#44474c] mt-6" />
      </header>

      {(!bookings || bookings.length === 0) ? (
        <div className="p-12 text-center text-slate-500 border border-white/5 rounded-2xl bg-white/5">
          <span className="material-symbols-outlined text-4xl mb-3 text-slate-600 block" style={{ fontVariationSettings: "'wght' 200" }}>inbox</span>
          No pending booking requests at this time.
        </div>
      ) : (
        <div className="space-y-6">
          {bookings.map(booking => {
            const author = getProfile(booking.booking_owner_user_id)
            const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
            const startStr     = formatDateTime(booking.scheduled_start)
            const endStr       = formatDateTime(booking.scheduled_end)
            const submittedStr = formatDateTime(booking.created_at)

            return (
              <div key={booking.id} className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden flex flex-col md:flex-row">
                
                {/* Details Section */}
                <div className="p-6 md:w-3/4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium text-white flex items-center gap-3">
                          {aircraft?.registration || 'Unknown Aircraft'}
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            Pending Conf
                          </span>
                        </h3>
                        <p className="text-sm text-slate-400 mt-1 tabular-nums">{startStr} &mdash; {endStr}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-serif text-blue-200">${booking.estimated_amount?.toFixed(2)}</div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Est {booking.estimated_hours?.toFixed(1)} hrs</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-6">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Customer / Owner</p>
                        <p className="text-sm font-medium text-slate-300">{author?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-500">{author?.email || booking.booking_owner_user_id}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Pilot in Command</p>
                        <p className="text-sm text-slate-300">{booking.pic_name || '—'}</p>
                        {booking.pic_arn && <p className="text-xs text-slate-500">ARN: {booking.pic_arn}</p>}
                      </div>
                    </div>

                    {booking.customer_notes && (
                      <div className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-2">Customer Notes</p>
                        <p className="text-sm text-slate-300 leading-relaxed italic">&quot;{booking.customer_notes}&quot;</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
                    <span>Submitted: {submittedStr}</span>
                    <span className="font-mono">{booking.id}</span>
                  </div>
                </div>

                {/* Actions Section */}
                <div className="bg-[#0a0b0d] p-6 md:w-1/4 border-l border-white/5 flex items-center justify-center">
                  <PendingBookingActions bookingId={booking.id} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
