'use client'

import { useState } from 'react'
import DocumentViewerModal from '@/components/ui/DocumentViewerModal'
import type { DocumentFile } from '@/components/ui/DocumentViewerModal'

type Attachment = {
  signedUrl: string
  file_name: string
  created_at: string
  file_size: number | null
  id: string
}

type Props = {
  attachments: Attachment[]
}

export default function AttachmentViewer({ attachments }: Props) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerFiles, setViewerFiles] = useState<DocumentFile[]>([])
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0)

  function openAttachmentViewer(startIndex: number) {
    setViewerFiles(attachments.map((attachment) => ({ url: attachment.signedUrl, name: attachment.file_name })))
    setViewerInitialIndex(startIndex)
    setViewerOpen(true)
  }

  return (
    <>
      <div className="rounded-2xl border border-[var(--admin-border)] bg-white p-6 shadow-[var(--admin-shadow-panel)]">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xs font-semibold tracking-widest text-[var(--admin-text-muted)] uppercase">Evidence Photos</h3>
          <span className="text-[10px] text-[var(--admin-text-muted)] uppercase tracking-widest">
            {attachments.length} file{attachments.length !== 1 ? 's' : ''}
          </span>
        </div>
        {attachments.length === 0 ? (
          <div className="h-20 flex items-center justify-center text-sm text-[var(--admin-text-muted)] bg-[#f7f9fc] rounded-xl border border-[var(--admin-border)]">
            No evidence photos uploaded.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {attachments.map((att, index) => (
              <button key={att.id} type="button" onClick={() => openAttachmentViewer(index)} className="group relative aspect-square rounded-xl overflow-hidden border border-[var(--admin-border)] bg-[#f7f9fc] text-left">
                {att.signedUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={att.signedUrl}
                    alt={att.file_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-slate-600 text-3xl">image_not_supported</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-white/0 group-hover:bg-[#0c2340]/55 transition-colors flex items-end">
                  <div className="w-full p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                    <p className="text-[9px] text-white/90 truncate leading-tight">{att.file_name}</p>
                    <p className="text-[8px] text-white/70">
                      {new Date(att.created_at).toLocaleDateString('en-AU', {
                        timeZone: 'Australia/Sydney',
                        day: 'numeric', month: 'short',
                      })}
                      {att.file_size != null && ` · ${(att.file_size / 1024).toFixed(0)} KB`}
                    </p>
                  </div>
                </div>
                <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-white/85 backdrop-blur-sm border border-white/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                  <span className="material-symbols-outlined text-[#0c2340] text-[13px]">open_in_new</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        files={viewerFiles}
        initialIndex={viewerInitialIndex}
        title="Flight Record Attachments"
      />
    </>
  )
}
