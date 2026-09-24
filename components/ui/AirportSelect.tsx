'use client'

import React, { useState, useRef, useEffect } from 'react'

export interface AirportOption {
  id: string
  icao_code: string
  name: string
  default_landing_fee_cents?: number | null
}

interface AirportSelectProps {
  value: string
  onChange: (airportId: string) => void
  options: AirportOption[]
  disabled?: boolean
  placeholder?: string
  className?: string
}

export default function AirportSelect({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = 'Select airport...',
  className = '',
}: AirportSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedAirport = options.find((opt) => opt.id === value)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    } else {
      setSearch('')
    }
  }, [isOpen])

  const filteredOptions = options.filter((opt) => {
    if (!search.trim()) return true
    const q = search.toLowerCase().trim()
    return (
      opt.icao_code.toLowerCase().includes(q) ||
      opt.name.toLowerCase().includes(q)
    )
  })

  function handleSelect(airportId: string) {
    onChange(airportId)
    setIsOpen(false)
  }

  const formatFee = (cents?: number | null) => {
    const amt = (cents ?? 2895) / 100
    return `$${amt.toFixed(2)}`
  }

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-1.5 sm:gap-2.5 rounded-xl border bg-white px-2.5 sm:px-3.5 py-2 sm:py-2.5 text-left text-xs font-medium transition-all shadow-sm focus:outline-none ${
          disabled
            ? 'opacity-60 cursor-not-allowed bg-slate-50 border-slate-200'
            : isOpen
            ? 'border-[#1a4fd6] ring-2 ring-blue-100 shadow-md'
            : 'border-[#dbe7f4] hover:border-[#1a4fd6] hover:bg-slate-50/50'
        }`}
      >
        {selectedAirport ? (
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
            <span className="flex-shrink-0 px-1.5 sm:px-2 py-0.5 rounded-md bg-blue-100/80 text-[#1a4fd6] font-mono font-bold text-[10px] sm:text-[11px] tracking-wide border border-blue-200">
              {selectedAirport.icao_code}
            </span>
            <span className="truncate text-slate-900 font-semibold text-xs">
              {selectedAirport.name}
            </span>
            <span className="ml-auto flex-shrink-0 text-[10px] sm:text-[11px] font-bold text-slate-600 bg-slate-100 px-1.5 sm:px-2 py-0.5 rounded-md">
              {formatFee(selectedAirport.default_landing_fee_cents)}
            </span>
          </div>
        ) : (
          <span className="text-slate-400 text-xs italic">{placeholder}</span>
        )}

        <span
          className={`material-symbols-outlined text-slate-400 text-lg transition-transform duration-200 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-[#1a4fd6]' : ''
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border border-blue-100 bg-white shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Search Header */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/70">
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-2.5 text-slate-400 text-base pointer-events-none">
                search
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ICAO code or airport name..."
                className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-7 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1a4fd6] focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>
          </div>

          {/* List of Options */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5 divide-y divide-slate-50">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = opt.id === value
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelect(opt.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left text-xs transition-all ${
                      isSelected
                        ? 'bg-blue-50/90 text-[#1a4fd6] font-bold ring-1 ring-blue-200'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className={`flex-shrink-0 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold tracking-wide border ${
                          isSelected
                            ? 'bg-[#1a4fd6] text-white border-[#1a4fd6]'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {opt.icao_code}
                      </span>
                      <span className="truncate">{opt.name}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-blue-100 text-[#1a4fd6]'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {formatFee(opt.default_landing_fee_cents)}
                      </span>
                      {isSelected && (
                        <span className="material-symbols-outlined text-base text-[#1a4fd6]">
                          check
                        </span>
                      )}
                    </div>
                  </button>
                )
              })
            ) : (
              <div className="py-6 px-4 text-center text-xs text-slate-400 italic">
                No airports matching &ldquo;{search}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
