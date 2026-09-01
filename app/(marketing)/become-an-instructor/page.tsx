'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AuthModal from '@/components/AuthModal'
import { 
  Users, 
  CalendarDays, 
  FolderClosed, 
  Plane, 
  Check, 
  Info, 
  ArrowRight,
  FileText,
  Clock,
  ShieldCheck,
  Star
} from 'lucide-react'

export default function BecomeAnInstructorPage() {
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null)
    })
  }, [])

  const handleCTAClick = () => {
    if (user) {
      router.push('/dashboard/checkout')
    } else {
      setAuthModalOpen(true)
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#0f172a] font-sans antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* ─── 1. HERO SECTION ────────────────────────────────────────── */}
      <section className="relative min-h-[620px] sm:min-h-[660px] lg:min-h-[720px] w-full overflow-hidden flex items-center bg-[#f4f8fd]">
        {/* Full-Bleed Panoramic Background Image */}
        <img
          src="/instructor/hero-background.png"
          alt="Flight instructor with Cessna aircraft on airport runway"
          className="absolute inset-0 w-full h-full object-cover object-[78%_center] lg:object-right select-none pointer-events-none z-0"
        />

        {/* Soft Linear Gradient Mask blending left text into the runway scene */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 via-35% to-transparent w-full lg:w-[58%] pointer-events-none z-[1]" />
        <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-white/30 to-transparent pointer-events-none z-[1]" />

        {/* Hero Left Content */}
        <div className="max-w-[1400px] mx-auto w-full px-6 sm:px-10 lg:px-16 pt-[120px] pb-14 lg:pt-[130px] lg:pb-18 relative z-10">
          <div className="max-w-xl">
            <h1 className="text-[40px] sm:text-[48px] lg:text-[54px] font-black text-[#0c2340] tracking-tight leading-[1.08]">
              Want to Become<br />an Instructor?
            </h1>

            <p className="mt-5 text-[16px] sm:text-[17px] text-[#334155] leading-relaxed font-normal max-w-[460px]">
              Inspire the next generation of pilots. Get approved to teach using OZ aircraft and grow your impact in aviation.
            </p>

            {/* Primary CTA */}
            <div className="mt-8">
              <button
                type="button"
                onClick={handleCTAClick}
                className="inline-flex items-center justify-center gap-3 bg-[#0c2340] hover:bg-[#163864] text-white font-semibold text-[15px] px-7 py-3.5 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 group"
              >
                <span>Book Instructor Checkout</span>
                <svg
                  className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </button>
            </div>

            {/* 3 Badges with Vertical Divider Lines */}
            <div className="mt-10 flex flex-wrap items-center gap-4 sm:gap-6 pt-2">
              {/* Badge 1 */}
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-[#0c2340] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <span className="text-[12.5px] font-semibold text-[#1e293b] leading-tight">
                  Per-Aircraft<br />Approval
                </span>
              </div>

              <div className="hidden sm:block w-px h-7 bg-slate-300" />

              {/* Badge 2 */}
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-[#0c2340] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="text-[12.5px] font-semibold text-[#1e293b] leading-tight">
                  Streamlined<br />Process
                </span>
              </div>

              <div className="hidden sm:block w-px h-7 bg-slate-300" />

              {/* Badge 3 */}
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-[#0c2340] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="text-[12.5px] font-semibold text-[#1e293b] leading-tight">
                  Teach with<br />Confidence
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 2. STEPS SECTION ("Simple steps. Clear path.") ───────── */}
      <section className="py-10 sm:py-14 lg:py-20 bg-[#f8fbff] relative overflow-hidden">
        {/* Topography & Flight Trail Background Graphic */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <img
            src="/instructor/steps-topography-trail.png"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover object-top opacity-95 select-none"
          />
        </div>

        <div className="max-w-[1360px] mx-auto px-5 sm:px-8 lg:px-12 relative z-10">
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12 lg:mb-14 relative">
            <div className="inline-flex items-center justify-center gap-2.5 text-[12px] sm:text-[13px] font-extrabold tracking-[0.14em] text-blue-600 uppercase mb-2">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 rotate-45 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
              </svg>
              <span>YOUR JOURNEY TO INSTRUCTOR APPROVAL</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-[42px] font-black text-[#08182f] tracking-tight">
              Simple steps. Clear path.
            </h2>
          </div>

          {/* 4 Steps Row with Connecting Arrows */}
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4 xl:gap-5">
            {/* Step 1: Request */}
            <div className="relative bg-white rounded-2xl p-5 sm:p-6 pb-6 border border-blue-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200 flex flex-col items-center text-center group flex-1 max-w-[320px] lg:max-w-[270px] w-full min-h-0 lg:min-h-[250px]">
              <div className="absolute top-3.5 left-3.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#0d47a1] text-white text-[11.5px] sm:text-[12px] font-black flex items-center justify-center shadow-sm">
                1
              </div>
              <div className="w-[76px] h-[76px] sm:w-[82px] sm:h-[82px] rounded-[20px] bg-[#f0f6ff] flex items-center justify-center mb-3.5 mt-1 group-hover:scale-105 transition-transform">
                <svg className="w-11 h-11 sm:w-12 sm:h-12" viewBox="0 0 64 64" fill="none">
                  <path
                    d="M18 10C15.7909 10 14 11.7909 14 14V50C14 52.2091 15.7909 54 18 54H42C44.2091 54 46 52.2091 46 50V22L34 10H18Z"
                    stroke="#1a66ff"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M34 10V22H46"
                    stroke="#1a66ff"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M22 28H32" stroke="#1a66ff" strokeWidth="3.5" strokeLinecap="round" />
                  <path d="M22 36H30" stroke="#1a66ff" strokeWidth="3.5" strokeLinecap="round" />
                  <path d="M22 44H28" stroke="#1a66ff" strokeWidth="3.5" strokeLinecap="round" />
                  <circle cx="44" cy="44" r="10" fill="#1a66ff" stroke="#f0f6ff" strokeWidth="3" />
                  <path d="M40 44L43 47L48 41" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-[18px] sm:text-[19px] font-black text-[#08182f] mb-1.5 tracking-tight">Request</h3>
              <p className="text-[13px] sm:text-[13.5px] text-[#334155] leading-relaxed font-normal">
                Submit a checkout request for the aircraft you want to teach in.
              </p>
            </div>

            {/* Connecting Arrow 1 */}
            <div className="hidden lg:flex items-center justify-center shrink-0 text-slate-800">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>

            {/* Step 2: Review */}
            <div className="relative bg-white rounded-2xl p-5 sm:p-6 pb-6 border border-blue-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200 flex flex-col items-center text-center group flex-1 max-w-[320px] lg:max-w-[270px] w-full min-h-0 lg:min-h-[250px]">
              <div className="absolute top-3.5 left-3.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#0d47a1] text-white text-[11.5px] sm:text-[12px] font-black flex items-center justify-center shadow-sm">
                2
              </div>
              <div className="w-[76px] h-[76px] sm:w-[82px] sm:h-[82px] rounded-[20px] bg-[#f0f6ff] flex items-center justify-center mb-3.5 mt-1 group-hover:scale-105 transition-transform">
                <svg className="w-11 h-11 sm:w-12 sm:h-12" viewBox="0 0 64 64" fill="none">
                  <path
                    d="M18 10C15.7909 10 14 11.7909 14 14V50C14 52.2091 15.7909 54 18 54H42C44.2091 54 46 52.2091 46 50V22L34 10H18Z"
                    stroke="#1a66ff"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M34 10V22H46"
                    stroke="#1a66ff"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M22 28H32" stroke="#1a66ff" strokeWidth="3.5" strokeLinecap="round" />
                  <path d="M22 36H28" stroke="#1a66ff" strokeWidth="3.5" strokeLinecap="round" />
                  <circle cx="40" cy="40" r="7" stroke="#1a66ff" strokeWidth="3.5" fill="#f0f6ff" />
                  <path d="M45 45L52 52" stroke="#1a66ff" strokeWidth="3.5" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="text-[18px] sm:text-[19px] font-black text-[#08182f] mb-1.5 tracking-tight">Review</h3>
              <p className="text-[13px] sm:text-[13.5px] text-[#334155] leading-relaxed font-normal">
                We review your qualifications, experience, and documents.
              </p>
            </div>

            {/* Connecting Arrow 2 */}
            <div className="hidden lg:flex items-center justify-center shrink-0 text-slate-800">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>

            {/* Step 3: Checkout */}
            <div className="relative bg-white rounded-2xl p-5 sm:p-6 pb-6 border border-blue-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200 flex flex-col items-center text-center group flex-1 max-w-[320px] lg:max-w-[270px] w-full min-h-0 lg:min-h-[250px]">
              <div className="absolute top-3.5 left-3.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#0d47a1] text-white text-[11.5px] sm:text-[12px] font-black flex items-center justify-center shadow-sm">
                3
              </div>
              <div className="w-[76px] h-[76px] sm:w-[82px] sm:h-[82px] rounded-[20px] bg-[#f0f6ff] flex items-center justify-center mb-3.5 mt-1 group-hover:scale-105 transition-transform">
                <svg className="w-11 h-11 sm:w-12 sm:h-12" viewBox="0 0 64 64" fill="none">
                  <rect x="10" y="16" width="44" height="32" rx="6" stroke="#1a66ff" strokeWidth="3.5" fill="none" />
                  <path d="M10 26H54" stroke="#1a66ff" strokeWidth="4" />
                  <rect x="16" y="34" width="8" height="6" rx="1.5" stroke="#1a66ff" strokeWidth="2.5" fill="#f0f6ff" />
                  <path d="M28 37H44" stroke="#1a66ff" strokeWidth="3" strokeLinecap="round" />
                  <path d="M28 42H38" stroke="#1a66ff" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="text-[18px] sm:text-[19px] font-black text-[#08182f] mb-1.5 tracking-tight">Checkout</h3>
              <p className="text-[13px] sm:text-[13.5px] text-[#334155] leading-relaxed font-normal">
                Complete your instructor checkout with an OZ standards check flight.
              </p>
            </div>

            {/* Connecting Arrow 3 */}
            <div className="hidden lg:flex items-center justify-center shrink-0 text-slate-800">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>

            {/* Step 4: Approval */}
            <div className="relative bg-white rounded-2xl p-5 sm:p-6 pb-6 border border-blue-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200 flex flex-col items-center text-center group flex-1 max-w-[320px] lg:max-w-[270px] w-full min-h-0 lg:min-h-[250px]">
              <div className="absolute top-3.5 left-3.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#0d47a1] text-white text-[11.5px] sm:text-[12px] font-black flex items-center justify-center shadow-sm">
                4
              </div>
              <div className="w-[76px] h-[76px] sm:w-[82px] sm:h-[82px] rounded-[20px] bg-[#eefbf3] flex items-center justify-center mb-3.5 mt-1 group-hover:scale-105 transition-transform">
                <svg className="w-14 h-14" viewBox="0 0 64 64" fill="none">
                  <path
                    d="M32 10L48 17V30C48 41.5 41 49 32 54C23 49 16 41.5 16 30V17L32 10Z"
                    stroke="#16a34a"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <path
                    d="M24 32L30 38L40 26"
                    stroke="#16a34a"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="text-[18px] sm:text-[19px] font-black text-[#08182f] mb-1.5 tracking-tight">Approval</h3>
              <p className="text-[13px] sm:text-[13.5px] text-[#334155] leading-relaxed font-normal">
                Once approved, you're authorized to instruct in that specific aircraft.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3. THE DETAILS ("How instructor approval works") ─────── */}
      <section className="relative bg-white overflow-hidden min-h-[380px] sm:min-h-[400px] lg:min-h-[420px] flex items-center">
        {/* Full-Width Aircraft Photo with Preserved Width */}
        <div className="absolute top-0 right-0 bottom-0 w-full lg:w-[62%] xl:w-[64%] h-full pointer-events-none z-0">
          <img
            src="/instructor/piper-aircraft-clean.png"
            alt="Piper aircraft in flight over clouds"
            className="w-full h-full object-cover object-[15%_center] lg:object-center select-none"
          />
        </div>

        {/* Pure White Left Mask blending cleanly into the sky */}
        <div className="absolute top-0 left-0 bottom-0 w-full lg:w-[46%] bg-gradient-to-r from-white via-white via-70% to-transparent pointer-events-none z-[1]" />

        {/* Content Container */}
        <div className="max-w-[1400px] mx-auto w-full px-6 sm:px-10 lg:px-16 py-8 lg:py-10 relative z-10">
          <div className="max-w-lg lg:max-w-[420px]">
            <span className="text-xs sm:text-[12.5px] font-extrabold tracking-[0.14em] text-blue-600 uppercase mb-2 block">
              THE DETAILS
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-[34px] font-black text-[#08182f] tracking-tight leading-[1.12] mb-5">
              How instructor<br />approval works
            </h2>

            <div className="space-y-3.5 sm:space-y-4">
              {/* Item 1 */}
              <div className="flex items-start gap-3.5">
                <div className="w-5 h-5 rounded-full bg-[#155dfc] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </div>
                <p className="text-[14px] sm:text-[14.5px] font-semibold text-[#0c2340] leading-snug">
                  Instructors must pass an instructor checkout with an OZ-authorized check pilot.
                </p>
              </div>

              {/* Item 2 */}
              <div className="flex items-start gap-3.5">
                <div className="w-5 h-5 rounded-full bg-[#155dfc] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </div>
                <p className="text-[14px] sm:text-[14.5px] font-semibold text-[#0c2340] leading-snug">
                  Approval is per aircraft make and model.
                </p>
              </div>

              {/* Item 3 */}
              <div className="flex items-start gap-3.5">
                <div className="w-5 h-5 rounded-full bg-[#155dfc] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </div>
                <p className="text-[14px] sm:text-[14.5px] font-semibold text-[#0c2340] leading-snug">
                  You may request additional aircraft approvals as your teaching grows.
                </p>
              </div>

              {/* Item 4 */}
              <div className="flex items-start gap-3.5">
                <div className="w-5 h-5 rounded-full bg-[#155dfc] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </div>
                <p className="text-[14px] sm:text-[14.5px] font-semibold text-[#0c2340] leading-snug">
                  We're here to support your success at every step.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Callout Card - Elevated position with ample bottom clearance */}
        <div className="hidden sm:flex absolute bottom-10 sm:bottom-12 lg:bottom-14 xl:bottom-16 right-6 lg:right-10 xl:right-14 z-20 max-w-[280px] sm:max-w-[290px] bg-white/95 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-white/80 shadow-[0_8px_25px_rgba(15,23,42,0.1)] items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
            <Info className="w-3.5 h-3.5 text-blue-700" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-[13px] sm:text-[13.5px] font-extrabold text-[#0c2340] mb-0.5 leading-tight">
              Approval is not automatic.
            </div>
            <p className="text-[11px] sm:text-[11.5px] text-[#475569] leading-snug font-normal">
              It ensures safety, standards, and the best experience for your students.
            </p>
          </div>
        </div>
      </section>

      {/* ─── 4. WHAT YOU CAN DO ("Teach. Manage. Grow.") ──────────── */}
      <section className="bg-[#f8fafc] relative overflow-hidden border-t border-slate-200/60 flex flex-col lg:flex-row items-stretch">
        {/* Left Column: Headings & 4 Horizontal Items */}
        <div className="flex-1 py-8 sm:py-12 lg:py-16 px-5 sm:px-10 lg:pl-16 lg:pr-10 flex flex-col justify-center">
          <span className="text-xs sm:text-[13px] font-extrabold tracking-[0.14em] text-blue-600 uppercase mb-2 block">
            WHAT YOU CAN DO
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-[40px] font-black text-[#06152b] tracking-tight leading-[1.1] mb-6 sm:mb-10 lg:mb-12">
            Teach. Manage. Grow.
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#dce7f5] gap-6 sm:gap-0">
            {/* Feature 1: Teach Students with OZ Aircraft */}
            <div className="sm:px-4 lg:px-6 text-center flex flex-col items-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#ebf3ff] text-[#155dfc] flex items-center justify-center mb-3.5 sm:mb-4 shadow-[0_2px_12px_rgba(21,93,252,0.08)]">
                <Users className="w-7 h-7 sm:w-8 sm:h-8 text-[#155dfc]" strokeWidth={2.2} />
              </div>
              <h3 className="text-[16px] sm:text-[17.5px] font-black text-[#06152b] mb-1.5 sm:mb-2 leading-snug tracking-tight">
                Teach Students<br className="hidden sm:inline" /> with OZ Aircraft
              </h3>
              <p className="text-[12.5px] sm:text-[13px] text-[#475569] font-medium leading-relaxed max-w-[205px]">
                Conduct training in a professional and trusted environment using OZ aircraft.
              </p>
            </div>

            {/* Feature 2: Create Instructional Bookings */}
            <div className="pt-5 sm:pt-0 sm:px-4 lg:px-6 text-center flex flex-col items-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#ebf3ff] text-[#155dfc] flex items-center justify-center mb-3.5 sm:mb-4 shadow-[0_2px_12px_rgba(21,93,252,0.08)]">
                <CalendarDays className="w-7 h-7 sm:w-8 sm:h-8 text-[#155dfc]" strokeWidth={2.2} />
              </div>
              <h3 className="text-[16px] sm:text-[17.5px] font-black text-[#06152b] mb-1.5 sm:mb-2 leading-snug tracking-tight">
                Create Instructional<br className="hidden sm:inline" /> Bookings
              </h3>
              <p className="text-[12.5px] sm:text-[13px] text-[#475569] font-medium leading-relaxed max-w-[205px]">
                Easily create dual or solo instructional bookings that fit your schedule.
              </p>
            </div>

            {/* Feature 3: Manage Student Documents */}
            <div className="pt-5 sm:pt-0 sm:px-4 lg:px-6 text-center flex flex-col items-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#ebf3ff] text-[#155dfc] flex items-center justify-center mb-3.5 sm:mb-4 shadow-[0_2px_12px_rgba(21,93,252,0.08)]">
                <FolderClosed className="w-7 h-7 sm:w-8 sm:h-8 text-[#155dfc]" strokeWidth={2.2} />
              </div>
              <h3 className="text-[16px] sm:text-[17.5px] font-black text-[#06152b] mb-1.5 sm:mb-2 leading-snug tracking-tight">
                Manage Student<br className="hidden sm:inline" /> Documents
              </h3>
              <p className="text-[12.5px] sm:text-[13px] text-[#475569] font-medium leading-relaxed max-w-[205px]">
                Upload, track, and manage student documents securely in one place.
              </p>
            </div>

            {/* Feature 4: Expand Your Clearances */}
            <div className="pt-5 sm:pt-0 sm:px-4 lg:px-6 text-center flex flex-col items-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#ebf3ff] text-[#155dfc] flex items-center justify-center mb-3.5 sm:mb-4 shadow-[0_2px_12px_rgba(21,93,252,0.08)]">
                <Plane className="w-7 h-7 sm:w-8 sm:h-8 text-[#155dfc]" strokeWidth={2.2} />
              </div>
              <h3 className="text-[16px] sm:text-[17.5px] font-black text-[#06152b] mb-1.5 sm:mb-2 leading-snug tracking-tight">
                Expand Your<br className="hidden sm:inline" /> Clearances
              </h3>
              <p className="text-[12.5px] sm:text-[13px] text-[#475569] font-medium leading-relaxed max-w-[205px]">
                Request approval on more aircraft and expand your teaching opportunities.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Full-Height Image on desktop / natural height on mobile */}
        <div className="w-full lg:w-[25%] xl:w-[23%] shrink-0 self-stretch relative h-[220px] sm:h-[260px] lg:h-auto overflow-hidden">
          <img
            src="/instructor/instructor-walking.png"
            alt="Flight instructor and student walking on tarmac at sunset"
            className="w-full h-full object-cover object-[62%_center] block select-none"
          />
        </div>
      </section>

      {/* ─── 5. TESTIMONIALS & ORGANISATIONS ──────────────────────── */}
      <section className="pt-8 sm:pt-12 lg:pt-16 pb-12 sm:pb-16 lg:pb-20 relative overflow-hidden bg-[#eaf3fc]">
        {/* Panoramic Clouds Background */}
        <div className="absolute inset-0 z-0 select-none pointer-events-none">
          <img
            src="/instructor/testimonials-clouds-bg.png"
            alt="Cloudscape background"
            className="w-full h-full object-cover object-top"
          />
          {/* Seamless bottom fade blending into Section 6 */}
          <div className="absolute bottom-0 inset-x-0 h-28 bg-gradient-to-b from-transparent via-sky-100/30 to-sky-200/50 pointer-events-none" />
        </div>

        <div className="max-w-[1360px] mx-auto px-5 sm:px-8 lg:px-12 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 xl:gap-20 items-start">
            {/* Left Column (9 cols on lg): Centered Headings over 3 Testimonial Cards */}
            <div className="lg:col-span-9 flex flex-col justify-between">
              {/* Left Section Heading - Centered over the 3 boxes */}
              <div className="mb-6 sm:mb-7 text-center">
                <span className="text-xs sm:text-[12px] font-extrabold tracking-[0.14em] text-blue-600 uppercase mb-2 block text-center">
                  TRUSTED BY INSTRUCTORS. CHOSEN BY SCHOOLS.
                </span>
                <h2 className="text-xl sm:text-2xl lg:text-[27px] font-black text-[#06152b] tracking-tight leading-snug text-center">
                  Built for instructors. Backed by the community.
                </h2>
              </div>

              {/* Left 3 Testimonial Cards in 1 row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Card 1: James R. */}
                <div className="bg-white rounded-2xl p-6 border border-blue-100/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-md transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-start gap-2.5 mb-4">
                      <span className="text-[#155dfc] text-3xl font-serif font-black leading-none shrink-0 select-none mt-0.5">“</span>
                      <p className="text-[13.5px] text-[#334155] leading-relaxed font-normal">
                        The checkout process was professional and thorough. Now I can focus on what I love—teaching and inspiring pilots.
                      </p>
                    </div>
                  </div>
                  <div>
                    {/* 5 Stars */}
                    <div className="flex items-center gap-1 mb-4">
                      {[...Array(5)].map((_, idx) => (
                        <Star key={idx} className="w-5 h-5 fill-[#f59e0b] text-[#f59e0b]" />
                      ))}
                    </div>
                    {/* Author */}
                    <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                      <img
                        src="/instructor/avatar-james.jpg"
                        alt="James R."
                        className="w-11 h-11 rounded-full object-cover border border-slate-100 shadow-sm shrink-0"
                      />
                      <div>
                        <div className="text-[14px] font-black text-[#06152b] leading-tight">James R.</div>
                        <div className="text-[12px] text-[#64748b] font-medium">CFI, Melbourne</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 2: Sarah L. */}
                <div className="bg-white rounded-2xl p-6 border border-blue-100/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-md transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-start gap-2.5 mb-4">
                      <span className="text-[#155dfc] text-3xl font-serif font-black leading-none shrink-0 select-none mt-0.5">“</span>
                      <p className="text-[13.5px] text-[#334155] leading-relaxed font-normal">
                        OZRentaplane makes it easy to manage my students and bookings. The platform is a game changer.
                      </p>
                    </div>
                  </div>
                  <div>
                    {/* 5 Stars */}
                    <div className="flex items-center gap-1 mb-4">
                      {[...Array(5)].map((_, idx) => (
                        <Star key={idx} className="w-5 h-5 fill-[#f59e0b] text-[#f59e0b]" />
                      ))}
                    </div>
                    {/* Author */}
                    <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                      <img
                        src="/instructor/avatar-sarah.jpg"
                        alt="Sarah L."
                        className="w-11 h-11 rounded-full object-cover border border-slate-100 shadow-sm shrink-0"
                      />
                      <div>
                        <div className="text-[14px] font-black text-[#06152b] leading-tight">Sarah L.</div>
                        <div className="text-[12px] text-[#64748b] font-medium">CFI, Sydney</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 3: Daniel K. */}
                <div className="bg-white rounded-2xl p-6 border border-blue-100/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-md transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-start gap-2.5 mb-4">
                      <span className="text-[#155dfc] text-3xl font-serif font-black leading-none shrink-0 select-none mt-0.5">“</span>
                      <p className="text-[13.5px] text-[#334155] leading-relaxed font-normal">
                        Per-aircraft approval gives me confidence that I'm teaching to the highest standard in every aircraft.
                      </p>
                    </div>
                  </div>
                  <div>
                    {/* 5 Stars */}
                    <div className="flex items-center gap-1 mb-4">
                      {[...Array(5)].map((_, idx) => (
                        <Star key={idx} className="w-5 h-5 fill-[#f59e0b] text-[#f59e0b]" />
                      ))}
                    </div>
                    {/* Author */}
                    <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                      <img
                        src="/instructor/avatar-daniel.jpg"
                        alt="Daniel K."
                        className="w-11 h-11 rounded-full object-cover border border-slate-100 shadow-sm shrink-0"
                      />
                      <div>
                        <div className="text-[14px] font-black text-[#06152b] leading-tight">Daniel K.</div>
                        <div className="text-[12px] text-[#64748b] font-medium">Senior CFI, Brisbane</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column (3 cols on lg): Thicker Header & Larger Centered Partner Logos */}
            <div className="lg:col-span-3 flex flex-col items-center justify-start text-center pt-0.5">
              {/* Right Heading - Thicker, placed directly above the first image */}
              <div className="mb-4 sm:mb-5 text-center w-full">
                <span className="text-xs sm:text-[12px] font-black tracking-[0.15em] text-blue-600 uppercase leading-snug block">
                  TRUSTED BY LEADING<br />AVIATION ORGANISATIONS
                </span>
              </div>

              {/* User-Uploaded Partner Logo Images - Larger & Centered on same axis */}
              <div className="space-y-4 sm:space-y-5 w-full flex flex-col items-center justify-center">
                {/* AOPA Australia */}
                <div className="w-full flex items-center justify-center">
                  <img
                    src="/instructor/aopa-logo.png"
                    alt="AOPA Australia"
                    className="h-20 sm:h-24 w-auto max-w-[260px] object-contain select-none mix-blend-multiply"
                  />
                </div>

                {/* RAAus */}
                <div className="w-full flex items-center justify-center">
                  <img
                    src="/instructor/raaus-logo.png"
                    alt="RAAus Recreational Aviation Australia"
                    className="h-12 sm:h-15 w-auto max-w-[260px] object-contain select-none mix-blend-multiply"
                  />
                </div>

                {/* ATC */}
                <div className="w-full flex items-center justify-center">
                  <img
                    src="/instructor/atc-logo.png"
                    alt="ATC Aviation Training Council"
                    className="h-16 sm:h-20 w-auto max-w-[260px] object-contain select-none mix-blend-multiply"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 6. BOTTOM CTA BANNER ─────────────────────────────────── */}
      <section className="relative py-14 sm:py-16 lg:py-20 overflow-hidden">
        {/* Background Image - Seamlessly blended with top cloudscape */}
        <div className="absolute inset-0 z-0">
          <img
            src="/instructor/coastal-aerial-bg.png"
            alt="Aerial view of coastal bay and ocean"
            className="w-full h-full object-cover object-center select-none"
          />
          {/* Soft top gradient to smoothly connect with Section 5 */}
          <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-sky-200/50 via-sky-100/20 to-transparent pointer-events-none" />
          {/* Subtle soft gradient on left to ensure white text readability while keeping full brightness */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#07162c]/40 via-[#07162c]/20 to-transparent" />
        </div>

        <div className="max-w-[1360px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8 text-center lg:text-left">
            {/* Left CTA text */}
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl lg:text-[34px] font-black text-white tracking-tight leading-tight mb-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                Ready to take the next step?
              </h2>
              <p className="text-sm sm:text-[15px] text-white/95 font-medium drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
                Start your instructor journey today and help shape the future of aviation.
              </p>
            </div>

            {/* Right CTA button */}
            <div className="flex flex-col items-center lg:items-end shrink-0">
              <button
                type="button"
                onClick={handleCTAClick}
                className="inline-flex items-center justify-center gap-2.5 bg-white hover:bg-slate-50 text-[#0c2340] font-bold text-sm sm:text-[14.5px] px-7 py-3.5 rounded-xl shadow-xl hover:shadow-2xl transition-all duration-200 group"
              >
                <span>Book Instructor Checkout</span>
                <ArrowRight className="w-4 h-4 text-[#0c2340] transition-transform duration-200 group-hover:translate-x-1" strokeWidth={2.5} />
              </button>
              <span className="text-[12px] text-white/90 mt-2 font-medium drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
                Takes just a few minutes to get started.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Auth Modal for unauthenticated clicks */}
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  )
}
