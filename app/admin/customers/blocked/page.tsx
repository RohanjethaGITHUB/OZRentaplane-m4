import { redirect } from 'next/navigation'

export const metadata = { title: 'Blocked Customers | Admin' }

export default function BlockedCustomersPage() {
  redirect('/admin/customers/all?status=blocked')
}
