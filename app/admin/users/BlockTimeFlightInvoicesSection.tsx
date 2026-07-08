import { formatDateFromISO } from '@/lib/formatDateTime'
import SettleBlockTimeInvoiceButton from './SettleBlockTimeInvoiceButton'

export type AdminBlockTimeFlightInvoice = {
  id: string
  invoice_number: string
  booking_id: string | null
  total: number
  status: string
  kind: 'usage' | 'overage' | 'landing_fee'
  created_at: string
  paid_at: string | null
  pdf_url: string | null
}

const KIND_CFG: Record<AdminBlockTimeFlightInvoice['kind'], { label: string; cls: string }> = {
  usage:       { label: 'Block time deduction', cls: 'border-[#1a4fd6]/15 bg-[#f0f6ff] text-[#1a4fd6]' },
  overage:     { label: 'OVERAGE',              cls: 'border-rose-300 bg-rose-50 text-rose-700' },
  landing_fee: { label: 'Landing fees',         cls: 'border-amber-300 bg-amber-50 text-amber-700' },
}

function shortDate(value: string | null | undefined): string {
  if (!value) return '—'
  return formatDateFromISO(value)
}

function aud(value: number): string {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
}

export default function BlockTimeFlightInvoicesSection({
  invoices,
}: {
  invoices: AdminBlockTimeFlightInvoice[]
}) {
  const outstandingOverages = invoices.filter(
    (invoice) => invoice.kind === 'overage' && invoice.status === 'awaiting',
  )

  return (
    <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5 mt-3">
      <h4 className="text-[11px] uppercase tracking-widest font-semibold text-[#4b6390] mb-3">
        Block time flight invoices
      </h4>

      {outstandingOverages.length > 0 && (
        <div className="mb-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-rose-700">
            Unpaid overage — customer gated
          </p>
          <p className="mt-0.5 text-[12px] text-rose-800 leading-relaxed">
            {outstandingOverages.length === 1
              ? `Invoice ${outstandingOverages[0].invoice_number} (${aud(outstandingOverages[0].total)}) is unpaid.`
              : `${outstandingOverages.length} overage invoices are unpaid.`}{' '}
            The customer cannot make new bookings, buy block time, or top up until settled. They can
            pay from their Block Time page.
          </p>
        </div>
      )}

      {invoices.length === 0 ? (
        <p className="text-[12px] text-[#4b6390]">No block time flight invoices yet.</p>
      ) : (
        invoices.map((invoice) => {
          const kindCfg = KIND_CFG[invoice.kind]
          const isUnpaidOverage = invoice.kind === 'overage' && invoice.status === 'awaiting'
          return (
            <div
              key={invoice.id}
              className="flex flex-col gap-2 py-3 border-b border-[#152d5a]/8 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-semibold text-[#152d5a]">
                    {invoice.invoice_number}
                  </p>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${kindCfg.cls}`}>
                    {kindCfg.label}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    invoice.status === 'paid'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : isUnpaidOverage
                        ? 'border-rose-300 bg-rose-50 text-rose-700'
                        : 'border-amber-300 bg-amber-50 text-amber-700'
                  }`}>
                    {invoice.status === 'paid' ? 'Paid' : invoice.status === 'awaiting' ? 'Unpaid' : invoice.status}
                  </span>
                </div>
                <p className="text-[12px] text-[#4b6390] mt-0.5">
                  Issued {shortDate(invoice.created_at)}
                  {invoice.paid_at ? ` · paid ${shortDate(invoice.paid_at)}` : ''}
                  {invoice.pdf_url && (
                    <>
                      {' · '}
                      <a
                        href={invoice.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#1a4fd6] underline underline-offset-2"
                      >
                        PDF
                      </a>
                    </>
                  )}
                </p>
              </div>

              <div className="flex flex-shrink-0 flex-col items-start gap-2 sm:items-end">
                <p className="text-[13px] font-semibold text-[#152d5a] sm:text-right">
                  {aud(invoice.total)}
                </p>
                {invoice.status === 'awaiting' && invoice.kind !== 'usage' && (
                  <SettleBlockTimeInvoiceButton
                    invoiceId={invoice.id}
                    invoiceNumber={invoice.invoice_number}
                    isOverage={invoice.kind === 'overage'}
                  />
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
