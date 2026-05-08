import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerCreditsManager from './CustomerCreditsManager'
import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Customer Ledger | Admin' }

export default async function CustomerCreditsPage({ searchParams }: { searchParams: { customerId?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <>
      <AdminPortalHero
        eyebrow="Customers"
        title="Customer Ledger"
        subtitle="Credits, payments, manual payments, and refunds."
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">
        <CustomerCreditsManager initialCustomerId={searchParams.customerId} />
      </div>
    </>
  )
}
