import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import CustomerBookingShell from '../CustomerBookingShell'
import BookingRequestForm from './BookingRequestForm'
import type { User } from '@supabase/supabase-js'
import type { Profile, UserDocument } from '@/lib/supabase/types'

export const metadata = { title: 'Book a Flight | Pilot Dashboard' }

// ── Helper: check document validity ─────────────────────────────────────────
type DocGateResult =
  | { ok: true }
  | { ok: false; reason: 'missing_licence' | 'missing_medical' | 'expired_licence' | 'expired_medical' | 'pending' | 'rejected' }

function checkDocumentGate(documents: UserDocument[]): DocGateResult {
  const today = new Date().toISOString().split('T')[0]

  const licence = documents.find(d => d.document_type === 'pilot_licence')
  const medical = documents.find(d => d.document_type === 'medical_certificate')

  if (!licence) return { ok: false, reason: 'missing_licence' }
  if (!medical) return { ok: false, reason: 'missing_medical' }

  if (licence.status === 'rejected') return { ok: false, reason: 'rejected' }
  if (medical.status === 'rejected') return { ok: false, reason: 'rejected' }

  if (licence.expiry_date && licence.expiry_date < today) return { ok: false, reason: 'expired_licence' }
  if (medical.expiry_date && medical.expiry_date < today) return { ok: false, reason: 'expired_medical' }

  return { ok: true }
}

type GateReason = 'missing_licence' | 'missing_medical' | 'expired_licence' | 'expired_medical' | 'rejected' | 'pending'

function gateMessage(reason: GateReason): { title: string; body: string } {
  switch (reason) {
    case 'missing_licence':
      return { title: 'Pilot Licence Required', body: 'Upload your pilot licence to request a booking.' }
    case 'missing_medical':
      return { title: 'Medical Certificate Required', body: 'Upload your medical certificate to request a booking.' }
    case 'expired_licence':
      return { title: 'Pilot Licence Expired', body: 'Your pilot licence has expired. Please upload an updated document.' }
    case 'expired_medical':
      return { title: 'Medical Certificate Expired', body: 'Your medical certificate has expired. Please upload an updated document.' }
    case 'rejected':
      return { title: 'Document Issue', body: 'One or more documents was rejected. Please contact the operations team or re-upload.' }
    case 'pending':
    default:
      return { title: 'Verification Pending', body: 'Your documents are under review. Booking access will be enabled once approved.' }
  }
}

export default async function NewBookingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'admin') redirect('/admin')

  const verificationStatus = (profile as Profile | null)?.verification_status ?? 'not_started'

  // ── Verification status gate ──────────────────────────────────────────────
  if (verificationStatus !== 'verified') {
    const isPending    = verificationStatus === 'pending_review'
    const isNotStarted = verificationStatus === 'not_started'
    const colorCls = isPending ? 'bg-blue-500/10 border-blue-500/20' : 'bg-amber-500/10 border-amber-500/20'
    const iconColor = isPending ? 'text-blue-400' : 'text-amber-400'

    return (
      <CustomerBookingShell user={user as User} profile={profile as Profile | null}>
        <div className="px-6 md:px-10 py-10 max-w-2xl mx-auto w-full">
          <Link href="/dashboard/bookings" className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-6 transition-colors">
            <span className="material-symbols-outlined text-base">arrow_back</span>My Bookings
          </Link>
          <div className={`border rounded-[1.25rem] p-10 text-center ${colorCls}`}>
            <span className={`material-symbols-outlined text-4xl mb-4 block ${iconColor}`} style={{ fontVariationSettings: "'wght' 200" }}>
              {isPending ? 'verified_user' : isNotStarted ? 'assignment_ind' : 'lock'}
            </span>
            <h2 className="text-xl font-serif text-white mb-3">
              {isPending ? 'Account Under Review' : isNotStarted ? 'Verification Required' : 'Booking Access Unavailable'}
            </h2>
            <p className="text-oz-muted text-sm leading-relaxed mb-6">
              {isPending
                ? 'Your account is under review. Booking access will be enabled once your documents are approved.'
                : isNotStarted
                ? 'Complete your pilot verification before requesting a booking. Upload your licence, medical certificate, and proof of identity.'
                : 'Booking access is currently unavailable. Please contact the operations team for assistance.'}
            </p>
            <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 bg-oz-blue hover:bg-blue-400 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors">
              {isNotStarted ? 'Start Verification' : 'Return to Dashboard'}
            </Link>
          </div>
        </div>
      </CustomerBookingShell>
    )
  }

  // ── Fetch documents ────────────────────────────────────────────────────────
  const { data: documents } = await supabase
    .from('user_documents')
    .select('id, document_type, status, expiry_date, uploaded_at')
    .eq('user_id', user.id)

  const docGate = checkDocumentGate((documents ?? []) as UserDocument[])

  // ── Fetch aircraft (expanded fields for info bar + pricing) ───────────────
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, registration, aircraft_type, display_name, status, default_hourly_rate')
    .eq('registration', 'VH-KZG')
    .single()

  if (!aircraft) {
    return (
      <CustomerBookingShell user={user as User} profile={profile as Profile | null}>
        <div className="px-6 md:px-10 py-10 max-w-2xl mx-auto w-full">
          <div className="bg-red-500/10 border border-red-500/20 rounded-[1.25rem] p-10 text-center">
            <p className="text-red-300 text-sm">Aircraft configuration unavailable. Please contact the operations team.</p>
          </div>
        </div>
      </CustomerBookingShell>
    )
  }

  const typedProfile = profile as Profile | null
  const eligibilityBlocked = !typedProfile?.full_name || !typedProfile?.pilot_arn || !docGate.ok

  // Build eligibility warning lines for display in the form
  const eligibilityWarnings: string[] = []
  if (!typedProfile?.full_name) eligibilityWarnings.push('Your profile name is missing. Please update your profile.')
  if (!typedProfile?.pilot_arn) eligibilityWarnings.push('Your Aviation Reference Number has not been recorded. Please contact operations.')
  if (!docGate.ok) eligibilityWarnings.push(gateMessage(docGate.reason).body)

  // Standard hourly rate — use DB value when confirmed; override to $320 in the interim
  const BOOKING_HOURLY_RATE = 320

  return (
    <CustomerBookingShell user={user as User} profile={typedProfile}>
      <BookingRequestForm
          aircraftId={aircraft.id}
          aircraftRegistration={aircraft.registration}
          aircraftType={aircraft.display_name || aircraft.aircraft_type}
          aircraftStatus={aircraft.status}
          hourlyRate={BOOKING_HOURLY_RATE}
          picName={typedProfile?.full_name ?? null}
          picArn={typedProfile?.pilot_arn ?? null}
          eligibilityBlocked={eligibilityBlocked}
          eligibilityWarnings={eligibilityWarnings}
        />
    </CustomerBookingShell>
  )
}
