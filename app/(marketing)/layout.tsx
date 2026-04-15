import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { createClient } from '@/lib/supabase/server'

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
  const user = data?.user ?? null

  return (
    <>
      <Navbar initialUser={user} />
      {children}
      <Footer />
    </>
  )
}
