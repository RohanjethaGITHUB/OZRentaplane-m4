'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeActiveCheckoutTerms } from '@/lib/checkout-terms'
import {
  enqueueCheckoutRequestSubmittedAdminEmail,
  enqueueCheckoutRequestSubmittedCustomerEmail,
} from '@/lib/email/outbox'
import {
  notifyCancellationRequested,
  notifyAdminCancellationReviewRequired,
} from '@/lib/booking/notifications'
import { checkAircraftAvailability } from '@/lib/booking/availability'
import { isNoShowLockedProfile } from '@/lib/checkout-policy'
import { isWithinDayVfrWindow } from '@/lib/utils/day-vfr'
import { validateFlightReviewDate } from '@/lib/utils/flight-review'
import { sydneyInputToUTC } from '@/lib/utils/sydney-time'
import { createPerfLogger } from '@/lib/perf/timing'
import {
  emitBookingChanged,
  emitClearanceUpdated,
  emitOpsChanged,
} from '@/lib/realtime/emit'
import type {
  CreateCheckoutBookingInput,
  CheckoutSubmitResult,
} from '@/lib/supabase/booking-types'
import type { UserDocument } from '@/lib/supabase/types'

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

function isCheckoutSelfServiceAllowed(startIsoUtc: string, now = new Date()): boolean {
  const startMs = new Date(startIsoUtc).getTime()
  if (Number.isNaN(startMs)) return false
  return now.getTime() < (startMs - TWELVE_HOURS_MS)
}

// ─── Auth guard (no verification requirement) ─────────────────────────────────
// Checkout bookings are created before the user is verified.
// We only require a valid authenticated session and a customer account.

async function requireCustomer() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name, role, pilot_clearance_status, has_night_vfr_rating, has_instrument_rating, account_status, account_lock_reason, terms_accepted_at, terms_version')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Profile not found')
  if (profile.role !== 'customer') throw new Error('Not a customer account')
  if (isNoShowLockedProfile(profile)) {
    throw new Error('ACCOUNT_BLOCKED: Your account is locked due to a checkout no-show. Please contact OZ Rent A Plane.')
  }

  return { supabase, userId: user.id, profile }
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') throw new Error('Forbidden')
  return { supabase, adminId: user.id }
}

export type CheckoutDocumentGateState = {
  documents: UserDocument[]
  termsAcceptedAt: string | null
  termsVersion: string | null
  lastFlightDate: string | null
  hasNightVfrRating: boolean | null
  pilotLicenceDoc: UserDocument | null
}

const CUSTOMER_MODIFIABLE_CHECKOUT_STATUSES = ['checkout_requested', 'checkout_confirmed'] as const

function deriveLifecycleFromBookingStatus(status: string) {
  if (status === 'checkout_requested') return 'requested'
  if (status === 'checkout_confirmed') return 'scheduled'
  if (status === 'checkout_completed_under_review' || status === 'checkout_payment_required' || status === 'completed') {
    return 'completed'
  }
  return 'scheduled'
}

