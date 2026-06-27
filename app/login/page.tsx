import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LoginContent from './LoginContent'

function normalizeNextPath(input: string | string[] | undefined): string {
  const value = Array.isArray(input) ? input[0] : input
  if (!value) return '/dashboard'
  if (!value.startsWith('/')) return '/dashboard'
  if (value.startsWith('//')) return '/dashboard'
  return value
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
  const nextPath = normalizeNextPath(searchParams?.next)

  if (data?.user) {
    redirect(nextPath)
  }

  return <LoginContent />
}
