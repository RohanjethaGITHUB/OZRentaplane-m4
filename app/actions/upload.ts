'use server'

import { createClient } from '@/lib/supabase/server'
import type { DocumentType } from '@/lib/supabase/types'

const MAX_SIZE      = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

export async function uploadVerificationDocument(formData: FormData) {
  const file       = formData.get('file')    as File   | null
  const docType    = formData.get('docType') as DocumentType | null

  if (!file || !docType) throw new Error('Missing file or document type.')

  if (file.size > MAX_SIZE)               throw new Error('File must be 10 MB or smaller.')
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Only PDF, JPG, JPEG, and PNG files are allowed.')

  // Per-document metadata fields
  const expiryDate      = (formData.get('expiryDate')      as string | null) || null
  const issueDate       = (formData.get('issueDate')       as string | null) || null
  const licenceType     = (formData.get('licenceType')     as string | null) || null
  const licenceNumber   = (formData.get('licenceNumber')   as string | null) || null
  const medicalClass    = (formData.get('medicalClass')    as string | null) || null
  const idType          = (formData.get('idType')          as string | null) || null
  const documentNumber  = (formData.get('documentNumber')  as string | null) || null

  // Medical certificate requires medical class, date of issue, and expiry date
  if (docType === 'medical_certificate') {
    if (!medicalClass) throw new Error('Medical class is required for the Medical Certificate.')
    if (!issueDate)    throw new Error('Date of issue is required for the Medical Certificate.')
    if (!expiryDate)   throw new Error('Expiry date is required for the Medical Certificate.')
  }

  // Pilot licence requires licence type
  if (docType === 'pilot_licence' && !licenceType) {
    throw new Error('Licence type is required for the Pilot Licence.')
  }

  // Photo ID requires ID type
  if (docType === 'photo_id' && !idType) {
    throw new Error('ID type is required for the Photo ID.')
  }

  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const storagePath = `${user.id}/${docType}`

  const { error: uploadError } = await supabase.storage
    .from('verification_documents')
    .upload(storagePath, file, { upsert: true, contentType: file.type })

  if (uploadError) {
    console.error('[uploadVerificationDocument] Storage error:', uploadError)
    throw new Error('Upload failed. Please try again.')
  }

  const { error: dbError } = await supabase
    .from('user_documents')
    .upsert({
      user_id:         user.id,
      document_type:   docType,
      file_name:       file.name,
      storage_path:    storagePath,
      status:          'uploaded',
      expiry_date:     expiryDate,
      issue_date:      issueDate,
      licence_type:    licenceType,
      licence_number:  licenceNumber,
      medical_class:   medicalClass,
      id_type:         idType,
      document_number: documentNumber,
    }, { onConflict: 'user_id, document_type' })

  if (dbError) {
    console.error('[uploadVerificationDocument] DB error:', dbError)
    throw new Error('Failed to save document metadata. Please try again.')
  }

  // When a pilot licence is uploaded with a licence number (ARN),
  // sync it to the customer's profile so it is available for bookings.
  if (docType === 'pilot_licence' && licenceNumber?.trim()) {
    await supabase
      .from('profiles')
      .update({ pilot_arn: licenceNumber.trim() })
      .eq('id', user.id)
    // Non-throwing — ARN sync failure is not critical; document is already saved.
  }

  return { success: true }
}
