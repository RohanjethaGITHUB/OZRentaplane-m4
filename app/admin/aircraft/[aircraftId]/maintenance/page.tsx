import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminPortalHero from '@/components/AdminPortalHero'
import { createClient } from '@/lib/supabase/server'
import { getAircraftMaintenanceInfo } from '@/app/actions/aircraft-maintenance'
import MaintenanceClient from './MaintenanceClient'

export const metadata = { title: 'Aircraft Maintenance | Admin' }

export default async function AircraftMaintenancePage({
  params,
}: {
  params: { aircraftId: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, registration, display_name, aircraft_type')
    .eq('id', params.aircraftId)
    .maybeSingle()

  if (!aircraft) redirect('/admin/aircraft')

  const info = await getAircraftMaintenanceInfo(params.aircraftId)

  return (
    <>
      <AdminPortalHero
        eyebrow="Aircraft"
        title="Maintenance"
        subtitle={`Aircraft: ${aircraft.registration} / ${aircraft.display_name || aircraft.aircraft_type || 'Aircraft'}`}
        actions={<Link href="/admin/aircraft" className="px-4 py-2 rounded-lg border border-white/10 text-slate-200 text-sm">Back to Aircraft</Link>}
      />

      <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-8 pb-24">
        <div className="flex gap-2 mb-5">
          <Link href="/admin/aircraft" className="px-3 py-2 rounded-lg border border-white/10 text-slate-300 text-sm">Aircraft Overview</Link>
          <Link href={`/admin/aircraft/${aircraft.id}/flight-log`} className="px-3 py-2 rounded-lg border border-white/10 text-slate-300 text-sm">Flight Log</Link>
          <span className="px-3 py-2 rounded-lg bg-blue-500/15 border border-blue-300/40 text-blue-200 text-sm">Maintenance</span>
        </div>

        <MaintenanceClient
          aircraftId={aircraft.id}
          aircraftRegistration={aircraft.registration}
          info={info}
        />
      </div>
    </>
  )
}
