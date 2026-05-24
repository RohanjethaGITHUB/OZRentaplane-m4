import { redirect } from 'next/navigation'

export default async function AircraftDetailPage({ params }: { params: { aircraftId: string } }) {
  redirect(`/admin/aircraft/${params.aircraftId}/flight-log`)
}
