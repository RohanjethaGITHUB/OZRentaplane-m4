import React from 'react'

export default function Footer() {
  return (
    <footer className="bg-[#050B14] pt-24 pb-12 px-6 md:px-12 lg:px-20 border-t border-white/5">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-16 md:gap-8 mb-24">
        
        {/* Left Brand Area */}
        <div className="max-w-xs shrink-0">
          <h2 className="font-serif text-3xl font-normal italic text-[#d9e3f6] mb-5 tracking-tight">
            OZRentAPlane
          </h2>
          <p className="font-sans text-[0.85rem] leading-relaxed text-[#c4c6cf] opacity-70">
            The industry standard for premium, tech-forward aircraft rentals across the region.
          </p>
        </div>

        {/* Right Link Columns */}
        <div className="flex flex-wrap md:flex-nowrap gap-x-16 lg:gap-x-24 gap-y-12">
          
          {/* Column 1 */}
          <div className="flex flex-col gap-[0.85rem]">
            <h4 className="font-sans font-bold text-[0.85rem] text-[#dbeafe] mb-1">Fleet</h4>
            <a href="#" className="font-sans text-[0.8rem] text-[#c4c6cf] hover:text-[#dbeafe] transition-colors opacity-70">Cessna 172</a>
            <a href="#" className="font-sans text-[0.8rem] text-[#c4c6cf] hover:text-[#dbeafe] transition-colors opacity-70">Cirrus SR22</a>
            <a href="#" className="font-sans text-[0.8rem] text-[#c4c6cf] hover:text-[#dbeafe] transition-colors opacity-70">Piper Archer</a>
          </div>

          {/* Column 2 */}
          <div className="flex flex-col gap-[0.85rem]">
            <h4 className="font-sans font-bold text-[0.85rem] text-[#dbeafe] mb-1">Company</h4>
            <a href="#" className="font-sans text-[0.8rem] text-[#c4c6cf] hover:text-[#dbeafe] transition-colors opacity-70">Our Story</a>
            <a href="#" className="font-sans text-[0.8rem] text-[#c4c6cf] hover:text-[#dbeafe] transition-colors opacity-70">Safety Protocols</a>
            <a href="#" className="font-sans text-[0.8rem] text-[#c4c6cf] hover:text-[#dbeafe] transition-colors opacity-70">Careers</a>
          </div>

          {/* Column 3 */}
          <div className="flex flex-col gap-[0.85rem]">
            <h4 className="font-sans font-bold text-[0.85rem] text-[#dbeafe] mb-1">Support</h4>
            <a href="#" className="font-sans text-[0.8rem] text-[#c4c6cf] hover:text-[#dbeafe] transition-colors opacity-70">Help Center</a>
            <a href="#" className="font-sans text-[0.8rem] text-[#c4c6cf] hover:text-[#dbeafe] transition-colors opacity-70">Contact Support</a>
            <a href="/faq" className="font-sans text-[0.8rem] text-[#c4c6cf] hover:text-[#dbeafe] transition-colors opacity-70">FAQ</a>
          </div>

          {/* Column 4 */}
          <div className="flex flex-col gap-[0.85rem]">
            <h4 className="font-sans font-bold text-[0.85rem] text-[#dbeafe] mb-1">Legal</h4>
            <a href="/terms-and-conditions" className="font-sans text-[0.8rem] text-[#c4c6cf] hover:text-[#dbeafe] transition-colors opacity-70">Terms &amp; Conditions</a>
            <a href="/privacy-policy" className="font-sans text-[0.8rem] text-[#c4c6cf] hover:text-[#dbeafe] transition-colors opacity-70">Privacy Policy</a>
            <a href="/safety-disclaimer" className="font-sans text-[0.8rem] text-[#c4c6cf] hover:text-[#dbeafe] transition-colors opacity-70">Safety Disclaimer</a>
          </div>

        </div>
      </div>

      {/* Bottom Bar */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 pt-8 border-t border-white/[0.06]">
        <p className="font-sans text-[0.65rem] tracking-widest uppercase text-[#c4c6cf] opacity-50 text-center md:text-left">
          &copy; {new Date().getFullYear()} OZRENTAPLANE RENTALS. EDITORIAL EXCELLENCE IN FLIGHT.
        </p>
        
        {/* Subtle Social/Media Icons */}
        <div className="flex gap-7 items-center text-[#c4c6cf] opacity-60">
          <a href="#" aria-label="Region" className="hover:opacity-100 transition-opacity">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </a>
          <a href="#" aria-label="Contact" className="hover:opacity-100 transition-opacity">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </a>
          <a href="#" aria-label="Social" className="hover:opacity-100 transition-opacity">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4" />
              <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  )
}
