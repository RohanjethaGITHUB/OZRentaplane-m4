'use client'

import { useState } from 'react'
import CustomerAccountForm from './CustomerAccountForm'
import ChangePasswordInline from './ChangePasswordInline'
import DeactivateModal from './DeactivateModal'

// ─── Types ───────────────────────────────────────────────────────────────────

type DocumentRow = {
  document_type: string
  status: string
}

type Props = {
  userId: string
  email: string
  initialFirstName: string
  initialLastName: string
  initialPhoneCountryCode: string
  initialPhoneNumber: string
  pilotId: string
  memberSince: string | null
  pilotType: string | null
  documents: DocumentRow[]
}

// ─── Document checklist ───────────────────────────────────────────────────────

// Matches the canonical list in lib/customer-journey.ts and DocumentsPanelV2
const REQUIRED_DOCS = [
  { type: 'pilot_licence',       label: 'Pilot Licence' },
  { type: 'medical_certificate', label: 'Medical Certificate' },
  { type: 'photo_id',            label: 'Photo ID' },
  { type: 'night_vfr_evidence',  label: 'Night VFR Evidence' },
]

// Mirrors DocumentsPanelV2 logic: anything that isn't missing/rejected/expired counts as submitted
function getDocStatus(docs: DocumentRow[], type: string): 'approved' | 'under_review' | 'rejected' | 'not_started' {
  const doc = docs.find(d => d.document_type === type)
  if (!doc) return 'not_started'
  if (doc.status === 'approved') return 'approved'
  if (doc.status === 'rejected' || doc.status === 'expired') return 'rejected'
  // uploaded, pending_review → awaiting admin review
  return 'under_review'
}

// ─── Inline donut ─────────────────────────────────────────────────────────────

function DocumentDonut({ ready, total, size = 96 }: { ready: number; total: number; size?: number }) {
  const cx    = size / 2
  const r     = size * 0.4
  const circ  = 2 * Math.PI * r
  const pct   = total > 0 ? Math.round((ready / total) * 100) : 0
  const filled = (pct / 100) * circ
  const sw    = size * 0.104
  const labelSize  = size * 0.185
  const sublabSize = size * 0.104
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
      <circle
        cx={cx} cy={cx} r={r}
        fill="none"
        stroke={pct === 100 ? '#16a34a' : '#1a4fd6'}
        strokeWidth={sw}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
      />
      <text x={cx} y={cx - 2} textAnchor="middle" fontSize={labelSize} fontWeight="700" fill="#152d5a">{pct}%</text>
      <text x={cx} y={cx + sublabSize + 4} textAnchor="middle" fontSize={sublabSize} fill="#4b6390">Complete</text>
    </svg>
  )
}

// ─── Inline toggle ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/30 ${
        checked ? 'bg-[#1a4fd6]' : 'bg-[#d1d9e8]'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

// ─── Card token ───────────────────────────────────────────────────────────────

