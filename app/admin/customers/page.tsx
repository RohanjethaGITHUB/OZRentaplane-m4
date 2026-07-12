import { redirect } from 'next/navigation'

export const metadata = { title: 'Customers | Admin' }

export default function AdminCustomersOverview() {
  redirect('/admin/customers/all')
}
