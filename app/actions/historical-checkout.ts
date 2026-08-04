'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { type AircraftReadings, validateAircraftReadings } from '@/lib/aircraft-readings'
import { getLastFinalizedLogStop, upsertAircraftFlightLogRecord } from '@/lib/aircraft-flight-log'
import { emitClearanceUpdated, emitOpsChanged } from '@/lib/realtime/emit'

type HistoricalCheckoutOutcome = 'cleared_to_fly' | 'additional_checkout_required' | 'not_currently_eligible'

type BaseInput = {
  customerId: string
  checkoutDate: string
  checkoutOutcome: HistoricalCheckoutOutcome
  adminNotes?: string | null
  acknowledgeActiveCheckout?: boolean
}

type LinkExistingLogInput = BaseInput & {
  logMode: 'link_existing'
  linkedFlightLogId: string
}

type CreateNewLogInput = BaseInput & {
  logMode: 'create_new'
  aircraftId: string
  picName: string
  picArn?: string | null
  readings: AircraftReadings
}

type NoLogInput = BaseInput & {
  logMode: 'none'
}

type RecordHistoricalCheckoutInput = LinkExistingLogInput | CreateNewLogInput | NoLogInput

const ACTIVE_CHECKOUT_BOOKING_STATUSES = [
  'checkout_requested',
  'checkout_confirmed',
  'checkout_completed_under_review',
  'checkout_payment_required',
] as const

const INACTIVE_CHECKOUT_LIFECYCLE_STATUSES = [
  'cancelled_by_customer',
  'cancelled_by_admin',
  'customer_cancelled',
  'admin_cancelled',
  'completed',
  'expired',
  'rejected',
] as const

function requireNumber(value: number | null | undefined, label: string): number {
  if (value == null || !Number.isFinite(value)) {
    throw new Error(`VALIDATION: ${label} is required.`)
  }
  return value
}

function validateHistoricalMeter(readings: AircraftReadings, key: 'vdo' | 'tacho' | 'air_switch' | 'mr') {
  const pretty = key === 'air_switch' ? 'Airswitch' : key.toUpperCase()
  const start = requireNumber(readings[`${key}_start`], `${pretty} start`) as number
  const stop = requireNumber(readings[`${key}_stop`], `${pretty} stop`) as number
  const total = Math.round((stop - start) * 10) / 10

  if (stop < start) {
    throw new Error(`VALIDATION: ${pretty} stop cannot be less than start.`)
  }
  if (total <= 0) {
    throw new Error(`VALIDATION: ${pretty} total must be greater than 0 for historical checkout logs.`)
  }
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') throw new Error('Forbidden')
  return {
    supabase,
    adminId: user.id,
    adminName: profile.full_name ?? null,
    adminEmail: profile.email ?? null,
  }
}