const CARD = 'bg-white border border-[#152d5a]/10 rounded-2xl'

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ProfilePageClient({
  userId,
  email,
  initialFirstName,
  initialLastName,
  initialPhoneCountryCode,
  initialPhoneNumber,
  pilotId,
  memberSince,
  pilotType,
  documents,
}: Props) {
  const [emailNotif, setEmailNotif] = useState(true)
  const [smsNotif,   setSmsNotif]   = useState(true)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [showDeactivateModal, setShowDeactivateModal] = useState(false)

  // Count docs that are submitted (uploaded or approved) — mirrors DocumentsPanelV2 completion logic
  const readyCount = REQUIRED_DOCS.filter(d => {
    const s = getDocStatus(documents, d.type)
    return s === 'approved' || s === 'under_review'
  }).length
  const pct = REQUIRED_DOCS.length > 0 ? Math.round((readyCount / REQUIRED_DOCS.length) * 100) : 0
  const memberLabel  = memberSince
    ? new Date(memberSince).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
    : '—'
  const pilotLabel   = pilotType ?? 'Pilot'

  return (
    <div className="max-w-[1440px] mx-auto px-3 md:px-4 lg:px-6 py-8 md:py-10">

      {/* ── Pilot ID strip — visible only on desktop, mirrors hero badge ──── */}
      <div className="hidden md:flex items-center gap-3 mb-8">
        <span className="inline-flex items-center gap-2 border border-[#152d5a]/10 rounded-lg px-3 py-1.5 bg-white text-xs text-[#4b6390]">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-[#152d5a]/40">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.17-.789 3.376 3.376 0 016.34 0z"/>
          </svg>
          <span className="font-medium text-[#152d5a]">Pilot ID: {pilotId}</span>
          <span className="text-[#c4cde0]">|</span>
          <span>Member since {memberLabel}</span>
        </span>
      </div>

      {/* ══ DESKTOP: Two-column grid ══════════════════════════════════════════ */}
      <div className="hidden md:grid md:grid-cols-12 gap-6 mb-6">

        {/* Left: Personal Details */}
        <div className="md:col-span-7">
          <div className={`${CARD} p-7`}>
            <div className="flex items-center gap-2.5 mb-6">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#1a4fd6" strokeWidth="1.5" opacity="0.7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>
              </svg>
              <h2 className="font-semibold text-[#152d5a] text-xl">Personal Details</h2>
            </div>
            <CustomerAccountForm
              userId={userId}
              email={email}
              initialFirstName={initialFirstName}
              initialLastName={initialLastName}
              initialPhoneCountryCode={initialPhoneCountryCode}
              initialPhoneNumber={initialPhoneNumber}
            />
          </div>
        </div>

        {/* Right: Pilot Summary */}
        <div className="md:col-span-5">
          <div className={`${CARD} p-7 h-full flex flex-col`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#e8a020" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <h2 className="font-semibold text-[#152d5a] text-xl">Pilot Summary</h2>
              </div>
              <a href="/dashboard/documents" className="text-[13px] text-[#1a4fd6] hover:underline flex items-center gap-1">
                View Documents
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </a>
            </div>

            {/* Donut + copy */}
            <div className="flex items-center gap-5 mb-6">
              <DocumentDonut ready={readyCount} total={REQUIRED_DOCS.length} size={160} />
              <div>
                <p className="text-[#152d5a] font-semibold text-sm mb-1">
                  {pct === 100 ? 'All documents submitted!' : pct > 0 ? "You're making great progress." : 'No documents uploaded yet.'}
                </p>
                <p className="text-[#6b7ea8] text-[13px] leading-relaxed">
                  {pct === 100
                    ? 'All docs are with our team for review. We\'ll notify you once approved.'
                    : pct > 0
                    ? 'Upload the remaining documents to complete your pilot profile.'
                    : 'Upload your pilot documents to unlock faster checkouts.'}
                </p>
              </div>
            </div>

            {/* Checklist */}
            <div className="space-y-1 mt-auto">
              {REQUIRED_DOCS.map(doc => {
                const s = getDocStatus(documents, doc.type)
                return (
                  <div key={doc.type} className="flex items-center justify-between py-1.5 border-b border-[#152d5a]/5 last:border-0">
                    <div className="flex items-center gap-2.5">
                      {s === 'approved' ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="8" fill="#22c55e" fillOpacity="0.12"/>
                          <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : s === 'rejected' ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="8" fill="#ef4444" fillOpacity="0.12"/>
                          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      ) : s === 'under_review' ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="7.25" stroke="#f59e0b" strokeWidth="1.5" fill="#fef9ec"/>
                          <circle cx="8" cy="8" r="2.5" fill="#f59e0b"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="7.25" stroke="#cbd5e1" strokeWidth="1.5"/>
                        </svg>
                      )}
                      <span className="text-[13px] text-[#152d5a]">{doc.label}</span>
                    </div>
                    <span className={`text-[12px] font-medium ${
                      s === 'approved'     ? 'text-[#16a34a]' :
                      s === 'under_review' ? 'text-[#d97706]' :
                      s === 'rejected'     ? 'text-[#ef4444]' :
                      'text-[#94a3b8]'
                    }`}>
                      {s === 'approved'     ? 'Approved' :
                       s === 'under_review' ? 'Awaiting Review' :
                       s === 'rejected'     ? 'Rejected' : 'Not Started'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ══ DESKTOP: Bottom 3-col row ═════════════════════════════════════════ */}
      <div className="hidden md:grid md:grid-cols-3 gap-6 mb-8">

        {/* Communication Preferences */}
        <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-6 relative overflow-hidden opacity-60 pointer-events-none select-none">
          <div className="absolute top-4 right-4 pointer-events-none opacity-[0.07]">
            <svg width="100" height="100" fill="none" viewBox="0 0 24 24" stroke="#e8a020" strokeWidth="0.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
            </svg>
          </div>

          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-xl bg-[#fff8ec] flex items-center justify-center flex-shrink-0">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#e8a020" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
                </svg>
              </div>
              <h3 className="font-semibold text-[#152d5a] text-lg">Communication Preferences</h3>
            </div>
            <span className="text-[9px] uppercase tracking-widest text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded">Coming Soon</span>
          </div>

          <p className="text-[#6b7ea8] text-[13px] leading-relaxed">
            This section is being redesigned. Notification controls will return here soon.
          </p>
        </div>

        {/* Security & Password */}
        <div className={`${CARD} p-6 relative overflow-hidden`}>
          <div className="absolute top-4 right-4 pointer-events-none opacity-[0.06]">
            <svg width="100" height="100" fill="none" viewBox="0 0 24 24" stroke="#1a4fd6" strokeWidth="0.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
            </svg>
          </div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-11 h-11 rounded-xl bg-[#f0f4ff] flex items-center justify-center flex-shrink-0">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#1a4fd6" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
              </svg>
            </div>
            <h3 className="font-semibold text-[#152d5a] text-lg">Security & Password</h3>
          </div>
          <p className="text-[#6b7ea8] text-[13px] mb-5 leading-relaxed">Keep your account secure by updating your password and security settings.</p>
          {!showPasswordForm ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[#152d5a]">Password</span>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] text-[#6b7ea8] tracking-[0.25em]">••••••••••</span>
                  <button
                    type="button"
                    onClick={() => setShowPasswordForm(true)}
                    className="text-[12px] font-medium text-[#152d5a] border border-[#152d5a]/20 rounded-lg px-3 py-1.5 hover:bg-[#f0f4ff] hover:border-[#1a4fd6]/30 transition-colors"
                  >
                    Change Password
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-[#152d5a]/5">
                <span className="text-[13px] text-[#152d5a]">Two-Factor Authentication</span>
                <span className="text-[11px] font-semibold text-[#16a34a] bg-[#f0fdf4] border border-[#16a34a]/20 rounded-full px-2.5 py-1">Enabled</span>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[13px] font-semibold text-[#152d5a] mb-4">Change Password</p>
              <ChangePasswordInline onClose={() => setShowPasswordForm(false)} />
            </div>
          )}
        </div>

        {/* Support & Account */}
        <div className={`${CARD} p-6 relative overflow-hidden`}>
          <div className="absolute top-4 right-4 pointer-events-none opacity-[0.06]">
            <svg width="100" height="100" fill="none" viewBox="0 0 24 24" stroke="#1a4fd6" strokeWidth="0.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"/>
            </svg>
          </div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-11 h-11 rounded-xl bg-[#f0f4ff] flex items-center justify-center flex-shrink-0">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#1a4fd6" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V20.25a.75.75 0 001.28.53l3.58-3.58A48.6 48.6 0 0011.25 17c.97 0 1.934-.044 2.878-.128 1.608-.21 2.76-1.614 2.76-3.235"/>
              </svg>
            </div>
            <h3 className="font-semibold text-[#152d5a] text-lg">Support & Account</h3>
          </div>
          <p className="text-[#6b7ea8] text-[13px] mb-5 leading-relaxed">Need help or want to manage your account? We're here to assist you.</p>
          <div className="space-y-1 mb-5">
            <a href="/dashboard/messages" className="flex items-center justify-between py-2.5 border-b border-[#152d5a]/5 group hover:text-[#1a4fd6] transition-colors">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-[#6b7ea8] group-hover:text-[#1a4fd6]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"/>
                </svg>
                <span className="text-[13px] text-[#152d5a] group-hover:text-[#1a4fd6]">Contact Support</span>
              </div>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-[#94a3b8] group-hover:text-[#1a4fd6]"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </a>
            <a href="/dashboard/messages" className="flex items-center justify-between py-2.5 group hover:text-[#1a4fd6] transition-colors">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-[#6b7ea8] group-hover:text-[#1a4fd6]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0118 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/>
                </svg>
                <span className="text-[13px] text-[#152d5a] group-hover:text-[#1a4fd6]">Help Center</span>
              </div>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-[#94a3b8] group-hover:text-[#1a4fd6]"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </a>
          </div>
          <button
            type="button"
            onClick={() => setShowDeactivateModal(true)}
            className="w-full text-[13px] text-red-500 border border-red-200 rounded-xl px-4 py-2.5 hover:bg-red-50/60 transition-colors"
          >
            Deactivate Account
          </button>
        </div>
      </div>

      {/* ══ MOBILE: Profile summary card ══════════════════════════════════════ */}
      <div className="md:hidden mb-5">
        <div className={`${CARD} p-5 flex items-center gap-4`}>
          <div className="w-[72px] h-[72px] rounded-full bg-[#e8edf5] border-2 border-[#152d5a]/10 flex items-center justify-center flex-shrink-0">
            <span className="text-[#152d5a] font-semibold text-xl">
              {initialFirstName?.[0]}{initialLastName?.[0]}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#152d5a] text-[16px] leading-tight">
              {[initialFirstName, initialLastName].filter(Boolean).join(' ') || 'Pilot'}
            </p>
            <span className="inline-block text-[11px] font-semibold text-[#1a4fd6] border border-[#1a4fd6]/25 rounded-full px-2.5 py-0.5 mt-1 mb-1.5">
              {pilotLabel}
            </span>
            <p className="text-[#6b7ea8] text-[12px] leading-snug">Complete your documents to unlock faster checkouts.</p>
          </div>
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <DocumentDonut ready={readyCount} total={REQUIRED_DOCS.length} />
            <a href="/dashboard/documents" className="text-[11px] text-[#1a4fd6]">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="inline"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </a>
          </div>
        </div>
      </div>

      {/* ══ MOBILE: Settings list rows ════════════════════════════════════════ */}
      <div className="md:hidden space-y-3 mb-5">

        {/* Personal Details */}
        <a href="/dashboard/settings/personal" className={`${CARD} p-5 flex items-center gap-4 hover:border-[#152d5a]/20 transition-colors`}>
          <div className="w-10 h-10 rounded-xl bg-[#f0f4ff] flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#152d5a" strokeWidth="1.5" opacity="0.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#152d5a] text-[15px]">Personal Details</p>
            <p className="text-[#6b7ea8] text-[13px] mt-0.5">View and update your personal and contact information.</p>
          </div>
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#1a4fd6" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
        </a>

        {/* Communication Preferences */}
        <div className={`${CARD} p-5 flex items-center gap-4`}>
          <div className="w-10 h-10 rounded-xl bg-[#fff8ec] flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#e8a020" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#152d5a] text-[15px]">Communication Preferences</p>
            <p className="text-[#6b7ea8] text-[13px] mt-0.5">Manage how you'd like us to contact you about bookings, updates, and offers.</p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[#6b7ea8]">Email</span>
              <Toggle checked={emailNotif} onChange={setEmailNotif} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[#6b7ea8]">SMS</span>
              <Toggle checked={smsNotif} onChange={setSmsNotif} />
            </div>
          </div>
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#1a4fd6" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
        </div>

        {/* Security & Password */}
        <div className={`${CARD} p-5 flex items-center gap-4`}>
          <div className="w-10 h-10 rounded-xl bg-[#f0f4ff] flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#152d5a" strokeWidth="1.5" opacity="0.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#152d5a] text-[15px]">Security & Password</p>
            <p className="text-[#6b7ea8] text-[13px] mt-0.5">Keep your account secure by updating your password and security settings.</p>
          </div>
          <span className="text-[11px] font-semibold text-[#16a34a] bg-[#f0fdf4] border border-[#16a34a]/20 rounded-full px-2.5 py-1 flex-shrink-0">2FA Enabled</span>
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#1a4fd6" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
        </div>

        {/* Support & Account */}
        <a href="/dashboard/messages" className={`${CARD} p-5 flex items-center gap-4 hover:border-[#152d5a]/20 transition-colors`}>
          <div className="w-10 h-10 rounded-xl bg-[#f0f4ff] flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#1a4fd6" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V20.25a.75.75 0 001.28.53l3.58-3.58A48.6 48.6 0 0011.25 17c.97 0 1.934-.044 2.878-.128 1.608-.21 2.76-1.614 2.76-3.235"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#152d5a] text-[15px]">Support & Account</p>
            <p className="text-[#6b7ea8] text-[13px] mt-0.5">Get help or manage your account with our support tools.</p>
          </div>
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#1a4fd6" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
        </a>

        {/* Deactivate Account */}
        <button
          type="button"
          onClick={() => setShowDeactivateModal(true)}
          className="w-full bg-white border border-red-200 rounded-2xl p-5 flex items-center gap-4 hover:border-red-300 hover:bg-red-50/30 transition-colors text-left"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"/>
          </svg>
          <span className="flex-1 font-semibold text-red-500 text-[15px]">Deactivate Account</span>
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>

      {showDeactivateModal && (
        <DeactivateModal onClose={() => setShowDeactivateModal(false)} />
      )}

      {/* ══ Trust footer ══════════════════════════════════════════════════════ */}
      <div className="border-t border-[#152d5a]/8 pt-6 pb-2 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-center">
        <div className="flex items-center gap-2 text-[#6b7ea8] text-[13px]">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
          </svg>
          <span>Your data is protected with industry-standard security.</span>
        </div>
        <a href="/security" className="text-[13px] text-[#1a4fd6] hover:underline flex items-center gap-1">
          Learn more about our security practices
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
        </a>
      </div>
    </div>
  )
}
