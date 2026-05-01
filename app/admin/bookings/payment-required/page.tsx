import AdminBookingList from '../components/AdminBookingList'

export const metadata = { title: 'Payment Required | Admin' }

export default function PaymentRequiredPage({ searchParams }: { searchParams: { status?: string } }) {
  // We force the status to checkout_payment_required 
  // (Assuming there's no standard 'payment_required' status yet, only 'invoice_generated' which is handled in post-flight, but we'll include it if it exists)
  return (
    <AdminBookingList
      searchParams={{ status: 'checkout_payment_required' }}
      bookingTypeFilter="checkout"
      pageTitle="Payment Required"
      pageSubtitle="Checkout flights awaiting customer payment."
      basePath="/admin/bookings/payment-required"
      hideFilters={true}
    />
  )
}
