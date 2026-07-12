import 'server-only'

type StoreInvoicePdfParams = {
  supabase: any
  table: 'invoices' | 'booking_invoices'
  rowId: string
  userId: string
  invoiceNumber: string
  pdfBuffer: Buffer
}

type StoredInvoicePdfResult = {
  pdfUrl: string
  storagePath: string
  fileName: string
  attachment: {
    filename: string
    content: string
    contentType: string
  }
}

export async function storeInvoicePdf({
  supabase,
  table,
  rowId,
  userId,
  invoiceNumber,
  pdfBuffer,
}: StoreInvoicePdfParams): Promise<StoredInvoicePdfResult> {
  const storagePath = `${userId}/${invoiceNumber}.pdf`
  const fileName = `${invoiceNumber}.pdf`

  const uploadResult = await supabase.storage
    .from('invoice_pdfs')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '3600',
    })

  if (uploadResult.error) {
    throw uploadResult.error
  }

  const { data: publicUrlData } = supabase.storage.from('invoice_pdfs').getPublicUrl(storagePath)
  const pdfUrl = publicUrlData.publicUrl

  const { error: updateError } = await supabase
    .from(table)
    .update({ pdf_url: pdfUrl })
    .eq('id', rowId)

  if (updateError) {
    throw updateError
  }

  return {
    pdfUrl,
    storagePath,
    fileName,
    attachment: {
      filename: fileName,
      content: pdfBuffer.toString('base64'),
      contentType: 'application/pdf',
    },
  }
}
