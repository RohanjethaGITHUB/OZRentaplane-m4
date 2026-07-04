import { formatDateFromISO } from '@/lib/formatDateTime'

export type AdminBlockTimeTopup = {
  id: string
  purchase_id: string
  hours_added: number
  rate_per_hour: number
  amount_paid: number
  validity_extension_days: number
  hours_remaining_before: number
  hours_remaining_after: number
  expires_at_after: string
  created_at: string
  package_name: string
}

function shortDate(value: string | null | undefined): string {
  if (!value) return '—'
  return formatDateFromISO(value)
}

function aud(value: number): string {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
}

export default function BlockTimeTopupsSection({ topups }: { topups: AdminBlockTimeTopup[] }) {
  return (
    <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5 mt-3">
      <h4 className="text-[11px] uppercase tracking-widest font-semibold text-[#4b6390] mb-3">Block time top-ups</h4>

      {topups.length === 0 ? (
        <p className="text-[12px] text-[#4b6390]">No top-ups yet.</p>
      ) : (
        topups.map((topup) => (
          <div
            key={topup.id}
            className="flex flex-col gap-2 py-3 border-b border-[#152d5a]/8 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-semibold text-[#152d5a]">
                  +{Number(topup.hours_added).toFixed(1)}h · {topup.package_name}
                </p>
                <span className="inline-flex items-center rounded-full border border-[#1a4fd6]/15 bg-[#f0f6ff] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1a4fd6]">
                  +{topup.validity_extension_days}d validity
                </span>
              </div>
              <p className="text-[12px] text-[#4b6390] mt-0.5">
                {Number(topup.hours_added).toFixed(1)}h at ${Number(topup.rate_per_hour).toFixed(0)}/hr (locked rate) ·{' '}
                {shortDate(topup.created_at)} · balance {Number(topup.hours_remaining_before).toFixed(1)}h →{' '}
                {Number(topup.hours_remaining_after).toFixed(1)}h · expiry extended to {shortDate(topup.expires_at_after)}
              </p>
            </div>

            <p className="flex-shrink-0 text-[13px] font-semibold text-[#152d5a] sm:text-right">
              {aud(Number(topup.amount_paid))}
            </p>
          </div>
        ))
      )}
    </div>
  )
}
