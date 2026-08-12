'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBookingPaymentSession, submitStandardBankTransferProof } from "@/app/actions/payment"
import { getStandardBookingPaymentDisplayState } from "@/lib/booking/standard-booking-payment-state"

const STRIPE_DOMESTIC_FEE_BPS = 170
const STRIPE_FIXED_FEE_CENTS  = 30
const ENABLE_SURCHARGE         = true

type Props = {
  bookingId: string
  invoice: {
    id: string
    invoice_number: string
    vdo_reading?: number | null
    rate_cents_per_hour?: number | null
    base_amount_cents?: number | null
    landing_subtotal_cents?: number | null
    subtotal_cents: number
    advance_applied_cents: number
    stripe_amount_due_cents: number
    total_paid_cents: number
    paid_at: string | null
    status: string
    payment_method: string | null
  }
  landingCharges?: Array<{
    airportLabel: string
    icaoCode: string | null
    landingCount: number
    unitAmountCents: number
    totalAmountCents: number
  }>
  bankTransferSubmission?: { id: string; status: string } | null
  bankDetails?: {
    accountName: string
    bsb: string
    accountNumber: string
  } | null
}

function money(cents: number) {
  return (cents / 100).toFixed(2)
}

export default function BookingPaymentCard({
  bookingId,
  invoice,
  landingCharges = [],
  bankTransferSubmission,
  bankDetails,
}: Props) {
  const router = useRouter()
  const [method, setMethod] = useState<"stripe" | "bank_transfer">("stripe")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayState = getStandardBookingPaymentDisplayState({
    bookingStatus: 'payment_pending',
    invoiceStatus: invoice.status,
    invoicePaidAt: invoice.paid_at,
    invoiceAmountDueCents: invoice.stripe_amount_due_cents,
    invoiceTotalPaidCents: invoice.total_paid_cents,
    latestSubmissionStatus: bankTransferSubmission?.status ?? null,
  })

  const baseAmountCents = invoice.stripe_amount_due_cents
  const baseAmount      = money(baseAmountCents)
  const subtotal        = money(invoice.subtotal_cents)
  const advanceApplied  = money(invoice.advance_applied_cents)

  let surchargeCents  = 0
  let grossAmountCents = baseAmountCents
  if (baseAmountCents > 0 && ENABLE_SURCHARGE) {
    grossAmountCents = Math.ceil(
      (baseAmountCents + STRIPE_FIXED_FEE_CENTS) / (1 - STRIPE_DOMESTIC_FEE_BPS / 10000)
    )
    surchargeCents = grossAmountCents - baseAmountCents
  }
  const surchargeAmount = money(surchargeCents)
  const grossAmount     = money(grossAmountCents)

  const vdoHours = invoice.vdo_reading
  const ratePerHour =
    invoice.rate_cents_per_hour != null ? money(invoice.rate_cents_per_hour) : null
  const flightChargeCents = invoice.base_amount_cents
  const landingCents = invoice.landing_subtotal_cents
  const hasFlightDetails =
    vdoHours != null ||
    flightChargeCents != null ||
    (landingCents != null && landingCents > 0) ||
    landingCharges.length > 0

  const totalLandingCount = landingCharges.reduce((sum, charge) => sum + charge.landingCount, 0)
  const sameLandingUnitRate =
    landingCharges.length > 0 &&
    landingCharges.every((charge) => charge.unitAmountCents === landingCharges[0].unitAmountCents)
  const landingAirportSummary = landingCharges
    .map((charge) => {
      // Prefer full airport name; fall back to label without ICAO prefix if needed
      const label = charge.airportLabel || ''
      const withoutIcao = charge.icaoCode && label.startsWith(`${charge.icaoCode} · `)
        ? label.slice(charge.icaoCode.length + 3)
        : label
      return withoutIcao || charge.icaoCode || 'Airport'
    })
    .join(' + ')
  const landingCalcSummary = sameLandingUnitRate
    ? `$${money(landingCharges[0].unitAmountCents)} × ${totalLandingCount}`
    : landingCharges
        .map((charge) => `$${money(charge.unitAmountCents)} × ${charge.landingCount}`)
        .join(' + ')
  const landingCalcTotal =
    landingCents != null && landingCents > 0
      ? money(landingCents)
      : money(landingCharges.reduce((sum, charge) => sum + charge.totalAmountCents, 0))

  // ── Awaiting payment confirmation ─────────────────────────────────────────
  if (displayState === 'payment_review_pending') {
    return (
      <div id="payment" className="scroll-mt-28 bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-[#1a4fd6] text-lg">account_balance</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#1a4fd6]">Payment Submitted</h3>
        </div>
        <p className="text-sm text-[#4b6390] leading-relaxed mb-4">
          Your bank-transfer proof has been submitted. An admin will review it before your booking payment is confirmed.
        </p>
        <div className="flex items-center gap-2 p-3 bg-[#f0f6ff] rounded-lg border border-[#152d5a]/10 text-sm text-[#152d5a]">
          <span className="material-symbols-outlined text-[#1a4fd6] text-[18px]">pending_actions</span>
          Awaiting admin review — no further action needed
        </div>
        <p className="text-[10px] text-[#4b6390] mt-3 leading-relaxed">
          Invoice reference: <span className="font-mono text-[#152d5a]">{invoice.invoice_number}</span>
        </p>
      </div>
    )
  }

  // ── Paid ──────────────────────────────────────────────────────────────────
  if (displayState === 'paid' || displayState === 'waived') {
    return (
      <div id="payment" className="scroll-mt-28 bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-600">{displayState === 'waived' ? 'Payment Waived' : 'Payment Confirmed'}</h3>
        </div>
        <p className="text-sm text-[#4b6390] leading-relaxed">
          {displayState === 'waived'
            ? 'No customer payment is required for this booking. The booking is closed.'
            : 'Your flight payment has been confirmed. Your booking is now complete.'}
        </p>
      </div>
    )
  }

  // ── Awaiting payment ──────────────────────────────────────────────────────
  const handleBankTransferSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData(e.currentTarget)
      await submitStandardBankTransferProof(invoice.id, bookingId, invoice.invoice_number, formData)
      router.refresh()
    } catch (err: any) {
      setError(err.message || "Failed to submit bank transfer proof")
      setUploading(false)
    }
  }

  return (
    <div id="payment" className="scroll-mt-28 bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="material-symbols-outlined text-[#1a4fd6] text-lg">payments</span>
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#1a4fd6]">
          {displayState === 'payment_still_due' ? 'Payment Still Due' : 'Payment Required'}
        </h3>
      </div>
      <p className="text-sm text-[#4b6390] leading-relaxed mb-4">
        {displayState === 'payment_still_due'
          ? 'A partial payment is recorded on this invoice, but the remaining balance still needs to be settled before the booking can close.'
          : 'Your flight records have been reviewed and your invoice is ready. The amount below is calculated from the VDO meter reading and any applicable landing fees.'}
      </p>

      {/* Invoice details — shown above payment method choice */}
      <div className="mb-5 rounded-xl border border-[#152d5a]/10 bg-[#f0f6ff] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#1a4fd6]">receipt_long</span>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#1a4fd6]">Invoice details</p>
          </div>
          <p className="font-mono text-[11px] font-semibold text-[#4b6390]">{invoice.invoice_number}</p>
        </div>

        <div className="space-y-3 text-sm">
          {hasFlightDetails ? (
            <>
              {flightChargeCents != null ? (
                <div className="flex items-start justify-between gap-4 text-[#152d5a]">
                  <p className="font-medium">Flight charge (VDO)</p>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular-nums">${money(flightChargeCents)}</p>
                    {vdoHours != null && ratePerHour != null ? (
                      <p className="mt-1 text-[12px] tabular-nums text-[#4b6390]">
                        ${ratePerHour} × {Number(vdoHours).toFixed(1)} hrs = ${money(flightChargeCents)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {(landingCharges.length > 0 || (landingCents != null && landingCents > 0)) && (
                <div className="border-t border-[#152d5a]/10 pt-3">
                  <div className="flex items-start justify-between gap-4 text-[#152d5a]">
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="font-medium">Landing fees</p>
                      {landingCharges.length > 0 ? (
                        <p className="mt-1 text-[12px] leading-relaxed text-[#4b6390]">
                          {landingAirportSummary}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-medium tabular-nums">${landingCalcTotal}</p>
                      {landingCharges.length > 0 ? (
                        <p className="mt-1 text-[12px] tabular-nums text-[#4b6390]">
                          {landingCalcSummary} = ${landingCalcTotal}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-start justify-between gap-4 border-t border-[#152d5a]/10 pt-3 font-semibold text-[#152d5a]">
                <p>Flight total</p>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums">${subtotal}</p>
                  {(flightChargeCents != null || (landingCents != null && landingCents > 0) || landingCharges.length > 0) ? (
                    <p className="mt-1 text-[12px] font-medium tabular-nums text-[#4b6390]">
                      {[
                        flightChargeCents != null ? `$${money(flightChargeCents)}` : null,
                        (landingCents != null && landingCents > 0) || landingCharges.length > 0
                          ? `$${landingCalcTotal}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' + ')}
                      {' = '}${subtotal}
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="flex justify-between gap-4 text-[#152d5a]">
              <span>Flight Total (VDO + landings)</span>
              <span className="font-medium tabular-nums">${subtotal}</span>
            </div>
          )}

          {invoice.advance_applied_cents > 0 && (
            <div className="flex justify-between gap-4 text-emerald-600">
              <span>Account Credit Applied</span>
              <span className="font-medium tabular-nums">-${advanceApplied}</span>
            </div>
          )}

          <div className="flex justify-between gap-4 border-t border-[#152d5a]/10 pt-3 font-bold text-[#1a4fd6]">
            <span>Amount due</span>
            <span className="tabular-nums">${baseAmount}</span>
          </div>
        </div>
      </div>

      {bankTransferSubmission?.status === "rejected" && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600">
          <div className="flex gap-2 items-start">
            <span className="material-symbols-outlined text-[18px] flex-shrink-0">error</span>
            <p>Your previous bank transfer proof was rejected. Please upload a valid receipt.</p>
          </div>
        </div>
      )}

      {/* Payment method selector */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => setMethod("stripe")}
          className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-colors ${
            method === "stripe"
              ? "bg-[#1a4fd6] border-[#1a4fd6] text-white"
              : "bg-[#f0f6ff] border-[#152d5a]/10 hover:bg-[#e8f0fe] text-[#152d5a]"
          }`}
        >
          <span className="material-symbols-outlined">credit_card</span>
          <span className="text-xs font-bold uppercase tracking-widest">Pay Online</span>
        </button>
        <button
          onClick={() => setMethod("bank_transfer")}
          className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-colors ${
            method === "bank_transfer"
              ? "bg-[#1a4fd6] border-[#1a4fd6] text-white"
              : "bg-[#f0f6ff] border-[#152d5a]/10 hover:bg-[#e8f0fe] text-[#152d5a]"
          }`}
        >
          <span className="material-symbols-outlined">account_balance</span>
          <span className="text-xs font-bold uppercase tracking-widest">Bank Transfer</span>
        </button>
      </div>

      {method === "stripe" ? (
        <>
          <div className="mb-6 space-y-2 p-4 rounded-xl bg-white border border-[#152d5a]/10 text-sm">
            <div className="flex justify-between text-[#152d5a]">
              <span>Base Amount Due</span>
              <span>${baseAmount}</span>
            </div>
            {surchargeCents > 0 && (
              <div className="flex justify-between text-[#4b6390] text-xs">
                <span>Online payment surcharge (1.7% + 30c)</span>
                <span>${surchargeAmount}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-[#1a4fd6] pt-2 border-t border-[#152d5a]/10">
              <span>Total Card Payment</span>
              <span>${grossAmount}</span>
            </div>
          </div>

          <form action={createBookingPaymentSession.bind(null, bookingId)}>
            <button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-400 text-white rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">credit_card</span>
              Pay ${grossAmount}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="mb-5 rounded-xl border border-[#152d5a]/10 bg-[#f0f6ff] p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[#1a4fd6] text-[18px] flex-shrink-0">info</span>
              <p className="text-xs font-bold uppercase tracking-widest text-[#1a4fd6]">Manual bank transfer required</p>
            </div>
            <p className="text-sm text-[#4b6390] leading-relaxed mb-3">
              Bank transfer is a manual payment method. Please transfer the exact amount shown below to the official OZ Rent A Plane bank account using the payment reference provided.
            </p>
            <p className="text-sm text-[#4b6390] leading-relaxed mb-3">
              After completing the transfer, upload proof of payment — a bank receipt or screenshot showing the successful transfer.
            </p>
            <p className="text-sm text-[#4b6390] leading-relaxed">
              Our admin team will manually verify your payment and usually respond within <span className="text-amber-600 font-medium">2 to 24 hours</span> after your proof is submitted. Your clearance and aircraft booking access will be finalised only after payment has been verified.
            </p>
          </div>

          <div className="mb-6 p-4 rounded-xl bg-white border border-[#152d5a]/10 text-sm space-y-4">
            <div>
              <p className="text-xs text-[#4b6390] mb-1">Transfer Amount (No Surcharge)</p>
              <p className="text-xl font-bold text-[#152d5a]">${baseAmount}</p>
            </div>
            <div className="pt-3 border-t border-[#152d5a]/10 space-y-2 text-[#4b6390]">
              <div className="flex justify-between">
                <span className="text-[#4b6390]">Account Name</span>
                <span className="font-medium text-[#152d5a]">{bankDetails?.accountName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4b6390]">BSB</span>
                <span className="font-mono text-[#152d5a]">{bankDetails?.bsb}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4b6390]">Account Number</span>
                <span className="font-mono text-[#152d5a]">{bankDetails?.accountNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4b6390]">Payment Reference</span>
                <span className="font-mono text-[#1a4fd6] font-bold">{invoice.invoice_number}</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleBankTransferSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#4b6390] mb-2">
                Upload Transfer Receipt
              </label>
              <input
                type="file"
                name="receipt"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                required
                className="w-full text-sm text-[#4b6390] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#f0f6ff] file:text-[#1a4fd6] hover:file:bg-[#e8f0fe]"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={uploading}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">upload</span>
                  Submit Proof
                </>
              )}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
