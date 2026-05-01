import AdminBookingList from '../components/AdminBookingList'

export const metadata = { title: 'Cancellations | Admin' }

export default function CancellationsPage({ searchParams }: { searchParams: { status?: string } }) {
  // We force the status to 'cancelled' or 'no_show'
  const activeStatus = searchParams.status === 'no_show' ? 'no_show' : 'cancelled'
  
  return (
    <AdminBookingList
      searchParams={{ status: activeStatus }}
      bookingTypeFilter="all"
      pageTitle="Cancellations & No Shows"
      pageSubtitle="Review cancelled bookings and no shows."
      basePath="/admin/bookings/cancellations"
      hideFilters={true}
    />
  )
}
