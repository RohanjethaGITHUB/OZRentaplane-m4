'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeActiveCheckoutTerms } from '@/lib/checkout-terms'
import { notifyCheckoutRequestSubmitted } from '@/lib/booking/notifications'
import { checkAircraftAvailability } from '@/lib/booking/availability'
import { isNoShowLockedProfile } from '@/lib/checkout-policy'
import { isWithinDayVfrWindow } from '@/lib/utils/day-vfr'
import { validateFlightReviewDate } from '@/lib/utils/flight-review'
import { sydneyInputToUTC } from '@/lib/utils/sydney-time'
import type {
  CreateCheckoutBookingInput,
  CheckoutBookingResult,
} from '@/lib/supabase/booking-types'

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
    .select('email, role, pilot_clearance_status, has_night_vfr_rating, has_instrument_rating, account_status, account_lock_reason')
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

// ─── Submit checkout request ──────────────────────────────────────────────────
// Creates a checkout booking and sets pilot_clearance_status = checkout_requested.
//
// Server-side validation before calling the RPC:
//   1. Required documents (pilot_licence, medical_certificate, photo_id) must
//      be uploaded and not rejected or expired.
//   2. Time range must be valid and in the future.
//
// The RPC (create_checkout_booking_atomic) then enforces at the database layer:
//   • Clearance status allows a new checkout request
//   • No currently active checkout booking exists
//   • Aircraft is available
//   • No schedule block conflicts

