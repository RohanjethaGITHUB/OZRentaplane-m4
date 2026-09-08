'use client'

import React, { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  CustomerInvoice,
  BlockTimePackageSummary,
  FlightUsageItem,
  RecentActivityItem,
  CustomerBillingDetails,
} from './billing/types'
import PaymentSummaryCards from './billing/PaymentSummaryCards'
import InvoiceToolbar, { DateRangePreset } from './billing/InvoiceToolbar'
import InvoiceStatusTabs, { TabKey } from './billing/InvoiceStatusTabs'
import InvoiceTable from './billing/InvoiceTable'
import InvoiceDetailsDrawer from './billing/InvoiceDetailsDrawer'
import RecentPaymentActivity from './billing/RecentPaymentActivity'
import { formatDateFromISO } from '@/lib/formatDateTime'

function formatAud(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(amount)
}

export type {
  CustomerInvoice,
  CustomerInvoice as CustomerInvoiceItem,
  BlockTimePackageSummary,
  FlightUsageItem,
}

export default function CustomerPaymentsInvoicesClient({
  invoices,
  packages = [],
  usage = [],
  recentActivities = [],
  customerName,
  customerEmail,
  customerPhone,
  customerAddress,
  totalSpent,
  outstandingBalance,
  bankDetails,
  hideTopCards = false,
}: {
  invoices: CustomerInvoice[]
  packages?: BlockTimePackageSummary[]
  usage?: FlightUsageItem[]
  recentActivities?: RecentActivityItem[]
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  customerAddress?: string | null
  totalSpent: number
  outstandingBalance: number
  bankDetails?: { accountName: string; bsb: string; accountNumber: string } | null
  hideTopCards?: boolean
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all')
  const [settlementTypeFilter, setSettlementTypeFilter] = useState('all')
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('all')
  const [sortField, setSortField] = useState<'date' | 'amount'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const pageSize = 8

  // Drawer state
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerInvoice | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type })
    setTimeout(() => {
      setToastMessage(null)
    }, 4000)
  }

  // Calculate Tab Counts
  const tabCounts = useMemo(() => {
    return {
      all: invoices.length,
      paid: invoices.filter((i) => i.status === 'PAID').length,
      partial: invoices.filter((i) => i.status === 'PARTIALLY_PAID').length,
      pending: invoices.filter((i) => i.status === 'PENDING').length,
      refunded: invoices.filter((i) => i.status === 'REFUNDED').length,
      waived: invoices.filter((i) => i.status === 'WAIVED' || i.settlementType === 'ADMIN_WAIVER').length,
      settled: invoices.filter((i) => i.status === 'SETTLED' || i.settlementType === 'ADMIN_SETTLEMENT').length,
      failed: invoices.filter((i) => i.status === 'FAILED').length,
      packages: packages.length,
      usage: usage.length,
    }
  }, [invoices, packages, usage])

  // Filter & Sort Invoices
  const filteredInvoices = useMemo(() => {
    let list = [...invoices]

    // Tab Filter
    if (activeTab === 'paid') {
      list = list.filter((i) => i.status === 'PAID')
    } else if (activeTab === 'partial') {
      list = list.filter((i) => i.status === 'PARTIALLY_PAID')
    } else if (activeTab === 'pending') {
      list = list.filter((i) => i.status === 'PENDING')
    } else if (activeTab === 'refunded') {
      list = list.filter((i) => i.status === 'REFUNDED')
    } else if (activeTab === 'waived') {
      list = list.filter((i) => i.status === 'WAIVED' || i.settlementType === 'ADMIN_WAIVER')
    } else if (activeTab === 'settled') {
      list = list.filter((i) => i.status === 'SETTLED' || i.settlementType === 'ADMIN_SETTLEMENT')
    } else if (activeTab === 'failed') {
      list = list.filter((i) => i.status === 'FAILED')
    }

    // Status Dropdown Filter
    if (statusFilter !== 'all') {
      list = list.filter((i) => i.status === statusFilter)
    }

    // Payment Method Filter
    if (paymentMethodFilter !== 'all') {
      list = list.filter((i) => {
        if (paymentMethodFilter === 'card') return i.paymentMethod === 'card' || (i.paymentMethod as string) === 'stripe'
        return i.paymentMethod === paymentMethodFilter
      })
    }

    // Settlement Type Filter
    if (settlementTypeFilter !== 'all') {
      list = list.filter((i) => i.settlementType === settlementTypeFilter)
    }

    // Date Range Filter
    if (dateRangePreset !== 'all') {
      const now = new Date()
      list = list.filter((i) => {
        const itemDate = new Date(i.date)
        if (dateRangePreset === 'this_month') {
          return itemDate.getFullYear() === now.getFullYear() && itemDate.getMonth() === now.getMonth()
        }
        if (dateRangePreset === 'last_month') {
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          return (
            itemDate.getFullYear() === lastMonth.getFullYear() &&
            itemDate.getMonth() === lastMonth.getMonth()
          )
        }
        if (dateRangePreset === 'last_90_days') {
          const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          return itemDate >= ninetyDaysAgo
        }
        if (dateRangePreset === 'this_year') {
          return itemDate.getFullYear() === now.getFullYear()
        }
        return true
      })
    }

    // Search Query (invoice number, booking reference, aircraft registration, model, service name)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((i) => {
        return (
          i.invoiceNumber.toLowerCase().includes(q) ||
          i.serviceName.toLowerCase().includes(q) ||
          (i.bookingReference && i.bookingReference.toLowerCase().includes(q)) ||
          (i.aircraftRegistration && i.aircraftRegistration.toLowerCase().includes(q)) ||
          (i.aircraftModel && i.aircraftModel.toLowerCase().includes(q))
        )
      })
    }

    // Sorting
    list.sort((a, b) => {
      if (sortField === 'date') {
        const timeA = new Date(a.date).getTime()
        const timeB = new Date(b.date).getTime()
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA
      } else {
        return sortOrder === 'asc' ? a.amount - b.amount : b.amount - a.amount
      }
    })

    return list
  }, [
    invoices,
    activeTab,
    statusFilter,
    paymentMethodFilter,
    settlementTypeFilter,
    dateRangePreset,
    searchQuery,
    sortField,
    sortOrder,
  ])

  const handleSortChange = (field: 'date' | 'amount') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  // Actions
  const handleViewInvoice = useCallback((inv: CustomerInvoice) => {
    setSelectedInvoice(inv)
    setIsDrawerOpen(true)
  }, [])

  const handleDownloadInvoice = useCallback(
    async (inv: CustomerInvoice) => {
      setDownloadingId(inv.id)
      try {
        const downloadUrl = inv.bookingId
          ? `/dashboard/bookings/${inv.bookingId}/invoice`
          : inv.pdfUrl ?? null

        if (downloadUrl) {
          window.open(downloadUrl, '_blank')
          showToast(`Invoice ${inv.invoiceNumber} downloaded successfully.`)
        } else {
          // Fallback trigger print
          window.print()
        }
      } catch (err) {
        showToast('Unable to download invoice. Please try again.', 'error')
      } finally {
        setDownloadingId(null)
      }
    },
    [],
  )


  // Export Filtered to CSV
  const handleExport = useCallback(() => {
    if (filteredInvoices.length === 0) {
      showToast('No invoices to export.', 'error')
      return
    }

    const headers = [
      'Invoice #',
      'Service',
      'Aircraft',
      'Booking Ref',
      'Date',
      'Amount (AUD)',
      'Payment Method',
      'Settlement Type',
      'Status',
    ]

    const rows = filteredInvoices.map((inv) => [
      `"${inv.invoiceNumber}"`,
      `"${inv.serviceName}"`,
      `"${inv.aircraftRegistration || ''}"`,
      `"${inv.bookingReference || ''}"`,
      `"${formatDateFromISO(inv.date)}"`,
      inv.amount.toFixed(2),
      `"${inv.paymentMethod}"`,
      `"${inv.settlementType}"`,
      `"${inv.status}"`,
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `ozrentaplane_invoices_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    showToast('Invoices exported successfully.')
  }, [filteredInvoices])

  const billingDetails: CustomerBillingDetails = useMemo(() => {
    return {
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
      address: customerAddress || '123 Aviation Drive, Melbourne, VIC 3000 Australia',
    }
  }, [customerName, customerEmail, customerPhone, customerAddress])

  return (
    <div className="space-y-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold animate-in slide-in-from-bottom duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-700'
              : 'bg-red-900 text-white border-red-700'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {toastMessage.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toastMessage.text}
        </div>
      )}

      {/* 3 Top Summary KPI Cards */}
      {!hideTopCards && (
        <PaymentSummaryCards
          totalSpent={totalSpent}
          totalInvoicesCount={invoices.length}
          paidInvoicesCount={tabCounts.paid}
          outstandingBalance={outstandingBalance}
          pendingInvoicesCount={tabCounts.pending}
          onPayNowClick={() => {
            setActiveTab('pending')
            const el = document.getElementById('invoices-main-container')
            el?.scrollIntoView({ behavior: 'smooth' })
          }}
        />
      )}

      {/* Main Container */}
      <div
        id="invoices-main-container"
        className="bg-white rounded-3xl border border-[#152d5a]/10 shadow-[0_4px_20px_rgba(21,45,90,0.04)] overflow-hidden"
      >
        {/* Toolbar & Filters */}
        <div className="p-6 md:p-8 border-b border-[#152d5a]/[0.08] space-y-5 bg-gradient-to-b from-white to-[#f9fbff]/70">
          <InvoiceToolbar
            searchQuery={searchQuery}
            onSearchChange={(q) => {
              setSearchQuery(q)
              setPage(1)
            }}
            statusFilter={statusFilter}
            onStatusChange={(st) => {
              setStatusFilter(st)
              setPage(1)
            }}
            paymentMethodFilter={paymentMethodFilter}
            onPaymentMethodChange={(m) => {
              setPaymentMethodFilter(m)
              setPage(1)
            }}
            settlementTypeFilter={settlementTypeFilter}
            onSettlementTypeChange={(st) => {
              setSettlementTypeFilter(st)
              setPage(1)
            }}
            dateRangePreset={dateRangePreset}
            onDateRangeChange={(dr) => {
              setDateRangePreset(dr)
              setPage(1)
            }}
            onExport={handleExport}
          />

          {/* Status Tabs with count pills */}
          <div className="pt-2 border-t border-slate-100">
            <InvoiceStatusTabs
              activeTab={activeTab}
              onTabChange={(t) => {
                setActiveTab(t)
                setPage(1)
              }}
              counts={tabCounts}
            />
          </div>
        </div>

        {/* Tab-Dependent Content */}
        {activeTab === 'packages' ? (
          /* Packages View */
          <div className="p-6 md:p-8">
            {packages.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">sell</span>
                <p className="font-bold text-slate-700 text-sm">No block-time packages found</p>
                <Link
                  href="/dashboard/pricing"
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#152d5a] text-white text-xs font-bold hover:bg-[#1a3a6e] transition-colors"
                >
                  Browse Packages
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="border border-slate-200 rounded-2xl p-5 bg-slate-50/50 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-[#152d5a] text-base">{pkg.name}</h3>
                        <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 capitalize">
                          {pkg.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Purchased {formatDateFromISO(pkg.purchasedAt)} · Expires{' '}
                        {formatDateFromISO(pkg.expiresAt)}
                      </p>
                      <div className="mt-4 p-3 rounded-xl bg-white border border-slate-100 flex items-center justify-between text-sm">
                        <span className="text-slate-500 font-medium">Hours Remaining:</span>
                        <span className="font-bold text-[#152d5a]">
                          {pkg.hoursRemaining.toFixed(1)} / {pkg.hoursPurchased} hrs
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Rate: ${pkg.ratePerHour}/hr</span>
                      <span className="font-bold text-[#152d5a]">{formatAud(pkg.amountPaid)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'usage' ? (
          /* Flight Usage View */
          <div className="p-6 md:p-8">
            {usage.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">flight_land</span>
                <p className="font-bold text-slate-700 text-sm">No flights billed to block time yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="px-5 py-3.5">Date</th>
                      <th className="px-5 py-3.5">Booking / Aircraft</th>
                      <th className="px-5 py-3.5 text-right">Hours Flown</th>
                      <th className="px-5 py-3.5 text-right">Remaining Balance</th>
                      <th className="px-5 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {usage.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/50">
                        <td className="px-5 py-4 text-xs text-slate-600">{formatDateFromISO(u.date)}</td>
                        <td className="px-5 py-4 font-semibold text-[#152d5a]">
                          {u.aircraftReg ?? 'Aircraft'} ·{' '}
                          <span className="font-mono text-xs font-normal text-slate-500">
                            {u.bookingRef ?? u.bookingId.slice(0, 8).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-[#152d5a]">
                          {u.hoursDeducted.toFixed(1)} hrs
                        </td>
                        <td className="px-5 py-4 text-right text-xs text-slate-500">
                          {u.hoursAfter.toFixed(1)} hrs left
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/dashboard/bookings/${u.bookingId}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#1a4fd6] hover:underline"
                          >
                            View Booking →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Primary Invoices Table */
          <InvoiceTable
            invoices={filteredInvoices}
            onViewInvoice={handleViewInvoice}
            onDownloadInvoice={handleDownloadInvoice}
            downloadingId={downloadingId}
            sortField={sortField}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            page={page}
            pageSize={pageSize}
            onPageChange={(newPage) => setPage(newPage)}
          />
        )}
      </div>

      {/* Recent Payment Activity Timeline Section */}
      <RecentPaymentActivity
        activities={recentActivities}
        onViewAll={() => {
          setActiveTab('all')
          const el = document.getElementById('invoices-main-container')
          el?.scrollIntoView({ behavior: 'smooth' })
        }}
      />

      {/* Slide-out Invoice Details Drawer */}
      <InvoiceDetailsDrawer
        invoice={selectedInvoice}
        billingDetails={billingDetails}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onDownloadPdf={handleDownloadInvoice}
        isDownloading={downloadingId === selectedInvoice?.id}
      />
    </div>
  )
}
