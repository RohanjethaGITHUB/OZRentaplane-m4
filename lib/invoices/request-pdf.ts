export type PdfGenerationResponse = {
  success: boolean
  pdfUrl: string
  fileName: string
  storagePath: string
  attachment: {
    filename: string
    content: string
    contentType: string
  }
}

export async function requestPdfGeneration(payload: Record<string, any>): Promise<PdfGenerationResponse | null> {
  try {
    const appUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const secret =
      process.env.INTERNAL_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.CRON_SECRET ||
      ''

    const res = await fetch(`${appUrl}/api/invoices/generate-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.warn(`[requestPdfGeneration] Server returned ${res.status}:`, errText)
      return null
    }

    return await res.json()
  } catch (error: any) {
    console.warn('[requestPdfGeneration] Failed to invoke PDF generation endpoint:', error?.message)
    return null
  }
}
