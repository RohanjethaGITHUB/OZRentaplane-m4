import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import NewCustomerForm from './NewCustomerForm'

export const metadata = { title: 'New Customer | Admin' }

export default async function NewCustomerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <>
      <AdminPortalHero
        eyebrow="Customers"
        title="Create Customer Account"
        subtitle="Create a customer account and send secure first-login credentials by email."
        actions={
          <Link
            href="/admin/customers"
            className="inline-flex items-center rounded-lg border border-[#152d5a]/20 bg-white px-3.5 py-2 text-sm font-medium text-[#152d5a] transition-colors hover:border-[#152d5a]/40"
          >
            Back to customers
          </Link>
        }
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">
        <section className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel-bg)] p-6 md:p-8 shadow-[var(--admin-shadow-panel)]">
          <h2 className="text-2xl font-semibold text-[var(--admin-text)]">Account details</h2>
          <p className="mt-2 text-sm text-[var(--admin-text-muted)]">The customer will receive a welcome email with a temporary password.</p>
          <div className="mt-6">
            <NewCustomerForm />
          </div>
        </section>
      </div>
    </>
  )
}
