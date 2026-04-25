import Link from 'next/link'
import { formatDateTime } from '@/lib/formatDateTime'

type DocSummary = { document_type: string; uploaded_at: string }

export type QueueProfile = {
  id: string
  full_name: string | null
  verification_status: string
  updated_at: string
  reviewed_at?: string | null
  admin_review_note?: string | null
}

type Props = {
  profiles: QueueProfile[]
  docsByUser: Record<string, DocSummary[]>
  totalCount: number
  dateMode: 'submitted' | 'reviewed' | 'joined'
  actionLabel?: string
  showDocs?: boolean
  /** Map of user_id → unread customer message count for admin */
  unreadByUser?: Record<string, number>
}

function getInitials(name: string | null, fallback: string): string {
  if (name) return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return fallback.slice(0, 2).toUpperCase()
}

const STATUS_BADGE: Record<string, string> = {
  not_started:    'bg-[#1a2b3c] text-blue-300/60',
  pending_review: 'bg-[#354958]/50 text-[#a3b8c9]',
  verified:       'bg-green-900/30 text-green-400',
  rejected:       'bg-red-900/30 text-red-400',
  on_hold:        'bg-amber-900/30 text-amber-400',
}

const STATUS_LABEL: Record<string, string> = {
  not_started:    'Not Started',
  pending_review: 'Pending Review',
  verified:       'Verified',
  rejected:       'Rejected',
  on_hold:        'On Hold',
}

export default function AdminQueueTable({
  profiles,
  docsByUser,
  totalCount,
  dateMode,
  actionLabel = 'Review',
  showDocs = true,
  unreadByUser = {},
}: Props) {
  const dateLabel =
    dateMode === 'submitted' ? 'Submitted At' :
    dateMode === 'reviewed'  ? 'Reviewed At'  :
    'Joined'

  const colSpan = showDocs ? 5 : 4

  return (
    <section className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10px] font-medium uppercase tracking-widest text-slate-500 bg-white/[0.01]">
              <th className="px-8 py-5">Customer Name</th>
              {showDocs && <th className="px-8 py-5 text-center">Documents</th>}
              <th className="px-8 py-5">{dateLabel}</th>
              <th className="px-8 py-5">Status</th>
              <th className="px-8 py-5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {profiles.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-8 py-16 text-center text-slate-500 text-sm font-light">
                  No records found.
                </td>
              </tr>
            ) : profiles.map(profile => {
              const name     = profile.full_name ?? 'Unknown User'
              const initials = getInitials(profile.full_name, profile.id)
              const userDocs = docsByUser[profile.id] ?? []
              const hasLicence = userDocs.some(d => d.document_type === 'pilot_licence')
              const hasMedical = userDocs.some(d => d.document_type === 'medical_certificate')
              const hasId      = userDocs.some(d => d.document_type === 'photo_id')
              const rawDate =
                dateMode === 'reviewed'  ? profile.reviewed_at :
                dateMode === 'submitted' ? profile.updated_at  :
                profile.updated_at
              const displayDate = rawDate ? formatDateTime(rawDate) : '—'
              const statusClass = STATUS_BADGE[profile.verification_status] ?? 'bg-white/5 text-slate-400'
              const statusLabel = STATUS_LABEL[profile.verification_status] ?? profile.verification_status

              const unreadCount = unreadByUser[profile.id] ?? 0

              return (
                <tr key={profile.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${
                          profile.verification_status === 'on_hold'
                            ? 'bg-amber-900/30 border-amber-300/20 text-amber-200'
                            : 'bg-blue-900/50 border-blue-300/20 text-blue-200'
                        }`}>
                          {initials}
                        </div>
                        {unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-blue-500 text-[8px] font-bold text-white tabular-nums">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-blue-100 block">{name}</span>
                        {profile.admin_review_note && (
                          <span className="text-[10px] text-slate-500 italic truncate max-w-[18rem] block" title={profile.admin_review_note}>
                            Note: {profile.admin_review_note}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  {showDocs && (
                    <td className="px-8 py-6">
                      <div className="flex justify-center gap-3">
                        <span className={`material-symbols-outlined text-lg ${hasLicence ? 'text-blue-300' : 'text-slate-600'}`} title="Pilot Licence" style={{ fontVariationSettings: "'wght' 300" }}>badge</span>
                        <span className={`material-symbols-outlined text-lg ${hasMedical ? 'text-blue-300' : 'text-slate-600'}`} title="Medical Certificate" style={{ fontVariationSettings: "'wght' 300" }}>health_and_safety</span>
                        <span className={`material-symbols-outlined text-lg ${hasId ? 'text-blue-300' : 'text-slate-600'}`} title="Photo ID" style={{ fontVariationSettings: "'wght' 300" }}>id_card</span>
                      </div>
                    </td>
                  )}
                  <td className="px-8 py-6 text-xs text-slate-400">{displayDate}</td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 text-[10px] uppercase tracking-widest font-bold rounded-full ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <Link
                      href={`/admin/users/${profile.id}`}
                      className="px-5 py-2 bg-blue-300/10 text-blue-300 hover:bg-blue-300 hover:text-[#213243] text-[10px] font-bold uppercase tracking-widest rounded-full transition-all duration-300 inline-block"
                    >
                      {actionLabel}
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="p-6 border-t border-white/5">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">
          Showing {profiles.length} of {totalCount} records
        </p>
      </div>
    </section>
  )
}
