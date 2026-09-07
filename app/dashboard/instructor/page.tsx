'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { FadeUp, StaggerContainer, StaggerItem, HoverEmphasize } from '@/components/MotionPresets'
import {
  getInstructorApplicationStatus,
  getInstructorFleetClearances,
  getInstructorStudents,
  addInstructorStudent,
  removeInstructorStudent,
  type InstructorApplicationState,
  type InstructorFleetClearanceItem,
  type InstructorStudentItem,
} from '@/app/actions/instructor'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Info,
  ExternalLink,
  HelpCircle,
  Calendar,
  ShieldCheck,
  Clock,
  Award,
  AlertCircle,
  Plane,
  Users,
  UserPlus,
  BookOpen,
  FileCheck,
  Plus,
  X,
  Search,
  Phone,
  Mail,
  GraduationCap,
} from 'lucide-react'

// Aircraft selection options for candidate view
const AIRCRAFT_OPTIONS = [
  {
    id: 'cessna-172n',
    name: 'Cessna 172N',
    image: '/Cessna-fleet.png',
    popular: true,
    available: true,
  },
  {
    id: 'piper-archer',
    name: 'Piper Archer',
    image: '/instructor/piper-aircraft-clean.png',
    popular: false,
    available: false,
  },
  {
    id: 'cirrus-sr22',
    name: 'Cirrus SR22',
    image: '/CessnaTarmac.webp',
    popular: false,
    available: false,
  },
]

// 6 FAQ Items organized in 3 columns
const FAQ_COLUMNS = [
  {
    columnId: 1,
    items: [
      {
        id: 'faq-1',
        question: 'How does the instructor application process work?',
        answer:
          'Submit your request for your chosen aircraft model. Our team will review your qualifications, after which you will be scheduled for an aircraft-specific standardization flight with an authorized check pilot.',
      },
      {
        id: 'faq-2',
        question: 'How long does approval take?',
        answer:
          'Initial document verification is typically completed within 24–48 hours. Flight checkout scheduling depends on aircraft and check pilot availability.',
      },
    ],
  },
  {
    columnId: 2,
    items: [
      {
        id: 'faq-3',
        question: 'Do I need to be approved on each aircraft?',
        answer:
          'Yes. In accordance with OZRentaplane operating standards, instructor authorization is granted per aircraft make and model to ensure the highest safety and standard compliance.',
      },
      {
        id: 'faq-4',
        question: 'What is an instructor checkout flight?',
        answer:
          'It is a standardization flight with an OZ-authorized flight examiner or chief instructor covering standard operating procedures, maneuvers, and local airspace procedures.',
      },
    ],
  },
  {
    columnId: 3,
    items: [
      {
        id: 'faq-5',
        question: 'What are the experience requirements?',
        answer:
          'You must hold a valid CASA Flight Instructor Rating (FIR) or relevant endorsement, a current aviation medical, and meet minimum recent flight experience requirements.',
      },
      {
        id: 'faq-6',
        question: 'Who can I contact for help?',
        answer:
          'You can contact our flight operations team directly at support@ozrentaplane.com.au or through the dashboard messages portal.',
      },
    ],
  },
]

