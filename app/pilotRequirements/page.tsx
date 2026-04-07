'use client'

import React from 'react'
import { motion } from 'framer-motion'

export default function PilotRequirementsPage() {
  return (
    <main className="min-h-screen bg-[#091421] text-[#d9e3f6]">
      
      {/* 1. Hero Section */}
      <header className="relative min-h-[870px] flex items-center justify-center pt-24 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-[#091421] via-transparent to-[#091421]"></div>
          <img 
            className="w-full h-full object-cover opacity-40 mix-blend-luminosity" 
            alt="Pilot Requirements Hero" 
            src="/PilotRequirementsHero-Sunset.webp" 
          />
        </div>
        <div className="relative z-10 max-w-5xl px-8 text-center">
          <h1 className="font-serif text-6xl md:text-8xl font-extrabold tracking-tight text-[#d9e3f6] leading-[1.1] mb-8">
            Pilot Requirements
          </h1>
          <p className="font-sans text-[#c4c6cf] text-xl md:text-2xl max-w-3xl mx-auto mb-12 leading-relaxed font-light">
            Excellence is standard. Review the prerequisites for commanding our Cessna 172N fleet within the Australian stratosphere.
          </p>
          <div className="flex flex-col md:flex-row items-center justify-center gap-6">
            <a 
              href="#"
              className="inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] px-10 py-4 rounded-md font-bold tracking-widest text-sm uppercase transition-all duration-300 active:scale-90 w-full md:w-auto"
            >
              Start Approval
            </a>
            <a 
              href="/fleet"
              className="inline-block text-[#aec7f7] font-sans font-bold tracking-widest text-sm uppercase border-b-2 border-[#aec7f7]/20 hover:border-[#aec7f7] transition-all duration-300 px-2 py-4 w-full md:w-auto"
            >
              View Aircraft
            </a>
          </div>
        </div>
      </header>

      {/* 2. Eligibility Overview Cards — sits cleanly below hero, no aggressive overlap */}
      <section className="relative px-6 md:px-12 lg:px-20 max-w-7xl mx-auto -mt-10 z-20">
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={{
            visible: { transition: { staggerChildren: 0.15 } }
          }}
        >
          {/* Card 1 */}
          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 30 },
              visible: { 
                opacity: 1, 
                y: 0, 
                transition: { duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98], staggerChildren: 0.1 } 
              }
            }}
            className="group relative bg-[#121c29] border border-white/5 rounded-2xl p-9 md:p-10 shadow-lg transition-all duration-500 ease-out hover:-translate-y-1.5 hover:bg-[#212b38] hover:border-[#aec7f7]/30 hover:shadow-2xl hover:shadow-[#aec7f7]/5"
          >
            <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }} className="mb-5 text-[#aec7f7] group-hover:brightness-110 transition-all duration-500">
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 8h10M7 12h10M7 16h4" />
              </svg>
            </motion.div>
            <motion.h4 variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }} className="font-serif text-[1.3rem] tracking-wide text-[#d9e3f6] mb-3 group-hover:text-white transition-colors duration-500">
              Valid CASA Licence
            </motion.h4>
            <motion.p variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }} className="font-sans text-[0.88rem] text-[#c4c6cf] leading-[1.75] group-hover:text-white transition-colors duration-500">
              Holders of a current PPL, CPL, or ATPL issued by the Civil Aviation Safety Authority of Australia.
            </motion.p>
          </motion.div>

          {/* Card 2 */}
          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 30 },
              visible: { 
                opacity: 1, 
                y: 0, 
                transition: { duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98], staggerChildren: 0.1 } 
              }
            }}
            className="group relative bg-[#121c29] border border-white/5 rounded-2xl p-9 md:p-10 shadow-lg transition-all duration-500 ease-out hover:-translate-y-1.5 hover:bg-[#212b38] hover:border-[#aec7f7]/30 hover:shadow-2xl hover:shadow-[#aec7f7]/5"
          >
            <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }} className="mb-5 text-[#aec7f7] group-hover:brightness-110 transition-all duration-500">
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </motion.div>
            <motion.h4 variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }} className="font-serif text-[1.3rem] tracking-wide text-[#d9e3f6] mb-3 group-hover:text-white transition-colors duration-500">
              100 Flight Hours
            </motion.h4>
            <motion.p variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }} className="font-sans text-[0.88rem] text-[#c4c6cf] leading-[1.75] group-hover:text-white transition-colors duration-500">
              Verified minimum total time logged, ensuring a baseline of operational competence.
            </motion.p>
          </motion.div>

          {/* Card 3 */}
          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 30 },
              visible: { 
                opacity: 1, 
                y: 0, 
                transition: { duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98], staggerChildren: 0.1 } 
              }
            }}
            className="group relative bg-[#121c29] border border-white/5 rounded-2xl p-9 md:p-10 shadow-lg transition-all duration-500 ease-out hover:-translate-y-1.5 hover:bg-[#212b38] hover:border-[#aec7f7]/30 hover:shadow-2xl hover:shadow-[#aec7f7]/5"
          >
            <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }} className="mb-5 text-[#aec7f7] group-hover:brightness-110 transition-all duration-500">
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </motion.div>
            <motion.h4 variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }} className="font-serif text-[1.3rem] tracking-wide text-[#d9e3f6] mb-3 group-hover:text-white transition-colors duration-500">
              Class 2 Medical
            </motion.h4>
            <motion.p variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }} className="font-sans text-[0.88rem] text-[#c4c6cf] leading-[1.75] group-hover:text-white transition-colors duration-500">
              Current aviation medical certification to ensure safety of flight.
            </motion.p>
          </motion.div>
        </motion.div>
      </section>

      {/* 3. Recency / Experience Strip */}
      <section className="relative px-6 md:px-12 lg:px-20 max-w-7xl mx-auto mt-5 pb-16">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={{
            hidden: { opacity: 0, y: 30 },
            visible: { 
              opacity: 1, 
              y: 0, 
              transition: { delay: 0.2, duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98], staggerChildren: 0.1 } 
            }
          }}
          className="bg-[#303a48]/30 backdrop-blur-[20px] border border-white/5 rounded-2xl flex flex-col md:flex-row items-center md:items-stretch justify-between gap-0 shadow-xl overflow-hidden group transition-all duration-500 ease-out hover:-translate-y-1.5 hover:bg-[#303a48]/40 hover:border-[#aec7f7]/30 hover:shadow-2xl hover:shadow-[#aec7f7]/5"
        >
          <div className="flex-1 p-9 md:p-12 lg:p-14">
            <motion.h3 
              variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }}
              className="font-serif text-[1.5rem] text-[#d9e3f6] mb-4"
            >
              Recent Experience
            </motion.h3>
            <motion.p 
              variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }}
              className="font-sans text-[#c4c6cf] text-[0.92rem] leading-[1.78] max-w-md group-hover:text-white transition-colors duration-500"
            >
              Evidence of at least 3 take-offs and landings in the preceding 90 days to maintain active proficiency.
            </motion.p>
          </div>
          <motion.div 
            variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: "easeOut" } } }}
            className="flex items-center gap-4 shrink-0 px-10 md:px-14 py-8 md:py-0 text-[#aec7f7]"
          >
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
          </motion.div>
        </motion.div>
      </section>

      {/* 4. Responsible Pilot Editorial Section */}
      <section className="relative py-32 bg-[#121c29] overflow-hidden">
        <div className="px-6 md:px-12 lg:px-20 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
            <div className="order-2 lg:order-1">
              <h2 className="font-serif text-5xl md:text-6xl font-normal tracking-tight text-[#d9e3f6] leading-[1.1] mb-6 md:mb-8">
                The <br /> Responsible <br /> Pilot
              </h2>
              <div className="w-24 h-1 bg-[#aec7f7] mb-8"></div>
              <div className="space-y-6 text-[#c4c6cf] font-sans text-[1rem] leading-relaxed max-w-md">
                <p>
                  Our fleet of Cessna 172N aircraft represents more than just machinery; it is a shared resource for a community that values precision and integrity above all else.
                </p>
                <p>
                  We select pilots who view aviation as a craft, not a commodity. Responsibility here is measured in pre-flight rigor, transparent reporting, and an unwavering commitment to operational limits.
                </p>
              </div>
            </div>
            <div className="order-1 lg:order-2 relative">
              <div className="aspect-[16/10] bg-[#091421] rounded-xl overflow-hidden shadow-2xl relative border border-white/5">
                <img 
                  src="/Pilot%26aircraftTwilight.webp" 
                  alt="The Responsible Pilot"
                  className="w-full h-full object-cover"
                />
              </div>
              {/* Overlaid quote box */}
              <div className="absolute -bottom-5 -left-5 md:-bottom-6 md:-left-6 bg-[#2b3544]/95 backdrop-blur-md p-5 md:p-6 rounded-lg border border-white/10 max-w-[240px] shadow-2xl">
                <p className="font-serif text-lg italic text-[#aec7f7] leading-relaxed">
                  "Precise execution on the flight deck defines the culture of our community."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Mandatory Credentials Section */}
      <section className="relative py-24 bg-[#091421] border-t border-white/5">
        <div className="px-6 md:px-12 lg:px-20 max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6] mb-4">
              Mandatory Credentials
            </h2>
            <p className="font-sans text-[0.85rem] text-[#64748b] italic">
              Digital copies required for the verification process
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 text-center md:text-left">
            <div>
              <div className="font-serif text-4xl font-light text-[#2a3647] mb-4">01</div>
              <h4 className="font-sans font-semibold text-[#d9e3f6] mb-2 tracking-wide">Pilot Licence</h4>
              <p className="font-sans text-[0.8rem] text-[#64748b] leading-relaxed">CASA Part 61 electronic flight crew licence</p>
            </div>
            <div>
              <div className="font-serif text-4xl font-light text-[#2a3647] mb-4">02</div>
              <h4 className="font-sans font-semibold text-[#d9e3f6] mb-2 tracking-wide">Logbook Evidence</h4>
              <p className="font-sans text-[0.8rem] text-[#64748b] leading-relaxed">Last 3 pages and total hours summary</p>
            </div>
            <div>
              <div className="font-serif text-4xl font-light text-[#2a3647] mb-4">03</div>
              <h4 className="font-sans font-semibold text-[#d9e3f6] mb-2 tracking-wide">Medical Cert</h4>
              <p className="font-sans text-[0.8rem] text-[#64748b] leading-relaxed">Current Class 1 or Class 2 certificate</p>
            </div>
            <div>
              <div className="font-serif text-4xl font-light text-[#2a3647] mb-4">04</div>
              <h4 className="font-sans font-semibold text-[#d9e3f6] mb-2 tracking-wide">Photo ID</h4>
              <p className="font-sans text-[0.8rem] text-[#64748b] leading-relaxed">Australian Passport or Driver's Licence</p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Approval / Checkout Process Steps */}
      <section className="relative py-24 bg-[#091421]">
        <div className="max-w-6xl mx-auto px-6 overflow-x-auto border-t border-white/5 pt-24 pb-12">
          <div className="min-w-[800px] flex justify-between items-start relative px-4">
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
              <div key={idx} className="relative z-10 flex flex-col items-center flex-1 text-center group">
                <div className="w-10 h-10 bg-[#0c1827] border border-white/10 flex items-center justify-center font-serif text-[1rem] text-[#64748b] mb-6 shadow-md">
                  {step.id}
                </div>
                <h4 className="font-sans text-[0.65rem] uppercase tracking-[0.15em] font-bold text-[#d9e3f6] mb-3">
                  {step.title}
                </h4>
                <p className="font-sans text-[0.8rem] text-[#64748b] leading-relaxed max-w-[130px]">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Operational Standards Section */}
      <section className="relative py-24 bg-[#091421] border-t border-white/5">
        <div className="px-6 md:px-12 lg:px-20 max-w-7xl mx-auto">
          <div className="bg-[#212b38] rounded-2xl overflow-hidden flex flex-col lg:flex-row shadow-2xl">
            
            {/* Left Content */}
            <div className="flex-1 p-10 md:p-16">
              <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#d9e3f6] mb-12">
                Operational <br/> Standards
              </h2>
              <div className="space-y-10 border-l border-white/5 pl-8">
                
                <div>
                  <h4 className="font-sans font-semibold text-[#d9e3f6] text-[0.95rem] mb-2 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-[#aec7f7]" />
                    Professional Handling
                  </h4>
                  <p className="font-sans text-[#64748b] text-[0.85rem] leading-relaxed ml-5">Safety is our primary operational paradigm. Managed risk profiles are non-negotiable.</p>
                </div>
                
                <div>
                  <h4 className="font-sans font-semibold text-[#d9e3f6] text-[0.95rem] mb-2 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-[#aec7f7]" />
                    Operational Compliance
                  </h4>
                  <p className="font-sans text-[#64748b] text-[0.85rem] leading-relaxed ml-5">Adherence to VCA codes, POH limits, and local unfolding procedures is absolute.</p>
                </div>

                <div>
                  <h4 className="font-sans font-semibold text-[#d9e3f6] text-[0.95rem] mb-2 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-[#aec7f7]" />
                    Maintenance Reporting
                  </h4>
                  <p className="font-sans text-[#64748b] text-[0.85rem] leading-relaxed ml-5">Mandatory declaring of any squawks back at the base after A-Z flight checks to secure integrity standards.</p>
                </div>

              </div>
            </div>

            {/* Right Image Placeholder */}
            <div className="lg:w-[50%] relative min-h-[300px] lg:min-h-auto bg-[#0c1827]">
                <img 
                  src="/Close-upNose.webp" 
                  alt="Operational Standards"
                  className="absolute inset-0 w-full h-full object-cover"
                />
            </div>
            
          </div>
        </div>
      </section>

      {/* 8. Safety / Discretion Interstitial */}
      <section className="relative py-24 bg-[#091421] text-center border-t border-white/5">
        <div className="max-w-3xl mx-auto px-6">
          <div className="w-10 h-10 mx-auto mb-6 text-[#aec7f7] bg-[#aec7f7]/10 flex items-center justify-center rounded-full">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h3 className="font-serif text-2xl italic tracking-wide text-[#d9e3f6] mb-6">
            Safety & Discretion
          </h3>
          <p className="font-sans text-[0.9rem] text-[#64748b] leading-relaxed max-w-2xl mx-auto">
            These requirements exist to protect the integrity of our fleet and the safety of our community. 
            OZRentAPlane reserves the right to decline or revoke booking privileges based on non-compliance or a lapse in our safety standards and behavioral protocols.
          </p>
        </div>
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
          <h2 className="font-serif text-5xl md:text-7xl font-normal tracking-tight text-[#d9e3f6] mb-12">
            The horizon awaits your command.
          </h2>
          <a 
            href="/contact" 
            className="inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] rounded-md font-sans font-bold tracking-widest uppercase text-lg px-16 py-6 shadow-2xl shadow-[#aec7f7]/20 transition-all active:scale-95 hover:brightness-110"
          >
            Begin Your Application
          </a>
          <p className="font-sans text-xs uppercase tracking-widest text-[#c4c6cf] mt-12">
            EST. APPROVAL = 24-48 HOURS AFTER SUBMITTING CREDENTIALS
          </p>
        </div>
      </section>

    </main>
  )
}
