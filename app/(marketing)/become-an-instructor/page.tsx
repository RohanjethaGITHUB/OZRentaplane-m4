'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AuthModal from '@/components/AuthModal'

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
      <section className="py-20 lg:py-24 bg-[#f8fbff] relative overflow-hidden">
        {/* Topography & Flight Trail Background Graphic */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <img
            src="/instructor/steps-topography-trail.png"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover object-top opacity-95 select-none"
          />
        </div>

        <div className="max-w-[1360px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto mb-16 relative">
            <div className="inline-flex items-center gap-2 text-[12.5px] font-bold tracking-[0.14em] text-blue-600 uppercase mb-2">
              <svg className="w-4 h-4 rotate-45" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
              </svg>
              <span>YOUR JOURNEY TO INSTRUCTOR APPROVAL</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-black text-[#08182f] tracking-tight">
              Simple steps. Clear path.
            </h2>
          </div>

          {/* 4 Steps Row with Connecting Arrows */}
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4 xl:gap-5">
            {/* Step 1: Request */}
            <div className="relative bg-white rounded-2xl p-6 sm:p-7 border border-blue-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200 flex flex-col items-center text-center group flex-1 max-w-[270px] w-full min-h-[315px]">
              <div className="absolute top-4 left-4 w-7 h-7 rounded-full bg-[#0d47a1] text-white text-[12.5px] font-black flex items-center justify-center shadow-sm">
                1
              </div>
              <div className="w-[92px] h-[92px] rounded-[22px] bg-[#f0f6ff] flex items-center justify-center mb-5 mt-2 group-hover:scale-105 transition-transform">
                <svg className="w-14 h-14" viewBox="0 0 64 64" fill="none">
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
              <h3 className="text-[20px] font-black text-[#08182f] mb-2 tracking-tight">Request</h3>
              <p className="text-[13.5px] text-[#334155] leading-relaxed font-normal">
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
            <div className="relative bg-white rounded-2xl p-6 sm:p-7 border border-blue-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200 flex flex-col items-center text-center group flex-1 max-w-[270px] w-full min-h-[315px]">
              <div className="absolute top-4 left-4 w-7 h-7 rounded-full bg-[#0d47a1] text-white text-[12.5px] font-black flex items-center justify-center shadow-sm">
                2
              </div>
              <div className="w-[92px] h-[92px] rounded-[22px] bg-[#f0f6ff] flex items-center justify-center mb-5 mt-2 group-hover:scale-105 transition-transform">
                <svg className="w-14 h-14" viewBox="0 0 64 64" fill="none">
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
              <h3 className="text-[20px] font-black text-[#08182f] mb-2 tracking-tight">Review</h3>
              <p className="text-[13.5px] text-[#334155] leading-relaxed font-normal">
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
            <div className="relative bg-white rounded-2xl p-6 sm:p-7 border border-blue-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200 flex flex-col items-center text-center group flex-1 max-w-[270px] w-full min-h-[315px]">
              <div className="absolute top-4 left-4 w-7 h-7 rounded-full bg-[#0d47a1] text-white text-[12.5px] font-black flex items-center justify-center shadow-sm">
                3
              </div>
              <div className="w-[92px] h-[92px] rounded-[22px] bg-[#f0f6ff] flex items-center justify-center mb-5 mt-2 group-hover:scale-105 transition-transform">
                <svg className="w-14 h-14" viewBox="0 0 64 64" fill="none">
                  <rect x="10" y="16" width="44" height="32" rx="6" stroke="#1a66ff" strokeWidth="3.5" fill="none" />
                  <path d="M10 26H54" stroke="#1a66ff" strokeWidth="4" />
                  <rect x="16" y="34" width="8" height="6" rx="1.5" stroke="#1a66ff" strokeWidth="2.5" fill="#f0f6ff" />
                  <path d="M28 37H44" stroke="#1a66ff" strokeWidth="3" strokeLinecap="round" />
                  <path d="M28 42H38" stroke="#1a66ff" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="text-[20px] font-black text-[#08182f] mb-2 tracking-tight">Checkout</h3>
              <p className="text-[13.5px] text-[#334155] leading-relaxed font-normal">
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
            <div className="relative bg-white rounded-2xl p-6 sm:p-7 border border-blue-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200 flex flex-col items-center text-center group flex-1 max-w-[270px] w-full min-h-[315px]">
              <div className="absolute top-4 left-4 w-7 h-7 rounded-full bg-[#0d47a1] text-white text-[12.5px] font-black flex items-center justify-center shadow-sm">
                4
              </div>
              <div className="w-[92px] h-[92px] rounded-[22px] bg-[#eefbf3] flex items-center justify-center mb-5 mt-2 group-hover:scale-105 transition-transform">
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
              <h3 className="text-[20px] font-black text-[#08182f] mb-2 tracking-tight">Approval</h3>
              <p className="text-[13.5px] text-[#334155] leading-relaxed font-normal">
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
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                </div>
                <p className="text-[14px] sm:text-[14.5px] font-semibold text-[#0c2340] leading-snug">
                  Instructors must pass an instructor checkout with an OZ-authorized check pilot.
                </p>
              </div>

              {/* Item 2 */}
              <div className="flex items-start gap-3.5">
                <div className="w-5 h-5 rounded-full bg-[#155dfc] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                </div>
                <p className="text-[14px] sm:text-[14.5px] font-semibold text-[#0c2340] leading-snug">
                  Approval is per aircraft make and model.
                </p>
              </div>

              {/* Item 3 */}
              <div className="flex items-start gap-3.5">
                <div className="w-5 h-5 rounded-full bg-[#155dfc] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                </div>
                <p className="text-[14px] sm:text-[14.5px] font-semibold text-[#0c2340] leading-snug">
                  You may request additional aircraft approvals as your teaching grows.
                </p>
              </div>

              {/* Item 4 */}
              <div className="flex items-start gap-3.5">
                <div className="w-5 h-5 rounded-full bg-[#155dfc] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                </div>
                <p className="text-[14px] sm:text-[14.5px] font-semibold text-[#0c2340] leading-snug">
                  We're here to support your success at every step.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Responsive Code-Based Callout Card */}
        <div className="hidden sm:flex absolute bottom-4 right-6 lg:bottom-5 lg:right-10 xl:right-14 z-20 max-w-[280px] sm:max-w-[290px] bg-white/95 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-white/80 shadow-[0_8px_25px_rgba(15,23,42,0.1)] items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
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
      <section className="py-16 lg:py-24 bg-[#f8fbff]">
        <div className="max-w-[1360px] mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            {/* Left Column: 2x2 Feature Cards */}
            <div className="lg:col-span-7 flex flex-col justify-center">
              <span className="text-xs font-bold tracking-[0.14em] text-blue-600 uppercase mb-2 block">
                WHAT YOU CAN DO
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0c2340] tracking-tight mb-8">
                Teach. Manage. Grow.
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Feature 1 */}
                <div className="bg-white rounded-2xl p-6 border border-blue-100/90 shadow-[0_4px_18px_rgba(15,23,42,0.03)] hover:shadow-md transition-all flex flex-col justify-center">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-[#0c2340] mb-2 leading-tight">
                    Teach Students with OZ Aircraft
                  </h3>
                  <p className="text-[13px] text-[#475569] leading-relaxed">
                    Conduct training in a professional and trusted environment using OZ aircraft.
                  </p>
                </div>

                {/* Feature 2 */}
                <div className="bg-white rounded-2xl p-6 border border-blue-100/90 shadow-[0_4px_18px_rgba(15,23,42,0.03)] hover:shadow-md transition-all flex flex-col justify-center">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-[#0c2340] mb-2 leading-tight">
                    Create Instructional Bookings
                  </h3>
                  <p className="text-[13px] text-[#475569] leading-relaxed">
                    Easily create dual or solo instructional bookings that fit your schedule.
                  </p>
                </div>

                {/* Feature 3 */}
                <div className="bg-white rounded-2xl p-6 border border-blue-100/90 shadow-[0_4px_18px_rgba(15,23,42,0.03)] hover:shadow-md transition-all flex flex-col justify-center">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-[#0c2340] mb-2 leading-tight">
                    Manage Student Documents
                  </h3>
                  <p className="text-[13px] text-[#475569] leading-relaxed">
                    Upload, track, and manage student documents securely in one place.
                  </p>
                </div>

                {/* Feature 4 */}
                <div className="bg-white rounded-2xl p-6 border border-blue-100/90 shadow-[0_4px_18px_rgba(15,23,42,0.03)] hover:shadow-md transition-all flex flex-col justify-center">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-[#0c2340] mb-2 leading-tight">
                    Expand Your Clearances
                  </h3>
                  <p className="text-[13px] text-[#475569] leading-relaxed">
                    Request approval on more aircraft and expand your teaching opportunities.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Full sunset tarmac instructor walking image */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="relative rounded-2xl overflow-hidden shadow-lg border border-slate-100 w-full h-[380px] sm:h-[450px] lg:h-full min-h-[360px]">
                <img
                  src="/instructor/instructor-walking.png"
                  alt="Flight instructor and student walking towards aircraft on runway at sunset"
                  className="w-full h-full object-cover object-[62%_center] block"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 5. TESTIMONIALS & ORGANISATIONS ──────────────────────── */}
      <section className="py-20 lg:py-24 bg-white relative overflow-hidden">
        {/* Soft atmospheric cloud overlay in background */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <img
            src="/CloudLayerA.webp"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover object-center"
          />
        </div>

        <div className="max-w-[1360px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
          {/* Section Title */}
          <div className="mb-14 text-center lg:text-left">
            <span className="text-xs font-bold tracking-[0.14em] text-blue-600 uppercase mb-2 block">
              TRUSTED BY INSTRUCTORS. CHOSEN BY SCHOOLS.
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0c2340] tracking-tight">
              Built for instructors. Backed by the community.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 3 Testimonial Cards (9 cols on lg) */}
            <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: James R. */}
              <div className="bg-white/95 backdrop-blur-md rounded-2xl p-6 sm:p-7 border border-blue-100/90 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                <div>
                  <div className="text-blue-600 text-3xl font-serif font-black mb-2 leading-none">“</div>
                  <p className="text-[13.5px] text-[#334155] leading-relaxed mb-5 italic">
                    The checkout process was professional and thorough. Now I can focus on what I love—teaching and inspiring pilots.
                  </p>
                </div>
                <div>
                  {/* 5 Stars */}
                  <div className="flex items-center gap-1 text-amber-400 mb-4">
                    {'★★★★★'.split('').map((star, idx) => (
                      <span key={idx} className="text-sm">{star}</span>
                    ))}
                  </div>
                  {/* Author */}
                  <div className="flex items-center gap-3 pt-2 border-t border-blue-100/60">
                    <img
                      src="/instructor/avatar-james.jpg"
                      alt="James R."
                      className="w-10 h-10 rounded-full object-cover border border-white shadow-sm"
                    />
                    <div>
                      <div className="text-[13.5px] font-bold text-[#0c2340]">James R.</div>
                      <div className="text-[11.5px] text-[#64748b]">CFI, Melbourne</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Sarah L. */}
              <div className="bg-white/95 backdrop-blur-md rounded-2xl p-6 sm:p-7 border border-blue-100/90 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                <div>
                  <div className="text-blue-600 text-3xl font-serif font-black mb-2 leading-none">“</div>
                  <p className="text-[13.5px] text-[#334155] leading-relaxed mb-5 italic">
                    OZRentaplane makes it easy to manage my students and bookings. The platform is a game changer.
                  </p>
                </div>
                <div>
                  {/* 5 Stars */}
                  <div className="flex items-center gap-1 text-amber-400 mb-4">
                    {'★★★★★'.split('').map((star, idx) => (
                      <span key={idx} className="text-sm">{star}</span>
                    ))}
                  </div>
                  {/* Author */}
                  <div className="flex items-center gap-3 pt-2 border-t border-blue-100/60">
                    <img
                      src="/instructor/avatar-sarah.jpg"
                      alt="Sarah L."
                      className="w-10 h-10 rounded-full object-cover border border-white shadow-sm"
                    />
                    <div>
                      <div className="text-[13.5px] font-bold text-[#0c2340]">Sarah L.</div>
                      <div className="text-[11.5px] text-[#64748b]">CFI, Sydney</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Daniel K. */}
              <div className="bg-white/95 backdrop-blur-md rounded-2xl p-6 sm:p-7 border border-blue-100/90 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                <div>
                  <div className="text-blue-600 text-3xl font-serif font-black mb-2 leading-none">“</div>
                  <p className="text-[13.5px] text-[#334155] leading-relaxed mb-5 italic">
                    Per-aircraft approval gives me confidence that I'm teaching to the highest standard in every aircraft.
                  </p>
                </div>
                <div>
                  {/* 5 Stars */}
                  <div className="flex items-center gap-1 text-amber-400 mb-4">
                    {'★★★★★'.split('').map((star, idx) => (
                      <span key={idx} className="text-sm">{star}</span>
                    ))}
                  </div>
                  {/* Author */}
                  <div className="flex items-center gap-3 pt-2 border-t border-blue-100/60">
                    <img
                      src="/instructor/avatar-daniel.jpg"
                      alt="Daniel K."
                      className="w-10 h-10 rounded-full object-cover border border-white shadow-sm"
                    />
                    <div>
                      <div className="text-[13.5px] font-bold text-[#0c2340]">Daniel K.</div>
                      <div className="text-[11.5px] text-[#64748b]">Senior CFI, Brisbane</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Aviation Partner Badges (3 cols on lg) */}
            <div className="lg:col-span-3 bg-white/95 backdrop-blur-md rounded-2xl p-6 border border-blue-100/90 shadow-sm flex flex-col items-center justify-center text-center">
              <span className="text-[11px] font-bold tracking-[0.14em] text-blue-900 uppercase mb-6 leading-tight">
                TRUSTED BY LEADING<br />AVIATION ORGANISATIONS
              </span>

              <div className="space-y-6 w-full flex flex-col items-center">
                {/* AOPA Australia */}
                <div className="flex flex-col items-center justify-center py-2 px-4 w-full">
                  <div className="flex items-center gap-2 text-[#0c2a55]">
                    <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none">
                      <circle cx="20" cy="20" r="18" stroke="#0c2a55" strokeWidth="2" fill="#eff6ff" />
                      <path d="M12 24l8-14 8 14h-4l-4-7-4 7h-4z" fill="#0c2a55" />
                      <path d="M15 20h10" stroke="#0c2a55" strokeWidth="2" />
                    </svg>
                    <div className="text-left leading-none">
                      <div className="font-extrabold text-[15px] tracking-wider text-[#0c2a55]">AOPA</div>
                      <div className="text-[9px] font-semibold text-[#475569] tracking-widest uppercase">Australia</div>
                    </div>
                  </div>
                </div>

                <div className="w-24 h-px bg-blue-100/80" />

                {/* RAAus */}
                <div className="flex flex-col items-center justify-center py-2 px-4 w-full">
                  <div className="flex items-center gap-2 text-[#0c2a55]">
                    <div className="font-black text-lg tracking-tight text-[#0c2a55] flex items-center">
                      <span className="text-blue-600">RA</span>Aus
                    </div>
                    <span className="text-[8.5px] font-bold text-[#64748b] leading-tight text-left">
                      Recreational Aviation<br />Australia
                    </span>
                  </div>
                </div>

                <div className="w-24 h-px bg-blue-100/80" />

                {/* ATC */}
                <div className="flex flex-col items-center justify-center py-2 px-4 w-full">
                  <div className="flex items-center text-[#0c2a55]">
                    <div className="font-black text-xl tracking-widest text-[#0c2a55] border-b-2 border-blue-600 pb-0.5 px-3">
                      ATC
                    </div>
                    <span className="text-[8.5px] font-bold text-[#64748b] tracking-wider uppercase mt-1">
                      Aviation Training Council
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 6. PRE-FOOTER CTA BANNER ──────────────────────────────── */}
      <section className="relative overflow-hidden py-16 sm:py-20 bg-[#07162c]">
        {/* Real Aerial Background Photo from Public Assets */}
        <div className="absolute inset-0 pointer-events-none">
          <img
            src="/StunningCoastalView.webp"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-[#07162c]/85" />
        </div>

        <div className="max-w-[1360px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8 text-center lg:text-left">
            {/* Left CTA text */}
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-2">
                Ready to take the next step?
              </h2>
              <p className="text-sm sm:text-base text-blue-100/80 font-normal">
                Start your instructor journey today and help shape the future of aviation.
              </p>
            </div>

            {/* Right CTA button */}
            <div className="flex flex-col items-center lg:items-end shrink-0">
              <button
                type="button"
                onClick={handleCTAClick}
                className="inline-flex items-center justify-center gap-3 bg-white hover:bg-blue-50 text-[#0c2340] font-bold text-sm sm:text-[15px] px-8 py-3.5 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 group"
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
              <span className="text-[12px] text-blue-200/70 mt-2 font-medium">
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
