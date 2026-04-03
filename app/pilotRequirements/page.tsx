import React from 'react'

export default function PilotRequirementsPage() {
  return (
    <main className="min-h-screen bg-[#091421] text-[#d9e3f6]">
      
      {/* 1. Hero Section */}
      <section className="relative pt-32 pb-24 md:pt-48 md:pb-32 px-6 md:px-12 lg:px-20 text-center overflow-hidden flex flex-col items-center justify-center min-h-[600px]">
        {/* PLACEHOLDER: Replace this div with a real image later via an <img /> or bg class */}
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#0c1827] via-[#112238] to-[#091421]" />
        
        <div className="relative z-10 max-w-4xl mx-auto">
          <h1 className="font-serif text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 text-shadow-lg">
            Pilot Requirements
          </h1>
          <p className="font-sans text-[1.1rem] leading-relaxed text-[#c4c6cf] mb-10 max-w-2xl mx-auto drop-shadow-md">
            Experience is standard. Review the prerequisites for commanding our Cessna 172N fleet within the Australian airspace.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a 
              href="#" 
              className="font-sans font-bold text-[0.8rem] tracking-widest uppercase px-8 py-4 rounded bg-[#aec7f7] text-[#001b3d] hover:bg-[#dbeafe] transition-colors shadow-lg"
            >
              Start Application
            </a>
            <a 
              href="/fleet" 
              className="font-sans font-bold text-[0.8rem] tracking-widest uppercase px-8 py-4 rounded border border-white/20 text-[#c4c6cf] hover:bg-white/5 transition-colors backdrop-blur-sm"
            >
              View Aircraft
            </a>
          </div>
        </div>
      </section>

      {/* 2. Eligibility Overview Cards */}
      <section className="relative px-6 md:px-12 lg:px-20 max-w-6xl mx-auto -mt-16 z-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-[#0f1b2d]/95 backdrop-blur-xl border border-white/10 rounded-xl p-8 shadow-2xl">
            <div className="mb-4 text-[#64748b]">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 8h10M7 12h10M7 16h4" />
              </svg>
            </div>
            <h4 className="font-serif text-xl tracking-wide text-[#d9e3f6] mb-2">Valid CASA Licence</h4>
            <p className="font-sans text-[0.85rem] text-[#94a3b8] leading-relaxed">
              Hold a current PPL, CPL, or ATPL issued by the Civil Aviation Safety Authority of Australia.
            </p>
          </div>
          {/* Card 2 */}
          <div className="bg-[#0f1b2d]/95 backdrop-blur-xl border border-white/10 rounded-xl p-8 shadow-2xl">
            <div className="mb-4 text-[#64748b]">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h4 className="font-serif text-xl tracking-wide text-[#d9e3f6] mb-2">100 Flight Hours+</h4>
            <p className="font-sans text-[0.85rem] text-[#94a3b8] leading-relaxed">
              Verified minimum of 100 hours of total logged time to ensure a foundational level of competence.
            </p>
          </div>
          {/* Card 3 */}
          <div className="bg-[#0f1b2d]/95 backdrop-blur-xl border border-white/10 rounded-xl p-8 shadow-2xl">
            <div className="mb-4 text-[#64748b]">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <h4 className="font-serif text-xl tracking-wide text-[#d9e3f6] mb-2">Class 2 Medical</h4>
            <p className="font-sans text-[0.85rem] text-[#94a3b8] leading-relaxed">
              Current and valid Class 2 (or higher) Australian aviation medical certificate.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Recency / Experience Strip */}
      <section className="relative px-6 md:px-12 lg:px-20 max-w-6xl mx-auto mt-6">
        <div className="bg-[#0c1827] border border-white/5 rounded-xl p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8 py-10 shadow-lg">
          <div className="flex-1">
            <h3 className="font-serif text-2xl text-[#d9e3f6] mb-3">Recent Experience</h3>
            <p className="font-sans text-[#94a3b8] text-[0.95rem] leading-relaxed max-w-xl">
              Evidence of at least 3 take-offs and landings in the preceding 90 days to maintain active proficiency.
            </p>
          </div>
          <div className="flex items-baseline gap-2 shrink-0 border-l border-white/10 pl-8">
            <span className="font-serif text-6xl md:text-7xl font-light italic text-[#c4c6cf]">90</span>
            <span className="font-sans text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#64748b] leading-tight w-20">
              Days <br/>Currency
            </span>
          </div>
        </div>
      </section>

      {/* 4. Responsible Pilot Editorial Section */}
      <section className="relative py-32 px-6 md:px-12 lg:px-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div className="order-2 lg:order-1">
            <h2 className="font-serif text-5xl md:text-6xl font-normal tracking-tight text-[#d9e3f6] leading-[1.1] mb-8">
              The <br /> Responsible <br /> Pilot
            </h2>
            <div className="space-y-6 text-[#94a3b8] font-sans text-[1rem] leading-relaxed max-w-md">
              <p>
                Our fleet of Cessna 172N aircraft represents more than just machinery; it is a shared resource for a community that values precision and integrity above all else.
              </p>
              <p>
                We select pilots who view aviation as a craft, not a commodity. Responsibility here is measured in pre-flight rigor, transparent reporting, and an unwavering commitment to operational limits.
              </p>
            </div>
          </div>
          <div className="order-1 lg:order-2 relative">
            {/* IMAGE PLACEHOLDER: Swap div below for an <img /> later */}
            <div className="relative rounded-lg overflow-hidden shadow-2xl aspect-[16/10] bg-gradient-to-tr from-[#1a2942] to-[#091421] border border-white/5">
              <div className="absolute inset-0 flex items-center justify-center text-[#64748b] font-sans text-xs tracking-widest uppercase">
                [ Responsible Pilot Image ]
              </div>
            </div>
            {/* Overlaid quote box */}
            <div className="absolute -bottom-6 -left-6 md:bottom-8 md:-left-12 bg-[#1a2942]/95 backdrop-blur-md p-6 md:p-8 border border-white/10 max-w-[280px] shadow-2xl">
              <p className="font-serif text-lg italic text-[#d9e3f6] leading-relaxed">
                "Precise execution on the flight deck defines the culture of our community."
              </p>
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
          <div className="bg-[#111e30] rounded-2xl overflow-hidden flex flex-col lg:flex-row shadow-2xl">
            
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
                {/* IMAGE PLACEHOLDER: Swap below div w/ img block */}
                <div className="absolute inset-0 bg-gradient-to-tr from-[#1a2942] to-[#0c1827] flex items-center justify-center opacity-80">
                  <span className="font-sans text-xs tracking-widest uppercase text-[#64748b]">
                    [ Aircraft Details Prop Image ]
                  </span>
                </div>
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
      <section className="relative pt-32 pb-40 bg-[#0c1827] text-center overflow-hidden flex flex-col items-center justify-center border-t border-white/5">
        {/* IMAGE PLACEHOLDER: Replace this div with your final skyline image */}
        <div className="absolute inset-0 z-0 bg-gradient-to-t from-[#091421] to-[#152438]" />
        
        <div className="relative z-10 px-6 md:px-12 max-w-3xl mx-auto">
          <h2 className="font-serif text-5xl md:text-6xl font-normal tracking-tight text-[#d9e3f6] mb-12">
            The horizon awaits your command.
          </h2>
          <a 
            href="/contact" 
            className="inline-block font-sans font-bold text-[0.8rem] tracking-widest uppercase px-12 py-5 rounded bg-[#aec7f7] text-[#001b3d] hover:bg-[#dbeafe] transition-colors shadow-lg"
          >
            Begin Your Application
          </a>
          <p className="font-sans text-[0.65rem] uppercase tracking-[0.25em] text-[#64748b] mt-10">
            EST. APPROVAL = 24-48 HOURS AFTER SUBMITTING CREDENTIALS
          </p>
        </div>
      </section>

    </main>
  )
}
