// The portal shell is now provided by app/dashboard/layout.tsx.
// This component is kept as a zero-cost passthrough so existing booking pages
// compile without changes. The user/profile props are accepted for type
// compatibility but are not rendered.
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase/types'

type Props = {
  user?: User
  profile?: Profile | null
  children: React.ReactNode
}

export default function CustomerBookingShell({ children }: Props) {
  return <>{children}</>
}
