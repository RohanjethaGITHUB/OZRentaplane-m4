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
