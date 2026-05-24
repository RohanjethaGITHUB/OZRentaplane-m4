import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AircraftFlightLogEntryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id')
    .neq('status', 'inactive')
    .order('registration', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!aircraft?.id) redirect('/admin/aircraft')
  redirect(`/admin/aircraft/${aircraft.id}/flight-log`)
}
