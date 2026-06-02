import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminPortalHero from '@/components/AdminPortalHero'
import { createClient } from '@/lib/supabase/server'
import {
  getAircraftFlightLogs,
  getFlightLogCreateContext,
} from '@/app/actions/aircraft-flight-log'
import FlightLogClient from './FlightLogClient'

export const metadata = { title: 'Aircraft Flight Log | Admin' }

export default async function AircraftFlightLogPage({ params }: { params: { aircraftId: string } }) {
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

  const [logs, createContext] = await Promise.all([
    getAircraftFlightLogs(params.aircraftId),
    getFlightLogCreateContext(params.aircraftId),
  ])

  return (
    <>
      <AdminPortalHero
        eyebrow="Aircraft"
        title="Flight Log"
        subtitle={`${aircraft.registration} · ${aircraft.display_name || aircraft.aircraft_type || 'Aircraft'}`}
        actions={<Link href="/admin/aircraft" className="px-4 py-2 rounded-lg border border-[rgba(12,35,64,0.15)] bg-white text-sm text-[#0C2340] hover:bg-[#f6f9fc]">Back to Aircraft</Link>}
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-8 pb-24">
        <div className="flex gap-2 mb-6">
          <Link
            href="/admin/aircraft"
            className="px-3 py-2 rounded-lg border border-[rgba(12,35,64,0.15)] bg-white text-[#3d5a80] text-sm hover:bg-[#f6f9fc] hover:text-[#0C2340] transition-colors"
          >
            Aircraft Overview
          </Link>
          <Link
            href={`/admin/aircraft/${aircraft.id}/maintenance`}
            className="px-3 py-2 rounded-lg border border-[rgba(12,35,64,0.15)] bg-white text-[#3d5a80] text-sm hover:bg-[#f6f9fc] hover:text-[#0C2340] transition-colors"
          >
            Maintenance
          </Link>
          <span className="relative px-3 py-2 rounded-lg border border-[rgba(12,35,64,0.3)] bg-white text-[#0C2340] text-sm font-medium shadow-sm">
            Flight Log
            <span className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full bg-[#1a4a7a]" />
          </span>
        </div>

        <FlightLogClient
          aircraftId={aircraft.id}
          aircraft={{
            registration: aircraft.registration,
            displayName: aircraft.display_name || aircraft.aircraft_type || 'Aircraft',
          }}
          initialLogs={logs}
          createContext={createContext}
        />
      </div>
    </>
  )
}
