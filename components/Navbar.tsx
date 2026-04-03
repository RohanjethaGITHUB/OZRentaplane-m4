'use client'

import { useEffect, useRef, useState } from 'react'

const NAV_LINKS = [
  { label: 'Fleet', href: '#fleet' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Membership', href: '#who-its-for' },
  { label: 'Safety', href: '#safety' },
  { label: 'Support', href: '#booking' },
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
    <nav
      ref={navRef}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-oz-deep/95 backdrop-blur-md border-b border-oz-high/40 shadow-[0_4px_30px_rgba(0,14,37,0.6)]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        {/* Wordmark */}
        <a
          href="#"
          className="font-serif text-xl font-black italic text-oz-blue tracking-tight select-none"
        >
          OZRentAPlane
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="font-sans text-sm font-semibold text-oz-muted hover:text-oz-blue transition-colors duration-200 tracking-wide"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-4">
          <a
            href="#booking"
            className="bg-oz-blue text-oz-deep px-5 py-2 rounded font-sans font-bold text-sm hover:bg-oz-text transition-colors duration-200 tracking-wide"
          >
            Book a Flight
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-2"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`block w-6 h-0.5 bg-oz-blue transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block w-6 h-0.5 bg-oz-blue transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-6 h-0.5 bg-oz-blue transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-oz-deep/98 backdrop-blur-md border-t border-oz-high/40 px-6 py-6 flex flex-col gap-5">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="font-sans text-base font-semibold text-oz-muted hover:text-oz-blue transition-colors"
            >
              {link.label}
            </a>
          ))}
          <a
            href="#booking"
            onClick={() => setMenuOpen(false)}
            className="bg-oz-blue text-oz-deep px-5 py-2.5 rounded font-bold text-sm text-center mt-2"
          >
            Book a Flight
          </a>
        </div>
      )}
    </nav>
  )
}
