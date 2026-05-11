import AdminBookingList from '../components/AdminBookingList'

export const metadata = { title: 'Booking History | Admin' }

export default function BookingHistoryPage() {
  return (
    <AdminBookingList
      searchParams={{ status: 'completed' }}
      bookingTypeFilter="standard"
      pageTitle="Booking History"
      pageSubtitle="Completed standard flight bookings."
      basePath="/admin/bookings/history"
      hideFilters={true}
    />
  )
}
