"use client"

import { useState } from "react"
import { createCheckoutPaymentSession, submitBankTransferProof } from "@/app/actions/payment"
import { getCheckoutPaymentDisplayState } from "@/lib/checkout-payment-state"

const STRIPE_DOMESTIC_FEE_BPS = 170
const STRIPE_FIXED_FEE_CENTS = 30
const ENABLE_SURCHARGE = true

function money(cents: number) {
  return (cents / 100).toFixed(2)
}

type Props = {
  bookingId: string
  checkoutInvoice?: {
    id: string
    invoice_number: string
    subtotal_cents: number
    advance_applied_cents: number
    stripe_amount_due_cents: number
    status?: string
    vdo_reading?: number | null
    vdo_hours_flown?: number | null
    vdo_start_reading?: number | null
    vdo_end_reading?: number | null
    checkout_duration_hours?: number | null
    checkout_rate_cents_per_hour?: number | null
    checkout_calculated_amount_cents?: number | null
    checkout_landing_subtotal_cents?: number | null
    checkout_final_amount_cents?: number | null
  } | null
  landingCharges?: Array<{
    airportLabel: string
    icaoCode: string | null
    landingCount: number
    unitAmountCents: number
    totalAmountCents: number
  }>
  bankTransferSubmission?: {
    id: string
    status: string
  } | null
  bankDetails?: {
    bankName?: string
    accountName: string
    bsb: string
    accountNumber: string
  } | null
}

