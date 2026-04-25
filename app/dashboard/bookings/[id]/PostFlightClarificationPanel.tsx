'use client'

import { useState } from 'react'
import Link from 'next/link'
import FlightRecordResubmitForm from './FlightRecordResubmitForm'
import type { FlightRecord, FlightRecordAttachment, FlightRecordClarification } from '@/lib/supabase/booking-types'

type AttachmentWithUrl = FlightRecordAttachment & { signedUrl: string | null }

type Props = {
  clarification:       FlightRecordClarification
  flightRecord:        FlightRecord
  bookingId:           string
  existingAttachments: AttachmentWithUrl[]
}

export default function PostFlightClarificationPanel({
  clarification, flightRecord, bookingId, existingAttachments,
}: Props) {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="space-y-4">

      {/* Clarification card */}
      <div className="bg-amber-500/[0.07] border border-amber-500/25 rounded-[1.25rem] p-6">
        <div className="flex items-start gap-3 mb-4">
          <span
            className="material-symbols-outlined text-amber-400 text-xl flex-shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            warning
          </span>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-amber-400">
              Action Required — Clarification Needed
            </h3>
            <p className="text-xs text-amber-400/60 mt-0.5">
              Operations needs more information before your flight record can be approved.
            </p>
          </div>
        </div>

        {/* Category badge */}
        <div className="mb-3">
          <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
            {clarification.category}
          </span>
        </div>

        {/* Admin message */}
        <div className="bg-amber-500/[0.06] border border-amber-500/15 rounded-xl p-4 mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/50 mb-2">
            Message from Operations
          </p>
          <p className="text-sm text-slate-200 leading-relaxed">{clarification.message}</p>
        </div>

        {/* What to do */}
        <div className="text-xs text-amber-400/70 leading-relaxed mb-5 space-y-1">
          <p>To resolve this:</p>
          <ol className="list-decimal list-inside space-y-0.5 ml-2">
            <li>Update your flight record with the corrected information below.</li>
            <li>Add additional photos if operations requested them.</li>
            <li>Click <strong className="text-amber-300">Resubmit for Review</strong> to formally resubmit.</li>
          </ol>
          <p className="mt-2 text-amber-400/50">
            Sending a message alone will not count as a resubmission.
          </p>
        </div>

        {/* Existing submitted evidence */}
        {existingAttachments.length > 0 && (
          <div className="pt-4 border-t border-amber-500/15">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/50 mb-3">
              Already Attached ({existingAttachments.length} photo{existingAttachments.length !== 1 ? 's' : ''})
            </p>
            <div className="flex flex-wrap gap-2">
              {existingAttachments.map(att => (
                <div
                  key={att.id}
                  className="w-14 h-14 rounded-lg overflow-hidden border border-white/10 bg-[#050c17] flex-shrink-0 relative"
                  title={att.file_name}
                >
                  {att.signedUrl
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={att.signedUrl} alt={att.file_name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-slate-700 text-sm">image</span></div>
                  }
                  <div className="absolute inset-0 bg-emerald-500/20" />
                  <span
                    className="absolute bottom-0.5 right-0.5 material-symbols-outlined text-[11px] text-emerald-400"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    cloud_done
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-amber-400/40 mt-2">
              These files are already saved. You can add more photos below.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowForm(v => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">edit</span>
            {showForm ? 'Hide Update Form' : 'Update Flight Record'}
          </button>
          <Link
            href="/dashboard/messages"
            className="inline-flex items-center gap-2 px-4 py-2 border border-white/10 hover:border-white/20 text-slate-400 hover:text-white rounded-lg text-xs font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">chat</span>
            Open Messages
          </Link>
        </div>
      </div>

      {/* Inline update form */}
      {showForm && (
        <FlightRecordResubmitForm
          flightRecord={flightRecord}
          bookingId={bookingId}
          onSuccess={() => setShowForm(false)}
        />
      )}

    </div>
  )
}
