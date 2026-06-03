'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sydneyInputToUTC } from '@/lib/utils/sydney-time'

type ProxyBookingActionResult = { error: string }

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
  if (message.includes('aircraft_unavailable')) {
    return {
      error: 'The aircraft has a conflicting booking in this window. Please choose a different time.',
    }
  }

  return { error: 'Failed to create booking. Please try again.' }
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

    const { error } = await supabase.rpc('create_proxy_booking_atomic', {
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

    revalidatePath(`/admin/users/${customerId}`)
    revalidatePath('/admin/bookings')
    redirect(`/admin/users/${customerId}`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return normalizeBookingError(error)
  }
}