export default function CheckoutPaymentCard({
  bookingId,
  checkoutInvoice,
  landingCharges = [],
  bankTransferSubmission,
  bankDetails,
}: Props) {
  const [method, setMethod] = useState<"stripe" | "bank_transfer">("stripe")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!checkoutInvoice) {
    return (
      <div id="payment" className="scroll-mt-28 bg-white border border-amber-200 rounded-[1.25rem] p-4 sm:p-6">
        <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
          <span className="material-symbols-outlined text-amber-500 text-lg sm:text-xl">payments</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-amber-600">Payment Required</h3>
        </div>
        <p className="text-xs sm:text-sm text-[#4b6390] leading-relaxed">
          Your checkout flight invoice is being prepared. Please refresh the page or contact the operations team if it does not appear shortly.
        </p>
      </div>
    )
  }

  // Derive the display state — this is the single source of truth for what to show
  const displayState = getCheckoutPaymentDisplayState(
    { status: checkoutInvoice.status ?? 'payment_required' },
    bankTransferSubmission ?? null,
  )

  const baseAmountCents = checkoutInvoice.stripe_amount_due_cents
  const baseAmount = money(baseAmountCents)
  const subtotal = money(checkoutInvoice.subtotal_cents)
  const advanceApplied = money(checkoutInvoice.advance_applied_cents)

  // Calculate Surcharge for Stripe
  let surchargeCents = 0
  let grossAmountCents = baseAmountCents
  if (baseAmountCents > 0 && ENABLE_SURCHARGE) {
    grossAmountCents = Math.ceil((baseAmountCents + STRIPE_FIXED_FEE_CENTS) / (1 - (STRIPE_DOMESTIC_FEE_BPS / 10000)))
    surchargeCents = grossAmountCents - baseAmountCents
  }
  const surchargeAmount = money(surchargeCents)
  const grossAmount = money(grossAmountCents)

  // ── Calculation Breakdown ──────────────────────────────────────────────────
  const landingChargesList = landingCharges ?? []
  const rateCents = (checkoutInvoice.checkout_rate_cents_per_hour && checkoutInvoice.checkout_rate_cents_per_hour > 0)
    ? checkoutInvoice.checkout_rate_cents_per_hour
    : 29000
  const ratePerHour = money(rateCents)

  const totalLandingChargesFromList = landingChargesList.reduce((sum, c) => sum + c.totalAmountCents, 0)
  const landingSubtotalCents = (checkoutInvoice.checkout_landing_subtotal_cents != null && checkoutInvoice.checkout_landing_subtotal_cents > 0)
    ? checkoutInvoice.checkout_landing_subtotal_cents
    : totalLandingChargesFromList > 0
      ? totalLandingChargesFromList
      : 0

  const flightChargeCents = checkoutInvoice.checkout_calculated_amount_cents != null
    ? checkoutInvoice.checkout_calculated_amount_cents
    : landingSubtotalCents > 0
      ? Math.max(0, checkoutInvoice.subtotal_cents - landingSubtotalCents)
      : checkoutInvoice.subtotal_cents

  const rawHours =
    checkoutInvoice.checkout_duration_hours ??
    checkoutInvoice.vdo_reading ??
    checkoutInvoice.vdo_hours_flown ??
    (checkoutInvoice.vdo_start_reading != null && checkoutInvoice.vdo_end_reading != null
      ? Number((checkoutInvoice.vdo_end_reading - checkoutInvoice.vdo_start_reading).toFixed(1))
      : null)

  const vdoHours = rawHours != null
    ? Number(rawHours)
    : (rateCents > 0 && flightChargeCents > 0
        ? Number((flightChargeCents / rateCents).toFixed(1))
        : null)

  const effectiveLandingCents = landingSubtotalCents > 0
    ? landingSubtotalCents
    : Math.max(0, checkoutInvoice.subtotal_cents - flightChargeCents)

  const totalLandingCount = landingChargesList.reduce((sum, charge) => sum + charge.landingCount, 0)
  const sameLandingUnitRate =
    landingChargesList.length > 0 &&
    landingChargesList.every((charge) => charge.unitAmountCents === landingChargesList[0].unitAmountCents)

  const landingAirportSummary = landingChargesList
    .map((charge) => {
      const label = charge.airportLabel || ''
      const withoutIcao = charge.icaoCode && label.startsWith(`${charge.icaoCode} · `)
        ? label.slice(charge.icaoCode.length + 3)
        : label
      return withoutIcao || charge.icaoCode || 'Airport'
    })
    .join(' + ')

  const landingCalcSummary = landingChargesList.length > 0
    ? (sameLandingUnitRate
        ? `$${money(landingChargesList[0].unitAmountCents)} × ${totalLandingCount}`
        : landingChargesList
            .map((charge) => `$${money(charge.unitAmountCents)} × ${charge.landingCount}`)
            .join(' + '))
    : (effectiveLandingCents > 0 ? `$${money(effectiveLandingCents)}` : null)

  // ── awaiting_manual_payment_confirmation ───────────────────────────────────
  if (displayState === 'awaiting_manual_payment_confirmation') {
    return (
      <div id="payment" className="scroll-mt-28 bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-4 sm:p-6">
        <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
          <span className="material-symbols-outlined text-[#1a4fd6] text-lg sm:text-xl">account_balance</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#1a4fd6]">Awaiting Payment Confirmation</h3>
        </div>
        <p className="text-xs sm:text-sm text-[#4b6390] leading-relaxed mb-4">
          Your bank transfer details have been submitted. An admin will verify the payment before your checkout result is finalised.
        </p>
        <div className="flex items-center gap-2 p-3 bg-[#f0f6ff] rounded-lg border border-[#152d5a]/10 text-xs sm:text-sm text-[#152d5a]">
          <span className="material-symbols-outlined text-[#1a4fd6] text-[18px] shrink-0">pending_actions</span>
          <span>Awaiting admin review — no further action needed</span>
        </div>
        <p className="text-[11px] text-[#4b6390] mt-3 leading-relaxed">
          Invoice reference: <span className="font-mono text-[#152d5a] font-semibold break-all">{checkoutInvoice.invoice_number}</span>
        </p>
      </div>
    )
  }

  // ── paid ───────────────────────────────────────────────────────────────────
  if (displayState === 'paid') {
    return (
      <div id="payment" className="scroll-mt-28 bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-4 sm:p-6">
        <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
          <span className="material-symbols-outlined text-emerald-500 text-lg sm:text-xl">check_circle</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-600">Payment Confirmed</h3>
        </div>
        <p className="text-xs sm:text-sm text-[#4b6390] leading-relaxed">
          Your checkout payment has been confirmed. Your pilot status has been updated accordingly.
        </p>
      </div>
    )
  }

  // ── waived ─────────────────────────────────────────────────────────────────
  if (displayState === 'waived') {
    return (
      <div id="payment" className="scroll-mt-28 bg-green-500/10 border border-green-500/20 rounded-[1.25rem] p-4 sm:p-6">
        <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
          <span className="material-symbols-outlined text-green-400 text-lg sm:text-xl">verified</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-green-400">Payment Waived</h3>
        </div>
        <p className="text-xs sm:text-sm text-oz-muted leading-relaxed">
          The checkout payment for this booking has been waived by the operations team.
        </p>
      </div>
    )
  }

  // ── awaiting_payment ───────────────────────────────────────────────────────
  const handleBankTransferSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setUploading(true)
    
    try {
      const formData = new FormData(e.currentTarget)
      await submitBankTransferProof(checkoutInvoice.id, bookingId, checkoutInvoice.invoice_number, formData)
    } catch (err: any) {
      setError(err.message || "Failed to submit bank transfer proof")
      setUploading(false)
    }
  }

  return (
    <div id="payment" className="scroll-mt-28 bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-4 sm:p-6">
      <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
        <span className="material-symbols-outlined text-[#1a4fd6] text-lg sm:text-xl">payments</span>
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#1a4fd6]">Payment Required</h3>
      </div>
      <p className="text-xs sm:text-sm text-[#4b6390] leading-relaxed mb-4">
        Your checkout flight has been completed and approved. The invoice below is calculated from aircraft hire time and applicable landing charges. Please complete payment to finalise your clearance.
      </p>

      {/* Invoice details with explicit calculative breakdown */}
      <div className="mb-5 rounded-xl border border-[#152d5a]/10 bg-[#f0f6ff] p-3.5 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="material-symbols-outlined text-[18px] text-[#1a4fd6] shrink-0">receipt_long</span>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#1a4fd6] truncate">Invoice details</p>
          </div>
          <p className="font-mono text-[11px] font-semibold text-[#4b6390] shrink-0">{checkoutInvoice.invoice_number}</p>
        </div>

        <div className="space-y-3 text-xs sm:text-sm">
          {/* Flight charge (VDO) calculation */}
          {flightChargeCents != null && (
            <div className="flex items-start justify-between gap-3 text-[#152d5a]">
              <div className="min-w-0 flex-1">
                <p className="font-medium">Aircraft hire (VDO)</p>
                {vdoHours != null && (
                  <p className="mt-0.5 text-[11px] sm:text-[12px] tabular-nums text-[#4b6390]">
                    ${ratePerHour} × {Number(vdoHours).toFixed(1)} hrs = ${money(flightChargeCents)}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-medium tabular-nums">${money(flightChargeCents)}</p>
              </div>
            </div>
          )}

          {/* Landing fees calculation */}
          {effectiveLandingCents > 0 && (
            <div className="border-t border-[#152d5a]/10 pt-2.5">
              <div className="flex items-start justify-between gap-3 text-[#152d5a]">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Landing fees</p>
                  {landingAirportSummary ? (
                    <p className="mt-0.5 text-[11px] sm:text-[12px] leading-relaxed text-[#4b6390] break-words">
                      {landingAirportSummary}
                    </p>
                  ) : null}
                  {landingCalcSummary ? (
                    <p className="mt-0.5 text-[11px] sm:text-[12px] tabular-nums text-[#4b6390]">
                      {landingCalcSummary} = ${money(effectiveLandingCents)}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-medium tabular-nums">${money(effectiveLandingCents)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Total sum calculation: flight + landing */}
          <div className="flex items-start justify-between gap-3 border-t border-[#152d5a]/10 pt-2.5 font-semibold text-[#152d5a]">
            <div className="min-w-0 flex-1">
              <p>Flight total</p>
              {flightChargeCents != null && effectiveLandingCents > 0 && (
                <p className="mt-0.5 text-[11px] sm:text-[12px] font-medium tabular-nums text-[#4b6390]">
                  ${money(flightChargeCents)} + ${money(effectiveLandingCents)} = ${subtotal}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular-nums">${subtotal}</p>
            </div>
          </div>

          {/* Advance Credit Applied if any */}
          {checkoutInvoice.advance_applied_cents > 0 && (
            <div className="flex justify-between gap-3 text-emerald-600 font-medium">
              <span>Account Credit Applied</span>
              <span className="tabular-nums">-${advanceApplied}</span>
            </div>
          )}

          {/* Amount Due */}
          <div className="flex justify-between gap-3 border-t border-[#152d5a]/10 pt-2.5 font-bold text-[#1a4fd6]">
            <span>Amount due</span>
            <span className="tabular-nums">${baseAmount}</span>
          </div>
        </div>
      </div>

      {bankTransferSubmission?.status === "rejected" && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs sm:text-sm text-red-600">
          <div className="flex gap-2 items-start">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            <p>Your previous bank transfer proof was rejected. Please upload a valid receipt.</p>
          </div>
        </div>
      )}

      {/* Payment Method Selector */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 mb-5">
        <button
          type="button"
          onClick={() => setMethod("stripe")}
          className={`p-2.5 sm:p-3 rounded-xl border flex flex-col items-center gap-1.5 sm:gap-2 transition-colors ${
            method === "stripe" 
              ? "bg-[#1a4fd6] border-[#1a4fd6] text-white" 
              : "bg-[#f0f6ff] border-[#152d5a]/10 hover:bg-[#e8f0fe] text-[#152d5a]"
          }`}
        >
          <span className="material-symbols-outlined text-[20px] sm:text-[24px]">credit_card</span>
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest">Pay Online</span>
        </button>
        <button
          type="button"
          onClick={() => setMethod("bank_transfer")}
          className={`p-2.5 sm:p-3 rounded-xl border flex flex-col items-center gap-1.5 sm:gap-2 transition-colors ${
            method === "bank_transfer" 
              ? "bg-[#1a4fd6] border-[#1a4fd6] text-white" 
              : "bg-[#f0f6ff] border-[#152d5a]/10 hover:bg-[#e8f0fe] text-[#152d5a]"
          }`}
        >
          <span className="material-symbols-outlined text-[20px] sm:text-[24px]">account_balance</span>
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest">Bank Transfer</span>
        </button>
      </div>

      {method === "stripe" ? (
        <>
          <div className="mb-5 space-y-2 p-3.5 sm:p-4 rounded-xl bg-white border border-[#152d5a]/10 text-xs sm:text-sm">
            <div className="flex justify-between gap-3 text-[#152d5a]">
              <span>Base Amount Due</span>
              <span className="font-medium tabular-nums">${baseAmount}</span>
            </div>
            {surchargeCents > 0 && (
              <div className="flex justify-between gap-3 text-[#4b6390] text-[11px] sm:text-xs">
                <span>Card surcharge (1.7% + 30¢)</span>
                <span className="tabular-nums">${surchargeAmount}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 font-bold text-[#1a4fd6] pt-2 border-t border-[#152d5a]/10">
              <span>Total Card Payment</span>
              <span className="tabular-nums">${grossAmount}</span>
            </div>
          </div>

          <form action={createCheckoutPaymentSession.bind(null, bookingId)}>
            <button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-400 text-white rounded-lg px-4 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">credit_card</span>
              Pay ${grossAmount}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="mb-4 sm:mb-5 rounded-xl border border-[#152d5a]/10 bg-[#f0f6ff] p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
              <span className="material-symbols-outlined text-[#1a4fd6] text-[18px] shrink-0">info</span>
              <p className="text-xs font-bold uppercase tracking-widest text-[#1a4fd6]">Manual bank transfer</p>
            </div>
            <p className="text-xs sm:text-sm text-[#4b6390] leading-relaxed mb-2">
              Transfer the exact amount below to our bank account using the payment reference, then upload your transfer receipt.
            </p>
            <p className="text-[11px] sm:text-xs text-[#4b6390] leading-relaxed">
              Admin verification typically takes <span className="text-amber-600 font-semibold">2 to 24 hours</span>. Your pilot clearance is activated once verified.
            </p>
          </div>

          <div className="mb-5 p-3.5 sm:p-4 rounded-xl bg-white border border-[#152d5a]/10 text-xs sm:text-sm space-y-3 sm:space-y-4">
            <div>
              <p className="text-[11px] sm:text-xs text-[#4b6390] mb-0.5 sm:mb-1">Transfer Amount (No Surcharge)</p>
              <p className="text-xl sm:text-2xl font-bold text-[#152d5a] tabular-nums">${baseAmount}</p>
            </div>

            <div className="pt-3 border-t border-[#152d5a]/10 space-y-2 sm:space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <span className="text-[#4b6390] shrink-0">Bank</span>
                <span className="font-medium text-[#152d5a] text-right break-words min-w-0">{bankDetails?.bankName || 'National Australia Bank (NAB)'}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-[#4b6390] shrink-0">Account Name</span>
                <span className="font-medium text-[#152d5a] text-right break-words min-w-0">{bankDetails?.accountName || 'JAM Aviation PTY LTD'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#4b6390] shrink-0">BSB</span>
                <span className="font-mono font-medium text-[#152d5a] text-right">{bankDetails?.bsb || '085-005'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#4b6390] shrink-0">Account Number</span>
                <span className="font-mono font-medium text-[#152d5a] text-right">{bankDetails?.accountNumber || '388004197'}</span>
              </div>
              <div className="flex items-start justify-between gap-3 pt-1 border-t border-[#152d5a]/5">
                <span className="text-[#4b6390] shrink-0">Payment Reference</span>
                <span className="font-mono text-[#1a4fd6] font-bold text-right break-all min-w-0">{checkoutInvoice.invoice_number}</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleBankTransferSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-widest text-[#4b6390] mb-1.5 sm:mb-2">
                Upload Transfer Receipt
              </label>
              <input
                type="file"
                name="receipt"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                required
                className="w-full text-xs sm:text-sm text-[#4b6390] file:mr-2 sm:file:mr-4 file:py-1.5 sm:file:py-2 file:px-3 sm:file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#f0f6ff] file:text-[#1a4fd6] hover:file:bg-[#e8f0fe] cursor-pointer max-w-full truncate"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">{error}</p>
            )}

            <button 
              type="submit" 
              disabled={uploading}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-sm"
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
