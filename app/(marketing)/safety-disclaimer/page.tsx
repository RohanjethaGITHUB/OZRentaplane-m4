import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Safety Disclaimer — OZRentAPlane',
  description:
    'Important safety information and risk acknowledgement for all prospective OZRentAPlane users.',
}

/* ─── Content data ─────────────────────────────────────────────────────────── */

const SECTIONS = [
  {
    number: '01',
    title: 'General Safety Notice',
    body: 'OZRentAPlane is committed to promoting safe and responsible aviation participation. However, all aviation activities involve operational, environmental, mechanical, and human factors that can affect safety outcomes. Visitors and prospective users should approach all aviation activity with appropriate caution and responsibility.',
  },
  {
    number: '02',
    title: 'Inherent Risks of Aviation Activities',
    body: 'Flying, aircraft rental, pre-flight preparation, and related aviation activities involve inherent risks that cannot be completely eliminated. These may include weather-related risks, operational risks, equipment issues, decision-making errors, airspace complexity, and other factors beyond ordinary day-to-day activities.',
  },
  {
    number: '03',
    title: 'Pilot Responsibility',
    body: 'It is the sole responsibility of each pilot or prospective operator to determine whether they are legally, medically, operationally, and practically fit to undertake any flight activity. This includes responsibility for sound judgement, compliance with regulations, pre-flight checks, weather review, aircraft familiarisation, and safe decision-making.',
  },
  {
    number: '04',
    title: 'Currency, Licensing, and Medical Fitness',
    body: 'Any pilot seeking to operate an aircraft must ensure that they hold the appropriate licence, endorsements, ratings, recency, and medical fitness required for the relevant aircraft and operation. Website content should never be interpreted as confirmation of eligibility, currency, or operational approval.',
  },
  {
    number: '05',
    title: 'Aircraft Availability, Weather, and Operational Conditions',
    body: 'Aircraft access, rental, and operational suitability may be affected by maintenance requirements, weather, airspace conditions, scheduling, safety concerns, business policies, and other practical limitations. Availability shown or described on the website does not guarantee that an aircraft will be available or suitable for use at a given time.',
  },
  {
    number: '06',
    title: 'Website Information Disclaimer',
    body: 'The information on this website is provided for general informational purposes only. It does not replace formal flight training, operational briefings, aircraft documentation, regulatory guidance, instructor advice, or legal advice. Users must not rely on website content as a substitute for official aviation decision-making sources.',
  },
  {
    number: '07',
    title: 'No Guarantee of Suitability or Approval',
    body: 'OZRentAPlane does not guarantee that any person will be approved to rent, access, or operate an aircraft. Any future approval or service access remains subject to internal review, operational requirements, and any applicable legal, insurance, safety, or business criteria.',
  },
  {
    number: '08',
    title: 'Assumption of Risk and Personal Responsibility',
    body: 'Any person considering aviation activity acknowledges that participation in such activity involves risk and personal responsibility. It remains the responsibility of the individual to seek appropriate advice, training, and clarification before engaging in any aviation-related activity.',
  },
  {
    number: '09',
    title: 'Contact for Clarification',
    body: 'If you are unsure about pilot requirements, eligibility, approval pathways, or the suitability of any proposed activity, please contact OZRentAPlane directly before making assumptions based on website content.',
  },
]

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function SafetyDisclaimerPage() {
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
            Safety Disclaimer /{' '}
            <span className="italic">Risk Acknowledgement</span>
          </h1>
          <p
            className="font-sans text-[0.95rem] md:text-[1rem] leading-relaxed max-w-2xl"
            style={{ color: '#94a3b8' }}
          >
            Aviation activity involves inherent risks and requires personal responsibility, sound
            judgement, and compliance with applicable operational requirements. This page provides
            general safety information only and should be read carefully by all prospective users.
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
