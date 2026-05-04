import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import OpenFileButton from '../OpenFileButton'
import CollapsibleSection from '../CollapsibleSection'
import AdminChatPanel from '../AdminChatPanel'
import PilotMetadataEditor from '../PilotMetadataEditor'
import DocumentExpiryEditor from '../DocumentExpiryEditor'
import NextActionCard from '../NextActionCard'
import CurrentActionSection from '../CurrentActionSection'
import CheckoutActivitySection from '../CheckoutActivitySection'
import type { UserDocument, VerificationEvent } from '@/lib/supabase/types'
import { formatDateTime } from '@/lib/formatDateTime'
import { getCustomerCreditBalance, getCustomerCreditTransactions } from '@/app/actions/admin'
import { CLEARANCE_BADGE, CLEARANCE_LABEL, ACCOUNT_STATUS_BADGE, ACCOUNT_STATUS_LABEL } from '@/lib/pilot-status'
import type { PilotClearanceStatus, AccountStatus } from '@/lib/supabase/types'

const DOC_META: Record<string, { label: string; icon: string }> = {
  pilot_licence:       { label: 'Commercial Pilot Licence',    icon: 'badge' },
  medical_certificate: { label: 'Class 1 Medical Certificate', icon: 'health_and_safety' },
  photo_id:            { label: 'National Identity Card',      icon: 'id_card' },
}

const EVENT_STYLE: Record<string, { icon: string; color: string; bg: string }> = {
  submitted:   { icon: 'upload_file',   color: 'text-blue-300',   bg: 'bg-blue-900/20' },
  resubmitted: { icon: 'upload_file',   color: 'text-blue-300',   bg: 'bg-blue-900/20' },
  approved:    { icon: 'verified_user', color: 'text-green-400',  bg: 'bg-green-900/20' },
  rejected:    { icon: 'person_off',    color: 'text-red-400',    bg: 'bg-red-900/20' },
  on_hold:     { icon: 'pause_circle',  color: 'text-amber-400',  bg: 'bg-amber-900/20' },
  message:     { icon: 'chat',          color: 'text-slate-400',  bg: 'bg-slate-800/40' },
}

function fileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toUpperCase() ?? 'FILE'
}

// States that require immediate admin attention — auto-expand Current Action
const ACTION_REQUIRED: PilotClearanceStatus[] = [
  'checkout_requested',
  'checkout_completed_under_review',
  'checkout_payment_required',
  'not_currently_eligible',
]

