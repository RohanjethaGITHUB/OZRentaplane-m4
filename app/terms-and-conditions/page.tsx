import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms & Conditions — OZRentAPlane',
  description:
    'Read the Terms & Conditions governing use of the OZRentAPlane website and services.',
}

/* ─── Content data ─────────────────────────────────────────────────────────── */

const SECTIONS = [
  {
    number: '01',
    title: 'Introduction',
    body: 'OZRentAPlane provides information about aircraft rental, pilot access, and related aviation services. These Terms & Conditions apply to your use of this website and any enquiries or interactions initiated through it. Additional service-specific terms may apply in the future if booking, account registration, or member access functionality is introduced.',
  },
  {
    number: '02',
    title: 'Acceptance of Terms',
    body: 'By accessing or using this website, you agree to these Terms & Conditions. If you do not agree, please discontinue use of the website. Continued use of the website after any updates to these terms will be taken as acceptance of those changes.',
  },
  {
    number: '03',
    title: 'Website Information',
    body: 'The content on this website is provided for general informational purposes only. While we aim to keep all information accurate and current, OZRentAPlane does not guarantee that all content, pricing, availability, service details, or operational information will always be complete, current, or error-free.',
  },
  {
    number: '04',
    title: 'Eligibility and Pilot Responsibility',
    body: 'Any reference to aircraft access, rental, pilot approval, or operational eligibility is subject to review and confirmation by OZRentAPlane. Website content does not constitute automatic approval to rent or operate any aircraft. It remains the responsibility of each pilot or prospective user to ensure they meet all licensing, currency, medical, legal, and operational requirements.',
  },
  {
    number: '05',
    title: 'Future Booking and Service Terms',
    body: 'This website may, in the future, include booking, registration, payment, or account-based features. If those features are introduced, additional terms may apply to bookings, cancellations, payments, no-shows, document verification, pilot approvals, and operational use. Any such terms may be provided separately at the relevant stage.',
  },
  {
    number: '06',
    title: 'Fees and Pricing Information',
    body: 'Any pricing shown on this website is for general information only and may be updated, changed, or withdrawn at any time without notice. Quoted rates, charges, availability, and service inclusions may vary depending on the aircraft, timing, operating conditions, and other business or regulatory factors.',
  },
  {
    number: '07',
    title: 'Intellectual Property',
    body: 'All content on this website, including text, branding, graphics, layouts, images, design elements, and other materials, is owned by or licensed to OZRentAPlane unless otherwise stated. You may not copy, reproduce, distribute, modify, republish, or commercially use any website content without prior written permission.',
  },
  {
    number: '08',
    title: 'Limitation of Liability',
    body: 'To the maximum extent permitted by law, OZRentAPlane is not liable for any loss, damage, expense, or disruption arising from your use of, or reliance on, this website or its content. This includes indirect or consequential loss, technical interruption, website unavailability, data loss, or reliance on outdated information.',
  },
  {
    number: '09',
    title: 'Third-Party Links',
    body: 'This website may include links to third-party websites, platforms, or services for convenience only. OZRentAPlane does not control and is not responsible for the content, accuracy, policies, or availability of any third-party website.',
  },
  {
    number: '10',
    title: 'Changes to These Terms',
    body: 'We may update these Terms & Conditions from time to time. Updated versions will be published on this page with a revised effective date where appropriate. You should review this page periodically to stay informed of any changes.',
  },
  {
    number: '11',
    title: 'Contact Information',
    body: 'If you have any questions about these Terms & Conditions, please contact OZRentAPlane through the website enquiry channels.',
  },
]

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function TermsPage() {
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
            Terms &amp;{' '}
            <span className="italic">Conditions</span>
          </h1>
          <p
            className="font-sans text-[0.95rem] md:text-[1rem] leading-relaxed max-w-2xl"
            style={{ color: '#94a3b8' }}
          >
            These Terms &amp; Conditions govern the use of the OZRentAPlane website and provide
            general information about how our services may operate. By accessing this website, you
            agree to use it responsibly and in accordance with these terms.
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
              <p
                className="font-sans text-[0.9rem] md:text-[0.95rem] leading-[1.85]"
                style={{ color: '#94a3b8', paddingLeft: '1.85rem' }}
              >
                {s.body}
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
