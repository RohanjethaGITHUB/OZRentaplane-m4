import AdminBookingList from '../components/AdminBookingList'

export const metadata = { title: 'Flight Bookings | Admin' }

export default function FlightBookingsPage({ searchParams }: { searchParams: { status?: string } }) {
  return (
    <AdminBookingList
      searchParams={searchParams}
      bookingTypeFilter="standard"
      pageTitle="Flight Bookings"
      pageSubtitle="Manage standard aircraft hire bookings."
      basePath="/admin/bookings/flights"
    />
  )
}
