'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeActiveCheckoutTerms } from '@/lib/checkout-terms'

export async function acceptCurrentBookingTermsFromReadiness() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'You must be signed in to accept terms.' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'customer') return { ok: false, error: 'Only customer accounts can accept booking terms.' as const }

  const rejectedGate = await getRejectedDocumentGateMessage(supabase, user.id)
  if (rejectedGate) return { ok: false, error: rejectedGate }

  let activeTerms: ReturnType<typeof normalizeActiveCheckoutTerms> = null
  const primary = await supabase
    .from('terms_documents')
    .select('id, version, public_url, content_hash, is_active, created_at, effective_from')
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  activeTerms = normalizeActiveCheckoutTerms((primary.data as Record<string, unknown> | null) ?? null)

  if (!activeTerms) {
    const admin = createAdminClient()
    const fallback = await admin
      .from('terms_documents')
      .select('id, version, public_url, content_hash, is_active, created_at, effective_from')
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    activeTerms = normalizeActiveCheckoutTerms((fallback.data as Record<string, unknown> | null) ?? null)
  }

  if (!activeTerms) return { ok: false, error: 'No active terms document is available right now.' as const }

  const { data: existing } = await supabase
    .from('booking_terms_acceptances')
    .select('id')
    .eq('user_id', user.id)
    .eq('terms_document_id', activeTerms.id)
    .eq('terms_version', activeTerms.version)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!existing?.id) {
    const h = await headers()
    const forwardedFor = h.get('x-forwarded-for')
    const acceptedIp =
      forwardedFor?.split(',')[0]?.trim() ||
      h.get('x-real-ip')?.trim() ||
      h.get('cf-connecting-ip')?.trim() ||
      null
    const userAgent = h.get('user-agent') ?? null

    const payload = {
      booking_id: null,
      checkout_request_id: null,
      user_id: user.id,
      terms_document_id: activeTerms.id,
      terms_version: activeTerms.version,
      terms_document_url: activeTerms.public_url,
      terms_content_hash: activeTerms.content_hash,
      acceptance_text: 'I have read and accept the booking terms and conditions.',
      accepted_ip: acceptedIp,
      user_agent: userAgent,
      acceptance_context: 'booking_readiness',
    }

    // Use admin client: booking_terms_acceptances has RLS enabled with no direct INSERT
    // policy for authenticated users — inserts are expected to go through privileged paths
    // (SECURITY DEFINER functions for checkout flow, admin client for server actions).
    // user_id is always sourced from server-side auth.getUser() above.
    const adminForInsert = createAdminClient()
    const { error: insertErr } = await adminForInsert
      .from('booking_terms_acceptances')
      .insert(payload)

    if (insertErr) {
      console.error('[acceptCurrentBookingTermsFromReadiness] insert failed', insertErr)
      return { ok: false, error: 'Could not save your terms acceptance right now. Please try again.' as const }
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bookings/new')
  return { ok: true as const }
}

export async function saveNightVfrRatingFromReadiness(input: { hasNightVfrRating: boolean }) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'customer') throw new Error('Forbidden')

  const rejectedGate = await getRejectedDocumentGateMessage(supabase, user.id)
  if (rejectedGate) throw new Error(rejectedGate)

  const { error } = await supabase
    .from('profiles')
    .update({ has_night_vfr_rating: input.hasNightVfrRating })
    .eq('id', user.id)

  if (error) throw new Error('Could not save Night VFR rating.')

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/documents')
  revalidatePath('/dashboard/bookings/new')
}

async function getRejectedDocumentGateMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data: rejectedDocs, error } = await supabase
    .from('user_documents')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'rejected')
    .limit(1)

  if (error) return null
  if ((rejectedDocs ?? []).length === 0) return null

  return 'One or more of your documents has been rejected. Please upload corrected documents and wait for admin approval before booking.'
}
