const FOOTER_LINKS = [
  { label: 'Privacy Policy',  href: '#' },
  { label: 'Terms of Service', href: '#' },
  { label: 'Contact Us',      href: 'mailto:hello@ozrentaplane.com.au' },
]

export default function Footer() {
  return (
    // bg-oz-deep matches the pinned stage canvas background (#000e25) exactly —
    // no border, no colour jump; the footer scrolls in as a natural continuation.
    <footer className="bg-oz-deep pt-10 pb-12 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div>
          <p className="font-serif text-xl font-black italic text-oz-blue tracking-tight mb-2">OZRentAPlane</p>
          <p className="font-sans text-sm text-oz-subtle font-light">
            &copy; {new Date().getFullYear()} OZRentAPlane. Aircraft rental for licensed pilots.
          </p>
          <p className="font-sans text-xs text-oz-subtle/60 font-light mt-1">
            CASA compliant. All operations subject to applicable Australian aviation regulations.
          </p>
        </div>
        <div className="flex flex-wrap md:justify-end gap-x-6 gap-y-3">
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="font-sans text-sm text-oz-subtle hover:text-oz-blue transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
