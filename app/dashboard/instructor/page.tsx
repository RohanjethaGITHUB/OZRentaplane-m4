'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { FadeUp, StaggerContainer, StaggerItem, HoverEmphasize } from '@/components/MotionPresets'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Info,
  ExternalLink,
  HelpCircle,
  Calendar,
  ShieldCheck,
} from 'lucide-react'

// Aircraft selection options with real plane images
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

  const handleBookingClick = () => {
    router.push('/dashboard/bookings/new')
  }

  const toggleFaq = (id: string) => {
    setOpenFaq((prev) => (prev === id ? null : id))
  }

  return (
    <div className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6 sm:space-y-7">
      {/* ─── 1. HERO CARD: "Become an Instructor" ───────────────── */}
      <FadeUp duration={0.9}>
        <section className="bg-[#f0f6ff] border border-blue-100/90 rounded-[20px] sm:rounded-[22px] overflow-hidden relative shadow-[0_4px_24px_rgba(18,104,243,0.04)]">
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[350px]">
            {/* Left Content Area */}
            <div className="lg:col-span-6 p-6 sm:p-9 lg:p-12 flex flex-col justify-center relative z-10 order-2 lg:order-1">
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
                  <div className="relative inline-block w-full sm:w-fit rounded-xl overflow-hidden cursor-not-allowed select-none shadow-md">
                    {/* Below layer: The blue CTA */}
                    <div className="bg-[#1268f3] text-white font-bold text-[14px] sm:text-[15px] px-6 sm:px-7 py-3.5 inline-flex items-center gap-2.5 w-full justify-center">
                      <span>Book Instructor Checkout Flight</span>
                      <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                    </div>

                    {/* First layer (layer above): Coming Soon overlay */}
                    <div className="absolute inset-0 bg-[#0c2340]/40 backdrop-blur-[1.5px] flex items-center justify-center z-10">
                      <span className="bg-white/95 text-[#0c2340] border border-white/60 font-black text-[11px] sm:text-[11.5px] px-3.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                        Coming Soon
                      </span>
                    </div>
                  </div>
                </StaggerItem>
              </StaggerContainer>
            </div>

            {/* Right Pilot Cockpit Image */}
            <div className="lg:col-span-6 relative min-h-[220px] sm:min-h-[280px] lg:min-h-full order-1 lg:order-2">
              <img
                src="/instructor/hero-pilot-cockpit.jpg"
                alt="Instructor in cockpit"
                className="w-full h-full object-cover object-[65%_center] lg:object-center select-none"
              />
              {/* Soft Gradient Overlay on Left Edge to blend image into hero background */}
              <div className="hidden lg:block absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#f0f6ff] via-[#f0f6ff]/40 to-transparent pointer-events-none" />
            </div>
          </div>
        </section>
      </FadeUp>

      {/* ─── 2. APPLICATION STATUS & STEPPER CARD ───────────────── */}
      <FadeUp duration={0.9} delay={0.06}>
        <section className="bg-white rounded-[20px] sm:rounded-[22px] p-5 sm:p-8 lg:p-10 border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
          {/* Header Row: Title & Not Approved Status Badge */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-5 sm:pb-6">
            <h2 className="text-[18px] sm:text-[22px] font-black text-[#0c2340] tracking-tight">
              Your Instructor Application
            </h2>
            <div className="bg-[#fff7ed] text-[#ea580c] border border-[#ffedd5] font-bold text-[12px] sm:text-[12.5px] px-3.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
              <span>Not Approved</span>
            </div>
          </div>

          {/* Desktop Stepper — Horizontal Inline Layout */}
          <div className="hidden sm:flex items-center justify-between py-3 mb-6 sm:mb-8 max-w-[760px] mx-auto">
            {/* Step 1: Active */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#1268f3] text-white font-black text-[13px] sm:text-[14px] flex items-center justify-center shadow-sm">
                1
              </div>
              <span className="font-bold text-[#1268f3] text-[13.5px] sm:text-[14.5px] whitespace-nowrap">
                Select Aircraft
              </span>
            </div>

            {/* Line 1 */}
            <div className="h-[2px] bg-slate-200 flex-1 mx-4 min-w-[30px]" />

            {/* Step 2: Review Requirements */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-slate-300 bg-white text-[#64748b] font-bold text-[13px] sm:text-[14px] flex items-center justify-center">
                2
              </div>
              <span className="font-semibold text-[#64748b] text-[13.5px] sm:text-[14px] whitespace-nowrap">
                Review Requirements
              </span>
            </div>

            {/* Line 2 */}
            <div className="h-[2px] bg-slate-200 flex-1 mx-4 min-w-[30px]" />

            {/* Step 3: Submit Request */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-slate-300 bg-white text-[#64748b] font-bold text-[13px] sm:text-[14px] flex items-center justify-center">
                3
              </div>
              <span className="font-semibold text-[#64748b] text-[13.5px] sm:text-[14.5px] whitespace-nowrap">
                Submit Request
              </span>
            </div>
          </div>

          {/* Mobile Stepper — Balanced 3-Column Grid */}
          <div className="sm:hidden py-2 mb-6 w-full">
            <div className="grid grid-cols-3 relative">
              {/* Connecting line 1 to 2 */}
              <div className="absolute top-[16px] left-[16.6%] right-[50%] h-[2px] bg-slate-200 z-0" />
              {/* Connecting line 2 to 3 */}
              <div className="absolute top-[16px] left-[50%] right-[16.6%] h-[2px] bg-slate-200 z-0" />

              {/* Step 1: Active */}
              <div className="flex flex-col items-center text-center relative z-10 px-1">
                <div className="w-8 h-8 rounded-full bg-[#1268f3] text-white font-black text-[13px] flex items-center justify-center shadow-sm mb-1.5 ring-4 ring-white">
                  1
                </div>
                <span className="font-bold text-[#1268f3] text-[11px] leading-tight">
                  Select Aircraft
                </span>
              </div>

              {/* Step 2: Review Requirements */}
              <div className="flex flex-col items-center text-center relative z-10 px-1">
                <div className="w-8 h-8 rounded-full border border-slate-300 bg-white text-[#64748b] font-bold text-[13px] flex items-center justify-center mb-1.5 ring-4 ring-white">
                  2
                </div>
                <span className="font-semibold text-[#64748b] text-[11px] leading-tight">
                  Review Requirements
                </span>
              </div>

              {/* Step 3: Submit Request */}
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

          {/* Divider */}
          <div className="w-full h-px bg-slate-100 mb-5 sm:mb-6" />

          {/* Step 1: Select Aircraft */}
          <div>
            <h3 className="text-[16px] sm:text-[18px] font-black text-[#0c2340] mb-1">
              Step 1: Select Aircraft
            </h3>
            <p className="text-[13px] sm:text-[13.5px] text-[#64748b] mb-4 sm:mb-5">
              Choose the aircraft you want to become an instructor on.
            </p>

            {/* 3 Aircraft Selection Cards */}
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
                        {/* Left: Thumbnail & Details */}
                        <div className="flex items-center gap-3">
                          <img
                            src={aircraft.image}
                            alt={aircraft.name}
                            className={`w-14 h-11 sm:w-16 sm:h-12 rounded-lg object-cover border border-slate-200/60 shrink-0 select-none ${
                              !isAvailable ? 'grayscale-[40%] bg-slate-100' : 'bg-slate-100'
                            }`}
                          />
                          <div>
                            {/* Status label: Coming soon vs Most popular */}
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

                        {/* Right: Radio Selection Check Circle */}
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

            {/* Aircraft Specific Notice */}
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
            {/* Left Column: 6 Checklist items */}
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

            {/* Right Column: Approval Information Box */}
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
            {/* Calendar Icon inside white rounded box */}
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white border border-blue-200 text-[#1268f3] flex items-center justify-center shadow-sm shrink-0">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-[#1268f3]" strokeWidth={2.2} />
            </div>
            <div>
              <h3 className="text-[16px] sm:text-[18.5px] font-black text-[#0c2340] mb-0.5">
                Ready to Take the Next Step?
              </h3>
              <p className="text-[12.5px] sm:text-[13px] text-[#475569] font-normal leading-snug">
                Book your instructor checkout flight today and start your journey to joining the OZRentaplane instructor team.
              </p>
            </div>
          </div>

          <div className="w-full sm:w-auto">
            <div className="relative inline-block w-full sm:w-auto rounded-xl overflow-hidden cursor-not-allowed select-none shadow-md">
              {/* Below layer: The blue CTA */}
              <div className="w-full sm:w-auto bg-[#1268f3] text-white font-bold text-[13.5px] sm:text-[14px] px-5 sm:px-6 py-3 sm:py-3.5 inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap">
                <span>Book Instructor Checkout Flight</span>
                <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </div>

              {/* First layer (layer above): Coming Soon overlay */}
              <div className="absolute inset-0 bg-[#0c2340]/40 backdrop-blur-[1.5px] flex items-center justify-center z-10">
                <span className="bg-white/95 text-[#0c2340] border border-white/60 font-black text-[10.5px] sm:text-[11px] px-3.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                  Coming Soon
                </span>
              </div>
            </div>
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
