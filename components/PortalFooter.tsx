export default function PortalFooter() {
  return (
    <footer className="border-t border-white/[0.05] py-5 px-6 md:px-10 mt-auto">
      <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">

        <p className="font-sans text-[11px] text-white/45 font-medium">
          © {new Date().getFullYear()} OZ Rent A Plane
        </p>

        <nav aria-label="Portal footer links" className="flex items-center gap-6 flex-wrap justify-center">
          {[
            { label: 'Privacy Policy',    href: '/privacy-policy' },
            { label: 'Terms',             href: '/terms-and-conditions' },
            { label: 'Contact Support',   href: '/dashboard/messages' },
          ].map(link => (
            <a
              key={link.label}
              href={link.href}
              className="font-sans text-[11px] text-white/45 hover:text-white/75 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

      </div>
    </footer>
  )
}
