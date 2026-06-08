'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { notifyProxyBookingCreated } from '@/lib/booking/notifications'
import { createClient } from '@/lib/supabase/server'
import { sydneyInputToUTC } from '@/lib/utils/sydney-time'

type ProxyBookingActionResult = { error: string }
type RequiredProxyDocument = 'pilot_licence' | 'medical_certificate' | 'photo_id'

const REQUIRED_PROXY_DOCUMENTS: Array<{
  type: RequiredProxyDocument
  label: string
}> = [
  { type: 'pilot_licence', label: 'Pilot Licence' },
  { type: 'medical_certificate', label: 'Medical Certificate' },
  { type: 'photo_id', label: 'Photo ID' },
]

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') throw new Error('Forbidden')
  return { supabase, adminId: user.id }
}

function isRedirectError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'digest' in error &&
      typeof (error as { digest?: unknown }).digest === 'string' &&
      (error as { digest: string }).digest.startsWith('NEXT_REDIRECT'),
  )
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  return String(error ?? '')
}

function normalizeBookingError(error: unknown): ProxyBookingActionResult {
  const message = getErrorMessage(error)
  const code = (error as { code?: unknown } | null)?.code

  if (message.includes('aircraft_unavailable')) {
    return {
      error: 'The aircraft has a conflicting booking in this time window. Choose different dates.',
    }
  }

  if (code === '23514') {
    return {
      error: 'A required field failed validation. Check all booking details and try again.',
    }
  }

  if (code === '42501') {
    return {
      error: 'Permission denied. Check that this customer and aircraft are correctly configured.',
    }
  }

  return { error: `Booking failed: ${message}` }
}

function formatDocumentStatus(status: string | null | undefined): string {
  if (!status) return 'missing'
  if (status === 'under_review') return 'uploaded'
  return status.replace(/_/g, ' ')
}

export async function createProxyBooking(formData: FormData): Promise<ProxyBookingActionResult | void> {
  try {
    const { supabase, adminId } = await requireAdmin()

    const bookingType = String(formData.get('bookingType') ?? 'standard').trim()
    const customerId = String(formData.get('customerId') ?? '').trim()
    const aircraftId = String(formData.get('aircraftId') ?? '').trim()
    const scheduledStart = String(formData.get('scheduledStart') ?? '').trim()
    const scheduledEnd = String(formData.get('scheduledEnd') ?? '').trim()
    const estimatedHoursRaw = String(formData.get('estimatedHours') ?? '').trim()
    const adminNotes = String(formData.get('adminNotes') ?? '').trim() || null
    const customerNotes = String(formData.get('customerNotes') ?? '').trim() || null

    const startUtc = sydneyInputToUTC(scheduledStart)
    const endUtc = sydneyInputToUTC(scheduledEnd)
    const estimatedHours = Number(estimatedHoursRaw)

    if (
      !customerId ||
      !aircraftId ||
      !scheduledStart ||
      !scheduledEnd ||
      !startUtc ||
      !endUtc ||
      !Number.isFinite(estimatedHours)
    ) {
      return normalizeBookingError(new Error('Invalid booking payload'))
    }

    const { data: docs, error: docsError } = await supabase
      .from('user_documents')
      .select('document_type, status, uploaded_at')
      .eq('user_id', customerId)
      .order('uploaded_at', { ascending: false })

    if (docsError) {
      return normalizeBookingError(docsError)
    }

    const latestDocs = new Map<string, { status: string | null }>()
    for (const doc of docs ?? []) {
      const documentType = doc.document_type as string | null
      if (!documentType || latestDocs.has(documentType)) continue
      latestDocs.set(documentType, { status: (doc.status as string | null) ?? null })
    }

    const docIssues = REQUIRED_PROXY_DOCUMENTS.flatMap(({ type, label }) => {
      const doc = latestDocs.get(type)
      if (!doc) return [`${label} (missing)`]
      if (doc.status !== 'approved') return [`${label} (${formatDocumentStatus(doc.status)})`]
      return []
    })

    if (docIssues.length > 0) {
      return {
        error: `Cannot create booking: the following documents are not yet approved: [${docIssues.join(', ')}]. Please approve all documents before creating a booking.`,
      }
    }

    const { data: bookingId, error } = await supabase.rpc('create_proxy_booking_atomic', {
      p_aircraft_id: aircraftId,
      p_customer_id: customerId,
      p_admin_id: adminId,
      p_pic_name: '',
      p_pic_arn: '',
      p_scheduled_start: startUtc,
      p_scheduled_end: endUtc,
      p_estimated_hours: estimatedHours,
      p_estimated_amount: 0,
      p_admin_notes: adminNotes,
      p_customer_notes: customerNotes,
      p_booking_type: bookingType,
    })

    if (error) {
      return normalizeBookingError(error)
    }

    if (typeof bookingId === 'string' && bookingId) {
      const [{ data: customerProfile }, { data: aircraft }] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', customerId).single(),
        supabase
          .from('aircraft')
          .select('registration, display_name, aircraft_type')
          .eq('id', aircraftId)
          .single(),
      ])

      if (customerProfile?.email && aircraft?.registration) {
        const aircraftName =
          aircraft.display_name?.trim() ||
          aircraft.aircraft_type?.trim() ||
          aircraft.registration

        notifyProxyBookingCreated({
          bookingId,
          bookingType: bookingType === 'checkout' ? 'checkout' : 'standard',
          customerId,
          customerName: customerProfile.full_name?.trim() || 'Pilot',
          customerEmail: customerProfile.email,
          aircraftRegistration: aircraft.registration,
          aircraftName,
          scheduledStart: startUtc,
          scheduledEnd: endUtc,
          adminNotes: adminNotes ?? undefined,
        }).catch((err) => console.error('Email failed:', err))
      }
    }

    revalidatePath(`/admin/users/${customerId}`)
    revalidatePath('/admin/bookings')
    redirect(`/admin/users/${customerId}`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    console.error('Proxy booking failed:', {
      message: (error as any)?.message,
      code: (error as any)?.code,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
    })
    return normalizeBookingError(error)
  }
}
