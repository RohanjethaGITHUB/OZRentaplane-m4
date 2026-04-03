const FAQS = [
  {
    q: 'Do I need to be a member to book?',
    a: 'Yes. All pilots must go through our approval process before making their first booking. This is a one-time verification that we keep on file.',
  },
  {
    q: 'What if I have a defect during a pre-flight?',
    a: 'Report it immediately via the platform or by calling us directly. We\'ll assess the defect and arrange for maintenance. You won\'t be charged for a flight that didn\'t happen.',
  },
  {
    q: 'Can I fly interstate?',
    a: 'Cross-country flights are permitted subject to route approval. Certain destinations or airspace may require prior coordination. Check with us before booking long-distance trips.',
  },
  {
    q: 'What\'s the cancellation policy?',
    a: 'Cancellations made more than 24 hours prior to departure are free. Late cancellations may incur a small administration fee. Details will be in your membership agreement.',
  },
]

export default function BookingCTA() {
  return (
    <section id="booking" className="bg-oz-navy py-28 lg:py-36">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        {/* CTA Banner */}
        <div className="bg-oz-deep border border-oz-high/60 rounded-lg overflow-hidden mb-24">
          <div className="relative px-10 py-16 lg:px-20 text-center overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-oz-blue/5 via-transparent to-transparent pointer-events-none" />
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-oz-blue/8 rounded-full blur-[80px] pointer-events-none" />
            <div className="relative">
              <p className="font-sans text-xs font-bold tracking-[0.3em] uppercase text-oz-blue/60 mb-4">
                Ready to Fly?
              </p>
              <h2 className="font-serif text-4xl lg:text-6xl font-black text-oz-text leading-tight mb-6">
                Your clearance<br />
                <span className="italic text-oz-blue">awaits.</span>
              </h2>
              <p className="font-sans text-lg text-oz-muted font-light max-w-xl mx-auto mb-10">
                Join the waitlist now. We&apos;re accepting pilot applications ahead of our launch — secure your place early.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="mailto:hello@ozrentaplane.com.au"
                  className="bg-oz-blue text-oz-deep px-10 py-4 rounded font-black font-sans text-base hover:bg-oz-text transition-colors shadow-lg shadow-oz-blue/10"
                >
                  Apply for Membership
                </a>
                <a
                  href="#how-it-works"
                  className="border border-oz-blue/25 text-oz-blue px-10 py-4 rounded font-bold font-sans text-base hover:border-oz-blue/50 hover:bg-oz-blue/5 transition-all"
                >
                  How It Works
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <h3 className="font-serif text-2xl font-bold text-oz-text mb-10 text-center">Frequently Asked Questions</h3>
          <div className="space-y-px">
            {FAQS.map((faq, i) => (
              <div key={i} className="border border-oz-high/50 rounded-lg p-7 bg-oz-mid">
                <h4 className="font-sans text-sm font-bold text-oz-text mb-2.5">{faq.q}</h4>
                <p className="font-sans text-sm text-oz-muted font-light leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
