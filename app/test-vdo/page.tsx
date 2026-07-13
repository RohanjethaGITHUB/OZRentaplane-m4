import AdminStandardBillingPanel from '../admin/bookings/requests/[id]/AdminStandardBillingPanel'

export default function TestPage() {
  const commonProps = {
    bookingId: 'test-1',
    airports: [],
    customerCreditCents: 0,
    startSuggestions: null,
    bookingSlotHours: 48, // 2 days -> minimum 8 hours
    defaultHourlyRate: 300,
  }

  // A customer submitted flight record often has nulls for unused meters
  const case1Props = {
    ...commonProps,
    initialFlightRecord: {
      vdo_start: 100,
      vdo_stop: 102,
      vdo_total: 2.0,
      tacho_start: null,
      tacho_stop: null,
      tacho_total: null,
      air_switch_start: null,
      air_switch_stop: null,
      air_switch_total: null,
      mr_start: null,
      mr_stop: null,
      mr_total: null,
      landings: 1,
    }
  }

  const case2Props = {
    ...commonProps,
    initialFlightRecord: {
      vdo_start: 100,
      vdo_stop: 109,
      vdo_total: 9.0,
      tacho_start: null,
      tacho_stop: null,
      tacho_total: null,
      air_switch_start: null,
      air_switch_stop: null,
      air_switch_total: null,
      mr_start: null,
      mr_stop: null,
      mr_total: null,
      landings: 1,
    }
  }

  return (
    <div>
      <h1>Case 1: Below minimum</h1>
      <AdminStandardBillingPanel {...case1Props as any} />
      <h1>Case 2: At or above minimum</h1>
      <AdminStandardBillingPanel {...case2Props as any} />
    </div>
  )
}
