import { redirect } from 'next/navigation'

export const metadata = { title: 'Checkout History | Admin' }

export default function CheckoutHistoryPage() {
  redirect('/admin/checkouts/all?status=completed')
}