export async function recordHistoricalCheckoutCompletion(input: RecordHistoricalCheckoutInput) {
  const { supabase, adminId, adminName, adminEmail } = await requireAdmin()

  if (!input.customerId) throw new Error('VALIDATION: Customer is required.')
  if (!input.checkoutDate) throw new Error('VALIDATION: Checkout completion date is required.')
  if (!input.checkoutOutcome) throw new Error('VALIDATION: Checkout outcome is required.')

  const today = new Date().toISOString().slice(0, 10)
  if (input.checkoutDate > today) {
    throw new Error('VALIDATION: Historical checkout date cannot be in the future.')
  }

  const { data: customerProfile } = await supabase
    .from('profiles')
    .select('id, role, pilot_clearance_status, full_name')
    .eq('id', input.customerId)
    .single()

  if (!customerProfile || customerProfile.role !== 'customer') {
    throw new Error('VALIDATION: Customer does not exist.')
  }

  if (customerProfile.pilot_clearance_status === 'cleared_to_fly') {
    throw new Error('VALIDATION: Customer is already cleared to fly.')
  }

  const { data: existingRecord } = await supabase
    .from('historical_checkout_completions')
    .select('id')
    .eq('customer_id', input.customerId)
    .eq('is_active', true)
    .maybeSingle()

  if (existingRecord?.id) {
    throw new Error('VALIDATION: An active historical checkout record already exists for this customer.')
  }

  const { data: activeCheckout } = await supabase
    .from('bookings')
    .select('id, status, checkout_lifecycle_status')
    .eq('booking_owner_user_id', input.customerId)
    .eq('booking_type', 'checkout')
    .in('status', [...ACTIVE_CHECKOUT_BOOKING_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const isTrulyActiveCheckout =
    Boolean(activeCheckout?.id) &&
    !INACTIVE_CHECKOUT_LIFECYCLE_STATUSES.includes((activeCheckout?.checkout_lifecycle_status ?? '') as (typeof INACTIVE_CHECKOUT_LIFECYCLE_STATUSES)[number])

  if (isTrulyActiveCheckout && !input.acknowledgeActiveCheckout) {
    throw new Error('VALIDATION: Customer already has an active checkout record. Confirm this action to continue.')
  }

  let linkedFlightLogId: string | null = null
  let createdFlightLog = false

  if (input.logMode === 'link_existing') {
    if (!input.linkedFlightLogId) throw new Error('VALIDATION: Select an aircraft flight log to link.')

    const { data: linkedLog } = await supabase
      .from('aircraft_flight_logs')
      .select('id, flight_date, pic_user_id')
      .eq('id', input.linkedFlightLogId)
      .maybeSingle()

    if (!linkedLog) throw new Error('VALIDATION: Selected aircraft flight log was not found.')

    if (linkedLog.flight_date !== input.checkoutDate) {
      throw new Error('VALIDATION: Linked flight log date must match the checkout completion date.')
    }

    if (linkedLog.pic_user_id && linkedLog.pic_user_id !== input.customerId) {
      throw new Error('VALIDATION: Selected flight log belongs to a different customer/PIC.')
    }

    linkedFlightLogId = linkedLog.id
  }

  if (input.logMode === 'create_new') {
    if (!input.aircraftId) throw new Error('VALIDATION: Aircraft is required.')
    if (!input.picName?.trim()) throw new Error('VALIDATION: PIC name is required.')

    validateAircraftReadings(input.readings)
    validateHistoricalMeter(input.readings, 'vdo')
    validateHistoricalMeter(input.readings, 'tacho')
    validateHistoricalMeter(input.readings, 'air_switch')
    validateHistoricalMeter(input.readings, 'mr')

    const created = await upsertAircraftFlightLogRecord({
      aircraft_id: input.aircraftId,
      flight_date: input.checkoutDate,
      pic_user_id: input.customerId,
      pic_name: input.picName.trim(),
      pic_arn: input.picArn?.trim() || null,
      readings: input.readings,
      source: 'checkout_completion',
      review_status: 'admin_confirmed',
      created_by: adminId,
      updated_by: adminId,
    })

    linkedFlightLogId = created.row.id
    createdFlightLog = true
  }

  const { data: createdRecord, error: historicalErr } = await supabase
    .from('historical_checkout_completions')
    .insert({
      customer_id: input.customerId,
      checkout_date: input.checkoutDate,
      checkout_outcome: input.checkoutOutcome,
      admin_notes: input.adminNotes?.trim() || null,
      recorded_by_admin_id: adminId,
      linked_aircraft_flight_log_id: linkedFlightLogId,
      created_flight_log: createdFlightLog,
      source: 'historical_admin',
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (historicalErr || !createdRecord) {
    throw new Error(historicalErr?.message ?? 'Failed to record historical checkout completion.')
  }

  const nowIso = new Date().toISOString()
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      pilot_clearance_status: input.checkoutOutcome,
      updated_at: nowIso,
    })
    .eq('id', input.customerId)

  if (profileErr) throw new Error(profileErr.message)

  const actor = adminName || adminEmail || 'Admin'
  const logSummary = input.logMode === 'create_new'
    ? `created new log ${linkedFlightLogId}`
    : input.logMode === 'link_existing'
    ? `linked existing log ${linkedFlightLogId}`
    : 'no aircraft log linked'

  await supabase
    .from('verification_events')
    .insert({
      user_id: input.customerId,
      actor_user_id: adminId,
      actor_role: 'admin',
      event_type: 'message',
      title: 'Historical checkout recorded',
      body: `${actor} recorded a pre-portal checkout on ${input.checkoutDate} with outcome ${input.checkoutOutcome.replace(/_/g, ' ')} (${logSummary}).`,
      email_status: 'skipped',
      is_read: true,
      created_at: nowIso,
    })

  revalidatePath(`/admin/users/${input.customerId}`)
  revalidatePath('/admin/customers')
  revalidatePath('/admin/customers/all')
  revalidatePath('/admin/customers/ledger')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard/documents')

  void emitClearanceUpdated(input.customerId)
  void emitOpsChanged()

  return { ok: true, historicalCheckoutId: createdRecord.id }
}

export async function getHistoricalCheckoutLogBaseline(aircraftId: string) {
  await requireAdmin()
  if (!aircraftId) throw new Error('VALIDATION: Aircraft is required.')
  return (await getLastFinalizedLogStop(aircraftId)) ?? {
    vdo_start: 0,
    tacho_start: 0,
    air_switch_start: 0,
    mr_start: 0,
  }
}
