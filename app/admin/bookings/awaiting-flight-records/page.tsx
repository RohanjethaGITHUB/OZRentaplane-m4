import AdminBookingList from '../components/AdminBookingList'

export const metadata = { title: 'Awaiting Flight Records | Admin' }

export default function AwaitingFlightRecordsPage() {
  return (
    <AdminBookingList
      searchParams={{ status: 'awaiting_flight_record' }}
      bookingTypeFilter="standard"
      pageTitle="Awaiting Flight Records"
      pageSubtitle="Flights waiting for customer-submitted records."
      basePath="/admin/bookings/awaiting-flight-records"
      hideFilters={true}
    />
  )
}
