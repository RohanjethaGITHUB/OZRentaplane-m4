import AdminBookingList from '../components/AdminBookingList'

export const metadata = { title: 'Upcoming Flights | Admin' }

export default function UpcomingFlightsPage() {
  return (
    <AdminBookingList
      searchParams={{ status: 'confirmed' }}
      bookingTypeFilter="standard"
      pageTitle="Upcoming Flights"
      pageSubtitle="Upcoming standard flights requiring dispatch readiness."
      basePath="/admin/bookings/upcoming-flights"
      hideFilters={true}
      appearance="light-operational"
    />
  )
}
