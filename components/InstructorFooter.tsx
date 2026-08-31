'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

export default function InstructorFooter() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !email.includes('@')) return
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setSubscribed(true)
      setEmail('')
    }, 600)
  }

  return (
    <footer className="bg-[#051326] text-white pt-16 pb-8 px-6 sm:px-10 lg:px-16 border-t border-slate-800/80">
      <div className="max-w-[1400px] mx-auto">
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8 pb-12">
          
          {/* Brand Column (Left) */}
          <div className="lg:col-span-3">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-4 group">
              <img
                src="/Logo/ozrentaplane-transparent-bg.png"
                alt="OZ Rentaplane"
                className="h-10 w-auto object-contain"
              />
              <span className="text-[20px] font-black tracking-tight text-white">
                OZ<span className="font-semibold text-white/90"> Rentaplane</span>
              </span>
            </Link>
            <p className="text-[13.5px] text-slate-400 leading-relaxed mb-6 max-w-[280px]">
              Australia's modern platform for aircraft rental, flight training, and instructor empowerment.
            </p>
            {/* Social Links */}
            <div className="flex items-center gap-3 text-slate-400">
              <a href="#" aria-label="Facebook" className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-[#155dfc] hover:text-white flex items-center justify-center transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>
              <a href="#" aria-label="Instagram" className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-[#155dfc] hover:text-white flex items-center justify-center transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
              <a href="#" aria-label="LinkedIn" className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-[#155dfc] hover:text-white flex items-center justify-center transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
              </a>
              <a href="#" aria-label="Twitter" className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-[#155dfc] hover:text-white flex items-center justify-center transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Nav Links: 4 Columns (Middle) */}
          <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-4">
            {/* COMPANY */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-white/90 mb-4">
                COMPANY
              </h4>
              <ul className="space-y-2.5 text-[13.5px] text-slate-400">
                <li><Link href="/about" className="hover:text-white transition-colors">About Us</Link></li>
                <li><Link href="/careers" className="hover:text-white transition-colors">Careers</Link></li>
                <li><Link href="/news" className="hover:text-white transition-colors">News</Link></li>
                <li><Link href="/contact-us" className="hover:text-white transition-colors">Contact</Link></li>
              </ul>
            </div>

            {/* PLATFORM */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-white/90 mb-4">
                PLATFORM
              </h4>
              <ul className="space-y-2.5 text-[13.5px] text-slate-400">
                <li><Link href="/fleet" className="hover:text-white transition-colors">Rent</Link></li>
                <li><Link href="/cessna-172" className="hover:text-white transition-colors">Aircraft</Link></li>
                <li><Link href="/become-an-instructor" className="hover:text-white transition-colors">Instructors</Link></li>
                <li><Link href="/schools" className="hover:text-white transition-colors">Schools</Link></li>
              </ul>
            </div>

            {/* RESOURCES */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-white/90 mb-4">
                RESOURCES
              </h4>
              <ul className="space-y-2.5 text-[13.5px] text-slate-400">
                <li><Link href="/faq" className="hover:text-white transition-colors">Help Centre</Link></li>
                <li><Link href="/resources" className="hover:text-white transition-colors">Guides</Link></li>
                <li><Link href="/safety" className="hover:text-white transition-colors">Safety</Link></li>
                <li><Link href="/blog" className="hover:text-white transition-colors">Blog</Link></li>
              </ul>
            </div>

            {/* LEGAL */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-white/90 mb-4">
                LEGAL
              </h4>
              <ul className="space-y-2.5 text-[13.5px] text-slate-400">
                <li><Link href="/terms-and-conditions" className="hover:text-white transition-colors">Terms of Use</Link></li>
                <li><Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="/cookie-policy" className="hover:text-white transition-colors">Cookie Policy</Link></li>
              </ul>
            </div>
          </div>

          {/* Stay in the loop (Right) */}
          <div className="lg:col-span-4 lg:pl-6">
            <h4 className="text-base font-bold text-white mb-2">
              Stay in the loop
            </h4>
            <p className="text-[13px] text-slate-400 leading-relaxed mb-4">
              Get the latest updates, tips, and aviation news delivered to your inbox.
            </p>

            {subscribed ? (
              <div className="flex items-center gap-2 text-emerald-400 text-[13.5px] font-medium bg-emerald-950/40 border border-emerald-800/60 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Thank you for subscribing to OZ Rentaplane!</span>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2 sm:gap-0">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="bg-white text-slate-900 placeholder:text-slate-400 text-sm px-4 py-2.5 rounded-lg sm:rounded-r-none focus:outline-none focus:ring-2 focus:ring-[#155dfc] w-full"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-[#155dfc] hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm px-6 py-2.5 rounded-lg sm:rounded-l-none transition-colors shrink-0 disabled:opacity-70"
                >
                  {loading ? 'Subscribing...' : 'Subscribe'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} OZRentaplane Pty Ltd. All rights reserved.</p>
          <p>ABN 12 345 678 901</p>
        </div>
      </div>
    </footer>
  )
}
