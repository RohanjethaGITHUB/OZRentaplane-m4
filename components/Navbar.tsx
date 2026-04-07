'use client'

import { useEffect, useRef, useState } from 'react'

const NAV_LINKS = [
  { label: 'Fleet', href: '/fleet' },
  { label: 'Safety', href: '/safety' },
  { label: 'Pilot Requirements', href: '/pilotRequirements' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="fixed top-4 md:top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 md:gap-4 w-fit max-w-[96vw] transition-all duration-500">
      
      {/* Standalone Logo Pill */}
      <a
        href="/"
        className={`flex items-center justify-center shrink-0 h-[3.5rem] md:h-[4.25rem] px-6 md:px-8 rounded-full transition-all duration-500 ${
          scrolled 
            ? 'bg-[#091421]/80 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,14,37,0.5)]'
            : 'bg-[#091421]/45 backdrop-blur-lg border border-white/10 shadow-[0_4px_24px_rgba(0,14,37,0.3)]'
        }`}
        style={{ boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 8px 32px rgba(0, 14, 37, 0.5)' }}
      >
        <img 
          src="/Nav-logo.png" 
          alt="OZRentAPlane" 
          className="h-10 md:h-12 w-auto object-contain scale-[1.7] md:scale-[2.0] drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
        />
      </a>

      {/* Main Nav Pill */}
      <nav
        ref={navRef}
        className={`flex items-center px-6 md:px-8 h-[3.5rem] md:h-[4.25rem] rounded-full transition-all duration-500 ${
          scrolled
            ? 'bg-[#091421]/80 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,14,37,0.5)]'
            : 'bg-[#091421]/45 backdrop-blur-lg border border-white/10 shadow-[0_4px_24px_rgba(0,14,37,0.3)]'
        }`}
        style={{ boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 8px 32px rgba(0, 14, 37, 0.5)' }}
      >
        <div className="flex items-center gap-6 lg:gap-10">
          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-6 lg:gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="whitespace-nowrap font-sans text-[13px] lg:text-sm font-medium text-[rgba(255,255,255,0.7)] hover:text-white transition-colors duration-200 tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* CTA / Hamburger */}
          <div className="flex items-center gap-4 shrink-0 lg:border-l lg:border-white/10 lg:pl-8">
            <a
              href="#booking"
              className="hidden md:flex bg-oz-blue text-oz-deep px-6 py-2.5 rounded-full font-sans font-bold text-[13px] lg:text-sm hover:bg-white hover:shadow-[0_0_15px_rgba(167,200,255,0.4)] transition-all duration-300 tracking-wide whitespace-nowrap"
            >
              Book a Flight
            </a>

            <button
              className="lg:hidden flex flex-col gap-1.5 p-2"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              <span className={`block w-6 h-0.5 bg-oz-blue transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block w-6 h-0.5 bg-oz-blue transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-6 h-0.5 bg-oz-blue transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed top-[5.5rem] left-1/2 -translate-x-1/2 w-[92vw] lg:hidden bg-[#091421]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex flex-col gap-5 shadow-2xl z-40">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="font-sans text-base font-semibold text-white/90 hover:text-oz-blue transition-colors whitespace-nowrap"
            >
              {link.label}
            </a>
          ))}
          <a
            href="#booking"
            onClick={() => setMenuOpen(false)}
            className="bg-oz-blue text-oz-deep px-5 py-3 rounded-full font-bold text-sm text-center mt-2 whitespace-nowrap"
          >
            Book a Flight
          </a>
        </div>
      )}
    </header>
  )
}
