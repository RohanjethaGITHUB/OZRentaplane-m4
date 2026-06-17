'use client'

import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { UserDocument } from '@/lib/supabase/types'
import DocumentUploadPanel from '@/app/dashboard/components/DocumentUploadPanel'

type Props = {
  user: User
  documents: UserDocument[]
  pilotLicenceDocument: UserDocument | null
  lastFlightDate: string | null
  hasNightVfrRating: boolean | null
  hasInstrumentRating: boolean | null
  termsAcceptedAt: string | null
}

export default function DocumentsPanelV2({
  user,
  documents,
  pilotLicenceDocument,
  lastFlightDate,
  hasNightVfrRating,
  termsAcceptedAt,
}: Props) {
  const router = useRouter()
  const pilotDoc = pilotLicenceDocument

  return (
    <DocumentUploadPanel
      user={user}
      documents={documents}
      pilotLicenceDocument={pilotDoc}
      lastFlightDate={lastFlightDate}
      hasNightVfrRating={hasNightVfrRating}
      termsAcceptedAt={termsAcceptedAt}
      initialRedCardMonth={pilotDoc?.red_card_expiry_month ?? null}
      initialRedCardYear={pilotDoc?.red_card_expiry_year ?? null}
      onSuccess={() => router.refresh()}
    />
  )
}
