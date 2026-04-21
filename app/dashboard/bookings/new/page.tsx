import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import CustomerBookingShell from '../CustomerBookingShell'
import BookingRequestForm from './BookingRequestForm'
import type { User } from '@supabase/supabase-js'
import type { Profile, UserDocument } from '@/lib/supabase/types'

export const metadata = { title: 'Request a Booking | Pilot Dashboard' }

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

  // Check expiry (only if expiry_date is set)
  if (licence.expiry_date && licence.expiry_date < today) return { ok: false, reason: 'expired_licence' }
  if (medical.expiry_date && medical.expiry_date < today) return { ok: false, reason: 'expired_medical' }

  return { ok: true }
}

type GateReason = 'missing_licence' | 'missing_medical' | 'expired_licence' | 'expired_medical' | 'rejected' | 'pending'

function gateMessage(reason: GateReason): {
  title: string; body: string; icon: string; color: string
} {
  switch (reason) {
    case 'missing_licence':
      return { title: 'Pilot Licence Required', body: 'Upload your pilot licence to request a booking.', icon: 'description', color: 'amber' }
    case 'missing_medical':
      return { title: 'Medical Certificate Required', body: 'Upload your medical certificate to request a booking.', icon: 'medical_information', color: 'amber' }
    case 'expired_licence':
      return { title: 'Pilot Licence Expired', body: 'One or more required pilot documents has expired. Please upload updated documents before requesting a booking.', icon: 'event_busy', color: 'red' }
    case 'expired_medical':
      return { title: 'Medical Certificate Expired', body: 'Your medical certificate has expired. Please upload an updated document before requesting a booking.', icon: 'event_busy', color: 'red' }
    case 'rejected':
      return { title: 'Document Issue', body: 'One or more documents was rejected. Please contact the operations team or re-upload.', icon: 'cancel', color: 'red' }
    case 'pending':
    default:
      return { title: 'Verification Pending', body: 'Your documents are under review. Booking access will be enabled once approved.', icon: 'verified_user', color: 'blue' }
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
        <div className="pt-28 px-8 md:px-12 xl:px-16 pb-16 max-w-2xl mx-auto w-full">
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

  // ── Fetch aircraft ────────────────────────────────────────────────────────
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, registration, status')
    .eq('registration', 'VH-KZG')
    .single()

  if (!aircraft) {
    return (
      <CustomerBookingShell user={user as User} profile={profile as Profile | null}>
        <div className="pt-28 px-8 md:px-12 xl:px-16 pb-16 max-w-2xl mx-auto w-full">
          <div className="bg-red-500/10 border border-red-500/20 rounded-[1.25rem] p-10 text-center">
            <p className="text-red-300 text-sm">Aircraft configuration unavailable. Please contact the operations team.</p>
          </div>
        </div>
      </CustomerBookingShell>
    )
  }

  const typedProfile = profile as Profile | null

  return (
    <CustomerBookingShell user={user as User} profile={typedProfile}>
      <div className="pt-28 px-8 md:px-12 xl:px-16 pb-16 w-full max-w-5xl mx-auto">

        <header className="mb-10">
          <Link href="/dashboard/bookings" className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-5 transition-colors">
            <span className="material-symbols-outlined text-base">arrow_back</span>My Bookings
          </Link>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-oz-blue/60 mb-2">Fleet Booking</p>
          <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight text-white">Request a Booking</h2>
          <p className="text-oz-muted text-sm font-light mt-1">
            Submit a flight request for VH-KZG. Booking requests are reviewed by the operations team.
          </p>
          {aircraft.status !== 'available' && (
            <div className="mt-4 flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-3">
              <span className="material-symbols-outlined text-amber-400 text-lg">warning</span>
              <p className="text-sm text-amber-300">
                VH-KZG is currently <strong>{aircraft.status}</strong>. Requests may be delayed.
              </p>
            </div>
          )}
        </header>

        {/* ── Booking Eligibility Section ── */}
        <section className="mb-12">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-oz-blue/70 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">verified_user</span> Pilot Verification Status
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Aircraft */}
            <div className="bg-[#0c121e]/60 border border-white/5 rounded-xl p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-oz-blue mt-0.5" style={{ fontVariationSettings: "'wght' 300" }}>flight</span>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Aircraft</p>
                <p className="text-xs text-white font-medium">VH-KZG — Cessna 172</p>
              </div>
            </div>

            {/* Pilot Name */}
            <div className={`bg-[#0c121e]/60 border rounded-xl p-4 flex items-start gap-3 ${!typedProfile?.full_name ? 'border-red-500/30' : 'border-white/5'}`}>
              <span className={`material-symbols-outlined mt-0.5 ${!typedProfile?.full_name ? 'text-red-400' : 'text-oz-blue'}`} style={{ fontVariationSettings: "'wght' 300" }}>
                {!typedProfile?.full_name ? 'warning' : 'account_circle'}
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Pilot Name</p>
                <p className={`text-xs font-medium ${!typedProfile?.full_name ? 'text-red-300' : 'text-white'}`}>
                  {typedProfile?.full_name || 'Missing Profile Name'}
                </p>
              </div>
            </div>

            {/* ARN */}
            <div className={`bg-[#0c121e]/60 border rounded-xl p-4 flex items-start gap-3 ${!typedProfile?.pilot_arn ? 'border-amber-500/30' : 'border-white/5'}`}>
              <span className={`material-symbols-outlined mt-0.5 ${!typedProfile?.pilot_arn ? 'text-amber-400' : 'text-oz-blue'}`} style={{ fontVariationSettings: "'wght' 300" }}>
                {!typedProfile?.pilot_arn ? 'info' : 'badge'}
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Pilot ARN</p>
                <p className={`text-xs font-medium font-mono ${!typedProfile?.pilot_arn ? 'text-amber-300' : 'text-white'}`}>
                  {typedProfile?.pilot_arn || 'Missing ARN'}
                </p>
              </div>
            </div>

            {/* Documents */}
            <div className={`bg-[#0c121e]/60 border rounded-xl p-4 flex items-start gap-3 ${!docGate.ok ? 'border-red-500/30' : 'border-white/5'}`}>
              <span className={`material-symbols-outlined mt-0.5 ${!docGate.ok ? 'text-red-400' : 'text-oz-blue'}`} style={{ fontVariationSettings: "'wght' 300" }}>
                {!docGate.ok ? 'event_busy' : 'description'}
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Documents</p>
                <p className={`text-xs font-medium ${!docGate.ok ? 'text-red-300' : 'text-white'}`}>
                  {!docGate.ok ? gateMessage(docGate.reason).title : 'Valid & Current'}
                </p>
              </div>
            </div>
            
          </div>
          
          {/* Eligibility Warnings */}
          {(!typedProfile?.pilot_arn || !docGate.ok || !typedProfile?.full_name) && (
            <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-400 mt-0.5">notification_important</span>
              <div>
                <p className="text-sm font-bold text-amber-400 mb-1">Booking Access Suspended</p>
                <ul className="text-xs text-amber-300/80 space-y-1 list-disc list-inside">
                  {!typedProfile?.full_name && <li>Your profile name is missing. Please update your profile.</li>}
                  {!typedProfile?.pilot_arn && <li>Your Aviation Reference Number has not been recorded yet. Please contact operations.</li>}
                  {!docGate.ok && <li>{gateMessage(docGate.reason).body} <Link href="/dashboard" className="underline hover:text-amber-200">Manage Documents</Link></li>}
                </ul>
              </div>
            </div>
          )}
        </section>

        <BookingRequestForm
          aircraftId={aircraft.id}
          picName={typedProfile?.full_name ?? null}
          picArn={typedProfile?.pilot_arn ?? null}
          eligibilityBlocked={!typedProfile?.full_name || !typedProfile?.pilot_arn || !docGate.ok}
        />
      </div>
    </CustomerBookingShell>
  )
}
