import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatDateTime } from '@/lib/formatDateTime'
import type { FlightRecordAttachment } from '@/lib/supabase/booking-types'
import { getAircraftFlightLogStartSuggestions } from '@/lib/aircraft-flight-log'
import { PAYF_RATE_PER_HOUR } from '@/lib/pricing-constants'
import { calculateBookingDays } from '@/lib/booking/standard-booking-billing'
import PostFlightVerificationConsole, {
  type EvidenceAttachment,
  type LandingRowItem,
} from './PostFlightVerificationConsole'

export const metadata = { title: 'Post-Flight Review & Verification | Admin' }

function formatCustomerPhone(profile: { phone_country_code?: string | null; phone_number?: string | null } | null | undefined): string {
  const countryCode = profile?.phone_country_code?.replace(/\D/g, '') ?? ''
  const phoneNumber = profile?.phone_number?.replace(/[^\d]/g, '') ?? ''
  if (!phoneNumber) return '—'
  return countryCode ? `+${countryCode} ${phoneNumber}` : phoneNumber
}

export default async function AdminPostFlightReviewDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const recordSelect = `
    *,
    aircraft ( id, registration, aircraft_type, default_hourly_rate, billing_meter_type )
  `

  const { data: directRecord } = await adminSupabase
    .from('flight_records')
    .select(recordSelect)
    .eq('id', params.id)
    .maybeSingle()

  let record = directRecord
  let booking = null as null | {
    id: string
    status: string | null
    booking_type: string | null
    scheduled_start: string | null
    scheduled_end: string | null
    customer_notes: string | null
    booking_owner_user_id: string | null
    booking_reference: string | null
    pic_name: string | null
    pic_arn: string | null
  }

  if (record) {
    const { data: bookingRow } = await adminSupabase
      .from('bookings')
      .select('id, status, booking_type, scheduled_start, scheduled_end, customer_notes, booking_owner_user_id, booking_reference, pic_name, pic_arn')
      .eq('id', record.booking_id)
      .maybeSingle()
    booking = bookingRow as typeof booking
  } else {
    const { data: bookingRow } = await adminSupabase
      .from('bookings')
      .select('id, status, booking_type, scheduled_start, scheduled_end, customer_notes, booking_owner_user_id, booking_reference, pic_name, pic_arn')
      .eq('id', params.id)
      .maybeSingle()
    booking = bookingRow as typeof booking

    if (booking) {
      const { data: bookingRecord } = await adminSupabase
        .from('flight_records')
        .select(recordSelect)
        .eq('booking_id', booking.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      record = bookingRecord
    }
  }

  if (!record) {
    return <div className="p-10 text-[var(--admin-text)]">Flight record not found.</div>
  }

  const aircraft = Array.isArray(record.aircraft) ? record.aircraft[0] : record.aircraft
  const customerId = booking?.booking_owner_user_id ?? record.user_id ?? null
  const bookingId = booking?.id ?? record.booking_id
  const bookingRef = booking?.booking_reference ?? record.booking_id?.slice(0, 8).toUpperCase()

  // Fetch customer profile
  let customerName = record.pic_name || booking?.pic_name || 'Pilot'
  let customerEmail = '—'
  let customerPhone = '—'

  if (customerId) {
    const { data: custProf } = await adminSupabase
      .from('profiles')
      .select('full_name, email, phone_number, phone_country_code')
      .eq('id', customerId)
      .maybeSingle()

    if (custProf) {
      customerName = custProf.full_name || customerName
      customerEmail = custProf.email || customerEmail
      customerPhone = formatCustomerPhone(custProf)
    }

    if (customerEmail === '—') {
      const { data: authUser } = await adminSupabase.auth.admin.getUserById(customerId)
      if (authUser?.user?.email) {
        customerEmail = authUser.user.email
      }
    }
  }

  const scheduledStartStr = booking?.scheduled_start ? formatDateTime(booking.scheduled_start) : 'Unknown'
  const scheduledEndStr = booking?.scheduled_end ? formatDateTime(booking.scheduled_end) : 'Unknown'

  // Fetch evidence attachments with signed URLs (check both flight_record_id and booking_id)
  const { data: rawAttachments } = await adminSupabase
    .from('flight_record_attachments')
    .select('*')
    .or(`flight_record_id.eq.${record.id},booking_id.eq.${bookingId}`)
    .order('created_at', { ascending: true })

  const evidenceAttachments: EvidenceAttachment[] = []
  for (const att of rawAttachments ?? []) {
    let signedUrl: string | null = null
    const res1 = await adminSupabase.storage
      .from('flight_record_evidence')
      .createSignedUrl(att.storage_path, 3600)
    signedUrl = res1.data?.signedUrl ?? null

    if (!signedUrl) {
      const res2 = await adminSupabase.storage
        .from('bank_transfer_receipts')
        .createSignedUrl(att.storage_path, 3600)
      signedUrl = res2.data?.signedUrl ?? null
    }

    if (signedUrl) {
      evidenceAttachments.push({
        id: att.id,
        file_name: att.file_name,
        signedUrl,
        file_size: att.file_size,
        created_at: att.created_at,
      })
    }
  }

  // Fetch invoice (standard booking invoice)
  const { data: bookingInvoice } = await adminSupabase
    .from('booking_invoices')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fetch landing charges
  let { data: rawLandingCharges } = bookingInvoice
    ? await adminSupabase
        .from('booking_landing_charges')
        .select(`
          id, airport_id, landing_count, unit_amount_cents, total_amount_cents,
          airport:airports ( id, icao_code, name )
        `)
        .or(`booking_invoice_id.eq.${bookingInvoice.id},booking_id.eq.${bookingId}`)
        .order('created_at', { ascending: true })
    : { data: [] }

  if (!rawLandingCharges || rawLandingCharges.length === 0) {
    const { data: frLandings } = await adminSupabase
      .from('flight_record_landings')
      .select('airport_id, landing_count, airport:airports(id, icao_code, name, default_landing_fee_cents)')
      .eq('flight_record_id', record.id)
    if (frLandings && frLandings.length > 0) {
      rawLandingCharges = frLandings.map((frl: any) => {
        const apt = Array.isArray(frl.airport) ? frl.airport[0] : frl.airport
        const unitAmount = apt?.default_landing_fee_cents ?? 2895
        const count = Number(frl.landing_count) || 1
        return {
          id: `frl-${frl.airport_id}`,
          airport_id: frl.airport_id,
          landing_count: count,
          unit_amount_cents: unitAmount,
          total_amount_cents: count * unitAmount,
          airport: apt,
        }
      })
    }
  }

  const landingItems: LandingRowItem[] = (rawLandingCharges ?? []).map((lc: any) => {
    const apt = Array.isArray(lc.airport) ? lc.airport[0] : lc.airport
    return {
      airportId: lc.airport_id,
      airportName: apt?.name || 'Airport',
      icaoCode: apt?.icao_code || 'YSBK',
      landingCount: Number(lc.landing_count || 1),
      rateCents: Number(lc.unit_amount_cents || 2895),
      totalCents: Number(lc.total_amount_cents || 2895),
    }
  })

  // Fetch bank transfer submission if any
  const { data: bankSubmission } = await adminSupabase
    .from('booking_bank_transfer_submissions')
    .select('*')
    .eq('booking_id', bookingId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let bankReceiptSignedUrl: string | null = null
  if (bankSubmission?.receipt_storage_path) {
    const res1 = await adminSupabase.storage
      .from('bank_transfer_receipts')
      .createSignedUrl(bankSubmission.receipt_storage_path, 3600)
    bankReceiptSignedUrl = res1.data?.signedUrl ?? null

    if (!bankReceiptSignedUrl) {
      const res2 = await adminSupabase.storage
        .from('flight_record_evidence')
        .createSignedUrl(bankSubmission.receipt_storage_path, 3600)
      bankReceiptSignedUrl = res2.data?.signedUrl ?? null
    }
  }

  // Fetch active clarification if any
  let clarData: { category: string; message: string } | null = null
  try {
    const res = await adminSupabase
      .from('flight_record_clarifications')
      .select('category, message')
      .or(`flight_record_id.eq.${record.id},booking_id.eq.${bookingId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    clarData = res.data
  } catch {
    clarData = null
  }

  if (!clarData && record.admin_notes) {
    clarData = {
      category: record.correction_reason || 'Clarification Requested by Admin',
      message: record.admin_notes,
    }
  }

  const flightLogStartSuggestions = record.aircraft_id
    ? (await getAircraftFlightLogStartSuggestions(record.aircraft_id)).suggestedStarts
    : { vdo_start: null, tacho_start: null, air_switch_start: null, mr_start: null }

  const { data: allAirports } = await adminSupabase
    .from('airports')
    .select('id, icao_code, name, default_landing_fee_cents')
    .eq('is_active', true)
    .order('icao_code', { ascending: true })

  const rawHourlyRate = bookingInvoice?.rate_cents_per_hour
    ? bookingInvoice.rate_cents_per_hour / 100
    : Number(aircraft?.default_hourly_rate ?? PAYF_RATE_PER_HOUR)
  const hourlyRate = rawHourlyRate >= 290 ? rawHourlyRate : PAYF_RATE_PER_HOUR

  const vdoTotal = record.vdo_total != null ? Number(record.vdo_total) : null
  const vdoStart = record.vdo_start != null ? Number(record.vdo_start) : flightLogStartSuggestions.vdo_start
  const vdoStop = record.vdo_stop != null 
    ? Number(record.vdo_stop) 
    : (vdoStart != null && vdoTotal != null ? Number((Number(vdoStart) + vdoTotal).toFixed(1)) : null)

  const airSwitchTotal = record.air_switch_total != null ? Number(record.air_switch_total) : null
  const airSwitchStart = record.air_switch_start != null ? Number(record.air_switch_start) : flightLogStartSuggestions.air_switch_start
  const airSwitchStop = record.air_switch_stop != null 
    ? Number(record.air_switch_stop) 
    : (airSwitchStart != null && airSwitchTotal != null ? Number((Number(airSwitchStart) + airSwitchTotal).toFixed(1)) : null)

  let blockTimeDetails: {
    packageId: string
    packageName: string
    hoursBefore: number
    hoursDeducted: number
    hoursRemaining: number
    overageHours: number
    overageAmountCents: number
    hoursPurchased?: number
  } | null = null

  if (bookingInvoice?.admin_notes) {
    try {
      const parsedNotes = typeof bookingInvoice.admin_notes === 'string'
        ? JSON.parse(bookingInvoice.admin_notes)
        : bookingInvoice.admin_notes
      if (parsedNotes?.block_time) {
        blockTimeDetails = {
          packageId: parsedNotes.block_time.package_id,
          packageName: parsedNotes.block_time.package_name || 'Block Time Package',
          hoursBefore: Number(parsedNotes.block_time.hours_before ?? 0),
          hoursDeducted: Number(parsedNotes.block_time.hours_deducted ?? 0),
          hoursRemaining: Number(parsedNotes.block_time.hours_remaining ?? 0),
          overageHours: Number(parsedNotes.block_time.overage_hours ?? 0),
          overageAmountCents: Number(parsedNotes.block_time.overage_amount_cents ?? 0),
          hoursPurchased: Number(parsedNotes.block_time.hours_purchased ?? 0),
        }
      }
    } catch {
      // ignore
    }
  }

  if (!blockTimeDetails) {
    const { data: usageRow } = await adminSupabase
      .from('pilot_block_time_usage')
      .select(`
        purchase_id, hours_deducted, overflow_hours, overflow_amount, hours_before, hours_after,
        purchase:pilot_block_time_purchases (
          id, hours_purchased, rate_per_hour,
          package:block_time_packages ( name, hours )
        )
      `)
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (usageRow) {
      const pPurchase = (usageRow as any).purchase
      const pkg = Array.isArray(pPurchase?.package)
        ? pPurchase?.package[0]
        : pPurchase?.package
      const hrsPurchased = Number(pPurchase?.hours_purchased || pkg?.hours || 0)
      blockTimeDetails = {
        packageId: usageRow.purchase_id,
        packageName: pkg?.name || 'Block Time Package',
        hoursBefore: Number(usageRow.hours_before ?? 0),
        hoursDeducted: Number(usageRow.hours_deducted ?? 0),
        hoursRemaining: Number(usageRow.hours_after ?? 0),
        overageHours: Number(usageRow.overflow_hours ?? 0),
        overageAmountCents: Math.round(Number(usageRow.overflow_amount ?? 0) * 100),
        hoursPurchased: hrsPurchased,
      }
    }
  }

  if (!blockTimeDetails && customerId) {
    const { data: activePurchase } = await adminSupabase
      .from('pilot_block_time_purchases')
      .select(`
        id, hours_remaining, hours_purchased, rate_per_hour, expires_at, status,
        package:block_time_packages ( name, hours )
      `)
      .eq('user_id', customerId)
      .gt('hours_remaining', 0)
      .order('activated_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (activePurchase && bookingInvoice?.base_amount_cents === 0 && (Number(record.vdo_total ?? 0) > 0 || (bookingInvoice?.total_paid_cents ?? 0) > 0)) {
      const pkg = Array.isArray((activePurchase as any).package)
        ? (activePurchase as any).package[0]
        : (activePurchase as any).package
      const vdoNum = Number(record.vdo_total ?? 0)
      const hrsRem = Number(activePurchase.hours_remaining ?? 0)
      const hrsPurchased = Number(activePurchase.hours_purchased || pkg?.hours || 0)
      blockTimeDetails = {
        packageId: activePurchase.id,
        packageName: pkg?.name || 'Block Time Package',
        hoursBefore: hrsRem + vdoNum,
        hoursDeducted: vdoNum,
        hoursRemaining: hrsRem,
        overageHours: 0,
        overageAmountCents: 0,
        hoursPurchased: hrsPurchased,
      }
    }
  }

  // Ensure blockTimeDetails has the purchased hours reflected in packageName
  if (blockTimeDetails) {
    let hrsPurchased = blockTimeDetails.hoursPurchased || 0
    if (!hrsPurchased && blockTimeDetails.packageId) {
      const { data: pRow } = await adminSupabase
        .from('pilot_block_time_purchases')
        .select('hours_purchased, package:block_time_packages(name, hours)')
        .eq('id', blockTimeDetails.packageId)
        .maybeSingle()
      if (pRow) {
        const pkg = Array.isArray(pRow.package) ? pRow.package[0] : pRow.package
        hrsPurchased = Number(pRow.hours_purchased || pkg?.hours || 0)
        blockTimeDetails.hoursPurchased = hrsPurchased
      }
    }
    if (!hrsPurchased && customerId) {
      const { data: pRow } = await adminSupabase
        .from('pilot_block_time_purchases')
        .select('hours_purchased, package:block_time_packages(name, hours)')
        .eq('user_id', customerId)
        .order('activated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (pRow) {
        const pkg = Array.isArray(pRow.package) ? pRow.package[0] : pRow.package
        hrsPurchased = Number(pRow.hours_purchased || pkg?.hours || 0)
        blockTimeDetails.hoursPurchased = hrsPurchased
      }
    }
    let baseName = blockTimeDetails.packageName || 'Starter Block'
    if (hrsPurchased > 0 && !baseName.toLowerCase().includes('hr')) {
      baseName = `${baseName} (${hrsPurchased}hr package)`
    }
    blockTimeDetails.packageName = baseName
  }

  const flightChargeCents = blockTimeDetails
    ? blockTimeDetails.overageAmountCents
    : (bookingInvoice?.base_amount_cents ?? (Number(vdoTotal ?? 0) * hourlyRate * 100))
  const landingSubtotalCents = bookingInvoice?.landing_subtotal_cents ?? landingItems.reduce((sum, item) => sum + item.totalCents, 0)
  const creditAppliedCents = bookingInvoice?.advance_applied_cents ?? 0
  const subtotalCents = bookingInvoice?.subtotal_cents ?? (flightChargeCents + landingSubtotalCents - creditAppliedCents)
  const gstCents = Math.round(subtotalCents - (subtotalCents / 1.1))
  const totalAmountCents = Math.max(0, subtotalCents)

  const scheduledStart = booking?.scheduled_start ? new Date(booking.scheduled_start) : null
  const scheduledEnd = booking?.scheduled_end ? new Date(booking.scheduled_end) : null
  const bookingSlotHours = scheduledStart && scheduledEnd
    ? Math.max(0, (scheduledEnd.getTime() - scheduledStart.getTime()) / (1000 * 60 * 60))
    : 0
  const bookingDays = calculateBookingDays({
    scheduledStart: booking?.scheduled_start,
    scheduledEnd: booking?.scheduled_end,
    bookingSlotHours,
  })
  const minimumVdoHours = bookingDays * 4

  const hasBankTransfer = Boolean(bankSubmission)
  const hasStripePayment = Boolean(
    bookingInvoice?.stripe_payment_intent_id &&
    !bookingInvoice.stripe_payment_intent_id.startsWith('manual-') &&
    (bookingInvoice?.paid_at || (bookingInvoice?.total_paid_cents && bookingInvoice.total_paid_cents > 0))
  )

  let cardPaidCents = 0
  let stripeGrossChargedCents = 0
  let bankTransferPaidCents = 0

  if (hasStripePayment) {
    const { data: stripeLedger } = await adminSupabase
      .from('customer_payment_ledger')
      .select('amount_cents')
      .eq('booking_id', bookingId)
      .in('entry_type', ['stripe_payment', 'stripe_charge'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    stripeGrossChargedCents = stripeLedger?.amount_cents || bookingInvoice?.stripe_gross_amount_cents || 0

    // Priority: bookingInvoice.total_paid_cents represents the net subtotal paid by customer.
    // stripeLedger.amount_cents is the gross card charge which includes the 1.7% + 30c card surcharge.
    if (bookingInvoice?.total_paid_cents && bookingInvoice.total_paid_cents > 0) {
      cardPaidCents = bookingInvoice.total_paid_cents
    } else if (stripeLedger && stripeLedger.amount_cents > 0) {
      const surchargeCents = bookingInvoice?.online_payment_surcharge_cents ?? 0
      cardPaidCents = Math.max(0, stripeLedger.amount_cents - surchargeCents)
    }
  }

  if (hasBankTransfer) {
    if (hasStripePayment && cardPaidCents > 0) {
      bankTransferPaidCents = Math.max(0, subtotalCents - cardPaidCents)
    } else {
      bankTransferPaidCents = (bookingInvoice?.total_paid_cents && bookingInvoice.total_paid_cents > 0)
        ? bookingInvoice.total_paid_cents
        : (bookingInvoice?.subtotal_cents ?? subtotalCents)
    }
  }

  const isSplitPayment = hasBankTransfer && hasStripePayment && cardPaidCents > 0 && bankTransferPaidCents > 0
  const upfrontPaidCents = isSplitPayment
    ? (cardPaidCents + bankTransferPaidCents)
    : hasBankTransfer
    ? bankTransferPaidCents
    : cardPaidCents

  // For multi-day bookings where flight_records.vdo_total may have been adjusted to minimum policy hours,
  // recover the actual flown hours from the initial card payment if available so both buttons don't show identical hours
  let actualFlownVdo = vdoTotal
  if (bookingDays > 0 && actualFlownVdo === minimumVdoHours && cardPaidCents > 0) {
    const paidFlightCents = Math.max(0, cardPaidCents - landingSubtotalCents)
    const paidHours = Number((paidFlightCents / (hourlyRate * 100)).toFixed(1))
    if (paidHours > 0 && paidHours < actualFlownVdo) {
      actualFlownVdo = paidHours
    }
  }

  const paymentMethod = isSplitPayment
    ? 'split'
    : (bookingInvoice?.payment_method ?? (bankSubmission ? 'bank_transfer' : 'stripe_card'))

  return (
    <PostFlightVerificationConsole
      flightRecordId={record.id}
      bookingId={bookingId}
      customerId={customerId || ''}
      bookingRef={bookingRef}
      customerName={customerName}
      customerEmail={customerEmail}
      customerPhone={customerPhone}
      picArn={record.pic_arn || booking?.pic_arn}
      flightDate={record.date || '—'}
      scheduledStartStr={scheduledStartStr}
      scheduledEndStr={scheduledEndStr}
      scheduledStartISO={booking?.scheduled_start}
      scheduledEndISO={booking?.scheduled_end}
      bookingSlotHours={bookingSlotHours}
      upfrontPaidCents={upfrontPaidCents}
      hasBankTransfer={hasBankTransfer}
      hasStripePayment={hasStripePayment}
      isSplitPayment={isSplitPayment}
      bankTransferPaidCents={bankTransferPaidCents}
      cardPaidCents={cardPaidCents}
      stripeGrossChargedCents={stripeGrossChargedCents}
      customerNotes={record.customer_notes}
      aircraftReg={aircraft?.registration || 'VH-KZG'}
      aircraftType={aircraft?.aircraft_type || 'Cessna 172'}
      currentStatus={record.status}
      vdoStart={vdoStart}
      vdoStop={vdoStop}
      vdoTotal={actualFlownVdo}
      vdoBaseline={flightLogStartSuggestions.vdo_start}
      airSwitchStart={airSwitchStart}
      airSwitchStop={airSwitchStop}
      airSwitchTotal={airSwitchTotal}
      airSwitchBaseline={flightLogStartSuggestions.air_switch_start}
      hourlyRate={hourlyRate}
      standardHourlyRate={Number(aircraft?.default_hourly_rate ?? PAYF_RATE_PER_HOUR)}
      availableAirports={(allAirports ?? []) as any}
      landingItems={landingItems}
      flightChargeCents={flightChargeCents}
      landingSubtotalCents={landingSubtotalCents}
      creditAppliedCents={creditAppliedCents}
      subtotalCents={subtotalCents}
      gstCents={gstCents}
      totalAmountCents={totalAmountCents}
      invoiceNumber={bookingInvoice?.invoice_number}
      paymentMethod={paymentMethod}
      stripePaymentIntentId={bookingInvoice?.stripe_payment_intent_id}
      bankReference={bankSubmission?.reference_number || bankSubmission?.reference}
      bankReceiptSignedUrl={bankReceiptSignedUrl}
      bankReceiptFilename={bankSubmission?.receipt_filename}
      bankSubmittedAt={bankSubmission?.submitted_at}
      evidenceAttachments={evidenceAttachments}
      clarificationCategory={clarData?.category}
      clarificationMessage={clarData?.message}
      blockTimeDetails={blockTimeDetails}
    />
  )
}
