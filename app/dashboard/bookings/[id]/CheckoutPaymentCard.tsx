"use client"

import { useState } from "react"
import { createCheckoutPaymentSession, submitBankTransferProof } from "@/app/actions/payment"
import { getCheckoutPaymentDisplayState } from "@/lib/checkout-payment-state"

const STRIPE_DOMESTIC_FEE_BPS = 170
const STRIPE_FIXED_FEE_CENTS = 30
const ENABLE_SURCHARGE = true

type Props = {
  bookingId: string
  checkoutInvoice?: {
    id: string
    invoice_number: string
    subtotal_cents: number
    advance_applied_cents: number
    stripe_amount_due_cents: number
    status?: string
  } | null
  bankTransferSubmission?: {
    id: string
    status: string
  } | null
  bankDetails?: {
    accountName: string
    bsb: string
    accountNumber: string
  }
}

export default function CheckoutPaymentCard({ bookingId, checkoutInvoice, bankTransferSubmission, bankDetails }: Props) {
  const [method, setMethod] = useState<"stripe" | "bank_transfer">("stripe")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!checkoutInvoice) return null

  // Derive the display state — this is the single source of truth for what to show
  const displayState = getCheckoutPaymentDisplayState(
    { status: checkoutInvoice.status ?? 'payment_required' },
    bankTransferSubmission ?? null,
  )

  const baseAmountCents = checkoutInvoice.stripe_amount_due_cents
  const baseAmount = (baseAmountCents / 100).toFixed(2)
  const subtotal = (checkoutInvoice.subtotal_cents / 100).toFixed(2)
  const advanceApplied = (checkoutInvoice.advance_applied_cents / 100).toFixed(2)

  // Calculate Surcharge
  let surchargeCents = 0
  let grossAmountCents = baseAmountCents
  if (baseAmountCents > 0 && ENABLE_SURCHARGE) {
    grossAmountCents = Math.ceil((baseAmountCents + STRIPE_FIXED_FEE_CENTS) / (1 - (STRIPE_DOMESTIC_FEE_BPS / 10000)))
    surchargeCents = grossAmountCents - baseAmountCents
  }
  const surchargeAmount = (surchargeCents / 100).toFixed(2)
  const grossAmount = (grossAmountCents / 100).toFixed(2)

  // ── awaiting_manual_payment_confirmation ───────────────────────────────────
  // Bank transfer details have been submitted. Customer is now waiting for admin
  // to review and confirm — do NOT show "Pay invoice" or "Payment Required".
  if (displayState === 'awaiting_manual_payment_confirmation') {
    return (
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-blue-400 text-lg">account_balance</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400">Awaiting Payment Confirmation</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed mb-4">
          Your bank transfer details have been submitted. An admin will verify the payment before your checkout result is finalised.
        </p>
        <div className="flex items-center gap-2 p-3 bg-white/5 rounded-lg border border-white/10 text-sm text-slate-300">
          <span className="material-symbols-outlined text-blue-400 text-[18px]">pending_actions</span>
          Awaiting admin review — no further action needed
        </div>
        <p className="text-[10px] text-slate-600 mt-3 leading-relaxed">
          Invoice reference: <span className="font-mono text-slate-500">{checkoutInvoice.invoice_number}</span>
        </p>
      </div>
    )
  }

  // ── paid ───────────────────────────────────────────────────────────────────
  if (displayState === 'paid') {
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-green-400 text-lg">check_circle</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-green-400">Payment Confirmed</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          Your checkout payment has been confirmed. Your pilot status has been updated accordingly.
        </p>
      </div>
    )
  }

  // ── waived ─────────────────────────────────────────────────────────────────
  if (displayState === 'waived') {
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-green-400 text-lg">verified</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-green-400">Payment Waived</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          The checkout payment for this booking has been waived by the operations team.
        </p>
      </div>
    )
  }

  // ── awaiting_payment ───────────────────────────────────────────────────────
  // Standard payment flow: show Stripe / bank transfer options.

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
    <div className="bg-orange-500/10 border border-orange-500/20 rounded-[1.25rem] p-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="material-symbols-outlined text-orange-400 text-lg">payments</span>
        <h3 className="text-xs font-bold uppercase tracking-widest text-orange-400">Payment Required</h3>
      </div>
      <p className="text-sm text-oz-muted leading-relaxed mb-2">
        Your checkout flight has been completed and approved. The amount below is calculated from the aircraft VDO meter reading plus applicable landing fees. Please complete payment to finalise your clearance and unlock aircraft bookings.
      </p>

      {bankTransferSubmission?.status === "rejected" && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          <div className="flex gap-2 items-start">
            <span className="material-symbols-outlined text-[18px] flex-shrink-0">error</span>
            <p>Your previous bank transfer proof was rejected. Please upload a valid receipt.</p>
          </div>
        </div>
      )}

      {/* Payment Method Selector */}
      <div className="grid grid-cols-2 gap-3 mb-6 mt-4">
        <button
          onClick={() => setMethod("stripe")}
          className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-colors ${
            method === "stripe" 
              ? "bg-orange-500/20 border-orange-500/40" 
              : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-400"
          }`}
        >
          <span className="material-symbols-outlined">credit_card</span>
          <span className="text-xs font-bold uppercase tracking-widest">Pay Online</span>
        </button>
        <button
          onClick={() => setMethod("bank_transfer")}
          className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-colors ${
            method === "bank_transfer" 
              ? "bg-orange-500/20 border-orange-500/40" 
              : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-400"
          }`}
        >
          <span className="material-symbols-outlined">account_balance</span>
          <span className="text-xs font-bold uppercase tracking-widest">Bank Transfer</span>
        </button>
      </div>

      {method === "stripe" ? (
        <>
          <div className="mb-6 space-y-2 p-4 rounded-xl bg-orange-500/[0.05] border border-orange-500/15 text-sm">
            <div className="flex justify-between text-slate-300">
              <span>Checkout Fee (VDO meter + landings)</span>
              <span>${subtotal}</span>
            </div>
            {checkoutInvoice.advance_applied_cents > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Advance Credit Applied</span>
                <span>-${advanceApplied}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-300">
              <span>Base Amount Due</span>
              <span>${baseAmount}</span>
            </div>
            {surchargeCents > 0 && (
              <div className="flex justify-between text-slate-400 text-xs">
                <span>Online payment surcharge (1.7% + 30c)</span>
                <span>${surchargeAmount}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-orange-400 pt-2 border-t border-orange-500/20">
              <span>Total Card Payment</span>
              <span>${grossAmount}</span>
            </div>
          </div>

          <form action={createCheckoutPaymentSession.bind(null, bookingId)}>
            <button type="submit" className="w-full bg-orange-500 hover:bg-orange-400 text-white rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">credit_card</span>
              Pay ${grossAmount}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10 text-sm space-y-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">Transfer Amount (No Surcharge)</p>
              <p className="text-xl font-bold text-white">${baseAmount}</p>
            </div>
            
            <div className="pt-3 border-t border-white/10 space-y-2 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Account Name</span>
                <span className="font-medium text-white">{bankDetails?.accountName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">BSB</span>
                <span className="font-mono text-white">{bankDetails?.bsb}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account Number</span>
                <span className="font-mono text-white">{bankDetails?.accountNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Reference</span>
                <span className="font-mono text-orange-400 font-bold">{checkoutInvoice.invoice_number}</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleBankTransferSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                Upload Transfer Receipt
              </label>
              <input
                type="file"
                name="receipt"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                required
                className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-orange-500/10 file:text-orange-400 hover:file:bg-orange-500/20"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

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
