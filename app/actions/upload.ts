'use server'

import { createClient } from '@/lib/supabase/server'
import type { DocumentType } from '@/lib/supabase/types'

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

  // Pilot licence requires licence type and instrument rating.
  if (docType === 'pilot_licence') {
    if (!licenceType)                throw new Error('Licence type is required for the Pilot Licence.')
    if (hasInstrumentRating === null) throw new Error('Instrument rating status is required for the Pilot Licence.')
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
    file_name:             file.name,
    storage_path:          storagePath,
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

  const { error: dbError } = existingDoc?.id
    ? await supabase
        .from('user_documents')
        .update(documentPayload)
        .eq('id', existingDoc.id)
    : await supabase
        .from('user_documents')
        .insert(documentPayload)

  if (dbError) {
    console.error('[uploadVerificationDocument] DB error:', dbError)
    throw new Error('Failed to save document metadata. Please try again.')
  }

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
    const profileUpdate: Record<string, unknown> = {
      has_instrument_rating: hasInstrumentRating,
    }
    if (hasNightVfrRating !== null) profileUpdate.has_night_vfr_rating = hasNightVfrRating
    if (licenceNumber?.trim()) profileUpdate.pilot_arn = licenceNumber.trim()

    await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', user.id)
    // Non-throwing — profile sync failure is not critical; document is already saved.
  }

  return { success: true }
}
