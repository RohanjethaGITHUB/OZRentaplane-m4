export default function PortalFooter() {
  return (
    <footer className="border-t border-white/[0.05] py-6 px-6 md:px-10 mt-auto">
      <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">

        <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-white/25 font-medium">
          OZRentAPlane — Member Portal
        </p>

        <nav aria-label="Portal footer links" className="flex items-center gap-6 flex-wrap justify-center">
          {[
            { label: 'Privacy Policy',    href: '/privacy-policy' },
            { label: 'Terms',             href: '/terms-and-conditions' },
            { label: 'Contact Support',   href: '#' },
            { label: 'Safety Disclaimer', href: '/safety-disclaimer' },
          ].map(link => (
            <a
              key={link.label}
              href={link.href}
              className="font-sans text-[10px] text-white/25 hover:text-white/55 transition-colors uppercase tracking-widest"
            >
              {link.label}
            </a>
          ))}
        </nav>

      </div>
    </footer>
  )
}
