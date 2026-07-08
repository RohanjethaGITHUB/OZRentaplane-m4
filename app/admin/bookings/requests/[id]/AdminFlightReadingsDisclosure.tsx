'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

type DisclosureContextValue = {
  open: boolean
  sectionRef: RefObject<HTMLDivElement>
  openAndScroll: () => void
}

const DisclosureContext = createContext<DisclosureContextValue | null>(null)

function useDisclosureContext() {
  const context = useContext(DisclosureContext)
  if (!context) {
    throw new Error('AdminFlightReadingsDisclosure components must be used within the provider.')
  }
  return context
}

export function AdminFlightReadingsDisclosureProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const sectionRef = useRef<HTMLDivElement | null>(null)
  const shouldScrollRef = useRef(false)

  useEffect(() => {
    if (!open || !shouldScrollRef.current) return
    shouldScrollRef.current = false
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [open])

  const openAndScroll = () => {
    shouldScrollRef.current = true
    setOpen(true)
  }

  return (
    <DisclosureContext.Provider value={{ open, sectionRef, openAndScroll }}>
      {children}
    </DisclosureContext.Provider>
  )
}

export function AdminFlightReadingsDisclosureTrigger({
  className = '',
  label,
  variant = 'primary',
}: {
  className?: string
  label: string
  variant?: 'primary' | 'secondary'
}) {
  const { openAndScroll } = useDisclosureContext()

  return (
    <button
      type="button"
      onClick={openAndScroll}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2',
        variant === 'primary'
          ? 'bg-[#1a4fd6] text-white hover:bg-[#1540a8] focus:ring-[#1a4fd6]/30'
          : 'border border-[#1a4fd6]/15 bg-white text-[#1a4fd6] hover:bg-[#f0f6ff] focus:ring-[#1a4fd6]/20',
        className,
      ].join(' ')}
    >
      <span className="material-symbols-outlined text-[18px]">assignment_turned_in</span>
      {label}
    </button>
  )
}

export function AdminFlightReadingsDisclosureSection({ children }: { children: ReactNode }) {
  const { open, sectionRef } = useDisclosureContext()

  if (!open) return null

  return (
    <div ref={sectionRef} className="scroll-mt-24">
      {children}
    </div>
  )
}
