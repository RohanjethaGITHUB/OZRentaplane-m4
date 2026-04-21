import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import VerdictPanel from '../VerdictPanel'
import OpenFileButton from '../OpenFileButton'
import CollapsibleSection from '../CollapsibleSection'
import AdminChatPanel from '../AdminChatPanel'
import PilotMetadataEditor from '../PilotMetadataEditor'
import DocumentExpiryEditor from '../DocumentExpiryEditor'
import type { UserDocument, VerificationEvent } from '@/lib/supabase/types'

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

function statusBadge(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    not_started:    { label: 'Not Started',    color: 'bg-[#1a2b3c] text-blue-300/60' },
    pending_review: { label: 'Pending Review', color: 'bg-[#354958]/50 text-[#a3b8c9]' },
    verified:       { label: 'Verified',       color: 'bg-green-900/30 text-green-400' },
    rejected:       { label: 'Rejected',       color: 'bg-red-900/30 text-red-400' },
    on_hold:        { label: 'On Hold',        color: 'bg-amber-900/30 text-amber-400' },
  }
  const cfg = map[status] ?? { label: status, color: 'bg-white/5 text-slate-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${cfg.color}`}>
      {status === 'pending_review' && <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse" />}
      {status === 'on_hold' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
      {cfg.label}
    </span>
  )
}

export default async function AdminUserPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch customer profile
  const { data: customerProfile } = await supabase
    .from('profiles')
    .select('id, full_name, email, verification_status, created_at, updated_at, reviewed_at, admin_review_note, pilot_arn')
    .eq('id', params.id)
    .eq('role', 'customer')
    .single()

  if (!customerProfile) notFound()

  // Fetch documents and events in parallel
  const [{ data: documents }, { data: events }] = await Promise.all([
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
  ])

  const displayName = customerProfile.full_name ?? 'Unknown Customer'
  const submittedAt = customerProfile.updated_at
    ? new Date(customerProfile.updated_at).toLocaleDateString('en-AU', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '—'

  const isDecided =
    customerProfile.verification_status === 'verified' ||
    customerProfile.verification_status === 'rejected'

  const isOnHold = customerProfile.verification_status === 'on_hold'

  // Unread count: customer messages that admin hasn't read yet
  const adminUnreadCount = (events ?? []).filter(
    (ev: VerificationEvent) => ev.actor_role === 'customer' && ev.admin_read_at === null
  ).length

  // Chat open by default when there are unread messages
  const chatDefaultOpen = adminUnreadCount > 0

  // Chat events (messages + on_hold events with body), newest last for rendering
  const chatEvents = (events as VerificationEvent[] ?? []).filter(
    ev => ev.event_type === 'message' || (ev.event_type === 'on_hold' && ev.body)
  )

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
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
          <div className="md:col-span-2 space-y-6">
            {statusBadge(customerProfile.verification_status)}

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
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Submission Date</p>
                <p className="text-blue-200 text-sm">{submittedAt}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Documents</p>
                <p className="text-blue-200 text-sm">{(documents ?? []).length} / 3</p>
              </div>
            </div>
          </div>

          {/* Verification status card */}
          <div className={`backdrop-blur-xl border rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3 ${
            isOnHold
              ? 'bg-[#1e1f1a]/60 border-amber-500/15'
              : 'bg-[#1e2023]/60 border-blue-300/10'
          }`}>
            <span
              className={`material-symbols-outlined text-4xl ${
                customerProfile.verification_status === 'verified' ? 'text-green-400' :
                customerProfile.verification_status === 'rejected' ? 'text-red-400' :
                customerProfile.verification_status === 'on_hold'  ? 'text-amber-400' :
                'text-blue-300'
              }`}
              style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
            >
              {customerProfile.verification_status === 'verified' ? 'verified_user' :
               customerProfile.verification_status === 'rejected' ? 'person_off' :
               customerProfile.verification_status === 'on_hold'  ? 'pause_circle' :
               'manage_accounts'}
            </span>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Verification Status</p>
              <p className="text-sm font-semibold text-blue-100 mt-0.5">
                {customerProfile.verification_status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </p>
            </div>
          </div>
        </section>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── B: Verification Details (collapsible, default open) ─────── */}
        <CollapsibleSection title="Verification Details" defaultOpen>
          <div className="space-y-10">

            {/* Verdict panel */}
            <VerdictPanel
              customerId={customerProfile.id}
              currentStatus={customerProfile.verification_status}
              existingNote={customerProfile.admin_review_note ?? null}
              reviewedAt={customerProfile.reviewed_at ?? null}
            />

            {/* Admin review note — shown for decided customers */}
            {isDecided && customerProfile.admin_review_note && (
              <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-blue-300/10 rounded-2xl p-8">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-4 font-bold">
                  Internal Review Note
                  <span className="normal-case font-normal text-slate-600 ml-2">(not visible to customer)</span>
                </p>
                <p className="text-sm text-[#e2e2e6] leading-relaxed whitespace-pre-wrap">
                  {customerProfile.admin_review_note}
                </p>
                {customerProfile.reviewed_at && (
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest pt-5 mt-5 border-t border-white/5">
                    Recorded{' '}
                    <span className="text-slate-400 font-semibold">
                      {new Date(customerProfile.reviewed_at).toLocaleString('en-AU', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Verification history timeline */}
            {(events ?? []).length > 0 && (
              <div className="space-y-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">History</p>
                <div className="space-y-3">
                  {(events as VerificationEvent[]).map(ev => {
                    const style = EVENT_STYLE[ev.event_type] ?? EVENT_STYLE.message
                    const when  = new Date(ev.created_at).toLocaleString('en-AU', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })
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
                              ev.email_status === 'failed'  ? 'text-red-500/50' :
                              ev.email_status === 'skipped' ? 'text-slate-600' :
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
              </div>
            )}

          </div>
        </CollapsibleSection>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── C: Credential Manifest (collapsible, default collapsed) ── */}
        <CollapsibleSection title="Credential Manifest" defaultOpen={false}>
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
                  /* Entire card is a clickable area that opens the file.
                     OpenFileButton inside retains its own button for explicit action. */
                  <div
                    key={doc.id}
                    className="relative bg-[#1e2023]/60 backdrop-blur-xl border border-blue-300/5 p-6 rounded-xl group hover:bg-[#282a2d] hover:border-blue-300/15 transition-all duration-300 cursor-pointer"
                  >
                    {/* Invisible full-card click target via OpenFileButton rendered at top-level */}
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

                    {/* Full-card overlay link — sits above card content, below the button */}
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

        {/* ── D: Chat Details (collapsible, default open if unread) ──── */}
        <CollapsibleSection
          title="Chat Details"
          defaultOpen={chatDefaultOpen}
          badge={adminUnreadCount}
        >
          <AdminChatPanel
            customerId={customerProfile.id}
            events={chatEvents}
            customerName={displayName}
          />
        </CollapsibleSection>

      </div>
    </div>
  )
}
