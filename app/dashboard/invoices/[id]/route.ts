import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = profile?.role === 'admin'

  // Look in `invoices` table by id or invoice_number
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)
  let invQuery = supabase
    .from('invoices')
    .select('id, invoice_number, user_id, booking_id, pdf_url, status')

  if (isUuid) {
    invQuery = invQuery.or(`id.eq.${params.id},invoice_number.eq.${params.id}`)
  } else {
    invQuery = invQuery.eq('invoice_number', params.id)
  }

  const { data: inv } = await invQuery.maybeSingle()

  if (inv) {
    if (!isAdmin && inv.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    if (inv.booking_id) {
      // Delegate to booking invoice route internally
      return NextResponse.redirect(new URL(`/dashboard/bookings/${inv.booking_id}/invoice`, request.url))
    }

    if (inv.invoice_number && inv.user_id) {
      const storagePath = `${inv.user_id}/${inv.invoice_number}.pdf`
      const { data: storageFile, error: storageErr } = await supabase.storage
        .from('invoice_pdfs')
        .download(storagePath)

      if (!storageErr && storageFile) {
        const buf = Buffer.from(await storageFile.arrayBuffer())
        return new NextResponse(new Uint8Array(buf), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${inv.invoice_number}.pdf"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        })
      }
    }

    if (inv.pdf_url) {
      try {
        const res = await fetch(inv.pdf_url)
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer())
          return new NextResponse(new Uint8Array(buf), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${inv.invoice_number || 'invoice'}.pdf"`,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
              'Pragma': 'no-cache',
              'Expires': '0',
            },
          })
        }
      } catch (err) {
        console.warn('[invoices route] Failed to fetch PDF from URL:', err)
      }
    }
  }

  return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
}
