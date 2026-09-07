import { redirect } from 'next/navigation'
import { createClient, getCachedProfile, getCachedUser } from '@/lib/supabase/server'
import { AdminPageHeader } from '@/app/admin/components/AdminUi'
import { getAdminInstructorsDirectory } from '@/app/actions/instructor'
import InstructorsDirectoryTable from './InstructorsDirectoryTable'

export const metadata = { title: 'Instructors Directory | Admin' }

export default async function AdminInstructorsPage() {
  const supabase = await createClient()

  const { data: { user } } = await getCachedUser()
  if (!user) redirect('/login')

  const { data: profile } = await getCachedProfile(user.id, 'admin')
  if (profile?.role !== 'admin') redirect('/dashboard')

  const instructors = await getAdminInstructorsDirectory()

  return (
    <div className="space-y-6 pb-12 max-w-[1400px] mx-auto">
      <AdminPageHeader
        eyebrow="Customers"
        title="Instructors Directory"
        subtitle="Manage approved instructors, aircraft-specific clearances, standardization checkouts, and student assignments."
      />

      <InstructorsDirectoryTable instructors={instructors} />
    </div>
  )
}
