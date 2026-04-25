import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Settings | Admin' }

export default async function AdminSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Fetch aircraft logic just for read-only view
  const { data: fleet } = await supabase.from('aircraft').select('*').neq('status', 'inactive').limit(3)
  const aircraft = fleet?.[0]

  return (
    <>
      <AdminPortalHero
        eyebrow="Platform Configuration"
        title="System Settings"
        subtitle="Core operational parameters and platform configuration."
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 space-y-12 pb-24">

      <section className="space-y-6">
        <h3 className="text-xl font-light text-white tracking-wide">1. Aircraft Settings</h3>
        <div className="bg-white/5 border border-white/5 rounded-[1.25rem] p-8 space-y-6">
          {aircraft ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Registration</p>
                <p className="text-sm text-slate-300 font-medium">{aircraft.registration}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Aircraft Type</p>
                <p className="text-sm text-slate-300 capitalize">{aircraft.type?.replace('_', ' ') || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Fleet Status</p>
                <span className="px-2 py-0.5 rounded border border-white/10 text-[10px] font-bold uppercase tracking-wider bg-white/5 text-slate-300">
                  {aircraft.status}
                </span>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Hourly Rate</p>
                <p className="text-sm text-blue-300 font-serif">${aircraft.default_hourly_rate?.toFixed(2) ?? '0.00'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Billing Meter Type</p>
                <p className="text-sm text-slate-300 capitalize">{aircraft.billing_meter_type?.replace('_', ' ') ?? 'None'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Maintenance Meter Type</p>
                <p className="text-sm text-slate-300 capitalize">{aircraft.maintenance_meter_type?.replace('_', ' ') ?? 'None'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Pre-Flight Buffer (hrs)</p>
                <p className="text-sm text-slate-300">{aircraft.pre_flight_buffer_hours ?? 0} hrs</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Post-Flight Buffer (hrs)</p>
                <p className="text-sm text-slate-300">{aircraft.post_flight_buffer_hours ?? 0} hrs</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No active aircraft data available to display.</p>
          )}
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-xl font-light text-white tracking-wide">2. Booking Rules</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-60">
          <div className="bg-white/5 border border-white/5 rounded-2xl p-6 pointer-events-none">
            <h4 className="text-sm font-medium text-white mb-2">Admin Approval Requirement</h4>
            <p className="text-xs text-slate-500 mb-4">Dictates if flights need manual PIC checkout verification.</p>
            <div className="w-12 h-6 bg-blue-500/20 rounded-full relative border border-blue-500/50">
              <div className="w-4 h-4 bg-blue-400 rounded-full absolute top-1 right-1" />
            </div>
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-6 pointer-events-none">
            <h4 className="text-sm font-medium text-white mb-2">Cancellation Windows</h4>
            <p className="text-xs text-slate-500 mb-4">Hours required before a booking cancellation charges a penalty.</p>
            <input type="text" disabled placeholder="e.g. 24 hours" className="w-full bg-[#111316] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-slate-600" />
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-6 pointer-events-none">
            <h4 className="text-sm font-medium text-white mb-2">Maximum Booking Duration</h4>
            <input type="text" disabled placeholder="e.g. 7 days" className="w-full bg-[#111316] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-slate-600" />
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-6 pointer-events-none">
            <h4 className="text-sm font-medium text-white mb-2">Minimum Booking Duration</h4>
            <input type="text" disabled placeholder="e.g. 1 hour" className="w-full bg-[#111316] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-slate-600" />
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-xl font-light text-white tracking-wide">3. Post-Flight Requirements</h3>
        <div className="bg-white/5 border border-white/5 rounded-[1.25rem] p-8 opacity-60">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4 pointer-events-none">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Meters Enforced</h4>
              <label className="flex items-center gap-3"><input type="checkbox" disabled checked className="w-4 h-4 bg-black/50 border-white/20 rounded" /><span className="text-sm text-slate-300">Tacho Requirement</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" disabled checked className="w-4 h-4 bg-black/50 border-white/20 rounded" /><span className="text-sm text-slate-300">VDO Requirement</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" disabled checked className="w-4 h-4 bg-black/50 border-white/20 rounded" /><span className="text-sm text-slate-300">Air Switch</span></label>
            </div>
            <div className="space-y-4 pointer-events-none">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Consumables Enforced</h4>
              <label className="flex items-center gap-3"><input type="checkbox" disabled checked className="w-4 h-4 bg-black/50 border-white/20 rounded" /><span className="text-sm text-slate-300">Oil Tracking</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" disabled checked className="w-4 h-4 bg-black/50 border-white/20 rounded" /><span className="text-sm text-slate-300">Fuel Actual</span></label>
            </div>
            <div className="space-y-4 pointer-events-none">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Data & Compliance</h4>
              <label className="flex items-center gap-3"><input type="checkbox" disabled checked className="w-4 h-4 bg-black/50 border-white/20 rounded" /><span className="text-sm text-slate-300">Total Landings</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" disabled className="w-4 h-4 bg-black/50 border-white/20 rounded" /><span className="text-sm text-slate-300">Panel Photo Evidence</span><span className="text-[10px] text-amber-500 ml-auto border border-amber-500/20 px-1 rounded">Soon</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" disabled className="w-4 h-4 bg-black/50 border-white/20 rounded" /><span className="text-sm text-slate-300">Digital Signature</span><span className="text-[10px] text-amber-500 ml-auto border border-amber-500/20 px-1 rounded">Soon</span></label>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-xl font-light text-white tracking-wide">4. Notifications & Alerts</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 opacity-60">
          {['Booking Requests', 'Post-Flight Reviews', 'Overdue Flight Logs', 'Grounded Aircraft'].map((item) => (
            <div key={item} className="bg-white/5 border border-white/5 rounded-xl p-5 flex items-center justify-between pointer-events-none">
              <span className="text-sm text-slate-300">{item}</span>
              <div className="w-8 h-4 bg-blue-500/20 rounded-full relative border border-blue-500/50">
                <div className="w-3 h-3 bg-blue-400 rounded-full absolute top-0.5 right-0.5" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6 pb-12">
        <h3 className="text-xl font-light text-white tracking-wide">5. Legal Documents</h3>
        <div className="bg-white/5 border border-white/5 rounded-2xl p-6 opacity-60 flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-2 pointer-events-none">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Terms & Conditions</h4>
            <input type="text" disabled value="v1.4 (Active)" className="w-full bg-[#111316] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-400" />
          </div>
          <div className="flex-1 space-y-2 pointer-events-none">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Risk Acknowledgement</h4>
            <input type="text" disabled value="v2.0 (Active)" className="w-full bg-[#111316] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-400" />
          </div>
          <div className="flex-1 space-y-2 pointer-events-none">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Privacy Policy</h4>
            <input type="text" disabled value="v1.0 (Active)" className="w-full bg-[#111316] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-400" />
          </div>
        </div>
      </section>

      </div>
    </>
  )
}
