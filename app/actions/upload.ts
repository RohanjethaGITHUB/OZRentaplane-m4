'use server'

import { createClient } from '@/lib/supabase/server'
import type { DocumentType } from '@/lib/supabase/types'
import { emitVerificationUpdated, emitOpsChanged } from '@/lib/realtime/emit'

const MAX_SIZE      = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

function getHumanReadableDocumentType(docType: DocumentType): string {
  switch (docType) {
    case 'pilot_licence':
      return 'Pilot Licence'
    case 'medical_certificate':
      return 'Medical Certificate'
    case 'photo_id':
      return 'Photo ID'
    case 'night_vfr_evidence':
      return 'Night VFR Evidence'
  }
}

export async function uploadVerificationDocument(formData: FormData) {
  const file       = formData.get('file')    as File   | null
  const docType    = formData.get('docType') as DocumentType | null
  const isFirstFile = formData.get('isFirstFile') === 'true'

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
  const hasRedCardRaw   = formData.get('hasRedCard') as string | null
  const redCardExpiry   = (formData.get('redCardExpiry') as string | null) || null
  const hasRedCard: boolean | null = hasRedCardRaw === 'true' ? true : hasRedCardRaw === 'false' ? false : null
  const redCardExpiryMonth = redCardExpiry ? Number(redCardExpiry.split('-')[1]) : null
  const redCardExpiryYear  = redCardExpiry ? Number(redCardExpiry.split('-')[0]) : null

  // Pilot ratings (pilot_licence only) — sent as 'true' or 'false' strings
  const nightVfrRatingRaw    = formData.get('nightVfrRating')   as string | null
  const instrumentRatingRaw  = formData.get('instrumentRating') as string | null
  const hasNightVfrRating:   boolean | null = nightVfrRatingRaw   === 'true' ? true : nightVfrRatingRaw   === 'false' ? false : null
  const hasInstrumentRating: boolean | null = instrumentRatingRaw === 'true' ? true : instrumentRatingRaw === 'false' ? false : null

  // Medical certificate requires medical class, date of issue, and expiry date
  if (docType === 'medical_certificate') {
    if (!medicalClass) throw new Error('Medical class is required for the Medical Certificate.')
    if (!issueDate)    throw new Error('Date of issue is required for the Medical Certificate.')
    if (!expiryDate)   throw new Error('Expiry date is required for the Medical Certificate.')
  }

  // Pilot licence requires licence type.
  if (docType === 'pilot_licence') {
    if (!licenceType) throw new Error('Licence type is required for the Pilot Licence.')
    if (hasRedCard === true && (!redCardExpiryMonth || !redCardExpiryYear)) {
      throw new Error('Red Card expiry month and year are required when Red Card is set to Yes.')
    }
  }

  // Photo ID requires ID type
  if (docType === 'photo_id' && !idType) {
    throw new Error('ID type is required for the Photo ID.')
  }

  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  // Each upload gets a unique storage path using a timestamp suffix.
  // This preserves all uploaded files and allows multiple files per document type.
  const timestamp   = Date.now()
  const ext         = file.name.split('.').pop() ?? 'pdf'
  const storagePath = `${user.id}/${docType}/${timestamp}.${ext}`

  const { data: existingDoc, error: existingDocError } = await supabase
    .from('user_documents')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('document_type', docType)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingDocError) {
    console.error('[uploadVerificationDocument] Existing document lookup failed:', existingDocError)
    throw new Error('Failed to load your existing document record. Please try again.')
  }

  const { error: uploadError } = await supabase.storage
    .from('verification_documents')
    .upload(storagePath, file, { upsert: false, contentType: file.type })

  if (uploadError) {
    console.error('[uploadVerificationDocument] Storage error:', uploadError)
    throw new Error('Upload failed. Please try again.')
  }

  const documentPayload = {
    user_id:               user.id,
    document_type:         docType,
    status:                'uploaded' as const,
    review_notes:          null,
    reviewed_at:           null,
    uploaded_at:           new Date().toISOString(),
    updated_at:            new Date().toISOString(),
    expiry_date:           expiryDate,
    issue_date:            issueDate,
    licence_type:          licenceType,
    licence_number:        licenceNumber,
    medical_class:         medicalClass,
    id_type:               idType,
    document_number:       documentNumber,
    has_red_card:          hasRedCard,
    red_card_expiry_month: redCardExpiryMonth,
    red_card_expiry_year:  redCardExpiryYear,
  }

  let documentId: string
  const { data: createdDoc, error: dbError } = existingDoc?.id
    ? await supabase
        .from('user_documents')
        .update(documentPayload)
        .eq('id', existingDoc.id)
    : await supabase
        .from('user_documents')
        .insert(documentPayload)
        .select('id')
        .single()

  documentId = existingDoc?.id ?? createdDoc!.id

  if (dbError) {
    console.error('[uploadVerificationDocument] DB error:', dbError)
    throw new Error('Failed to save document metadata. Please try again.')
  }

  const { error: fileRecordError } = await supabase
    .from('user_document_files')
    .insert({
      document_id: documentId,
      file_name: file.name,
      storage_path: storagePath,
    })

  if (fileRecordError) {
    console.error('[uploadVerificationDocument] user_document_files insert failed:', fileRecordError)
    throw new Error('Failed to save file record. Please try again.')
  }

  if (isFirstFile) {
    const documentLabel = getHumanReadableDocumentType(docType)
    const isReupload = existingDoc?.status === 'rejected'

    const { error: notificationError } = await supabase.from('verification_events').insert({
      user_id:         user.id,
      actor_user_id:   user.id,
      actor_role:      'customer',
      event_type:      'document_uploaded',
      title:           `${documentLabel} uploaded — awaiting review`,
      body:            isReupload
        ? `Customer has re-uploaded their ${documentLabel} after rejection. Please review and approve or reject.`
        : `Customer has uploaded their ${documentLabel}. Please review and approve or reject.`,
      is_read:         false,
      email_status:    'pending',
    })

    if (notificationError) {
      console.error('[uploadVerificationDocument] verification_events insert failed:', notificationError)
    }

    // When a pilot licence is uploaded, sync ARN and ratings to the customer's profile.
    if (docType === 'pilot_licence') {
      const profileUpdate: Record<string, unknown> = {}
      if (hasInstrumentRating !== null) profileUpdate.has_instrument_rating = hasInstrumentRating
      if (hasNightVfrRating !== null) profileUpdate.has_night_vfr_rating = hasNightVfrRating
      if (licenceNumber?.trim()) profileUpdate.pilot_arn = licenceNumber.trim()

      if (Object.keys(profileUpdate).length > 0) {
        await supabase
          .from('profiles')
          .update(profileUpdate)
          .eq('id', user.id)
      }
      // Non-throwing — profile sync failure is not critical; document is already saved.
    }
  }

  void emitVerificationUpdated(user.id)
  void emitOpsChanged()

  return { success: true }
}

