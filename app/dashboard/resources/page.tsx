import { redirect } from 'next/navigation'
import { getCachedUser } from '@/lib/supabase/server'
import PortalPageHero from '@/components/PortalPageHero'

export const metadata = { title: 'Pilot Resources | OZRentAPlane' }

const RESOURCES = [
  {
    tag: 'PDF Document',
    title: "Cessna 172N Pilot's Operating Handbook",
    description: "Download the Pilot's Operating Handbook for the Cessna 172N Skyhawk.",
    href: '/resources/POH-Cessna172N-1980.pdf',
    actionLabel: 'View / Download PDF',
    isAvailable: true,
  },
  {
    tag: 'PDF Document',
    title: "Garmin aera 760 Pilot's Guide",
    description: "Download the Pilot's Guide for the Garmin aera 760 portable aviation navigator.",
    href: '/resources/Garmin.pdf',
    actionLabel: 'View / Download PDF',
    isAvailable: true,
  },
  {
    tag: 'PDF Document',
    title: 'Flightcom 403mc Voice-Activated Intercom Manual',
    description: 'Download the installation and operating manual for the Flightcom Model 403mc voice-activated intercom.',
    href: '/resources/flightcom-403mc-intercom-user-manual.pdf',
    actionLabel: 'View / Download PDF',
    isAvailable: true,
  },
  {
    tag: 'PDF Document',
    title: 'Bendix/King KMA 24 / 24H Audio Control Guide',
    description: "Download the pilot's guide and operating specifications for the Bendix/King KMA 24 and KMA 24H audio control systems.",
    href: '/resources/KMA24_audio_panel.pdf',
    actionLabel: 'View / Download PDF',
    isAvailable: true,
  },
  {
    tag: 'Updates',
    title: 'More Resources Coming Soon',
    description: 'Additional pilot and aircraft documents will be added here.',
    href: null,
    actionLabel: 'Coming soon',
    isAvailable: false,
  },
]

export default async function DashboardResourcesPage() {
  const { data: { user } } = await getCachedUser()
  if (!user) redirect('/login')

  return (
    <>
      <PortalPageHero
        eyebrow="Pilot Resources"
        title="Helpful Documents Before You Fly"
        subtitle="Access key aircraft and pilot reference materials before your flight. These resources are provided to help you prepare, review requirements, and fly with confidence."
        backgroundImage="/resources-hero.png"
        backgroundPosition="center"
        backHref="/dashboard"
        backLabel="Back to dashboard"
      />

      <section className="relative overflow-hidden bg-white px-6 py-16 md:px-12 md:py-20 lg:px-20 -mx-3 md:-mx-4 lg:-mx-6 mt-6 rounded-3xl shadow-sm border border-[#dbe7f4]">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2"
          width="600"
          height="600"
          viewBox="0 0 540 540"
          fill="none"
          style={{ opacity: 0.05 }}
        >
          <circle cx="270" cy="270" r="258" stroke="#0d1b3e" strokeWidth="1.5" />
          <circle cx="270" cy="270" r="188" stroke="#0d1b3e" strokeWidth="0.75" />
          <line x1="270" y1="12" x2="270" y2="528" stroke="#0d1b3e" strokeWidth="0.5" />
          <line x1="12" y1="270" x2="528" y2="270" stroke="#0d1b3e" strokeWidth="0.5" />
          <line x1="88" y1="88" x2="452" y2="452" stroke="#0d1b3e" strokeWidth="0.35" />
          <line x1="452" y1="88" x2="88" y2="452" stroke="#0d1b3e" strokeWidth="0.35" />
        </svg>

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="mb-8">
            <p className="font-sans text-xs font-semibold tracking-[0.22em] uppercase text-[#1a4fd6] mb-2">
              Resources
            </p>
            <h2 className="font-serif text-3xl md:text-4xl font-normal tracking-tight text-[#07224E]">
              Pilot Resources
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {RESOURCES.map((res) => {
              if (!res.isAvailable) {
                return (
                  <article
                    key={res.title}
                    className="rounded-2xl border border-[#dbe7f4] bg-[#f8fbff] p-7 md:p-8 flex flex-col shadow-[0_4px_20px_rgba(15,40,90,0.06)]"
                  >
                    <p className="font-sans text-[10px] font-semibold tracking-[0.22em] uppercase text-[#4b6390] mb-3">
                      {res.tag}
                    </p>
                    <h3 className="font-serif text-2xl text-[#07224E] mb-3">
                      {res.title}
                    </h3>
                    <p className="font-sans text-sm leading-relaxed text-[#4a5d78] mb-6 grow">
                      {res.description}
                    </p>
                    <button
                      type="button"
                      disabled
                      className="inline-block self-start rounded-md border border-[#07224E]/40 text-[#07224E]/60 px-6 py-3 font-sans font-bold text-xs tracking-[0.14em] uppercase cursor-not-allowed"
                    >
                      {res.actionLabel}
                    </button>
                  </article>
                )
              }

              return (
                <article
                  key={res.title}
                  className="rounded-2xl border border-[#dbe7f4] bg-[#f8fbff] p-7 md:p-8 flex flex-col shadow-[0_4px_20px_rgba(15,40,90,0.06)] transition-all hover:shadow-[0_8px_28px_rgba(15,40,90,0.12)] hover:border-[#1a4fd6]/30"
                >
                  <p className="font-sans text-[10px] font-semibold tracking-[0.22em] uppercase text-[#1a4fd6] mb-3">
                    {res.tag}
                  </p>
                  <h3 className="font-serif text-2xl text-[#07224E] mb-3">
                    {res.title}
                  </h3>
                  <p className="font-sans text-sm leading-relaxed text-[#4a5d78] mb-6 grow">
                    {res.description}
                  </p>
                  <a
                    href={res.href!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 self-start rounded-md bg-[#1a4fd6] text-white px-6 py-3 font-sans font-bold text-xs tracking-[0.14em] uppercase hover:bg-[#1541b1] transition-colors duration-200 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    {res.actionLabel}
                  </a>
                </article>
              )
            })}
          </div>

          <div className="mt-8 rounded-xl border border-[#dbe7f4] bg-[#f0f6fc] p-4 md:p-5">
            <div className="flex items-start gap-3">
              <span className="mt-[2px] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#1a4fd6]/20 bg-white">
                <span className="material-symbols-outlined text-[15px] text-[#1a4fd6]">info</span>
              </span>
              <p className="font-sans text-[0.82rem] leading-relaxed text-[#3a4d70]">
                These documents are provided for general reference only. Pilots should always verify information against the current official aircraft documents, approved operating material, CASA requirements, and any instructions provided by OZ Rent A Plane before flying.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
