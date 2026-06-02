import AdminBookingList from '../components/AdminBookingList'

export const metadata = { title: 'On Hold Bookings | Admin' }

export default function OnHoldBookingsPage() {
  return (
    <AdminBookingList
      searchParams={{ status: 'on_hold_pending_documents' }}
      bookingTypeFilter="standard"
      pageTitle="On Hold"
      pageSubtitle="Bookings waiting on document approval."
      basePath="/admin/bookings/on-hold"
      hideFilters={true}
    />
  )
}
