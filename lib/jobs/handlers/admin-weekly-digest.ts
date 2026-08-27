import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobDefinition, JobContext } from '../types'
import { getSydneyWeeklyDigestRange } from '../sydney-time'
import {
  adminWeeklyOperationsDigestEmail,
  type WeeklyDigestFlightItem,
  type WeeklyDigestCustomerItem,
} from '@/lib/email/templates/admin-digest'
import { evaluateCustomerOnboardingState } from '@/lib/jobs/onboarding-state'
import { enqueueAdminWeeklyDigestEmail } from '@/lib/email/outbox'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const SYDNEY_TZ = 'Australia/Sydney'

function formatSydneyDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: SYDNEY_TZ,
      day: 'numeric',
      month: 'short',
    }).format(new Date(dateStr))
  } catch {
    return ''
  }
}

function formatSydneyDateFull(dateStr: string | null | undefined): string {
  if (!dateStr) return 'TBD'
  try {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: SYDNEY_TZ,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(dateStr))
  } catch {
    return 'TBD'
  }
}

function formatSydneyTimeRange(startStr: string | null | undefined, endStr: string | null | undefined): string {
  if (!startStr) return ''
  try {
    const start = new Intl.DateTimeFormat('en-AU', {
      timeZone: SYDNEY_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(startStr))

    if (!endStr) return start

    const end = new Intl.DateTimeFormat('en-AU', {
      timeZone: SYDNEY_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(endStr))

    return `${start} – ${end}`
  } catch {
    return ''
  }
}

function formatBookingStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown'
  const map: Record<string, string> = {
    confirmed: 'Confirmed',
    checkout_confirmed: 'Confirmed',
    pending: 'Pending Review',
    pending_confirmation: 'Pending Confirmation',
    checkout_requested: 'Checkout Requested',
    completed: 'Completed',
    dispatched: 'Dispatched',
    awaiting_flight_record: 'Awaiting Flight Record',
    flight_record_overdue: 'Record Overdue',
    pending_post_flight_review: 'Post-Flight Review',
    payment_pending: 'Payment Pending',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
  }
  return map[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

function formatOnboardingStatus(stateKey: string): string {
  const map: Record<string, string> = {
    no_documents: 'No Documents',
    incomplete_documents: 'Incomplete Documents',
    ready_for_checkout: 'Ready for Checkout',
    checkout_waiting_admin: 'Checkout Review Pending',
    checkout_flight_booked: 'Checkout Booked',
    cleared_to_fly: 'Cleared to Fly',
    action_required: 'Action Required',
    account_blocked: 'Account Blocked',
  }
  return map[stateKey] || stateKey.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

/**
 * Builds a concise lifecycle timeline for a customer:
 * e.g., "Registered 14 Aug -> Docs uploaded 15 Aug -> Checkout requested 16 Aug -> Cleared 18 Aug"
 */
function buildCustomerTimeline(customer: any): string {
  const steps: string[] = []

  // 1. Registered
  if (customer.created_at) {
    steps.push(`Registered ${formatSydneyDateShort(customer.created_at)}`)
  }

  // 2. Documents
  const docs = (customer.user_documents ?? []) as Array<{
    document_type: string
    status: string
    created_at: string
    updated_at?: string
  }>

  if (docs.length > 0) {
    const validDocs = docs.filter((d) => d.status === 'approved' || d.status === 'uploaded')
    const earliestUpload = docs
      .map((d) => d.created_at)
      .filter(Boolean)
      .sort()[0]

    if (validDocs.length >= 3) {
      const latestUpload = validDocs
        .map((d) => d.created_at)
        .filter(Boolean)
        .sort()
        .reverse()[0]
      steps.push(`Docs complete ${formatSydneyDateShort(latestUpload || earliestUpload)}`)
    } else if (earliestUpload) {
      steps.push(`Docs uploaded (${validDocs.length}/3) ${formatSydneyDateShort(earliestUpload)}`)
    }
  } else {
    steps.push('Docs pending')
  }

  // 3. Checkout Booking
  const bookings = (customer.bookings ?? []) as Array<{
    booking_type: string
    status: string
    scheduled_start: string | null
    created_at: string
  }>

  const checkoutBooking = bookings.find((b) => b.booking_type === 'checkout' && b.status !== 'cancelled')
  if (checkoutBooking) {
    if (checkoutBooking.status === 'confirmed' || checkoutBooking.status === 'checkout_confirmed') {
      steps.push(`Checkout booked ${formatSydneyDateShort(checkoutBooking.scheduled_start || checkoutBooking.created_at)}`)
    } else {
      steps.push(`Checkout requested ${formatSydneyDateShort(checkoutBooking.created_at)}`)
    }
  }

  // 4. Cleared to Fly
  if (customer.pilot_clearance_status === 'cleared_to_fly') {
    steps.push(`Cleared ${formatSydneyDateShort(customer.updated_at || customer.created_at)}`)
  }

  return steps.join(' → ')
}

export async function runAdminWeeklyDigestSweep(admin: SupabaseClient, now: Date) {
  const range = getSydneyWeeklyDigestRange(now)
  console.info(`[admin-weekly-digest] Running digest for window ${range.label} (${range.startUtc} to ${range.endUtc})`)

  // 1. Query Flights in reporting window (scheduled in range)
  const { data: bookingsData, error: bookingsError } = await admin
    .from('bookings')
    .select(`
      id,
      booking_reference,
      booking_type,
      status,
      scheduled_start,
      scheduled_end,
      created_at,
      booking_owner_user_id,
      aircraft_id
    `)
    .gte('scheduled_start', range.startUtc)
    .lte('scheduled_start', range.endUtc)
    .order('scheduled_start', { ascending: true })

  if (bookingsError) {
    console.error('[admin-weekly-digest] Bookings query failed:', bookingsError.message)
  }

  const rawBookings = bookingsData ?? []
  const ownerUserIds = Array.from(new Set(rawBookings.map((b: any) => b.booking_owner_user_id).filter(Boolean)))
  const aircraftIds = Array.from(new Set(rawBookings.map((b: any) => b.aircraft_id).filter(Boolean)))

  const [{ data: bookingProfiles }, { data: bookingAircraft }] = await Promise.all([
    ownerUserIds.length > 0
      ? admin.from('profiles').select('id, email, first_name, full_name').in('id', ownerUserIds)
      : Promise.resolve({ data: [] }),
    aircraftIds.length > 0
      ? admin.from('aircraft').select('id, registration, model').in('id', aircraftIds)
      : Promise.resolve({ data: [] }),
  ])

  const profilesMap = new Map((bookingProfiles ?? []).map((p: any) => [p.id, p]))
  const aircraftMap = new Map((bookingAircraft ?? []).map((a: any) => [a.id, a]))

  const totalFlights = rawBookings.length
  let checkoutFlightsCount = 0
  let rentalFlightsCount = 0

  const flights: WeeklyDigestFlightItem[] = rawBookings.map((b: any) => {
    const isCheckout = b.booking_type === 'checkout'
    if (isCheckout) checkoutFlightsCount++
    else rentalFlightsCount++

    const prof = profilesMap.get(b.booking_owner_user_id) as any
    const customerName = prof?.full_name?.trim() || prof?.first_name?.trim() || 'Pilot'
    const customerEmail = prof?.email || 'No email'

    const aircraftObj = aircraftMap.get(b.aircraft_id) as any
    const aircraftLabel = aircraftObj?.registration
      ? `${aircraftObj.registration}${aircraftObj.model ? ` (${aircraftObj.model})` : ''}`
      : 'OZRentAPlane Aircraft'

    const bookingRef = b.booking_reference || `BK-${b.id.slice(0, 8).toUpperCase()}`

    return {
      bookingId: b.id,
      bookingReference: bookingRef,
      bookingType: isCheckout ? 'checkout' : 'standard',
      customerName,
      customerEmail,
      aircraft: aircraftLabel,
      scheduledDate: formatSydneyDateFull(b.scheduled_start),
      scheduledTime: formatSydneyTimeRange(b.scheduled_start, b.scheduled_end),
      status: formatBookingStatus(b.status),
    }
  })

  // 2. Query New Customers registered in reporting window
  const { data: customersData, error: customersError } = await admin
    .from('profiles')
    .select(`
      id,
      email,
      first_name,
      full_name,
      phone_number,
      phone_country_code,
      pilot_arn,
      pilot_clearance_status,
      account_status,
      created_at,
      updated_at
    `)
    .gte('created_at', range.startUtc)
    .lte('created_at', range.endUtc)
    .order('created_at', { ascending: true })

  if (customersError) {
    console.error('[admin-weekly-digest] Customers query failed:', customersError.message)
  }

  const rawCustomers = (customersData ?? []).filter((c: any) => c.email && !c.email.includes('admin'))
  const customerIds = rawCustomers.map((c: any) => c.id)

  const [{ data: userDocsData }, { data: customerBookingsData }] = await Promise.all([
    customerIds.length > 0
      ? admin
          .from('user_documents')
          .select('id, user_id, document_type, status, expiry_date, created_at, updated_at')
          .in('user_id', customerIds)
      : Promise.resolve({ data: [] }),
    customerIds.length > 0
      ? admin
          .from('bookings')
          .select('id, booking_owner_user_id, booking_type, status, scheduled_start, scheduled_end, created_at')
          .in('booking_owner_user_id', customerIds)
      : Promise.resolve({ data: [] }),
  ])

  const docsByUser = new Map<string, any[]>()
  for (const doc of userDocsData ?? []) {
    const list = docsByUser.get(doc.user_id) ?? []
    list.push(doc)
    docsByUser.set(doc.user_id, list)
  }

  const bookingsByUser = new Map<string, any[]>()
  for (const bk of customerBookingsData ?? []) {
    const list = bookingsByUser.get(bk.booking_owner_user_id) ?? []
    list.push(bk)
    bookingsByUser.set(bk.booking_owner_user_id, list)
  }

  const typedCustomers: any[] = rawCustomers
  for (const c of typedCustomers) {
    c.user_documents = docsByUser.get(c.id) ?? []
    c.bookings = bookingsByUser.get(c.id) ?? []
  }
  const totalNewCustomers = typedCustomers.length

  const customers: WeeklyDigestCustomerItem[] = rawCustomers.map((c: any) => {
    const customerName = c.full_name?.trim() || c.first_name?.trim() || 'Pilot'
    const customerEmail = c.email || ''
    const customerPhone = c.phone_number ? `${c.phone_country_code || ''} ${c.phone_number}`.trim() : null

    const evaluated = evaluateCustomerOnboardingState({
      profile: {
        id: c.id,
        account_status: c.account_status,
        pilot_clearance_status: c.pilot_clearance_status,
        has_night_vfr_rating: false,
        full_name: c.full_name,
        email: c.email,
        created_at: c.created_at,
      },
      documents: c.user_documents ?? [],
      checkoutBookings: (c.bookings ?? []).filter((b: any) => b.booking_type === 'checkout'),
    })

    const onboardingStatusLabel = formatOnboardingStatus(evaluated.stateKey)
    const timeline = buildCustomerTimeline(c)

    return {
      customerId: c.id,
      customerName,
      customerEmail,
      customerPhone,
      pilotArn: c.pilot_arn ?? null,
      registeredDate: formatSydneyDateFull(c.created_at),
      onboardingStatusLabel,
      timeline,
    }
  })

  // 3. Enqueue the Weekly Operations Digest Email
  const idempotencyKey = `admin-weekly-digest:${range.startDateStr}:${range.endDateStr}`
  let enqueued = false

  const adminRecipients = Array.from(
    new Set(
      [
        ADMIN_EMAIL,
        'devjamaviation@gmail.com',
      ].filter(Boolean) as string[],
    ),
  )

  for (const recipient of adminRecipients) {
    try {
      await enqueueAdminWeeklyDigestEmail({
        recipientEmail: recipient,
        reportingPeriodLabel: range.label,
        startDateStr: range.startDateStr,
        endDateStr: range.endDateStr,
        totalFlights,
        checkoutFlightsCount,
        rentalFlightsCount,
        flights,
        totalNewCustomers,
        customers,
        idempotencyKey: `${idempotencyKey}:${recipient}`,
      })
      enqueued = true
    } catch (err) {
      console.error(`[admin-weekly-digest] Enqueue failed for ${recipient}:`, err)
    }
  }

  return {
    reportingPeriod: range.label,
    startUtc: range.startUtc,
    endUtc: range.endUtc,
    totalFlights,
    checkoutFlightsCount,
    rentalFlightsCount,
    totalNewCustomers,
    digestEnqueued: enqueued,
  }
}

export const adminWeeklyDigestJob: JobDefinition = {
  id: 'admin-weekly-digest',
  description: 'Weekly Friday 6:00 AM Sydney time admin operations digest: complete 7-day summary of all flights (Checkout vs Rental) and newly registered customers with onboarding lifecycle timeline.',
  async run(ctx: JobContext) {
    const stats = await runAdminWeeklyDigestSweep(ctx.admin, ctx.now)
    return {
      ok: true,
      stats,
    }
  },
}
