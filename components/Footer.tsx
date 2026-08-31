'use client'

import React from 'react'
import { usePathname } from 'next/navigation'

type FooterProps = { forceShow?: boolean }

export default function Footer({ forceShow = false }: FooterProps) {
  const pathname = usePathname()
  if (!forceShow && ((pathname?.startsWith('/dashboard') ?? false) || (pathname?.startsWith('/admin') ?? false) || pathname === '/become-an-instructor')) return null

  return (
    <footer className="bg-[#0a1426] pt-24 pb-12 px-6 md:px-12 lg:px-20" style={{ marginTop: '-2px' }}>
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-16 md:gap-8 mb-24">
        
        {/* Left Brand Area */}
        <div className="max-w-xs shrink-0">
          <div className="flex items-center gap-3">
            <img
              src="/Logo/ozrentaplane-transparent-bg.png"
              alt="OZ Rent A Plane"
              className="block h-14 w-auto object-contain mb-5 bg-transparent"
              style={{
                filter: 'drop-shadow(0 0 8px rgba(167,200,255,0.45)) drop-shadow(0 0 3px rgba(167,200,255,0.3))',
              }}
            />
            <div className="mb-5 flex flex-col justify-center leading-none">
              <span
                style={{
                  fontFamily: 'Manrope, system-ui, sans-serif',
                  fontSize: '18px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: 'rgba(255,255,255,1)',
                }}
              >
                OZ
              </span>
              <span
                style={{
                  fontFamily: 'Manrope, system-ui, sans-serif',
                  fontSize: '12px',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  color: 'rgba(255,255,255,0.6)',
                  textTransform: 'uppercase',
                }}
              >
                Rent A Plane
              </span>
            </div>
          </div>
          <p className="font-sans text-[0.85rem] leading-relaxed text-cloud-muted opacity-70">
            The industry standard for premium, tech-forward aircraft rentals across the region.
          </p>
        </div>

        {/* Right Link Columns */}
        <div className="flex flex-wrap md:flex-nowrap gap-x-16 lg:gap-x-24 gap-y-12">
          
          <div className="flex flex-col gap-[0.85rem]">
            <h4 className="font-sans font-bold text-[0.85rem] text-horizon-border mb-1">Fleet</h4>
            <a href="/fleet" className="font-sans text-[0.8rem] text-cloud-muted hover:text-ember-gold transition-colors opacity-70">Cessna 172</a>
          </div>

          {/* Column 2 */}
          <div className="flex flex-col gap-[0.85rem]">
            <h4 className="font-sans font-bold text-[0.85rem] text-horizon-border mb-1">Company</h4>
            <a href="/login" className="font-sans text-[0.8rem] text-cloud-muted hover:text-ember-gold transition-colors opacity-70">Our Story</a>
            <a href="/login" className="font-sans text-[0.8rem] text-cloud-muted hover:text-ember-gold transition-colors opacity-70">Safety Protocols</a>
            <a href="/login" className="font-sans text-[0.8rem] text-cloud-muted hover:text-ember-gold transition-colors opacity-70">Careers</a>
          </div>

          {/* Column 3 */}
          <div className="flex flex-col gap-[0.85rem]">
            <h4 className="font-sans font-bold text-[0.85rem] text-horizon-border mb-1">Support</h4>
            <a href="/login" className="font-sans text-[0.8rem] text-cloud-muted hover:text-ember-gold transition-colors opacity-70">Help Center</a>
            <a href="/contact-us" className="font-sans text-[0.8rem] text-cloud-muted hover:text-ember-gold transition-colors opacity-70">Contact Us</a>
            <a href="/faq" className="font-sans text-[0.8rem] text-cloud-muted hover:text-ember-gold transition-colors opacity-70">FAQ</a>
          </div>

          {/* Column 4 */}
          <div className="flex flex-col gap-[0.85rem]">
            <h4 className="font-sans font-bold text-[0.85rem] text-horizon-border mb-1">Legal</h4>
            <a href="/terms-and-conditions" className="font-sans text-[0.8rem] text-cloud-muted hover:text-ember-gold transition-colors opacity-70">Terms &amp; Conditions</a>
            <a href="/privacy-policy" className="font-sans text-[0.8rem] text-cloud-muted hover:text-ember-gold transition-colors opacity-70">Privacy Policy</a>
            <a href="/safety-disclaimer" className="font-sans text-[0.8rem] text-cloud-muted hover:text-ember-gold transition-colors opacity-70">Safety Disclaimer</a>
          </div>

        </div>
      </div>

      {/* Bottom Bar */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 pt-8 border-t border-white/[0.06]">
        <p className="font-sans text-[0.65rem] tracking-widest uppercase text-cloud-muted opacity-50 text-center md:text-left">
          &copy; {new Date().getFullYear()} OZRENTAPLANE RENTALS. EDITORIAL EXCELLENCE IN FLIGHT.
        </p>
        
        {/* Subtle Social/Media Icons */}
        <div className="flex gap-7 items-center text-cloud-muted opacity-60">
          <a href="/login" aria-label="Region" className="hover:opacity-100 hover:text-ember-gold transition-colors">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </a>
          <a href="/contact-us" aria-label="Contact Us" className="hover:opacity-100 hover:text-ember-gold transition-colors">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </a>
          <a href="/login" aria-label="Social" className="hover:opacity-100 hover:text-ember-gold transition-colors">
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
