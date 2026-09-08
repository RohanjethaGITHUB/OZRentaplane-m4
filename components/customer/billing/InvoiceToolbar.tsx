'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PaymentStatus, PaymentMethodType, SettlementType, CustomerInvoice } from './types'

export type DateRangePreset = 'all' | 'this_month' | 'last_month' | 'last_90_days' | 'this_year'

type DropdownOption = {
  value: string
  label: string
}

function PortalDropdown({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string
  onChange: (val: string) => void
  options: DropdownOption[]
  ariaLabel: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; minWidth: number }>({
    top: 0,
    left: 0,
    minWidth: 160,
  })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value) || options[0]

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const menuWidth = Math.max(rect.width, 175)
      let left = rect.left

      if (typeof window !== 'undefined') {
        if (left + menuWidth > window.innerWidth - 12) {
          left = window.innerWidth - menuWidth - 12
        }
        if (left < 12) left = 12
      }

      setCoords({
        top: rect.bottom + 6,
        left,
        minWidth: menuWidth,
      })
    }
  }

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition()
      setIsOpen(true)
    } else {
      setIsOpen(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return

    function handleScrollOrResize() {
      updatePosition()
    }
    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={handleToggle}
        className={`h-9 sm:h-10 inline-flex items-center justify-between gap-1.5 sm:gap-2 px-3 sm:px-3.5 rounded-xl border text-xs font-medium transition-colors shadow-sm whitespace-nowrap outline-none focus:outline-none ${
          isOpen
            ? 'border-[#1a4fd6] bg-white text-[#152d5a]'
            : value !== 'all'
            ? 'border-blue-200 bg-blue-50/70 text-[#1a4fd6] font-semibold hover:border-blue-300'
            : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60 text-[#152d5a]'
        }`}
      >
        <span>{selectedOption?.label}</span>
        <span
          className={`material-symbols-outlined text-[16px] sm:text-[18px] text-slate-400 transition-transform duration-150 shrink-0 ${
            isOpen ? 'rotate-180 text-[#1a4fd6]' : ''
          }`}
        >
          expand_more
        </span>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              minWidth: `${coords.minWidth}px`,
              zIndex: 99999,
            }}
            className="max-h-64 overflow-y-auto rounded-2xl bg-white border border-slate-100 shadow-[0_12px_36px_rgba(15,30,60,0.18)] ring-1 ring-black/[0.04] p-1.5 animate-in fade-in zoom-in-95 duration-100"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left whitespace-nowrap ${
                    isSelected
                      ? 'bg-blue-50 text-[#1a4fd6] font-semibold'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-[#152d5a]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && (
                    <span className="material-symbols-outlined text-[16px] text-[#1a4fd6] shrink-0">
                      check
                    </span>
                  )}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}

export default function InvoiceToolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  paymentMethodFilter,
  onPaymentMethodChange,
  settlementTypeFilter,
  onSettlementTypeChange,
  dateRangePreset,
  onDateRangeChange,
  onExport,
  isExporting = false,
}: {
  searchQuery: string
  onSearchChange: (q: string) => void
  statusFilter: string
  onStatusChange: (status: string) => void
  paymentMethodFilter: string
  onPaymentMethodChange: (method: string) => void
  settlementTypeFilter: string
  onSettlementTypeChange: (type: string) => void
  dateRangePreset: DateRangePreset
  onDateRangeChange: (preset: DateRangePreset) => void
  onExport: () => void
  isExporting?: boolean
}) {
  const [localSearch, setLocalSearch] = useState(searchQuery)

  useEffect(() => {
    setLocalSearch(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        onSearchChange(localSearch)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [localSearch, searchQuery, onSearchChange])

  const dateOptions: DropdownOption[] = [
    { value: 'all', label: 'All Time' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'last_90_days', label: 'Last 90 Days' },
    { value: 'this_year', label: 'This Year' },
  ]

  const statusOptions: DropdownOption[] = [
    { value: 'all', label: 'All Statuses' },
    { value: 'PAID', label: 'Paid' },
    { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'WAIVED', label: 'Waived' },
    { value: 'SETTLED', label: 'Settled' },
    { value: 'REFUNDED', label: 'Refunded' },
    { value: 'FAILED', label: 'Failed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ]

  const paymentMethodOptions: DropdownOption[] = [
    { value: 'all', label: 'All Methods' },
    { value: 'card', label: 'Card' },
    { value: 'cash', label: 'Cash' },
    { value: 'online_payment', label: 'Online Payment' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'other', label: 'Other' },
  ]

  const settlementTypeOptions: DropdownOption[] = [
    { value: 'all', label: 'All Settlements' },
    { value: 'CUSTOMER_PAYMENT', label: 'Customer Payment' },
    { value: 'ADMIN_WAIVER', label: 'Admin Waiver' },
    { value: 'ADMIN_SETTLEMENT', label: 'Admin Settlement' },
    { value: 'REFUND', label: 'Refund' },
    { value: 'ADJUSTMENT', label: 'Adjustment' },
  ]

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[240px] max-w-md w-full">
        <span className="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
          search
        </span>
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search invoice, booking or aircraft..."
          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-xs text-[#152d5a] placeholder:text-slate-400 shadow-sm focus:border-[#1a4fd6] focus:outline-none transition-all"
        />
        {localSearch && (
          <button
            type="button"
            onClick={() => {
              setLocalSearch('')
              onSearchChange('')
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </div>

      {/* Filter Controls: Horizontal swipeable row on mobile, flex on desktop */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none flex-nowrap w-full lg:w-auto">
        {/* Date Range Dropdown */}
        <PortalDropdown
          value={dateRangePreset}
          onChange={(val) => onDateRangeChange(val as DateRangePreset)}
          options={dateOptions}
          ariaLabel="Filter by date range"
        />

        {/* Status Dropdown */}
        <PortalDropdown
          value={statusFilter}
          onChange={onStatusChange}
          options={statusOptions}
          ariaLabel="Filter by invoice status"
        />

        {/* Payment Method Dropdown */}
        <PortalDropdown
          value={paymentMethodFilter}
          onChange={onPaymentMethodChange}
          options={paymentMethodOptions}
          ariaLabel="Filter by payment method"
        />

        {/* Settlement Type Dropdown */}
        <PortalDropdown
          value={settlementTypeFilter}
          onChange={onSettlementTypeChange}
          options={settlementTypeOptions}
          ariaLabel="Filter by settlement type"
        />

        {/* Export Button */}
        <button
          type="button"
          onClick={onExport}
          disabled={isExporting}
          className="h-9 sm:h-10 inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-xs font-semibold text-[#152d5a] shadow-sm transition-all focus:outline-none disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          <span className="material-symbols-outlined text-[16px] text-slate-600">
            download
          </span>
          {isExporting ? 'Exporting...' : 'Export'}
        </button>
      </div>
    </div>
  )
}
