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
        <h3 className="text-xl font-semibold text-[#0C2340] tracking-tight">1. Aircraft Settings</h3>
        <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-[1.25rem] p-8 space-y-6">
          {aircraft ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80] mb-1">Registration</p>
                <p className="text-sm text-[#0C2340] font-medium">{aircraft.registration}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80] mb-1">Aircraft Type</p>
                <p className="text-sm text-[#0C2340] capitalize">{aircraft.type?.replace('_', ' ') || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80] mb-1">Fleet Status</p>
                <span className="px-2 py-0.5 rounded border border-[rgba(12,35,64,0.15)] text-[10px] font-bold uppercase tracking-wider bg-[#f6f9fc] text-[#0C2340]">
                  {aircraft.status}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80] mb-1">Hourly Rate</p>
                <p className="text-sm text-[#0C2340] font-medium">${aircraft.default_hourly_rate?.toFixed(2) ?? '0.00'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80] mb-1">Billing Meter Type</p>
                <p className="text-sm text-[#0C2340] capitalize">{aircraft.billing_meter_type?.replace('_', ' ') ?? 'None'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80] mb-1">Maintenance Meter Type</p>
                <p className="text-sm text-[#0C2340] capitalize">{aircraft.maintenance_meter_type?.replace('_', ' ') ?? 'None'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80] mb-1">Pre-Flight Buffer (hrs)</p>
                <p className="text-sm text-[#0C2340]">{aircraft.pre_flight_buffer_hours ?? 0} hrs</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80] mb-1">Post-Flight Buffer (hrs)</p>
                <p className="text-sm text-[#0C2340]">{aircraft.post_flight_buffer_hours ?? 0} hrs</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#3d5a80]">No active aircraft data available to display.</p>
          )}
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-xl font-semibold text-[#0C2340] tracking-tight">2. Booking Rules</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-2xl p-6 pointer-events-none">
            <h4 className="text-sm font-semibold text-[#0C2340] mb-2">Admin Approval Requirement</h4>
            <p className="text-xs text-[#3d5a80] mb-4">Dictates if flights need manual PIC checkout verification.</p>
            <div className="w-12 h-6 bg-[#dbe8f5] rounded-full relative border border-[rgba(12,35,64,0.18)]">
              <div className="w-4 h-4 bg-[#1a4a7a] rounded-full absolute top-1 right-1" />
            </div>
          </div>
          <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-2xl p-6 pointer-events-none">
            <h4 className="text-sm font-semibold text-[#0C2340] mb-2">Cancellation Windows</h4>
            <p className="text-xs text-[#3d5a80] mb-4">Hours required before a booking cancellation charges a penalty.</p>
            <input type="text" disabled placeholder="e.g. 24 hours" className="w-full bg-white border border-[rgba(12,35,64,0.2)] rounded-lg px-3 py-2 text-sm text-[#0C2340] placeholder:text-[#3d5a80]" />
          </div>
          <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-2xl p-6 pointer-events-none">
            <h4 className="text-sm font-semibold text-[#0C2340] mb-2">Maximum Booking Duration</h4>
            <input type="text" disabled placeholder="e.g. 7 days" className="w-full bg-white border border-[rgba(12,35,64,0.2)] rounded-lg px-3 py-2 text-sm text-[#0C2340] placeholder:text-[#3d5a80]" />
          </div>
          <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-2xl p-6 pointer-events-none">
            <h4 className="text-sm font-semibold text-[#0C2340] mb-2">Minimum Booking Duration</h4>
            <input type="text" disabled placeholder="e.g. 1 hour" className="w-full bg-white border border-[rgba(12,35,64,0.2)] rounded-lg px-3 py-2 text-sm text-[#0C2340] placeholder:text-[#3d5a80]" />
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-xl font-semibold text-[#0C2340] tracking-tight">3. Post-Flight Requirements</h3>
        <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-[1.25rem] p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4 pointer-events-none">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80]">Meters Enforced</h4>
              <label className="flex items-center gap-3"><input type="checkbox" disabled checked className="w-4 h-4 accent-[#1a4a7a]" /><span className="text-sm text-[#0C2340]">Tacho Requirement</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" disabled checked className="w-4 h-4 accent-[#1a4a7a]" /><span className="text-sm text-[#0C2340]">VDO Requirement</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" disabled checked className="w-4 h-4 accent-[#1a4a7a]" /><span className="text-sm text-[#0C2340]">Air Switch</span></label>
            </div>
            <div className="space-y-4 pointer-events-none">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80]">Consumables Enforced</h4>
              <label className="flex items-center gap-3"><input type="checkbox" disabled checked className="w-4 h-4 accent-[#1a4a7a]" /><span className="text-sm text-[#0C2340]">Oil Tracking</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" disabled checked className="w-4 h-4 accent-[#1a4a7a]" /><span className="text-sm text-[#0C2340]">Fuel Total</span></label>
            </div>
            <div className="space-y-4 pointer-events-none">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80]">Data & Compliance</h4>
              <label className="flex items-center gap-3"><input type="checkbox" disabled checked className="w-4 h-4 accent-[#1a4a7a]" /><span className="text-sm text-[#0C2340]">Total Landings</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" disabled className="w-4 h-4 accent-[#1a4a7a]" /><span className="text-sm text-[#0C2340]">Panel Photo Evidence</span><span className="text-[10px] text-amber-700 ml-auto border border-amber-300/30 px-1 rounded bg-amber-50">Soon</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" disabled className="w-4 h-4 accent-[#1a4a7a]" /><span className="text-sm text-[#0C2340]">Digital Signature</span><span className="text-[10px] text-amber-700 ml-auto border border-amber-300/30 px-1 rounded bg-amber-50">Soon</span></label>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-xl font-semibold text-[#0C2340] tracking-tight">4. Notifications & Alerts</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {['Booking Requests', 'Post-Flight Reviews', 'Overdue Flight Logs', 'Grounded Aircraft'].map((item) => (
            <div key={item} className="bg-white border border-[rgba(12,35,64,0.15)] rounded-xl p-5 flex items-center justify-between pointer-events-none">
              <span className="text-sm text-[#0C2340]">{item}</span>
              <div className="w-8 h-4 bg-[#dbe8f5] rounded-full relative border border-[rgba(12,35,64,0.18)]">
                <div className="w-3 h-3 bg-[#1a4a7a] rounded-full absolute top-0.5 right-0.5" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6 pb-12">
        <h3 className="text-xl font-semibold text-[#0C2340] tracking-tight">5. Legal Documents</h3>
        <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-2xl p-6 flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-2 pointer-events-none">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80]">Terms & Conditions</h4>
            <input type="text" disabled value="v1.4 (Active)" className="w-full bg-white border border-[rgba(12,35,64,0.2)] rounded-lg px-3 py-2 text-sm text-[#0C2340]" />
          </div>
          <div className="flex-1 space-y-2 pointer-events-none">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80]">Risk Acknowledgement</h4>
            <input type="text" disabled value="v2.0 (Active)" className="w-full bg-white border border-[rgba(12,35,64,0.2)] rounded-lg px-3 py-2 text-sm text-[#0C2340]" />
          </div>
          <div className="flex-1 space-y-2 pointer-events-none">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80]">Privacy Policy</h4>
            <input type="text" disabled value="v1.0 (Active)" className="w-full bg-white border border-[rgba(12,35,64,0.2)] rounded-lg px-3 py-2 text-sm text-[#0C2340]" />
          </div>
        </div>
      </section>

      </div>
    </>
  )
}
