import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Maintenance / Notes | Admin' }

export default function AircraftMaintenancePage() {
  return (
    <>
      <AdminPortalHero
        eyebrow="Aircraft Management"
        title="Maintenance / Notes"
        subtitle="Log and track maintenance events and operational notes for the fleet."
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">
        <div className="p-12 text-center text-slate-500 border border-white/5 rounded-2xl bg-white/5">
          <span
            className="material-symbols-outlined text-4xl mb-3 text-slate-600 block"
            style={{ fontVariationSettings: "'wght' 200" }}
          >
            build
          </span>
          Maintenance log coming soon.
        </div>
      </div>
    </>
  )
}
