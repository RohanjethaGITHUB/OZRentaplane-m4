import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
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
    <div className="p-10 max-w-4xl mx-auto">
      <Link href="/admin/bookings/calendar" className="text-blue-400 hover:text-blue-300 text-sm mb-6 inline-flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Return to Calendar
      </Link>
      
      <header className="mb-12 mt-4">
        <h2 className="font-serif text-4xl font-light text-[#e2e2e6] tracking-tight">Create Schedule Block</h2>
        <p className="text-slate-400 mt-2 font-light tracking-wide flex items-center gap-2">
          Reserving operational time for <span className="px-2 py-0.5 rounded bg-blue-900/30 text-blue-200 border border-blue-500/20 font-medium text-xs">{targetAircraftReg}</span>
        </p>
        <div className="h-0.5 w-10 bg-[#44474c] mt-6" />
      </header>

      <div className="bg-white/5 border border-white/5 rounded-3xl p-8">
        <CreateBlockForm aircraftId={targetAircraftId} />
      </div>
    </div>
  )
}
