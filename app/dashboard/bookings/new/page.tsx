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

  const typedProfileEarly = profile as Profile | null
  const pilotClearanceStatus = typedProfileEarly?.pilot_clearance_status ?? 'checkout_required'

  // ── Clearance gate: only cleared_for_solo_hire pilots can create standard bookings ──
  if (pilotClearanceStatus !== 'cleared_for_solo_hire') {
    type GateConfig = { icon: string; title: string; body: string; ctaLabel: string; ctaHref: string; colorCls: string; iconColor: string }

    const GATE: Record<string, GateConfig> = {
      checkout_required: {
        icon:      'how_to_reg',
        title:     'Checkout Required',
        body:      'You must complete a checkout flight before booking solo flights. Start by selecting your preferred checkout time.',
        ctaLabel:  'Book Checkout Flight',
        ctaHref:   '/dashboard/checkout',
        colorCls:  'bg-blue-500/10 border-blue-500/20',
        iconColor: 'text-blue-400',
      },
      checkout_requested: {
        icon:      'pending_actions',
        title:     'Checkout Request Under Review',
        body:      'Your checkout request has been submitted and is awaiting confirmation. Solo bookings will unlock once your checkout is completed and you are cleared for solo hire.',
        ctaLabel:  'View My Bookings',
        ctaHref:   '/dashboard/bookings',
        colorCls:  'bg-blue-500/10 border-blue-500/20',
        iconColor: 'text-blue-400',
      },
      checkout_confirmed: {
        icon:      'event_available',
        title:     'Checkout Flight Confirmed',
        body:      'Your checkout flight has been confirmed. Solo bookings will unlock once your checkout is completed and your clearance status is updated.',
        ctaLabel:  'View My Bookings',
        ctaHref:   '/dashboard/bookings',
        colorCls:  'bg-blue-500/10 border-blue-500/20',
        iconColor: 'text-blue-400',
      },
      checkout_completed_under_review: {
        icon:      'rate_review',
        title:     'Awaiting Checkout Outcome',
        body:      'Your checkout flight has been completed and is awaiting review. Solo bookings will unlock once you are cleared for solo hire.',
        ctaLabel:  'View My Bookings',
        ctaHref:   '/dashboard/bookings',
        colorCls:  'bg-amber-500/10 border-amber-500/20',
        iconColor: 'text-amber-400',
      },
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
