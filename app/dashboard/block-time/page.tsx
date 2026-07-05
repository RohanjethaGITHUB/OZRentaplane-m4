import { redirect } from 'next/navigation'

export default function BlockTimeRedirectPage() {
  redirect('/dashboard/pricing')
}
