import PortalPageHero from '@/components/PortalPageHero'

type Props = {
  bookingRef?: string
  aircraftReg?: string
  title?: string
  statusLabel?: string
  subtitle?: string
}

export default function PostFlightHero({
  bookingRef = 'OZ-2604-10D24337',
  aircraftReg = 'VH-KZG',
  title = 'Post-Flight Record',
  statusLabel = 'Awaiting Flight Record',
  subtitle = 'Your flight is complete. Submit your post-flight record and meter evidence for operations review.',
}: Props) {
  return (
    <PortalPageHero
      eyebrow="POST-FLIGHT RECORD"
      title={title}
      subtitle={subtitle}
      backgroundImage="/CustomerDashboard/CustomerDashboard-bookingHero.png"
      backgroundPosition="center"
      backHref="/dashboard/bookings"
      backLabel="My Bookings"
      metaCards={[
        { label: 'Booking Ref', value: bookingRef },
        { label: 'Aircraft', value: aircraftReg },
      ]}
      statusPill={{
        label: statusLabel,
        color: 'amber',
      }}
    />
  )
}
