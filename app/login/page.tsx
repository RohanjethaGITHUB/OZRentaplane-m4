import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LoginContent from './LoginContent'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))

  if (data?.user) {
    redirect('/dashboard')
  }

  return <LoginContent />
}
