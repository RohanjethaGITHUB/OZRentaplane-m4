'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { InstructorDirectoryItem } from '@/app/actions/instructor'
import { updateInstructorAircraftClearance } from '@/app/actions/instructor'
import {
  Search,
  School,
  Plane,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'

type Props = {
  instructors: InstructorDirectoryItem[]
}

export default function InstructorsDirectoryTable({ instructors }: Props) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending'>('all')
  const [isPending, startTransition] = useTransition()
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const filteredInstructors = instructors.filter((instructor) => {
    const matchesSearch =
      instructor.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (instructor.email ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      instructor.clearances.some((c) =>
        c.registration.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.displayName.toLowerCase().includes(searchTerm.toLowerCase())
      )

    if (!matchesSearch) return false

    const isApproved = instructor.role === 'instructor' || instructor.clearances.some((c) => c.clearanceStatus === 'approved')
    const isPending = instructor.activeCheckoutCount > 0 || instructor.clearances.some((c) => c.clearanceStatus === 'pending')

    if (statusFilter === 'approved') {
      return isApproved
    }
    if (statusFilter === 'pending') {
      return isPending
    }

    return true
  })

  const approvedCount = instructors.filter(
    (i) => i.role === 'instructor' || i.clearances.some((c) => c.clearanceStatus === 'approved')
  ).length
  const pendingCount = instructors.filter(
    (i) => i.activeCheckoutCount > 0 || i.clearances.some((c) => c.clearanceStatus === 'pending')
  ).length

  return (
    <div className="space-y-6">
      {/* ─── METRIC SUMMARY CARDS ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Instructors</p>
              <p className="text-2xl font-black text-[#0c2340] mt-1">{instructors.length}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <School className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Approved Instructors</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{approvedCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Checkouts</p>
              <p className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* ─── FILTERS & SEARCH BAR ─── */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, aircraft..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              statusFilter === 'all'
                ? 'bg-white text-[#0c2340] shadow-sm'
                : 'text-slate-600 hover:text-[#0c2340]'
            }`}
          >
            All ({instructors.length})
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              statusFilter === 'approved'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-[#0c2340]'
            }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              statusFilter === 'pending'
                ? 'bg-white text-amber-700 shadow-sm'
                : 'text-slate-600 hover:text-[#0c2340]'
            }`}
          >
            Pending ({pendingCount})
          </button>
        </div>
      </div>

      {/* ─── INSTRUCTORS LIST TABLE ─── */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
        {filteredInstructors.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <School className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#0c2340]">No instructors found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No instructor profiles match your current filter or search criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-5">Instructor</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Aircraft Clearances</th>
                  <th className="py-3.5 px-4">Active Checkouts</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredInstructors.map((instructor) => {
                  const isApproved = instructor.role === 'instructor' || instructor.clearances.some((c) => c.clearanceStatus === 'approved')
                  const isPendingStatus = instructor.activeCheckoutCount > 0 || instructor.clearances.some((c) => c.clearanceStatus === 'pending')

                  return (
                    <tr key={instructor.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Name & Avatar */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-black text-sm flex items-center justify-center shrink-0">
                            {instructor.fullName
                              .split(' ')
                              .map((n: string) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <Link
                              href={`/admin/users/${instructor.id}`}
                              className="font-bold text-[#0c2340] hover:text-blue-600 transition-colors flex items-center gap-1.5"
                            >
                              <span>{instructor.fullName}</span>
                              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                            </Link>
                            <span className="text-xs text-slate-400">{instructor.email ?? '—'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-4 px-4 text-xs text-slate-600">
                        {instructor.phone ? (
                          <span className="font-medium">{instructor.phone}</span>
                        ) : (
                          <span className="text-slate-400 italic">No phone</span>
                        )}
                      </td>

                      {/* Instructor Role Status */}
                      <td className="py-4 px-4">
                        {isApproved ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Approved
                          </span>
                        ) : isPendingStatus ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" />
                            Checkout Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Applicant
                          </span>
                        )}
                      </td>

                      {/* Aircraft Clearances */}
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {instructor.clearances.length === 0 ? (
                            <span className="text-xs text-slate-400 italic">No clearances</span>
                          ) : (
                            instructor.clearances.map((c) => {
                              const isClearanceApproved = c.clearanceStatus === 'approved'
                              const isClearancePending = c.clearanceStatus === 'pending'
                              return (
                                <span
                                  key={c.aircraftId}
                                  className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                                    isClearanceApproved
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : isClearancePending
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-slate-50 text-slate-600 border-slate-200'
                                  }`}
                                  title={`${c.displayName} (${c.registration}): ${c.clearanceStatus}`}
                                >
                                  <Plane className="w-3 h-3" />
                                  <span>{c.registration}</span>
                                  <span>({c.clearanceStatus})</span>
                                </span>
                              )
                            })
                          )}
                        </div>
                      </td>

                      {/* Active Checkout Count */}
                      <td className="py-4 px-4">
                        {instructor.activeCheckoutCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                            <span>{instructor.activeCheckoutCount} Active</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/admin/users/${instructor.id}`}
                            className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-1"
                          >
                            <span>Profile</span>
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
