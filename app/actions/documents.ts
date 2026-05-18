'use server'

import { createClient } from '@/lib/supabase/server'
import type { DocumentType } from '@/lib/supabase/types'

/**
 * Generate a short-lived signed URL so a customer can view their
 * own verification document in a new tab. The URL expires after
 * 60 seconds — long enough to open the file, short enough to
 * prevent unintended sharing.
 */
export async function getDocumentSignedUrl(docType: DocumentType): Promise<string> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const storagePath = `${user.id}/${docType}`

  const { data, error } = await supabase.storage
    .from('verification_documents')
    .createSignedUrl(storagePath, 60)

  if (error || !data?.signedUrl) {
    console.error('[getDocumentSignedUrl]', error)
    throw new Error('Could not generate a view link. Please try again.')
  }

  return data.signedUrl
}

export async function saveCheckoutRedCardDetails(input: {
  redCardExpiry: string
}): Promise<void> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const redCardExpiry = input.redCardExpiry?.trim()
  if (!redCardExpiry) {
    throw new Error('Please enter your Red Card expiry date.')
  }

  const redCardExpiryMonth = Number(redCardExpiry.split('-')[1])
  const redCardExpiryYear = Number(redCardExpiry.split('-')[0])

  if (!redCardExpiryMonth || redCardExpiryMonth < 1 || redCardExpiryMonth > 12) {
    throw new Error('Invalid Red Card expiry month.')
  }
  if (!redCardExpiryYear || redCardExpiryYear < 1900 || redCardExpiryYear > 2100) {
    throw new Error('Invalid Red Card expiry year.')
  }

  const { data: pilotDoc, error: pilotDocErr } = await supabase
    .from('user_documents')
    .select('id')
    .eq('user_id', user.id)
    .eq('document_type', 'pilot_licence')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pilotDocErr) throw new Error('Could not load pilot licence document.')
  if (!pilotDoc?.id) throw new Error('Please upload your Pilot Licence first before saving Red Card details.')

  const { error: updateErr } = await supabase
    .from('user_documents')
    .update({
      has_red_card: true,
      red_card_expiry_month: redCardExpiryMonth,
      red_card_expiry_year: redCardExpiryYear,
    })
    .eq('id', pilotDoc.id)

  if (updateErr) {
    console.error('[saveCheckoutRedCardDetails] update error', updateErr)
    throw new Error('Could not save Red Card details. Please try again.')
  }
}
