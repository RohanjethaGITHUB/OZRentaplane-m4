'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeActiveCheckoutTerms } from '@/lib/checkout-terms'

type AcceptTermsResult =
  | { ok: true; acceptedAt: string }
  | { ok: false; error: string }

export async function acceptTermsAndConditions(): Promise<AcceptTermsResult> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: 'You must be signed in to accept the terms and conditions.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'customer') {
    return { ok: false, error: 'Only customer accounts can accept the terms and conditions.' }
  }

  const primaryTerms = await supabase
    .from('terms_documents')
    .select('id, version, public_url, content_hash, is_active, created_at, effective_from')
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let activeTerms = normalizeActiveCheckoutTerms((primaryTerms.data as Record<string, unknown> | null) ?? null)

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
    return { ok: false, error: 'No active terms document is available right now.' }
  }

  const acceptedAt = new Date().toISOString()
  const admin = createAdminClient()
  const acceptanceContext = 'standard'
  console.info('[acceptTermsAndConditions] writing acceptance row', {
    userId: user.id,
    termsDocumentId: activeTerms.id,
    termsVersion: activeTerms.version,
    context: acceptanceContext,
  })

  const { error: insertError } = await admin
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
      accepted_ip: null,
      user_agent: null,
      accepted_at: acceptedAt,
      acceptance_context: acceptanceContext,
    })

  if (insertError) {
    return { ok: false, error: 'Could not save your terms acceptance right now. Please try again.' }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      terms_accepted_at: acceptedAt,
      terms_version: activeTerms.version,
    })
    .eq('id', user.id)

  if (profileError) {
    return { ok: false, error: 'Could not save your terms acceptance right now. Please try again.' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/documents')
  revalidatePath('/dashboard/bookings/new')
  return { ok: true, acceptedAt }
}
