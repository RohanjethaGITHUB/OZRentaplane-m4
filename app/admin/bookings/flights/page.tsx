import { redirect } from 'next/navigation'
import { createClient, getCachedProfile, getCachedUser } from '@/lib/supabase/server'
import { AdminPageHeader } from '@/app/admin/components/AdminUi'
import { formatDateTime } from '@/lib/formatDateTime'
import { deriveBookingStatusForFlightRecord } from '@/lib/booking/flight-record-status'
import { CHECKOUT_RATE_PER_HOUR, PAYF_RATE_PER_HOUR } from '@/lib/pricing-constants'
import type { BillingMode } from '@/lib/supabase/types'
import BookingDirectoryClient, { type BookingDirectoryRow } from './BookingDirectoryClient'

export const metadata = { title: 'Flight Bookings | Admin' }

type SortKey = 'created' | 'customer' | 'email' | 'aircraft' | 'scheduled' | 'status' | 'ref'
type SortDir = 'asc' | 'desc'

type BookingRecord = {
  id: string
  booking_reference: string | null
  booking_type: string
  created_at: string
  scheduled_start: string
  scheduled_end: string
  status: string
  pic_name: string | null
  booking_owner_user_id: string
  aircraft: { id: string; registration: string; aircraft_type: string } | { id: string; registration: string; aircraft_type: string }[] | null
  flight_records?: { status: string | null; submitted_at: string | null }[] | null
}

type BookingInvoiceRecord = {
  booking_id: string
  rate_cents_per_hour: number | null
}

type BlockTimeUsageRecord = {
  booking_id: string
  purchase_id: string | null
  purchase:
    | {
        id: string
        rate_per_hour: number | null
        package: { name: string | null } | { name: string | null }[] | null
      }
    | {
        id: string
        rate_per_hour: number | null
        package: { name: string | null } | { name: string | null }[] | null
      }[]
    | null
}

type ActiveBlockTimePurchaseRecord = {
  user_id: string
  rate_per_hour: number | null
  package: { name: string | null } | { name: string | null }[] | null
}

type BookingTypePresentation = {
  bookingType: string
  billingMode: BillingMode | 'checkout' | null
  billingRateCentsPerHour: number | null
  blockTimePackageName: string | null
  billingBasisIsProvisional: boolean
  bookingTypePrimaryLabel: string
  bookingTypeSecondaryLabel: string
}

const STATUS_LABEL: Record<string, string> = {
  pending_confirmation: 'Requested',
  confirmed: 'Upcoming',
  checkout_requested: 'Checkout Requested',
  checkout_confirmed: 'Upcoming',
  checkout_completed_under_review: 'Awaiting Checkout Review',
  checkout_payment_required: 'Payment Pending',
  ready_for_dispatch: 'Upcoming',
  dispatched: 'In Progress',
  awaiting_flight_record: 'Awaiting Flight Record',
  flight_record_overdue: 'Awaiting Flight Record',
  on_hold_pending_documents: 'On Hold',
  pending_post_flight_review: 'Post-flight Review',
  payment_pending: 'Payment Pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
  cancellation_requested: 'Cancellation Requested',
}

function fullCustomerName(profile: { first_name: string | null; last_name: string | null; full_name: string | null; email: string | null } | undefined, picName: string | null) {
  if (profile?.first_name) return `${profile.first_name} ${profile.last_name ?? ''}`.trim()
  if (profile?.full_name) return profile.full_name
  if (picName) return picName
  return profile?.email ?? 'Customer'
}

