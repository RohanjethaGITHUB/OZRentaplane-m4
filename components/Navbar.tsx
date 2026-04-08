'use client'

import { useState } from 'react'

const NAV_LINKS = [
  { label: 'Fleet',        href: '/fleet' },
  { label: 'Safety',       href: '/safety' },
  { label: 'Requirements', href: '/pilotRequirements' },
  { label: 'Pricing',      href: '/pricing' },
]

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-[#091421] shadow-[0_1px_0_rgba(255,255,255,0.07)]"
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-[62px] flex items-center justify-between gap-8">

        {/* Logo */}
        <a
          href="/"
          className="shrink-0 font-serif italic font-bold text-[1.25rem] tracking-tight text-oz-blue select-none"
        >
          OZRentAPlane
        </a>

        {/* Desktop links */}
        <nav className="hidden lg:flex items-center gap-7 xl:gap-9">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="whitespace-nowrap font-sans text-[13.5px] font-medium text-white/70 hover:text-white transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* CTA + hamburger */}
        <div className="flex items-center gap-4 shrink-0">
          <a
            href="#booking"
            className="hidden md:inline-flex items-center font-sans font-semibold text-[13px] text-[#0c1a2e] bg-[#c8dcff] hover:bg-white px-5 py-2 rounded-full transition-colors duration-200 whitespace-nowrap"
          >
            Book a Flight
          </a>

          {/* Hamburger — mobile only */}
          <button
            className="lg:hidden flex flex-col justify-center gap-[5px] w-8 h-8"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span className={`block w-6 h-0.5 bg-white/70 transition-all duration-300 origin-center ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
            <span className={`block w-6 h-0.5 bg-white/70 transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-6 h-0.5 bg-white/70 transition-all duration-300 origin-center ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="lg:hidden bg-[#091421]/98 backdrop-blur-xl border-t border-white/8 px-6 py-5 flex flex-col gap-4">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="font-sans text-[15px] font-medium text-white/80 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
          <a
            href="#booking"
            onClick={() => setMenuOpen(false)}
            className="mt-2 inline-flex justify-center font-sans font-semibold text-sm text-[#0c1a2e] bg-[#c8dcff] hover:bg-white px-5 py-3 rounded-full transition-colors"
          >
            Book a Flight
          </a>
        </div>
      )}
    </header>
  )
}
