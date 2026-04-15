import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import VerdictPanel from '../VerdictPanel'
import OpenFileButton from '../OpenFileButton'
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
    .select('id, full_name, verification_status, created_at, updated_at, reviewed_at, admin_review_note')
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

        {/* ── Section 1: Customer overview ─────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
          <div className="md:col-span-2 space-y-6">
            {statusBadge(customerProfile.verification_status)}

            <h1 className="font-serif text-5xl font-bold tracking-tight text-[#e2e2e6]">
              {displayName}
            </h1>

            <div className="flex flex-wrap gap-10">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Submission Date</p>
                <p className="text-blue-200 text-sm">{submittedAt}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Documents Uploaded</p>
                <p className="text-blue-200 text-sm">{(documents ?? []).length} / 3</p>
              </div>
            </div>
          </div>

          {/* Status card */}
          <div className={`backdrop-blur-xl border rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3 ${
            isOnHold
              ? 'bg-[#1e1f1a]/60 border-amber-500/15'
              : 'bg-[#1e2023]/60 border-blue-300/10'
          }`}>
            <span
              className={`material-symbols-outlined text-4xl ${
                customerProfile.verification_status === 'verified' ? 'text-green-400' :
                customerProfile.verification_status === 'rejected' ? 'text-red-400' :
                customerProfile.verification_status === 'on_hold' ? 'text-amber-400' :
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

        {/* ── Section 2: Credential Manifest ───────────────────────── */}
        <section className="space-y-6">
          <h3 className="font-serif text-2xl tracking-tight text-[#e2e2e6]">Credential Manifest</h3>

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
                  <div key={doc.id} className="bg-[#1e2023]/60 backdrop-blur-xl border border-blue-300/5 p-6 rounded-xl group hover:bg-[#282a2d] transition-all duration-500">
                    <div className="flex justify-between items-start mb-8">
                      <span
                        className="material-symbols-outlined text-blue-300 text-3xl"
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
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Runway divider */}
        <div className="h-0.5 w-10 bg-[#44474c]" />

        {/* ── Section 3: Admin Review Note ─────────────────────────── */}
        {/* Shown for verified/rejected only. on_hold messages live in events below. */}
        {isDecided && (
          <section className="space-y-6">
            <h3 className="font-serif text-2xl tracking-tight text-[#e2e2e6]">Admin Review Note</h3>
            <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-blue-300/10 rounded-2xl p-8">
              {customerProfile.admin_review_note ? (
                <div className="space-y-6">
                  <p className="text-sm text-[#e2e2e6] leading-relaxed whitespace-pre-wrap">
                    {customerProfile.admin_review_note}
                  </p>
                  {customerProfile.reviewed_at && (
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest pt-5 border-t border-white/5">
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
              ) : (
                <p className="text-sm text-slate-500 italic">
                  No review note was recorded for this decision.
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Section 4: Verdict Panel ──────────────────────────────── */}
        <VerdictPanel
          customerId={customerProfile.id}
          currentStatus={customerProfile.verification_status}
          existingNote={customerProfile.admin_review_note ?? null}
          reviewedAt={customerProfile.reviewed_at ?? null}
        />

        {/* ── Section 5: Verification History ──────────────────────── */}
        {(events ?? []).length > 0 && (
          <>
            <div className="h-0.5 w-10 bg-[#44474c]" />
            <section className="space-y-6">
              <h3 className="font-serif text-2xl tracking-tight text-[#e2e2e6]">Verification History</h3>
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
                        {ev.body && (
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
            </section>
          </>
        )}

      </div>
    </div>
  )
}