function getStatusLabel(displayStatus: string) {
  return STATUS_LABEL[displayStatus] ?? displayStatus.replace(/_/g, ' ')
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function formatHourlyRateLabel(rateCentsPerHour: number | null | undefined) {
  if (rateCentsPerHour == null || Number.isNaN(rateCentsPerHour)) return null
  return `$${Math.round(rateCentsPerHour / 100).toLocaleString('en-AU')}/hr`
}

function resolveBookingTypePresentation({
  bookingType,
  invoice,
  usage,
  activePurchase,
}: {
  bookingType: string
  invoice: BookingInvoiceRecord | null
  usage: BlockTimeUsageRecord | null
  activePurchase: ActiveBlockTimePurchaseRecord | null
}): BookingTypePresentation {
  if (bookingType === 'checkout') {
    return {
      bookingType,
      billingMode: 'checkout',
      billingRateCentsPerHour: CHECKOUT_RATE_PER_HOUR * 100,
      blockTimePackageName: null,
      billingBasisIsProvisional: false,
      bookingTypePrimaryLabel: 'Checkout',
      bookingTypeSecondaryLabel: formatHourlyRateLabel(CHECKOUT_RATE_PER_HOUR * 100) ?? 'Billing details unavailable',
    }
  }

  const usagePurchase = one(usage?.purchase)
  const usagePackage = one(usagePurchase?.package)
  const usageRateCentsPerHour = usagePurchase?.rate_per_hour != null
    ? Math.round(Number(usagePurchase.rate_per_hour) * 100)
    : null

  if (usage) {
    if (usagePackage?.name && usageRateCentsPerHour != null) {
      return {
        bookingType,
        billingMode: 'block_time',
        billingRateCentsPerHour: usageRateCentsPerHour,
        blockTimePackageName: usagePackage.name,
        billingBasisIsProvisional: false,
        bookingTypePrimaryLabel: 'Rental — Block Time',
        bookingTypeSecondaryLabel: `${usagePackage.name} · ${formatHourlyRateLabel(usageRateCentsPerHour)}`,
      }
    }

    if (usageRateCentsPerHour != null) {
      return {
        bookingType,
        billingMode: 'block_time',
        billingRateCentsPerHour: usageRateCentsPerHour,
        blockTimePackageName: usagePackage?.name ?? null,
        billingBasisIsProvisional: false,
        bookingTypePrimaryLabel: 'Rental — Block Time',
        bookingTypeSecondaryLabel: formatHourlyRateLabel(usageRateCentsPerHour) ?? 'Package details unavailable',
      }
    }

    if (usagePackage?.name) {
      return {
        bookingType,
        billingMode: 'block_time',
        billingRateCentsPerHour: null,
        blockTimePackageName: usagePackage.name,
        billingBasisIsProvisional: false,
        bookingTypePrimaryLabel: 'Rental — Block Time',
        bookingTypeSecondaryLabel: usagePackage.name,
      }
    }

    return {
      bookingType,
      billingMode: 'block_time',
      billingRateCentsPerHour: null,
      blockTimePackageName: null,
      billingBasisIsProvisional: false,
      bookingTypePrimaryLabel: 'Rental — Block Time',
      bookingTypeSecondaryLabel: 'Package details unavailable',
    }
  }

  if (invoice?.rate_cents_per_hour != null) {
    return {
      bookingType,
      billingMode: 'pay_as_you_fly',
      billingRateCentsPerHour: invoice.rate_cents_per_hour,
      blockTimePackageName: null,
      billingBasisIsProvisional: false,
      bookingTypePrimaryLabel: 'Rental — Pay As You Fly',
      bookingTypeSecondaryLabel: formatHourlyRateLabel(invoice.rate_cents_per_hour) ?? 'Billing details unavailable',
    }
  }

  if (invoice) {
    return {
      bookingType,
      billingMode: null,
      billingRateCentsPerHour: null,
      blockTimePackageName: null,
      billingBasisIsProvisional: false,
      bookingTypePrimaryLabel: 'Rental',
      bookingTypeSecondaryLabel: 'Billing details unavailable',
    }
  }

  const activePackage = one(activePurchase?.package)
  const activeRateCentsPerHour = activePurchase?.rate_per_hour != null
    ? Math.round(Number(activePurchase.rate_per_hour) * 100)
    : null

  if (activePackage?.name && activeRateCentsPerHour != null) {
    return {
      bookingType,
      billingMode: 'block_time',
      billingRateCentsPerHour: activeRateCentsPerHour,
      blockTimePackageName: activePackage.name,
      billingBasisIsProvisional: true,
      bookingTypePrimaryLabel: 'Rental — Block Time',
      bookingTypeSecondaryLabel: `${activePackage.name} · ${formatHourlyRateLabel(activeRateCentsPerHour)}`,
    }
  }

  return {
    bookingType,
    billingMode: 'pay_as_you_fly',
    billingRateCentsPerHour: PAYF_RATE_PER_HOUR * 100,
    blockTimePackageName: null,
    billingBasisIsProvisional: true,
    bookingTypePrimaryLabel: 'Rental — Pay As You Fly',
    bookingTypeSecondaryLabel: formatHourlyRateLabel(PAYF_RATE_PER_HOUR * 100) ?? 'Billing details unavailable',
  }
}

export default async function FlightBookingsPage({
  searchParams,
}: {
  searchParams: {
    status?: string
    sort?: string
    dir?: string
  }
}) {
  const supabase = await createClient()

  const { data: { user } } = await getCachedUser()
  if (!user) redirect('/login')

  const { data: profile } = await getCachedProfile(user.id, 'admin')
  if (profile?.role !== 'admin') redirect('/dashboard')

  const sort = (searchParams.sort as SortKey | undefined) ?? 'created'
  const dir = (searchParams.dir as SortDir | undefined) === 'asc' ? 'asc' : 'desc'
  const initialFilter = searchParams.status ?? 'all'

  const { data } = await supabase
    .from('bookings')
    .select(`
      id, booking_reference, booking_type, created_at, scheduled_start, scheduled_end, status,
      pic_name, booking_owner_user_id,
      aircraft ( id, registration, aircraft_type ),
      flight_records ( status, submitted_at )
    `)
    .in('booking_type', ['standard', 'checkout'])

  const bookings = (data ?? []) as BookingRecord[]
  const bookingIds = bookings.map((booking) => booking.id)
  const customerIds = Array.from(new Set(bookings.map((booking) => booking.booking_owner_user_id).filter(Boolean)))
  const profileMap = new Map<string, { first_name: string | null; last_name: string | null; full_name: string | null; email: string | null }>()
  const bookingInvoiceMap = new Map<string, BookingInvoiceRecord>()
  const blockTimeUsageMap = new Map<string, BlockTimeUsageRecord>()
  const activePurchaseMap = new Map<string, ActiveBlockTimePurchaseRecord>()

  const nowIso = new Date().toISOString()
  const [
    customerProfilesResult,
    bookingInvoicesResult,
    blockTimeUsageResult,
    activeBlockTimePurchasesResult,
    checkoutBankTransferResult,
    bookingBankTransferResult,
    blockTimeInvoicesResult,
  ] = await Promise.all([
    customerIds.length > 0
      ? supabase
          .from('profiles')
          .select('id, first_name, last_name, full_name, email')
          .in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length > 0
      ? supabase
          .from('booking_invoices')
          .select('booking_id, rate_cents_per_hour')
          .in('booking_id', bookingIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length > 0
      ? supabase
          .from('pilot_block_time_usage')
          .select(`
            booking_id,
            purchase_id,
            purchase:pilot_block_time_purchases (
              id,
              rate_per_hour,
              package:block_time_packages ( name )
            )
          `)
          .in('booking_id', bookingIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length > 0
      ? supabase
          .from('pilot_block_time_purchases')
          .select(`
            user_id,
            rate_per_hour,
            package:block_time_packages ( name )
          `)
          .in('user_id', customerIds)
          .eq('status', 'active')
          .gt('expires_at', nowIso)
          .order('queue_position', { ascending: true, nullsFirst: false })
          .order('activated_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length > 0
      ? supabase
          .from('checkout_bank_transfer_submissions')
          .select('booking_id, status, submitted_at')
          .in('booking_id', bookingIds)
          .eq('status', 'pending_review')
          .order('submitted_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length > 0
      ? supabase
          .from('booking_bank_transfer_submissions')
          .select('booking_id, status, submitted_at')
          .in('booking_id', bookingIds)
          .eq('status', 'pending_review')
          .order('submitted_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length > 0
      ? supabase
          .from('invoices')
          .select('booking_id, is_block_time_overage, status')
          .in('booking_id', bookingIds)
          .eq('billing_mode', 'block_time')
          .eq('type', 'flight')
          .in('status', ['awaiting', 'bank_transfer_pending_review'])
      : Promise.resolve({ data: [], error: null }),
  ])

  for (const customerProfile of customerProfilesResult.data ?? []) {
    profileMap.set(customerProfile.id, {
      first_name: customerProfile.first_name,
      last_name: customerProfile.last_name,
      full_name: customerProfile.full_name,
      email: customerProfile.email,
    })
  }

  for (const invoice of (bookingInvoicesResult.data ?? []) as BookingInvoiceRecord[]) {
    bookingInvoiceMap.set(invoice.booking_id, invoice)
  }

  for (const usage of (blockTimeUsageResult.data ?? []) as BlockTimeUsageRecord[]) {
    if (!blockTimeUsageMap.has(usage.booking_id)) {
      blockTimeUsageMap.set(usage.booking_id, usage)
    }
  }

  for (const purchase of (activeBlockTimePurchasesResult.data ?? []) as ActiveBlockTimePurchaseRecord[]) {
    if (!activePurchaseMap.has(purchase.user_id)) {
      activePurchaseMap.set(purchase.user_id, purchase)
    }
  }

  const landingFeePendingByBookingId = new Set<string>()
  for (const row of ((blockTimeInvoicesResult.data ?? []) as Array<{ booking_id: string | null; is_block_time_overage: boolean | null }>)) {
    if (row.booking_id && !row.is_block_time_overage) {
      landingFeePendingByBookingId.add(row.booking_id)
    }
  }

  const paymentProofPendingByBookingId = new Set<string>()
  for (const row of checkoutBankTransferResult.data ?? []) {
    if (row.booking_id) paymentProofPendingByBookingId.add(row.booking_id)
  }
  for (const row of bookingBankTransferResult.data ?? []) {
    if (row.booking_id) paymentProofPendingByBookingId.add(row.booking_id)
  }

  const rows = bookings.map((booking) => {
    const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
    const customerProfile = profileMap.get(booking.booking_owner_user_id)
    const displayStatus = deriveBookingStatusForFlightRecord(booking)
    const bookingTypePresentation = resolveBookingTypePresentation({
      bookingType: booking.booking_type,
      invoice: bookingInvoiceMap.get(booking.id) ?? null,
      usage: blockTimeUsageMap.get(booking.id) ?? null,
      activePurchase: activePurchaseMap.get(booking.booking_owner_user_id) ?? null,
    })
    const isLandingFeePending = landingFeePendingByBookingId.has(booking.id)
    const paymentProofPendingReview = paymentProofPendingByBookingId.has(booking.id)

    return {
      id: booking.id,
      bookingId: booking.id,
      bookingReference: booking.booking_reference || booking.id.slice(0, 8).toUpperCase(),
      bookingOwnerUserId: booking.booking_owner_user_id,
      customerName: fullCustomerName(customerProfile, booking.pic_name),
      customerEmail: customerProfile?.email ?? '—',
      aircraftRegistration: aircraft?.registration ?? 'VH-KZG',
      aircraftType: aircraft?.aircraft_type ?? null,
      createdAt: booking.created_at,
      scheduledStart: booking.scheduled_start,
      scheduledEnd: booking.scheduled_end,
      scheduledLabel: formatDateTime(booking.scheduled_start),
      rawStatus: booking.status,
      displayStatus,
      statusLabel: paymentProofPendingReview
        ? (booking.booking_type === 'checkout'
            ? 'Payment Verification Pending'
            : isLandingFeePending
              ? 'Landing Fee Review Pending'
              : 'Payment Review Pending')
        : (displayStatus === 'payment_pending' && isLandingFeePending)
          ? 'Landing Fee Pending'
          : getStatusLabel(displayStatus),
      bookingType: bookingTypePresentation.bookingType,
      billingMode: bookingTypePresentation.billingMode,
      billingRateCentsPerHour: bookingTypePresentation.billingRateCentsPerHour,
      blockTimePackageName: bookingTypePresentation.blockTimePackageName,
      billingBasisIsProvisional: bookingTypePresentation.billingBasisIsProvisional,
      bookingTypePrimaryLabel: bookingTypePresentation.bookingTypePrimaryLabel,
      bookingTypeSecondaryLabel: bookingTypePresentation.bookingTypeSecondaryLabel,
      paymentProofPendingReview,
      isLandingFeePending,
    } satisfies BookingDirectoryRow
  })

  const sortedRows = [...rows].sort((a, b) => {
    const valueA: Record<SortKey, string | number> = {
      created: new Date(a.createdAt).getTime(),
      customer: a.customerName.toLowerCase(),
      email: a.customerEmail.toLowerCase(),
      aircraft: `${a.bookingTypePrimaryLabel} ${a.bookingTypeSecondaryLabel}`.toLowerCase(),
      scheduled: new Date(a.scheduledStart).getTime(),
      status: a.statusLabel.toLowerCase(),
      ref: a.bookingReference.toLowerCase(),
    }
    const valueB: Record<SortKey, string | number> = {
      created: new Date(b.createdAt).getTime(),
      customer: b.customerName.toLowerCase(),
      email: b.customerEmail.toLowerCase(),
      aircraft: `${b.bookingTypePrimaryLabel} ${b.bookingTypeSecondaryLabel}`.toLowerCase(),
      scheduled: new Date(b.scheduledStart).getTime(),
      status: b.statusLabel.toLowerCase(),
      ref: b.bookingReference.toLowerCase(),
    }
    const comparison = valueA[sort] < valueB[sort] ? -1 : valueA[sort] > valueB[sort] ? 1 : 0
    return dir === 'asc' ? comparison : -comparison
  })

  return (
    <>
      <AdminPageHeader
        eyebrow="Operations"
        title="Flight Bookings"
        subtitle="Manage flight bookings, including upcoming checkouts and rentals."
      />
      <div className="admin-booking-directory-pilot mx-auto max-w-[1440px] space-y-5 px-4 py-4 pb-4 sm:px-6 sm:py-6 sm:pb-4 md:px-8 lg:px-10">
        <BookingDirectoryClient
          rows={sortedRows}
          initialFilter={initialFilter}
          sort={sort}
          dir={dir}
          basePath="/admin/bookings/flights"
        />
      </div>
    </>
  )
}
