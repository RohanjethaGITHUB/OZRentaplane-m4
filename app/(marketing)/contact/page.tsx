import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact Us | OZ Rent A Plane',
  description:
    'Contact OZ Rent A Plane for aircraft hire, checkout flights, bookings, and pilot documentation support.',
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: 'Contact Us | OZ Rent A Plane',
    description:
      'Reach the OZ Rent A Plane operations team for aircraft hire, checkout flights, and booking support.',
    url: '/contact',
    images: [{ url: '/Contact-hero.png', width: 1200, height: 630 }],
  },
}

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

export default function ContactPage() {
  return (
    <main className="overflow-x-hidden bg-[#071321] text-[#d9e3f6]">
      <section className="relative flex min-h-[560px] items-center overflow-hidden px-6 pb-16 pt-36 md:min-h-[700px] md:px-12 md:pt-40 lg:px-20">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/Contact-hero.png")' }}
        />
        <div className="absolute inset-0 z-0 bg-[#081a2f]/40" />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#050f1d]/76 via-[#081a31]/56 via-45% to-[#0c2442]/28" />
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_22%_40%,rgba(27,59,98,0.30),rgba(8,20,36,0.12)_46%,rgba(8,20,36,0)_74%)]" />
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_28%_64%,rgba(250,204,21,0.11),rgba(250,204,21,0.04)_20%,rgba(250,204,21,0)_42%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-28 bg-gradient-to-b from-transparent to-[#071321]" />

        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <div className="max-w-2xl">
            <h1 className="font-serif text-5xl leading-[1.05] tracking-tight text-[#eaf0ff] md:text-7xl">Contact the Tower</h1>
            <p className="mt-6 max-w-xl font-sans text-[1rem] leading-relaxed text-[#d3ddee] md:text-[1.08rem]">
              Have a question about aircraft hire, checkout flights, bookings, or pilot documentation? Reach out to the OZ Rent A Plane team and we&apos;ll help you get airborne.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-6 py-10 md:px-12 lg:grid-cols-12 lg:gap-7 lg:px-20 lg:py-14">
        <div className="lg:col-span-8">
          <div className="rounded-lg border border-white/10 bg-[#0f1f34]/84 p-5 shadow-[0_26px_70px_rgba(2,8,20,0.3)] backdrop-blur-md md:p-7">
            <h2 className="mb-5 flex items-center gap-2 font-serif text-3xl text-[#e8efff] md:text-[2rem]">
              <Icon name="flight_takeoff" className="!text-[24px] text-[#facc15]" />
              Flight Plan Enquiry
            </h2>

            <form className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-sans text-[0.69rem] font-semibold uppercase tracking-[0.12em] text-[#98aac8]">Full Name</span>
                  <input
                    type="text"
                    placeholder="Captain John Doe"
                    className="w-full rounded-sm border border-[#94a3b8]/[0.22] bg-[rgba(15,35,58,0.85)] px-3 py-2.5 font-sans text-sm text-[#edf4ff] placeholder:text-[#8499b5] focus:border-[#facc15]/85 focus:outline-none focus:ring-2 focus:ring-[#facc15]/18"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-sans text-[0.69rem] font-semibold uppercase tracking-[0.12em] text-[#98aac8]">Email</span>
                  <input
                    type="email"
                    placeholder="john@example.com"
                    className="w-full rounded-sm border border-[#94a3b8]/[0.22] bg-[rgba(15,35,58,0.85)] px-3 py-2.5 font-sans text-sm text-[#edf4ff] placeholder:text-[#8499b5] focus:border-[#facc15]/85 focus:outline-none focus:ring-2 focus:ring-[#facc15]/18"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-sans text-[0.69rem] font-semibold uppercase tracking-[0.12em] text-[#98aac8]">Phone</span>
                  <input
                    type="tel"
                    placeholder="+61 400 000 000"
                    className="w-full rounded-sm border border-[#94a3b8]/[0.22] bg-[rgba(15,35,58,0.85)] px-3 py-2.5 font-sans text-sm text-[#edf4ff] placeholder:text-[#8499b5] focus:border-[#facc15]/85 focus:outline-none focus:ring-2 focus:ring-[#facc15]/18"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-sans text-[0.69rem] font-semibold uppercase tracking-[0.12em] text-[#98aac8]">Enquiry Type</span>
                  <select className="w-full rounded-sm border border-[#94a3b8]/[0.22] bg-[rgba(15,35,58,0.85)] px-3 py-2.5 font-sans text-sm text-[#edf4ff] focus:border-[#facc15]/85 focus:outline-none focus:ring-2 focus:ring-[#facc15]/18">
                    <option>Aircraft Hire</option>
                    <option>Checkout Flight</option>
                    <option>Pilot Documents</option>
                    <option>Existing Booking</option>
                    <option>General Enquiry</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block font-sans text-[0.69rem] font-semibold uppercase tracking-[0.12em] text-[#98aac8]">Message</span>
                <textarea
                  rows={5}
                  placeholder="Detail your operational requirements here..."
                  className="w-full resize-y rounded-sm border border-[#94a3b8]/[0.22] bg-[rgba(15,35,58,0.85)] px-3 py-2.5 font-sans text-sm text-[#edf4ff] placeholder:text-[#8499b5] focus:border-[#facc15]/85 focus:outline-none focus:ring-2 focus:ring-[#facc15]/18"
                />
              </label>

              <button
                type="submit"
                className="mt-2 inline-flex rounded-sm bg-[#facc15] px-7 py-3 font-sans text-[0.8rem] font-bold uppercase tracking-[0.12em] text-[#1d2740] shadow-[0_0_18px_rgba(250,204,21,0.22)] transition-all hover:brightness-110"
              >
                Submit Plan
              </button>
            </form>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4">
          <div className="rounded-lg border border-[rgba(148,163,184,0.18)] bg-[rgba(16,34,56,0.82)] p-4 backdrop-blur-md">
            <div className="flex items-start gap-3">
              <div className="rounded bg-[#2a3d59]/58 p-2">
                <Icon name="support_agent" className="text-[#facc15]" />
              </div>
              <div>
                <h3 className="font-sans text-lg font-semibold text-[#edf3ff]">Call the Team</h3>
                <p className="mt-1 font-sans text-sm text-[#cfdaed]">0474 576 085</p>
                <p className="mt-0.5 font-sans text-xs uppercase tracking-[0.11em] text-[#93a8c6]">Available 0600 - 2000 AEST</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[rgba(148,163,184,0.18)] bg-[rgba(16,34,56,0.82)] p-4 backdrop-blur-md">
            <div className="flex items-start gap-3">
              <div className="rounded bg-[#2a3d59]/58 p-2">
                <Icon name="mail" className="text-[#facc15]" />
              </div>
              <div>
                <h3 className="font-sans text-lg font-semibold text-[#edf3ff]">Email Us</h3>
                <p className="mt-1 font-sans text-sm text-[#cfdaed]">ops@ozrentaplane.com.au</p>
                <p className="mt-0.5 font-sans text-xs uppercase tracking-[0.11em] text-[#93a8c6]">Typical response within 2 hrs</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-12 md:px-12 lg:px-20 lg:pb-16">
        <div className="grid w-full grid-cols-1 gap-6 rounded-xl border border-[rgba(148,163,184,0.18)] bg-gradient-to-br from-[#0d2239] via-[#102944] to-[#0d2138] p-6 shadow-[0_26px_70px_rgba(2,8,20,0.3)] md:grid-cols-12 md:items-center md:gap-8 md:p-8">
          <div className="md:col-span-7">
            <div className="mb-4 inline-flex items-center gap-2 rounded-sm border border-[rgba(148,163,184,0.2)] bg-[#152b45]/75 px-3 py-1.5">
              <Icon name="location_on" className="text-[#facc15]" />
              <span className="font-sans text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#c7d7ee]">Visit the Base</span>
            </div>
            <h3 className="font-serif text-3xl text-[#edf3ff] md:text-4xl">Visit the Base</h3>
            <p className="mt-3 font-sans text-base text-[#d5e0f2]">8 Wackett St, Bankstown Aerodrome NSW 2200</p>
            <p className="mt-3 max-w-xl font-sans text-sm leading-relaxed text-[#c4d2e8] md:text-[0.95rem]">
              Find us at Bankstown Aerodrome for checkout flights, aircraft access, and operational enquiries.
            </p>
          </div>
          <div className="relative h-[280px] overflow-hidden rounded-lg border border-[rgba(148,163,184,0.18)] bg-[#07172a] md:col-span-5 md:h-56">
            <iframe
              src="https://www.google.com/maps?q=8%20Wackett%20St%2C%20Bankstown%20Aerodrome%20NSW%202200&output=embed"
              title="OZ Rent A Plane base location"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <a
              href="https://www.google.com/maps/search/?api=1&query=8%20Wackett%20St%2C%20Bankstown%20Aerodrome%20NSW%202200"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open full map"
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-sm border border-[#facc15]/35 bg-[#0c1d33]/84 text-[#facc15] shadow-[0_0_16px_rgba(3,8,18,0.45)] backdrop-blur-sm transition-colors hover:bg-[#112642]"
            >
              <Icon name="open_in_full" className="!text-[18px]" />
            </a>
            <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/5" />
          </div>
        </div>
      </section>

      <section className="border-y border-[#93aed1]/15 bg-[#0b1b2f] px-6 py-14 md:px-12 md:py-16 lg:px-20">
        <div className="mx-auto max-w-4xl text-center">
          <Icon name="verified" className="mb-4 text-[#facc15]" />
          <p className="font-sans text-[0.96rem] leading-[1.8] text-[#d6e0f0] md:text-[1.08rem]">
            We aim to respond to all enquiries as soon as possible. Whether you&apos;re arranging your first checkout flight or enquiring about aircraft hire, our operations team is here to help.
          </p>
        </div>
      </section>
    </main>
  )
}