export default function InstructorDashboardPage() {
  const router = useRouter()
  const [selectedAircraft, setSelectedAircraft] = useState<string>('cessna-172n')
  const [openFaq, setOpenFaq] = useState<string | null>(null)
  const [appState, setAppState] = useState<InstructorApplicationState | null>(null)
  const [fleetClearances, setFleetClearances] = useState<InstructorFleetClearanceItem[]>([])
  const [students, setStudents] = useState<InstructorStudentItem[]>([])
  const [loading, setLoading] = useState(true)

  // Tab state for approved instructors: 'fleet' | 'students' | 'resources'
  const [activeTab, setActiveTab] = useState<'fleet' | 'students' | 'resources'>('fleet')

  // Add student modal state
  const [showAddStudentModal, setShowAddStudentModal] = useState(false)
  const [studentInput, setStudentInput] = useState('')
  const [studentNotes, setStudentNotes] = useState('')
  const [addingStudent, setAddingStudent] = useState(false)
  const [addStudentError, setAddStudentError] = useState<string | null>(null)
  const [studentSearchQuery, setStudentSearchQuery] = useState('')

  const loadData = async (active = true) => {
    try {
      const [appStatus, fleet, studentList] = await Promise.all([
        getInstructorApplicationStatus(selectedAircraft),
        getInstructorFleetClearances(),
        getInstructorStudents(),
      ])
      if (active) {
        setAppState(appStatus)
        setFleetClearances(fleet)
        setStudents(studentList)
        setLoading(false)
      }
    } catch {
      if (active) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    loadData(active)
    return () => {
      active = false
    }
  }, [selectedAircraft])

  const isApprovedInstructor = Boolean(appState?.hasInstructorClearance || fleetClearances.some(f => f.clearanceStatus === 'approved'))
  const activeBooking = appState?.activeCheckoutBooking
  const isPending = activeBooking?.status === 'checkout_requested' || appState?.clearanceStatus === 'pending'
  const isConfirmed = activeBooking?.status === 'checkout_confirmed'
  const hasActiveBooking = Boolean(activeBooking)

  const handleBookingClick = () => {
    if (activeBooking) {
      router.push(`/dashboard/bookings`)
    } else {
      router.push(`/dashboard/checkout?type=instructor&aircraftId=${selectedAircraft}`)
    }
  }

  const handleAircraftCheckoutClick = (aircraftId: string) => {
    router.push(`/dashboard/checkout?type=instructor&aircraftId=${aircraftId}`)
  }

  const handleBookDualFlight = (aircraftId?: string) => {
    if (aircraftId) {
      router.push(`/dashboard/bookings/new?aircraftId=${aircraftId}`)
    } else {
      router.push(`/dashboard/bookings/new`)
    }
  }

  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentInput.trim()) return
    setAddingStudent(true)
    setAddStudentError(null)

    const res = await addInstructorStudent(studentInput, studentNotes)
    if (res.ok && res.student) {
      setStudents((prev) => [res.student!, ...prev.filter((s) => s.studentId !== res.student!.studentId)])
      setShowAddStudentModal(false)
      setStudentInput('')
      setStudentNotes('')
    } else {
      setAddStudentError(res.message || 'Unable to assign student.')
    }
    setAddingStudent(false)
  }

  const handleRemoveStudent = async (studentId: string) => {
    if (!confirm('Are you sure you want to remove this student from your active roster?')) return
    await removeInstructorStudent(studentId)
    setStudents((prev) => prev.filter((s) => s.studentId !== studentId))
  }

  const toggleFaq = (id: string) => {
    setOpenFaq((prev) => (prev === id ? null : id))
  }

  const approvedFleet = fleetClearances.filter((f) => f.clearanceStatus === 'approved')
  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
    (s.pilotArn && s.pilotArn.toLowerCase().includes(studentSearchQuery.toLowerCase()))
  )

  const selectedPlaneName = AIRCRAFT_OPTIONS.find((a) => a.id === selectedAircraft)?.name ?? 'Aircraft'

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW 1: APPROVED INSTRUCTOR COMMAND HUB
  // ─────────────────────────────────────────────────────────────────────────────
  if (isApprovedInstructor) {
    return (
      <div className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6 sm:space-y-7">
        {/* ─── 1. INSTRUCTOR HERO HEADER CARD ─────────────────────── */}
        <FadeUp duration={0.8}>
          <section className="bg-gradient-to-br from-[#0c2340] via-[#0f2d52] to-[#153e6f] text-white rounded-[22px] p-6 sm:p-9 border border-blue-500/20 shadow-lg relative overflow-hidden">
            {/* Background ambient lighting */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold px-3.5 py-1 rounded-full">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Verified OZRentaplane Flight Instructor</span>
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
                  Instructor Command Hub
                </h1>
                <p className="text-sm sm:text-base text-blue-100/80 leading-relaxed">
                  Manage your aircraft authorizations, schedule dual training flights with your flight students, and maintain standardization currency.
                </p>
              </div>

              {/* Quick Summary Metric Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-auto shrink-0">
                <div className="bg-white/10 border border-white/15 rounded-xl p-3.5 text-center min-w-[110px]">
                  <p className="text-2xl font-black text-white">{approvedFleet.length}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-200 mt-0.5">
                    Authorized Aircraft
                  </p>
                </div>
                <div className="bg-white/10 border border-white/15 rounded-xl p-3.5 text-center min-w-[110px]">
                  <p className="text-2xl font-black text-white">{students.length}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-200 mt-0.5">
                    Active Students
                  </p>
                </div>
                <div className="bg-white/10 border border-white/15 rounded-xl p-3.5 text-center col-span-2 sm:col-span-1 min-w-[110px]">
                  <p className="text-sm font-black text-emerald-300 pt-1">Current</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-200 mt-1">
                    CASA Endorsement
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 mt-7 pt-6 border-t border-white/10 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTab('fleet')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
                  activeTab === 'fleet'
                    ? 'bg-[#1268f3] text-white shadow-md'
                    : 'bg-white/5 hover:bg-white/10 text-white/80'
                }`}
              >
                <Plane className="w-4 h-4" />
                <span>Aircraft Authorizations ({fleetClearances.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('students')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
                  activeTab === 'students'
                    ? 'bg-[#1268f3] text-white shadow-md'
                    : 'bg-white/5 hover:bg-white/10 text-white/80'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>My Students ({students.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('resources')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
                  activeTab === 'resources'
                    ? 'bg-[#1268f3] text-white shadow-md'
                    : 'bg-white/5 hover:bg-white/10 text-white/80'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>SOPs &amp; Briefings</span>
              </button>
            </div>
          </section>
        </FadeUp>

        {/* ─── TAB 1: FLEET AIRCRAFT AUTHORIZATIONS ───────────────── */}
        {activeTab === 'fleet' && (
          <FadeUp duration={0.6}>
            <div className="space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-[#0c2340]">Aircraft Clearances</h2>
                  <p className="text-xs sm:text-sm text-[#64748b] mt-0.5">
                    Clearance is granted on an aircraft-by-aircraft basis. Book a standardization checkout for any aircraft not yet cleared.
                  </p>
                </div>
                <button
                  onClick={() => handleBookDualFlight()}
                  className="bg-[#1268f3] hover:bg-blue-700 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-sm transition-all inline-flex items-center gap-2"
                >
                  <Plane className="w-4 h-4" />
                  <span>Book Dual Flight</span>
                </button>
              </div>

              {/* Fleet Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {fleetClearances.map((plane) => {
                  const isPlaneApproved = plane.clearanceStatus === 'approved'
                  const isPlanePending = plane.clearanceStatus === 'pending'

                  return (
                    <div
                      key={plane.aircraftId}
                      className="bg-white rounded-[20px] border border-slate-200/80 shadow-xs overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow"
                    >
                      <div>
                        {/* Plane Image & Status Overlay */}
                        <div className="relative h-44 bg-slate-100 overflow-hidden">
                          <img
                            src={plane.imageUrl || '/Cessna-fleet.png'}
                            alt={plane.displayName}
                            className="w-full h-full object-cover object-center"
                          />
                          <div className="absolute top-3 right-3">
                            {isPlaneApproved ? (
                              <span className="bg-emerald-500 text-white text-[11px] font-black px-3 py-1 rounded-full shadow-md flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Approved Instructor</span>
                              </span>
                            ) : isPlanePending ? (
                              <span className="bg-amber-500 text-white text-[11px] font-black px-3 py-1 rounded-full shadow-md flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Checkout Pending</span>
                              </span>
                            ) : (
                              <span className="bg-slate-700/80 backdrop-blur-xs text-white text-[11px] font-bold px-3 py-1 rounded-full">
                                Standardization Required
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Details */}
                        <div className="p-5 space-y-3">
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#1268f3] tracking-wider uppercase">
                                {plane.registration}
                              </span>
                              {plane.status === 'active' && (
                                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Fleet Ready
                                </span>
                              )}
                            </div>
                            <h3 className="text-lg font-black text-[#0c2340] leading-tight mt-0.5">
                              {plane.displayName}
                            </h3>
                          </div>

                          <p className="text-xs text-[#64748b] leading-relaxed">
                            {isPlaneApproved
                              ? `Cleared for student dual flight training and instructor check flights.`
                              : `Requires 1 checkout flight with an OZRentaplane check pilot to activate instructor clearance.`}
                          </p>
                        </div>
                      </div>

                      {/* Card Action Footer */}
                      <div className="p-5 pt-0">
                        {isPlaneApproved ? (
                          <button
                            type="button"
                            onClick={() => handleBookDualFlight(plane.aircraftId)}
                            className="w-full bg-[#1268f3] hover:bg-blue-700 text-white font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs"
                          >
                            <span>Book Flight on {plane.registration}</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        ) : isPlanePending ? (
                          <button
                            type="button"
                            onClick={() => router.push('/dashboard/bookings')}
                            className="w-full bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                          >
                            <span>View Checkout Booking</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAircraftCheckoutClick(plane.aircraftId)}
                            className="w-full bg-slate-900 hover:bg-black text-white font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs"
                          >
                            <span>Book Instructor Checkout</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </FadeUp>
        )}

        {/* ─── TAB 2: MY STUDENTS & DUAL TRAINING ─────────────────── */}
        {activeTab === 'students' && (
          <FadeUp duration={0.6}>
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-[#0c2340]">Assigned Flight Students</h2>
                  <p className="text-xs sm:text-sm text-[#64748b] mt-0.5">
                    Manage your active student roster, view training progress, and schedule instructional flights.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddStudentModal(true)}
                  className="bg-[#1268f3] hover:bg-blue-700 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-sm transition-all inline-flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Assign New Student</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search students by name, email, or ARN..."
                  value={studentSearchQuery}
                  onChange={(e) => setStudentSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1268f3]"
                />
              </div>

              {/* Student Roster Table / Grid */}
              {filteredStudents.length === 0 ? (
                <div className="bg-white rounded-[20px] p-8 sm:p-12 text-center border border-slate-200/80 shadow-xs space-y-4">
                  <div className="w-14 h-14 rounded-full bg-blue-50 text-[#1268f3] flex items-center justify-center mx-auto">
                    <Users className="w-7 h-7" />
                  </div>
                  <div className="space-y-1 max-w-md mx-auto">
                    <h3 className="text-base font-bold text-[#0c2340]">No students assigned yet</h3>
                    <p className="text-xs sm:text-sm text-[#64748b]">
                      You can assign a registered pilot to your instructor roster by entering their email address or Pilot ARN.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddStudentModal(true)}
                    className="bg-[#1268f3] hover:bg-blue-700 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-sm transition-all inline-flex items-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Assign First Student</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredStudents.map((student) => (
                    <div
                      key={student.id}
                      className="bg-white rounded-[20px] p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-blue-100/70 text-[#1268f3] font-bold text-sm flex items-center justify-center shrink-0">
                            {student.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="text-sm sm:text-base font-bold text-[#0c2340] leading-tight">
                              {student.name}
                            </h4>
                            <p className="text-xs text-[#64748b] mt-0.5">
                              ARN: <span className="font-semibold text-slate-800">{student.pilotArn || 'Pending'}</span>
                            </p>
                          </div>
                        </div>

                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                          Active
                        </span>
                      </div>

                      <div className="text-xs text-[#64748b] space-y-1 bg-slate-50 p-3 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{student.email}</span>
                        </div>
                        {student.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{student.phone}</span>
                          </div>
                        )}
                        {student.notes && (
                          <p className="text-[11px] text-slate-500 pt-1 italic">
                            Note: {student.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleBookDualFlight()}
                          className="flex-1 bg-[#1268f3] hover:bg-blue-700 text-white font-bold text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <Plane className="w-3.5 h-3.5" />
                          <span>Schedule Flight</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveStudent(student.studentId)}
                          className="text-xs text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-2 rounded-lg font-semibold transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </FadeUp>
        )}

        {/* ─── TAB 3: INSTRUCTOR SOPS & BRIEFINGS ──────────────────── */}
        {activeTab === 'resources' && (
          <FadeUp duration={0.6}>
            <div className="bg-white rounded-[20px] p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-[#0c2340]">Instructor Standardization &amp; SOPs</h2>
                <p className="text-xs sm:text-sm text-[#64748b] mt-0.5">
                  Reference guides, standardized briefing checklists, and standard operating procedures for OZRentaplane instructors.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-5 space-y-2">
                  <div className="flex items-center gap-2.5 text-[#1268f3]">
                    <BookOpen className="w-5 h-5" />
                    <h3 className="font-bold text-sm text-[#0c2340]">Standard Operating Procedures</h3>
                  </div>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Review required pre-flight walkaround, crosswind limits, fuel management guidelines, and post-flight debrief standards.
                  </p>
                </div>

                <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-5 space-y-2">
                  <div className="flex items-center gap-2.5 text-[#1268f3]">
                    <FileCheck className="w-5 h-5" />
                    <h3 className="font-bold text-sm text-[#0c2340]">Pre-Flight Student Briefing Guide</h3>
                  </div>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Checklist for student documentation verification, weight &amp; balance computation, and local training area safety notices.
                  </p>
                </div>

                <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-5 space-y-2">
                  <div className="flex items-center gap-2.5 text-[#1268f3]">
                    <ShieldCheck className="w-5 h-5" />
                    <h3 className="font-bold text-sm text-[#0c2340]">Emergency &amp; Standardization Maneuvers</h3>
                  </div>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Approved recovery profiles, forced landing simulations, engine failure on take-off briefing, and go-around policies.
                  </p>
                </div>

                <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-5 space-y-2">
                  <div className="flex items-center gap-2.5 text-[#1268f3]">
                    <GraduationCap className="w-5 h-5" />
                    <h3 className="font-bold text-sm text-[#0c2340]">CASA Flight Instructor Endorsements</h3>
                  </div>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Compliance standards for Grade 3 / Grade 2 flight instructors and sign-off criteria for first solo clearances.
                  </p>
                </div>
              </div>
            </div>
          </FadeUp>
        )}

        {/* ─── ASSIGN STUDENT MODAL ────────────────────────────────── */}
        <AnimatePresence>
          {showAddStudentModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 relative"
              >
                <button
                  onClick={() => setShowAddStudentModal(false)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>

                <div>
                  <h3 className="text-lg font-bold text-[#0c2340]">Assign Flight Student</h3>
                  <p className="text-xs text-[#64748b] mt-0.5">
                    Enter the student's registered account email address or Pilot ARN.
                  </p>
                </div>

                <form onSubmit={handleAddStudentSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Student Email or Pilot ARN
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. pilot@example.com or 123456"
                      value={studentInput}
                      onChange={(e) => setStudentInput(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-[#1268f3]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Instructor Notes (Optional)
                    </label>
                    <textarea
                      placeholder="e.g. PPL training student, practicing circuit landings"
                      value={studentNotes}
                      onChange={(e) => setStudentNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-[#1268f3]"
                    />
                  </div>

                  {addStudentError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{addStudentError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddStudentModal(false)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addingStudent || !studentInput.trim()}
                      className="bg-[#1268f3] hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-xs"
                    >
                      {addingStudent ? 'Assigning…' : 'Assign Student'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW 2: INSTRUCTOR CANDIDATE ONBOARDING & APPLICATION FLOW
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6 sm:space-y-7">
      {/* ─── 0. NOTIFICATION BANNER WHEN BOOKED / APPROVED ──────── */}
      {hasActiveBooking && (
        <FadeUp duration={0.6}>
          <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-blue-700/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5 w-full sm:w-auto flex-1">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                {isConfirmed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-300" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-blue-200 uppercase tracking-wider">
                  {isConfirmed ? 'Checkout Flight Confirmed' : 'Instructor Checkout Requested'}
                </p>
                <p className="text-sm sm:text-base font-bold text-white mt-0.5 leading-snug">
                  {isConfirmed
                    ? `Your standardization checkout flight for ${selectedPlaneName} is scheduled. Ref: ${activeBooking?.booking_reference}`
                    : `Checkout flight requested for ${selectedPlaneName} — awaiting admin confirmation.`}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/dashboard/bookings')}
              className="w-full sm:w-auto bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl transition-all inline-flex items-center justify-center gap-1.5 shrink-0"
            >
              <span>View Booking</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </FadeUp>
      )}

      {/* ─── 1. HERO CARD: "Become an Instructor" ───────────────── */}
      <FadeUp duration={0.9}>
        <section className="bg-[#f0f6ff] border border-blue-100/90 rounded-[20px] sm:rounded-[22px] overflow-hidden relative shadow-[0_4px_24px_rgba(18,104,243,0.04)]">
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[350px]">
            {/* Left Content Area */}
            <div className="lg:col-span-6 p-5 sm:p-9 lg:p-12 flex flex-col justify-center relative z-10 order-2 lg:order-1">
              <StaggerContainer staggerDelay={0.14}>
                <StaggerItem duration={1.0}>
                  <h1 className="text-2xl sm:text-3xl lg:text-[40px] font-black text-[#0c2340] tracking-tight leading-tight mb-3">
                    Become an Instructor
                  </h1>
                </StaggerItem>

                <StaggerItem duration={1.05}>
                  <p className="text-[15px] sm:text-[17px] font-semibold text-[#0c2340] mb-3 sm:mb-4">
                    Share your passion. Build the future of aviation.
                  </p>
                </StaggerItem>

                <StaggerItem duration={1.1}>
                  <p className="text-[13.5px] sm:text-[14px] text-[#475569] leading-relaxed mb-6 sm:mb-8 max-w-[460px] font-normal">
                    Complete a successful instructor checkout with an OZRentaplane instructor, and you'll gain
                    aircraft-specific instructor clearance.
                  </p>
                </StaggerItem>

                <StaggerItem duration={1.15}>
                  <div>
                    <button
                      type="button"
                      onClick={handleBookingClick}
                      className="bg-[#1268f3] hover:bg-blue-700 text-white font-bold text-[14px] sm:text-[15px] px-6 sm:px-7 py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all inline-flex items-center gap-2.5 w-full sm:w-fit justify-center group"
                    >
                      <span>{hasActiveBooking ? 'View Active Booking' : 'Book Instructor Checkout Flight'}</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
                    </button>
                  </div>
                </StaggerItem>
              </StaggerContainer>
            </div>

            {/* Right Pilot Cockpit Image */}
            <div className="lg:col-span-6 relative h-48 sm:h-64 lg:h-auto min-h-[190px] lg:min-h-full order-1 lg:order-2 overflow-hidden">
              <img
                src="/instructor/hero-pilot-cockpit.jpg"
                alt="Instructor in cockpit"
                className="w-full h-full object-cover object-[65%_center] lg:object-center select-none"
              />
              <div className="hidden lg:block absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#f0f6ff] via-[#f0f6ff]/40 to-transparent pointer-events-none" />
            </div>
          </div>
        </section>
      </FadeUp>

      {/* ─── 2. APPLICATION STATUS & STEPPER CARD ───────────────── */}
      <FadeUp duration={0.9} delay={0.06}>
        <section className="bg-white rounded-[20px] sm:rounded-[22px] p-5 sm:p-8 lg:p-10 border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
          {/* Header Row */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-5 sm:pb-6">
            <h2 className="text-[18px] sm:text-[22px] font-black text-[#0c2340] tracking-tight">
              Your Instructor Application
            </h2>
            {isConfirmed ? (
              <div className="bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[12px] sm:text-[12.5px] px-3.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>Checkout Confirmed</span>
              </div>
            ) : isPending ? (
              <div className="bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[12px] sm:text-[12.5px] px-3.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Pending Admin Review</span>
              </div>
            ) : (
              <div className="bg-[#fff7ed] text-[#ea580c] border border-[#ffedd5] font-bold text-[12px] sm:text-[12.5px] px-3.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                <span>Not Approved</span>
              </div>
            )}
          </div>

          {/* Desktop Stepper */}
          <div className="hidden sm:flex items-center justify-between py-3 mb-6 sm:mb-8 max-w-[760px] mx-auto">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#1268f3] text-white font-black text-[13px] sm:text-[14px] flex items-center justify-center shadow-sm">
                1
              </div>
              <span className="font-bold text-[#1268f3] text-[13.5px] sm:text-[14.5px] whitespace-nowrap">
                Select Aircraft
              </span>
            </div>

            <div className="h-[2px] bg-slate-200 flex-1 mx-4 min-w-[30px]" />

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-slate-300 bg-white text-[#64748b] font-bold text-[13px] sm:text-[14px] flex items-center justify-center">
                2
              </div>
              <span className="font-semibold text-[#64748b] text-[13.5px] sm:text-[14px] whitespace-nowrap">
                Review Requirements
              </span>
            </div>

            <div className="h-[2px] bg-slate-200 flex-1 mx-4 min-w-[30px]" />

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-slate-300 bg-white text-[#64748b] font-bold text-[13px] sm:text-[14px] flex items-center justify-center">
                3
              </div>
              <span className="font-semibold text-[#64748b] text-[13.5px] sm:text-[14.5px] whitespace-nowrap">
                Submit Request
              </span>
            </div>
          </div>

          {/* Mobile Stepper */}
          <div className="sm:hidden py-2 mb-6 w-full">
            <div className="grid grid-cols-3 relative">
              <div className="absolute top-[16px] left-[16.6%] right-[50%] h-[2px] bg-slate-200 z-0" />
              <div className="absolute top-[16px] left-[50%] right-[16.6%] h-[2px] bg-slate-200 z-0" />

              <div className="flex flex-col items-center text-center relative z-10 px-1">
                <div className="w-8 h-8 rounded-full bg-[#1268f3] text-white font-black text-[13px] flex items-center justify-center shadow-sm mb-1.5 ring-4 ring-white">
                  1
                </div>
                <span className="font-bold text-[#1268f3] text-[11px] leading-tight">
                  Select Aircraft
                </span>
              </div>

              <div className="flex flex-col items-center text-center relative z-10 px-1">
                <div className="w-8 h-8 rounded-full border border-slate-300 bg-white text-[#64748b] font-bold text-[13px] flex items-center justify-center mb-1.5 ring-4 ring-white">
                  2
                </div>
                <span className="font-semibold text-[#64748b] text-[11px] leading-tight">
                  Review Requirements
                </span>
              </div>

              <div className="flex flex-col items-center text-center relative z-10 px-1">
                <div className="w-8 h-8 rounded-full border border-slate-300 bg-white text-[#64748b] font-bold text-[13px] flex items-center justify-center mb-1.5 ring-4 ring-white">
                  3
                </div>
                <span className="font-semibold text-[#64748b] text-[11px] leading-tight">
                  Submit Request
                </span>
              </div>
            </div>
          </div>

          <div className="w-full h-px bg-slate-100 mb-5 sm:mb-6" />

          {/* Step 1: Select Aircraft */}
          <div>
            <h3 className="text-[16px] sm:text-[18px] font-black text-[#0c2340] mb-1">
              Step 1: Select Aircraft
            </h3>
            <p className="text-[13px] sm:text-[13.5px] text-[#64748b] mb-4 sm:mb-5">
              Choose the aircraft you want to become an instructor on.
            </p>

            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-4 mb-4" staggerDelay={0.12}>
              {AIRCRAFT_OPTIONS.map((aircraft) => {
                const isSelected = selectedAircraft === aircraft.id
                const isAvailable = aircraft.available

                return (
                  <StaggerItem key={aircraft.id} duration={0.9}>
                    <HoverEmphasize hoverY={isAvailable ? -3 : 0}>
                      <div
                        onClick={() => {
                          if (isAvailable) setSelectedAircraft(aircraft.id)
                        }}
                        className={`rounded-xl p-3 sm:p-3.5 flex items-center justify-between transition-all duration-200 relative ${
                          !isAvailable
                            ? 'border border-slate-200/70 bg-slate-50/60 cursor-not-allowed opacity-75'
                            : isSelected
                            ? 'border-2 border-[#1268f3] bg-[#f4f8ff] shadow-sm cursor-pointer'
                            : 'border border-slate-200 hover:border-slate-300 bg-white shadow-xs cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={aircraft.image}
                            alt={aircraft.name}
                            className={`w-14 h-11 sm:w-16 sm:h-12 rounded-lg object-cover border border-slate-200/60 shrink-0 select-none ${
                              !isAvailable ? 'grayscale-[40%] bg-slate-100' : 'bg-slate-100'
                            }`}
                          />
                          <div>
                            {!isAvailable ? (
                              <span className="bg-slate-100 text-slate-500 border border-slate-200/80 text-[10px] sm:text-[10.5px] font-bold px-2 py-0.5 rounded-md mb-1 inline-block">
                                Coming Soon
                              </span>
                            ) : aircraft.popular ? (
                              <span className="bg-[#eefbf3] text-[#16a34a] text-[10px] sm:text-[10.5px] font-bold px-2 py-0.5 rounded-md mb-1 inline-block">
                                Most Popular
                              </span>
                            ) : null}

                            <div className={`text-[14px] sm:text-[15px] font-black leading-tight ${
                              !isAvailable ? 'text-slate-500' : 'text-[#0c2340]'
                            }`}>
                              {aircraft.name}
                            </div>
                          </div>
                        </div>

                        <div>
                          {isSelected && isAvailable ? (
                            <div className="w-5 h-5 rounded-full bg-[#1268f3] text-white flex items-center justify-center shrink-0 shadow-xs">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          ) : (
                            <div className={`w-5 h-5 rounded-full border-2 ${
                              !isAvailable ? 'border-slate-200 bg-slate-100' : 'border-slate-300 bg-white'
                            }`} />
                          )}
                        </div>
                      </div>
                    </HoverEmphasize>
                  </StaggerItem>
                )
              })}
            </StaggerContainer>

            <div className="flex items-center gap-2 text-[12px] sm:text-[12.5px] text-[#475569] pt-1">
              <Info className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Instructor approval is aircraft-specific. You must be approved on each aircraft you wish to instruct on.
              </span>
            </div>
          </div>
        </section>
      </FadeUp>

      {/* ─── 3. BEFORE YOU APPLY SECTION ─────────────────────────── */}
      <FadeUp duration={0.9} delay={0.08}>
        <section className="bg-white rounded-[20px] sm:rounded-[22px] p-5 sm:p-8 lg:p-10 border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
          <h2 className="text-[18px] sm:text-[22px] font-black text-[#0c2340] tracking-tight mb-5 sm:mb-6">
            Before You Apply
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
            <StaggerContainer className="lg:col-span-7 space-y-3 sm:space-y-3.5" staggerDelay={0.1}>
              {[
                'Valid Pilot Certificate (PPL or higher)',
                'Current Medical Certificate',
                'Cessna 172N / Complex endorsement (if applicable)',
                'Instrument Rating (if required for aircraft)',
                'Recent flight experience (as outlined below)',
                'Successful instructor checkout flight',
              ].map((item, idx) => (
                <StaggerItem key={idx} duration={0.8}>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#16a34a] shrink-0" strokeWidth={2.2} />
                    <span className="text-[13.5px] sm:text-[14px] font-semibold text-[#1e293b]">{item}</span>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>

            <div className="lg:col-span-5 flex flex-col justify-between">
              <HoverEmphasize hoverY={-2}>
                <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl p-4 sm:p-6 shadow-xs">
                  <div className="flex items-center gap-2.5 mb-2 sm:mb-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#dcfce7] text-[#16a34a] flex items-center justify-center shrink-0">
                      <Info className="w-4 h-4 text-[#16a34a]" strokeWidth={2.5} />
                    </div>
                    <span className="font-extrabold text-[#15803d] text-[14.5px] sm:text-[15px]">
                      Approval is per aircraft.
                    </span>
                  </div>
                  <p className="text-[12.5px] sm:text-[13px] text-[#334155] leading-relaxed font-normal">
                    Instructor clearance is granted on an aircraft-by-aircraft basis. You'll need to complete a separate checkout for each aircraft you want to instruct on.
                  </p>
                </div>
              </HoverEmphasize>

              <div className="mt-3.5 sm:mt-4">
                <Link
                  href="/pilotRequirements"
                  className="inline-flex items-center gap-1.5 text-[13px] sm:text-[13.5px] font-bold text-[#1268f3] hover:underline"
                >
                  <span>View full requirements</span>
                  <ExternalLink className="w-4 h-4 text-[#1268f3]" strokeWidth={2.2} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </FadeUp>

      {/* ─── 4. NEED HELP? FAQ SECTION ──────────────────────────── */}
      <FadeUp duration={0.9} delay={0.1}>
        <section className="bg-white rounded-[20px] sm:rounded-[22px] p-5 sm:p-8 lg:p-10 border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
          <h2 className="text-[18px] sm:text-[22px] font-black text-[#0c2340] tracking-tight mb-5 sm:mb-6">
            Need Help?
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 md:gap-8 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {FAQ_COLUMNS.map((col, colIdx) => (
              <div
                key={col.columnId}
                className={`space-y-3.5 sm:space-y-4 ${colIdx > 0 ? 'pt-4 md:pt-0 md:pl-6 sm:md:pl-8' : ''}`}
              >
                {col.items.map((item) => {
                  const isOpen = openFaq === item.id
                  return (
                    <div key={item.id} className="border-b border-slate-100 last:border-b-0 pb-3 last:pb-0">
                      <button
                        type="button"
                        onClick={() => toggleFaq(item.id)}
                        className="w-full flex items-start justify-between gap-2.5 text-left group py-1 select-none focus:outline-none"
                      >
                        <div className="flex items-start gap-2.5">
                          <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" strokeWidth={2.2} />
                          <span className={`text-[13px] sm:text-[13.5px] font-bold transition-colors leading-snug ${
                            isOpen ? 'text-blue-600' : 'text-[#0c2340] group-hover:text-blue-600'
                          }`}>
                            {item.question}
                          </span>
                        </div>
                        <motion.svg
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          className={`w-4 h-4 shrink-0 mt-0.5 ${isOpen ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-600'}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </motion.svg>
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            key="content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="text-[12px] sm:text-[12.5px] text-[#475569] mt-2 pl-6.5 leading-relaxed font-normal pt-0.5 pb-1">
                              {item.answer}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </section>
      </FadeUp>

      {/* ─── 5. BOTTOM CTA CARD: Ready to Take the Next Step? ───── */}
      <FadeUp duration={0.9} delay={0.12}>
        <section className="bg-[#eef5ff] border border-blue-100/90 rounded-[20px] sm:rounded-[22px] p-5 sm:p-7 lg:p-8 flex flex-col sm:flex-row items-center justify-between gap-5 sm:gap-6 shadow-[0_2px_12px_rgba(18,104,243,0.03)]">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3.5 sm:gap-5 text-center sm:text-left">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white border border-blue-200 text-[#1268f3] flex items-center justify-center shadow-sm shrink-0">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-[#1268f3]" strokeWidth={2.2} />
            </div>
            <div>
              <h3 className="text-[16px] sm:text-[18.5px] font-black text-[#0c2340] mb-0.5">
                {hasActiveBooking ? 'Checkout Request In Progress' : 'Ready to Take the Next Step?'}
              </h3>
              <p className="text-[12.5px] sm:text-[13px] text-[#475569] font-normal leading-snug">
                {hasActiveBooking
                  ? `Your instructor checkout flight request for ${selectedPlaneName} is active. View your booking details or contact flight ops if you need adjustments.`
                  : 'Book your instructor checkout flight today and start your journey to joining the OZRentaplane instructor team.'}
              </p>
            </div>
          </div>

          <div className="w-full sm:w-auto">
            <button
              type="button"
              onClick={handleBookingClick}
              className="w-full sm:w-auto bg-[#1268f3] hover:bg-blue-700 text-white font-bold text-[13.5px] sm:text-[14px] px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all inline-flex items-center justify-center gap-2 shrink-0 group whitespace-nowrap"
            >
              <span>{hasActiveBooking ? 'View Booking' : 'Book Instructor Checkout Flight'}</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
            </button>
          </div>
        </section>
      </FadeUp>

      {/* ─── 6. SAFETY FOOTER MESSAGE ─────────────────────────────── */}
      <FadeUp duration={0.9} delay={0.14}>
        <div className="flex items-center justify-center gap-2 text-center pt-2 text-[12px] sm:text-[13px] text-[#64748b]">
          <ShieldCheck className="w-5 h-5 text-[#16a34a] shrink-0" strokeWidth={2.2} />
          <p>
            <span className="font-bold text-[#16a34a]">Safety is our priority.</span> All instructor checkouts are conducted in accordance with CASA regulations and OZRentaplane standard operating procedures.
          </p>
        </div>
      </FadeUp>
    </div>
  )
}
