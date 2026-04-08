'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { FadeUp, StaggerContainer, StaggerItem, HoverEmphasize } from '@/components/MotionPresets'

export default function PilotRequirementsPage() {
  return (
    <main className="min-h-screen bg-[#091421] text-[#d9e3f6]">
      
      {/* 1. Hero Section */}
      <section className="relative px-6 md:px-12 lg:px-20 overflow-hidden min-h-[500px] md:min-h-[750px] flex items-center">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/PilotRequirementsHero-Sunset.webp")' }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#091421]/60 via-[#091421]/30 to-transparent" />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#091421]/25 via-transparent to-[#091421]/35" />

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-16">
          <StaggerContainer className="max-w-xl" staggerDelay={0.25}>
            <StaggerItem duration={1.4}>
              <h1 className="font-serif text-5xl md:text-7xl font-normal leading-[1.05] tracking-tight mb-6 text-white">
                Pilot Requirements
              </h1>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[1rem] leading-relaxed text-[#c4c6cf] mb-10 max-w-md">
                Excellence is standard. Review the prerequisites for commanding our Cessna 172N fleet within the Australian stratosphere.
              </p>
            </StaggerItem>
          </StaggerContainer>
          <div className="flex flex-wrap items-center gap-4 mt-6">
            <FadeUp delay={1.2} duration={1.4}>
              <a
                href="#"
                className="inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] rounded-md font-sans font-bold tracking-widest uppercase text-[0.8rem] px-8 py-4 shadow-2xl shadow-[#aec7f7]/20 transition-all active:scale-95 hover:brightness-110"
              >
                Start Approval
              </a>
            </FadeUp>
            <FadeUp delay={1.5} duration={1.4}>
              <a
                href="/fleet"
                className="font-sans font-bold text-[0.8rem] tracking-widest uppercase px-8 py-4 rounded border border-white/20 text-[#c4c6cf] hover:bg-white/5 transition-colors"
              >
                View Aircraft
              </a>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* 2. Eligibility Overview Cards — sits cleanly below hero, no aggressive overlap */}
      <section className="relative px-6 md:px-12 lg:px-20 max-w-7xl mx-auto -mt-10 z-20">
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6" staggerDelay={0.2} viewportMargin="-20%">
          {/* Card 1 */}
          <StaggerItem duration={1.4}>
            <HoverEmphasize className="group relative bg-[#121c29] border border-white/5 rounded-2xl p-9 md:p-10 shadow-lg transition-all duration-500 ease-out hover:bg-[#212b38] hover:border-[#aec7f7]/30 hover:shadow-2xl hover:shadow-[#aec7f7]/5">
              <div className="mb-5 text-[#aec7f7] group-hover:brightness-110 transition-all duration-500">
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M7 8h10M7 12h10M7 16h4" />
                </svg>
              </div>
              <h4 className="font-serif text-[1.3rem] tracking-wide text-[#d9e3f6] mb-3 group-hover:text-white transition-colors duration-500">
                Valid CASA Licence
              </h4>
              <p className="font-sans text-[0.88rem] text-[#c4c6cf] leading-[1.75] group-hover:text-white transition-colors duration-500">
                Holders of a current PPL, CPL, or ATPL issued by the Civil Aviation Safety Authority of Australia.
              </p>
            </HoverEmphasize>
          </StaggerItem>

          {/* Card 2 */}
          <StaggerItem duration={1.4}>
            <HoverEmphasize className="group relative bg-[#121c29] border border-white/5 rounded-2xl p-9 md:p-10 shadow-lg transition-all duration-500 ease-out hover:bg-[#212b38] hover:border-[#aec7f7]/30 hover:shadow-2xl hover:shadow-[#aec7f7]/5">
              <div className="mb-5 text-[#aec7f7] group-hover:brightness-110 transition-all duration-500">
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h4 className="font-serif text-[1.3rem] tracking-wide text-[#d9e3f6] mb-3 group-hover:text-white transition-colors duration-500">
                100 Flight Hours
              </h4>
              <p className="font-sans text-[0.88rem] text-[#c4c6cf] leading-[1.75] group-hover:text-white transition-colors duration-500">
                Verified minimum total time logged, ensuring a baseline of operational competence.
              </p>
            </HoverEmphasize>
          </StaggerItem>

          {/* Card 3 */}
          <StaggerItem duration={1.4}>
            <HoverEmphasize className="group relative bg-[#121c29] border border-white/5 rounded-2xl p-9 md:p-10 shadow-lg transition-all duration-500 ease-out hover:bg-[#212b38] hover:border-[#aec7f7]/30 hover:shadow-2xl hover:shadow-[#aec7f7]/5">
              <div className="mb-5 text-[#aec7f7] group-hover:brightness-110 transition-all duration-500">
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <h4 className="font-serif text-[1.3rem] tracking-wide text-[#d9e3f6] mb-3 group-hover:text-white transition-colors duration-500">
                Class 2 Medical
              </h4>
              <p className="font-sans text-[0.88rem] text-[#c4c6cf] leading-[1.75] group-hover:text-white transition-colors duration-500">
                Current aviation medical certification to ensure safety of flight.
              </p>
            </HoverEmphasize>
          </StaggerItem>
        </StaggerContainer>
      </section>

      {/* 3. Recency / Experience Strip */}
      <section className="relative px-6 md:px-12 lg:px-20 max-w-7xl mx-auto mt-5 pb-16">
        <FadeUp duration={1.6} delay={0.2} viewportMargin="-20%">
          <div className="bg-[#303a48]/30 backdrop-blur-[20px] border border-white/5 rounded-2xl flex flex-col md:flex-row items-center md:items-stretch justify-between gap-0 shadow-xl overflow-hidden group transition-all duration-500 ease-out hover:bg-[#303a48]/40 hover:border-[#aec7f7]/30 hover:shadow-2xl hover:shadow-[#aec7f7]/5">
            <div className="flex-1 p-9 md:p-12 lg:p-14">
              <h3 className="font-serif text-[1.5rem] text-[#d9e3f6] mb-4">
                Recent Experience
              </h3>
              <p className="font-sans text-[#c4c6cf] text-[0.92rem] leading-[1.78] max-w-md group-hover:text-white transition-colors duration-500">
                Evidence of at least 3 take-offs and landings in the preceding 90 days to maintain active proficiency.
              </p>
            </div>
            <div className="flex items-center gap-4 shrink-0 px-10 md:px-14 py-8 md:py-0 text-[#aec7f7]">
              <span
                className="font-serif font-light italic leading-none"
                style={{ fontSize: 'clamp(4rem, 7vw, 6.5rem)' }}
              >
                90
              </span>
              <div className="flex flex-col gap-0.5 mt-2">
                <span className="font-sans font-bold uppercase tracking-widest leading-tight" style={{ fontSize: '0.65rem' }}>
                  Days <br /> Proficiency
                </span>
              </div>
            </div>
          </div>
        </FadeUp>
      </section>

      {/* 4. Responsible Pilot Editorial Section */}
      <section className="relative py-32 bg-[#121c29] overflow-hidden">
        <div className="px-6 md:px-12 lg:px-20 max-w-7xl mx-auto">
          <StaggerContainer className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center" staggerDelay={0.4} viewportMargin="-25%">
            <div className="order-2 lg:order-1">
              <StaggerItem duration={1.6}>
                <h2 className="font-serif text-5xl md:text-6xl font-normal tracking-tight text-[#d9e3f6] leading-[1.1] mb-6 md:mb-8">
                  The <br /> Responsible <br /> Pilot
                </h2>
              </StaggerItem>
              <StaggerItem duration={1.6}>
                <div className="w-24 h-1 bg-[#aec7f7] mb-8"></div>
              </StaggerItem>
              <StaggerItem duration={1.6}>
                <div className="space-y-6 text-[#c4c6cf] font-sans text-[1rem] leading-relaxed max-w-md">
                  <p>
                    Our fleet of Cessna 172N aircraft represents more than just machinery; it is a shared resource for a community that values precision and integrity above all else.
                  </p>
                  <p>
                    We select pilots who view aviation as a craft, not a commodity. Responsibility here is measured in pre-flight rigor, transparent reporting, and an unwavering commitment to operational limits.
                  </p>
                </div>
              </StaggerItem>
            </div>
            <div className="order-1 lg:order-2 relative">
              <FadeUp delay={0.6} duration={2.0}>
                <div className="aspect-[16/10] bg-[#091421] rounded-xl overflow-hidden shadow-2xl relative border border-white/5">
                  <img 
                    src="/Pilot%26aircraftTwilight.webp" 
                    alt="The Responsible Pilot"
                    className="w-full h-full object-cover"
                  />
                </div>
              </FadeUp>
              {/* Overlaid quote box */}
              <FadeUp delay={1.4} duration={1.8}>
                <div className="absolute -bottom-5 -left-5 md:-bottom-6 md:-left-6 bg-[#2b3544]/95 backdrop-blur-md p-5 md:p-6 rounded-lg border border-white/10 max-w-[240px] shadow-2xl">
                  <p className="font-serif text-lg italic text-[#aec7f7] leading-relaxed">
                    &quot;Precise execution on the flight deck defines the culture of our community.&quot;
                  </p>
                </div>
              </FadeUp>
            </div>
          </StaggerContainer>
        </div>
      </section>

      {/* 5. Mandatory Credentials Section */}
      <section className="relative py-24 bg-[#091421] border-t border-white/5">
        <div className="px-6 md:px-12 lg:px-20 max-w-6xl mx-auto">
          <StaggerContainer className="text-center mb-20" viewportMargin="-20%">
            <StaggerItem duration={1.4}>
              <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6] mb-4">
                Mandatory Credentials
              </h2>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[0.85rem] text-[#64748b] italic">
                Digital copies required for the verification process
              </p>
            </StaggerItem>
          </StaggerContainer>
          
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 text-center md:text-left" staggerDelay={0.25} viewportMargin="-20%">
            <StaggerItem duration={1.4}>
              <div className="font-serif text-4xl font-light text-[#2a3647] mb-4">01</div>
              <h4 className="font-sans font-semibold text-[#d9e3f6] mb-2 tracking-wide">Pilot Licence</h4>
              <p className="font-sans text-[0.8rem] text-[#64748b] leading-relaxed">CASA Part 61 electronic flight crew licence</p>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <div className="font-serif text-4xl font-light text-[#2a3647] mb-4">02</div>
              <h4 className="font-sans font-semibold text-[#d9e3f6] mb-2 tracking-wide">Logbook Evidence</h4>
              <p className="font-sans text-[0.8rem] text-[#64748b] leading-relaxed">Last 3 pages and total hours summary</p>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <div className="font-serif text-4xl font-light text-[#2a3647] mb-4">03</div>
              <h4 className="font-sans font-semibold text-[#d9e3f6] mb-2 tracking-wide">Medical Cert</h4>
              <p className="font-sans text-[0.8rem] text-[#64748b] leading-relaxed">Current Class 1 or Class 2 certificate</p>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <div className="font-serif text-4xl font-light text-[#2a3647] mb-4">04</div>
              <h4 className="font-sans font-semibold text-[#d9e3f6] mb-2 tracking-wide">Photo ID</h4>
              <p className="font-sans text-[0.8rem] text-[#64748b] leading-relaxed">Australian Passport or Driver&apos;s Licence</p>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* 6. Approval / Checkout Process Steps */}
      <section className="relative py-24 bg-[#091421]">
        <div className="max-w-6xl mx-auto px-6 overflow-x-auto border-t border-white/5 pt-24 pb-12">
          <StaggerContainer className="min-w-[800px] flex justify-between items-start relative px-4" staggerDelay={0.3} viewportMargin="-20%">
            {/* Connecting line */}
            <div className="absolute top-[20px] left-[5%] right-[5%] h-[1px] bg-white/5 z-0" />
            
            {/* Steps */}
            {[
              { id: 1, title: 'Profile Submitted', desc: 'Securely upload your flight credentials.' },
              { id: 2, title: 'Document Review', desc: 'Verify medical and CASA status in database.' },
              { id: 3, title: 'Review & Verification', desc: 'Background check processing by chief pilot.' },
              { id: 4, title: 'Checkout Induction', desc: 'Flight evaluation with an OZRent instructor.' },
              { id: 5, title: 'Booking Access', desc: 'Full profile unlocked for aircraft reservations.' },
            ].map((step, idx) => (
              <StaggerItem key={idx} duration={1.4} className="relative z-10 flex flex-col items-center flex-1 text-center group">
                <div className="w-10 h-10 bg-[#0c1827] border border-white/10 flex items-center justify-center font-serif text-[1rem] text-[#64748b] mb-6 shadow-md transition-all duration-500 group-hover:bg-[#1b365d] group-hover:text-[#aec7f7]">
                  {step.id}
                </div>
                <h4 className="font-sans text-[0.65rem] uppercase tracking-[0.15em] font-bold text-[#d9e3f6] mb-3">
                  {step.title}
                </h4>
                <p className="font-sans text-[0.8rem] text-[#64748b] leading-relaxed max-w-[130px]">
                  {step.desc}
                </p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* 7. Operational Standards Section */}
      <section className="relative py-24 bg-[#091421] border-t border-white/5">
        <div className="px-6 md:px-12 lg:px-20 max-w-7xl mx-auto">
          <div className="bg-[#212b38] rounded-2xl overflow-hidden flex flex-col lg:flex-row shadow-2xl">
            
            {/* Left Content */}
            <div className="flex-1 p-10 md:p-16">
              <StaggerContainer viewportMargin="-30%">
                <StaggerItem duration={1.6}>
                  <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6] mb-12">
                    Operational <br/> Standards
                  </h2>
                </StaggerItem>
                <div className="space-y-10 border-l border-white/5 pl-8">
                  
                  <StaggerItem duration={1.4}>
                    <h4 className="font-sans font-semibold text-[#d9e3f6] text-[0.95rem] mb-2 flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-[#aec7f7]" />
                      Professional Handling
                    </h4>
                    <p className="font-sans text-[#64748b] text-[0.85rem] leading-relaxed ml-5">Safety is our primary operational paradigm. Managed risk profiles are non-negotiable.</p>
                  </StaggerItem>
                  
                  <StaggerItem duration={1.4}>
                    <h4 className="font-sans font-semibold text-[#d9e3f6] text-[0.95rem] mb-2 flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-[#aec7f7]" />
                      Operational Compliance
                    </h4>
                    <p className="font-sans text-[#64748b] text-[0.85rem] leading-relaxed ml-5">Adherence to VCA codes, POH limits, and local unfolding procedures is absolute.</p>
                  </StaggerItem>

                  <StaggerItem duration={1.4}>
                    <h4 className="font-sans font-semibold text-[#d9e3f6] text-[0.95rem] mb-2 flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-[#aec7f7]" />
                      Maintenance Reporting
                    </h4>
                    <p className="font-sans text-[#64748b] text-[0.85rem] leading-relaxed ml-5">Mandatory declaring of any squawks back at the base after A-Z flight checks to secure integrity standards.</p>
                  </StaggerItem>

                </div>
              </StaggerContainer>
            </div>

            {/* Right Image Placeholder */}
            <div className="lg:w-[50%] relative min-h-[300px] lg:min-h-auto bg-[#0c1827]">
              <FadeUp duration={2.4} delay={0.2} viewportMargin="-25%" className="absolute inset-0 w-full h-full">
                <img 
                  src="/Close-upNose.webp" 
                  alt="Operational Standards"
                  className="w-full h-full object-cover"
                />
              </FadeUp>
            </div>
            
          </div>
        </div>
      </section>

      {/* 8. Safety / Discretion Interstitial */}
      <section className="relative py-24 bg-[#091421] text-center border-t border-white/5">
        <StaggerContainer className="max-w-3xl mx-auto px-6" viewportMargin="-25%" staggerDelay={0.3}>
          <StaggerItem duration={1.6}>
            <div className="w-10 h-10 mx-auto mb-6 text-[#aec7f7] bg-[#aec7f7]/10 flex items-center justify-center rounded-full">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
          </StaggerItem>
          <StaggerItem duration={1.6}>
            <h3 className="font-serif text-2xl italic tracking-wide text-[#d9e3f6] mb-6">
              Safety & Discretion
            </h3>
          </StaggerItem>
          <StaggerItem duration={1.6}>
            <p className="font-sans text-[0.9rem] text-[#64748b] leading-relaxed max-w-2xl mx-auto">
              These requirements exist to protect the integrity of our fleet and the safety of our community. 
              OZRentAPlane reserves the right to decline or revoke booking privileges based on non-compliance or a lapse in our safety standards and behavioral protocols.
            </p>
          </StaggerItem>
        </StaggerContainer>
      </section>

      {/* 9. Final CTA Section */}
      <section className="relative py-40 bg-[#091421] overflow-hidden border-t border-white/5">
        <div className="absolute inset-0 z-0 bg-black">
          <img 
            src="/TwilightFlight.webp" 
            alt="The horizon awaits your command" 
            className="absolute inset-0 w-full h-full object-cover" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#091421]/90 via-[#091421]/20 to-transparent pointer-events-none"></div>
        </div>
        
        <div className="relative z-10 max-w-4xl mx-auto px-8 text-center">
          <StaggerContainer viewportMargin="-30%" staggerDelay={0.4}>
            <StaggerItem duration={1.6}>
              <h2 className="font-serif text-5xl md:text-7xl font-normal tracking-tight text-[#d9e3f6] mb-12">
                The horizon awaits your command.
              </h2>
            </StaggerItem>
            <StaggerItem duration={1.6}>
              <a 
                href="/contact" 
                className="inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] rounded-md font-sans font-bold tracking-widest uppercase text-lg px-16 py-6 shadow-2xl shadow-[#aec7f7]/20 transition-all active:scale-95 hover:brightness-110"
              >
                Begin Your Application
              </a>
            </StaggerItem>
            <StaggerItem duration={1.6}>
              <p className="font-sans text-xs uppercase tracking-widest text-[#c4c6cf] mt-12">
                EST. APPROVAL = 24-48 HOURS AFTER SUBMITTING CREDENTIALS
              </p>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

    </main>
  )
}
