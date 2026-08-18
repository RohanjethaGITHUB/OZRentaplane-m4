/** Documents that must be approved before an admin can confirm a checkout. */
export const CHECKOUT_BLOCKING_DOCUMENT_TYPES = [
  'pilot_licence',
  'medical_certificate',
  'photo_id',
] as const

/** Night VFR evidence is intentionally informational for checkout confirmation. */
export const CHECKOUT_NON_BLOCKING_DOCUMENT_TYPES = ['night_vfr_evidence'] as const

export function isCheckoutDocumentBlocking(documentType: string): boolean {
  return (CHECKOUT_BLOCKING_DOCUMENT_TYPES as readonly string[]).includes(documentType)
}
