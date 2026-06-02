import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import CreateBlockForm from './CreateBlockForm'

export const metadata = { title: 'Create Hold Block | Admin' }

export default async function AdminCreateBlockPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Attempt to load VH-KZG specifically, fallback to first active aircraft
  let targetAircraftId = ''
  let targetAircraftReg = ''
  
  const { data: kzg } = await supabase.from('aircraft').select('id, registration').eq('registration', 'VH-KZG').single()
  if (kzg) {
    targetAircraftId = kzg.id
    targetAircraftReg = kzg.registration
  } else {
    const { data: first } = await supabase.from('aircraft').select('id, registration').neq('status', 'inactive').limit(1).single()
    if (first) {
      targetAircraftId = first.id
      targetAircraftReg = first.registration
    }
  }

  if (!targetAircraftId) {
    return <div className="p-10 text-white">No active aircraft found in the database.</div>
  }

  return (
    <div>
      <Link href="/admin/calendar" className="text-blue-400 hover:text-blue-300 text-sm mb-6 inline-flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Return to Calendar
      </Link>
      
      <AdminPortalHero
        eyebrow="Bookings"
        title="Create Schedule Block"
        subtitle={`Reserving operational time for ${targetAircraftReg}.`}
      />

      <div className="max-w-[1450px] mx-auto px-6 md:px-10 py-10 pb-24">
        <div className="bg-white/5 border border-white/5 rounded-3xl p-8">
          <CreateBlockForm aircraftId={targetAircraftId} />
        </div>
      </div>
    </div>
  )
}