function getSydneyDateAndTime(isoUtc: string): { date: string; time: string } {
  const d = new Date(isoUtc)
  const date = d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const time = d.toLocaleTimeString('en-GB', {
    timeZone: 'Australia/Sydney',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return { date, time }
}

export async function canModifyCheckout(checkout: {
  booking_type?: string | null
  status?: string | null
  scheduled_start?: string | null
  checkout_lifecycle_status?: string | null
}) {
  if (!checkout || checkout.booking_type !== 'checkout') return false
  if (!checkout.status || !CUSTOMER_MODIFIABLE_CHECKOUT_STATUSES.includes(checkout.status as typeof CUSTOMER_MODIFIABLE_CHECKOUT_STATUSES[number])) {
    return false
  }
  if (!checkout.scheduled_start) return false
  if (!isCheckoutSelfServiceAllowed(checkout.scheduled_start, new Date())) return false
  if (checkout.checkout_lifecycle_status === 'cancelled_by_customer' || checkout.checkout_lifecycle_status === 'cancelled_by_admin' || checkout.checkout_lifecycle_status === 'completed') {
    return false
  }
  return true
}

export async function getCheckoutDocumentGateState(): Promise<
  { ok: true; state: CheckoutDocumentGateState } | { ok: false; error: string }
> {
  try {
    const { supabase, userId } = await requireCustomer()

    const [documentsRes, profileRes] = await Promise.all([
      supabase
        .from('user_documents')
        .select('*, user_document_files(id, file_name, storage_path, uploaded_at)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('terms_accepted_at, terms_version, last_flight_date, has_night_vfr_rating')
        .eq('id', userId)
        .single(),
    ])

    if (documentsRes.error) {
      return { ok: false, error: 'Unable to verify your documents right now. Please try again.' }
    }
    if (profileRes.error) {
      return { ok: false, error: 'Unable to verify your terms acceptance right now. Please try again.' }
    }

    const allDocs = (documentsRes.data ?? []) as UserDocument[]
    const pilotLicenceDoc = allDocs.find(d => d.document_type === 'pilot_licence') ?? null

    return {
      ok: true,
      state: {
        documents: allDocs,
        termsAcceptedAt: profileRes.data?.terms_accepted_at ?? null,
        termsVersion: profileRes.data?.terms_version ?? null,
        lastFlightDate: profileRes.data?.last_flight_date ?? null,
        hasNightVfrRating: profileRes.data?.has_night_vfr_rating ?? null,
        pilotLicenceDoc,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { ok: false, error: message }
  }
}

// ─── Submit checkout request ──────────────────────────────────────────────────
// Creates a checkout booking and sets pilot_clearance_status = checkout_requested.
//
// Server-side validation before calling the RPC:
//   1. Required documents (pilot_licence, medical_certificate, photo_id) must
//      be approved by the customer documents team.
//   2. Time range must be valid and in the future.
//
// The RPC (create_checkout_booking_atomic) then enforces at the database layer:
//   • Clearance status allows a new checkout request
//   • No currently active checkout booking exists
//   • Aircraft is available
//   • No schedule block conflicts

export async function submitCheckoutRequest(
  input: CreateCheckoutBookingInput,
): Promise<CheckoutSubmitResult> {
  const perf = createPerfLogger({ route: 'server_action:submitCheckoutRequest', role: 'customer' })
  const markTotal = perf.start('checkout_submit', 'checkout_submit_total')
  const h = await headers()
  const routeName = 'checkout-submit'

  let supabase: Awaited<ReturnType<typeof createClient>>
  let userId = ''
  let profile: Awaited<ReturnType<typeof requireCustomer>>['profile']
  try {
    const authCtx = await perf.time('checkout_submit', 'checkout_submit_auth', () => requireCustomer())
    supabase = authCtx.supabase
    userId = authCtx.userId
    profile = authCtx.profile
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown auth error'
    const lower = message.toLowerCase()
    const isAuthError = lower.includes('unauthorized') || lower.includes('not authenticated') || lower.includes('invalid jwt')
    const isAccountBlocked = message.startsWith('ACCOUNT_BLOCKED:')
    console.error(`[${routeName}] auth guard failed`, { message })
    markTotal()
    if (isAccountBlocked) {
      return {
        ok: false,
        type: 'account_blocked',
        message: message.replace(/^ACCOUNT_BLOCKED:\s*/i, ''),
      }
    }
    if (isAuthError) {
      return {
        ok: false,
        type: 'auth',
        message: 'Your session has expired. Please sign in again, then resubmit your checkout request.',
      }
    }
    return { ok: false, type: 'error', message: 'We could not verify your session. Please try again.' }
  }
  const ACCEPTANCE_TEXT = 'I have read and accept the Checkout Terms and Conditions.'
  const profileRecord = profile as Record<string, unknown>
  const safeEmail = typeof profileRecord.email === 'string' ? profileRecord.email : null
  try {
    perf.timeSync('checkout_submit', 'checkout_submit_profile_authorization', () => null)

  // ── Document gate ──────────────────────────────────────────────────────────
  // Validates all required document fields per document type.
  const [documentsRes, termsPrimary] = await Promise.all([
    perf.time(
      'checkout_submit',
      'checkout_submit_documents_read',
      () => supabase
        .from('user_documents')
        .select('document_type, status, expiry_date, issue_date, licence_type, licence_number, medical_class, id_type, document_number')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      (result) => ({ rowCount: result.data?.length ?? 0 }),
    ),
    perf.time(
      'checkout_submit',
      'checkout_submit_terms_read',
      () => supabase
        .from('terms_documents')
        .select('*')
        .eq('is_active', true)
        .order('effective_from', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      (result) => ({ rowCount: result.data ? 1 : 0 }),
    ),
  ])
  const { data: docs, error: docsErr } = documentsRes

  if (docsErr) {
    console.error(`[${routeName}] user_documents query failed`, {
      code: docsErr.code,
      message: docsErr.message,
    })
    markTotal()
    return { ok: false, type: 'validation', message: 'Unable to verify your documents. Please try again.' }
  }

  const today = new Date().toISOString().split('T')[0]!
  const docsByType = new Map<string, typeof docs[number]>()
  for (const d of (docs ?? [])) {
    if (!docsByType.has(d.document_type)) docsByType.set(d.document_type, d)
  }
  const docMap: Record<string, typeof docs[0]> = {}

  // The user_documents query is ordered newest-first, so the first row for each
  // document type is the current effective document.
  for (const d of (docs ?? [])) {
    if (!docMap[d.document_type]) {
      docMap[d.document_type] = d
    }
  }

  const missing: string[] = []

  const requiredDocLabels: Record<string, string> = {
    pilot_licence: 'Pilot Licence',
    medical_certificate: 'Medical Certificate',
    photo_id: 'Photo ID',
  }

  for (const type of ['pilot_licence', 'medical_certificate', 'photo_id'] as const) {
    const doc = docMap[type]
    if (!doc || doc.status === 'rejected') {
      missing.push(requiredDocLabels[type])
    }
  }

  // Flight review date — required and must be within the last 2 years
  if (!input.last_flight_date) {
    missing.push('last flight review date')
  } else {
    const flightReviewErr = validateFlightReviewDate(input.last_flight_date)
    if (flightReviewErr) return { ok: false, type: 'validation', message: flightReviewErr }
  }

  // Night VFR: use the form selection (not just the stored profile value),
  // then verify against the profile to ensure evidence has been uploaded.
  if (input.has_night_vfr === null) {
    return {
      ok: false,
      type: 'validation',
      message: 'Please confirm your Night VFR rating status before submitting a checkout request.',
    }
  }

  // Night VFR gate: require at least one valid night_vfr_evidence document.
  if (input.has_night_vfr === true) {
    const nightVfrEvidence = docMap['night_vfr_evidence']
    const hasValidEvidence =
      !!nightVfrEvidence &&
      nightVfrEvidence.status !== 'rejected' &&
      !(nightVfrEvidence.expiry_date && nightVfrEvidence.expiry_date < today)
    if (!hasValidEvidence) {
      return { ok: false, type: 'validation', message: 'Please upload Night VFR before requesting a night checkout.' }
    }
  }

  // Day VFR window check — only applied when Night VFR is not confirmed.
  if (input.has_night_vfr !== true) {
    if (!isWithinDayVfrWindow(input.scheduled_time_sydney, input.scheduled_date_sydney, 120)) {
      return {
        ok: false,
        type: 'validation',
        message: 'Checkout bookings reserve a 2-hour window and must fit within the allowed flight window.',
      }
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      type: 'validation',
      message: "Please upload all required documents before submitting. Documents don't need to be approved first — our team will review them alongside your request.",
    }
  }

  let activeTermsRow: Record<string, unknown> | null = (termsPrimary.data as Record<string, unknown> | null)
  if (!activeTermsRow) {
    activeTermsRow = await perf.time(
      'checkout_submit',
      'checkout_submit_terms_read',
      async () => ((await supabase
        .from('terms_documents')
        .select('*')
        .order('effective_from', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()).data as Record<string, unknown> | null),
      (result) => ({ rowCount: result ? 1 : 0 }),
    )
    if (!activeTermsRow) {
      // RLS-safe fallback: use service role for authoritative active terms lookup.
      const admin = createAdminClient()
      const adminPrimary = await perf.time(
        'checkout_submit',
        'checkout_submit_terms_read',
        () => admin
          .from('terms_documents')
          .select('*')
          .eq('is_active', true)
          .order('effective_from', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
        (result) => ({ rowCount: result.data ? 1 : 0 }),
      )
      activeTermsRow = (adminPrimary.data as Record<string, unknown> | null)
        ?? (await admin
          .from('terms_documents')
          .select('*')
          .order('effective_from', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()).data as Record<string, unknown> | null
    }
  }
  const normalizedTerms = normalizeActiveCheckoutTerms(activeTermsRow)
  if (!normalizedTerms) {
    return { ok: false, type: 'validation', message: 'No active checkout terms document is available right now. Please try again.' }
  }
  const activeTermsId = normalizedTerms.id
  const activeTermsVersion = normalizedTerms.version
  const activeTermsUrl = normalizedTerms.public_url
  const activeTermsHash = normalizedTerms.content_hash
  if (!profile.terms_accepted_at) {
    return {
      ok: false,
      type: 'validation',
      message: 'Please accept the terms and conditions on your Documents page before requesting a checkout flight.',
    }
  }

  // ── Time validation ────────────────────────────────────────────────────────
  const start = new Date(input.scheduled_start)
  if (isNaN(start.getTime())) {
    return { ok: false, type: 'validation', message: 'Invalid start time.' }
  }
  if (start <= new Date()) {
    return { ok: false, type: 'validation', message: 'Checkout flight time must be in the future.' }
  }

  // Idempotent recovery: if this user already has this exact checkout slot, return it.
  // This avoids duplicate submit races presenting as availability failures.
  const { data: existingExact } = await perf.time('checkout_submit', 'checkout_submit_availability_read', () => supabase
      .from('bookings')
      .select('id, booking_reference, scheduled_start, scheduled_end')
      .eq('booking_owner_user_id', userId)
      .eq('booking_type', 'checkout')
      .eq('aircraft_id', input.aircraft_id)
      .eq('scheduled_start', input.scheduled_start)
      .in('status', ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    (result) => ({ rowCount: result.data ? 1 : 0 }),
  )
  if (existingExact) {
    perf.timeSync('checkout_submit', 'checkout_submit_response_ready', () => null)
    markTotal()
    return {
      ok: true,
      type: 'already_exists',
      message: 'Your checkout request has already been submitted.',
      bookingId: existingExact.id,
      bookingReference: existingExact.booking_reference,
      scheduledStart: existingExact.scheduled_start,
      scheduledEnd: existingExact.scheduled_end,
    }
  }

  // p_scheduled_end is not passed — the RPC computes it as start + 2 hours
  const requestedEnd = new Date(start.getTime() + 2 * 60 * 60 * 1000)

  const [blockingBookingsRes, blockingBlocksRes] = await perf.time('checkout_submit', 'checkout_submit_availability_read', () => Promise.all([
      supabase
        .from('bookings')
        .select('id, status, booking_type, scheduled_start, scheduled_end, aircraft_id, booking_owner_user_id')
        .eq('aircraft_id', input.aircraft_id)
        .lt('scheduled_start', requestedEnd.toISOString())
        .gt('scheduled_end', start.toISOString())
        .order('scheduled_start', { ascending: true }),
      supabase
        .from('schedule_blocks')
        .select('id, related_booking_id, block_type, status, start_time, end_time, expires_at')
        .eq('aircraft_id', input.aircraft_id)
        .eq('status', 'active')
        .lt('start_time', requestedEnd.toISOString())
        .gt('end_time', start.toISOString())
        .order('start_time', { ascending: true }),
    ]),
    ([bookings, blocks]) => ({ rowCount: (bookings.data?.length ?? 0) + (blocks.data?.length ?? 0) }),
  )

  const nowIso = new Date().toISOString()
  const blockingBlocks = (blockingBlocksRes.data ?? []).filter((b) => {
    if (b.block_type !== 'temporary_hold') return true
    if (!b.expires_at) return true
    return b.expires_at > nowIso
  })
  const { data, error } = await perf.time('checkout_submit', 'checkout_submit_rpc_write', () => supabase.rpc('create_checkout_booking_atomic', {
    p_aircraft_id:     input.aircraft_id,
    p_scheduled_start: input.scheduled_start,
    p_customer_notes:  input.customer_notes ?? null,
  }), (result) => ({ rowCount: result.data ? 1 : 0 }))

  if (error) {
    console.error(`[${routeName}] RPC create_checkout_booking_atomic failed`, {
      code: error.code,
      message: error.message,
    })
    const rawMsg = error.message ?? ''
    const lower = rawMsg.toLowerCase()
    // Prefix known RPC messages that are missing VALIDATION:/AVAILABILITY: so the
    // client can route them to a user-friendly message instead of the generic fallback.
    if (lower.includes('already have an active checkout booking')) {
      const { data: activeExisting } = await supabase
        .from('bookings')
        .select('id, booking_reference, scheduled_start, scheduled_end')
        .eq('booking_owner_user_id', userId)
        .eq('booking_type', 'checkout')
        .in('status', ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (activeExisting) {
        return {
          ok: true,
          type: 'already_exists',
          message: 'Your checkout request has already been submitted.',
          bookingId: activeExisting.id,
          bookingReference: activeExisting.booking_reference,
          scheduledStart: activeExisting.scheduled_start,
          scheduledEnd: activeExisting.scheduled_end,
        }
      }
      return {
        ok: false,
        type: 'validation',
        message: 'You already have an active checkout request or your account is not currently eligible to submit a new one.',
      }
    }
    if (lower.includes('no longer available') || lower.includes('schedule block')) {
      return {
        ok: false,
        type: 'availability',
        message: 'This checkout time is no longer available. Please go back and choose another time.',
      }
    }
    if (lower.includes('checkout start time must be in the future')) {
      return { ok: false, type: 'validation', message: 'Checkout flight time must be in the future.' }
    }
    if (lower.includes('aircraft not found')) {
      return { ok: false, type: 'validation', message: 'Selected aircraft is not available. Please refresh and try again.' }
    }
    if (lower.includes('not authenticated') || lower.includes('unauthorized')) {
      return {
        ok: false,
        type: 'auth',
        message: 'Your session has expired. Please sign in again, then resubmit your checkout request.',
      }
    }
    return { ok: false, type: 'error', message: rawMsg || 'Checkout submission failed.' }
  }

  const rpcRow = Array.isArray(data) ? data[0] : data
  const result = rpcRow as {
    booking_id:        string
    booking_reference: string
    scheduled_start:   string
    scheduled_end:     string
    status:            string
    estimated_hours:   number
    estimated_amount:  number
  }
  const bookingId = typeof result?.booking_id === 'string' ? result.booking_id : ''
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId)
  if (!isUuid) {
    console.error('[submitCheckoutRequest] RPC returned invalid booking_id shape:', {
      data,
      parsed: result,
    })
    return {
      ok: false,
      type: 'validation',
      message: 'Checkout request could not be created due to an invalid server response. Please try again.',
    }
  }


  const forwardedFor = h.get('x-forwarded-for')
  const acceptedIp =
    forwardedFor?.split(',')[0]?.trim() ||
    h.get('x-real-ip')?.trim() ||
    h.get('cf-connecting-ip')?.trim() ||
    null
  const userAgent = h.get('user-agent') ?? null

  const admin = createAdminClient()
  const acceptancePayload = {
    user_id: userId,
    booking_id: null,
    checkout_request_id: bookingId,
    terms_document_id: activeTermsId,
    terms_version: profile.terms_version || activeTermsVersion,
    terms_document_url: activeTermsUrl,
    terms_content_hash: activeTermsHash || null,
    acceptance_text: ACCEPTANCE_TEXT,
    accepted_at: profile.terms_accepted_at,
    accepted_ip: acceptedIp,
    user_agent: userAgent,
  }

  const { error: termsErr } = await perf.time('checkout_submit', 'checkout_submit_terms_acceptance_write', () => admin
    .from('booking_terms_acceptances')
    .insert(acceptancePayload))
  if (termsErr) {
    console.error(`[${routeName}] booking_terms_acceptances insert failed`, {
      message: termsErr.message,
      code: termsErr.code,
    })
    const rollback: {
      attempted: boolean
      blocks_deleted: number | null
      booking_deleted: boolean
      profile_restored: boolean
      error: string | null
      skipped_cleanup_reason: string | null
    } = {
      attempted: true,
      blocks_deleted: null,
      booking_deleted: false,
      profile_restored: false,
      error: null,
      skipped_cleanup_reason: null,
    }

    try {
      console.info(`[${routeName}] rollback started`, {
        reason: 'terms_acceptance_insert_failed',
      })
      if (!isUuid) {
        rollback.skipped_cleanup_reason = 'booking_id missing/invalid; cleanup not attempted'
      } else {
        const { count: deletedBlocks, error: blocksErr } = await admin
          .from('schedule_blocks')
          .delete({ count: 'exact' })
          .eq('related_booking_id', bookingId)
        if (blocksErr) throw new Error(`schedule_blocks cleanup failed: ${blocksErr.message}`)
        rollback.blocks_deleted = deletedBlocks ?? 0

        const { error: bookingDeleteErr } = await admin
          .from('bookings')
          .delete()
          .eq('id', bookingId)
          .eq('booking_owner_user_id', userId)
          .eq('booking_type', 'checkout')
          .eq('status', 'checkout_requested')
        if (bookingDeleteErr) throw new Error(`booking cleanup failed: ${bookingDeleteErr.message}`)
        rollback.booking_deleted = true

        const previousClearance = profile.pilot_clearance_status
        if (previousClearance && previousClearance !== 'checkout_requested') {
          const { error: profileRestoreErr } = await admin
            .from('profiles')
            .update({ pilot_clearance_status: previousClearance, updated_at: new Date().toISOString() })
            .eq('id', userId)
          if (profileRestoreErr) throw new Error(`profile restore failed: ${profileRestoreErr.message}`)
          rollback.profile_restored = true
        }
      }
      console.info(`[${routeName}] rollback result`, {
        rollback,
      })
    } catch (rollbackErr) {
      rollback.error = rollbackErr instanceof Error ? rollbackErr.message : 'unknown rollback error'
      console.error(`[${routeName}] rollback failed after terms insert error`, {
        rollback,
      })
    }

    const isSchemaCacheError =
      termsErr.code === 'PGRST204' &&
      (termsErr.message?.includes("'terms_content_hash' column") || termsErr.message?.includes('schema cache'))

    if (process.env.NODE_ENV !== 'production') {
      if (isSchemaCacheError) {
        return {
          ok: false,
          type: 'validation',
          message: `Unable to record your terms acceptance. Schema cache mismatch for booking_terms_acceptances. Apply migration 059/061 and run: notify pgrst, 'reload schema'. DB error: ${termsErr.message}.`,
        }
      }
      return {
        ok: false,
        type: 'validation',
        message:
        `Unable to record your terms acceptance. DB error: ${termsErr.message}${termsErr.code ? ` (code ${termsErr.code})` : ''}. Rollback: ${JSON.stringify(rollback)}`
      }
    }
    markTotal()
    return { ok: false, type: 'validation', message: 'Unable to record your terms acceptance. Please try again.' }
  }

  // Save last_flight_date to both the booking and the profile so the Documents
  // page stays in sync with the most recently submitted checkout date.
  if (input.last_flight_date) {
    const [bookingUpdate, profileUpdate] = await Promise.all([
      supabase
        .from('bookings')
        .update({ last_flight_date: input.last_flight_date })
        .eq('id', bookingId),
      supabase
        .from('profiles')
        .update({ last_flight_date: input.last_flight_date })
        .eq('id', userId),
    ])
    if (bookingUpdate.error || profileUpdate.error) {
      console.error(`[${routeName}] last_flight_date update issue`, {
        booking_update_error: bookingUpdate.error
          ? {
            code: bookingUpdate.error.code,
            message: bookingUpdate.error.message,
          }
          : null,
        profile_update_error: profileUpdate.error
          ? {
            code: profileUpdate.error.code,
            message: profileUpdate.error.message,
          }
          : null,
      })
    }
  }

  // Notify customer — non-fatal
  const { error: notifErr } = await perf.time('checkout_submit', 'checkout_submit_notification_write', () => supabase.from('verification_events').insert({
    user_id:      userId,
    actor_role:   'customer',
    event_type:   'submitted',
    title:        'Checkout request submitted',
    body:         'Your checkout request has been submitted for review. You will be notified once a decision has been made.',
    is_read:      false,
    email_status: 'skipped',
  }))
  if (notifErr) console.error('[submitCheckoutRequest] notification failed:', notifErr.message)

  if (safeEmail) {
    const emailPayload = perf.timeSync('checkout_submit', 'checkout_submit_customer_email_enqueue', () => ({
      customerEmail: safeEmail,
      customerName: profile.full_name ?? 'Pilot',
      bookingId,
      requestedTime: new Date(result.scheduled_start).toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney',
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    }))
    await Promise.all([
      perf.time(
        'checkout_submit',
        'checkout_submit_customer_email_enqueue',
        () => enqueueCheckoutRequestSubmittedCustomerEmail(emailPayload),
      ),
      perf.time(
        'checkout_submit',
        'checkout_submit_admin_email_enqueue',
        () => enqueueCheckoutRequestSubmittedAdminEmail(emailPayload),
      ),
    ])
  }

  perf.timeSync('checkout_submit', 'checkout_submit_revalidation', () => {
    revalidatePath('/dashboard')
    revalidatePath('/admin')
    revalidatePath('/admin/checkouts')
    revalidatePath('/admin/checkouts/all')
  })

  void emitBookingChanged({ bookingId, userId })
  void emitClearanceUpdated(userId)
  void emitOpsChanged()

  perf.timeSync('checkout_submit', 'checkout_submit_response_ready', () => null)
  markTotal()
  return {
    ok: true,
    type: 'success',
    message: 'Checkout request submitted successfully.',
    bookingId,
    bookingReference: result.booking_reference,
    scheduledStart:   result.scheduled_start,
    scheduledEnd:     result.scheduled_end,
  }
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown checkout submission error')
    const lower = err.message.toLowerCase()
    if (lower.includes('unauthorized') || lower.includes('not authenticated') || lower.includes('invalid jwt')) {
      markTotal()
      return {
        ok: false,
        type: 'auth',
        message: 'Your session has expired. Please sign in again, then resubmit your checkout request.',
      }
    }
    console.error(`[${routeName}] submit failed`, {
      auth_user_exists: true,
      message: err.message,
    })
    markTotal()
    return {
      ok: false,
      type: 'error',
      message: "We couldn't submit your checkout request. Please try again or contact support.",
    }
  }
}

// ─── Get checkout booking for current user ────────────────────────────────────
// Returns the user's active checkout booking (if any) for display in the UI.

export async function getMyCheckoutBooking() {
  const { supabase, userId } = await requireCustomer()

  const { data } = await supabase
    .from('bookings')
    .select('id, booking_reference, scheduled_start, scheduled_end, status, booking_type, created_at')
    .eq('booking_owner_user_id', userId)
    .eq('booking_type', 'checkout')
    .in('status', ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return data ?? null
}

export async function cancelCheckoutRequest(checkoutId: string): Promise<void> {
  const { supabase, userId } = await requireCustomer()
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, booking_type, scheduled_start, scheduled_end, aircraft_id, checkout_lifecycle_status')
    .eq('id', checkoutId)
    .eq('booking_owner_user_id', userId)
    .single()

  if (fetchErr || !booking) throw new Error('Checkout request not found.')
  if (!(await canModifyCheckout(booking))) {
    throw new Error('VALIDATION: Self-service cancellation is only available when checkout is more than 12 hours away.')
  }

  const { error: changeErr } = await supabase.from('checkout_change_requests').insert({
    checkout_request_id: booking.id,
    customer_id: userId,
    request_type: 'cancel',
    status: 'approved',
    original_scheduled_start: booking.scheduled_start,
    original_scheduled_end: booking.scheduled_end,
  })
  if (changeErr) throw new Error(`Failed to record cancellation request: ${changeErr.message}`)

  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancellation_category: 'customer',
      cancellation_reason: 'Cancelled by customer before checkout start.',
      checkout_lifecycle_status: 'cancelled_by_customer',
      updated_at: now,
    })
    .eq('id', checkoutId)
  if (bookingErr) throw new Error('Failed to cancel checkout request.')

  const { error: blockErr } = await admin
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', checkoutId)
    .eq('status', 'active')
  if (blockErr) throw new Error('Failed to release checkout slot.')

  await admin
    .from('checkout_change_requests')
    .update({
      status: 'cancelled',
      admin_note: 'Superseded by customer checkout cancellation.',
      reviewed_by: userId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('checkout_request_id', checkoutId)
    .eq('request_type', 'reschedule')
    .eq('status', 'pending')

  await supabase
    .from('profiles')
    .update({ pilot_clearance_status: 'checkout_required', updated_at: now })
    .eq('id', userId)

  await supabase.from('booking_status_history').insert({
    booking_id: checkoutId,
    old_status: booking.status,
    new_status: 'cancelled',
    changed_by_user_id: userId,
    note: 'Checkout cancelled by customer before start time.',
  })

  await supabase.from('booking_audit_events').insert({
    booking_id: checkoutId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: userId,
    actor_role: 'customer',
    event_type: 'checkout_cancelled_by_customer',
    event_summary: 'Customer cancelled checkout before start time.',
    new_value: { status: 'cancelled', checkout_lifecycle_status: 'cancelled_by_customer' },
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/checkout')
  revalidatePath('/dashboard/bookings')
  revalidatePath('/admin')
  revalidatePath('/admin/bookings/checkout')
  revalidatePath('/admin/checkouts/cancel-reschedule')
  revalidatePath('/admin/checkouts/reschedule')
  revalidatePath('/admin/checkouts/cancelled')

  void emitBookingChanged({ bookingId: checkoutId, userId })
  void emitClearanceUpdated(userId)
  void emitOpsChanged()
}

/**
 * Late checkout cancellation (≤12 hours before start).
 * Mirrors standard rental late cancel: creates a pending review request and
 * moves the booking to `cancellation_requested`. Slot is held until admin
 * waives or applies a charge.
 */
export async function requestLateCheckoutCancellation(
  checkoutId: string,
  customerMessage: string | null,
): Promise<void> {
  const { supabase, userId } = await requireCustomer()
  const now = new Date()

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, booking_type, scheduled_start, scheduled_end, aircraft_id, checkout_lifecycle_status')
    .eq('id', checkoutId)
    .eq('booking_owner_user_id', userId)
    .single()

  if (fetchErr || !booking) throw new Error('Checkout request not found.')
  if (booking.booking_type !== 'checkout') {
    throw new Error('VALIDATION: Only checkout bookings can use this cancellation path.')
  }
  if (!['checkout_requested', 'checkout_confirmed'].includes(booking.status)) {
    throw new Error(`VALIDATION: Checkout cannot be cancelled from status "${booking.status}".`)
  }
  if (!booking.scheduled_start || isCheckoutSelfServiceAllowed(booking.scheduled_start, now)) {
    throw new Error(
      'VALIDATION: Checkout is more than 12 hours away. Use self-service cancellation instead.',
    )
  }

  const { data: existingRequest } = await supabase
    .from('booking_cancellation_requests')
    .select('id')
    .eq('booking_id', checkoutId)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingRequest) {
    throw new Error('VALIDATION: A cancellation request is already pending for this checkout.')
  }

  const oldStatus = booking.status
  const nowIso = now.toISOString()

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancellation_requested',
      updated_at: nowIso,
    })
    .eq('id', checkoutId)

  if (updateErr) throw new Error('Failed to submit cancellation request.')

  await supabase.from('booking_cancellation_requests').insert({
    booking_id: checkoutId,
    user_id: userId,
    booking_start_time: booking.scheduled_start,
    is_within_24_hours: true,
    customer_message: customerMessage?.trim() || null,
    status: 'pending',
  })

  await supabase.from('checkout_change_requests').insert({
    checkout_request_id: booking.id,
    customer_id: userId,
    request_type: 'cancel',
    status: 'pending',
    original_scheduled_start: booking.scheduled_start,
    original_scheduled_end: booking.scheduled_end,
    customer_note: customerMessage?.trim() || null,
  })

  const note = customerMessage?.trim()
    ? `Customer requested checkout cancellation less than 12 hours before departure. Message: "${customerMessage.trim()}"`
    : 'Customer requested checkout cancellation less than 12 hours before departure. Admin review required.'

  await supabase.from('booking_status_history').insert({
    booking_id: checkoutId,
    old_status: oldStatus,
    new_status: 'cancellation_requested',
    changed_by_user_id: userId,
    note,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id: checkoutId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: userId,
    actor_role: 'customer',
    event_type: 'cancellation_requested',
    event_summary: 'Customer requested late checkout cancellation (<12 h). Pending admin review.',
    new_value: { status: 'cancellation_requested', customer_message: customerMessage },
  })

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .single()

  if (profile?.email) {
    await notifyCancellationRequested({
      customerEmail: profile.email,
      bookingId: checkoutId,
    }).catch((error) => console.error('[requestLateCheckoutCancellation] customer email failed:', error))

    await notifyAdminCancellationReviewRequired({
      bookingId: checkoutId,
      customerName: profile.full_name ?? 'Customer',
      customerEmail: profile.email,
      reason: customerMessage ?? null,
    }).catch((error) => console.error('[requestLateCheckoutCancellation] admin email failed:', error))
  }

  revalidatePath(`/dashboard/bookings/${checkoutId}`)
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard/checkout')
  revalidatePath('/dashboard')
  revalidatePath('/admin')
  revalidatePath('/admin/bookings/cancellations')
  revalidatePath('/admin/checkouts/cancelled')
  revalidatePath(`/admin/bookings/requests/${checkoutId}`)

  void emitBookingChanged({ bookingId: checkoutId, userId })
  void emitOpsChanged()
}

export async function requestCheckoutReschedule(
  checkoutId: string,
  newDate: string,
  newTime: string,
): Promise<void> {
  const { supabase, userId } = await requireCustomer()
  const requestedStartUtc = sydneyInputToUTC(`${newDate}T${newTime}`)
  if (!requestedStartUtc) throw new Error('VALIDATION: Invalid requested checkout date/time.')
  const requestedStart = new Date(requestedStartUtc)
  if (requestedStart <= new Date()) throw new Error('VALIDATION: Requested checkout time must be in the future.')
  const requestedEndUtc = new Date(requestedStart.getTime() + 2 * 60 * 60 * 1000).toISOString()
  const { data: profile } = await supabase
    .from('profiles')
    .select('has_night_vfr_rating')
    .eq('id', userId)
    .single()
  if (profile?.has_night_vfr_rating !== true) {
    const syd = getSydneyDateAndTime(requestedStartUtc)
    if (!isWithinDayVfrWindow(syd.time, syd.date, 120)) {
      throw new Error('VALIDATION: Requested checkout time is outside the allowed Day VFR window.')
    }
  }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, booking_type, scheduled_start, scheduled_end, aircraft_id, checkout_lifecycle_status')
    .eq('id', checkoutId)
    .eq('booking_owner_user_id', userId)
    .single()

  if (fetchErr || !booking) throw new Error('Checkout request not found.')
  if (!(await canModifyCheckout(booking))) {
    throw new Error('VALIDATION: Self-service reschedule is only available when checkout is more than 12 hours away.')
  }

  const { data: existingPending } = await supabase
    .from('checkout_change_requests')
    .select('id')
    .eq('checkout_request_id', checkoutId)
    .eq('request_type', 'reschedule')
    .eq('status', 'pending')
    .maybeSingle()
  if (existingPending) throw new Error('VALIDATION: A reschedule request is already pending for this checkout.')

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('default_preflight_buffer_minutes, default_postflight_buffer_minutes')
    .eq('id', booking.aircraft_id)
    .single()

  const preBufMs = (aircraft?.default_preflight_buffer_minutes ?? 0) * 60_000
  const postBufMs = (aircraft?.default_postflight_buffer_minutes ?? 0) * 60_000
  const expandedStart = new Date(requestedStart.getTime() - preBufMs)
  const expandedEnd = new Date(new Date(requestedEndUtc).getTime() + postBufMs)

  const availability = await checkAircraftAvailability(
    supabase,
    booking.aircraft_id,
    expandedStart,
    expandedEnd,
    { excludeBookingId: checkoutId },
  )
  if (!availability.available) {
    throw new Error('AVAILABILITY: The requested checkout slot is no longer available.')
  }

  const { error: requestErr } = await supabase.from('checkout_change_requests').insert({
    checkout_request_id: booking.id,
    customer_id: userId,
    request_type: 'reschedule',
    status: 'pending',
    original_scheduled_start: booking.scheduled_start,
    original_scheduled_end: booking.scheduled_end,
    requested_scheduled_start: requestedStartUtc,
    requested_scheduled_end: requestedEndUtc,
  })
  if (requestErr) throw new Error(`Failed to submit reschedule request: ${requestErr.message}`)

  await supabase
    .from('bookings')
    .update({ checkout_lifecycle_status: 'reschedule_requested', updated_at: new Date().toISOString() })
    .eq('id', checkoutId)

  await supabase.from('booking_status_history').insert({
    booking_id: checkoutId,
    old_status: booking.status,
    new_status: booking.status,
    changed_by_user_id: userId,
    note: `Customer requested checkout reschedule to ${newDate} ${newTime} (Australia/Sydney).`,
  })

  await supabase.from('booking_audit_events').insert({
    booking_id: checkoutId,
    aircraft_id: booking.aircraft_id,
    actor_user_id: userId,
    actor_role: 'customer',
    event_type: 'checkout_reschedule_requested',
    event_summary: 'Customer requested checkout reschedule. Pending admin review.',
    new_value: {
      checkout_lifecycle_status: 'reschedule_requested',
      requested_scheduled_start: requestedStartUtc,
      requested_scheduled_end: requestedEndUtc,
    },
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/checkout')
  revalidatePath('/dashboard/bookings')
  revalidatePath('/admin')
  revalidatePath('/admin/bookings/checkout')
  revalidatePath('/admin/checkouts/cancel-reschedule')
  revalidatePath('/admin/checkouts/reschedule')
  revalidatePath('/admin/checkouts/cancelled')

  void emitBookingChanged({ bookingId: checkoutId, userId })
  void emitOpsChanged()
}

export async function approveCheckoutReschedule(changeRequestId: string): Promise<void> {
  const { adminId } = await requireAdmin()
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: reqRow, error: reqErr } = await admin
    .from('checkout_change_requests')
    .select(`
      id, checkout_request_id, customer_id, request_type, status,
      original_scheduled_start, original_scheduled_end,
      requested_scheduled_start, requested_scheduled_end,
      bookings:checkout_request_id (
        id, status, booking_type, aircraft_id, scheduled_start, scheduled_end, booking_owner_user_id, checkout_lifecycle_status
      )
    `)
    .eq('id', changeRequestId)
    .single()

  if (reqErr || !reqRow) throw new Error('Reschedule request not found.')
  if (reqRow.request_type !== 'reschedule' || reqRow.status !== 'pending') {
    throw new Error('VALIDATION: Only pending reschedule requests can be approved.')
  }

  const booking = Array.isArray(reqRow.bookings) ? reqRow.bookings[0] : reqRow.bookings
  if (!booking) throw new Error('Checkout booking not found for this request.')
  if (!(await canModifyCheckout(booking))) {
    throw new Error('VALIDATION: Checkout can no longer be modified.')
  }
  if (!reqRow.requested_scheduled_start || !reqRow.requested_scheduled_end) {
    throw new Error('VALIDATION: Requested schedule is missing.')
  }

  const { data: ownerProfile } = await admin
    .from('profiles')
    .select('has_night_vfr_rating')
    .eq('id', booking.booking_owner_user_id)
    .single()
  if (ownerProfile?.has_night_vfr_rating !== true) {
    const syd = getSydneyDateAndTime(reqRow.requested_scheduled_start)
    if (!isWithinDayVfrWindow(syd.time, syd.date, 120)) {
      throw new Error('This requested slot is no longer valid for Day VFR. Please reject the request or contact the customer.')
    }
  }

  const { data: aircraft } = await admin
    .from('aircraft')
    .select('default_preflight_buffer_minutes, default_postflight_buffer_minutes')
    .eq('id', booking.aircraft_id)
    .single()

  const requestedStart = new Date(reqRow.requested_scheduled_start)
  const requestedEnd = new Date(reqRow.requested_scheduled_end)
  const preBufMs = (aircraft?.default_preflight_buffer_minutes ?? 0) * 60_000
  const postBufMs = (aircraft?.default_postflight_buffer_minutes ?? 0) * 60_000
  const expandedStart = new Date(requestedStart.getTime() - preBufMs)
  const expandedEnd = new Date(requestedEnd.getTime() + postBufMs)

  const availability = await checkAircraftAvailability(
    admin,
    booking.aircraft_id,
    expandedStart,
    expandedEnd,
    { excludeBookingId: booking.id, includeInternalReasons: true },
  )
  if (!availability.available) {
    throw new Error('This requested slot is no longer available. Please reject the request or contact the customer.')
  }

  const { data: releasedBlocks, error: releaseErr } = await admin
    .from('schedule_blocks')
    .update({ status: 'cancelled' })
    .eq('related_booking_id', booking.id)
    .eq('status', 'active')
    .select('id')
  if (releaseErr) throw new Error('Failed to release existing checkout slot.')
  const releasedBlockIds = (releasedBlocks ?? []).map((b) => b.id)

  const newBlocks: Array<Record<string, unknown>> = [
    {
      aircraft_id: booking.aircraft_id,
      related_booking_id: booking.id,
      block_type: 'customer_booking',
      start_time: requestedStart.toISOString(),
      end_time: requestedEnd.toISOString(),
      public_label: 'Checkout Flight',
      internal_reason: null,
      created_by_user_id: adminId,
      created_by_role: 'admin',
      is_public_visible: true,
      status: 'active',
    },
  ]
  // Only insert buffers with positive duration — zero-length rows violate
  // schedule_blocks_time_order_check (end_time > start_time).
  if (preBufMs > 0) {
    newBlocks.push({
      aircraft_id: booking.aircraft_id,
      related_booking_id: booking.id,
      block_type: 'buffer',
      start_time: expandedStart.toISOString(),
      end_time: requestedStart.toISOString(),
      public_label: null,
      internal_reason: 'Pre-flight buffer (checkout reschedule approved)',
      created_by_user_id: adminId,
      created_by_role: 'admin',
      is_public_visible: false,
      status: 'active',
    })
  }
  if (postBufMs > 0) {
    newBlocks.push({
      aircraft_id: booking.aircraft_id,
      related_booking_id: booking.id,
      block_type: 'buffer',
      start_time: requestedEnd.toISOString(),
      end_time: expandedEnd.toISOString(),
      public_label: null,
      internal_reason: 'Post-flight buffer (checkout reschedule approved)',
      created_by_user_id: adminId,
      created_by_role: 'admin',
      is_public_visible: false,
      status: 'active',
    })
  }

  const { error: blockInsertErr } = await admin.from('schedule_blocks').insert(newBlocks)
  if (blockInsertErr) {
    if (releasedBlockIds.length > 0) {
      await admin
        .from('schedule_blocks')
        .update({ status: 'active' })
        .in('id', releasedBlockIds)
    }
    console.error('[approveCheckoutReschedule] schedule_blocks insert failed:', blockInsertErr)
    throw new Error(
      `Failed to reserve the approved checkout slot.${blockInsertErr.message ? ` ${blockInsertErr.message}` : ''}`,
    )
  }

  const { error: bookingErr } = await admin
    .from('bookings')
    .update({
      scheduled_start: requestedStart.toISOString(),
      scheduled_end: requestedEnd.toISOString(),
      checkout_lifecycle_status: 'scheduled',
      updated_at: now,
    })
    .eq('id', booking.id)
  if (bookingErr) {
    if (releasedBlockIds.length > 0) {
      await admin
        .from('schedule_blocks')
        .update({ status: 'active' })
        .in('id', releasedBlockIds)
    }
    await admin
      .from('schedule_blocks')
      .update({ status: 'cancelled' })
      .eq('related_booking_id', booking.id)
      .eq('status', 'active')
      .eq('internal_reason', 'Pre-flight buffer (checkout reschedule approved)')
    await admin
      .from('schedule_blocks')
      .update({ status: 'cancelled' })
      .eq('related_booking_id', booking.id)
      .eq('status', 'active')
      .eq('internal_reason', 'Post-flight buffer (checkout reschedule approved)')
    await admin
      .from('schedule_blocks')
      .update({ status: 'cancelled' })
      .eq('related_booking_id', booking.id)
      .eq('status', 'active')
      .eq('public_label', 'Checkout Flight')
    throw new Error('Failed to update checkout schedule.')
  }

  const { error: decisionErr } = await admin
    .from('checkout_change_requests')
    .update({
      status: 'approved',
      reviewed_by: adminId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', changeRequestId)
  if (decisionErr) throw new Error('Failed to mark reschedule request approved.')

  await admin.from('booking_status_history').insert({
    booking_id: booking.id,
    old_status: booking.status,
    new_status: booking.status,
    changed_by_user_id: adminId,
    note: 'Admin approved checkout reschedule request and updated checkout time.',
  })

  await admin.from('booking_audit_events').insert({
    booking_id: booking.id,
    aircraft_id: booking.aircraft_id,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'checkout_reschedule_approved',
    event_summary: 'Admin approved checkout reschedule request.',
    old_value: { scheduled_start: booking.scheduled_start, scheduled_end: booking.scheduled_end },
    new_value: { scheduled_start: requestedStart.toISOString(), scheduled_end: requestedEnd.toISOString() },
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/checkout')
  revalidatePath('/dashboard/bookings')
  revalidatePath('/admin')
  revalidatePath('/admin/bookings/checkout')
  revalidatePath('/admin/checkouts/cancel-reschedule')
  revalidatePath('/admin/checkouts/reschedule')
  revalidatePath('/admin/checkouts/cancelled')

  void emitBookingChanged({ bookingId: booking.id, userId: booking.booking_owner_user_id })
  void emitOpsChanged()
}

export async function rejectCheckoutReschedule(changeRequestId: string): Promise<void> {
  const { adminId } = await requireAdmin()
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: reqRow, error: reqErr } = await admin
    .from('checkout_change_requests')
    .select(`
      id, checkout_request_id, request_type, status,
      bookings:checkout_request_id (id, status, aircraft_id, scheduled_start, scheduled_end, checkout_lifecycle_status, booking_owner_user_id)
    `)
    .eq('id', changeRequestId)
    .single()

  if (reqErr || !reqRow) throw new Error('Reschedule request not found.')
  if (reqRow.request_type !== 'reschedule' || reqRow.status !== 'pending') {
    throw new Error('VALIDATION: Only pending reschedule requests can be rejected.')
  }
  const booking = Array.isArray(reqRow.bookings) ? reqRow.bookings[0] : reqRow.bookings
  if (!booking) throw new Error('Checkout booking not found for this request.')

  const { error: reqUpdateErr } = await admin
    .from('checkout_change_requests')
    .update({
      status: 'rejected',
      reviewed_by: adminId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', changeRequestId)
  if (reqUpdateErr) throw new Error('Failed to reject reschedule request.')

  const lifecycle = deriveLifecycleFromBookingStatus(booking.status)
  await admin
    .from('bookings')
    .update({ checkout_lifecycle_status: lifecycle, updated_at: now })
    .eq('id', booking.id)

  await admin.from('booking_status_history').insert({
    booking_id: booking.id,
    old_status: booking.status,
    new_status: booking.status,
    changed_by_user_id: adminId,
    note: 'Admin rejected checkout reschedule request. Original checkout schedule remains unchanged.',
  })

  await admin.from('booking_audit_events').insert({
    booking_id: booking.id,
    aircraft_id: booking.aircraft_id,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'checkout_reschedule_rejected',
    event_summary: 'Admin rejected checkout reschedule request.',
    new_value: { checkout_lifecycle_status: lifecycle },
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/checkout')
  revalidatePath('/dashboard/bookings')
  revalidatePath('/admin')
  revalidatePath('/admin/bookings/checkout')
  revalidatePath('/admin/checkouts/cancel-reschedule')
  revalidatePath('/admin/checkouts/reschedule')
  revalidatePath('/admin/checkouts/cancelled')

  void emitBookingChanged({ bookingId: booking.id, userId: booking.booking_owner_user_id })
  void emitOpsChanged()
}
