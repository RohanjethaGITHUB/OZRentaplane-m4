import AdminPortalHero from '@/components/AdminPortalHero'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProxyBookingForm from './ProxyBookingForm'

type CustomerRow = {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  pilot_clearance_status: string | null
  terms_accepted_at: string | null
}

type AircraftRow = {
  id: string
  registration: string
  display_name: string
  aircraft_type: string
}

function formatCustomerName(customer: CustomerRow): string {
  if (customer.full_name?.trim()) return customer.full_name.trim()
  const parts = [customer.first_name?.trim(), customer.last_name?.trim()].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : 'Unknown Customer'
}

export default async function CreateProxyBookingPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const [{ data: customer }, { data: aircraftRows }, { data: documents }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, first_name, last_name, pilot_clearance_status, terms_accepted_at')
      .eq('id', params.id)
      .eq('role', 'customer')
      .single(),
    supabase
      .from('aircraft')
      .select('id, registration, display_name, aircraft_type')
      .neq('status', 'inactive')
      .order('registration', { ascending: true }),
    supabase
      .from('user_documents')
      .select('id')
      .eq('user_id', params.id)
      .order('uploaded_at', { ascending: false }),
  ])

  if (!customer) notFound()

  const customerName = formatCustomerName(customer as CustomerRow)
  const aircraft = (aircraftRows ?? []) as AircraftRow[]
  const customerDocuments = (documents ?? []) as Array<{ id: string }>

  return (
    <>
      <AdminPortalHero
        eyebrow="Customers"
        title="Create Booking"
        subtitle={`Booking for ${customerName}`}
        breadcrumbs={{
          parentLabel: 'Customers',
          parentHref: '/admin/customers/all',
          currentLabel: 'Create Booking',
        }}
      />

      <div className="mx-auto max-w-5xl px-10 py-10 pb-20">
        <ProxyBookingForm
          customer={customer as CustomerRow}
          aircraft={aircraft}
          documents={customerDocuments}
          termsAcceptedAt={customer.terms_accepted_at}
        />
      </div>
    </>
  )
}
