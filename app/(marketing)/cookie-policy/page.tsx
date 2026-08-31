import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Cookie Policy — OZRentAPlane',
  description:
    'Learn how OZRentAPlane uses cookies and similar tracking technologies to ensure secure authentication, session handling, and platform analytics.',
}

/* ─── Content data ─────────────────────────────────────────────────────────── */

const SECTIONS = [
  {
    number: '01',
    title: 'Introduction',
    body: 'This Cookie Policy explains how OZRentAPlane Pty Ltd ("we", "us", or "our") uses cookies and similar tracking technologies when you visit our website, client portal, and booking applications. By continuing to use our website, you agree to our use of cookies in accordance with this policy and Australian privacy principles.',
    list: null,
  },
  {
    number: '02',
    title: 'What Are Cookies?',
    body: 'Cookies are small data text files placed on your computer, smartphone, or tablet when you visit a website. They allow the platform to remember your actions, login credentials, and display preferences over a period of time, ensuring you do not need to re-enter them whenever you navigate from one page to another.',
    list: null,
  },
  {
    number: '03',
    title: 'Categories of Cookies We Use',
    body: 'We utilize the following categories of cookies across our marketing and dashboard surfaces:',
    list: [
      'Strictly Necessary Cookies: Essential for user authentication via Supabase, session security, CSRF protection, and checkout verification.',
      'Functional Cookies: Remember your user preferences, such as default airport selection (Bankstown / Moorabbin), flight booking draft data, and time zone settings.',
      'Performance & Analytics Cookies: Help us measure visitor traffic, page load speed, and navigational patterns to improve platform reliability.',
      'Payment & Billing Cookies: Required by Stripe for secure PCI-compliant card tokenization and fraud prevention during flight payment processing.',
    ],
  },
  {
    number: '04',
    title: 'Third-Party Cookies & Integrations',
    body: 'We work with trusted third-party technology providers who may also place cookies on your device when providing services on our behalf:',
    list: [
      'Supabase: Authenticated session state and real-time database token verification.',
      'Stripe: Secure payment handling, card verification, and merchant fraud prevention.',
      'Vercel & Hosting Analytics: Serverless edge routing, CDN asset caching, and error logging.',
    ],
  },
  {
    number: '05',
    title: 'Managing and Disabling Cookies',
    body: 'Most web browsers allow you to control cookies through their browser settings. You can choose to block all cookies, delete existing cookies, or receive a warning before a cookie is stored. Please note that if you disable strictly necessary cookies, key features such as logging into your pilot portal or booking flights will not function properly.',
    list: null,
  },
  {
    number: '06',
    title: 'Updates to This Policy',
    body: 'We may update this Cookie Policy from time to time to reflect operational, legal, or regulatory changes. Any modifications will become effective immediately upon posting the revised policy on this page with an updated revision date.',
    list: null,
  },
  {
    number: '07',
    title: 'Contact Us',
    body: 'If you have any questions regarding our Cookie Policy, privacy practices, or data handling, please contact our team via our Contact Us page or email support@ozrentaplane.com.au.',
    list: null,
  },
]

export default function CookiePolicyPage() {
  return (
    <main className="bg-white text-[#0f172a] font-sans antialiased min-h-screen">
      {/* ═══ Header Section ═══════════════════════════════════════════════════ */}
      <section className="bg-[#06152b] text-white pt-24 pb-16 px-6 sm:px-10 lg:px-20 border-b border-slate-800">
        <div className="max-w-4xl mx-auto">
          <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#d97706] mb-3 block">
            Legal & Compliance
          </span>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
            Cookie Policy
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl">
            This document outlines how OZRentAPlane Pty Ltd uses cookies and similar technologies to manage authentication, ensure secure flight bookings, and enhance platform experience.
          </p>
          <div className="mt-6 text-xs text-slate-400">
            Last updated: August 2024 • Australian Privacy Principles Compliant
          </div>
        </div>
      </section>

      {/* ═══ Document Body ═════════════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 px-6 sm:px-10 lg:px-20 max-w-4xl mx-auto">
        <div className="space-y-12">
          {SECTIONS.map((sec) => (
            <div key={sec.number} className="border-b border-slate-200 pb-10 last:border-none">
              <div className="flex items-start gap-4">
                <span className="text-sm font-black text-blue-600 font-mono mt-0.5 shrink-0">
                  {sec.number}
                </span>
                <div className="flex-1">
                  <h2 className="text-xl sm:text-2xl font-black text-[#06152b] mb-3 tracking-tight">
                    {sec.title}
                  </h2>
                  <p className="text-slate-600 text-sm sm:text-[15px] leading-relaxed mb-4">
                    {sec.body}
                  </p>
                  {sec.list && (
                    <ul className="space-y-2.5 mt-3 pl-2">
                      {sec.list.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-[13.5px] text-slate-600 leading-relaxed">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-2" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Legal Links Footnote */}
        <div className="mt-12 pt-8 border-t border-slate-200 flex flex-wrap gap-6 text-xs text-slate-500 font-medium">
          <Link href="/terms-and-conditions" className="hover:text-blue-600 underline">
            Terms of Use
          </Link>
          <Link href="/privacy-policy" className="hover:text-blue-600 underline">
            Privacy Policy
          </Link>
          <Link href="/contact-us" className="hover:text-blue-600 underline">
            Contact Support
          </Link>
        </div>
      </section>
    </main>
  )
}
