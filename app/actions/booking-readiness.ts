'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeActiveCheckoutTerms } from '@/lib/checkout-terms'

export async function acceptCurrentBookingTermsFromReadiness() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'customer') throw new Error('Forbidden')

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

  if (!activeTerms) {
    throw new Error('No active terms document is available right now.')
  }

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

    const { error: insertErr } = await supabase
      .from('booking_terms_acceptances')
      .insert({
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
      })

    if (insertErr) {
      throw new Error(insertErr.message)
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bookings/new')
}
