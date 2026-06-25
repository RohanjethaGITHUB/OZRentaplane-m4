'use client'

import { useEffect, useMemo, useState } from 'react'
import ModalPortal from '@/components/ModalPortal'

export interface DocumentFile {
  url: string
  name: string
  mimeType?: string
}

export interface DocumentViewerModalProps {
  isOpen: boolean
  onClose: () => void
  files: DocumentFile[]
  initialIndex?: number
  title?: string
}

type RenderKind = 'pdf' | 'image' | 'iframe'

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0
  if (index < 0) return 0
  if (index >= count) return count - 1
  return index
}

function getRenderKind(file: DocumentFile): RenderKind {
  const mimeType = file.mimeType?.toLowerCase().trim()
  if (mimeType) {
    if (mimeType === 'application/pdf') return 'pdf'
    if (mimeType.startsWith('image/')) return 'image'
    return 'iframe'
  }

  const url = file.url.toLowerCase()
  if (url.match(/\.(pdf)(?:[?#].*)?$/)) return 'pdf'
  if (url.match(/\.(jpe?g|png|gif|webp)(?:[?#].*)?$/)) return 'image'
  return 'iframe'
}

function LoadingState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <svg
          className="h-6 w-6 animate-spin text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
          <path
            d="M22 12a10 10 0 0 0-10-10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <p className="text-sm font-medium">Loading document...</p>
      </div>
    </div>
  )
}

export default function DocumentViewerModal({
  isOpen,
  onClose,
  files,
  initialIndex = 0,
  title,
}: DocumentViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const fileCount = files.length
  const clampedInitialIndex = clampIndex(initialIndex, fileCount)
  const currentFile = useMemo(
    () => files[clampIndex(currentIndex, fileCount)] ?? null,
    [currentIndex, fileCount, files],
  )

  useEffect(() => {
    if (!isOpen) return
    setCurrentIndex(clampedInitialIndex)
  }, [isOpen, clampedInitialIndex])

  useEffect(() => {
    if (!isOpen) return
    setCurrentIndex((index) => clampIndex(index, fileCount))
  }, [isOpen, fileCount])

  useEffect(() => {
    if (!isOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (fileCount <= 1) return

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setCurrentIndex((index) => Math.max(0, index - 1))
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setCurrentIndex((index) => Math.min(fileCount - 1, index + 1))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, fileCount, onClose])

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  useEffect(() => {
    setIsLoading(true)
  }, [currentIndex, isOpen])

  if (!isOpen || fileCount === 0 || !currentFile) return null

  const renderKind = getRenderKind(currentFile)
  const headerTitle = title ?? currentFile.name
  const isMultiFile = fileCount > 1

  function goPrev() {
    setCurrentIndex((index) => Math.max(0, index - 1))
  }

  function goNext() {
    setCurrentIndex((index) => Math.min(fileCount - 1, index + 1))
  }

  return (
    <ModalPortal lockScroll={false}>
      <div
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-0 sm:p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="document-viewer-title"
          className="flex h-full w-full flex-col overflow-hidden bg-white sm:max-h-[90vh] sm:max-w-4xl sm:rounded-2xl shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 id="document-viewer-title" className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                  {headerTitle}
                </h2>
                {isMultiFile ? (
                  <span className="text-xs font-medium text-slate-500">
                    File {currentIndex + 1} of {fileCount}
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close document viewer"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>

          <div className="relative flex-1 overflow-y-auto bg-slate-50">
            {renderKind === 'pdf' || renderKind === 'iframe' ? (
              <iframe
                key={currentFile.url}
                src={currentFile.url}
                title={currentFile.name}
                className="h-full min-h-[60vh] w-full"
                onLoad={() => setIsLoading(false)}
              />
            ) : (
              <div className="flex min-h-[60vh] items-center justify-center p-4">
                <img
                  key={currentFile.url}
                  src={currentFile.url}
                  alt={currentFile.name}
                  className="mx-auto max-h-full max-w-full object-contain"
                  onLoad={() => setIsLoading(false)}
                  onError={() => setIsLoading(false)}
                />
              </div>
            )}

            {isLoading ? <LoadingState /> : null}
          </div>

          {isMultiFile ? (
            <div className="flex items-center justify-center gap-3 border-t border-slate-200 px-5 py-4 sm:px-6 sm:py-5">
              <button
                type="button"
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="truncate max-w-[40%] text-sm text-slate-500">
                {currentFile.name}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={currentIndex === fileCount - 1}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  )
}
