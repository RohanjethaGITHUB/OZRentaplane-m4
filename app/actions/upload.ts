'use server'

import { createClient } from '@/lib/supabase/server'
import type { DocumentType } from '@/lib/supabase/types'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

export async function uploadVerificationDocument(formData: FormData) {
  const file = formData.get('file') as File | null
  const docType = formData.get('docType') as DocumentType | null
  
  if (!file || !docType) {
    throw new Error('Missing file or document type.')
  }

  // Second-layer Strict Validation
  if (file.size > MAX_SIZE) {
    throw new Error('File must be 10 MB or smaller.')
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only PDF, JPG, JPEG, and PNG files are allowed.')
  }

  const supabase = await createClient()

  // 1. Authenticate server-side
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('Unauthorized')
  }

  const storagePath = `${user.id}/${docType}`

  // 2. Upload to Storage strictly bound by server auth
  const { error: uploadError } = await supabase.storage
    .from('verification_documents')
    .upload(storagePath, file, { upsert: true, contentType: file.type })

  if (uploadError) {
    console.error('Storage error:', uploadError)
    throw new Error('Upload failed. Please try again.')
  }

  // 3. Upsert Metadata resolving any rejected statuses via DB constraints
  const { error: dbError } = await supabase
    .from('user_documents')
    .upsert({
      user_id: user.id,
      document_type: docType,
      file_name: file.name,
      storage_path: storagePath,
      status: 'uploaded'
    }, { onConflict: 'user_id, document_type' })

  if (dbError) {
    console.error('DB error:', dbError)
    throw new Error('Upload metadata failed. Please try again.')
  }

  return { success: true }
}