export async function replaceVerificationDocument(
  docType: string
): Promise<{ success: true }> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  // Find the existing parent document row
  const { data: existingDoc, error: docErr } = await supabase
    .from('user_documents')
    .select('id')
    .eq('user_id', user.id)
    .eq('document_type', docType)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (docErr) throw new Error('Failed to find existing document.')

  // Nothing to replace — no-op
  if (!existingDoc?.id) return { success: true }

  // Fetch all child file paths so we can delete from storage
  const { data: existingFiles, error: filesErr } = await supabase
    .from('user_document_files')
    .select('id, storage_path')
    .eq('document_id', existingDoc.id)

  if (filesErr) throw new Error('Failed to fetch existing files.')

  // Delete files from Supabase Storage
  if (existingFiles && existingFiles.length > 0) {
    const paths = existingFiles.map(f => f.storage_path)
    const { error: storageErr } = await supabase.storage
      .from('verification_documents')
      .remove(paths)
    if (storageErr) {
      console.error('[replaceVerificationDocument] Storage delete error:', storageErr)
      // Non-throwing — orphaned storage files are acceptable; DB cleanup is critical
    }
  }

  // Delete all child file rows (cascade would handle this but we do it explicitly)
  const { error: deleteFilesErr } = await supabase
    .from('user_document_files')
    .delete()
    .eq('document_id', existingDoc.id)

  if (deleteFilesErr) throw new Error('Failed to remove existing file records.')

  // Reset parent document status to uploaded so admin sees a fresh submission
  const { error: resetErr } = await supabase
    .from('user_documents')
    .update({
      status: 'uploaded',
      review_notes: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existingDoc.id)

  if (resetErr) throw new Error('Failed to reset document status.')

  void emitVerificationUpdated(user.id)

  return { success: true }
}