export async function submitCheckoutRequest(
  input: CreateCheckoutBookingInput,
): Promise<CheckoutBookingResult> {
  const h = await headers()
  const requestHost = h.get('host') ?? 'unknown'
  const requestPath = h.get('x-matched-path') ?? '/dashboard/checkout'
  const requestMethod = h.get('x-http-method-override') ?? 'POST'
  const routeName = 'checkout-submit-debug'
  console.info(`[${routeName}] request received`, {
    host: requestHost,
    path: requestPath,
    method: requestMethod,
    step: 'pre_auth_guard',
  })

  let supabase: Awaited<ReturnType<typeof createClient>>
  let userId = ''
  let profile: Awaited<ReturnType<typeof requireCustomer>>['profile']
  try {
    const authCtx = await requireCustomer()
    supabase = authCtx.supabase
    userId = authCtx.userId
    profile = authCtx.profile
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown auth error'
    const lower = message.toLowerCase()
    const isAuthError = lower.includes('unauthorized') || lower.includes('not authenticated') || lower.includes('invalid jwt')
    console.error(`[${routeName}] auth guard failed`, {
      host: requestHost,
      step: 'auth_guard',
      auth_user_exists: false,
      message,
    })
    if (isAuthError) {
      throw new Error('AUTH: Your session has expired. Please sign in again, then resubmit your checkout request.')
    }
    throw error
  }
  const ACCEPTANCE_TEXT = 'I have read and accept the Checkout Terms and Conditions.'
  const profileRecord = profile as Record<string, unknown>
  const safeEmail = typeof profileRecord.email === 'string' ? profileRecord.email : null
  const safeAccountStatus = typeof profileRecord.account_status === 'string' ? profileRecord.account_status : null
  try {
    console.info(`[${routeName}] submit started`, {
      host: requestHost,
      user_id: userId,
      email: safeEmail,
      auth_user_exists: true,
      has_terms_payload: Boolean(input.terms_document_id && input.terms_version && input.terms_content_hash),
      has_last_flight_date: Boolean(input.last_flight_date),
      has_night_vfr: input.has_night_vfr,
    })
    console.info(`[${routeName}] auth/profile`, {
      host: requestHost,
      user_id: userId,
      email: safeEmail,
      role: profile.role,
      account_status: safeAccountStatus,
      pilot_clearance_status: profile.pilot_clearance_status,
      has_instrument_rating: profile.has_instrument_rating,
    })

  // ── Document gate ──────────────────────────────────────────────────────────
  // Validates all required document fields per document type.
  const { data: docs, error: docsErr } = await supabase
    .from('user_documents')
    .select('document_type, status, expiry_date, issue_date, licence_type, licence_number, medical_class, id_type, document_number')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (docsErr) {
    console.error(`[${routeName}] user_documents query failed`, {
      host: requestHost,
      user_id: userId,
      email: safeEmail,
      code: docsErr.code,
      message: docsErr.message,
      details: docsErr.details,
      hint: docsErr.hint,
    })
    throw new Error('VALIDATION: Unable to verify your documents. Please try again.')
  }

  const today = new Date().toISOString().split('T')[0]!
  const docsByType = new Map<string, typeof docs[number]>()
  for (const d of (docs ?? [])) {
    if (!docsByType.has(d.document_type)) docsByType.set(d.document_type, d)
  }
  console.info(`[${routeName}] documents loaded`, {
    host: requestHost,
    user_id: userId,
    email: safeEmail,
    count: docs?.length ?? 0,
    summary: Array.from(docsByType.values()).map((d) => ({
      type: d.document_type,
      status: d.status,
      expiry_date: d.expiry_date,
      issue_date: d.issue_date,
      has_licence_type: Boolean(d.licence_type),
      has_licence_number: Boolean(d.licence_number),
      has_medical_class: Boolean(d.medical_class),
      has_id_type: Boolean(d.id_type),
      has_document_number: Boolean(d.document_number),
    })),
  })
  const docMap: Record<string, typeof docs[0]> = {}

  // Build a map of the best (latest non-rejected, non-expired) row per type.
  // Multiple rows per type are now allowed; we validate against the most recent valid one.
  for (const d of (docs ?? [])) {
    const isRejected = d.status === 'rejected'
    const isExpired  = d.expiry_date ? d.expiry_date < today : false
    const existing   = docMap[d.document_type]
    // Prefer: non-rejected and non-expired; then latest by insertion order (docs are ordered by created_at desc)
    if (!existing) {
      docMap[d.document_type] = d
    } else if (!isRejected && !isExpired) {
      // Replace if current best is rejected or expired
      const existingRejected = existing.status === 'rejected'
      const existingExpired  = existing.expiry_date ? existing.expiry_date < today : false
      if (existingRejected || existingExpired) docMap[d.document_type] = d
    }
  }

  const missing: string[] = []

  // Pilot Licence: file uploaded, licence type, licence number (ARN)
  const licence = docMap['pilot_licence']
  if (!licence)                         missing.push('pilot licence (file required)')
  else if (licence.status === 'rejected') missing.push('pilot licence (document rejected — please replace)')
  else if (!licence.licence_type)       missing.push('pilot licence type')
  else if (!licence.licence_number)     missing.push('pilot licence number / ARN')

  // Medical Certificate: file, medical class, date of issue, expiry date (not expired)
  const medical = docMap['medical_certificate']
  if (!medical)                          missing.push('medical certificate (file required)')
  else if (medical.status === 'rejected') missing.push('medical certificate (document rejected — please replace)')
  else if (!medical.medical_class)       missing.push('medical certificate class')
  else if (!medical.issue_date)          missing.push('medical certificate date of issue')
  else if (!medical.expiry_date)         missing.push('medical certificate expiry date')
  else if (medical.expiry_date < today)  missing.push('medical certificate (expired — please replace)')

  // Photo ID: file, ID type, document number
  const photoId = docMap['photo_id']
  if (!photoId)                          missing.push('photo ID (file required)')
  else if (photoId.status === 'rejected') missing.push('photo ID (document rejected — please replace)')
  else if (!photoId.id_type)             missing.push('photo ID type')
  else if (!photoId.document_number)     missing.push('photo ID number')

  // Flight review date — required and must be within the last 2 years
  if (!input.last_flight_date) {
    missing.push('last flight review date')
  } else {
    const flightReviewErr = validateFlightReviewDate(input.last_flight_date)
    if (flightReviewErr) throw new Error(`VALIDATION: ${flightReviewErr}`)
  }

  // Night VFR: use the form selection (not just the stored profile value),
  // then verify against the profile to ensure evidence has been uploaded.
  if (input.has_night_vfr === null) {
    throw new Error(
      'VALIDATION: Please confirm your Night VFR rating status before submitting a checkout request.'
    )
  }

  // Instrument rating must be answered on the stored profile.
  if (profile.has_instrument_rating === null) {
    throw new Error(
      'VALIDATION: Please confirm your Instrument Rating status before submitting a checkout request.'
    )
  }

  // Night VFR gate: require at least one valid night_vfr_evidence document.
  if (input.has_night_vfr === true) {
    const nightVfrEvidence = docMap['night_vfr_evidence']
    const hasValidEvidence =
      !!nightVfrEvidence &&
      nightVfrEvidence.status !== 'rejected' &&
      !(nightVfrEvidence.expiry_date && nightVfrEvidence.expiry_date < today)
    if (!hasValidEvidence) {
      throw new Error(
        'VALIDATION: Please upload Night VFR before requesting a night checkout.'
      )
    }
  }

  // Day VFR window check — only applied when Night VFR is not confirmed.
  if (input.has_night_vfr !== true) {
    if (!isWithinDayVfrWindow(input.scheduled_time_sydney, input.scheduled_date_sydney, 120)) {
      throw new Error(
        'VALIDATION: Checkout bookings reserve a 2-hour window and must fit within the allowed flight window.'
      )
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `VALIDATION: Please complete the required information before submitting your checkout request. Missing: ${missing.join(', ')}.`
    )
  }

  if (!input.terms_accepted) {
    throw new Error('VALIDATION: You must accept the Checkout Terms and Conditions before submitting.')
  }

  let activeTermsRow: Record<string, unknown> | null = null
  {
    const primary = await supabase
      .from('terms_documents')
      .select('*')
      .eq('is_active', true)
      .order('effective_from', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    activeTermsRow = (primary.data as Record<string, unknown> | null)
      ?? (await supabase
        .from('terms_documents')
        .select('*')
        .order('effective_from', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()).data as Record<string, unknown> | null
    if (!activeTermsRow) {
      // RLS-safe fallback: use service role for authoritative active terms lookup.
      const admin = createAdminClient()
      const adminPrimary = await admin
        .from('terms_documents')
        .select('*')
        .eq('is_active', true)
        .order('effective_from', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
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
  console.info(`[${routeName}] active terms lookup`, {
    host: requestHost,
    user_id: userId,
    email: safeEmail,
    found: Boolean(normalizedTerms),
    terms_document_id: normalizedTerms?.id ?? null,
    terms_version: normalizedTerms?.version ?? null,
    terms_content_hash: normalizedTerms?.content_hash ?? null,
  })
  if (!normalizedTerms) {
    throw new Error('VALIDATION: No active checkout terms document is available right now. Please try again.')
  }
  const activeTermsId = normalizedTerms.id
  const activeTermsVersion = normalizedTerms.version
  const activeTermsUrl = normalizedTerms.public_url
  const activeTermsHash = normalizedTerms.content_hash
  if (!input.terms_document_id || !input.terms_version || !input.terms_content_hash) {
    throw new Error('VALIDATION: Terms acceptance details were not submitted. Please review and accept terms again.')
  }
  if (input.terms_document_id !== activeTermsId || input.terms_version !== activeTermsVersion) {
    throw new Error('VALIDATION: Checkout Terms and Conditions were updated. Please review and accept the latest version.')
  }
  if (activeTermsHash && input.terms_content_hash !== activeTermsHash) {
    throw new Error('VALIDATION: Checkout Terms and Conditions were updated. Please review and accept the latest version.')
  }

  // ── Time validation ────────────────────────────────────────────────────────
  const start = new Date(input.scheduled_start)
  if (isNaN(start.getTime())) {
    throw new Error('VALIDATION: Invalid start time.')
  }
  if (start <= new Date()) {
    throw new Error('VALIDATION: Checkout flight time must be in the future.')
  }

  // p_scheduled_end is not passed — the RPC computes it as start + 1 hour
  console.info(`[${routeName}] RPC create_checkout_booking_atomic started`, {
    host: requestHost,
    user_id: userId,
    email: safeEmail,
    aircraft_id: input.aircraft_id,
    scheduled_start: input.scheduled_start,
  })
  const { data, error } = await supabase.rpc('create_checkout_booking_atomic', {
    p_aircraft_id:     input.aircraft_id,
    p_scheduled_start: input.scheduled_start,
    p_customer_notes:  input.customer_notes ?? null,
  })

  if (error) {
    console.error(`[${routeName}] RPC create_checkout_booking_atomic failed`, {
      host: requestHost,
      user_id: userId,
      email: safeEmail,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    const rawMsg = error.message ?? ''
    const lower = rawMsg.toLowerCase()
    // Prefix known RPC messages that are missing VALIDATION:/AVAILABILITY: so the
    // client can route them to a user-friendly message instead of the generic fallback.
    if (lower.includes('already have an active checkout booking')) {
      throw new Error(`VALIDATION: ${rawMsg}`)
    }
    if (lower.includes('no longer available') || lower.includes('schedule block')) {
      throw new Error(`AVAILABILITY: ${rawMsg}`)
    }
    if (lower.includes('checkout start time must be in the future')) {
      throw new Error(`VALIDATION: ${rawMsg}`)
    }
    if (lower.includes('aircraft not found')) {
      throw new Error(`VALIDATION: ${rawMsg}`)
    }
    if (lower.includes('not authenticated') || lower.includes('unauthorized')) {
      throw new Error('AUTH: Your session has expired. Please sign in again, then resubmit your checkout request.')
    }
    throw new Error(rawMsg)
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
    throw new Error('VALIDATION: Checkout request could not be created due to an invalid server response. Please try again.')
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info(
      '[submitCheckoutRequest] booking_id=%s status=%s booking_reference=%s scheduled_start=%s',
      bookingId,
      result.status,
      result.booking_reference,
      result.scheduled_start,
    )
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
    terms_version: activeTermsVersion,
    terms_document_url: input.terms_document_url || activeTermsUrl,
    terms_content_hash: input.terms_content_hash || (activeTermsHash || null),
    acceptance_text: ACCEPTANCE_TEXT,
    accepted_ip: acceptedIp,
    user_agent: userAgent,
  }

  console.info(`[${routeName}] terms acceptance insert started`, {
    host: requestHost,
    user_id: userId,
    email: safeEmail,
    booking_id: bookingId,
    terms_document_id: activeTermsId,
    terms_version: activeTermsVersion,
    terms_content_hash: acceptancePayload.terms_content_hash,
  })
  const { error: termsErr } = await admin
    .from('booking_terms_acceptances')
    .insert(acceptancePayload)
  if (termsErr) {
    console.error(`[${routeName}] booking_terms_acceptances insert failed`, {
      host: requestHost,
      message: termsErr.message,
      details: termsErr.details,
      hint: termsErr.hint,
      code: termsErr.code,
      booking_id: bookingId,
      user_id: userId,
      email: safeEmail,
      terms_document_id: activeTermsId,
      terms_version: activeTermsVersion,
      terms_content_hash: acceptancePayload.terms_content_hash,
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
        host: requestHost,
        user_id: userId,
        email: safeEmail,
        booking_id: bookingId || null,
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
        host: requestHost,
        user_id: userId,
        email: safeEmail,
        booking_id: bookingId || null,
        rollback,
      })
    } catch (rollbackErr) {
      rollback.error = rollbackErr instanceof Error ? rollbackErr.message : 'unknown rollback error'
      console.error(`[${routeName}] rollback failed after terms insert error`, {
        host: requestHost,
        booking_id: bookingId || null,
        user_id: userId,
        email: safeEmail,
        rollback,
      })
    }

    const isSchemaCacheError =
      termsErr.code === 'PGRST204' &&
      (termsErr.message?.includes("'terms_content_hash' column") || termsErr.message?.includes('schema cache'))

    if (process.env.NODE_ENV !== 'production') {
      if (isSchemaCacheError) {
        throw new Error(
          `Unable to record your terms acceptance. Schema cache mismatch for booking_terms_acceptances. Apply migration 059/061 and run: notify pgrst, 'reload schema'. DB error: ${termsErr.message}. Rollback: ${JSON.stringify(rollback)}`
        )
      }
      throw new Error(
        `Unable to record your terms acceptance. DB error: ${termsErr.message}${termsErr.code ? ` (code ${termsErr.code})` : ''}. Rollback: ${JSON.stringify(rollback)}`
      )
    }
    throw new Error('VALIDATION: Unable to record your terms acceptance. Please try again.')
  }
  console.info(`[${routeName}] terms acceptance insert success`, {
    host: requestHost,
    user_id: userId,
    email: safeEmail,
    booking_id: bookingId,
  })

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
      host: requestHost,
      user_id: userId,
      email: safeEmail,
        booking_update_error: bookingUpdate.error
          ? {
            code: bookingUpdate.error.code,
            message: bookingUpdate.error.message,
            details: bookingUpdate.error.details,
            hint: bookingUpdate.error.hint,
          }
          : null,
        profile_update_error: profileUpdate.error
          ? {
            code: profileUpdate.error.code,
            message: profileUpdate.error.message,
            details: profileUpdate.error.details,
            hint: profileUpdate.error.hint,
          }
          : null,
      })
    }
  }

  // Notify customer — non-fatal
  const { error: notifErr } = await supabase.from('verification_events').insert({
    user_id:      userId,
    actor_role:   'customer',
    event_type:   'submitted',
    title:        'Checkout request submitted',
    body:         'Your checkout request has been submitted for review. You will be notified once a decision has been made.',
    is_read:      false,
    email_status: 'skipped',
  })
  if (notifErr) console.error('[submitCheckoutRequest] notification failed:', notifErr.message)

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .single()

  if (profileRow?.email) {
    await notifyCheckoutRequestSubmitted({
      customerEmail: profileRow.email,
      customerName: profileRow.full_name ?? 'Pilot',
      bookingId,
      requestedTime: new Date(result.scheduled_start).toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney',
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    }).catch((error) => console.error('[submitCheckoutRequest] email failed:', error))
  }

  revalidatePath('/dashboard')
  revalidatePath('/admin')
  revalidatePath('/admin/checkouts')
  revalidatePath('/admin/checkouts/all')

  console.info(`[${routeName}] submit success`, {
    host: requestHost,
    user_id: userId,
    email: safeEmail,
    booking_id: bookingId,
    booking_reference: result.booking_reference,
  })

  return {
    bookingId,
    bookingReference: result.booking_reference,
    scheduledStart:   result.scheduled_start,
    scheduledEnd:     result.scheduled_end,
  }
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown checkout submission error')
    const lower = err.message.toLowerCase()
    if (lower.includes('unauthorized') || lower.includes('not authenticated') || lower.includes('invalid jwt')) {
      throw new Error('AUTH: Your session has expired. Please sign in again, then resubmit your checkout request.')
    }
    console.error(`[${routeName}] submit failed`, {
      host: requestHost,
      user_id: userId,
      email: safeEmail,
      auth_user_exists: true,
      message: err.message,
      stack: err.stack,
    })
    throw err
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

  const newBlocks = [
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
    {
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
    },
    {
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
    },
  ]

  const { error: blockInsertErr } = await admin.from('schedule_blocks').insert(newBlocks)
  if (blockInsertErr) {
    if (releasedBlockIds.length > 0) {
      await admin
        .from('schedule_blocks')
        .update({ status: 'active' })
        .in('id', releasedBlockIds)
    }
    throw new Error('Failed to reserve the approved checkout slot.')
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
}

export async function rejectCheckoutReschedule(changeRequestId: string): Promise<void> {
  const { adminId } = await requireAdmin()
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: reqRow, error: reqErr } = await admin
    .from('checkout_change_requests')
    .select(`
      id, checkout_request_id, request_type, status,
      bookings:checkout_request_id (id, status, aircraft_id, scheduled_start, scheduled_end, checkout_lifecycle_status)
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
}
