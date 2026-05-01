import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerCreditsManager from './CustomerCreditsManager'

export const metadata = { title: 'Customer Credits' }

export default async function CustomerCreditsPage({ searchParams }: { searchParams: { customerId?: string } }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-10 max-w-7xl mx-auto">
      <header className="mb-12">
        <h2 className="font-serif text-4xl font-light text-[#e2e2e6] tracking-tight">Customer Credits</h2>
        <p className="text-slate-400 mt-2 font-light tracking-wide">Manage advance payments, refunds, and credit balances for customers.</p>
        <div className="h-0.5 w-10 bg-[#44474c] mt-6" />
      </header>

      <CustomerCreditsManager initialCustomerId={searchParams.customerId} />
    </div>
  )
}
