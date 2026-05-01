import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Blocked Customers | Admin' }

export default function BlockedCustomersPage() {
  return (
    <>
      <AdminPortalHero
        eyebrow="Customer Management"
        title="Blocked Customers"
        subtitle="Review and manage blocked customer accounts."
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">
        <div className="p-12 text-center text-slate-500 border border-white/5 rounded-2xl bg-white/5">
          <span
            className="material-symbols-outlined text-4xl mb-3 text-slate-600 block"
            style={{ fontVariationSettings: "'wght' 200" }}
          >
            block
          </span>
          No blocked customers. This feature is coming soon.
        </div>
      </div>
    </>
  )
}
