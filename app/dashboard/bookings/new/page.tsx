import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import CustomerBookingShell from '../CustomerBookingShell'
import BookingRequestForm from './BookingRequestForm'
import { getMyProvisionalSoloBooking } from '@/app/actions/checkout'
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

  const typedProfileEarly = profile as Profile | null
  const pilotClearanceStatus = typedProfileEarly?.pilot_clearance_status ?? 'checkout_required'

  // ── Clearance gate ────────────────────────────────────────────────────────
  //
  // checkout_required → locked gate, CTA to /dashboard/checkout
  // checkout_requested / confirmed / completed_under_review → provisional mode
  // cleared_for_solo_hire → standard mode (falls through to form below)
  // other statuses → blocked gate with appropriate copy

  const PROVISIONAL_STATUSES = ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review']

  if (pilotClearanceStatus === 'checkout_required') {
    return (
      <CustomerBookingShell user={user as User} profile={typedProfileEarly}>
        <div className="px-6 md:px-10 py-10 max-w-2xl mx-auto w-full">
          <Link href="/dashboard/bookings" className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-6 transition-colors">
            <span className="material-symbols-outlined text-base">arrow_back</span>My Bookings
          </Link>
          <div className="border rounded-[1.25rem] p-10 text-center bg-blue-500/10 border-blue-500/20">
            <span className="material-symbols-outlined text-4xl mb-4 block text-blue-400" style={{ fontVariationSettings: "'wght' 200" }}>
              how_to_reg
            </span>
            <h2 className="text-xl font-serif text-white mb-3">Complete Your Checkout Flight First</h2>
            <p className="text-oz-muted text-sm leading-relaxed mb-6">
              Before you can reserve or book the aircraft, you need to submit a checkout flight request. Once your checkout request is submitted, you&apos;ll be able to reserve your first solo flight time.
            </p>
            <Link href="/dashboard/checkout" className="inline-flex items-center gap-2 px-5 py-2.5 bg-oz-blue hover:bg-blue-400 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors">
              Book Checkout Flight
            </Link>
          </div>
        </div>
      </CustomerBookingShell>
    )
  }

  if (!PROVISIONAL_STATUSES.includes(pilotClearanceStatus) && pilotClearanceStatus !== 'cleared_for_solo_hire') {
    type GateConfig = { icon: string; title: string; body: string; ctaLabel: string; ctaHref: string; colorCls: string; iconColor: string }

    const GATE: Record<string, GateConfig> = {
      additional_supervised_time_required: {
        icon:      'schedule',
        title:     'Additional Supervised Session Required',
        body:      'Following your checkout, the flight operations team has determined that additional supervised sessions are required. Book another supervised session to continue.',
        ctaLabel:  'Book Additional Supervised Session',
        ctaHref:   '/dashboard/checkout',
        colorCls:  'bg-amber-500/10 border-amber-500/20',
        iconColor: 'text-amber-400',
      },
      reschedule_required: {
        icon:      'event_repeat',
        title:     'Checkout Reschedule Required',
        body:      'Your checkout needs to be rescheduled. Please contact the operations team to arrange a new checkout session.',
        ctaLabel:  'Return to Dashboard',
        ctaHref:   '/dashboard',
        colorCls:  'bg-amber-500/10 border-amber-500/20',
        iconColor: 'text-amber-400',
      },
      not_currently_eligible: {
        icon:      'block',
        title:     'Not Currently Eligible',
        body:      'Your account is not currently eligible for solo hire. Please contact the operations team for further information.',
        ctaLabel:  'Return to Dashboard',
        ctaHref:   '/dashboard',
        colorCls:  'bg-red-500/10 border-red-500/20',
        iconColor: 'text-red-400',
      },
    }

    const g: GateConfig = GATE[pilotClearanceStatus] ?? {
      icon:      'lock',
      title:     'Solo Booking Unavailable',
      body:      'Solo hire is not available at this time. Please contact the operations team for assistance.',
      ctaLabel:  'Return to Dashboard',
      ctaHref:   '/dashboard',
      colorCls:  'bg-amber-500/10 border-amber-500/20',
      iconColor: 'text-amber-400',
    }

    const { icon, title, body, ctaLabel, ctaHref, colorCls, iconColor } = g

    return (
      <CustomerBookingShell user={user as User} profile={typedProfileEarly}>
        <div className="px-6 md:px-10 py-10 max-w-2xl mx-auto w-full">
          <Link href="/dashboard/bookings" className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-6 transition-colors">
            <span className="material-symbols-outlined text-base">arrow_back</span>My Bookings
          </Link>
          <div className={`border rounded-[1.25rem] p-10 text-center ${colorCls}`}>
            <span className={`material-symbols-outlined text-4xl mb-4 block ${iconColor}`} style={{ fontVariationSettings: "'wght' 200" }}>
              {icon}
            </span>
            <h2 className="text-xl font-serif text-white mb-3">{title}</h2>
            <p className="text-oz-muted text-sm leading-relaxed mb-6">{body}</p>
            <Link href={ctaHref} className="inline-flex items-center gap-2 px-5 py-2.5 bg-oz-blue hover:bg-blue-400 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors">
              {ctaLabel}
            </Link>
          </div>
        </div>
      </CustomerBookingShell>
    )
  }

  // ── Provisional mode: check for existing reservation ─────────────────────
  if (PROVISIONAL_STATUSES.includes(pilotClearanceStatus)) {
    const existingProvisional = await getMyProvisionalSoloBooking()
    if (existingProvisional) {
      return (
        <CustomerBookingShell user={user as User} profile={typedProfileEarly}>
          <div className="px-6 md:px-10 py-10 max-w-2xl mx-auto w-full">
            <Link href="/dashboard/bookings" className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-6 transition-colors">
              <span className="material-symbols-outlined text-base">arrow_back</span>My Bookings
            </Link>
            <div className="border rounded-[1.25rem] p-10 text-center bg-blue-500/10 border-blue-500/20">
              <span className="material-symbols-outlined text-4xl mb-4 block text-blue-400" style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}>
                bookmark
              </span>
              <h2 className="text-xl font-serif text-white mb-3">First Solo Flight Already Reserved</h2>
              <p className="text-oz-muted text-sm leading-relaxed mb-2">
                You already have a reserved first solo flight. This reservation will be confirmed after your checkout is completed and you are cleared for solo hire.
              </p>
              <p className="text-[11px] text-slate-600 font-mono mb-8">{existingProvisional.booking_reference}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/dashboard/bookings" className="inline-flex items-center gap-2 px-5 py-2.5 bg-oz-blue hover:bg-blue-400 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors">
                  View My Bookings
                </Link>
                <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/20 hover:border-white/35 text-white/70 hover:text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors">
                  Go to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </CustomerBookingShell>
      )
    }
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

  const bookingMode = pilotClearanceStatus === 'cleared_for_solo_hire' ? 'standard' : 'provisional'

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
          bookingMode={bookingMode}
        />
    </CustomerBookingShell>
  )
}
