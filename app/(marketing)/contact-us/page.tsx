import type { Metadata } from 'next'
import PreFooterCTA from '@/components/marketing/PreFooterCTA'

export const metadata: Metadata = {
  title: 'Contact Us | OZ Rent A Plane',
  description:
    'Contact OZ Rent A Plane for aircraft hire, checkout flights, bookings, and pilot documentation support.',
  alternates: {
    canonical: '/contact-us',
  },
  openGraph: {
    title: 'Contact Us | OZ Rent A Plane',
    description:
      'Reach the OZ Rent A Plane operations team for aircraft hire, checkout flights, and booking support.',
    url: '/contact-us',
    images: [{ url: '/optimized/contact-hero-1280.jpg', width: 1200, height: 630 }],
  },
}

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

export default function ContactPage() {
  return (
    <main className="overflow-x-hidden bg-mkt-main text-deep-ink">
      <section className="hero-fade-to-main relative flex min-h-[560px] items-center overflow-hidden px-6 pb-16 pt-36 md:min-h-[700px] md:px-12 md:pt-40 lg:px-20">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/optimized/contact-hero-1280.jpg")' }}
        />
        <div className="absolute inset-0 z-0 bg-[#081a2f]/40" />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#050f1d]/76 via-[#081a31]/56 via-45% to-[#0c2442]/28" />
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_22%_40%,rgba(27,59,98,0.30),rgba(8,20,36,0.12)_46%,rgba(8,20,36,0)_74%)]" />
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_28%_64%,rgba(250,204,21,0.11),rgba(250,204,21,0.04)_20%,rgba(250,204,21,0)_42%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-5 bg-[linear-gradient(to_bottom,rgba(13,27,62,0.5),transparent)]" />

        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <div className="max-w-2xl">
            <h1 className="font-serif text-5xl leading-[1.05] tracking-tight text-[#eaf0ff] md:text-7xl">Contact Us</h1>
            <p className="mt-6 max-w-xl font-sans text-[1rem] leading-relaxed text-[#d3ddee] md:text-[1.08rem]">
              Have a question about aircraft hire, checkout flights, bookings, or pilot documentation? Reach out to the OZ Rent A Plane team and we&apos;ll help you get airborne.
            </p>
          </div>
        </div>
      </section>

      <section id="inquiry-form" className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 bg-mkt-main px-6 py-10 md:px-12 lg:grid-cols-12 lg:gap-7 lg:px-20 lg:py-14">
        <div className="lg:col-span-8">
          <div className="rounded-lg border border-mkt-subtle bg-mkt-lift p-5 shadow-[0_20px_40px_rgba(13,27,62,0.08)] md:p-7">
            <h2 className="mb-5 flex items-center gap-2 font-serif text-3xl text-deep-ink md:text-[2rem]">
              <Icon name="flight_takeoff" className="!text-[24px] text-brand-blue" />
              Inquiry
            </h2>

            <form className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-sans text-[0.69rem] font-semibold uppercase tracking-[0.12em] text-brand-blue">Full Name</span>
                  <input
                    type="text"
                    placeholder="Captain John Doe"
                    className="w-full rounded-sm border border-mkt-subtle bg-white px-3 py-2.5 font-sans text-sm text-deep-ink placeholder:text-muted-ink focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-sans text-[0.69rem] font-semibold uppercase tracking-[0.12em] text-brand-blue">Email</span>
                  <input
                    type="email"
                    placeholder="john@example.com"
                    className="w-full rounded-sm border border-mkt-subtle bg-white px-3 py-2.5 font-sans text-sm text-deep-ink placeholder:text-muted-ink focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-sans text-[0.69rem] font-semibold uppercase tracking-[0.12em] text-brand-blue">Phone</span>
                  <input
                    type="tel"
                    placeholder="+61 400 000 000"
                    className="w-full rounded-sm border border-mkt-subtle bg-white px-3 py-2.5 font-sans text-sm text-deep-ink placeholder:text-muted-ink focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-sans text-[0.69rem] font-semibold uppercase tracking-[0.12em] text-brand-blue">Enquiry Type</span>
                  <select className="w-full rounded-sm border border-mkt-subtle bg-white px-3 py-2.5 font-sans text-sm text-deep-ink focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20">
                    <option>Aircraft Hire</option>
                    <option>Checkout Flight</option>
                    <option>Pilot Documents</option>
                    <option>Existing Booking</option>
                    <option>General Enquiry</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block font-sans text-[0.69rem] font-semibold uppercase tracking-[0.12em] text-brand-blue">Message</span>
                <textarea
                  rows={5}
                  placeholder="Detail your operational requirements here..."
                  className="w-full resize-y rounded-sm border border-mkt-subtle bg-white px-3 py-2.5 font-sans text-sm text-deep-ink placeholder:text-muted-ink focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </label>

              <button type="submit" className="mt-2 inline-flex rounded-sm bg-runway-amber px-7 py-3 font-sans text-[0.8rem] font-bold uppercase tracking-[0.12em] text-deep-ink transition-all hover:brightness-105">
                Submit Inquiry
              </button>
            </form>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4">
          <div className="rounded-lg border border-mkt-subtle bg-mkt-lift p-4">
            <div className="flex items-start gap-3">
              <div className="rounded bg-[#2a3d59]/58 p-2">
                <Icon name="support_agent" className="text-runway-amber" />
              </div>
              <div>
                <h3 className="font-sans text-lg font-semibold text-deep-ink">Call the Team</h3>
                <p className="mt-1 font-sans text-sm text-muted-ink">0474 576 085</p>
                <p className="mt-0.5 font-sans text-xs uppercase tracking-[0.11em] text-[#93a8c6]">Available 0600 - 2000 AEST</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-mkt-subtle bg-mkt-lift p-4">
            <div className="flex items-start gap-3">
              <div className="rounded bg-[#2a3d59]/58 p-2">
                <Icon name="mail" className="text-runway-amber" />
              </div>
              <div>
                <h3 className="font-sans text-lg font-semibold text-deep-ink">Email Us</h3>
                <p className="mt-1 font-sans text-sm text-muted-ink">ops@ozrentaplane.com.au</p>
                <p className="mt-0.5 font-sans text-xs uppercase tracking-[0.11em] text-[#93a8c6]">Typical response within 2 hrs</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl bg-mkt-alt px-6 pb-12 pt-2 md:px-12 lg:px-20 lg:pb-16">
        <div className="grid w-full grid-cols-1 gap-6 rounded-xl border border-mkt-subtle bg-mkt-lift p-6 shadow-[0_20px_40px_rgba(13,27,62,0.08)] md:grid-cols-12 md:items-center md:gap-8 md:p-8">
          <div className="md:col-span-7">
            <div className="mb-4 inline-flex items-center gap-2 rounded-sm border border-mkt-subtle bg-horizon-border px-3 py-1.5">
              <Icon name="location_on" className="text-brand-blue" />
              <span className="font-sans text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-brand-blue">Visit the Base (Bankstown Airport)</span>
            </div>
            <h3 className="font-serif text-3xl text-deep-ink md:text-4xl">Visit the Base (Bankstown Airport)</h3>
            <p className="mt-3 font-sans text-base text-muted-ink">8 Wackett St, Bankstown Aerodrome NSW 2200</p>
            <p className="mt-3 max-w-xl font-sans text-sm leading-relaxed text-muted-ink md:text-[0.95rem]">
              Find us at Bankstown Aerodrome for checkout flights, aircraft access, and operational enquiries.
            </p>
          </div>
          <div className="relative h-[280px] overflow-hidden rounded-lg border border-[rgba(148,163,184,0.18)] bg-mkt-lift md:col-span-5 md:h-56">
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
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-sm border border-runway-amber/35 bg-white text-runway-amber shadow-[0_0_16px_rgba(3,8,18,0.20)] backdrop-blur-sm transition-colors hover:bg-[#f4f8ff]"
            >
              <Icon name="open_in_full" className="!text-[18px]" />
            </a>
            <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/5" />
          </div>
        </div>
      </section>

      <section className="border-y border-[#93aed1]/15 bg-mkt-main px-6 py-12 md:px-12 md:py-12 lg:px-20">
        <div className="mx-auto max-w-4xl text-center">
          <Icon name="verified" className="mb-4 text-brand-blue" />
          <p className="font-sans text-[0.96rem] leading-[1.8] text-muted-ink md:text-[1.08rem]">
            We aim to respond to all enquiries as soon as possible. Whether you&apos;re arranging your first checkout flight or enquiring about aircraft hire, our operations team is here to help.
          </p>
        </div>
      </section>

      <PreFooterCTA
        heading="Still Have Questions?"
        subtext="Our operations team is available 0600–2000 AEST and aims to respond within 2 hours."
        ctaLabel="Send an Inquiry"
        ctaHref="#inquiry-form"
      />
    </main>
  )
}
