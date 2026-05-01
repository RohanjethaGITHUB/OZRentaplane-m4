import { redirect } from 'next/navigation'

export default function LegacyAllCustomersRedirect() {
  redirect('/admin/customers/all')
}
