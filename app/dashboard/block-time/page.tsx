import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BlockTimeContent from './BlockTimeContent'

export const metadata = {
  title: 'Block Time History | Dashboard',
}

export default async function BlockTimeHistoryPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch block purchases
  const { data: purchaseRows } = await supabase
    .from('pilot_block_time_purchases')
    .select(`
      id,
      status,
      hours_purchased,
      hours_remaining,
      rate_per_hour,
      expires_at,
      purchased_at,
      activated_at,
      package:block_time_packages (
        name
      ),
      invoices (
        id,
        pdf_url,
        status
      )
    `)
    .eq('user_id', user.id)
    .order('purchased_at', { ascending: false })

  // Fetch block usage
  const { data: usageRows } = await supabase
    .from('pilot_block_time_usage')
    .select(`
      id,
      hours_deducted,
      overflow_hours,
      overflow_amount,
      hours_before,
      hours_after,
      deducted_at,
      invoice_id,
      bookings (
        id,
        scheduled_start,
        aircraft (
          registration
        )
      ),
      invoices (
        id,
        pdf_url
      )
    `)
    .eq('user_id', user.id)
    .order('deducted_at', { ascending: false })

  const purchases = (purchaseRows ?? []).map((row: any) => ({
    ...row,
    package: Array.isArray(row.package) ? row.package[0] ?? null : row.package,
    invoices: Array.isArray(row.invoices) ? row.invoices[0] ?? null : row.invoices,
  }))

  const usage = (usageRows ?? []).map((row: any) => ({
    ...row,
    bookings: Array.isArray(row.bookings) ? row.bookings[0] ?? null : row.bookings,
    invoices: Array.isArray(row.invoices) ? row.invoices[0] ?? null : row.invoices,
  }))

  return <BlockTimeContent purchases={purchases as any} usage={usage as any} />
}
