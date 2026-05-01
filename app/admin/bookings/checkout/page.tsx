import AdminBookingList from '../components/AdminBookingList'

export const metadata = { title: 'Checkout Flights | Admin' }

export default function CheckoutFlightsPage({ searchParams }: { searchParams: { status?: string } }) {
  return (
    <AdminBookingList
      searchParams={searchParams}
      bookingTypeFilter="checkout"
      pageTitle="Checkout Flights"
      pageSubtitle="Review new checkout flight requests and outcomes."
      basePath="/admin/bookings/checkout"
    />
  )
}
