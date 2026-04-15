import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — OZRentAPlane',
  description:
    'Learn how OZRentAPlane collects, uses, stores, and protects your personal information.',
}

/* ─── Content data ─────────────────────────────────────────────────────────── */

const SECTIONS = [
  {
    number: '01',
    title: 'Introduction',
    body: 'OZRentAPlane may collect personal information when you browse the website, submit an enquiry, request information, or otherwise interact with the site. This Privacy Policy explains the types of information we may collect and how that information may be used.',
    list: null,
  },
  {
    number: '02',
    title: 'Information We Collect',
    body: 'We may collect information such as your name, email address, phone number, enquiry details, location information you choose to provide, and any other information submitted through forms or direct communication. We may also collect limited technical information such as browser type, device information, pages visited, referring source, and general usage data through analytics tools.',
    list: null,
  },
  {
    number: '03',
    title: 'How We Use Information',
    body: 'We may use collected information to:',
    list: [
      'respond to enquiries',
      'provide requested information about services',
      'improve the website and user experience',
      'analyse website usage and performance',
      'maintain internal records',
      'communicate updates or relevant service information where appropriate',
    ],
  },
  {
    number: '04',
    title: 'Cookies and Analytics',
    body: 'This website may use cookies, analytics tools, and similar technologies to understand how visitors use the site and to improve performance. These tools may collect information such as traffic patterns, page interactions, device type, and general browsing behaviour. You can usually manage cookies through your browser settings.',
    list: null,
  },
  {
    number: '05',
    title: 'Data Storage and Security',
    body: 'We take reasonable steps to protect personal information from misuse, interference, unauthorised access, loss, modification, or disclosure. However, no website or digital platform can guarantee absolute security, and users should take care when submitting information online.',
    list: null,
  },
  {
    number: '06',
    title: 'Disclosure to Third Parties',
    body: 'We do not sell personal information. We may share information with trusted service providers or technology platforms where reasonably necessary to operate the website, manage communications, analyse performance, or support business functions. Information may also be disclosed where required by law or regulatory obligation.',
    list: null,
  },
  {
    number: '07',
    title: 'Access and Correction',
    body: 'You may request access to personal information we hold about you, or request correction of inaccurate information, by contacting us through the website. We will respond within a reasonable timeframe, subject to any legal or operational limitations.',
    list: null,
  },
  {
    number: '08',
    title: 'Overseas Data Handling',
    body: 'Some website tools, software providers, hosting providers, or analytics platforms may store or process information outside Australia. By using this website, you acknowledge that some information may be handled through overseas technology providers where reasonably necessary for business operations.',
    list: null,
  },
  {
    number: '09',
    title: 'Updates to This Policy',
    body: 'We may update this Privacy Policy from time to time to reflect changes in website features, legal requirements, or business operations. The latest version will always be available on this page.',
    list: null,
  },
  {
    number: '10',
    title: 'Contact Information',
    body: 'If you have any questions about this Privacy Policy or how information is handled, please contact OZRentAPlane through the website enquiry channels.',
    list: null,
  },
]

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function PrivacyPolicyPage() {
  return (
    <main
      className="bg-[#091421] text-[#d9e3f6] font-sans min-h-screen"
      style={{ paddingTop: '62px' }}
    >
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div
        className="px-6 md:px-12 lg:px-20 py-20 md:py-28 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#091421' }}
      >
        <div className="max-w-3xl mx-auto">
          <span
            className="block font-sans font-bold text-[10px] tracking-[0.32em] uppercase mb-5"
            style={{ color: '#aec7f7' }}
          >
            Legal
          </span>
          <h1
            className="font-serif text-[2.6rem] sm:text-[3.2rem] md:text-[3.8rem] font-normal leading-tight mb-6"
            style={{ color: '#d9e3f6' }}
          >
            Privacy{' '}
            <span className="italic">Policy</span>
          </h1>
          <p
            className="font-sans text-[0.95rem] md:text-[1rem] leading-relaxed max-w-2xl"
            style={{ color: '#94a3b8' }}
          >
            This Privacy Policy explains how OZRentAPlane may collect, use, store, and protect
            personal information submitted through this website. We are committed to handling
            information responsibly and transparently.
          </p>
          <p
            className="font-sans text-[0.78rem] mt-6"
            style={{ color: 'rgba(148,163,184,0.55)' }}
          >
            Last updated: April 2025
          </p>
        </div>
      </div>

      {/* ── Body content ─────────────────────────────────────────────────── */}
      <div className="px-6 md:px-12 lg:px-20 py-20 md:py-28">
        <div className="max-w-3xl mx-auto space-y-14">
          {SECTIONS.map((s) => (
            <section key={s.number}>
              <div className="flex items-baseline gap-4 mb-4">
                <span
                  className="font-sans font-bold text-[10px] tracking-[0.18em] shrink-0"
                  style={{ color: 'rgba(174,199,247,0.45)' }}
                >
                  {s.number}
                </span>
                <h2
                  className="font-serif text-[1.35rem] md:text-[1.55rem] font-normal leading-snug"
                  style={{ color: '#d9e3f6' }}
                >
                  {s.title}
                </h2>
              </div>
              <div style={{ paddingLeft: '1.85rem' }}>
                <p
                  className="font-sans text-[0.9rem] md:text-[0.95rem] leading-[1.85]"
                  style={{ color: '#94a3b8' }}
                >
                  {s.body}
                </p>
                {s.list && (
                  <ul className="mt-4 space-y-2">
                    {s.list.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-3 font-sans text-[0.9rem] md:text-[0.95rem] leading-[1.85]"
                        style={{ color: '#94a3b8' }}
                      >
                        <span
                          className="mt-[0.6rem] shrink-0 w-1 h-1 rounded-full"
                          style={{ background: 'rgba(174,199,247,0.5)' }}
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
