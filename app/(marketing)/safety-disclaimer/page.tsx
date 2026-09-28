import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Safety Disclaimer & Risk Acknowledgement — OZRentAPlane',
  description:
    'Important safety information, risk acknowledgement, and pilot operational responsibilities for all prospective OZRentAPlane users.',
}

/* ─── Content data ─────────────────────────────────────────────────────────── */

const SECTIONS = [
  {
    number: '01',
    title: 'General Safety Notice',
    body: 'OZRentAPlane is committed to promoting safe and responsible general aviation participation. However, all aviation activities involve operational, environmental, meteorological, mechanical, and human factors that can affect flight safety outcomes. Visitors, prospective hirers, and pilots must approach all aviation activities with appropriate caution, thorough preparation, and sound aeronautical decision-making.',
  },
  {
    number: '02',
    title: 'Inherent Risks of Aviation Activities',
    body: 'Flight operations, aircraft rental, pre-flight preparations, and associated aerodrome operations involve inherent hazards that cannot be completely eliminated. These risks include rapid weather changes, mechanical anomalies, engine failure, turbulence, airspace congestion, navigation challenges, and decision-making pressures. By engaging in aircraft rental, the renter acknowledges and assumes these operational risks.',
  },
  {
    number: '03',
    title: 'Pilot Responsibility & Operational Control',
    body: 'Under the Civil Aviation Act 1988 (Cth) and CASR Part 91, the designated Pilot in Command (PIC) maintains ultimate operational control and responsibility for each flight. It is the sole responsibility of the PIC to ensure they are medically, legally, mentally, and practically fit to fly before initiating any departure. This includes conducting thorough pre-flight aircraft inspections, fuel calculations, weight and balance verifications, and go/no-go weather reviews.',
  },
  {
    number: '04',
    title: 'Licensing, Currency & Medical Fitness',
    body: 'Any pilot operating an OZRentAPlane aircraft must hold an active CASA flight crew licence with valid aircraft class endorsements (e.g. Single Engine Aeroplane - SEA), current flight review, take-off and landing recency (CASR Part 61), and an unexpired CASA Class 1, Class 2, or Basic Class 2 medical certificate. Platform information or online account status does not substitute for the pilot’s legal obligation to verify their own currency.',
  },
  {
    number: '05',
    title: 'Aircraft Availability, Weather & Operational Limitations',
    body: 'Aircraft access is strictly contingent upon mechanical airworthiness, unscheduled maintenance, periodic inspections (100-hourly / annuals), aerodrome conditions, and weather minimums. OZRentAPlane does not guarantee aircraft availability if safety, maintenance, or meteorological conditions warrant grounding. A pilot must never allow scheduling commitments to compromise flight safety or weather minima.',
  },
  {
    number: '06',
    title: 'Website Information & Regulatory Supremacy',
    body: 'All technical specifications, operating guidelines, speeds, and fuel consumptions presented on this website are for general informational guidance only. Official flight operations must rely exclusively on the CASA-approved Pilot’s Operating Handbook (POH), Aircraft Flight Manual (AFM), current ERSA, AIP, and NOTAMs applicable to the specific aircraft registration.',
  },
  {
    number: '07',
    title: 'No Guarantee of Booking Approval or Aircraft Dispatch',
    body: 'OZRentAPlane reserves the right, in its absolute discretion, to deny aircraft hire, cancel confirmed bookings, or suspend pilot access where safety concerns, non-compliance with hire terms, lack of pilot recency, adverse weather forecasts, or regulatory issues arise.',
  },
  {
    number: '08',
    title: 'Assumption of Risk & Personal Indemnity',
    body: 'Every person participating in flight operations as pilot, crew, or passenger acknowledges that aviation carries personal risk. The pilot in command assumes primary responsibility for their own safety and that of their passengers, adhering to all CASA standard operating rules and OZRentAPlane hire conditions.',
  },
  {
    number: '09',
    title: 'Contact for Operational Clarifications',
    body: 'If you have questions regarding pilot check-out requirements, aircraft operating limitations, airport landing approvals, or emergency protocols, please contact our chief pilot or operations team directly before flying.',
  },
]

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function SafetyDisclaimerPage() {
  return (
    <main className="bg-white text-[#0f172a] font-sans antialiased min-h-screen">
      {/* ═══ Header Section ═══════════════════════════════════════════════════ */}
      <section className="bg-[#06152b] text-white pt-24 pb-16 px-6 sm:px-10 lg:px-20 border-b border-slate-800">
        <div className="max-w-4xl mx-auto">
          <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#d97706] mb-3 block">
            Safety & Operational Risk
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-4 text-white">
            Safety Disclaimer & Risk Acknowledgement
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-3xl">
            Aviation activity involves inherent risks and demands personal responsibility, sound aeronautical judgement, and strict compliance with CASA operational requirements. Prospective pilots and hirers must review these safety guidelines thoroughly.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center px-2.5 py-1 rounded bg-slate-800/90 text-slate-200 border border-slate-700/60 font-mono text-[11px]">
              Last updated: April 2025
            </span>
            <span>•</span>
            <span>Civil Aviation Safety Authority (CASA) Compliant</span>
          </div>
        </div>
      </section>

      {/* ═══ Document Body ═════════════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 px-6 sm:px-10 lg:px-20 max-w-4xl mx-auto">
        {/* Important PIC Safety Notice Card */}
        <div className="mb-12 p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 font-black text-sm">
            !
          </div>
          <div>
            <h2 className="text-base font-bold text-amber-950 mb-1">
              Pilot In Command (PIC) Operational Authority
            </h2>
            <p className="text-xs sm:text-sm text-amber-900/90 leading-relaxed">
              Under CASR Part 91, the Pilot in Command retains final authority for the operation and safety of the aircraft during flight time. The PIC must ensure thorough pre-flight airworthiness checks, weather suitability, weight and balance verification, and passenger safety briefings before departure.
            </p>
          </div>
        </div>

        <div className="space-y-12">
          {SECTIONS.map((s) => (
            <div
              key={s.number}
              className="border-b border-slate-200 pb-10 last:border-none"
            >
              <div className="flex items-start gap-4">
                <span className="text-sm font-black text-blue-600 font-mono mt-0.5 shrink-0 w-8">
                  {s.number}
                </span>
                <div className="flex-1">
                  <h2 className="text-xl sm:text-2xl font-black text-[#06152b] mb-4 tracking-tight">
                    {s.title}
                  </h2>
                  <p className="text-slate-700 text-sm sm:text-[15px] leading-relaxed">
                    {s.body}
                  </p>
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
          <Link href="/privacy-policy" className="hover:text-blue-600 underline">
            Privacy Policy
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