export default async function AdminUserPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch customer profile
  const { data: customerProfile } = await supabase
    .from('profiles')
    .select('id, full_name, email, account_status, verification_status, pilot_clearance_status, created_at, updated_at, reviewed_at, admin_review_note, pilot_arn, has_night_vfr_rating, has_instrument_rating')
    .eq('id', params.id)
    .eq('role', 'customer')
    .single()

  if (!customerProfile) notFound()

  // Fetch documents, events, credits, and bookings in parallel
  const [
    { data: documents },
    { data: events },
    balanceCents,
    transactions,
    { data: checkoutBookingsRaw },
    { data: standardBookingsRaw },
  ] = await Promise.all([
    supabase
      .from('user_documents')
      .select('*')
      .eq('user_id', params.id)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('verification_events')
      .select('*')
      .eq('user_id', params.id)
      .order('created_at', { ascending: false }),
    getCustomerCreditBalance(params.id),
    getCustomerCreditTransactions(params.id),
    supabase
      .from('bookings')
      .select('id, status, booking_type, scheduled_start, payment_status, aircraft ( id, registration )')
      .eq('booking_owner_user_id', params.id)
      .eq('booking_type', 'checkout')
      .order('scheduled_start', { ascending: false })
      .limit(3),
    supabase
      .from('bookings')
      .select('id, status, booking_type, scheduled_start, payment_status, aircraft ( id, registration )')
      .eq('booking_owner_user_id', params.id)
      .eq('booking_type', 'standard')
      .order('scheduled_start', { ascending: false })
      .limit(3),
  ])

  const displayName = customerProfile.full_name ?? 'Unknown Customer'
  const submittedAt = customerProfile.updated_at
    ? formatDateTime(customerProfile.updated_at)
    : '—'

  const accountStatus   = (customerProfile.account_status ?? 'active') as AccountStatus
  const clearanceStatus = (customerProfile.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus

  const checkoutBookings  = checkoutBookingsRaw ?? []
  const standardBookings  = standardBookingsRaw ?? []
  const latestCheckoutBookingId = checkoutBookings[0]?.id ?? null

  // Unread count: customer messages that admin hasn't read yet
  const adminUnreadCount = (events ?? []).filter(
    (ev: VerificationEvent) => ev.actor_role === 'customer' && ev.admin_read_at === null
  ).length

  // Chat events (messages + on_hold events with body), newest last for rendering
  const chatEvents = (events as VerificationEvent[] ?? []).filter(
    ev => ev.event_type === 'message' || (ev.event_type === 'on_hold' && ev.body)
  )

  // Section visibility logic
  const currentActionDefaultOpen = ACTION_REQUIRED.includes(clearanceStatus)
  const hasBookingActivity = checkoutBookings.length > 0 || standardBookings.length > 0
  const activityDefaultOpen = hasBookingActivity && (
    clearanceStatus === 'checkout_requested' ||
    clearanceStatus === 'checkout_confirmed' ||
    clearanceStatus === 'checkout_completed_under_review'
  )

  // Collapsed summaries
  const docSummary      = `${(documents ?? []).length} / 3 documents`
  const creditSummary   = `$${(balanceCents / 100).toFixed(2)} credit`
  const chatSummary     = adminUnreadCount > 0 ? `${adminUnreadCount} unread` : `${chatEvents.length} messages`
  const historySummary  = `${(events ?? []).length} events`
  const activitySummary = hasBookingActivity
    ? `${checkoutBookings.length} checkout · ${standardBookings.length} standard`
    : 'No bookings'

  return (
    <div
      className="pt-8 pr-10 pb-20 pl-10"
      style={{
        backgroundImage: 'radial-gradient(at 0% 0%, rgba(183,200,222,0.04) 0, transparent 50%), radial-gradient(at 100% 0%, rgba(180,201,219,0.04) 0, transparent 50%)',
      }}
    >
      {/* Back navigation */}
      <div className="mb-10">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-blue-100 transition-colors"
        >
          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'wght' 300" }}>arrow_back</span>
          <span className="text-xs uppercase tracking-widest font-medium">Back to Queue</span>
        </Link>
      </div>

      <div className="max-w-6xl mx-auto space-y-12">

        {/* ── A: Customer Overview ──────────────────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          <div className="md:col-span-2 space-y-6">
            {/* Account + Clearance badges */}
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${ACCOUNT_STATUS_BADGE[accountStatus]}`}>
                {accountStatus === 'blocked' && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                {ACCOUNT_STATUS_LABEL[accountStatus]}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${CLEARANCE_BADGE[clearanceStatus]}`}>
                {CLEARANCE_LABEL[clearanceStatus]}
              </span>
            </div>

            <h1 className="font-serif text-5xl font-bold tracking-tight text-[#e2e2e6]">
              {displayName}
            </h1>

            <div className="flex flex-wrap gap-10">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Account</p>
                <p className="text-blue-200 text-sm">{customerProfile.email || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Pilot ARN</p>
                <PilotMetadataEditor customerId={params.id} initialArn={customerProfile.pilot_arn} />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Night VFR</p>
                <p className={`text-sm ${customerProfile.has_night_vfr_rating === true ? 'text-green-400' : customerProfile.has_night_vfr_rating === false ? 'text-blue-200' : 'text-slate-500 italic'}`}>
                  {customerProfile.has_night_vfr_rating === true ? 'Yes' : customerProfile.has_night_vfr_rating === false ? 'No' : 'Not provided'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Instrument Rating</p>
                <p className={`text-sm ${customerProfile.has_instrument_rating === true ? 'text-green-400' : customerProfile.has_instrument_rating === false ? 'text-blue-200' : 'text-slate-500 italic'}`}>
                  {customerProfile.has_instrument_rating === true ? 'Yes' : customerProfile.has_instrument_rating === false ? 'No' : 'Not provided'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Member Since</p>
                <p className="text-blue-200 text-sm">{submittedAt}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Documents</p>
                <p className="text-blue-200 text-sm">{(documents ?? []).length} / 3</p>
              </div>
            </div>
          </div>

          {/* Next Required Action card — replaces old clearance status card */}
          <NextActionCard
            clearanceStatus={clearanceStatus}
            accountStatus={accountStatus}
            latestCheckoutBookingId={latestCheckoutBookingId}
          />
        </section>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── B: Current Action ─────────────────────────────────────────── */}
        <CollapsibleSection
          title="Current Action"
          defaultOpen={currentActionDefaultOpen}
          summary={CLEARANCE_LABEL[clearanceStatus]}
        >
          <CurrentActionSection
            clearanceStatus={clearanceStatus}
            accountStatus={accountStatus}
            latestCheckoutBookingId={latestCheckoutBookingId}
            adminReviewNote={customerProfile.admin_review_note ?? null}
            reviewedAt={customerProfile.reviewed_at ?? null}
            customerId={params.id}
          />
        </CollapsibleSection>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── C: Credential Manifest ────────────────────────────────────── */}
        <CollapsibleSection
          title="Credential Manifest"
          defaultOpen={false}
          summary={docSummary}
        >
          {(documents ?? []).length === 0 ? (
            <div className="bg-[#1e2023]/60 border border-white/5 rounded-xl p-12 text-center text-slate-500 text-sm font-light">
              No documents have been uploaded by this customer yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(documents as UserDocument[]).map(doc => {
                const meta = DOC_META[doc.document_type] ?? { label: doc.document_type, icon: 'description' }
                const ext = fileExtension(doc.file_name)
                const uploadedAt = new Date(doc.uploaded_at).toLocaleString('en-AU', {
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })

                return (
                  <div
                    key={doc.id}
                    className="relative bg-[#1e2023]/60 backdrop-blur-xl border border-blue-300/5 p-6 rounded-xl group hover:bg-[#282a2d] hover:border-blue-300/15 transition-all duration-300 cursor-pointer"
                  >
                    <div className="flex justify-between items-start mb-8">
                      <span
                        className="material-symbols-outlined text-blue-300 text-3xl group-hover:text-blue-200 transition-colors"
                        style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
                      >
                        {meta.icon}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 bg-[#0c0e11] px-2 py-1 rounded">
                        {ext}
                      </span>
                    </div>

                    <p className="font-sans font-bold text-[#e2e2e6] group-hover:text-blue-300 transition-colors">
                      {meta.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 truncate">{doc.file_name}</p>

                    {doc.document_type === 'pilot_licence' && (
                      <div className="mt-3 space-y-1">
                        {doc.licence_type && (
                          <p className="text-[10px] text-slate-400">Licence: {doc.licence_type}</p>
                        )}
                        {doc.licence_number && (
                          <p className="text-[10px] text-slate-400">ARN: {doc.licence_number}</p>
                        )}
                        <p className="text-[10px] text-slate-400">
                          Night VFR:{' '}
                          <span className={customerProfile.has_night_vfr_rating === true ? 'text-green-400' : customerProfile.has_night_vfr_rating === false ? 'text-slate-300' : 'text-slate-600 italic'}>
                            {customerProfile.has_night_vfr_rating === true ? 'Yes' : customerProfile.has_night_vfr_rating === false ? 'No' : 'Not provided'}
                          </span>
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Instrument Rating:{' '}
                          <span className={customerProfile.has_instrument_rating === true ? 'text-green-400' : customerProfile.has_instrument_rating === false ? 'text-slate-300' : 'text-slate-600 italic'}>
                            {customerProfile.has_instrument_rating === true ? 'Yes' : customerProfile.has_instrument_rating === false ? 'No' : 'Not provided'}
                          </span>
                        </p>
                      </div>
                    )}

                    <div className="mt-6 flex justify-between items-end">
                      <div className="text-[10px] text-slate-500">
                        <p className="uppercase tracking-tighter">Uploaded</p>
                        <p className="font-bold mt-0.5">{uploadedAt}</p>
                      </div>
                      <OpenFileButton storagePath={doc.storage_path} fileName={doc.file_name} />
                    </div>

                    <DocumentExpiryEditor
                      documentId={doc.id}
                      customerId={params.id}
                      initialExpiry={doc.expiry_date}
                      documentType={doc.document_type}
                    />

                    <OpenFileButton
                      storagePath={doc.storage_path}
                      fileName={doc.file_name}
                      asCardOverlay
                    />
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── D: Checkout / Booking Activity ────────────────────────────── */}
        <CollapsibleSection
          title="Checkout / Booking Activity"
          defaultOpen={activityDefaultOpen}
          summary={activitySummary}
        >
          <CheckoutActivitySection
            checkoutBookings={checkoutBookings}
            standardBookings={standardBookings}
          />
        </CollapsibleSection>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── E: Billing & Credits ──────────────────────────────────────── */}
        <CollapsibleSection title="Billing & Credits" defaultOpen={false} summary={creditSummary}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-gradient-to-br from-blue-900/40 to-[#0c1326]/80 border border-blue-500/20 rounded-2xl p-8 backdrop-blur-xl flex flex-col justify-between h-full">
              <div>
                <div className="text-sm font-medium text-blue-200/70 mb-1 uppercase tracking-widest">Available Credit</div>
                <div className="text-5xl font-serif tracking-tight text-white">${(balanceCents / 100).toFixed(2)}</div>
              </div>
              <div className="mt-8 flex gap-4">
                <Link
                  href={`/admin/customers/ledger?customerId=${params.id}`}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors inline-block"
                >
                  Manage Credits & Refunds
                </Link>
              </div>
            </div>

            <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-white font-medium text-sm">Recent Activity</h3>
                <Link
                  href={`/admin/customers/ledger?customerId=${params.id}`}
                  className="text-[10px] uppercase tracking-widest font-bold text-slate-400 hover:text-white transition-colors"
                >
                  View Full History
                </Link>
              </div>
              {transactions.length === 0 ? (
                <div className="text-sm text-slate-500 italic py-4">No credit history.</div>
              ) : (
                <div className="space-y-4">
                  {transactions.slice(0, 5).map(tx => {
                    const isPositive = tx.amount_cents > 0
                    return (
                      <div key={tx.id} className="flex justify-between items-center border-b border-white/5 pb-4 last:border-0 last:pb-0">
                        <div>
                          <div className="text-sm text-slate-300 font-medium capitalize">{tx.entry_type.replace(/_/g, ' ')}</div>
                          <div className="text-xs text-slate-500">{new Date(tx.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className={`text-sm font-medium tabular-nums ${isPositive ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {isPositive ? '+' : ''}${(Math.abs(tx.amount_cents) / 100).toFixed(2)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── F: Chat Details ───────────────────────────────────────────── */}
        <CollapsibleSection
          title="Chat Details"
          defaultOpen={adminUnreadCount > 0}
          badge={adminUnreadCount}
          summary={chatSummary}
        >
          <AdminChatPanel
            customerId={customerProfile.id}
            events={chatEvents}
            customerName={displayName}
          />
        </CollapsibleSection>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── G: Internal Review History ────────────────────────────────── */}
        <CollapsibleSection
          title="Internal Review History"
          defaultOpen={false}
          summary={historySummary}
        >
          {(events ?? []).length === 0 ? (
            <div className="bg-[#1e2023]/60 border border-white/5 rounded-xl p-10 text-center text-slate-500 text-sm font-light">
              No review history on record.
            </div>
          ) : (
            <div className="space-y-3">
              {(events as VerificationEvent[]).map(ev => {
                const style = EVENT_STYLE[ev.event_type] ?? EVENT_STYLE.message
                const when  = formatDateTime(ev.created_at)
                return (
                  <div
                    key={ev.id}
                    className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-xl p-5 flex gap-4"
                  >
                    <div className={`w-9 h-9 rounded-full ${style.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <span
                        className={`material-symbols-outlined text-base ${style.color}`}
                        style={{ fontVariationSettings: "'wght' 300" }}
                      >
                        {style.icon}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-[#e2e2e6]">{ev.title}</p>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap font-mono">{when}</span>
                      </div>
                      {ev.body && ev.event_type !== 'message' && (
                        <p className="text-sm text-slate-400 leading-relaxed">{ev.body}</p>
                      )}
                      <div className="flex items-center gap-3 pt-1">
                        {ev.from_status && ev.to_status && (
                          <span className="text-[10px] text-slate-600 font-mono">
                            {ev.from_status.replace(/_/g, ' ')} → {ev.to_status.replace(/_/g, ' ')}
                          </span>
                        )}
                        <span className={`text-[10px] uppercase tracking-wider font-bold ${
                          ev.email_status === 'sent'    ? 'text-green-500/50' :
                          ev.email_status === 'failed'  ? 'text-red-500/50'   :
                          'text-slate-600'
                        }`}>
                          email: {ev.email_status}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleSection>

      </div>
    </div>
  )
}
