import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Privacy Policy — OZRentAPlane',
  description:
    'Learn how OZRentAPlane collects, uses, stores, and protects your personal information under the Australian Privacy Principles.',
}

/* ─── Content data ─────────────────────────────────────────────────────────── */

const SECTIONS = [
  {
    number: '01',
    title: 'Introduction',
    body: 'OZRentAPlane may collect personal information when you browse the website, submit an enquiry, request aircraft booking information, or otherwise interact with the platform. This Privacy Policy explains the types of personal data we may collect, how that information is handled, and your privacy rights under the Privacy Act 1988 (Cth) and Australian Privacy Principles (APPs).',
    list: null,
  },
  {
    number: '02',
    title: 'Information We Collect',
    body: 'We collect personal information necessary to deliver aviation rental services and maintain regulatory safety records:',
    list: [
      'Contact Details: Full legal name, email address, telephone number, and residential/billing address.',
      'Pilot Credentials: CASA flight crew licence details, medical certificate class and expiry, flight log records, and government identification (e.g. ASIC, passport, or driver’s licence).',
      'Flight & Booking Details: Departure/arrival aerodromes, passenger manifests, flight times, aircraft registration, and rental journey dates.',
      'Payment & Transaction Records: Billing information and payment history processed securely through PCI-DSS compliant providers (e.g. Stripe). We do not store raw card numbers on our servers.',
      'Technical & Device Data: IP address, browser type, device information, and anonymous session telemetry via analytics to ensure platform stability.',
    ],
  },
  {
    number: '03',
    title: 'How We Use Information',
    body: 'Collected personal information is used solely for legitimate operational, regulatory, and communication purposes:',
    list: [
      'Verifying pilot licence currency, endorsements, and medical fitness prior to aircraft dispatch.',
      'Managing flight bookings, aircraft availability, check-outs, and flight invoicing.',
      'Complying with aviation safety statutory obligations under CASA and Australian civil aviation law.',
      'Processing secure rental deposits, fuel credits, and flight hour charges.',
      'Communicating critical flight safety updates, NOTAMs, or aircraft maintenance changes.',
      'Enhancing website reliability, user account security, and dashboard experience.',
    ],
  },
  {
    number: '04',
    title: 'Cookies and Analytics',
    body: 'This website uses cookies, session storage, and analytics tools to understand visitor interactions, authenticate logged-in pilots, and maintain session security across booking journeys. For full details on our cookie usage and how to control your preferences, please refer to our dedicated Cookie Policy.',
    list: null,
  },
  {
    number: '05',
    title: 'Data Storage and Security',
    body: 'We implement industry-standard technical and organisational safeguards to protect personal information from unauthorised access, misuse, loss, alteration, or disclosure. Digital records and uploaded pilot licences are stored in encrypted cloud environments with restricted administrative access. However, no digital transmission across the Internet is completely risk-free, and users are encouraged to maintain secure account credentials.',
    list: null,
  },
  {
    number: '06',
    title: 'Disclosure to Third Parties',
    body: 'We do not sell, rent, or trade your personal information. Information may only be disclosed in the following circumstances:',
    list: [
      'Regulatory Authorities: Civil Aviation Safety Authority (CASA), Australian Transport Safety Bureau (ATSB), or law enforcement agencies where required by Australian law.',
      'Service Providers: Vetted technology infrastructure partners (e.g. Supabase, Stripe, hosting platforms) operating under strict data security and confidentiality obligations.',
      'Insurance Partners: Aviation underwriters or claims adjusters in the event of an aircraft incident or insurance assessment.',
    ],
  },
  {
    number: '07',
    title: 'Access and Correction',
    body: 'Under the Privacy Act 1988, you have the right to request access to the personal information OZRentAPlane holds about you, and to request correction if you believe the information is inaccurate, out of date, or incomplete. You may update your pilot profile directly in the pilot portal or submit an enquiry to our administration team.',
    list: null,
  },
  {
    number: '08',
    title: 'Overseas Data Handling',
    body: 'Some of our technology providers, database cloud infrastructure, or hosting partners may store or process data on servers located outside Australia (such as in secure cloud regions in the United States or Asia-Pacific). We take all reasonable steps to ensure that overseas service providers adhere to data protection standards substantially similar to the Australian Privacy Principles.',
    list: null,
  },
  {
    number: '09',
    title: 'Updates to This Policy',
    body: 'We may update this Privacy Policy from time to time to reflect operational, legal, or regulatory modifications. Any changes will be posted on this page with an updated revision date, and significant changes may be notified via email to registered pilot account holders.',
    list: null,
  },
  {
    number: '10',
    title: 'Contact Information & Privacy Officer',
    body: 'If you have any questions, concerns, or complaints regarding this Privacy Policy or how your personal information is handled by OZRentAPlane, please contact our team via support@ozrentaplane.com.au or through our Contact Us page.',
    list: null,
  },
]

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function PrivacyPolicyPage() {
  return (
    <main className="bg-white text-[#0f172a] font-sans antialiased min-h-screen">
      {/* ═══ Header Section ═══════════════════════════════════════════════════ */}
      <section className="bg-[#06152b] text-white pt-24 pb-16 px-6 sm:px-10 lg:px-20 border-b border-slate-800">
        <div className="max-w-4xl mx-auto">
          <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#d97706] mb-3 block">
            Privacy & Data Protection
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-4 text-white">
            Privacy Policy
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-3xl">
            This Privacy Policy explains how OZRentAPlane collects, handles, stores, and protects personal information submitted through this website and pilot portal, in compliance with the Australian Privacy Principles.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center px-2.5 py-1 rounded bg-slate-800/90 text-slate-200 border border-slate-700/60 font-mono text-[11px]">
              Last updated: April 2025
            </span>
            <span>•</span>
            <span>Privacy Act 1988 (Cth) & APPs Compliant</span>
          </div>
        </div>
      </section>

      {/* ═══ Document Body ═════════════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 px-6 sm:px-10 lg:px-20 max-w-4xl mx-auto">
        <div className="space-y-12">
          {SECTIONS.map((sec) => (
            <div
              key={sec.number}
              className="border-b border-slate-200 pb-10 last:border-none"
            >
              <div className="flex items-start gap-4">
                <span className="text-sm font-black text-blue-600 font-mono mt-0.5 shrink-0 w-8">
                  {sec.number}
                </span>
                <div className="flex-1">
                  <h2 className="text-xl sm:text-2xl font-black text-[#06152b] mb-4 tracking-tight">
                    {sec.title}
                  </h2>
                  <p className="text-slate-700 text-sm sm:text-[15px] leading-relaxed mb-4">
                    {sec.body}
                  </p>
                  {sec.list && (
                    <ul className="space-y-2.5 mt-3 pl-1">
                      {sec.list.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2.5 text-xs sm:text-[13.5px] text-slate-700 leading-relaxed"
                        >
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

        {/* ═══ Legal Links Footnote ═════════════════════════════════════════════ */}
        <div className="mt-12 pt-8 border-t border-slate-200 flex flex-wrap gap-6 text-xs text-slate-600 font-medium">
          <Link href="/terms-and-conditions" className="hover:text-blue-600 underline">
            Terms & Conditions
          </Link>
          <Link href="/safety-disclaimer" className="hover:text-blue-600 underline">
            Safety Disclaimer
          </Link>
          <Link href="/cookie-policy" className="hover:text-blue-600 underline">
            Cookie Policy
          </Link>
          <Link href="/contact-us" className="hover:text-blue-600 underline">
            Contact Support
          </Link>
        </div>
      </section>
    </main>
  )
}
