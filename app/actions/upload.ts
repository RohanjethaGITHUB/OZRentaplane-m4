'use server'

import { createClient } from '@/lib/supabase/server'
import type { DocumentType } from '@/lib/supabase/types'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

export async function uploadVerificationDocument(formData: FormData) {
  const file       = formData.get('file')    as File   | null
  const docType    = formData.get('docType') as DocumentType | null

  if (!file || !docType) {
    throw new Error('Missing file or document type.')
  }

  // Second-layer strict validation
  if (file.size > MAX_SIZE) {
    throw new Error('File must be 10 MB or smaller.')
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only PDF, JPG, JPEG, and PNG files are allowed.')
  }

  // Per-document metadata (optional except medical expiry)
  const expiryDate    = (formData.get('expiryDate')    as string | null) || null
  const licenceType   = (formData.get('licenceType')   as string | null) || null
  const licenceNumber = (formData.get('licenceNumber') as string | null) || null
  const medicalClass  = (formData.get('medicalClass')  as string | null) || null
  const idType        = (formData.get('idType')        as string | null) || null

  // Medical certificate requires an expiry date
  if (docType === 'medical_certificate' && !expiryDate) {
    throw new Error('An expiry date is required for the Medical Certificate.')
  }

  const supabase = await createClient()

  // 1. Authenticate server-side
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('Unauthorized')
  }

  const storagePath = `${user.id}/${docType}`

  // 2. Upload to storage, strictly bound by server auth
  const { error: uploadError } = await supabase.storage
    .from('verification_documents')
    .upload(storagePath, file, { upsert: true, contentType: file.type })

  if (uploadError) {
    console.error('Storage error:', uploadError)
    throw new Error('Upload failed. Please try again.')
  }

  // 3. Upsert metadata, resetting status to uploaded on replace
  const { error: dbError } = await supabase
    .from('user_documents')
    .upsert({
      user_id:        user.id,
      document_type:  docType,
      file_name:      file.name,
      storage_path:   storagePath,
      status:         'uploaded',
      expiry_date:    expiryDate,
      licence_type:   licenceType,
      licence_number: licenceNumber,
      medical_class:  medicalClass,
      id_type:        idType,
    }, { onConflict: 'user_id, document_type' })

  if (dbError) {
    console.error('DB error:', dbError)
    throw new Error('Upload metadata failed. Please try again.')
  }

  return { success: true }
}
