import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

type StoreInvoicePdfParams = {
  // Kept for call-site compatibility. Storage/DB writes use the service-role
  // client because invoice PDFs are stored under the *customer* userId path,
  // while admin finalisation runs as the admin session — session RLS would
  // reject the upload (bucket policy requires folder = auth.uid()).
  supabase?: any
  table: 'invoices' | 'booking_invoices' | 'checkout_invoices'
  rowId: string
  userId: string
  invoiceNumber: string
  pdfBuffer: Buffer
}

type StoredInvoicePdfResult = {
  pdfUrl: string
  storagePath: string
  fileName: string
  pdfBuffer: Buffer
  attachment: {
    filename: string
    content: string
    contentType: string
  }
}

export async function storeInvoicePdf({
  table,
  rowId,
  userId,
  invoiceNumber,
  pdfBuffer,
}: StoreInvoicePdfParams): Promise<StoredInvoicePdfResult> {
  const admin = createAdminClient()
  const storagePath = `${userId}/${invoiceNumber}.pdf`
  const fileName = `${invoiceNumber}.pdf`

  const uploadResult = await admin.storage
    .from('invoice_pdfs')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '0',
    })

  if (uploadResult.error) {
    throw uploadResult.error
  }

  const { data: publicUrlData } = admin.storage.from('invoice_pdfs').getPublicUrl(storagePath)
  const pdfUrl = publicUrlData.publicUrl

  if (table !== 'checkout_invoices') {
    const { error: updateError } = await admin
      .from(table)
      .update({ pdf_url: pdfUrl })
      .eq('id', rowId)

    if (updateError) {
      console.warn(`[pdf-storage] Could not update pdf_url on ${table}:`, updateError.message)
    }
  }

  return {
    pdfUrl,
    storagePath,
    fileName,
    pdfBuffer,
    attachment: {
      filename: fileName,
      content: pdfBuffer.toString('base64'),
      contentType: 'application/pdf',
    },
  }
}
